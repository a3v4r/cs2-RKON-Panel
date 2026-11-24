"use client"

import React from 'react'
import { Clock, Plus, Upload, Database, RefreshCw, Download, Trash2, Loader2, X, RefreshCcw, ToggleLeft, ToggleRight, Search, ChevronDown, Check, Archive, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

type Scope = 'panel' | 'cs2'

interface Backup {
  id: string
  scope: Scope
  filename: string
  type: 'manual' | 'auto' | 'upload'
  size: number
  createdAt: string
}

interface Schedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string
  keep: number
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const btn = 'flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]'

export function BackupsView() {
  const { t, locale } = useT()
  const [scope, setScope] = React.useState<Scope>('panel')
  const [backups, setBackups] = React.useState<Backup[] | null>(null)
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const scopes: { value: Scope; label: string }[] = [
    { value: 'panel', label: t('Данные панели', 'Panel data') },
    { value: 'cs2', label: t('Конфиги CS2 (cfg, MatchZy)', 'CS2 configs (cfg, MatchZy)') },
  ]

  const notify = (ok: boolean, text: string) => {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 4000)
  }

  const load = React.useCallback(() => {
    setBackups(null)
    api<Backup[]>(`/api/backups/${scope}`).then(setBackups).catch(() => setBackups([]))
  }, [scope])
  React.useEffect(load, [load])

  const create = async () => {
    if (!confirm(t('Создать бэкап сейчас?', 'Create a backup now?'))) return
    setBusy('create')
    try {
      await api(`/api/backups/${scope}`, { body: {} })
      notify(true, t('Бэкап создан', 'Backup created'))
      load()
    } catch (e) {
      notify(false, (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const restore = async (b: Backup) => {
    const text = scope === 'panel'
      ? t(`Восстановить данные панели из «${b.filename}»? Текущие серверы, шаблоны и настройки заменятся данными из бэкапа.`, `Restoring from '${b.filename}' will overwrite the panel data (servers, templates, settings). Do you want to continue?`)
      : t(`Восстановить конфиги CS2 из «${b.filename}»? Текущие файлы конфигов будут перезаписаны. Серверы из панели должны быть остановлены.`, `Restoring from '${b.filename}' will overwrite current configuration files. The server should be stopped during this process. Do you want to continue?`)
    if (!confirm(text)) return
    setBusy(b.id)
    try {
      await api(`/api/backups/file/${b.id}`, { body: {} })
      notify(true, t('Восстановлено', 'Restore completed'))
      if (scope === 'panel') setTimeout(() => location.reload(), 800)
    } catch (e) {
      notify(false, (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (b: Backup) => {
    if (!confirm(t('Удалить этот бэкап насовсем? Это нельзя отменить.', 'Are you sure you want to permanently delete this backup file? This action cannot be undone.'))) return
    try {
      await api(`/api/backups/file/${b.id}`, { method: 'DELETE' })
      notify(true, t('Бэкап удалён', 'Backup file deleted successfully'))
      load()
    } catch (e) {
      notify(false, (e as Error).message)
    }
  }

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setBusy('upload')
    try {
      const form = new FormData()
      form.append('backup', file)
      const res = await fetch(`/api/backups/${scope}`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('Не удалось загрузить бэкап', 'Failed to upload backup'))
      notify(true, t('Бэкап загружен', 'Backup uploaded'))
      load()
    } catch (err) {
      notify(false, (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const q = search.toLowerCase()
  const shown = (backups ?? []).filter((b) => b.filename.toLowerCase().includes(q))
  const typeLabel = (type: Backup['type']) => type === 'auto' ? t('Авто', 'Auto') : type === 'upload' ? t('Загружен', 'Upload') : t('Вручную', 'Manual')

  return (
    <div className="p-3 md:p-6 space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <button onClick={() => setScheduleOpen(true)} className={cn(btn, 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50')}>
          <Clock size={16} />{t('Расписание бэкапов', 'Automated Backup Schedule')}
        </button>
        <button onClick={create} disabled={!!busy} className={cn(btn, 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20')}>
          {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{t('Создать бэкап', 'Create Backup')}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={cn(btn, 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20')}>
          {busy === 'upload' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{t('Загрузить архив', 'Upload External')}
        </button>
        <input type="file" ref={fileRef} onChange={upload} accept=".zip" className="hidden" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ScopeSelect value={scope} options={scopes} onChange={setScope} />
        <div className="relative group lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Поиск по имени файла...', 'Filter backups by filename or comment...')}
            className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
          />
        </div>
      </div>

      {backups === null ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-900/50 backdrop-blur-sm border border-white/5 rounded-2xl">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-gray-400 animate-pulse">{t('Загрузка...', 'Loading...')}</p>
        </div>
      ) : shown.length > 0 ? (
        <div className="overflow-x-auto bg-gray-900/40 backdrop-blur-md border border-white/5 rounded-2xl">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">{t('Файл', 'Filename')}</th>
                <th className="px-6 py-4 font-semibold">{t('Тип', 'Type')}</th>
                <th className="px-6 py-4 font-semibold">{t('Размер', 'Size')}</th>
                <th className="px-6 py-4 font-semibold">{t('Дата создания', 'Creation Date')}</th>
                <th className="px-12 py-4 font-semibold text-right">{t('Действия', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((b) => (
                <tr key={b.id} className="group hover:bg-white/5 transition-colors duration-200">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary"><Database size={18} /></div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-white truncate">{b.filename}</span>
                        <span className="text-xs text-gray-500 truncate">{scopes.find((s) => s.value === b.scope)?.label}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                      b.type === 'auto' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : b.type === 'upload' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    )}>{typeLabel(b.type)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300 tabular-nums">{formatSize(b.size)}</td>
                  <td className="px-6 py-4 text-sm text-gray-300">{new Date(b.createdAt).toLocaleString(locale)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => restore(b)}
                        disabled={!!busy}
                        className="flex items-center gap-2 h-8 px-3 text-xs rounded-xl font-bold bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all active:scale-95 disabled:opacity-50"
                      >
                        {busy === b.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {t('Восстановить', 'Restore from this backup')}
                      </button>
                      <a
                        href={`/api/backups/file/${b.id}`}
                        className="flex items-center justify-center h-8 w-8 rounded-xl bg-gray-800 hover:bg-gray-700 text-white border border-white/10 hover:border-primary/50 transition-all"
                        title={t('Скачать', 'Download')}
                      >
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => remove(b)}
                        className="flex items-center justify-center h-8 w-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                        title={t('Удалить', 'Delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 bg-gray-900/30 backdrop-blur-sm border border-dashed border-white/10 rounded-3xl text-center px-4">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6"><Database className="w-10 h-10 text-gray-600" /></div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('Бэкапов нет', 'No Backups Found')}</h3>
          <p className="text-gray-500 max-w-sm">{t('Вы ещё не создавали бэкапы этого типа.', "You haven't created any backups of this kind yet.")}</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card ${toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}

      {scheduleOpen && <ScheduleModal onClose={() => setScheduleOpen(false)} onSaved={() => notify(true, t('Расписание сохранено', 'Schedule saved'))} />}
    </div>
  )
}

function ScopeSelect({ value, options, onChange }: { value: Scope; options: { value: Scope; label: string }[]; onChange: (v: Scope) => void }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const selected = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="relative w-full text-left">
      <button
        onClick={() => setOpen(!open)}
        className={cn('w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-1.5 flex items-center justify-between cursor-pointer transition-all hover:border-gray-700 outline-none', open && 'ring-2 ring-primary border-transparent')}
      >
        <span className="flex items-center gap-2 truncate">
          <Archive className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="truncate text-sm font-medium text-gray-200">{selected?.label}</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-[100] w-full mt-2 bg-background border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          {options.map((o) => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={cn('px-4 py-2 text-xs cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors', value === o.value ? 'text-primary bg-primary/5 font-bold' : 'text-gray-300')}
            >
              <span className="truncate">{o.label}</span>
              {value === o.value && <Check className="w-4 h-4" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const [s, setS] = React.useState<Schedule | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => { api<Schedule>('/api/backups/schedule').then(setS).catch((e) => setError((e as Error).message)) }, [])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      setS(await api<Schedule>('/api/backups/schedule', { method: 'PUT', body: s }))
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const period = s?.frequency === 'weekly' ? t('по воскресеньям', 'on Sundays') : s?.frequency === 'monthly' ? t('первого числа каждого месяца', 'on the first day of the month') : t('каждый день', 'every day')
  const inputCls = 'w-full bg-[#0c1424] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-gray-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Clock className="w-6 h-6" /></div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">{t('Расписание бэкапов', 'Scheduled Backup')}</h3>
              <p className="text-xs text-gray-500 font-medium tracking-wide uppercase mt-0.5">{t('Настройка и автоматизация', 'Configuration & Automation')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all" aria-label={t('Закрыть', 'Close')}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-8 space-y-6">
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
          {!s ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <RefreshCcw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-gray-400 text-sm font-medium">{t('Загрузка...', 'Loading...')}</p>
            </div>
          ) : (
            <>
              <div
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${s.enabled ? 'bg-primary/5 border-primary/20 shadow-lg shadow-primary/5' : 'bg-[#0c1424] border-gray-800 hover:border-gray-700'}`}
                onClick={() => setS({ ...s, enabled: !s.enabled })}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg transition-colors ${s.enabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-gray-500'}`}>
                    {s.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Автоматический бэкап', 'Automatic Backup')}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{t('Данные панели и конфиги CS2 по расписанию', 'Automatically backup the system at specific intervals')}</p>
                  </div>
                </div>
                <div className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${s.enabled ? 'bg-primary' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${s.enabled ? 'translate-x-6' : ''}`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><RefreshCcw className="w-3 h-3 text-primary" />{t('Периодичность', 'Backup Frequency')}</label>
                  <select value={s.frequency} disabled={!s.enabled} onChange={(e) => setS({ ...s, frequency: e.target.value as Schedule['frequency'] })} className={inputCls}>
                    <option value="daily">{t('Каждый день', 'Every Day (Daily)')}</option>
                    <option value="weekly">{t('Раз в неделю (вс)', 'Weekly (Sunday)')}</option>
                    <option value="monthly">{t('Раз в месяц (1-е число)', 'Monthly (1st of month)')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-3 h-3 text-primary" />{t('Время', 'Backup Time')}</label>
                  <input type="time" value={s.time} disabled={!s.enabled} onChange={(e) => setS({ ...s, time: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><Database className="w-3 h-3 text-primary" />{t('Хранить последних', 'Retention Limit')}</label>
                <input type="number" min={1} max={100} value={s.keep} disabled={!s.enabled} onChange={(e) => setS({ ...s, keep: Number(e.target.value) })} className={inputCls} />
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                {s.enabled
                  ? t(`Бэкапы будут создаваться автоматически ${period} в ${s.time}.`, `Backups will be taken automatically ${period} at ${s.time}.`)
                  : t('Автоматический бэкап выключен. Включите переключатель выше, чтобы настроить.', 'Automatic backup is currently disabled. Toggle the switch above to configure settings.')}
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-all">{t('Отмена', 'Cancel')}</button>
                <button onClick={save} disabled={saving} className={cn(btn, 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20')}>
                  {saving && <Loader2 size={16} className="animate-spin" />}{t('Сохранить', 'Save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
