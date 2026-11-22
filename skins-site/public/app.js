// Skin picker: one page, no framework. Talks to the site's /api.

const T = 2;
const CT = 3;
const SIDE_NAME = { [T]: 'T', [CT]: 'CT' };

const CATEGORIES = [
  { id: 'knives', name: 'Ножи' },
  { id: 'gloves', name: 'Перчатки' },
  { id: 'pistols', name: 'Пистолеты' },
  { id: 'smg', name: 'Пистолеты-пулемёты' },
  { id: 'rifles', name: 'Винтовки' },
  { id: 'heavy', name: 'Тяжёлое' },
  { id: 'music', name: 'Музыка' },
  { id: 'pins', name: 'Значки' },
  { id: 'agents', name: 'Агенты' },
];

const WEAR = [
  [0.07, 'Прямо с завода'],
  [0.15, 'Немного поношенное'],
  [0.38, 'После полевых испытаний'],
  [0.45, 'Поношенное'],
  [1.01, 'Закалённое в боях'],
];
const wearName = (w) => WEAR.find(([max]) => w < max)[1];
const DEFAULT_KNIFE_IMAGE = '/img/weapon_knife.png';

const state = {
  me: null,
  catalog: null,
  loadout: null,
  side: readSide(),
};

// ---- small helpers -------------------------------------------------------

function readSide() {
  try {
    return Number(localStorage.getItem('side')) === T ? T : CT;
  } catch {
    return CT;
  }
}

function saveSide(side) {
  state.side = side;
  try { localStorage.setItem('side', String(side)); } catch { /* private mode */ }
}

// h('div.card', { onclick }, child, ...) -> element; text children become text nodes (no HTML injection)
function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className += ` ${value}`;
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function img(src, alt = '') {
  if (!src) return h('div.noimg', {}, '-');
  return h('img', { src, alt, loading: 'lazy', decoding: 'async', draggable: false, onerror: (e) => e.target.classList.add('broken') });
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `Ошибка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(text, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

// ---- what the player has -----------------------------------------------

const weaponBy = (defindex) => state.catalog.weapons.find((w) => w.defindex === defindex);
const weaponByClass = (cls) => state.catalog.weapons.find((w) => w.class === cls);
const skinOf = (defindex, team) => state.loadout.skins.find((s) => s.defindex === defindex && s.team === team) ?? null;
const paintInfo = (defindex, paint) => state.catalog.skins[defindex]?.find((s) => s.paint === paint) ?? null;

function knifeOf(team) {
  const cls = state.loadout.knife[team];
  return cls ? weaponByClass(cls) ?? null : null;
}

function gloveOf(team) {
  const defindex = Number(state.loadout.gloves[team] ?? 0);
  if (!defindex) return null;
  const paint = skinOf(defindex, team)?.paint;
  return state.catalog.gloves.find((g) => g.defindex === defindex && g.paint === paint) ?? null;
}

// Sides (T/CT) that have this exact item on
function sidesWith(test) {
  return [T, CT].filter(test);
}

// ---- layout ----------------------------------------------------------------

const app = document.getElementById('app');

// No session: find the player who plays from this computer; keep trying until he joins the server
let loginTimer;
function renderLogin() {
  state.me = null;
  closeModal();
  clearTimeout(loginTimer);
  const status = h('p.muted', {}, 'Ищем вас на сервере…');
  const spinner = h('div.spinner');
  app.replaceChildren(h('main.login', {},
    h('div.login-card', {},
      h('div.brand.big', {}, h('span.brand-mark', {}), 'Скины CS2'),
      spinner,
      status,
      h('p.muted.small', {}, 'Вход сам по себе: сайт видит, кто играет с этого компьютера. Ушли с сервера - вход сбросится.'),
    ),
  ));
  const attempt = async () => {
    try {
      await api('/auth/auto', {});
      start();
    } catch (e) {
      status.textContent = e.message;
      status.className = e.status === 404 ? 'muted' : 'error';
      loginTimer = setTimeout(attempt, 4000);
    }
  };
  attempt();
}

function sideSwitch() {
  return h('div.side-switch', { role: 'group', 'aria-label': 'Сторона' },
    [T, CT].map((side) => h(`button.side-${SIDE_NAME[side].toLowerCase()}`, {
      type: 'button',
      class: state.side === side ? 'active' : '',
      'aria-pressed': String(state.side === side),
      onclick: () => { saveSide(side); render(); },
    }, side === T ? 'Террористы' : 'Спецназ')));
}

function header() {
  const me = state.me;
  return h('header.top', {},
    h('a.brand', { href: '#/' }, h('span.brand-mark', {}), 'Скины CS2'),
    sideSwitch(),
    h('div.user', {},
      me.avatar ? h('img.avatar', { src: me.avatar, alt: '' }) : null,
      h('span.user-name', {}, me.name ?? me.steamId),
      h('form', { method: 'post', action: '/auth/logout' }, h('button.link', { type: 'submit' }, 'Выйти')),
    ),
  );
}

function nav(current) {
  const hasAgents = state.catalog.agents.length > 0;
  return h('nav.side', {},
    h('a', { href: '#/', class: current === '' ? 'active' : '' }, 'Моё снаряжение'),
    CATEGORIES.filter((c) => c.id !== 'agents' || hasAgents).map((c) =>
      h('a', { href: `#/c/${c.id}`, class: current === c.id ? 'active' : '' }, c.name)),
  );
}

