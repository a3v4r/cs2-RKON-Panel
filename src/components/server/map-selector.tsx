"use client"

import React from 'react'
import { RotateCcw, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

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
  currentMap: string
  onChangeMap: (map: string) => void
  onCommand: (command: string) => void
}

export function MapSelector({ currentMap, onChangeMap, onCommand }: MapSelectorProps) {
  const { t } = useT()
  return (
    <div className="p-3 md:p-6 space-y-6 h-full overflow-auto">
      <div>
        <p className="text-sm text-muted-foreground">{t('Смена карты на сервере. Во время матча карты меняет MatchZy - здесь только вне матча.', 'Change the map on the server. During a match MatchZy changes maps - use this only outside a match.')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {POPULAR_MAPS.map((map) => (
          <button
            key={map}
            onClick={() => onChangeMap(map)}
            className={`
              relative group overflow-hidden rounded-xl border transition-all h-24
              ${currentMap === map ? 'border-primary bg-primary/10' : 'border-border bg-white/5 hover:border-primary/50'}
            `}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-sm font-bold text-white uppercase tracking-wider">{MAP_DATA[map].label}</span>
              {currentMap === map && (
                <div className="text-[10px] text-primary font-bold mt-1">{t('СЕЙЧАС', 'CURRENT')}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="flex space-x-4 pt-6 border-t border-border">
        <Button variant="outline" className="flex-1" onClick={() => onChangeMap(currentMap)}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('Перезапустить карту', 'Restart map')}
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => onCommand('mp_warmup_start')}>
          <Power className="mr-2 h-4 w-4" />
          {t('Включить разминку', 'Start warmup')}
        </Button>
      </div>
    </div>
  )
}
