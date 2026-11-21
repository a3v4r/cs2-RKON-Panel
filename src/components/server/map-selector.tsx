"use client"

import React from 'react'
import { Search, RefreshCcw, Plus, Settings, Trash2, Play, CheckCircle2, Globe, X, Loader2, Power, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { STOCK_MAPS, mapImage, stockMap } from '@/lib/maps'

// Map Explorer, laid out as the Quatrix Maps page (MapCard, WorkshopModal, MapConfigEditor in one file)

type MapType = 'Defusal' | 'Hostage' | 'Workshop'

interface CS2Map {
  id: string
  workshop_id?: string
  name: string
  displayName: string
  type: MapType
  image: string
  isActive: boolean
}

interface WorkshopMapData {
  id: number
  workshop_id: string
  map_file?: string
  name: string
  image_url?: string
}

const STOCK = STOCK_MAPS

interface MapSelectorProps {
  serverId: number
  currentMap: string
  online: boolean
  onCommand: (command: string) => Promise<string>
}

export function MapSelector({ serverId, currentMap, online, onCommand }: MapSelectorProps) {
  const { t } = useT()
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<'all' | MapType>('all')
  const [workshop, setWorkshop] = React.useState<WorkshopMapData[] | null>(null)
  const [changing, setChanging] = React.useState(false)
  const [toast, setToast] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [newWorkshopId, setNewWorkshopId] = React.useState('')
  const [newMapFile, setNewMapFile] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<CS2Map | null>(null)
  const [config, setConfig] = React.useState('')
  const [savingConfig, setSavingConfig] = React.useState(false)

  const notify = (ok: boolean, text: string) => {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 3500)
  }

  const loadWorkshop = React.useCallback(() => {
    api<WorkshopMapData[]>('/api/maps/workshop').then(setWorkshop).catch(() => setWorkshop([]))
  }, [])
  React.useEffect(loadWorkshop, [loadWorkshop])

  const maps = React.useMemo<CS2Map[]>(() => {
    const current = (currentMap || '').toLowerCase()
    const stock = STOCK.map((m, i) => ({
      id: String(i + 1),
      name: m.name,
      displayName: m.displayName,
      type: m.type,
      image: m.image,
      isActive: stockMap(current)?.name === m.name,
    }))
    const ws = (workshop ?? []).map((m) => ({
      id: `w-${m.id}`,
      workshop_id: m.workshop_id,
      name: m.map_file || m.workshop_id,
      displayName: m.name,
      type: 'Workshop' as const,
      image: m.image_url || '/images/maps/de_dust2.webp',
      isActive: current.includes(m.workshop_id) || (!!m.map_file && current.endsWith(m.map_file.toLowerCase())),
    }))
    return [...stock, ...ws]
  }, [currentMap, workshop])

  const q = search.toLowerCase()
  const filtered = maps.filter((m) => m.displayName.toLowerCase().includes(q) && (category === 'all' || m.type === category))
  const activeMap = maps.find((m) => m.isActive)

  const changeMap = async (map: CS2Map) => {
    setChanging(true)
    try {
      await api(`/api/servers/${serverId}/map`, { body: { map: map.name, workshopId: map.type === 'Workshop' ? map.workshop_id : undefined } })
      notify(true, t('Смена карты запрошена!', 'Map change requested!'))
    } catch (e) {
      notify(false, (e as Error).message || t('Ошибка RCON - сервер запущен?', 'RCON Failure - Is the server online?'))
    } finally {
      setChanging(false)
    }
  }

  const addWorkshop = async () => {
    setAdding(true)
    try {
      await api('/api/maps/workshop', { body: { workshop_id: newWorkshopId, map_file: newMapFile } })
      setNewWorkshopId('')
      setNewMapFile('')
      setModalOpen(false)
      notify(true, t('Карта из Workshop добавлена!', 'Workshop map added!'))
      loadWorkshop()
    } catch (e) {
      notify(false, (e as Error).message || t('Не удалось добавить карту из Workshop', 'Failed to add workshop map'))
    } finally {
      setAdding(false)
    }
  }

  const removeWorkshop = async (id: string) => {
    try {
      await api(`/api/maps/workshop/${id.replace('w-', '')}`, { method: 'DELETE' })
      notify(true, t('Карта из Workshop удалена', 'Workshop map removed'))
      loadWorkshop()
    } catch (e) {
      notify(false, (e as Error).message)
    }
  }

  const openConfig = async (map: CS2Map) => {
    setEditing(map)
    setConfig('')
    try {
      const data = await api<{ content: string }>(`/api/maps/config/${serverId}/${encodeURIComponent(map.name)}`)
      setConfig(data.content)
    } catch {
      notify(false, t('Не удалось загрузить конфиг карты', 'Failed to load map config'))
    }
  }

  const saveConfig = async () => {
    if (!editing) return
    setSavingConfig(true)
    try {
      await api(`/api/maps/config/${serverId}/${encodeURIComponent(editing.name)}`, { body: { content: config } })
      notify(true, t('Конфиг карты сохранён', 'Map config saved successfully'))
      setEditing(null)
    } catch {
      notify(false, t('Не удалось сохранить конфиг', 'Failed to save config'))
    } finally {
      setSavingConfig(false)
    }
  }

  const categories: { key: 'all' | MapType; label: string; short: string }[] = [
    { key: 'all', label: t('Все карты', 'All Maps'), short: t('Все', 'All') },
    { key: 'Defusal', label: t('Закладка бомбы', 'Defusal'), short: t('Бомба', 'Defusal') },
    { key: 'Hostage', label: t('Заложники', 'Hostage'), short: t('Заложники', 'Hostage') },
    { key: 'Workshop', label: 'Workshop', short: 'Workshop' },
  ]
  const countOf = (key: 'all' | MapType) => (key === 'all' ? maps.length : maps.filter((m) => m.type === key).length)
  const heroName = activeMap?.displayName || (currentMap && currentMap !== '---' ? currentMap : t('Неизвестная карта', 'Unknown Map'))

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero, as on the Match page: the current map behind its name, the map actions on the right */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-800 shadow-2xl bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activeMap?.image || mapImage(currentMap)} alt="" className={cn('absolute inset-0 w-full h-full object-cover', online ? 'opacity-30' : 'opacity-10 grayscale')} />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/40" />
        <div className="relative p-4 sm:p-8 flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="min-w-0">
            <span className={cn(pill, online ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-green-500 animate-pulse' : 'bg-gray-500')} />
              {online ? t('Сейчас играется', 'Active Now') : t('Сервер не в сети', 'Server Offline')}
            </span>
            <h3 className="mt-3 text-2xl sm:text-4xl font-black text-white uppercase tracking-tight truncate">{online ? heroName : '---'}</h3>
            {online && activeMap && <p className="mt-1 text-[10px] text-gray-400 font-mono uppercase tracking-widest truncate">{activeMap.name}</p>}
          </div>
          {online && (
            <div className="grid grid-cols-3 md:flex gap-2 shrink-0 [&>button]:px-2 [&>button]:text-xs sm:[&>button]:px-4 sm:[&>button]:text-sm [&>button]:gap-1.5 [&>button>svg]:hidden sm:[&>button>svg]:block">
              {activeMap && (
                <button onClick={() => openConfig(activeMap)} className={cn(btn, btnSecondary)} title={t('Команды, которые панель отправит после загрузки этой карты', 'Commands the panel sends after this map loads')}>
                  <Settings size={15} /> <span className="truncate">{t('Конфиг', 'Config')}</span>
                </button>
              )}
              <button
                onClick={() => onCommand('mp_warmup_start').then(() => notify(true, t('Разминка включена', 'Warmup started'))).catch((e) => notify(false, (e as Error).message))}
                className={cn(btn, btnSecondary)}
                title={t('Включить разминку', 'Start warmup')}
              >
                <Power size={15} /> <span className="truncate">{t('Разминка', 'Warmup')}</span>
              </button>
              {activeMap && (
                <button onClick={() => changeMap(activeMap)} disabled={changing} className={cn(btn, btnPrimary)} title={t('Загрузить карту заново', 'Reload the map')}>
                  <RefreshCcw size={15} className={cn(changing && 'animate-spin')} /> <span className="truncate">{t('Рестарт', 'Restart')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className={cn(card, 'overflow-hidden')}>
        {/* Header: categories as the Servers view switch, search, add from Workshop */}
        <div className="p-4 sm:px-6 border-b border-gray-800/60 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="grid grid-cols-2 sm:flex gap-[3px] bg-background/50 border border-gray-800 rounded-xl p-[3px] shadow-sm shadow-black/20">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  'flex items-center justify-center gap-1.5 px-2 sm:px-4 h-[34px] rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all',
                  category === cat.key ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white hover:bg-white/5',
                )}
              >
                <span className="sm:hidden truncate">{cat.short}</span>
                <span className="hidden sm:inline">{cat.label}</span>
                <span className={cn('hidden sm:inline min-w-5 px-1.5 rounded-md text-[10px] font-black tabular-nums', category === cat.key ? 'bg-white/20' : 'bg-white/5 text-gray-500')}>{countOf(cat.key)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <div className="relative group flex-1 lg:w-64 lg:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder={t('Поиск карт...', 'Search maps...')}
                className="w-full pl-10 pr-4 py-1.5 bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl transition-all outline-none text-sm text-gray-200 placeholder-gray-600 h-[34px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button onClick={() => setModalOpen(true)} className={cn(btn, btnPrimary, 'h-[34px] shrink-0')}>
              <Plus size={15} /> <span className="hidden sm:inline">{t('Добавить Workshop', 'Add Workshop')}</span><span className="sm:hidden">Workshop</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {workshop === null ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{t('Загрузка карт...', 'Loading maps...')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 flex flex-col items-center text-center">
              <div className="mb-3 p-3 rounded-2xl bg-primary/10 text-primary"><MapIcon size={22} /></div>
              <p className="text-sm text-gray-500">
                {category === 'Workshop' && !q
                  ? t('Карт из Workshop пока нет: добавьте по ID кнопкой «Добавить Workshop».', 'No Workshop maps yet: add one by ID with "Add Workshop".')
                  : t('Ничего не нашлось', 'Nothing found')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filtered.map((map) => (
                <MapCard
                  key={map.id}
                  map={map}
                  onOpenConfig={openConfig}
                  onRemoveWorkshop={removeWorkshop}
                  onChangeMap={changeMap}
                  isServerOnline={online}
                  isChanging={changing}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Toast, as react-hot-toast in Quatrix */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card', toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400')}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className={cn(card, 'w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200')} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:px-6 border-b border-gray-800/60 flex justify-between items-center gap-3">
              <CardHeader icon={<Globe size={18} />} title={t('Добавить из Workshop', 'Add Workshop Content')} subtitle={t('карта появится в списке', 'the map shows up in the list')} />
              <button onClick={() => setModalOpen(false)} className={iconBtn} aria-label={t('Закрыть', 'Close')}><X size={18} /></button>
            </div>
            <div className="p-4 sm:p-6 space-y-5">
              <div>
                <label className={LABEL}>{t('ID карты в Workshop', 'Workshop Map ID')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('например, 3070247085', 'e.g. 3070247085')}
                  className={cn(INPUT, 'font-mono')}
                  value={newWorkshopId}
                  onChange={(e) => setNewWorkshopId(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className={LABEL}>{t('Внутреннее имя карты (необязательно)', 'Internal Map Name (Optional)')}</label>
                <input
                  type="text"
                  placeholder={t('например, awp_lego_2', 'e.g. awp_lego_2')}
                  className={cn(INPUT, 'font-mono')}
                  value={newMapFile}
                  onChange={(e) => setNewMapFile(e.target.value)}
                />
                <p className="mt-2 text-[11px] text-gray-500">{t('Это имя используется для CFG-файлов и RCON', 'This is the name used for CFG files and RCON')}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModalOpen(false)} className={cn(btn, btnSecondary, 'flex-1')}>{t('Отмена', 'Cancel')}</button>
                <button onClick={addWorkshop} disabled={!newWorkshopId || adding} className={cn(btn, btnPrimary, 'flex-1')}>
                  {adding ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                  {adding ? t('Проверка...', 'Verifying...') : t('Добавить', 'Link to Server')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-3 md:p-6" onClick={() => setEditing(null)}>
          <div className={cn(card, 'w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200')} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:px-6 border-b border-gray-800/60 flex justify-between items-center gap-3">
              <CardHeader icon={<Settings size={18} />} title={`${t('Конфиг карты', 'Map config')}: ${editing.displayName}`} subtitle={`matchdesk_maps/${editing.name}.cfg`} />
              <button onClick={() => setEditing(null)} className={iconBtn} aria-label={t('Закрыть', 'Close')}><X size={18} /></button>
            </div>

            <textarea
              className="flex-1 w-full min-h-[360px] bg-black/40 text-primary/90 p-4 sm:p-6 font-mono text-sm outline-none resize-none leading-relaxed selection:bg-primary/20 placeholder:text-gray-700"
              spellCheck={false}
              placeholder={t('// Команды для этой карты...\n// например, mp_roundtime 1.92\n// mp_freezetime 5', '// Enter map-specific commands here...\n// e.g. mp_roundtime 1.92\n// mp_freezetime 5')}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              autoFocus
            />

            <div className="p-4 sm:px-6 border-t border-gray-800/60 flex flex-wrap gap-3 justify-between items-center">
              <div className="text-[10px] text-gray-500 flex items-center gap-2 font-bold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                {t('Выполняется после загрузки карты из панели', 'Auto-executed when map starts')}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className={cn(btn, btnSecondary)}>{t('Отмена', 'Discard')}</button>
                <button onClick={saveConfig} disabled={savingConfig} className={cn(btn, btnPrimary)}>
                  {savingConfig ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                  {t('Сохранить', 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Card, header and buttons as on the Match, Console and Players pages
const card = 'bg-card rounded-2xl border border-gray-800 shadow-2xl'
const btn = 'inline-flex items-center justify-center gap-2 px-4 h-[38px] text-sm rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0'
const btnPrimary = 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20'
const btnSecondary = 'bg-gray-800/80 hover:bg-gray-700 text-white border border-gray-700/50'
const iconBtn = 'p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all shrink-0'
const pill = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border'
const LABEL = 'block text-xs font-bold text-gray-400 mb-2'
const INPUT = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600'

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</h3>
        {subtitle && <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

const TYPE_LABEL: Record<MapType, { ru: string; en: string }> = {
  Defusal: { ru: 'Бомба', en: 'Defusal' },
  Hostage: { ru: 'Заложники', en: 'Hostage' },
  Workshop: { ru: 'Workshop', en: 'Workshop' },
}

// Map card as the Quatrix MapCard, with the active map marked like the Match tiles
function MapCard({ map, onOpenConfig, onRemoveWorkshop, onChangeMap, isServerOnline, isChanging }: {
  map: CS2Map
  onOpenConfig: (map: CS2Map) => void
  onRemoveWorkshop: (id: string) => void
  onChangeMap: (map: CS2Map) => void
  isServerOnline: boolean
  isChanging: boolean
}) {
  const { t, lang } = useT()
  return (
    <div className={cn('group relative aspect-[16/10] rounded-xl overflow-hidden border transition-all', map.isActive ? 'border-primary ring-2 ring-primary/50' : 'border-gray-800 hover:border-primary/50')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={map.image} alt={map.displayName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
        <span className={cn(pill, 'bg-black/50 backdrop-blur-sm text-gray-300 border-white/10')}>{TYPE_LABEL[map.type][lang]}</span>
        {map.isActive && (
          <span className={cn(pill, 'bg-green-500/20 backdrop-blur-sm text-green-400 border-green-500/30')}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />{t('Сейчас', 'Now')}
          </span>
        )}
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end gap-2">
        <div className="min-w-0">
          <h4 className="text-white font-bold text-sm truncate">{map.displayName}</h4>
          <p className="text-gray-400 text-[9px] font-mono truncate opacity-70">{map.name}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onOpenConfig(map)}
            className="p-2.5 bg-black/60 backdrop-blur-sm text-gray-300 rounded-xl border border-white/10 md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-primary hover:text-white hover:border-transparent"
            title={t('Конфиг карты', 'Map config')}
          >
            <Settings size={15} />
          </button>
          {map.type === 'Workshop' && (
            <button
              onClick={() => onRemoveWorkshop(map.id)}
              className="p-2.5 bg-black/60 backdrop-blur-sm text-red-400 rounded-xl border border-red-500/20 md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white hover:border-transparent"
              title={t('Удалить', 'Remove')}
            >
              <Trash2 size={15} />
            </button>
          )}
          {!map.isActive && (
            <button
              onClick={() => onChangeMap(map)}
              disabled={isChanging || !isServerOnline}
              className="p-2.5 bg-primary text-white rounded-xl shadow-xl shadow-primary/40 md:opacity-0 md:group-hover:opacity-100 transition-all md:translate-y-1 md:group-hover:translate-y-0 disabled:opacity-40"
              title={isServerOnline ? t('Запустить карту', 'Start map') : t('Сервер не в сети', 'Server offline')}
            >
              <Play size={15} fill="white" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
