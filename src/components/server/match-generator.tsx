"use client"

import React, { useState } from 'react'
import { FileJson, Users, Shield, Zap, Copy, Check, Download, Map as MapIcon, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'
import { db_helper } from '@/lib/db'
import { copyText } from '@/lib/clipboard'
import { useConfirm } from '@/components/ui/confirm'

interface MatchGeneratorProps {
  serverId: number;
  onLaunchMatch: (config: string, url: string) => Promise<void>;
  onStopMatch: () => Promise<void>;
  // After a successful launch the natural next step is watching the score
  onOpenLiveTab: () => void;
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

export function MatchGenerator({ serverId, onLaunchMatch, onStopMatch, onOpenLiveTab }: MatchGeneratorProps) {
  const [matchConfig, setMatchConfig] = useState<MatchFormConfig>(() => loadMatchConfig(serverId))
  const [teams, setTeams] = useState<string[]>([])
  const confirmDialog = useConfirm()

  // Saved teams (the "Команды" tab) feed the dropdowns; the name fields stay free-form
  React.useEffect(() => {
    db_helper.getTeams().then(setTeams)
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey(serverId), JSON.stringify(matchConfig))
    } catch {
      // not critical
    }
  }, [serverId, matchConfig])

  // Side options show the team names typed below
  const team1Label = matchConfig.team1.name.trim() || 'Команда 1'
  const team2Label = matchConfig.team2.name.trim() || 'Команда 2'

  const [jsonOutput, setJsonOutput] = useState("")
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string, liveCta?: boolean }>({ type: 'idle', message: '' })
  const [isLoading, setIsLoading] = useState(false)

  React.useEffect(() => {
    generateJson();
  }, [matchConfig]);

  // Ending a series early cannot be undone, so it is always confirmed
  const handleStopMatch = async () => {
    const ok = await confirmDialog({
      title: 'Остановить матч?',
      description: 'Серия будет завершена досрочно. Игроки увидят конец матча, продолжить её будет нельзя.',
      confirmLabel: 'Остановить',
      destructive: true,
    })
    if (!ok) return
    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })
    try {
      await onStopMatch()
      setStatus({ type: 'success', message: 'Матч остановлен' })
    } catch (error: any) {
      setStatus({ type: 'error', message: `Не удалось остановить: ${error.message}` })
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
      setStatus({ type: 'success', message: 'Матч загружен на сервер', liveCta: true })
    } catch (error: any) {
      setStatus({ type: 'error', message: `Не удалось запустить: ${error.message}` })
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

  // Picking a saved team only fills its name; the tag stays as typed
  const pickTeam = (side: 'team1' | 'team2', name: string) => {
    if (!name) return;
    setMatchConfig(prev => ({ ...prev, [side]: { ...prev[side], name } }));
  }

  // The panel runs on plain http in the LAN: the clipboard API is unavailable there,
  // so copyText falls back to execCommand (a direct navigator.clipboard call silently did nothing)
  const copyToClipboard = async () => {
    try {
      await copyText(jsonOutput)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // rare; the config can still be downloaded or copied manually from the textarea
    }
  }

  return (
    <div className="p-3 md:p-6 h-full flex flex-col space-y-6 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
            <FileJson size={24} className="mr-2 text-primary" />
            Запуск матча
          </h2>
          <p className="text-sm text-muted-foreground">Матч уходит на сервер через MatchZy. Параметры сохраняются в этом браузере.</p>
        </div>
        <div className="flex space-x-2 items-center">
          <Button 
            onClick={handleStopMatch} 
            disabled={isLoading}
            variant="outline"
            className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
          >
            <ShieldOff size={16} className="mr-2" />
            Остановить
          </Button>
          <Button 
            onClick={handleLaunchUrlMatch} 
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6"
          >
            {isLoading ? "Подождите..." : <><Zap size={16} className="mr-2" /> Запустить</>}
          </Button>
        </div>
      </div>

      {status.message && (
        <div className="space-y-2">
          <div className={`p-3 rounded-lg text-xs font-bold flex items-center ${
            status.type === 'success' ? 'bg-green-500/20 text-green-500 border border-green-500/50' : 'bg-red-500/20 text-red-500 border border-red-500/50'
          }`}>
            {status.type === 'success' ? <Zap size={14} className="mr-2" /> : <Shield size={14} className="mr-2" />}
            {status.message}
          </div>
          {status.type === 'success' && status.liveCta && (
            <button
              onClick={onOpenLiveTab}
              className="self-start text-xs font-bold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            >
              Счёт и статистика - во вкладке «Матч» →
            </button>
          )}
          {status.type === 'error' && (
            <p className="text-[10px] text-muted-foreground px-1 italic">
              Если RCON не работает: скачайте конфиг (кнопка над JSON), положите его в папку <code className="text-primary">csgo</code> сервера и выполните в консоли сервера <code className="text-primary">matchzy_loadmatch имя_файла.json</code>.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <ScrollArea className="pr-4">
          <div className="space-y-6">
            {/* Format Selection */}
            <div className="p-4 rounded-xl border border-border bg-[#09090b]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-4 flex items-center">
                <Shield size={14} className="mr-2" />
                Формат серии
              </h3>
              <div className="flex space-x-4">
                <Button 
                  variant={matchConfig.num_maps === 1 ? "default" : "outline"}
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 1, maplist: [matchConfig.maplist[0] || 'de_mirage']})}
                  className="flex-1"
                >BO1</Button>
                <Button 
                  variant={matchConfig.num_maps === 2 ? "default" : "outline"}
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 2, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno'
                  ]})}
                  className="flex-1"
                >BO2</Button>
                <Button 
                  variant={matchConfig.num_maps === 3 ? "default" : "outline"}
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 3, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno',
                    matchConfig.maplist[2] || 'de_dust2'
                  ]})}
                  className="flex-1"
                >BO3</Button>
                <Button 
                  variant={matchConfig.num_maps === 5 ? "default" : "outline"}
                  onClick={() => setMatchConfig({...matchConfig, num_maps: 5, maplist: [
                    matchConfig.maplist[0] || 'de_mirage',
                    matchConfig.maplist[1] || 'de_inferno',
                    matchConfig.maplist[2] || 'de_dust2',
                    matchConfig.maplist[3] || 'de_nuke',
                    matchConfig.maplist[4] || 'de_cache'
                  ]})}
                  className="flex-1"
                >BO5</Button>
              </div>
            </div>

            {/* Map Selection Slots */}
            <div className="p-4 rounded-xl border border-border bg-[#09090b]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 flex items-center">
                <MapIcon size={14} className="mr-2" />
                Карты и стороны
              </h3>
              {!matchConfig.skip_veto && (
                <p className="text-xs text-muted-foreground">
                  Вето в игре: капитаны банят и пикают из всех {AVAILABLE_MAPS.length} карт командами в чате и сами выбирают стороны.
                  Чтобы задать карты и стороны здесь, ниже выберите «Вето в игре: Нет».
                </p>
              )}
              <div className={matchConfig.skip_veto ? "space-y-6" : "hidden"}>
                {Array.from({ length: matchConfig.num_maps }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border/50 bg-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Карта {i + 1}</span>
                      <select 
                        value={matchConfig.map_sides[i]}
                        onChange={(e) => updateSideForSlot(i, e.target.value)}
                        className="max-w-[60%] truncate bg-[#18181b] border border-border rounded px-2 py-1 text-[10px] text-primary font-bold outline-none"
                      >
                        <option value="knife">Ножевой раунд</option>
                        <option value="team1_ct">{team1Label} CT</option>
                        <option value="team1_t">{team1Label} T</option>
                        <option value="team2_ct">{team2Label} CT</option>
                        <option value="team2_t">{team2Label} T</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AVAILABLE_MAPS.map(map => (
                        <button
                          key={map}
                          onClick={() => updateMapForSlot(i, map)}
                          className={`
                            px-2 py-1.5 rounded-md text-[10px] font-bold border transition-all
                            ${matchConfig.maplist[i] === map 
                              ? 'bg-primary/20 border-primary text-primary' 
                              : 'bg-white/5 border-border text-muted-foreground hover:border-white/20'}
                          `}
                        >
                          {map.replace('de_', '').toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team 1 */}
            <div className="p-4 rounded-xl border border-border bg-[#09090b]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 flex items-center">
                <Users size={14} className="mr-2" />
                Команда 1
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs text-muted-foreground">Выбрать из списка</label>
                  <select
                    value={teams.includes(matchConfig.team1.name) ? matchConfig.team1.name : ''}
                    onChange={(e) => pickTeam('team1', e.target.value)}
                    disabled={teams.length === 0}
                    className="w-full bg-[#18181b] border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {teams.length > 0 ? 'Своё название (впишите ниже)' : 'Список пуст — вкладка «Команды»'}
                    </option>
                    {teams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Название</label>
                  <input 
                    value={matchConfig.team1.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team1: {...matchConfig.team1, name: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Тег</label>
                  <input 
                    value={matchConfig.team1.tag}
                    onChange={(e) => setMatchConfig({...matchConfig, team1: {...matchConfig.team1, tag: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* Team 2 */}
            <div className="p-4 rounded-xl border border-border bg-[#09090b]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-4 flex items-center">
                <Users size={14} className="mr-2" />
                Команда 2
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs text-muted-foreground">Выбрать из списка</label>
                  <select
                    value={teams.includes(matchConfig.team2.name) ? matchConfig.team2.name : ''}
                    onChange={(e) => pickTeam('team2', e.target.value)}
                    disabled={teams.length === 0}
                    className="w-full bg-[#18181b] border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                  >
                    <option value="">
                      {teams.length > 0 ? 'Своё название (впишите ниже)' : 'Список пуст — вкладка «Команды»'}
                    </option>
                    {teams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Название</label>
                  <input 
                    value={matchConfig.team2.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team2: {...matchConfig.team2, name: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Тег</label>
                  <input 
                    value={matchConfig.team2.tag}
                    onChange={(e) => setMatchConfig({...matchConfig, team2: {...matchConfig.team2, tag: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* Match Settings */}
            <div className="p-4 rounded-xl border border-border bg-[#09090b]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white mb-4 flex items-center">
                <Shield size={14} className="mr-2" />
                Дополнительно
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Вето в игре?</label>
                  <select 
                    value={matchConfig.skip_veto ? "true" : "false"}
                    onChange={(e) => setMatchConfig({...matchConfig, skip_veto: e.target.value === "true"})}
                    className="w-full bg-[#18181b] border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="true">Нет, карты и стороны задаю здесь</option>
                    <option value="false">Да, вето в игре</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Output Preview */}
        <div className="flex flex-col h-full bg-[#09090b] border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-border bg-white/5">
            <span className="text-xs font-bold text-muted-foreground tracking-widest uppercase">Конфиг матча (JSON)</span>
            <div className="flex space-x-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard} title="Скопировать конфиг">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                <Download size={14} />
              </Button>
            </div>
          </div>
          <textarea
            value={jsonOutput}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            placeholder="// Здесь появится конфиг матча"
            className="flex-1 w-full h-full p-4 font-mono text-xs text-primary bg-black/30 outline-none resize-none scrollbar-thin scrollbar-thumb-primary/20"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}
