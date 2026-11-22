"use client"

import React from 'react'
import {
  Settings as SettingsIcon, Monitor, Terminal, FolderOpen, Download, RefreshCw, Wrench, Database, Activity,
  Shield, AlertTriangle, Save, CheckCircle2, XCircle, ScrollText, Cpu,
} from 'lucide-react'
import { AuditLog } from '@/components/settings/audit-log'
import { PluginsSettings } from '@/components/settings/plugins-settings'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

// Panel settings, laid out as the Quatrix Settings page: a card with tabs and a Save footer

type Tab = 'general' | 'server_engine' | 'plugins' | 'system_health' | 'log'

interface PanelSettings {
  cs2Dir: string
  cs2Found: boolean
  steamcmd: string
  steamcmdFound: boolean
  panelName: string
  defaultPort: number
  chatPrefix: string
}

interface Health {
  runtime: { node: string; panel: string; os: string }
  cpu: { model: string; cores: number }
  ram: { total: number; status: 'good' | 'low' }
  disk: { free: number; total: number; status: 'good' | 'low' }
  paths: { cs2: string; steamcmd: string }
  checks: Record<'cs2' | 'steamcmd' | 'metamod' | 'metamodInGameinfo' | 'counterstrikesharp' | 'matchzy', boolean>
  repairable: boolean
}

const GB = 1024 ** 3
const field = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600 disabled:opacity-50'