function sideBadges(sides) {
  if (!sides.length) return null;
  return h('div.badges', {}, sides.map((s) => h(`span.badge.badge-${SIDE_NAME[s].toLowerCase()}`, {}, SIDE_NAME[s])));
}

// A tile: picture, title, subtitle; equipped sides as badges
function tile({ image, title, subtitle, sides = [], onclick, href, wide = false }) {
  const tag = href ? 'a' : 'button';
  return h(`${tag}.tile`, { href, type: href ? null : 'button', onclick, class: [sides.length ? 'equipped' : '', wide ? 'wide' : ''].join(' ') },
    h('div.tile-img', {}, img(image, title)),
    h('div.tile-text', {}, h('div.tile-title', {}, title), subtitle ? h('div.tile-sub', {}, subtitle) : null),
    sideBadges(sides),
  );
}

// ---- pages ---------------------------------------------------------------

function weaponTile(w) {
  const skin = skinOf(w.defindex, state.side);
  const info = skin ? paintInfo(w.defindex, skin.paint) : null;
  return tile({
    image: info?.image || w.image,
    title: w.name,
    subtitle: info?.name ?? 'Без скина',
    href: `#/w/${w.defindex}`,
    sides: info ? [state.side] : [],
  });
}

function overviewPage() {
  const side = state.side;
  const knife = knifeOf(side);
  const knifeSkin = knife ? paintInfo(knife.defindex, skinOf(knife.defindex, side)?.paint) : null;
  const glove = gloveOf(side);
  const music = state.catalog.music.find((m) => m.id === Number(state.loadout.music[side]));
  const pin = state.catalog.pins.find((p) => p.id === Number(state.loadout.pins[side]));

  const blocks = [
    h('section', {},
      h('h2', {}, 'Нож и перчатки'),
      h('div.grid', {},
        tile({ image: knifeSkin?.image || knife?.image || DEFAULT_KNIFE_IMAGE, title: knife?.name ?? 'Стандартный нож', subtitle: knifeSkin?.name ?? (knife ? 'Без скина' : 'Нож не выбран'), href: knife ? `#/w/${knife.defindex}` : '#/c/knives', sides: knife ? [side] : [] }),
        tile({ image: glove?.image, title: glove?.type ?? 'Стандартные перчатки', subtitle: glove?.name ?? 'Перчатки не выбраны', href: '#/c/gloves', sides: glove ? [side] : [] }),
      ),
    ),
  ];
  for (const cat of CATEGORIES.filter((c) => ['pistols', 'smg', 'rifles', 'heavy'].includes(c.id))) {
    blocks.push(h('section', {},
      h('h2', {}, cat.name),
      h('div.grid', {}, state.catalog.weapons.filter((w) => w.category === cat.id).map(weaponTile)),
    ));
  }
  blocks.push(h('section', {},
    h('h2', {}, 'Остальное'),
    h('div.grid', {},
      tile({ image: music?.image, title: 'Музыка MVP', subtitle: music?.name ?? 'Не выбрана', href: '#/c/music', sides: music ? [side] : [] }),
      tile({ image: pin?.image, title: 'Значок', subtitle: pin?.name ?? 'Не выбран', href: '#/c/pins', sides: pin ? [side] : [] }),
    ),
  ));
  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, 'Моё снаряжение'), h('p.muted', {}, `Сторона: ${side === T ? 'террористы' : 'спецназ'}. Нажмите на предмет, чтобы сменить скин.`)),
    blocks,
  );
}

