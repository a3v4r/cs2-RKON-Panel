"use client";

import React from 'react';
import { ChevronLeft, ChevronRight, Globe, Info, Map as MapIcon, Network, Rocket, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { db_helper, GameMode, Priority, ServerProfile } from '@/lib/db';
import { useT, tNow } from '@/lib/i18n';
import { CustomSelect } from '@/components/ui/custom-select';

interface CreateServerWizardProps {
  // Panel-run server to edit; without it a new one is created
  server?: ServerProfile | null;
  servers: ServerProfile[];
  onDone: () => void;
}

interface Form {
  name: string;
  maxPlayers: string;
  port: string;
  tvPort: string;
  country_code: string;
  bindIp: string;
  map: string;
  workshopMap: string;
  gslt: string;
  password: string;
  rcon_password: string;
  gameMode: GameMode;
  extraArgs: string;
  hibernate: boolean;
  autoStart: boolean;
  tv: boolean;
  vac: boolean;
  lan: boolean;
  autoRestart: boolean;
  priority: Priority;
  extraCfg: string;
  hideConsole: boolean;
}

const MAPS = ['de_dust2', 'de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_vertigo', 'de_train', 'de_overpass'];

const REGIONS: { code: string; ru: string; en: string }[] = [
  { code: 'RU', ru: 'Россия', en: 'Russia' },
  { code: 'KZ', ru: 'Казахстан', en: 'Kazakhstan' },
  { code: 'BY', ru: 'Беларусь', en: 'Belarus' },
  { code: 'UA', ru: 'Украина', en: 'Ukraine' },
  { code: 'DE', ru: 'Германия', en: 'Germany' },
  { code: 'NL', ru: 'Нидерланды', en: 'Netherlands' },
  { code: 'FI', ru: 'Финляндия', en: 'Finland' },
  { code: 'PL', ru: 'Польша', en: 'Poland' },
  { code: 'SE', ru: 'Швеция', en: 'Sweden' },
  { code: 'TR', ru: 'Турция', en: 'Turkey' },
  { code: 'US', ru: 'США', en: 'United States' },
];

const field = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600';

// Next free pair of ports on this PC: 27015/27020, 27025/27030, ...
function freePorts(servers: ServerProfile[], start = 27015) {
  const taken = new Set(servers.flatMap((s) => [s.port, s.managed?.tvPort ?? 0]));
  for (let port = start; port < start + 1000; port += 10) {
    if (!taken.has(port) && !taken.has(port + 5)) return { port, tvPort: port + 5 };
  }
  return { port: 27015, tvPort: 27020 };
}

function newForm(servers: ServerProfile[], start?: number): Form {
  const { port, tvPort } = freePorts(servers, start);
  const n = servers.filter((s) => s.managed).length + 1;
  return {
    name: tNow(`Турнирный сервер #${n}`, `Tournament server #${n}`),
    maxPlayers: '12',
    port: String(port),
    tvPort: String(tvPort),
    country_code: 'RU',
    bindIp: '0.0.0.0',
    map: 'de_dust2',
    workshopMap: '',
    gslt: '',
    password: '',
    rcon_password: '',
    gameMode: 'competitive',
    extraArgs: '',
    hibernate: false,
    autoStart: true,
    tv: true,
    vac: true,
    lan: true,
    autoRestart: true,
    priority: 'Normal',
    extraCfg: '',
    hideConsole: true,
  };
}

function editForm(server: ServerProfile): Form {
  const m = server.managed!;
  return {
    name: server.name,
    maxPlayers: String(m.maxPlayers),
    port: String(server.port),
    tvPort: String(m.tvPort),
    country_code: server.country_code ?? '',
    bindIp: m.bindIp,
    map: m.map,
    workshopMap: m.workshopMap ?? '',
    gslt: m.gslt ?? '',
    password: m.password,
    rcon_password: '',
    gameMode: m.gameMode ?? 'competitive',
    extraArgs: m.extraArgs ?? '',
    hibernate: m.hibernate ?? false,
    autoStart: false,
    tv: m.tv !== false,
    vac: m.vac !== false,
    lan: m.lan !== false,
    autoRestart: m.autoRestart,
    priority: m.priority ?? 'Normal',
    extraCfg: m.extraCfg ?? '',
    hideConsole: m.hideConsole !== false,
  };
}

// "Create New CS2 Instance" from Quatrix: a three-step wizard. The panel writes the cfg and starts cs2.exe itself.
export function CreateServerWizard({ server, servers, onDone }: CreateServerWizardProps) {
  const { t, lang } = useT();
  const editing = !!server?.managed;
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<Form>(() => (editing ? editForm(server!) : newForm(servers)));
  const [interfaces, setInterfaces] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    api<{ addresses: string[] }>('/api/network').then((n) => setInterfaces(n.addresses)).catch(() => {});
    // Ports of a new server start from the default port set in the panel settings
    if (!editing) api<{ defaultPort: number }>('/api/panel-settings').then((st) => setForm(newForm(servers, st.defaultPort))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key: keyof Form) => ({
    id: key,
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  });

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const body: ServerProfile = {
        id: server?.id,
        name: form.name.trim(),
        host: '127.0.0.1',
        port: Number(form.port),
        rcon_password: form.rcon_password,
        country_code: form.country_code || undefined,
        managed: {
          tvPort: Number(form.tvPort),
          map: form.map.trim(),
          workshopMap: form.workshopMap.trim() || undefined,
          maxPlayers: Number(form.maxPlayers),
          password: form.password,
          bindIp: form.bindIp.trim() || '0.0.0.0',
          autoRestart: form.autoRestart,
          gameMode: form.gameMode,
          gslt: form.gslt.trim() || undefined,
          vac: form.vac,
          hibernate: form.hibernate,
          tv: form.tv,
          lan: form.lan,
          priority: form.priority,
          extraArgs: form.extraArgs.trim() || undefined,
          extraCfg: form.extraCfg.trim() || undefined,
          hideConsole: form.hideConsole,
        },
      };
      const saved = editing ? await db_helper.updateServer(server!.id!, body) : await db_helper.addServer(body);
      if (!editing && form.autoStart && saved.id) {
        try {
          await db_helper.serverProcess(saved.id, 'start');
        } catch (e) {
          // The server is created; why it did not start is shown in the list as well
          alert(`${t('Сервер создан, но не запустился', 'The server was created but did not start')}: ${(e as Error).message}`);
        }
      }
      onDone();
    } catch (err) {
      setError((err as Error).message || t('Не удалось создать сервер', 'Failed to create server'));
    } finally {
      setLoading(false);
    }
  };

  const steps = [t('Основное', 'Details'), t('Карта', 'Map'), t('Дополнительно', 'Advanced')];
  const mapOptions = (MAPS.includes(form.map) ? MAPS : [form.map, ...MAPS]).map((m) => ({ value: m, label: m }));
  const ipOptions = ['0.0.0.0', ...interfaces].map((ip) => ({ value: ip, label: ip === '0.0.0.0' ? t('Все: 0.0.0.0', 'All: 0.0.0.0') : ip }));
  const regionOptions = [{ value: '', label: t('Не указан', 'Not set') }, ...REGIONS.map((r) => ({ value: r.code, label: lang === 'ru' ? r.ru : r.en }))];
  const gameModes: { value: GameMode; label: string }[] = [
    { value: 'competitive', label: t('Соревновательный', 'Competitive') },
    { value: 'casual', label: t('Обычный', 'Casual') },
    { value: 'deathmatch', label: t('Бой насмерть', 'Deathmatch') },
    { value: 'wingman', label: t('Напарники', 'Wingman') },
    { value: 'armsrace', label: t('Гонка вооружений', 'Arms Race') },
    { value: 'demolition', label: t('Уничтожение объекта', 'Demolition') },
    { value: 'training', label: t('Обучение', 'Training') },
    { value: 'custom', label: t('Свой', 'Custom') },
  ];
  const priorities: { value: Priority; label: string }[] = [
    { value: 'High', label: t('Высокий', 'High Priority') },
    { value: 'AboveNormal', label: t('Выше среднего', 'Above Normal') },
    { value: 'Normal', label: t('Обычный', 'Normal') },
  ];

  return (
    <div className="p-3 md:p-6 font-display">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {editing ? t('Параметры сервера', 'Edit CS2 Instance') : t('Новый сервер CS2', 'Create New CS2 Instance')}
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {editing
            ? t('Новые параметры применятся при следующем запуске сервера.', 'New options take effect the next time the server starts.')
            : t('Настройте и запустите выделенный сервер Counter-Strike 2 с помощью мастера.', 'Configure and deploy a new Counter-Strike 2 dedicated server using our setup wizard.')}
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        {/* Stepper */}
        <div className="px-4 md:px-8 py-6 border-b border-gray-800 bg-card">
          <div className="flex justify-between items-center max-w-2xl">
            {steps.map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div className={cn('h-px flex-1 mx-4', step > i ? 'bg-primary' : 'bg-gray-800')} />}
                <button type="button" onClick={() => setStep(i + 1)} className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all', step >= i + 1 ? 'bg-primary text-white' : 'bg-gray-800 text-gray-500')}>
                    {i + 1}
                  </div>
                  <span className={cn('font-semibold hidden sm:block', step >= i + 1 ? 'text-primary' : 'text-gray-500')}>{label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-8 min-h-[400px]">
          {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">{error}</div>}

          <form onSubmit={(e) => e.preventDefault()} className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {step === 1 && (
              <div className="space-y-6">
                <StepTitle icon={<Info className="text-primary" size={20} />} title={t('Основные сведения о сервере', 'Basic Server Information')} subtitle={t('Главные параметры нового сервера CS2.', 'Provide the essential details for your new CS2 instance.')} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field id="name" label={t('Название сервера', 'Server Name')}>
                    <input type="text" className={field} placeholder="My Awesome CS2 Server" {...input('name')} />
                  </Field>
                  <Field id="maxPlayers" label={t('Макс. игроков', 'Max Players')}>
                    <input type="number" min={2} max={64} className={field} {...input('maxPlayers')} />
                  </Field>
                  <Field id="port" label={t('Порт сервера', 'Server Port')}>
                    <input type="text" inputMode="numeric" className={field} {...input('port')} />
                  </Field>
                  <Field id="tvPort" label={t('Порт GOTV', 'GOTV Port')}>
                    <input type="text" inputMode="numeric" className={field} {...input('tvPort')} />
                  </Field>
                  <Field id="region" label={t('Регион сервера', 'Server Region')}>
                    <CustomSelect options={regionOptions} value={form.country_code} onChange={(v) => set('country_code', v)} icon={<Globe className="w-4 h-4" />} />
                  </Field>
                  <Field id="bindIp" label={t('IP сервера (bind)', 'Bind IP')}>
                    <div className="relative">
                      <input type="text" className={cn(field, 'pr-44 font-mono')} placeholder="e.g. 0.0.0.0" onFocus={(e) => e.target.select()} {...input('bindIp')} />
                      <div className="absolute right-1.5 top-1.5 bottom-1.5 w-40">
                        <CustomSelect size="sm" options={ipOptions} value={form.bindIp} onChange={(v) => set('bindIp', v)} placeholder={t('Выбрать', 'Select')} icon={<Network className="w-4 h-4" />} />
                      </div>
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <StepTitle icon={<MapIcon className="text-primary" size={20} />} title={t('Карта', 'Map Configuration')} subtitle={t('Карта, с которой запустится сервер.', 'Choose the initial map for your server.')} />
                <Field id="map" label={t('Стартовая карта', 'Initial Map')}>
                  <CustomSelect options={mapOptions} value={form.map} onChange={(v) => set('map', v)} />
                </Field>
                <div className="flex items-center gap-4 rounded-xl overflow-hidden border border-gray-800 bg-background/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {form.workshopMap.trim()
                    ? <div className="w-40 h-24 shrink-0 bg-gray-800/50 flex items-center justify-center"><MapIcon className="text-gray-600" size={28} /></div>
                    : <img key={form.map} src={`/images/maps/${form.map}.webp`} alt="" className="w-40 h-24 object-cover shrink-0" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
                  <div className="py-3 pr-4 min-w-0">
                    <div className="text-white font-bold truncate">{form.workshopMap ? `Workshop ${form.workshopMap}` : form.map}</div>
                    <div className="text-xs text-gray-500 mt-1">{gameModes.find((g) => g.value === form.gameMode)?.label}</div>
                  </div>
                </div>
                <Field id="workshopMap" label={t('Карта из Workshop (ID, вместо стартовой)', 'Workshop Map ID (instead of the initial map)')}>
                  <input type="text" inputMode="numeric" className={cn(field, 'font-mono')} placeholder="3070284539" {...input('workshopMap')} />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <StepTitle icon={<Settings2 className="text-primary" size={20} />} title={t('Дополнительные настройки', 'Advanced Configuration')} subtitle={t('Необязательные параметры для тонкой настройки сервера.', 'Optional settings for enhanced server control.')} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field id="gslt" label={t('Токен GSLT', 'GSLT Token')}>
                    <input type="text" className={cn(field, 'font-mono')} placeholder={t('Нужен только для сервера в интернете', 'Your GameServer Login Token')} {...input('gslt')} />
                  </Field>
                  <Field id="password" label={t('Пароль сервера', 'Server Password')}>
                    <input type="text" className={field} placeholder={t('Пусто - без пароля', 'Leave empty for public')} {...input('password')} />
                  </Field>
                  <Field id="rcon_password" label={t('RCON-пароль', 'RCON Password')}>
                    <input type="password" autoComplete="new-password" className={field} placeholder={editing ? t('Пусто - не менять', 'Leave empty to keep') : t('Пусто - сгенерировать', 'Auto-generated if empty')} {...input('rcon_password')} />
                  </Field>
                  <Field id="gameMode" label={t('Режим игры', 'Game Alias')}>
                    <CustomSelect options={gameModes} value={form.gameMode} onChange={(v) => set('gameMode', v)} />
                  </Field>
                  <div className="md:col-span-2">
                    <Field id="extraArgs" label={t('Дополнительные аргументы запуска', 'Additional Launch Arguments')}>
                      <input type="text" className={cn(field, 'font-mono')} placeholder="-nobots +sv_infinite_ammo 1" {...input('extraArgs')} />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <Toggle on={form.hibernate} onClick={() => set('hibernate', !form.hibernate)} title={t('Спящий режим', 'Enable Hibernation')} desc={t('Экономит CPU, пока сервер пуст', 'Saves CPU when empty')} />
                  <Toggle on={form.autoRestart} onClick={() => set('autoRestart', !form.autoRestart)} title={t('Перезапуск при падении', 'Restart on crash')} desc={t('Если сервер упадёт после минуты работы', 'If it crashes after running a minute')} />
                  {!editing && <Toggle on={form.autoStart} onClick={() => set('autoStart', !form.autoStart)} title={t('Запустить сервер после создания', 'Auto-start server after creation')} />}
                  <Toggle on={form.tv} onClick={() => set('tv', !form.tv)} title={t('Включить GOTV', 'Enable SourceTV')} />
                  <Toggle on={form.vac} onClick={() => set('vac', !form.vac)} title={t('Включить VAC (Valve Anti-Cheat)', 'Enable VAC (Valve Anti-Cheat)')} />
                  <Toggle on={form.lan} onClick={() => set('lan', !form.lan)} title={t('Режим LAN', 'LAN Mode')} desc={t('Только локальная сеть (sv_lan 1)', 'Local network only (sv_lan 1)')} />
                  <Toggle on={form.hideConsole} onClick={() => set('hideConsole', !form.hideConsole)} title={t('Скрыть окно консоли', 'Hide console window')} desc={t('Вывод пишется в csgo\\console_server<ID>.log', 'Output goes to csgo\\console_server<ID>.log')} />
                </div>

                <div className="pt-6 border-t border-gray-800">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                    <Settings2 className="text-primary" size={20} />
                    {t('Производительность', 'Performance Orchestration')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Field id="priority" label={t('Приоритет CPU', 'CPU Priority')}>
                      <CustomSelect options={priorities} value={form.priority} onChange={(v) => set('priority', v)} />
                    </Field>
                    <Field id="extraCfg" label={t('Дополнительные строки cfg', 'Extra cfg lines')}>
                      <textarea rows={4} className={cn(field, 'font-mono text-sm resize-y')} placeholder={'mp_autokick 0\nsv_cheats 0'} {...input('extraCfg')} />
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="px-4 md:px-8 py-6 border-t border-gray-800 bg-background/30 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={() => (step === 1 ? onDone() : setStep(step - 1))}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2"
          >
            <ChevronLeft size={18} />
            {step === 1 ? t('Отмена', 'Cancel') : t('Назад', 'Previous')}
          </button>

          <div className="flex gap-4">
            {editing && step < 3 && (
              <button type="button" onClick={submit} disabled={loading || !form.name.trim()} className="px-6 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-all shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? t('Сохранение...', 'Saving...') : t('Сохранить', 'Save Changes')}
              </button>
            )}
            {step < 3 ? (
              <button type="button" onClick={() => setStep(step + 1)} className="px-6 md:px-10 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 active:scale-95">
                {t('Далее', 'Next Step')}
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={loading || !form.name.trim()}
                className="px-6 md:px-12 py-3 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Rocket size={18} />
                {editing
                  ? (loading ? t('Сохранение...', 'Saving...') : t('Сохранить', 'Save Changes'))
                  : (loading ? t('Создание...', 'Creating...') : t('Запустить сервер', 'Launch Instance'))}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="pb-4 border-b border-gray-800 mb-6">
      <h3 className="text-xl font-bold text-white flex items-center gap-2">{icon}{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 min-w-0">
      <label htmlFor={id} className="block text-sm font-bold text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: string; desc?: string }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-background/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
      <button
        type="button"
        aria-label={title}
        aria-pressed={on}
        onClick={onClick}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', on ? 'bg-primary' : 'bg-gray-700')}
      >
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', on ? 'translate-x-6' : 'translate-x-1')} />
      </button>
      {desc ? (
        <div className="flex flex-col">
          <span className="text-sm text-gray-300 font-semibold">{title}</span>
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">{desc}</span>
        </div>
      ) : (
        <span className="text-sm text-gray-300">{title}</span>
      )}
    </div>
  );
}