export function GeneralSettings() {
  const { t } = useT()
  const [tab, setTab] = React.useState<Tab>('general')
  const [settings, setSettings] = React.useState<PanelSettings | null>(null)
  const [health, setHealth] = React.useState<Health | null>(null)
  const [healthLoading, setHealthLoading] = React.useState(false)
  const [panelName, setPanelName] = React.useState('')
  const [defaultPort, setDefaultPort] = React.useState('27015')
  const [chatPrefix, setChatPrefix] = React.useState('')
  const [steamcmd, setSteamcmd] = React.useState('')
  const [cs2Dir, setCs2Dir] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const loadSettings = React.useCallback(async () => {
    const s = await api<PanelSettings>('/api/panel-settings').catch(() => null)
    if (!s) return
    setSettings(s)
    setPanelName(s.panelName)
    setDefaultPort(String(s.defaultPort))
    setChatPrefix(s.chatPrefix)
    setSteamcmd(s.steamcmd)
    setCs2Dir(s.cs2Dir)
  }, [])

  const loadHealth = React.useCallback(async () => {
    setHealthLoading(true)
    try { setHealth(await api<Health>('/api/system/health')) } catch {} finally { setHealthLoading(false) }
  }, [])

  React.useEffect(() => { loadSettings(); loadHealth() }, [loadSettings, loadHealth])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const body = tab === 'general' ? { panelName, defaultPort: Number(defaultPort), chatPrefix } : { steamcmd, cs2Dir }
      const s = await api<PanelSettings>('/api/panel-settings', { method: 'PUT', body })
      setSettings(s)
      setMessage({ type: 'success', text: t('Настройки сохранены', 'Settings updated successfully!') })
      window.dispatchEvent(new Event('panel-settings-changed'))
      loadHealth()
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || t('Не удалось сохранить настройки', 'Failed to update settings') })
    } finally {
      setSaving(false)
    }
  }

  const systemAction = async (action: 'repair' | 'steamcmd') => {
    setHealthLoading(true)
    setMessage(action === 'steamcmd' ? { type: 'info', text: t('Скачиваю SteamCMD... Подождите.', 'Downloading SteamCMD... Please wait.') } : null)
    try {
      setHealth(await api<Health>('/api/system/health', { body: { action } }))
      setMessage({
        type: 'success',
        text: action === 'steamcmd'
          ? t('SteamCMD скачан и распакован!', 'SteamCMD downloaded and extracted successfully!')
          : t('Система исправлена', 'System repaired successfully'),
      })
      loadSettings()
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message })
    } finally {
      setHealthLoading(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: t('Общие', 'General') },
    { key: 'server_engine', label: t('Сервер CS2', 'Server Engine') },
    { key: 'plugins', label: t('Плагины', 'Plugins') },
    { key: 'system_health', label: t('Состояние системы', 'System Health') },
    { key: 'log', label: t('Журнал действий', 'Action Log') },
  ]

  return (
    <div className="p-3 md:p-6">
      <div className="bg-card rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="flex border-b border-gray-800 bg-card overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => { setTab(item.key); setMessage(null) }}
              className={cn(
                'flex-1 px-4 py-4 text-xs sm:text-sm font-bold uppercase tracking-widest transition-all relative whitespace-nowrap text-center',
                tab === item.key ? 'text-primary bg-primary/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
              )}
            >
              {item.label}
              {tab === item.key && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-primary shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-in fade-in duration-300"></div>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 sm:p-8 min-h-[560px] flex flex-col">
          <div className="flex-1">
            {message && (
              <div className={cn(
                'mb-6 p-4 rounded-xl border text-sm flex items-center gap-2',
                message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500'
                  : message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-500',
              )}>
                {message.type === 'success' && <Shield size={16} />}
                {message.type === 'error' && <AlertTriangle size={16} />}
                {message.type === 'info' && <RefreshCw size={16} className="animate-spin" />}
                {message.text}
              </div>
            )}

            {tab === 'general' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-6">
                  <SectionTitle icon={<SettingsIcon className="text-primary w-5 h-5" />} title={t('Общие настройки', 'General Settings')} />
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">{t('Название панели', 'Panel Name')}</label>
                      <input className={field} type="text" value={panelName} placeholder="Matchdesk" onChange={(e) => setPanelName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">{t('Порт сервера по умолчанию', 'Default Server Port')}</label>
                      <input className={field} type="number" value={defaultPort} onChange={(e) => setDefaultPort(e.target.value)} />
                      <p className="text-[10px] text-gray-500 mt-2 px-1">{t('С него начинается подбор свободных портов при создании сервера.', 'New servers get the first free port starting from this one.')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">{t('Префикс в чате', 'Chat Prefix')}</label>
                      <input className={field} type="text" maxLength={32} value={chatPrefix} placeholder="Server" onChange={(e) => setChatPrefix(e.target.value)} />
                      <p className="text-[10px] text-gray-500 mt-2 px-1">{t(`Стоит в скобках перед сообщениями плагинов в игре: [${chatPrefix.trim() || 'Server'}]. MatchZy меняет его сразу, WeaponPaints — после перезапуска сервера.`, `Shown in brackets before plugin chat messages: [${chatPrefix.trim() || 'Server'}]. MatchZy picks it up at once, WeaponPaints after a server restart.`)}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <SectionTitle icon={<SettingsIcon className="text-primary w-5 h-5" />} title={t('Информация о системе', 'System Information')} />
                  <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-4">
                    <InfoRow label={t('Версия Node.js', 'Node.js Version')} value={health?.runtime.node} mono />
                    <InfoRow label={t('Версия панели', 'Panel Version')} value={health?.runtime.panel || process.env.NEXT_PUBLIC_PANEL_VERSION} mono />
                    <InfoRow label={t('Операционная система', 'Operating System')} value={health?.runtime.os} />
                  </div>
                </div>
              </div>
            )}

            {tab === 'server_engine' && (
              <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 mb-8">
                  <Monitor className="text-primary w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">{t('Сервер CS2', 'Server Engine')}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{t('SteamCMD и файлы игры', 'Configure SteamCMD and base game files')}</p>
                  </div>
                </div>
                <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <label className="block text-sm font-medium text-gray-400">{t('Путь к SteamCMD', 'SteamCMD Path')}</label>
                      <button
                        onClick={() => systemAction('steamcmd')}
                        disabled={healthLoading}
                        className="flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest py-1 px-2 rounded-lg text-gray-400 hover:text-white hover:bg-primary/10 border border-primary/20 transition-all disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('Скачать онлайн', 'Download online')}
                      </button>
                    </div>
                    <PathInput icon={<Terminal size={18} />} value={steamcmd} onChange={setSteamcmd} placeholder="C:\cs2server\steamcmd\steamcmd.exe" ok={settings?.steamcmdFound} />
                    <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">{t('Полный путь к steamcmd.exe. Через него работает «Обновить CS2».', 'Absolute path to the SteamCMD executable.')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('Папка сервера CS2', 'Game Library Path')}</label>
                    <PathInput icon={<FolderOpen size={18} />} value={cs2Dir} onChange={setCs2Dir} placeholder="C:\cs2server\cs2" ok={settings?.cs2Found} />
                    <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">{t('Папка выделенного сервера CS2 (в ней game\\bin\\win64\\cs2.exe). Отсюда запускаются серверы из панели.', 'Directory of the CS2 dedicated server (with game\\bin\\win64\\cs2.exe); servers created in the panel run from here.')}</p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'system_health' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
                  <div className="flex items-center gap-2">
                    <Monitor className="text-primary w-6 h-6" />
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">{t('Состояние системы', 'System Health')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('Железо, диск и установка сервера CS2', 'Monitor hardware, disk, and runtime environment')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {health?.repairable && (
                      <button
                        onClick={() => systemAction('repair')}
                        disabled={healthLoading}
                        className="flex items-center gap-2 px-3 py-1 text-xs rounded-lg font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Wrench size={14} />
                        {t('Исправить', 'Repair System')}
                      </button>
                    )}
                    <button
                      onClick={loadHealth}
                      disabled={healthLoading}
                      className="flex items-center gap-2 px-3 py-1 text-xs rounded-lg font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
                      {healthLoading ? t('Обновление...', 'Refreshing...') : t('Обновить', 'Refresh')}
                    </button>
                  </div>
                </div>

                {!health ? (
                  <div className="py-20 flex flex-col items-center justify-center">
                    <RefreshCw className="text-primary w-10 h-10 animate-spin mb-4" />
                    <p className="text-gray-500 animate-pulse">{t('Проверяю систему...', 'Scanning system...')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2"><Database size={16} className="text-primary" />{t('Железо', 'Hardware & CPU')}</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 p-4 bg-background/50 rounded-xl border border-gray-800/30">
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('Процессор', 'CPU Model')}</p>
                            <p className="text-sm text-gray-200 font-medium truncate">{health.cpu.model}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t('Потоки', 'Cores')}</p>
                            <p className="text-sm text-white font-bold">{health.cpu.cores}</p>
                          </div>
                        </div>
                        <StatusCard
                          ok={health.ram.status === 'good'}
                          icon={<Activity size={16} />}
                          title={t('Память', 'Memory (RAM)')}
                          detail={`${(health.ram.total / GB).toFixed(1)} GB ${t('всего', 'total')}`}
                          okText={t('Норма', 'Pass')}
                          badText={t('Мало памяти', 'Low RAM')}
                          warn
                        />
                        <StatusCard
                          ok={health.disk.status === 'good'}
                          icon={<FolderOpen size={16} />}
                          title={t('Диск с CS2', 'Disk Space')}
                          detail={`${(health.disk.free / GB).toFixed(1)} GB ${t('свободно', 'free')}`}
                          okText={t('Норма', 'Pass')}
                          badText={t('Мало места', 'Low Disk')}
                          warn
                        />
                      </div>
                    </div>

                    <div className="p-6 bg-[#0d1624] rounded-2xl border border-gray-800/50 space-y-6">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2"><Terminal size={16} className="text-primary" />{t('Установка сервера', 'Server Installation')}</h4>
                      <div className="space-y-3">
                        <CheckRow ok={health.checks.cs2} icon={<Cpu size={16} />} title="CS2 Dedicated Server" detail={health.paths.cs2} />
                        <CheckRow ok={health.checks.steamcmd} icon={<Download size={16} />} title="SteamCMD" detail={health.paths.steamcmd} />
                        <CheckRow ok={health.checks.metamod && health.checks.metamodInGameinfo} icon={<Shield size={16} />} title="Metamod:Source"
                          detail={!health.checks.metamod ? t('не установлен', 'not installed') : !health.checks.metamodInGameinfo ? t('не подключён в gameinfo.gi', 'not loaded in gameinfo.gi') : t('подключён в gameinfo.gi', 'loaded in gameinfo.gi')} />
                        <CheckRow ok={health.checks.counterstrikesharp} icon={<Terminal size={16} />} title="CounterStrikeSharp" detail="addons\counterstrikesharp" />
                        <CheckRow ok={health.checks.matchzy} icon={<ScrollText size={16} />} title="MatchZy" detail="plugins\MatchZy" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'plugins' && <PluginsSettings />}

            {tab === 'log' && <AuditLog />}
          </div>

          {(tab === 'general' || tab === 'server_engine') && (
            <div className="mt-8 flex justify-end border-t border-gray-800/50 pt-6">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center justify-center gap-2 whitespace-nowrap transition-all bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95 px-10 py-3.5 text-sm rounded-xl font-bold disabled:opacity-50"
              >
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Save size={18} />}
                {saving ? t('Сохранение...', 'Saving...') : t('Сохранить', 'Save Changes')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={cn('text-gray-300 text-right', mono && 'font-mono')}>
        {value || <span className="inline-block w-16 h-4 bg-gray-800 rounded animate-pulse"></span>}
      </span>
    </div>
  )
}

function PathInput({ icon, value, onChange, placeholder, ok }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; ok?: boolean }) {
  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors">{icon}</div>
      <input
        className="w-full bg-background/50 border border-gray-800 rounded-xl pl-12 pr-12 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-700 text-sm font-mono"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {ok !== undefined && (
        <div className={cn('absolute right-4 top-1/2 -translate-y-1/2', ok ? 'text-green-500' : 'text-red-500')}>
          {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        </div>
      )}
    </div>
  )
}

function StatusCard({ ok, icon, title, detail, okText, badText, warn }: { ok: boolean; icon: React.ReactNode; title: string; detail: string; okText: string; badText: string; warn?: boolean }) {
  const bad = warn ? 'orange' : 'red'
  return (
    <div className={cn('flex items-center justify-between gap-3 p-4 rounded-xl border', ok ? 'bg-green-500/5 border-green-500/20' : bad === 'orange' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-red-500/5 border-red-500/20')}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('p-2 rounded-lg', ok ? 'bg-green-500/10 text-green-500' : bad === 'orange' ? 'bg-orange-500/10 text-orange-500' : 'bg-red-500/10 text-red-500')}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-gray-500 truncate">{detail}</p>
        </div>
      </div>
      <span className={cn('text-[10px] font-black uppercase tracking-widest shrink-0', ok ? 'text-green-500' : bad === 'orange' ? 'text-orange-500' : 'text-red-500')}>{ok ? okText : badText}</span>
    </div>
  )
}

function CheckRow({ ok, icon, title, detail }: { ok: boolean; icon: React.ReactNode; title: string; detail: string }) {
  const { t } = useT()
  return (
    <StatusCard ok={ok} icon={icon} title={title} detail={detail} okText={t('Найден', 'Found')} badText={t('Нет', 'Missing')} />
  )
}