// A page with a search box and a grid that re-renders without losing focus
function searchPage({ title, back, subtitle, items, toTile, placeholder = 'Поиск', extra = null }) {
  const grid = h('div.grid');
  const empty = h('p.muted.empty', { hidden: true }, 'Ничего не найдено');
  const fill = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = items.filter((it) => words.every((w) => it.search.includes(w)));
    grid.replaceChildren(...shown.map(toTile));
    empty.hidden = shown.length > 0;
  };
  const input = h('input.search', { type: 'search', placeholder, oninput: (e) => fill(e.target.value), 'aria-label': placeholder });
  fill('');
  return h('div.page', {},
    h('div.page-head', {},
      back ? h('a.back', { href: back }, '← Назад') : null,
      h('h1', {}, title),
      subtitle ? h('p.muted', {}, subtitle) : null,
    ),
    h('div.toolbar', {}, input),
    extra,
    grid,
    empty,
  );
}

function categoryPage(id) {
  const side = state.side;
  if (id === 'gloves') return glovesPage();
  if (id === 'music') return simplePage('music', 'Музыка MVP', state.catalog.music, '/api/music');
  if (id === 'pins') return simplePage('pins', 'Значки', state.catalog.pins, '/api/pin');
  if (id === 'agents') return agentsPage();

  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return notFound();
  const weapons = state.catalog.weapons.filter((w) => w.category === id);

  if (id === 'knives') {
    const current = knifeOf(side);
    const items = weapons.map((w) => ({ w, search: w.name.toLowerCase() }));
    const defaultTile = tile({
      image: DEFAULT_KNIFE_IMAGE,
      title: 'Стандартный нож',
      subtitle: 'Обычный нож стороны',
      sides: sidesWith((s) => !knifeOf(s)),
      onclick: () => openEditor({ kind: 'knife-default' }),
    });
    return searchPage({
      title: 'Ножи',
      subtitle: current ? `Сейчас: ${current.name}` : 'Сейчас стандартный нож',
      items,
      extra: h('div.grid.grid-top', {}, defaultTile),
      toTile: ({ w }) => {
        const skin = skinOf(w.defindex, side);
        const info = skin ? paintInfo(w.defindex, skin.paint) : null;
        return tile({
          image: (current?.defindex === w.defindex && info?.image) || w.image,
          title: w.name,
          subtitle: current?.defindex === w.defindex ? (info?.name ?? 'Без скина') : null,
          href: `#/w/${w.defindex}`,
          sides: sidesWith((s) => knifeOf(s)?.defindex === w.defindex),
        });
      },
    });
  }

  return h('div.page', {},
    h('div.page-head', {}, h('h1', {}, cat.name)),
    h('div.grid', {}, weapons.map(weaponTile)),
  );
}

