"use client"

import React from 'react'
import { Puzzle, RefreshCw, Download, RotateCcw, Trash2, Check, AlertTriangle, Lock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { SkinsSiteSettings } from './skins-site-settings'

// The plugin set of the CS2 install (one for every server on this PC): on / off, download, update, rollback, remove.

type PluginId = 'metamod' | 'counterstrikesharp' | 'matchzy' | 'weaponpaints'

interface PluginInfo {
  id: PluginId
  name: string
  requires: PluginId | null
  source: string
  installed: boolean
  enabled: boolean
  version: string | null
  installedAt: number | null
  previous: string | null
  latest: string | null
  latestError: string | null
  updateAvailable: boolean
  problem: { kind: 'gamedata' | 'guidelines'; at: string; detail: string } | null
}

interface Job { running: boolean; title: string; phase: string; ok?: boolean; message?: string; log: string[] }
interface AutoUpdate { enabled: boolean; checking: boolean; lastCheck: number | null; message: string | null; pending: string[] }
interface View { plugins: PluginInfo[]; job: Job; auto: AutoUpdate; vcRedist: boolean | null; vcRedistUrl: string }

// Order on the page: what judges pick first, the dependencies after
const ORDER: PluginId[] = ['matchzy', 'weaponpaints', 'counterstrikesharp', 'metamod']

export function PluginsSettings() {
  const { t } = useT()
  const [view, setView] = React.useState<View | null>(null)
  const [wanted, setWanted] = React.useState<Partial<Record<PluginId, boolean>>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    const v = await api<View>('/api/plugins').catch(() => null)
    if (v) setView(v)
    return v
  }, [])

  React.useEffect(() => { load() }, [load])

  // While a job runs: poll it, and take the new state as the draft when it ends
  const running = view?.job.running ?? false
  React.useEffect(() => {
    if (!running) return
    const timer = setInterval(async () => {
      const v = await load()
      if (v && !v.job.running) setWanted({})
    }, 1500)
    return () => clearInterval(timer)
  }, [running, load])

  // An automatic check runs on its own: follow it until it is done
  const autoChecking = view?.auto.checking ?? false
  React.useEffect(() => {
    if (!autoChecking) return
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [autoChecking, load])

  const byId = (id: PluginId) => view?.plugins.find((p) => p.id === id)

  // A plugin switched on turns on what it needs (CounterStrikeSharp, Metamod), and that one stays locked on
  const state = React.useMemo(() => {
    const on: Partial<Record<PluginId, boolean>> = {}
    const lockedBy: Partial<Record<PluginId, string>> = {}
    for (const p of view?.plugins ?? []) on[p.id] = wanted[p.id] ?? p.enabled
    for (const id of ['matchzy', 'weaponpaints', 'counterstrikesharp'] as PluginId[]) {
      const req = byId(id)?.requires
      if (on[id] && req) {
        on[req] = true
        lockedBy[req] = lockedBy[req] ? `${lockedBy[req]}, ${byId(id)!.name}` : byId(id)!.name
      }
    }
    return { on, lockedBy }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, wanted])

  const changed = (view?.plugins ?? []).some((p) => (state.on[p.id] ?? p.enabled) !== p.enabled)

  const call = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const v = await api<View>('/api/plugins', { body })
      setView(v)
      if (body.action === 'apply') setWanted({})
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || running

  return (
    <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Puzzle className="text-primary w-6 h-6" />
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{t('Плагины', 'Plugins')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('Один набор на все серверы этого ПК. Менять можно, только когда все серверы остановлены.', 'One set for every server on this PC. Change it only with all servers stopped.')}</p>
          </div>
        </div>
        <button
          onClick={() => call({ action: 'check' })}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg font-bold bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy && !running ? 'animate-spin' : ''} />
          {t('Проверить обновления', 'Check for updates')}
        </button>
      </div>

      {view && (
        <div className="mb-4 p-4 bg-[#0d1624] rounded-2xl border border-gray-800/50 flex items-start gap-3">
          <Switch
            checked={view.auto.enabled}
            disabled={busy}
            onCheckedChange={(v) => call({ action: 'auto', enabled: v })}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">{t('Автообновление', 'Automatic updates')}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {t(
                'Раз в 3 часа панель ищет новые версии и скачивает их в фоне. Ставит, только когда ни один сервер не работает: сразу или перед следующим запуском сервера. На день турнира можно выключить.',
                'Every 3 hours the panel looks for new versions and downloads them in the background. They are installed only while no server runs: at once or right before the next server start. Turn it off for a tournament day.',
              )}
            </p>
            {view.auto.enabled && (view.auto.pending.length > 0 || view.auto.message || view.auto.checking) && (
              <p className="text-[11px] text-primary mt-1.5">
                {view.auto.checking
                  ? t('Проверяю обновления…', 'Checking for updates…')
                  : view.auto.pending.length > 0
                    ? t(`Скачано и ждёт установки: ${view.auto.pending.join(', ')}`, `Downloaded, waiting to be installed: ${view.auto.pending.join(', ')}`)
                    : view.auto.message}
                {view.auto.lastCheck && !view.auto.checking && (
                  <span className="text-gray-500"> · {t('проверено', 'checked')} {new Date(view.auto.lastCheck).toLocaleString()}</span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {view?.vcRedist === false && (
        <div className="mb-4 p-4 rounded-xl border text-sm flex items-start gap-2 bg-amber-500/10 border-amber-500/20 text-amber-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
          <span>
            {t('На этом ПК нет Microsoft Visual C++ Redistributable (x64): без него Metamod и CounterStrikeSharp не загрузятся. Установите его от администратора ', 'Microsoft Visual C++ Redistributable (x64) is missing on this PC: Metamod and CounterStrikeSharp will not load without it. Install it as an administrator ')}
            (<a href={view.vcRedistUrl} target="_blank" rel="noreferrer" className="underline hover:text-white">vc_redist.x64.exe</a>)
            {t(' или перезапустите Matchdesk.exe: он предложит установить сам.', ' or restart Matchdesk.exe: it offers to install it.')}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 rounded-xl border text-sm flex items-center gap-2 bg-red-500/10 border-red-500/20 text-red-500">
          <AlertTriangle size={16} className="shrink-0" />{error}
        </div>
      )}

      {view?.job.title && (
        <div className={cn(
          'mb-4 p-4 rounded-xl border text-sm',
          view.job.running ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            : view.job.ok ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500',
        )}>
          <div className="flex items-center gap-2 font-bold">
            {view.job.running ? <RefreshCw size={16} className="animate-spin shrink-0" /> : view.job.ok ? <Check size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
            {view.job.title}: {view.job.running ? view.job.phase : view.job.message}
          </div>
          {view.job.log.length > 0 && (
            <pre className="mt-2 max-h-32 overflow-auto text-[11px] text-gray-400 whitespace-pre-wrap">{view.job.log.slice(-8).join('\n')}</pre>
          )}
        </div>
      )}

      {!view ? (
        <div className="py-20 flex justify-center"><RefreshCw className="text-primary w-8 h-8 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {ORDER.map(byId).filter(Boolean).map((p) => {
            const plugin = p!
            const on = state.on[plugin.id] ?? plugin.enabled
            const locked = state.lockedBy[plugin.id]
            return (
              <div key={plugin.id} className="p-4 bg-[#0d1624] rounded-2xl border border-gray-800/50 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Switch
                    checked={on}
                    disabled={disabled || Boolean(locked)}
                    onCheckedChange={(v) => setWanted((w) => ({ ...w, [plugin.id]: v }))}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      {plugin.name}
                      {locked && <span className="flex items-center gap-1 text-[10px] font-medium text-gray-500"><Lock size={10} />{t(`нужен для ${locked}`, `required by ${locked}`)}</span>}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {plugin.installed
                        ? `${t('Установлен', 'Installed')}${plugin.version ? ` · ${plugin.version}` : ` · ${t('версия неизвестна', 'unknown version')}`}${plugin.enabled ? '' : ` · ${t('выключен', 'off')}`}`
                        : t('Не установлен: скачается при включении', 'Not installed: downloaded when turned on')}
                      {' · '}{plugin.source}
                    </p>
                    {plugin.updateAvailable && <p className="text-[11px] text-primary">{t(`Есть новая версия: ${plugin.latest}`, `New version: ${plugin.latest}`)}</p>}
                    {plugin.latestError && <p className="text-[11px] text-orange-400">{plugin.latestError}</p>}
                    {plugin.problem && (
                      <p className="text-[11px] text-red-400 mt-1 flex items-start gap-1.5 whitespace-normal">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          {plugin.problem.kind === 'gamedata'
                            ? t(
                              `Скины не применяются (${new Date(plugin.problem.at).toLocaleString()}). Скорее всего, CS2 обновился и у плагина устарела gamedata. ${plugin.updateAvailable ? 'Обновите WeaponPaints: вышла новая версия.' : 'Нужна новая версия WeaponPaints, панель поставит её сама, когда она выйдет.'}`,
                              `Skins are not applied (${new Date(plugin.problem.at).toLocaleString()}). Most likely CS2 was updated and the plugin's gamedata is out of date. ${plugin.updateAvailable ? 'Update WeaponPaints: a new version is out.' : 'A new WeaponPaints version is needed; the panel installs it once it is out.'}`,
                            )
                            : t(
                              'Скины не применяются: в core.json CounterStrikeSharp включён FollowCS2ServerGuidelines. Панель выключает его перед запуском своих серверов; сервер, запущенный не из панели, нужно перезапустить из неё.',
                              'Skins are not applied: FollowCS2ServerGuidelines is on in the CounterStrikeSharp core.json. The panel turns it off before starting its servers; restart a server started elsewhere from the panel.',
                            )}
                          <span className="block text-gray-500 truncate" title={plugin.problem.detail}>{plugin.problem.detail}</span>
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {plugin.installed && plugin.updateAvailable && (
                    <SmallButton onClick={() => call({ action: 'update', id: plugin.id })} disabled={disabled} icon={<Download size={12} />} label={t('Обновить', 'Update')} primary />
                  )}
                  {plugin.installed && plugin.previous && (
                    <SmallButton onClick={() => call({ action: 'rollback', id: plugin.id })} disabled={disabled} icon={<RotateCcw size={12} />} label={t(`Откатить до ${plugin.previous}`, `Roll back to ${plugin.previous}`)} />
                  )}
                  {plugin.installed && (
                    <SmallButton
                      onClick={() => { if (confirm(t(`Удалить ${plugin.name} с диска? Настройки в cfg и configs останутся.`, `Delete ${plugin.name} from disk? Its settings in cfg and configs stay.`))) call({ action: 'remove', id: plugin.id }) }}
                      disabled={disabled}
                      icon={<Trash2 size={12} />}
                      label={t('Удалить', 'Delete')}
                      danger
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SkinsSiteSettings />

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-gray-800/50 pt-6">
        {changed && <p className="text-xs text-gray-500">{t('Без MatchZy серверы панели работают в режиме Vanilla.', 'Without MatchZy the panel servers run in Vanilla mode.')}</p>}
        <button
          onClick={() => setWanted({})}
          disabled={disabled || !changed}
          className="px-6 py-3.5 text-sm rounded-xl font-bold text-gray-400 hover:text-white disabled:opacity-40"
        >
          {t('Отмена', 'Cancel')}
        </button>
        <button
          onClick={() => call({ action: 'apply', enabled: state.on })}
          disabled={disabled || !changed}
          className="flex items-center justify-center gap-2 whitespace-nowrap transition-all bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95 px-10 py-3.5 text-sm rounded-xl font-bold disabled:opacity-50"
        >
          {running ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check size={18} />}
          {t('Применить', 'Apply')}
        </button>
      </div>
    </div>
  )
}

function SmallButton({ onClick, disabled, icon, label, primary, danger }: { onClick: () => void; disabled: boolean; icon: React.ReactNode; label: string; primary?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest py-1.5 px-2.5 rounded-lg border transition-all disabled:opacity-50',
        primary ? 'text-primary border-primary/30 hover:bg-primary/10'
          : danger ? 'text-red-400 border-red-500/20 hover:bg-red-500/10'
          : 'text-gray-400 border-gray-700 hover:text-white hover:bg-white/5',
      )}
    >
      {icon}{label}
    </button>
  )
}
