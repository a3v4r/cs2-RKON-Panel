"use client"

import React, { useState } from 'react'
import { Users, Shield, Zap, Copy, Download, Map as MapIcon, ShieldOff, Trophy, Settings2, Braces, Check, CheckCircle2, AlertCircle, ListChecks, Swords } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'

interface MatchGeneratorProps {
  serverId: number;
  onStartMatch: (config: string) => Promise<void>;
  onLaunchMatch: (config: string, url: string) => Promise<void>;
  onStopMatch: () => Promise<void>;
}

const defaultMatchConfig = () => ({
  matchid: Math.floor(Date.now() / 1000) % 10000,
  team1: { name: "Команда 1", tag: "T1" },
  team2: { name: "Команда 2", tag: "T2" },
  maplist: ["de_mirage", "de_inferno", "de_dust2"],
  map_sides: ["team1_ct", "team2_ct", "knife"],
  num_maps: 1,
  players_per_team: 5,
  skip_veto: true
})

type MatchFormConfig = ReturnType<typeof defaultMatchConfig>

// The form survives tab switches and page reloads (phones reload background tabs), per server, in this browser.
const storageKey = (serverId: number) => `cs2panel.match.${serverId}`

function loadMatchConfig(serverId: number): MatchFormConfig {
  try {
    const saved = localStorage.getItem(storageKey(serverId))
    if (saved) {
      const config: MatchFormConfig = { ...defaultMatchConfig(), ...JSON.parse(saved) }
      // "standard" was offered by older versions but MatchZy rejects it in map_sides
      config.map_sides = config.map_sides.map((side) => (side === 'standard' ? 'knife' : side))
      return config
    }
  } catch {
    // storage unavailable (private mode): start from defaults
  }
  return defaultMatchConfig()
}