function weaponPage(defindex) {
  const w = weaponBy(defindex);
  if (!w) return notFound();
  const isKnife = w.category === 'knives';
  const skins = state.catalog.skins[defindex] ?? [];
  const equippedSides = (paint) => sidesWith((s) => {
    if (isKnife && knifeOf(s)?.defindex !== defindex) return false;
    const skin = skinOf(defindex, s);
    return paint === 0 ? !skin : skin?.paint === paint;
  });
  const items = [
    { paint: 0, name: isKnife ? 'Без скина' : 'Без скина', image: w.image, search: 'без скина ванильный vanilla' },
    ...skins.map((s) => ({ ...s, search: s.name.toLowerCase() })),
  ];
  return searchPage({
    title: w.name,
    back: `#/c/${w.category}`,
    subtitle: `${skins.length} скинов`,
    items,
    placeholder: 'Поиск скина',
    toTile: (s) => tile({
      image: s.image,
      title: s.name,
      sides: equippedSides(s.paint),
      onclick: () => openEditor({ kind: 'skin', weapon: w, skin: s }),
    }),
  });
}

function glovesPage() {
  const side = state.side;
  const current = gloveOf(side);
  const items = state.catalog.gloves.map((g) => ({ ...g, search: `${g.type} ${g.name}`.toLowerCase() }));
  return searchPage({
    title: 'Перчатки',
    back: '#/',
    subtitle: current ? `Сейчас: ${current.type} | ${current.name}` : 'Сейчас стандартные перчатки',
    items,
    placeholder: 'Поиск перчаток',
    extra: h('div.grid.grid-top', {}, tile({
      image: null, title: 'Стандартные перчатки', subtitle: 'Перчатки агента',
      sides: sidesWith((s) => !gloveOf(s)),
      onclick: () => openEditor({ kind: 'gloves', glove: null }),
    })),
    toTile: (g) => tile({
      image: g.image, title: g.name, subtitle: g.type,
      sides: sidesWith((s) => { const c = gloveOf(s); return c?.defindex === g.defindex && c?.paint === g.paint; }),
      onclick: () => openEditor({ kind: 'gloves', glove: g }),
    }),
  });
}

function simplePage(kind, title, list, endpoint) {
  const key = kind === 'music' ? 'music' : 'pins';
  const items = list.map((x) => ({ ...x, search: x.name.toLowerCase() }));
  const none = tile({
    image: null, title: kind === 'music' ? 'Без музыки' : 'Без значка', subtitle: 'Стандартно',
    sides: sidesWith((s) => !Number(state.loadout[key][s])),
    onclick: () => openEditor({ kind: 'simple', endpoint, item: null, title: kind === 'music' ? 'Без музыки' : 'Без значка', key }),
  });
  return searchPage({
    title, back: '#/', items,
    extra: h('div.grid.grid-top', {}, none),
    toTile: (x) => tile({
      image: x.image, title: x.name,
      sides: sidesWith((s) => Number(state.loadout[key][s]) === x.id),
      onclick: () => openEditor({ kind: 'simple', endpoint, item: x, title: x.name, key }),
    }),
  });
}

function agentsPage() {
  const items = state.catalog.agents.filter((a) => a.team === state.side).map((a) => ({ ...a, search: a.name.toLowerCase() }));
  return searchPage({
    title: 'Агенты', back: '#/', items,
    subtitle: `Агенты стороны ${SIDE_NAME[state.side]}. Другая сторона переключается вверху.`,
    toTile: (a) => tile({
      image: a.image, title: a.name,
      sides: state.loadout.agents[a.team] === a.model ? [a.team] : [],
      onclick: () => openEditor({ kind: 'agent', agent: a }),
    }),
  });
}

function notFound() {
  return h('div.page', {}, h('h1', {}, 'Нет такой страницы'), h('a', { href: '#/' }, 'К снаряжению'));
}

// ---- editor (modal) ------------------------------------------------------

