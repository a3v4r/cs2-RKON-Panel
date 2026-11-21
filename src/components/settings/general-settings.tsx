"use client"

import React from 'react'
import { Info, FolderCog, CheckCircle2, AlertTriangle } from 'lucide-react'
import { AuditLog } from '@/components/settings/audit-log'
import { db_helper } from '@/lib/db'
import { useT } from '@/lib/i18n'

export function GeneralSettings() {
  const { t } = useT()
  return (
    <div className="p-3 md:p-6 max-w-3xl space-y-8">

      <div className="space-y-6">
        <Cs2Folder />

        <AuditLog />

        {/* About */}
        <div className="pt-6 border-t border-border">
          <div className="flex items-center space-x-2 text-muted-foreground mb-4">
            <Info size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">{t('О панели', 'About')}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Matchdesk, {t('версия', 'version')} {process.env.NEXT_PUBLIC_PANEL_VERSION}</p>
            <p className="mt-1">{t('Логины и пароли задаются в settings.ini турнирного комплекта.', 'Logins and passwords are set in settings.ini of the tournament kit.')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Where the CS2 dedicated server is installed: servers created in the panel are started from here
function Cs2Folder() {
  const [dir, setDir] = React.useState('')
  const [found, setFound] = React.useState<boolean | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const { t } = useT()

  React.useEffect(() => {
    db_helper.getPanelSettings().then((s) => { setDir(s.cs2Dir); setFound(s.cs2Found) }).catch(() => {})
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const s = await db_helper.setPanelSettings(dir)
      setDir(s.cs2Dir)
      setFound(s.cs2Found)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
        <FolderCog className="mr-2" size={14} />
        {t('Сервер CS2 на этом ПК', 'CS2 server on this PC')}
      </h3>
      <div className="p-4 rounded-2xl border border-border bg-card shadow-lg shadow-black/20 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('Папка, куда установлен выделенный сервер CS2 (в ней лежит game\\bin\\win64\\cs2.exe). Отсюда панель запускает созданные в ней серверы.', 'Folder where the CS2 dedicated server is installed (it contains game\\bin\\win64\\cs2.exe). The panel starts the servers created in it from here.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="C:\cs2server\cs2"
            className="flex-1 min-w-0 bg-background/50 border border-input rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
          />
          <button
            type="submit"
            disabled={saving || !dir.trim()}
            className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {t('Сохранить', 'Save')}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {found !== null && (
          found
            ? <p className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={14} /> {t('cs2.exe найден', 'cs2.exe found')}</p>
            : <p className="flex items-center gap-1.5 text-xs text-amber-400"><AlertTriangle size={14} /> {t('В этой папке нет game\\bin\\win64\\cs2.exe', 'No game\\bin\\win64\\cs2.exe in this folder')}</p>
        )}
      </div>
    </form>
  )
}
