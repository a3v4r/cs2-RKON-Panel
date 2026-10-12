"use client"

import React from 'react'
import { Users, Trash2, KeyRound, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ROLE_LABELS, Role } from '@/lib/api'

interface PanelUser {
  id: number
  username: string
  role: Role
  created_at: string
}

interface AuditEntry {
  time: string
  username: string
  role: string
  action: string
}

const ROLE_HINTS: Record<Role, string> = {
  admin: 'всё, включая серверы и пользователей',
  referee: 'матчи, паузы, откаты, консоль',
  broadcast: 'коннекты, счёт, пауза/продолжить',
}

export function UsersSettings() {
  const [users, setUsers] = React.useState<PanelUser[]>([])
  const [form, setForm] = React.useState({ username: '', password: '', role: 'referee' as Role })
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => {
    api<PanelUser[]>('/api/users').then(setUsers).catch((e) => setError(e.message))
  }, [])
  React.useEffect(load, [load])

  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const addUser = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      await api('/api/users', { body: form })
      setForm({ username: '', password: '', role: form.role })
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
        <Users className="mr-2" size={14} />
        Пользователи
      </h3>

      <div className="rounded-xl border border-border bg-white/5 divide-y divide-border">
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">admin</div>
            <div className="text-xs text-muted-foreground">Админ • пароль PANEL_PASSWORD из settings.ini, нельзя удалить</div>
          </div>
        </div>
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{u.username}</div>
              <div className="text-xs text-muted-foreground">{ROLE_HINTS[u.role]}</div>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={u.role}
                onChange={(e) => run(() => api(`/api/users/${u.id}`, { method: 'PUT', body: { role: e.target.value } }))}
                className="h-9 rounded-md border border-border bg-[#18181b] px-2 text-sm text-white"
                aria-label={`Роль ${u.username}`}
              >
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <Button
                variant="ghost" size="icon" className="h-9 w-9" title="Сменить пароль"
                onClick={() => {
                  const password = prompt(`Новый пароль для ${u.username}`)
                  if (password) run(() => api(`/api/users/${u.id}`, { method: 'PUT', body: { password } }))
                }}
              >
                <KeyRound size={16} />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-9 w-9 hover:text-destructive" title="Удалить"
                onClick={() => { if (confirm(`Удалить пользователя ${u.username}?`)) run(() => api(`/api/users/${u.id}`, { method: 'DELETE' })) }}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={addUser} className="rounded-xl border border-border bg-white/5 p-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Input
          placeholder="Логин" autoCapitalize="none" value={form.username} required
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="h-10 bg-black/30 border-border text-white"
        />
        <Input
          placeholder="Пароль" type="text" value={form.password} required
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="h-10 bg-black/30 border-border text-white"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          className="h-10 rounded-md border border-border bg-[#18181b] px-2 text-sm text-white"
          aria-label="Роль нового пользователя"
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <Button type="submit" className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground">Добавить</Button>
      </form>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

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
            <span className="text-primary">{e.username}</span>{' '}
            <span className="text-white">{e.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