const modalRoot = document.getElementById('modal-root');

function closeModal() {
  modalRoot.replaceChildren();
  document.body.classList.remove('modal-open');
}

function modal(content, { onclose } = {}) {
  const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true' }, content);
  const overlay = h('div.overlay', {
    onclick: (e) => { if (e.target === overlay) { closeModal(); onclose?.(); } },
  }, box);
  modalRoot.replaceChildren(overlay);
  document.body.classList.add('modal-open');
  box.querySelector('input, button')?.focus({ preventScroll: true });
  return box;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalRoot.firstChild) {
    // The sticker picker sits on top of the editor: close only it
    const pickers = modalRoot.querySelectorAll('.picker-layer');
    if (pickers.length) pickers[pickers.length - 1].remove();
    else closeModal();
  }
});

function sidesControl(initial) {
  const chosen = new Set(initial.length ? initial : [T, CT]);
  const wrap = h('div.sides-pick', {},
    [T, CT].map((side) => {
      const btn = h(`button.chip.chip-${SIDE_NAME[side].toLowerCase()}`, {
        type: 'button',
        class: chosen.has(side) ? 'on' : '',
        onclick: () => {
          if (chosen.has(side) && chosen.size === 1) return;
          chosen.has(side) ? chosen.delete(side) : chosen.add(side);
          btn.classList.toggle('on', chosen.has(side));
        },
      }, side === T ? 'Террористы' : 'Спецназ');
      return btn;
    }),
  );
  return { el: h('div.field', {}, h('label', {}, 'Для стороны'), wrap), get: () => [...chosen] };
}

function wearControl(initial) {
  let value = initial;
  const label = h('span.wear-name');
  const num = h('input.wear-num', { type: 'number', min: 0, max: 1, step: 0.0001, 'aria-label': 'Износ' });
  const range = h('input.wear-range', { type: 'range', min: 0, max: 1, step: 0.0001, 'aria-label': 'Износ' });
  const set = (v, from) => {
    value = Math.min(1, Math.max(0, Number(v) || 0));
    if (from !== num) num.value = value.toFixed(4);
    if (from !== range) range.value = String(value);
    label.textContent = wearName(value);
  };
  range.addEventListener('input', () => set(range.value, range));
  num.addEventListener('input', () => set(num.value, num));
  num.addEventListener('change', () => set(num.value));
  const presets = h('div.wear-presets', {}, [[0.0001, 'FN'], [0.1, 'MW'], [0.25, 'FT'], [0.4, 'WW'], [0.6, 'BS']].map(([v, n]) =>
    h('button.chip.small', { type: 'button', title: wearName(v), onclick: () => set(v) }, n)));
  set(initial);
  return {
    el: h('div.field', {}, h('label', {}, 'Износ ', label), h('div.wear-row', {}, range, num), presets),
    get: () => value,
  };
}

function seedControl(initial) {
  const input = h('input', { type: 'number', min: 0, max: 1000, step: 1, value: initial, 'aria-label': 'Паттерн' });
  return {
    el: h('div.field', {}, h('label', {}, 'Паттерн (0-1000)'),
      h('div.row', {}, input, h('button.chip', { type: 'button', title: 'Случайный', onclick: () => { input.value = String(Math.floor(Math.random() * 1001)); } }, 'Случайный'))),
    get: () => Math.min(1000, Math.max(0, Math.round(Number(input.value) || 0))),
  };
}

