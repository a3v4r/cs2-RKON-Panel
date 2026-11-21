"use client"

import React from 'react'
import { Search, RefreshCcw, Plus, Settings, Trash2, Play, CheckCircle2, Globe, X, Loader2, Power } from 'lucide-react'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { STOCK_MAPS, stockMap } from '@/lib/maps'

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

  const categories: { key: 'all' | MapType; label: string }[] = [
    { key: 'all', label: t('Все карты', 'All Maps') },
    { key: 'Defusal', label: t('Закладка бомбы', 'Defusal Maps') },
    { key: 'Hostage', label: t('Заложники', 'Hostage Maps') },
    { key: 'Workshop', label: t('Карты Workshop', 'Workshop Maps') },
  ]

  return (
    <div className="p-3 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder={t('Поиск карт...', 'Search maps...')}
              className="w-full bg-background/50 border border-gray-800 rounded-xl py-1.5 pl-10 pr-4 text-sm text-white focus:border-primary transition-all outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-background/50 border border-gray-800 rounded-xl overflow-hidden p-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`w-full text-left px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${category === cat.key ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-primary text-white py-4 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> {t('Добавить Workshop', 'Add Workshop')}
          </button>
        </div>

        <div className="lg:col-span-9">
          <div className="mb-8 p-4 bg-primary/5 border border-primary/20 rounded-3xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden border border-primary/30 bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeMap?.image || '/images/maps/de_dust2.webp'}
                  alt=""
                  className={`w-full h-full object-cover ${!activeMap ? 'opacity-40 grayscale' : ''}`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${online ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                    {online ? t('Сейчас играется', 'Active Now') : t('Сервер не в сети', 'Server Offline')}
                  </span>
                </div>
                <h3 className="text-white font-bold truncate">
                  {activeMap?.displayName || (currentMap && currentMap !== '---' ? currentMap : t('Неизвестная карта', 'Unknown Map'))}
                </h3>
              </div>
            </div>
            {online && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onCommand('mp_warmup_start').then(() => notify(true, t('Разминка включена', 'Warmup started'))).catch((e) => notify(false, (e as Error).message))}
                  className="flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/10 transition-all"
                  title={t('Включить разминку', 'Start warmup')}
                >
                  <Power size={14} />
                  {t('Разминка', 'Warmup')}
                </button>
                {activeMap && (
                  <button
                    onClick={() => changeMap(activeMap)}
                    disabled={changing}
                    className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                  >
                    {changing ? <RefreshCcw size={16} className="animate-spin" /> : t('Рестарт', 'Restart')}
                  </button>
                )}
              </div>
            )}
          </div>

          {workshop === null ? (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-800 rounded-3xl">
              <Loader2 className="animate-spin text-primary mb-4" />
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{t('Подключение к Steam...', 'Connecting to Steam Cloud...')}</p>
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
      </div>

      {/* Toast, as react-hot-toast in Quatrix */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium bg-card ${toast.ok ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
            {toast.ok ? <CheckCircle2 size={16} /> : <X size={16} />}
            {toast.text}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Globe className="text-primary" size={20} />
                <h3 className="text-white font-bold">{t('Добавить из Workshop', 'Add Workshop Content')}</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-white transition-colors" aria-label={t('Закрыть', 'Close')}>
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">{t('ID карты в Workshop', 'Workshop Map ID')}</label>
                <input
                  type="text"
                  placeholder={t('например, 3070247085', 'e.g. 3070247085')}
                  className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
                  value={newWorkshopId}
                  onChange={(e) => setNewWorkshopId(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 ml-1">{t('Внутреннее имя карты (необязательно)', 'Internal Map Name (Optional)')}</label>
                <input
                  type="text"
                  placeholder={t('например, awp_lego_2', 'e.g. awp_lego_2')}
                  className="w-full bg-[#0c1424] border border-gray-800 rounded-2xl py-4 px-6 text-white focus:border-primary transition-all outline-none text-lg font-mono placeholder:text-gray-700"
                  value={newMapFile}
                  onChange={(e) => setNewMapFile(e.target.value)}
                />
                <p className="mt-3 text-[10px] text-gray-600 flex items-center gap-2">
                  <Plus size={10} /> {t('Это имя используется для CFG-файлов и RCON', 'This is the name used for CFG files and RCON')}
                </p>
              </div>
              <button
                onClick={addWorkshop}
                disabled={!newWorkshopId || adding}
                className="w-full bg-primary hover:bg-blue-600 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl shadow-primary/20"
              >
                {adding ? t('Проверка...', 'Verifying...') : t('Привязать к серверу', 'Link to Server')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-3 md:p-6">
          <div className="bg-card border border-gray-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#0d1421]">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Settings size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{t('Конфиг карты:', 'Config Editor:')} {editing.displayName}</h3>
                  <p className="text-[10px] text-gray-500 font-mono tracking-widest mt-0.5 uppercase">matchdesk_maps/{editing.name}.cfg</p>
                </div>
              </div>
              <button onClick={() => setEditing(null)} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-all" aria-label={t('Закрыть', 'Close')}>
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 bg-black/40 p-1">
              <textarea
                className="w-full h-full min-h-[400px] bg-transparent text-primary/90 p-8 font-mono text-sm outline-none resize-none leading-relaxed selection:bg-primary/20"
                spellCheck={false}
                placeholder={t('// Команды для этой карты...\n// например, mp_roundtime 1.92\n// mp_freezetime 5', '// Enter map-specific commands here...\n// e.g. mp_roundtime 1.92\n// mp_freezetime 5')}
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                autoFocus
              />
            </div>

            <div className="p-6 bg-[#0d1421] border-t border-gray-800 flex flex-wrap gap-3 justify-between items-center">
              <div className="text-[10px] text-gray-500 flex items-center gap-2 font-bold uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                {t('Выполняется после загрузки карты из панели', 'Auto-executed when map starts')}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditing(null)} className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-all capitalize">
                  {t('Отмена', 'Discard')}
                </button>
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-8 py-2.5 rounded-xl text-xs font-black tracking-[0.1em] transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
                >
                  {savingConfig ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  {t('СОХРАНИТЬ КОНФИГ', 'SAVE CONFIGURATION')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MapCard({ map, onOpenConfig, onRemoveWorkshop, onChangeMap, isServerOnline, isChanging }: {
  map: CS2Map
  onOpenConfig: (map: CS2Map) => void
  onRemoveWorkshop: (id: string) => void
  onChangeMap: (map: CS2Map) => void
  isServerOnline: boolean
  isChanging: boolean
}) {
  const { t } = useT()
  return (
    <div
      className={`group relative aspect-[16/10] rounded-2xl overflow-hidden border border-gray-800 transition-all hover:border-primary/50 ${
        map.isActive ? 'ring-2 ring-primary ring-offset-4 ring-offset-background' : ''
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={map.image} alt={map.displayName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
        <div className="truncate mr-2">
          <h4 className="text-white font-bold text-sm truncate">{map.displayName}</h4>
          <p className="text-gray-400 text-[9px] font-mono truncate opacity-60">{map.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onOpenConfig(map)}
            className="p-3 bg-gray-900/80 text-gray-400 rounded-xl opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-primary hover:text-white"
            title={t('Настройки', 'Settings')}
          >
            <Settings size={16} />
          </button>
          {map.type === 'Workshop' && (
            <button
              onClick={() => onRemoveWorkshop(map.id)}
              className="p-3 bg-red-500/10 text-red-500 rounded-xl opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
              title={t('Удалить', 'Remove')}
            >
              <Trash2 size={16} />
            </button>
          )}
          {!map.isActive && (
            <button
              onClick={() => onChangeMap(map)}
              disabled={isChanging || !isServerOnline}
              className="p-3 bg-primary text-white rounded-xl shadow-xl shadow-primary/40 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all md:translate-y-2 md:group-hover:translate-y-0 disabled:opacity-50"
              title={t('Запустить', 'Start')}
            >
              <Play size={18} fill="white" />
            </button>
          )}
        </div>
      </div>

      {map.isActive && (
        <div className="absolute top-4 right-4 bg-green-500 p-1.5 rounded-full text-white">
          <CheckCircle2 size={16} />
        </div>
      )}
    </div>
  )
}
