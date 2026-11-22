"use client"

import React, { useState } from 'react'
import { Users, Zap, Copy, Download, Map as MapIcon, ShieldOff, Trophy, Settings2, Braces, Check, CheckCircle2, AlertCircle, ListChecks, Swords, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { STOCK_MAPS, mapImage, stockMap } from '@/lib/maps'
import { CustomSelect } from '@/components/ui/custom-select'
import { Team, TeamPlayer, teamsApi } from '@/lib/teams'

interface MatchGeneratorProps {
  serverId: number;
  onStartMatch: (config: string) => Promise<void>;
  onLaunchMatch: (config: string, url: string) => Promise<void>;
  onStopMatch: () => Promise<void>;
}

// Defusal maps of the CS2 install: the choice for each map slot
const MAPS = STOCK_MAPS.filter((m) => m.type === 'Defusal').map((m) => m.name)
// Default pool for the in-game veto (MatchZy bans and picks from it)
const DEFAULT_VETO_POOL = ['de_inferno', 'de_mirage', 'de_nuke', 'de_cache', 'de_ancient', 'de_anubis', 'de_dust2']

const defaultMatchConfig = () => ({
  matchid: Math.floor(Date.now() / 1000) % 10000,
  team1: { name: "Команда 1", tag: "T1", flag: "", players: [] as TeamPlayer[], libraryId: 0 },
  team2: { name: "Команда 2", tag: "T2", flag: "", players: [] as TeamPlayer[], libraryId: 0 },
  maplist: ["de_mirage", "de_inferno", "de_dust2"],
  map_sides: ["team1_ct", "team2_ct", "knife"],
  num_maps: 1,
  players_per_team: 5,
  skip_veto: true,
  veto_pool: DEFAULT_VETO_POOL,
  // Players from the library rosters go to MatchZy, which then keeps them on their teams
  lock_players: true,
})

type MatchFormConfig = ReturnType<typeof defaultMatchConfig>

// The form survives tab switches and page reloads (phones reload background tabs), per server, in this browser.
const storageKey = (serverId: number) => `cs2panel.match.${serverId}`

function loadMatchConfig(serverId: number): MatchFormConfig {
  try {
    const saved = localStorage.getItem(storageKey(serverId))
    if (saved) {
      const defaults = defaultMatchConfig()
      const config: MatchFormConfig = { ...defaults, ...JSON.parse(saved) }
      // Forms saved before the team library have no flag/roster
      config.team1 = { ...defaults.team1, ...config.team1 }
      config.team2 = { ...defaults.team2, ...config.team2 }
      // "standard" was offered by older versions but MatchZy rejects it in map_sides
      config.map_sides = config.map_sides.map((side) => (side === 'standard' ? 'knife' : side))
      return config
    }
  } catch {
    // storage unavailable (private mode): start from defaults
  }
  return defaultMatchConfig()
}

// Team block of the MatchZy config; the roster only when players are locked to their teams
function teamJson(team: MatchFormConfig['team1'], lockPlayers: boolean) {
  return {
    name: team.name,
    tag: team.tag,
    ...(team.flag ? { flag: team.flag } : {}),
    players: lockPlayers ? Object.fromEntries(team.players.map((p) => [p.steamid, p.name || p.steamid])) : {},
  }
}

const FILL_MAPS = ['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_cache']
const FILL_SIDES = ['team1_ct', 'team2_ct', 'knife', 'knife', 'knife']

export function MatchGenerator({ serverId, onLaunchMatch, onStopMatch }: MatchGeneratorProps) {
  const { t, lang } = useT()
  const [matchConfig, setMatchConfig] = useState<MatchFormConfig>(() => loadMatchConfig(serverId))
  const [library, setLibrary] = useState<Team[]>([])

  React.useEffect(() => {
    teamsApi.list().then(setLibrary).catch(() => {})
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey(serverId), JSON.stringify(matchConfig))
    } catch {
      // not critical
    }
  }, [serverId, matchConfig])

  // Side options show the team names typed below
  const team1Label = matchConfig.team1.name.trim() || t('Команда 1', 'Team 1')
  const team2Label = matchConfig.team2.name.trim() || t('Команда 2', 'Team 2')

  const [jsonOutput, setJsonOutput] = useState("")
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' })
  const [isLoading, setIsLoading] = useState(false)

  React.useEffect(() => {
    generateJson();
  }, [matchConfig]);

  const handleStopMatch = async () => {
    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })
    try {
      await onStopMatch()
      setStatus({ type: 'success', message: t('Матч остановлен', 'Match stopped') })
    } catch (error: any) {
      setStatus({ type: 'error', message: `${t('Не удалось остановить', 'Could not stop')}: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const vetoPool = matchConfig.veto_pool.filter((m) => MAPS.includes(m))

  const generateJson = (matchid = matchConfig.matchid) => {
    const config = {
      matchid,
      team1: teamJson(matchConfig.team1, matchConfig.lock_players),
      team2: teamJson(matchConfig.team2, matchConfig.lock_players),
      num_maps: matchConfig.num_maps,
      // Veto: the whole pool goes to MatchZy and the captains ban/pick in game (sides too)
      ...(matchConfig.skip_veto
        ? {
            maplist: matchConfig.maplist.slice(0, matchConfig.num_maps),
            map_sides: matchConfig.map_sides.slice(0, matchConfig.num_maps),
            skip_veto: true,
          }
        : { maplist: vetoPool, skip_veto: false }),
      clinch_series: true,
      players_per_team: matchConfig.players_per_team,
      cvars: {
        hostname: `MatchZy: ${matchConfig.team1.name} vs ${matchConfig.team2.name}`,
        mp_friendlyfire: "0"
      }
    }
    const json = JSON.stringify(config, null, 2)
    setJsonOutput(json)
    return json
  }

  const handleLaunchUrlMatch = async () => {
    if (!matchConfig.skip_veto && vetoPool.length < matchConfig.num_maps) {
      setStatus({ type: 'error', message: t(`Для BO${matchConfig.num_maps} в пуле вето нужно хотя бы ${matchConfig.num_maps} карт`, `BO${matchConfig.num_maps} needs at least ${matchConfig.num_maps} maps in the veto pool`) })
      return
    }
    // A new id for every launch (the saved form would repeat it): backups, demos and live stats are keyed by it
    const matchid = Math.floor(Date.now() / 1000) % 10000
    setMatchConfig((c) => ({ ...c, matchid }))
    const json = generateJson(matchid)
    if (!json.trim()) return;

    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })
    try {
      // 1. Host the JSON on the panel server, 2. get the URL the game server can reach it at
      const { url: configUrl } = await api<{ url: string }>('/api/matches/config', { body: { config: json, serverId } });

      // 3. Launch via RCON
      await onLaunchMatch(json, configUrl)
      setStatus({ type: 'success', message: t('Матч загружен на сервер. Счёт и статистика в разделе «Матч».', 'Match loaded on the server. Score and stats are in the "Match" section.') })
    } catch (error: any) {
      setStatus({ type: 'error', message: `${t('Не удалось запустить', 'Could not start')}: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    const json = generateJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `match_${matchConfig.matchid}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const setFormat = (num: number) => {
    setMatchConfig((prev) => ({
      ...prev,
      num_maps: num,
      maplist: Array.from({ length: num }, (_, i) => prev.maplist[i] || FILL_MAPS[i]),
      map_sides: Array.from({ length: Math.max(num, prev.map_sides.length) }, (_, i) => prev.map_sides[i] || FILL_SIDES[i]),
    }))
  }

  const updateMapForSlot = (index: number, map: string) => {
    setMatchConfig(prev => {
      const newList = [...prev.maplist];
      newList[index] = map;
      return { ...prev, maplist: newList };
    });
  }

  const updateSideForSlot = (index: number, side: string) => {
    setMatchConfig(prev => {
      const newList = [...prev.map_sides];
      newList[index] = side;
      return { ...prev, map_sides: newList };
    });
  }

  const toggleVetoMap = (map: string) => {
    setMatchConfig((prev) => ({
      ...prev,
      veto_pool: prev.veto_pool.includes(map) ? prev.veto_pool.filter((m) => m !== map) : [...prev.veto_pool, map],
    }))
  }

  const setTeam = (team: 'team1' | 'team2', key: 'name' | 'tag', value: string) =>
    setMatchConfig((prev) => ({ ...prev, [team]: { ...prev[team], [key]: value } }))

  // A team from the library fills the name, tag, flag and roster; "by hand" clears the roster
  const pickTeam = (team: 'team1' | 'team2', id: number) => {
    const picked = library.find((tm) => tm.id === id)
    setMatchConfig((prev) => ({
      ...prev,
      [team]: picked
        ? { name: picked.name, tag: picked.tag, flag: picked.flag, players: picked.players, libraryId: picked.id }
        : { ...prev[team], flag: '', players: [], libraryId: 0 },
    }))
  }
  const libraryOptions = [
    { value: 0, label: t('Вручную', 'By hand') },
    ...library.map((tm) => ({ value: tm.id, label: tm.tag ? `${tm.name} [${tm.tag}]` : tm.name })),
  ]
  const hasRosters = matchConfig.team1.players.length > 0 || matchConfig.team2.players.length > 0

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonOutput)
  }

  const sideOptions = [
    { value: 'knife', label: t('Ножевой раунд', 'Knife round') },
    { value: 'team1_ct', label: `${team1Label}: CT` },
    { value: 'team1_t', label: `${team1Label}: T` },
    { value: 'team2_ct', label: `${team2Label}: CT` },
    { value: 'team2_t', label: `${team2Label}: T` },
  ]
  const heroMaps = matchConfig.skip_veto ? matchConfig.maplist.slice(0, matchConfig.num_maps) : []

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero, as on the Match page: the first map behind the teams, the launch buttons on top */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-800 shadow-2xl bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mapImage(heroMaps[0])} alt="" className={cn('absolute inset-0 w-full h-full object-cover', heroMaps.length ? 'opacity-30' : 'opacity-10 grayscale')} />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/85 to-card/40" />
        <div className="relative p-4 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight">{t('Новый матч', 'New match')}</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                BO{matchConfig.num_maps} · {matchConfig.skip_veto ? t('карты заданы', 'maps set') : t('вето в игре', 'in-game veto')} · match_{matchConfig.matchid}.json
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button type="button" onClick={handleStopMatch} disabled={isLoading} className={cn(BTN, 'flex-1 sm:flex-none bg-gray-800 hover:bg-red-500 text-white border border-gray-700/50 hover:border-transparent')}>
                <ShieldOff size={16} /> {t('Остановить', 'Stop')}
              </button>
              <button type="button" onClick={handleLaunchUrlMatch} disabled={isLoading} className={cn(BTN, 'flex-1 sm:flex-none bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20')}>
                {isLoading
                  ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> {t('Подождите...', 'Please wait...')}</>
                  : <><Zap size={16} /> {t('Запустить', 'Start')}</>}
              </button>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
            <TeamPreview name={team1Label} tag={matchConfig.team1.tag} team="team1" />
            <div className="text-2xl sm:text-4xl font-black text-gray-600">VS</div>
            <TeamPreview name={team2Label} tag={matchConfig.team2.tag} team="team2" align="right" />
          </div>

          {heroMaps.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {heroMaps.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/60 border border-gray-800 text-[10px] text-gray-300 font-black uppercase tracking-widest">
                  <span className="text-primary">{i + 1}</span> {stockMap(m)?.displayName ?? m}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {status.message && (
        <div className="space-y-2">
          <div className={cn('p-4 rounded-xl text-sm font-medium flex items-start gap-2 border', status.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20')}>
            {status.type === 'success' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
            <span className="min-w-0 break-words">{status.message}</span>
          </div>
          {status.type === 'error' && (
            <p className="text-xs text-gray-500 px-1 leading-relaxed">
              {lang === 'en' ? (
                <>If RCON does not work: download the config (button above the JSON), put it in the server's <code className="font-mono text-primary">csgo</code> folder and run <code className="font-mono text-primary break-all">matchzy_loadmatch file_name.json</code> in the server console.</>
              ) : (
                <>Если RCON не работает: скачайте конфиг (кнопка над JSON), положите его в папку <code className="font-mono text-primary">csgo</code> сервера и выполните в консоли сервера <code className="font-mono text-primary break-all">matchzy_loadmatch имя_файла.json</code>.</>
              )}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:gap-6 xl:grid-cols-3 items-start">
        <div className="xl:col-span-2 space-y-4 md:space-y-6 min-w-0">
          {/* Teams */}
          <section className={cn(CARD, 'p-4 sm:p-6')}>
            <CardHeader icon={<Users size={18} />} title={t('Команды', 'Teams')} subtitle={library.length ? t('из библиотеки или вручную', 'from the library or by hand') : t('название и тег в игре', 'name and tag in game')} />
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['team1', 'team2'] as const).map((team) => (
                <div key={team} className="p-4 rounded-xl border border-gray-800 bg-background/50 space-y-3 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-black shrink-0', TEAM_CHIP[team])}>{initials(matchConfig[team].name)}</div>
                    <span className={cn('text-xs font-black uppercase tracking-wider', TEAM_TEXT[team])}>{team === 'team1' ? t('Команда 1', 'Team 1') : t('Команда 2', 'Team 2')}</span>
                  </div>
                  {library.length > 0 && (
                    <CustomSelect size="sm" className="h-[38px]" options={libraryOptions} value={library.some((tm) => tm.id === matchConfig[team].libraryId) ? matchConfig[team].libraryId : 0} onChange={(id) => pickTeam(team, id)} icon={<Shield className="w-4 h-4" />} />
                  )}
                  <div className="grid grid-cols-[1fr_6rem] gap-3">
                    <div>
                      <label className={LABEL}>{t('Название', 'Name')}</label>
                      <input value={matchConfig[team].name} onChange={(e) => setTeam(team, 'name', e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>{t('Тег', 'Tag')}</label>
                      <input value={matchConfig[team].tag} onChange={(e) => setTeam(team, 'tag', e.target.value)} className={INPUT} />
                    </div>
                  </div>
                  {matchConfig[team].players.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {matchConfig[team].players.map((p) => (
                        <span key={p.steamid} title={p.steamid} className="px-2 py-0.5 rounded-full border border-gray-800 bg-card text-[11px] text-gray-300 font-semibold max-w-full truncate">
                          {p.name || p.steamid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasRosters && (
              <label className="mt-4 flex items-start gap-3 p-3 rounded-xl border border-gray-800 bg-background/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchConfig.lock_players}
                  onChange={(e) => setMatchConfig({ ...matchConfig, lock_players: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{t('Пускать только игроков из составов', 'Only let roster players in')}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {t('SteamID составов уходят в конфиг: MatchZy ставит игроков в их команды, остальных не пускает в игру. Выключите, если состав неполный.',
                      'Roster SteamIDs go into the config: MatchZy puts players on their teams and keeps others out of the game. Turn off if a roster is incomplete.')}
                  </span>
                </span>
              </label>
            )}
          </section>

          {/* Maps */}
          <section className={cn(CARD, 'p-4 sm:p-6')}>
            <CardHeader
              icon={<MapIcon size={18} />}
              title={matchConfig.skip_veto ? t('Карты и стороны', 'Maps and sides') : t('Пул карт для вето', 'Veto map pool')}
              subtitle={matchConfig.skip_veto
                ? t('карта и сторона для каждой игры серии', 'map and side for each game of the series')
                : t(`выбрано ${vetoPool.length}: капитаны банят и пикают в чате`, `${vetoPool.length} selected: captains ban and pick in chat`)}
            />
            {matchConfig.skip_veto ? (
              <div className="mt-5 space-y-4">
                {Array.from({ length: matchConfig.num_maps }).map((_, i) => (
                  <div key={i} className="p-4 rounded-xl border border-gray-800 bg-background/50 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-black flex items-center justify-center">{i + 1}</span>
                        {stockMap(matchConfig.maplist[i])?.displayName ?? matchConfig.maplist[i]}
                      </span>
                      <CustomSelect className="w-full sm:w-64" options={sideOptions} value={matchConfig.map_sides[i] ?? 'knife'} onChange={(v) => updateSideForSlot(i, v)} />
                    </div>
                    <MapTiles selected={(m) => matchConfig.maplist[i] === m} onPick={(m) => updateMapForSlot(i, m)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <MapTiles selected={(m) => vetoPool.includes(m)} onPick={toggleVetoMap} />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4 md:space-y-6 min-w-0">
          {/* Format */}
          <section className={cn(CARD, 'p-4 sm:p-6 space-y-5')}>
            <CardHeader icon={<Trophy size={18} />} title={t('Формат серии', 'Series format')} />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button key={n} type="button" onClick={() => setFormat(n)} className={optionClass(matchConfig.num_maps === n)}>BO{n}</button>
              ))}
            </div>
            <div>
              <label className={LABEL}>{t('Вето в игре?', 'In-game veto?')}</label>
              <div className="space-y-2">
                {([
                  { value: true, icon: <ListChecks size={18} />, label: t('Нет, карты и стороны задаю здесь', 'No, I set maps and sides here') },
                  { value: false, icon: <Swords size={18} />, label: t('Да, вето в игре', 'Yes, veto in game') },
                ]).map((opt) => {
                  const selected = matchConfig.skip_veto === opt.value
                  return (
                    <button
                      type="button"
                      key={String(opt.value)}
                      onClick={() => setMatchConfig({ ...matchConfig, skip_veto: opt.value })}
                      className={cn('w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all', selected ? 'bg-primary/10 border-primary' : 'bg-background/50 border-gray-800 hover:border-gray-700')}
                    >
                      <span className={cn('w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border', selected ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-gray-800/50 border-gray-700/50 text-gray-500')}>{opt.icon}</span>
                      <span className={cn('flex-1 min-w-0 text-sm font-semibold', selected ? 'text-white' : 'text-gray-400')}>{opt.label}</span>
                      <span className={cn('w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center', selected ? 'border-primary' : 'border-gray-700')}>
                        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className={LABEL}>{t('Игроков в команде', 'Players per team')}</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setMatchConfig({ ...matchConfig, players_per_team: n })} className={optionClass(matchConfig.players_per_team === n)}>{n}</button>
                ))}
              </div>
            </div>
          </section>

          {/* Config, as the Quatrix config editor card */}
          <section className={cn(CARD, 'overflow-hidden flex flex-col')}>
            <div className="flex items-center justify-between gap-3 p-4 sm:px-6 border-b border-gray-800/60">
              <CardHeader icon={<Braces size={18} />} title={t('Конфиг матча', 'Match config')} subtitle={`match_${matchConfig.matchid}.json`} />
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={copyToClipboard} title={t('Копировать', 'Copy')} aria-label={t('Копировать', 'Copy')} className="p-2 rounded-xl border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={handleDownload} title={t('Скачать', 'Download')} aria-label={t('Скачать', 'Download')} className="p-2 rounded-xl border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all">
                  <Download size={14} />
                </button>
              </div>
            </div>
            <textarea
              value={jsonOutput}
              onChange={(e) => setJsonOutput(e.target.value)}
              placeholder={t('// Здесь появится конфиг матча', '// The match config will appear here')}
              className="w-full h-80 p-4 sm:px-6 font-mono text-xs text-primary/90 bg-black/40 outline-none resize-y leading-relaxed selection:bg-primary/20 placeholder:text-gray-700"
              spellCheck={false}
            />
            <p className="px-4 sm:px-6 py-3 text-[11px] text-gray-500 border-t border-gray-800/60">
              <Settings2 size={11} className="inline mr-1 -mt-0.5" />
              {t('Параметры формы сохраняются в этом браузере.', 'The form is saved in this browser.')}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

// Map tiles with the map pictures, as the Quatrix map cards
function MapTiles({ selected, onPick }: { selected: (map: string) => boolean; onPick: (map: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {MAPS.map((map) => {
        const on = selected(map)
        return (
          <button
            type="button"
            key={map}
            onClick={() => onPick(map)}
            className={cn('group relative aspect-[16/9] rounded-xl overflow-hidden border transition-all', on ? 'border-primary ring-2 ring-primary/50' : 'border-gray-800 hover:border-primary/50')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapImage(map)} alt="" className={cn('absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-110', on ? '' : 'opacity-50 grayscale')} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <span className={cn('absolute bottom-1.5 left-2 right-2 text-left text-[10px] font-bold uppercase truncate', on ? 'text-white' : 'text-gray-300')}>
              {stockMap(map)?.displayName ?? map}
            </span>
            {on && (
              <span className="absolute top-1.5 right-1.5 bg-primary rounded-full p-0.5 text-white">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'

function TeamPreview({ name, tag, team, align = 'left' }: { name: string; tag: string; team: 'team1' | 'team2'; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0 flex items-center gap-3 sm:gap-4', align === 'right' && 'flex-row-reverse text-right')}>
      <div className={cn('hidden sm:flex w-14 h-14 rounded-2xl border items-center justify-center text-lg font-black shrink-0', TEAM_CHIP[team])}>{initials(name)}</div>
      <div className={cn('min-w-0 flex flex-col gap-1.5', align === 'right' ? 'items-end' : 'items-start')}>
        <div className="max-w-full text-sm sm:text-2xl font-black tracking-tight leading-tight text-white line-clamp-2 break-words sm:truncate">{name}</div>
        {tag.trim() && <span className={cn('px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider', TEAM_CHIP[team])}>{tag}</span>}
      </div>
    </div>
  )
}

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</h3>
        {subtitle && <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// Quatrix design tokens, the same as on the Match page
const CARD = 'bg-card rounded-2xl border border-gray-800 shadow-2xl'
const BTN = 'inline-flex items-center justify-center gap-2 px-5 py-1.5 text-sm rounded-xl font-bold h-[38px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'
const LABEL = 'block text-xs font-bold text-gray-400 mb-2'
const INPUT = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600'
const TEAM_TEXT = { team1: 'text-sky-400', team2: 'text-amber-400' } as const
const TEAM_CHIP = { team1: 'bg-sky-500/10 text-sky-400 border-sky-500/30', team2: 'bg-amber-500/10 text-amber-400 border-amber-500/30' } as const

const optionClass = (selected: boolean) =>
  `py-3 rounded-xl border text-sm font-black tracking-wider transition-all active:scale-95 ${
    selected
      ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-blue-500/10'
      : 'bg-background/50 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
  }`