// Sticker / keychain picker over the editor
function openPicker({ title, search, onpick, allowRemove }) {
  const grid = h('div.grid.grid-small');
  const status = h('p.muted.empty');
  let timer;
  const run = async (q) => {
    status.textContent = 'Ищу…';
    try {
      const items = await search(q);
      grid.replaceChildren(...items.map((it) => h('button.tile.small', { type: 'button', onclick: () => { layer.remove(); onpick(it); } },
        h('div.tile-img', {}, img(it.image, it.name)), h('div.tile-text', {}, h('div.tile-title', {}, it.name)))));
      status.textContent = items.length ? '' : 'Ничего не найдено';
    } catch (e) {
      status.textContent = e.message;
    }
  };
  const input = h('input.search', { type: 'search', placeholder: 'Поиск', oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => run(e.target.value), 200); } });
  const layer = h('div.overlay.picker-layer', { onclick: (e) => { if (e.target === layer) layer.remove(); } },
    h('div.modal.picker', { role: 'dialog' },
      h('div.modal-head', {}, h('h3', {}, title), h('button.icon-btn', { type: 'button', 'aria-label': 'Закрыть', onclick: () => layer.remove() }, '×')),
      h('div.toolbar', {}, input, allowRemove ? h('button.btn.ghost', { type: 'button', onclick: () => { layer.remove(); onpick(null); } }, 'Убрать') : null),
      h('div.picker-body', {}, grid, status),
    ));
  modalRoot.append(layer);
  input.focus();
  run('');
}

function stickersControl(initial) {
  const slots = [0, 1, 2, 3, 4].map((i) => initial[i] ?? 0);
  const info = { ...state.loadout.stickerInfo };
  const row = h('div.slots');
  const draw = () => row.replaceChildren(...slots.map((id, i) => h('button.slot', {
    type: 'button',
    title: id ? info[id]?.name ?? `#${id}` : 'Пусто: выбрать наклейку',
    onclick: () => openPicker({
      title: `Наклейка, место ${i + 1}`,
      search: (q) => api(`/api/stickers?q=${encodeURIComponent(q)}`),
      allowRemove: Boolean(id),
      onpick: (s) => { slots[i] = s?.id ?? 0; if (s) info[s.id] = s; draw(); },
    }),
  }, id ? img(info[id]?.image, info[id]?.name) : h('span.plus', {}, '+'))));
  draw();
  return { el: h('div.field', {}, h('label', {}, 'Наклейки'), row), get: () => slots };
}

function keychainControl(initial) {
  let id = initial;
  const box = h('div.slots');
  const byId = (k) => state.catalog.keychains.find((x) => x.id === k);
  const draw = () => box.replaceChildren(...[h('button.slot', {
    type: 'button',
    title: id ? byId(id)?.name : 'Пусто: выбрать брелок',
    onclick: () => openPicker({
      title: 'Брелок',
      allowRemove: Boolean(id),
      search: async (q) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        return state.catalog.keychains.filter((k) => words.every((w) => k.name.toLowerCase().includes(w)));
      },
      onpick: (k) => { id = k?.id ?? 0; draw(); },
    }),
  }, id ? img(byId(id)?.image, byId(id)?.name) : h('span.plus', {}, '+')), id ? h('span.slot-name', {}, byId(id)?.name ?? '') : null].filter(Boolean));
  draw();
  return { el: h('div.field', {}, h('label', {}, 'Брелок'), box), get: () => id };
}

