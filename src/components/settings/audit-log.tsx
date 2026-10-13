"use client"

import React from 'react'
import { ScrollText } from 'lucide-react'
import { api } from '@/lib/api'

interface AuditEntry {
  time: string
  who: string
  action: string
}

// Who did what and when (pauses, RCON commands, match loads, broadcast requests)
export function AuditLog() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([])
  React.useEffect(() => {
    api<AuditEntry[]>('/api/audit').then(setEntries).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
        <ScrollText className="mr-2" size={14} />
        Журнал действий
      </h3>
      <div className="max-h-80 overflow-auto rounded-xl border border-border bg-white/5 p-3 font-mono text-xs space-y-1">
        {entries.length === 0 && <div className="text-muted-foreground">Пока пусто</div>}
        {entries.map((e, i) => (
          <div key={i} className="break-words">
            <span className="text-muted-foreground">{new Date(e.time).toLocaleString('ru-RU')}</span>{' '}
            <span className="text-primary">{e.who}</span>{' '}
            <span className="text-white">{e.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
