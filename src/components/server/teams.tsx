"use client"

import React from 'react'
import { Users, Save, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db_helper } from '@/lib/db'
import { useToast } from '@/components/ui/toast'

// Team names are entered once here (one per line) and then picked from dropdowns
// on the dashboard and in the match launcher instead of being retyped before every match.
export function TeamsManager() {
  const [saved, setSaved] = React.useState<string[]>([])
  const [draft, setDraft] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const toast = useToast()

  React.useEffect(() => {
    let cancelled = false
    db_helper.getTeams()
      .then((names) => {
        if (cancelled) return
        setSaved(names)
        setDraft(names.join('\n'))
      })
      .catch((e) => {
        if (!cancelled) toast.error(`Не удалось загрузить команды: ${(e as Error).message}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  // Same rules as the store: trim lines, drop empty ones and case-insensitive duplicates
  const parsed = React.useMemo(() => {
    const names: string[] = []
    const seen = new Set<string>()
    for (const line of draft.split(/\r?\n/)) {
      const name = line.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      names.push(name)
    }
    return names
  }, [draft])

  const dirty = JSON.stringify(parsed) !== JSON.stringify(saved)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await db_helper.saveTeams(parsed)
      setSaved(result)
      setDraft(result.join('\n'))
      toast.success(result.length > 0 ? `Список команд сохранён (${result.length})` : 'Список команд очищен')
    } catch (e) {
      toast.error(`Не удалось сохранить команды: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => setDraft(saved.join('\n'))

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-3xl animate-in fade-in duration-300">
      <div className="flex items-center space-x-4">
        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <Users size={28} className="text-primary" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Команды</h2>
          <p className="text-sm text-muted-foreground">
            Список команд для выпадающих меню на «Обзоре» и «Запуске».
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-[#09090b] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="teams-list" className="text-sm font-semibold text-white">
            Список команд — по одной в строке
          </label>
          <span className="text-xs text-muted-foreground shrink-0">
            {loading ? 'загрузка...' : `${parsed.length} ${teamWord(parsed.length)}`}
          </span>
        </div>

        <textarea
          id="teams-list"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          rows={12}
          spellCheck={false}
          placeholder={'Natus Vincere\nTeam Spirit\nVirtus.pro'}
          className="w-full min-h-[240px] resize-y bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white font-mono focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
        />

        <p className="text-xs text-muted-foreground">
          Пустые строки и повторы отбрасываются. Сохранение заменяет весь список — порядок строк сохраняется.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={loading || saving || !dirty}>
            <Save size={14} className="mr-2" />
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading || saving || !dirty}>
            <RotateCcw size={14} className="mr-2" />
            Отменить изменения
          </Button>
          <span className={dirty ? 'text-xs text-amber-400' : 'text-xs text-muted-foreground'}>
            {dirty ? 'Есть несохранённые изменения' : 'Всё сохранено'}
          </span>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-[#09090b] space-y-2">
          <h3 className="text-sm font-semibold text-white">Сохранённые команды</h3>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((name) => (
              <span
                key={name}
                className="px-2 py-1 rounded bg-white/5 border border-border text-xs text-white"
              >
                {name}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Выбираются в списках на вкладках «Обзор» и «Запуск». Своё название по-прежнему можно вписать вручную.
          </p>
        </div>
      )}
    </div>
  )
}

function teamWord(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'команда'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'команды'
  return 'команд'
}
