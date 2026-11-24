"use client"

import React from 'react'
import { Server, Shield, MapPin, Users, Lock, Key, Network, Globe, RefreshCw, Pencil, Activity } from 'lucide-react'
import { ServerProfile } from '@/lib/db'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ServerSettingsProps {
  server: ServerProfile
  onEdit: () => void
  onCommand: (command: string) => Promise<string>
}

type RconCheck = { state: 'checking' } | { state: 'ok'; detail: string } | { state: 'error'; detail: string }

// read-only; values are changed in the edit dialog (onEdit)
export function ServerSettings({ server, onEdit, onCommand }: ServerSettingsProps) {
  const [check, setCheck] = React.useState<RconCheck>({ state: 'checking' })
  const { t } = useT()
  const m = server.managed

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
    <div className="p-3 md:p-6 h-full flex flex-col">
      <div className="space-y-8 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="bg-card rounded-2xl border border-gray-800 p-5 md:p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Server className="w-5 h-5 text-primary" />
              {t('Информация о сервере', 'Instance Information')}
            </h3>
            <div className="space-y-6">
              <Field label={t('Название сервера', 'Server Name')}>
                <Value>{server.name}</Value>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label={t('Адрес', 'Address')}>
                  <Value icon={<Globe className="w-4 h-4" />} mono>{server.host}</Value>
                </Field>
                <Field label={t('Порт сервера', 'Server Port')}>
                  <Value mono>{server.port}</Value>
                </Field>
              </div>

              {m && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Field label={t('Карта при запуске', 'Primary Map')}>
                      <Value icon={<MapPin className="w-4 h-4" />}>{m.map}</Value>
                    </Field>
                    <Field label={t('Мест на сервере', 'Max Players')}>
                      <Value icon={<Users className="w-4 h-4" />}>{m.maxPlayers}</Value>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Field label={t('Порт GOTV', 'GOTV Port')}>
                      <Value mono>{m.tvPort}</Value>
                    </Field>
                    <Field label={t('IP для сервера и RCON', 'Bind IP')}>
                      <Value icon={<Network className="w-4 h-4" />} mono muted={!m.bindIp}>{m.bindIp || '0.0.0.0'}</Value>
                    </Field>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-800/50">
                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                      {t('Политика перезапуска', 'Restart Policy')}
                    </h4>
                    <Toggle
                      checked={m.autoRestart}
                      title={t('Перезапуск при падении', 'Restart on crash')}
                      desc={t('Если сервер упадёт после минуты работы', 'If the server crashes after running for a minute')}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-gray-800 p-5 md:p-8">
            <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              {t('Безопасность', 'Security Settings')}
            </h3>
            <div className="space-y-6">
              <div className={cn('grid grid-cols-1 gap-6', m && 'sm:grid-cols-2')}>
                {m && (
                  <Field label={t('Пароль сервера', 'Server Password')}>
                    <Value icon={<Lock className="w-4 h-4" />} muted={!m.password}>
                      {m.password ? '••••••••' : t('без пароля', 'No password')}
                    </Value>
                  </Field>
                )}
                <Field label={<>{t('RCON-пароль', 'RCON Password')} <span className="text-red-500">*</span></>}>
                  <Value icon={<Key className="w-4 h-4" />} muted={!server.has_password}>
                    {server.has_password ? '••••••••' : <span className="text-red-500">{t('Не задан', 'Not set')}</span>}
                  </Value>
                </Field>
              </div>
              <p className="text-xs text-gray-500">
                {t('Пароль RCON хранится только на сервере панели и не передаётся в браузер.', 'The RCON password is stored only on the panel server and never sent to the browser.')}
              </p>

              <div className="space-y-4 pt-4 border-t border-gray-800/50">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-12 h-12 shrink-0 rounded-xl flex items-center justify-center border',
                    check.state === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-500'
                      : check.state === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500'
                      : 'bg-white/5 border-gray-800 text-gray-400',
                  )}>
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-300">{t('Соединение RCON', 'RCON Connection')}</span>
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5',
                      check.state === 'ok' ? 'text-green-500' : check.state === 'error' ? 'text-red-500' : 'text-gray-500',
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', check.state === 'ok' ? 'bg-green-500 animate-pulse' : check.state === 'error' ? 'bg-red-500' : 'bg-gray-500')} />
                      {check.state === 'checking' ? t('Проверка...', 'Checking...') : check.state === 'ok' ? t('Подключено', 'Connected') : t('Ошибка', 'Error')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={runCheck}
                    disabled={check.state === 'checking'}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                    title={t('Проверить ещё раз', 'Check again')}
                    aria-label={t('Проверить ещё раз', 'Check again')}
                  >
                    <RefreshCw className={cn('w-4 h-4', check.state === 'checking' && 'animate-spin')} />
                  </button>
                </div>
                {check.state !== 'checking' && check.detail && (
                  <div className={cn(
                    'px-5 py-3 bg-black/20 border rounded-xl font-mono text-sm break-words',
                    check.state === 'ok' ? 'border-gray-800 text-gray-300' : 'border-red-500/20 text-red-400',
                  )}>
                    {check.detail}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 p-4 md:p-6 bg-card rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={onEdit}
            className="px-8 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Pencil className="w-4 h-4" />
            {t('Изменить сервер', 'Edit server')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-gray-400">{label}</div>
      {children}
    </div>
  )
}

function Value({ children, icon, mono = false, muted = false }: { children: React.ReactNode, icon?: React.ReactNode, mono?: boolean, muted?: boolean }) {
  return (
    <div className="relative">
      {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">{icon}</span>}
      <div className={cn(
        'w-full py-3 pr-5 bg-black/20 border border-gray-800 rounded-xl truncate',
        icon ? 'pl-12' : 'pl-5',
        mono && 'font-mono',
        muted ? 'text-gray-600' : 'text-white',
      )}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ checked, title, desc }: { checked: boolean, title: string, desc: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" role="img" aria-label={title}>
        <div className={cn('w-12 h-6 rounded-full transition-all duration-300', checked ? 'bg-primary' : 'bg-gray-800')} />
        <div className={cn('absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all duration-300', checked && 'translate-x-6')} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-300">{title}</span>
        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{desc}</span>
      </div>
    </div>
  )
}
