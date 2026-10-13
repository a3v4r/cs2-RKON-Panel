"use client"

import React, { useState } from 'react'
import { FileJson, Send, Users, Shield, Zap, Copy, Download, Map as MapIcon, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'

interface MatchGeneratorProps {
  serverId: number;
  onStartMatch: (config: string) => Promise<void>;
  onLaunchMatch: (config: string, url: string) => Promise<void>;
  onStopMatch: () => Promise<void>;
}

const defaultMatchConfig = () => ({
  matchid: Math.floor(Date.now() / 1000) % 10000,
  team1: { name: "Team 1", tag: "T1" },
  team2: { name: "Team 2", tag: "T2" },
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
    if (saved) return { ...defaultMatchConfig(), ...JSON.parse(saved) }
  } catch {
    // storage unavailable (private mode): start from defaults
  }
  return defaultMatchConfig()
}

export function MatchGenerator({ serverId, onStartMatch, onLaunchMatch, onStopMatch }: MatchGeneratorProps) {
  const [matchConfig, setMatchConfig] = useState<MatchFormConfig>(() => loadMatchConfig(serverId))

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey(serverId), JSON.stringify(matchConfig))
    } catch {
      // not critical
    }
  }, [serverId, matchConfig])

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
      setStatus({ type: 'success', message: 'Match stopped/unloaded!' })
    } catch (error: any) {
      setStatus({ type: 'error', message: `Failed to stop: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const AVAILABLE_MAPS = [
    'de_inferno', 'de_mirage', 'de_nuke', 'de_cache', 
    'de_ancient', 'de_anubis', 'de_dust2'
  ]

  const generateJson = () => {
    const config = {
      matchid: matchConfig.matchid,
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
      maplist: matchConfig.maplist.slice(0, matchConfig.num_maps),
      map_sides: matchConfig.map_sides.slice(0, matchConfig.num_maps),
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
      setStatus({ type: 'success', message: 'Match command sent successfully!' })
    } catch (error: any) {
      setStatus({ type: 'error', message: `Failed: ${error.message || 'Unknown error'}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLaunchUrlMatch = async () => {
    // Force regeneration to be 100% sure we have the latest visual settings
    const json = generateJson()
    if (!json.trim()) return;

    setIsLoading(true)
    setStatus({ type: 'idle', message: '' })
    try {
      // 1. Host the JSON on the panel server, 2. get the URL the game server can reach it at
      const { url: configUrl } = await api<{ url: string }>('/api/matches/config', { body: { config: json, serverId } });

      // 3. Launch via RCON
      await onLaunchMatch(json, configUrl)
      setStatus({ type: 'success', message: 'Match launched successfully via URL!' })
    } catch (error: any) {
      setStatus({ type: 'error', message: `URL Launch failed: ${error.message}` })
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
    <div className="p-3 md:p-6 h-full flex flex-col space-y-6 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
            <FileJson size={24} className="mr-2 text-primary" />
            MatchZy Config Generator
          </h2>
          <p className="text-sm text-muted-foreground">Automatic knife round logic: BO1 (Yes), BO3 (Map 3 only).</p>
        </div>
        <div className="flex space-x-2 items-center">
          <Button 
            onClick={handleStopMatch} 
            disabled={isLoading}
            variant="outline"
            className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
          >
            <ShieldOff size={16} className="mr-2" />
            Stop
          </Button>
          <Button 
            onClick={handleLaunchUrlMatch} 
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6"
          >
            {isLoading ? "Wait..." : <><Zap size={16} className="mr-2" /> Запустить (URL)</>}
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
          {status.type === 'error' && (
            <p className="text-[10px] text-muted-foreground px-1 italic">
              Note: If RCON fails, download the config and save it manually to <code className="text-primary">csgo/cfg/matchzy/</code> on the server.
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
                Series Format
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
                Map Selection & Sides
              </h3>
              <div className="space-y-6">
                {Array.from({ length: matchConfig.num_maps }).map((_, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border/50 bg-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Map {i + 1}</span>
                      <select 
                        value={matchConfig.map_sides[i]}
                        onChange={(e) => updateSideForSlot(i, e.target.value)}
                        className="bg-[#18181b] border border-border rounded px-2 py-1 text-[10px] text-primary font-bold outline-none"
                      >
                        <option value="knife">Knife Round</option>
                        <option value="team1_ct">Team 1 CT</option>
                        <option value="team1_t">Team 1 T</option>
                        <option value="team2_ct">Team 2 CT</option>
                        <option value="team2_t">Team 2 T</option>
                        <option value="standard">Standard</option>
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
                Team 1
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Team Name</label>
                  <input 
                    value={matchConfig.team1.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team1: {...matchConfig.team1, name: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Tag</label>
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
                Team 2
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Team Name</label>
                  <input 
                    value={matchConfig.team2.name}
                    onChange={(e) => setMatchConfig({...matchConfig, team2: {...matchConfig.team2, name: e.target.value}})}
                    className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Tag</label>
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
                Additional Options
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Skip Veto?</label>
                  <select 
                    value={matchConfig.skip_veto ? "true" : "false"}
                    onChange={(e) => setMatchConfig({...matchConfig, skip_veto: e.target.value === "true"})}
                    className="w-full bg-[#18181b] border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No (Veto)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Output Preview */}
        <div className="flex flex-col h-full bg-[#09090b] border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-border bg-white/5">
            <span className="text-xs font-bold text-muted-foreground tracking-widest uppercase">Output Preview</span>
            <div className="flex space-x-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard}>
                <Copy size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                <Download size={14} />
              </Button>
            </div>
          </div>
          <textarea
            value={jsonOutput}
            onChange={(e) => setJsonOutput(e.target.value)}
            placeholder="// Click 'Generate JSON' to see preview or paste your own"
            className="flex-1 w-full h-full p-4 font-mono text-xs text-primary bg-black/30 outline-none resize-none scrollbar-thin scrollbar-thumb-primary/20"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}