export function MatchGenerator({ serverId, onStartMatch, onLaunchMatch, onStopMatch }: MatchGeneratorProps) {
  const { t, lang } = useT()
  const [matchConfig, setMatchConfig] = useState<MatchFormConfig>(() => loadMatchConfig(serverId))

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

  const AVAILABLE_MAPS = [
    'de_inferno', 'de_mirage', 'de_nuke', 'de_cache', 
    'de_ancient', 'de_anubis', 'de_dust2'
  ]

  const generateJson = (matchid = matchConfig.matchid) => {
    const config = {
      matchid,
      team1: {
        name: matchConfig.team1.name,
        tag: matchConfig.team1.tag,
        players: {}
      },
      team2: {
        name: matchConfig.team2.name,
        tag: matchConfig.team2.tag,
        players: {}
      },
      num_maps: matchConfig.num_maps,
      // Veto: the whole pool goes to MatchZy and the captains ban/pick in game (sides too)
      ...(matchConfig.skip_veto
        ? {
            maplist: matchConfig.maplist.slice(0, matchConfig.num_maps),
            map_sides: matchConfig.map_sides.slice(0, matchConfig.num_maps),
            skip_veto: true,
          }
        : { maplist: AVAILABLE_MAPS, skip_veto: false }),
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

  const handleStartMatch = async () => {
    // Force regeneration to be 100% sure we have the latest visual settings
    const json = generateJson()
    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })
    try {
      await onStartMatch(json)
      setStatus({ type: 'success', message: t('Команда отправлена', 'Command sent') })
    } catch (error: any) {
      setStatus({ type: 'error', message: `${t('Ошибка', 'Error')}: ${error.message || t('неизвестная ошибка', 'unknown error')}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLaunchUrlMatch = async () => {
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
      setStatus({ type: 'success', message: t('Матч загружен на сервер', 'Match loaded on the server') })
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonOutput)
  }

  return (
    <div className="p-3 md:p-6 h-full flex flex-col gap-6 overflow-auto">
      {/* Toolbar, as the Quatrix page action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 bg-card rounded-2xl border border-gray-800 shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Trophy size={20} />
          </div>
          <p className="text-sm text-gray-400">{t('Матч уходит на сервер через MatchZy. Параметры сохраняются в этом браузере.', 'The match goes to the server through MatchZy. Settings are saved in this browser.')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleStopMatch}
            disabled={isLoading}
            className={`${BTN} flex-1 sm:flex-none bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20`}
          >
            <ShieldOff size={16} className="mr-2" />
            {t('Остановить', 'Stop')}
          </button>
          <button
            type="button"
            onClick={handleLaunchUrlMatch}
            disabled={isLoading}
            className={`${BTN} flex-1 sm:flex-none bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20`}
          >
            {isLoading ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                {t('Подождите...', 'Please wait...')}
              </>
            ) : (
              <>
                <Zap size={16} className="mr-2" /> {t('Запустить', 'Start')}
              </>
            )}
          </button>
        </div>
      </div>

      {status.message && (
        <div className="space-y-2">
          <div className={`p-4 rounded-xl text-sm font-medium flex items-start gap-2 border ${
            status.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
          }`}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:flex-1 lg:min-h-0">
        <ScrollArea className="lg:pr-4">
          <div className="space-y-6">
            {/* Format Selection */}
            <Section icon={<Shield size={18} />} title={t('Формат серии', 'Series format')}>
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 1, maplist: [matchConfig.maplist[0] || 'de_mirage']})}
                  className={optionClass(matchConfig.num_maps === 1)}
                >BO1</button>
                <button
                  type="button"
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 2, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno'
                  ]})}
                  className={optionClass(matchConfig.num_maps === 2)}
                >BO2</button>
                <button
                  type="button"
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 3, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno',
                    matchConfig.maplist[2] || 'de_dust2'
                  ]})}
                  className={optionClass(matchConfig.num_maps === 3)}
                >BO3</button>
                <button
                  type="button"
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 5, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno',
                    matchConfig.maplist[2] || 'de_dust2',
                    matchConfig.maplist[3] || 'de_nuke',
                    matchConfig.maplist[4] || 'de_cache'
                  ]})}
                  className={optionClass(matchConfig.num_maps === 5)}
                >BO5</button>
              </div>
            </Section>

            {/* Map Selection Slots */}
            <Section icon={<MapIcon size={18} />} title={t('Карты и стороны', 'Maps and sides')}>
              {!matchConfig.skip_veto && (
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(
                    `Вето в игре: капитаны банят и пикают из всех ${AVAILABLE_MAPS.length} карт командами в чате и сами выбирают стороны. Чтобы задать карты и стороны здесь, ниже выберите «Вето в игре: Нет».`,
                    `In-game veto: captains ban and pick from all ${AVAILABLE_MAPS.length} maps with chat commands and choose sides themselves. To set maps and sides here, choose "In-game veto: No" below.`,
                  )}
                </p>
              )}
              <div className={matchConfig.skip_veto ? "space-y-4" : "hidden"}>
                {Array.from({ length: matchConfig.num_maps }).map((_, i) => (
                  <div key={i} className="p-4 rounded-xl border border-gray-800 bg-background/50 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-black flex items-center justify-center">{i + 1}</span>
                        {t('Карта', 'Map')} {i + 1}
                      </span>
                      <select
                        value={matchConfig.map_sides[i]}
                        onChange={(e) => updateSideForSlot(i, e.target.value)}
                        className="max-w-full sm:max-w-[60%] truncate bg-background/50 border border-gray-800 rounded-xl px-3 py-2 text-xs text-primary font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                      >
                        <option value="knife">{t('Ножевой раунд', 'Knife round')}</option>
                        <option value="team1_ct">{team1Label} CT</option>
                        <option value="team1_t">{team1Label} T</option>
                        <option value="team2_ct">{team2Label} CT</option>
                        <option value="team2_t">{team2Label} T</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AVAILABLE_MAPS.map(map => {
                        const selected = matchConfig.maplist[i] === map
                        const image = MAP_IMAGES[map]
                        return (
                          <button
                            type="button"
                            key={map}
                            onClick={() => updateMapForSlot(i, map)}
                            className={`group relative aspect-[16/9] rounded-xl overflow-hidden border transition-all ${
                              selected ? 'border-primary ring-2 ring-primary/50' : 'border-gray-800 hover:border-primary/50'
                            }`}
                          >
                            {image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={image}
                                alt=""
                                className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${selected ? '' : 'opacity-50 grayscale'}`}
                              />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <span className={`absolute bottom-1.5 left-2 right-2 text-left text-[10px] font-bold truncate ${selected ? 'text-white' : 'text-gray-300'}`}>
                              {map.replace('de_', '').toUpperCase()}
                            </span>
                            {selected && (
                              <span className="absolute top-1.5 right-1.5 bg-primary rounded-full p-0.5 text-white">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Team 1 */}
            <Section icon={<Users size={18} />} title={t('Команда 1', 'Team 1')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>{t('Название', 'Name')}</label>
                  <input
                    value={matchConfig.team1.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team1: {...matchConfig.team1, name: e.target.value}})}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>{t('Тег', 'Tag')}</label>
                  <input
                    value={matchConfig.team1.tag}
                    onChange={(e) => setMatchConfig({...matchConfig, team1: {...matchConfig.team1, tag: e.target.value}})}
                    className={INPUT}
                  />
                </div>
              </div>
            </Section>

            {/* Team 2 */}
            <Section icon={<Users size={18} />} title={t('Команда 2', 'Team 2')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>{t('Название', 'Name')}</label>
                  <input
                    value={matchConfig.team2.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team2: {...matchConfig.team2, name: e.target.value}})}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>{t('Тег', 'Tag')}</label>
                  <input
                    value={matchConfig.team2.tag}
                    onChange={(e) => setMatchConfig({...matchConfig, team2: {...matchConfig.team2, tag: e.target.value}})}
                    className={INPUT}
                  />
                </div>
              </div>
            </Section>

            {/* Match Settings */}
            <Section icon={<Settings2 size={18} />} title={t('Дополнительно', 'Advanced')}>
              <label className={LABEL}>{t('Вето в игре?', 'In-game veto?')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { value: true, icon: <ListChecks size={18} />, label: t('Нет, карты и стороны задаю здесь', 'No, I set maps and sides here') },
                  { value: false, icon: <Swords size={18} />, label: t('Да, вето в игре', 'Yes, veto in game') },
                ]).map((opt) => {
                  const selected = matchConfig.skip_veto === opt.value
                  return (
                    <button
                      type="button"
                      key={String(opt.value)}
                      onClick={() => setMatchConfig({...matchConfig, skip_veto: opt.value})}
                      className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                        selected ? 'bg-primary/10 border-primary' : 'bg-background/50 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border ${
                        selected ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-gray-800/50 border-gray-700/50 text-gray-500'
                      }`}>
                        {opt.icon}
                      </span>
                      <span className={`flex-1 min-w-0 text-sm font-semibold ${selected ? 'text-white' : 'text-gray-400'}`}>{opt.label}</span>
                      <span className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? 'border-primary' : 'border-gray-700'}`}>
                        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Section>
          </div>
        </ScrollArea>

        {/* Output Preview, as the Quatrix console / config editor card */}
        <div className="flex flex-col h-full min-h-[320px] bg-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800 bg-[#0d1421]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Braces size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{t('Конфиг матча (JSON)', 'Match config (JSON)')}</p>
                <p className="text-[10px] text-gray-500 font-mono tracking-widest truncate">match_{matchConfig.matchid}.json</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={copyToClipboard}
                title={t('Копировать', 'Copy')}
                aria-label={t('Копировать', 'Copy')}
                className="p-2 rounded-xl border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                title={t('Скачать', 'Download')}
                aria-label={t('Скачать', 'Download')}
                className="p-2 rounded-xl border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                <Download size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex bg-black/40">
            <textarea
              value={jsonOutput}
              onChange={(e) => setJsonOutput(e.target.value)}
              placeholder={t('// Здесь появится конфиг матча', '// The match config will appear here')}
              className="flex-1 w-full min-h-[280px] p-4 md:p-6 font-mono text-xs text-primary/90 bg-transparent outline-none resize-none leading-relaxed selection:bg-primary/20 placeholder:text-gray-700 scrollbar-thin scrollbar-thumb-primary/20"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Quatrix design tokens used on this page
const BTN = 'flex items-center justify-center px-5 py-1.5 text-sm rounded-xl font-bold h-[34px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'
const LABEL = 'block text-sm font-medium text-gray-400 mb-2'
const INPUT = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600'

const optionClass = (selected: boolean) =>
  `py-3 rounded-xl border text-sm font-black tracking-wider transition-all active:scale-95 ${
    selected
      ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-blue-500/10'
      : 'bg-background/50 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
  }`

// Map tiles reuse the Map Explorer images; maps without one get a plain tile
const MAP_IMAGES: Record<string, string> = {
  de_dust2: '/images/maps/de_dust2.webp',
  de_mirage: '/images/maps/de_mirage.webp',
  de_inferno: '/images/maps/de_inferno.webp',
  de_nuke: '/images/maps/de_nuke_cs2.webp',
  de_ancient: '/images/maps/de_ancient.webp',
  de_anubis: '/images/maps/de_anubis.webp',
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-gray-800 shadow-2xl p-5 md:p-6">
      <h3 className="text-base font-bold text-white mb-5 flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </div>
  )
}
