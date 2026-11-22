"use client"

import React from 'react'
import { RefreshCw, Search, Calendar, Lock, Trash2, X, UserPlus, Shield, Radio, Loader2, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

// User Management, laid out as the Quatrix Users page (table + modal). Instead of permission checkboxes a user
// has one of the two panel roles; new users are added here by a referee (no open registration).

type Role = 'judge' | 'broadcast'

interface User {
  id: number
  username: string
  role: Role
  created_at: string
  last_login?: string
}

interface UsersResponse {
  users: User[]
  shared: { username: string; role: Role; enabled: boolean }[]
  me: string | null
}

const field = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600'

export function UsersView() {
  const { t, locale } = useT()
  const [data, setData] = React.useState<UsersResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [editing, setEditing] = React.useState<User | 'new' | null>(null)
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null)

  const notify = (ok: boolean, text: string) => {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 3500)
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try { setData(await api<UsersResponse>('/api/users')) } catch (e) { notify(false, (e as Error).message) } finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load() }, [load])

  const remove = async (u: User) => {
    if (!confirm(t(`Удалить пользователя «${u.username}»?`, `Are you sure you want to delete user "${u.username}"?`))) return
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' })
      notify(true, t('Пользователь удалён', 'User deleted'))
      load()
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось удалить', 'Delete failed'))
    }
  }

  const roleLabel = (r: Role) => (r === 'judge' ? t('Судья', 'Referee') : t('Трансляция', 'Broadcast'))
  const q = search.trim().toLowerCase()
  const users = (data?.users ?? []).filter((u) => u.username.toLowerCase().includes(q))
  const shared = (data?.shared ?? []).filter((u) => u.username.includes(q))
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '---')

  return (
    <div className="p-3 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6 md:justify-end">
        <div className="relative group flex-1 min-w-[180px] sm:flex-none sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Поиск пользователей...', 'Search users...')}
            className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
          />
        </div>
        <button
          onClick={load}
          className="flex items-center justify-center transition-all active:scale-95 group p-2 rounded-xl w-[34px] h-[34px] shrink-0 bg-card border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary shadow-xl"
          title={t('Обновить', 'Refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin text-primary')} />
        </button>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center justify-center gap-2 whitespace-nowrap transition-all bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95 px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]"
        >
          <UserPlus size={16} />
          {t('Добавить пользователя', 'Add User')}
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="bg-[#1d1d1d]/30 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                <th className="px-6 py-4 border-b border-gray-800/50">{t('Пользователь', 'User')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-center">{t('Роль', 'Role')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('Добавлен', 'Joined At')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50">{t('Последний вход', 'Last Login')}</th>
                <th className="px-6 py-4 border-b border-gray-800/50 text-right">{t('Действия', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {!data ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Загрузка...', 'Loading...')}</td></tr>
              ) : (
                <>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary shrink-0">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">
                              {u.username}
                              {data.me === u.username && <span className="ml-2 text-[10px] text-primary font-black uppercase">{t('это вы', 'you')}</span>}
                            </p>
                            <p className="text-[10px] text-gray-500 uppercase font-black">ID: {u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center"><RoleBadge role={u.role} label={roleLabel(u.role)} /></td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2 text-xs text-gray-400"><Calendar size={12} />{date(u.created_at)}</div></td>
                      <td className="px-6 py-4 text-xs text-gray-400">{u.last_login ? new Date(u.last_login).toLocaleString(locale) : t('ещё не входил', 'never')}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditing(u)} className="flex items-center justify-center p-2 rounded-xl w-[34px] h-[34px] text-blue-400 hover:bg-blue-500/10 transition-all active:scale-95" title={t('Роль и пароль', 'Edit Role & Password')}>
                            <Lock size={14} />
                          </button>
                          {data.me !== u.username && (
                            <button onClick={() => remove(u)} className="flex items-center justify-center p-2 rounded-xl w-[34px] h-[34px] text-red-400 hover:bg-red-500/10 transition-all active:scale-95" title={t('Удалить пользователя', 'Delete User')}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shared.map((u) => (
                    <tr key={u.username} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-gray-400 shrink-0">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{u.username}</p>
                            <p className="text-[10px] text-gray-500 uppercase font-black">{t('общий аккаунт кита', 'shared kit account')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center"><RoleBadge role={u.role} label={roleLabel(u.role)} /></td>
                      <td className="px-6 py-4 text-xs text-gray-500" colSpan={2}>
                        {u.enabled
                          ? t('Пароль задаётся в matchdesk.ini рядом с Matchdesk.exe', 'Password is set in matchdesk.ini next to Matchdesk.exe')
                          : t('Выключен: в settings.ini нет пароля', 'Off: no password in settings.ini')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn('text-[10px] font-black uppercase tracking-widest', u.enabled ? 'text-green-500' : 'text-gray-500')}>
                          {u.enabled ? t('Включён', 'Enabled') : t('Выключен', 'Off')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && shared.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 text-sm">{t('Пользователи не найдены.', 'No users found.')}</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card ${toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}

      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          isMe={editing !== 'new' && data?.me === editing.username}
          onClose={() => setEditing(null)}
          onSaved={(text) => { notify(true, text); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function RoleBadge({ role, label }: { role: Role; label: string }) {
  return (
    <div className="flex justify-center">
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-wider',
        role === 'judge' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      )}>
        {role === 'judge' ? <Shield size={12} /> : <Radio size={12} />}
        {label}
      </span>
    </div>
  )
}

function UserModal({ user, isMe, onClose, onSaved }: { user: User | null; isMe: boolean; onClose: () => void; onSaved: (text: string) => void }) {
  const { t } = useT()
  const [username, setUsername] = React.useState(user?.username ?? '')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<Role>(user?.role ?? 'judge')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (user) {
        await api(`/api/users/${user.id}`, { method: 'PUT', body: { role, ...(password ? { password } : {}) } })
        onSaved(t('Пользователь обновлён', 'User updated'))
      } else {
        await api('/api/users', { body: { username, password, role } })
        onSaved(t('Пользователь добавлен', 'User added'))
      }
    } catch (err) {
      setError((err as Error).message || t('Не удалось сохранить', 'Update failed'))
    } finally {
      setSaving(false)
    }
  }

  const roles: { value: Role; title: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'judge', title: t('Судья', 'Referee'), desc: t('Всё: серверы, матчи, паузы, откаты, консоль, настройки', 'Everything: servers, matches, pauses, restores, console, settings'), icon: <Shield size={16} /> },
    { value: 'broadcast', title: t('Трансляция', 'Broadcast'), desc: t('Счёт, connect и запросы паузы судьям', 'Score, connect and pause requests to referees'), icon: <Radio size={16} /> },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <form onSubmit={save} className="w-full max-w-md bg-popover rounded-2xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">{user ? <Lock size={20} /> : <UserPlus size={20} />}</div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">{user ? t('Роль и пароль', 'Role & Password') : t('Новый пользователь', 'New User')}</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{user ? t(`Пользователь ${user.username}`, `Managing ${user.username}`) : t('Личный аккаунт', 'Personal account')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5" aria-label={t('Закрыть', 'Close')}><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</div>}
          {!user && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Логин', 'Username')}</label>
              <input className={field} required autoFocus autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">{user ? t('Новый пароль', 'New password') : t('Пароль', 'Password')}</label>
            <input className={field} type="password" autoComplete="new-password" required={!user} minLength={6} placeholder={user ? t('не менять', 'leave empty to keep') : ''} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            {roles.map((r) => (
              <label key={r.value} className={cn('flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all group', role === r.value ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/5 hover:bg-white/[0.08]', isMe && r.value !== 'judge' && 'opacity-40 cursor-not-allowed')}>
                <span className="flex items-center gap-3">
                  <span className="text-primary">{r.icon}</span>
                  <span>
                    <span className="block text-xs font-semibold text-gray-200">{r.title}</span>
                    <span className="block text-[10px] text-gray-500">{r.desc}</span>
                  </span>
                </span>
                <input type="radio" name="role" checked={role === r.value} disabled={isMe && r.value !== 'judge'} onChange={() => setRole(r.value)} className="w-4 h-4 accent-[#1890ff]" />
              </label>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-gray-800 bg-gray-900/40 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2 text-sm rounded-xl font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 transition-all">{t('Отмена', 'Cancel')}</button>
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-xl font-bold bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('Сохранить', 'Save')}
          </button>
        </div>
      </form>
    </div>
  )
}
