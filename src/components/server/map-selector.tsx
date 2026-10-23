"use client"

import React from 'react'
import { Map as MapIcon, RotateCcw, Power, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { usePolling } from '@/lib/use-polling'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm'

const MAP_DATA: Record<string, { label: string }> = {
  'de_inferno': { label: 'Inferno' },
  'de_mirage': { label: 'Mirage' },
  'de_nuke': { label: 'Nuke' },
  'de_cache': { label: 'Cache' },
  'de_ancient': { label: 'Ancient' },
  'de_anubis': { label: 'Anubis' },
  'de_dust2': { label: 'Dust 2' }
}

const POPULAR_MAPS = Object.keys(MAP_DATA)

interface MapSelectorProps {
  serverId: number
  currentMap: string
  onChangeMap: (map: string) => Promise<string>
  onCommand: (command: string) => Promise<string>
}

export function MapSelector({ serverId, currentMap, onChangeMap, onCommand }: MapSelectorProps) {
  // null = still checking; true = a match is loaded on the server
  const [matchActive, setMatchActive] = React.useState<boolean | null>(null)
  const toast = useToast()
  const confirmDialog = useConfirm()

  // A loaded match owns the server: MatchZy decides the maps, and a manual change
  // here would kick everyone mid-match, so the buttons are locked while one is on.
  const loadMatchState = React.useCallback(async () => {
    try {
      const data = await api<{ status: unknown }>(`/api/servers/${serverId}/live`)
      setMatchActive(data.status !== null)
    } catch {
      setMatchActive(false)
    }
  }, [serverId])
  usePolling(loadMatchState, 5000)

  // After a server switch, re-check instead of trusting the previous server's state
  React.useEffect(() => { setMatchActive(null) }, [serverId])

  const run = async (label: string, action: () => Promise<string>) => {
    try {
      await action()
      toast.success(`${label}: выполнено`)
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`)
    }
  }

  const changeMap = async (map: string) => {
    if (matchActive) return
    const ok = await confirmDialog({
      title: 'Сменить карту?',
      description: `Сервер перезагрузится на карту ${map}, все игроки отключатся.`,
      confirmLabel: 'Сменить',
      destructive: true,
    })
    if (!ok) return
    await run(`Смена карты на ${map}`, () => onChangeMap(map))
  }

  const restartMap = async () => {
    if (matchActive) return
    if (!currentMap || currentMap === '---') {
      toast.error('Карта ещё не известна — подождите, пока сервер ответит')
      return
    }
    const ok = await confirmDialog({
      title: 'Перезапустить карту?',
      description: 'Текущая карта перезапустится, все игроки отключатся.',
      confirmLabel: 'Перезапустить',
      destructive: true,
    })
    if (!ok) return
    await run('Перезапуск карты', () => onChangeMap(currentMap))
  }

  return (
    <div className="p-3 md:p-6 space-y-6 h-full overflow-auto">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center text-white">
          <MapIcon className="mr-2 text-primary" />
          Карты
        </h3>
        <p className="text-sm text-muted-foreground">Смена карты на сервере. Во время матча карты меняет MatchZy - здесь только вне матча.</p>
      </div>

      {matchActive && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300 animate-in fade-in duration-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            На сервере идёт матч: карты и переходы между ними контролирует MatchZy, смена карты заблокирована.
            Если матч не нужен - остановите его во вкладке «Запуск».
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {POPULAR_MAPS.map((map) => (
          <button
            key={map}
            onClick={() => changeMap(map)}
            disabled={!!matchActive}
            className={`
              relative group overflow-hidden rounded-xl border transition-all h-24
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
              ${currentMap === map ? 'border-primary bg-primary/10' : 'border-border bg-white/5 hover:border-primary/50'}
              ${matchActive ? 'opacity-40 cursor-not-allowed' : ''}
            `}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-sm font-bold text-white uppercase tracking-wider">{MAP_DATA[map].label}</span>
              {currentMap === map && (
                <div className="text-[10px] text-primary font-bold mt-1">СЕЙЧАС</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex space-x-4 pt-6 border-t border-border">
        <Button
          variant="outline"
          onClick={restartMap}
          disabled={!!matchActive}
          className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Перезапустить карту
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => run('Разминка', () => onCommand('mp_warmup_start'))}>
          <Power className="mr-2 h-4 w-4" />
          Включить разминку
        </Button>
      </div>
    </div>
  )
}