function editorShell({ image, title, subtitle, fields, actions }) {
  return modal([
    h('div.modal-head', {}, h('div', {}, h('h3', {}, title), subtitle ? h('p.muted', {}, subtitle) : null),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Закрыть', onclick: closeModal }, '×')),
    h('div.editor', {},
      h('div.editor-img', {}, img(image, title)),
      h('div.editor-fields', {}, fields),
    ),
    h('div.modal-foot', {}, actions),
  ]);
}

async function save(endpoint, body, button) {
  const buttons = modalRoot.querySelectorAll('.modal-foot button');
  buttons.forEach((b) => { b.disabled = true; });
  button.classList.add('busy');
  try {
    const res = await api(endpoint, body);
    state.loadout = res.loadout;
    closeModal();
    render();
    toast(res.applied ? 'Готово, уже у вас в игре' : 'Сохранено. В игре появится после !wp или при следующем заходе');
  } catch (e) {
    buttons.forEach((b) => { b.disabled = false; });
    button.classList.remove('busy');
    if (e.status === 401) return renderLogin();
    toast(e.message, 'error');
  }
}

function openEditor(opts) {
  if (opts.kind === 'skin') return skinEditor(opts.weapon, opts.skin);
  if (opts.kind === 'gloves') return glovesEditor(opts.glove);
  if (opts.kind === 'knife-default') {
    const sides = sidesControl(sidesWith((s) => !knifeOf(s)));
    const apply = h('button.btn.primary', { type: 'button', onclick: () => save('/api/knife', { teams: sides.get(), knife: null }, apply) }, 'Взять стандартный нож');
    return editorShell({ image: DEFAULT_KNIFE_IMAGE, title: 'Стандартный нож', subtitle: 'Обычный нож T или CT', fields: [sides.el], actions: [apply] });
  }
  if (opts.kind === 'simple') {
    const current = sidesWith((s) => Number(state.loadout[opts.key][s]) === (opts.item?.id ?? 0) || (!opts.item && !Number(state.loadout[opts.key][s])));
    const sides = sidesControl(current);
    const apply = h('button.btn.primary', { type: 'button', onclick: () => save(opts.endpoint, { teams: sides.get(), id: opts.item?.id ?? 0 }, apply) }, opts.item ? 'Выбрать' : 'Убрать');
    return editorShell({ image: opts.item?.image, title: opts.title, fields: [sides.el], actions: [apply] });
  }
  if (opts.kind === 'agent') {
    const a = opts.agent;
    const on = state.loadout.agents[a.team] === a.model;
    const apply = h('button.btn.primary', { type: 'button', onclick: () => save('/api/agent', { teams: [a.team], model: a.model }, apply) }, 'Выбрать');
    const off = h('button.btn.ghost', { type: 'button', onclick: () => save('/api/agent', { teams: [a.team], model: null }, off) }, 'Стандартный агент');
    return editorShell({ image: a.image, title: a.name, subtitle: `Сторона ${SIDE_NAME[a.team]}`, fields: [], actions: on ? [off] : [apply] });
  }
}

function skinEditor(w, s) {
  const isKnife = w.category === 'knives';
  const isDefault = s.paint === 0;
  const onSides = sidesWith((side) => {
    if (isKnife && knifeOf(side)?.defindex !== w.defindex) return false;
    const cur = skinOf(w.defindex, side);
    return isDefault ? !cur : cur?.paint === s.paint;
  });
  // Start from what the player has on this skin now (the shown side first)
  const existing = [state.side, T, CT].map((side) => skinOf(w.defindex, side)).find((x) => x && x.paint === s.paint);

  const sides = sidesControl(onSides.length ? onSides : []);
  const fields = [sides.el];
  let get = () => ({});

  if (!isDefault) {
    const wear = wearControl(existing?.wear ?? 0.0001);
    const seed = seedControl(existing?.seed ?? 0);
    const stattrak = h('input', { type: 'checkbox', checked: existing?.stattrak ?? false });
    const nametag = h('input', { type: 'text', maxLength: 20, value: existing?.nametag ?? '', placeholder: 'Без нейм-тега' });
    fields.push(wear.el, seed.el,
      h('div.field', {}, h('label.check', {}, stattrak, h('span', {}, 'StatTrak™'),
        existing?.stattrak ? h('span.muted', {}, ` · убийств: ${existing.stattrakCount}`) : null)),
      h('div.field', {}, h('label', {}, 'Нейм-тег'), nametag));
    let stickers = null;
    let keychain = null;
    if (!isKnife) {
      stickers = stickersControl(existing?.stickers ?? []);
      keychain = keychainControl(existing?.keychain ?? 0);
      fields.push(stickers.el, keychain.el);
    }
    get = () => ({
      wear: wear.get(), seed: seed.get(), stattrak: stattrak.checked, nametag: nametag.value,
      stickers: stickers?.get() ?? [], keychain: keychain?.get() ?? 0,
    });
  } else {
    fields.push(h('p.muted', {}, isKnife ? 'Нож этого типа без скина.' : 'Обычное оружие без скина.'));
  }

  const apply = h('button.btn.primary', {
    type: 'button',
    onclick: () => save('/api/skin', { teams: sides.get(), defindex: w.defindex, paint: s.paint, ...get() }, apply),
  }, isDefault ? (isKnife ? 'Взять этот нож' : 'Убрать скин') : (onSides.length ? 'Сохранить' : 'Надеть'));

  const actions = [apply];
  if (!isDefault && onSides.length) {
    const remove = h('button.btn.ghost', {
      type: 'button',
      onclick: () => save('/api/skin/remove', { teams: sides.get(), defindex: w.defindex }, remove),
    }, 'Снять');
    actions.unshift(remove);
  }
  return editorShell({ image: s.image, title: isDefault ? w.name : s.name, subtitle: isDefault ? 'Без скина' : w.name, fields, actions });
}

function glovesEditor(g) {
  const onSides = sidesWith((side) => {
    const c = gloveOf(side);
    return g ? c?.defindex === g.defindex && c?.paint === g.paint : !c;
  });
  const sides = sidesControl(onSides);
  if (!g) {
    const apply = h('button.btn.primary', { type: 'button', onclick: () => save('/api/gloves', { teams: sides.get(), defindex: 0 }, apply) }, 'Взять стандартные');
    return editorShell({ image: null, title: 'Стандартные перчатки', subtitle: 'Перчатки вашего агента', fields: [sides.el], actions: [apply] });
  }
  const existing = [state.side, T, CT].map((side) => skinOf(g.defindex, side)).find((x) => x && x.paint === g.paint);
  const wear = wearControl(existing?.wear ?? 0.0001);
  const seed = seedControl(existing?.seed ?? 0);
  const apply = h('button.btn.primary', {
    type: 'button',
    onclick: () => save('/api/gloves', { teams: sides.get(), defindex: g.defindex, paint: g.paint, wear: wear.get(), seed: seed.get() }, apply),
  }, onSides.length ? 'Сохранить' : 'Надеть');
  return editorShell({ image: g.image, title: g.name, subtitle: g.type, fields: [sides.el, wear.el, seed.el], actions: [apply] });
}

// ---- routing -------------------------------------------------------------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'c') return { nav: parts[1], page: () => categoryPage(parts[1]) };
  if (parts[0] === 'w') {
    const w = weaponBy(Number(parts[1]));
    return { nav: w?.category, page: () => weaponPage(Number(parts[1])) };
  }
  return { nav: '', page: overviewPage };
}

let lastHash = null;
function render() {
  if (!state.me) return;
  const r = route();
  const scroll = location.hash === lastHash ? window.scrollY : 0;
  app.replaceChildren(
    header(),
    h('div.layout', {}, nav(r.nav), h('main.content', {}, r.page())),
  );
  window.scrollTo(0, scroll);
  lastHash = location.hash;
}

window.addEventListener('hashchange', () => { closeModal(); render(); });

async function start() {
  try {
    state.me = await api('/api/me');
  } catch (e) {
    if (e.status === 401) return renderLogin();
    app.replaceChildren(h('div.boot', {}, `Не удалось загрузить: ${e.message}`));
    return;
  }
  [state.catalog, state.loadout] = await Promise.all([state.catalog ?? api('/api/catalog'), api('/api/loadout')]);
  render();
  watchSession();
}

// Shared club PCs: once the player leaves the server (or another sits down), show the next one's page
let sessionTimer;
function watchSession() {
  clearInterval(sessionTimer);
  sessionTimer = setInterval(async () => {
    try {
      await api('/api/me');
    } catch (e) {
      if (e.status === 401) {
        clearInterval(sessionTimer);
        renderLogin();
      }
    }
  }, 15_000);
}

start();
