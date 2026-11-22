"use client"

import React from 'react'
import { Globe, RotateCcw, AlertTriangle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

// The skins website for players, run by the panel next to WeaponPaints (src/server/skins-site.ts)

interface View {
  enabled: boolean
  port: number
  state: 'off' | 'starting' | 'running' | 'crashed'
  message: string | null
  address: string
  log: string[]
}

export function SkinsSiteSettings() {
  const { t } = useT()
  const [view, setView] = React.useState<View | null>(null)
  const [port, setPort] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    const v = await api<View>('/api/skins-site').catch(() => null)
    if (v) setView(v)
  }, [])

  React.useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  React.useEffect(() => { if (view && port === '') setPort(String(view.port)) }, [view, port])

  const call = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const v = await api<View>('/api/skins-site', { body })
      setView(v)
      setPort(String(v.port))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!view) return null

  const url = `http://${view.address}`
  const status = {
    running: { text: t('Работает', 'Running'), cls: 'text-green-500' },
    starting: { text: t('Запускается…', 'Starting…'), cls: 'text-blue-400' },
    crashed: { text: t('Ошибка', 'Error'), cls: 'text-red-500' },
    off: { text: t('Не работает', 'Not running'), cls: 'text-gray-500' },
  }[view.state]
  const portChanged = port.trim() !== '' && port.trim() !== String(view.port)

  return (
    <div className="mt-6 p-4 bg-[#0d1624] rounded-2xl border border-gray-800/50">
      <div className="flex items-start gap-3">
        <Switch checked={view.enabled} disabled={busy} onCheckedChange={(v) => call({ enabled: v })} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white flex items-center gap-2">
            <Globe size={14} className="text-primary" />
            {t('Сайт скинов', 'Skins website')}
            <span className={cn('text-[11px] font-medium', status.cls)}>{status.text}</span>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {t(
              'Игроки выбирают скины в браузере на своём компьютере: пишут !site в чате, открывают адрес и сразу попадают в свой профиль. Панель запускает сайт вместе с WeaponPaints и сама передаёт ему серверы. Картинки предметов сайт хранит на этом ПК (около 1,4 ГБ).',
              'Players pick skins in the browser on their own computer: they type !site in chat, open the address and land in their own profile. The panel runs the site together with WeaponPaints and hands it the servers. Item pictures are kept on this PC (about 1.4 GB).',
            )}
          </p>
          {view.state === 'running' && (
            <p className="text-[11px] mt-1.5">
              <span className="text-gray-500">{t('Адрес для игроков: ', 'Address for players: ')}</span>
              <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{view.address}</a>
            </p>
          )}
          {view.message && view.state !== 'running' && (
            <p className={cn('text-[11px] mt-1.5', view.state === 'crashed' ? 'text-red-400' : 'text-gray-400')}>{view.message}</p>
          )}
          {view.state === 'crashed' && view.log.length > 0 && (
            <pre className="mt-2 max-h-32 overflow-auto text-[11px] text-gray-400 whitespace-pre-wrap">{view.log.slice(-8).join('\n')}</pre>
          )}
          {error && (
            <p className="text-[11px] mt-1.5 text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-gray-500">{t('Порт', 'Port')}</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
              className="w-20 bg-[#0a111c] border border-gray-800 rounded-lg px-2 py-1 text-xs text-white"
              inputMode="numeric"
            />
            {portChanged && (
              <button
                onClick={() => call({ port: Number(port) })}
                disabled={busy}
                className="text-[10px] uppercase font-black tracking-widest py-1.5 px-2.5 rounded-lg border text-primary border-primary/30 hover:bg-primary/10 disabled:opacity-50"
              >
                {t('Сохранить', 'Save')}
              </button>
            )}
            <button
              onClick={() => call({ action: 'restart' })}
              disabled={busy || !view.enabled}
              className="flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest py-1.5 px-2.5 rounded-lg border text-gray-400 border-gray-700 hover:text-white hover:bg-white/5 disabled:opacity-50"
            >
              <RotateCcw size={12} />{t('Перезапустить', 'Restart')}
            </button>
            <span className="text-[11px] text-gray-500">
              {t('С портом 80 адрес без цифр: так проще набрать. Другой порт нужен, только если 80 занят.', 'With port 80 the address has no number, easier to type. Use another port only if 80 is taken.')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
