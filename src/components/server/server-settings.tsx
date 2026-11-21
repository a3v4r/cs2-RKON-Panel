"use client"

import React from 'react'
import { Settings, Shield, Zap, RefreshCw, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServerProfile } from '@/lib/db'
import { useT } from '@/lib/i18n'

interface ServerSettingsProps {
  server: ServerProfile
  onEdit: () => void
  onCommand: (command: string) => Promise<string>
}

type RconCheck = { state: 'checking' } | { state: 'ok'; detail: string } | { state: 'error'; detail: string }

export function ServerSettings({ server, onEdit, onCommand }: ServerSettingsProps) {
  const [check, setCheck] = React.useState<RconCheck>({ state: 'checking' })
  const { t } = useT()

  const runCheck = React.useCallback(async () => {
    setCheck({ state: 'checking' })
    try {
      const output = await onCommand('hostname')
      setCheck({ state: 'ok', detail: output.trim() })
    } catch (e) {
      setCheck({ state: 'error', detail: (e as Error).message })
    }
  }, [onCommand])

  React.useEffect(() => { runCheck() }, [server.id])

  return (
    <div className="p-3 md:p-6 space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Settings size={32} className="text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{server.name}</h2>
            <p className="text-sm text-muted-foreground">{t('Настройки сервера', 'Server settings')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onEdit}>
          <Pencil size={14} className="mr-2" />
          {t('Изменить сервер', 'Edit server')}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SettingsGroup title={t('Подключение', 'Connection')} icon={<Zap size={18} />}>
          <Row label={t('Адрес', 'Address')}><span className="text-sm text-white font-mono">{server.host}</span></Row>
          <Row label={t('Порт', 'Port')}><span className="text-sm text-white font-mono">{server.port}</span></Row>
          <Row label="RCON" last>
            <div className="flex items-center gap-2 min-w-0">
              {check.state === 'checking' && <span className="text-xs text-muted-foreground">{t('проверка...', 'checking...')}</span>}
              {check.state === 'ok' && <span className="text-xs font-bold text-emerald-500 uppercase">{t('Подключено', 'Connected')}</span>}
              {check.state === 'error' && <span className="text-xs font-bold text-red-500 uppercase">{t('Ошибка', 'Error')}</span>}
              <button onClick={runCheck} className="p-1 text-muted-foreground hover:text-white" title={t('Проверить ещё раз', 'Check again')}>
                <RefreshCw size={14} />
              </button>
            </div>
          </Row>
          {check.state !== 'checking' && (
            <p className={check.state === 'ok' ? 'pt-2 text-xs text-muted-foreground break-words' : 'pt-2 text-xs text-red-400 break-words'}>
              {check.detail}
            </p>
          )}
        </SettingsGroup>

        <SettingsGroup title={t('Безопасность', 'Security')} icon={<Shield size={18} />}>
          <Row label={t('RCON-пароль', 'RCON password')} last>
            {server.has_password
              ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500">{t('Задан', 'Set')}</span>
              : <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-500">{t('Не задан', 'Not set')}</span>}
          </Row>
          <p className="pt-2 text-xs text-muted-foreground">
            {t('Хранится только на сервере панели и не передаётся в браузер. Сменить - кнопкой «Изменить сервер».', 'Stored only on the panel server and never sent to the browser. To change it, use "Edit server".')}
          </p>
        </SettingsGroup>
      </div>
    </div>
  )
}

function Row({ label, children, last = false }: { label: string, children: React.ReactNode, last?: boolean }) {
  return (
    <div className={last ? 'flex items-center justify-between gap-3 py-2' : 'flex items-center justify-between gap-3 py-2 border-b border-border'}>
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function SettingsGroup({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-2xl border border-border bg-card shadow-lg shadow-black/20">
      <div className="flex items-center text-sm font-bold mb-4 text-white">
        <span className="mr-2 text-primary">{icon}</span>
        {title}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}
