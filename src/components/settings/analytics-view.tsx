"use client"

import React from 'react'
import { RefreshCcw, Info } from 'lucide-react'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'

// System Analytics, laid out as the Quatrix Analytics page (range switch, one line chart with legend and tooltip).
// The chart is plain SVG drawn in the style of their recharts LineChart.

type Range = '24h' | '7d' | '30d'
interface Point { t: number; cpu: number; ram: number; players: number }

const W = 1000
const H = 460
const PAD = { left: 44, right: 20, top: 48, bottom: 36 }

export function AnalyticsView() {
  const { t, locale } = useT()
  const [range, setRange] = React.useState<Range>('24h')
  const [data, setData] = React.useState<Point[] | null>(null)
  const [fetching, setFetching] = React.useState(false)
  const [hover, setHover] = React.useState<number | null>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)

  const load = React.useCallback(async () => {
    setFetching(true)
    try { setData(await api<Point[]>(`/api/analytics?range=${range}`)) } catch { setData([]) } finally { setFetching(false) }
  }, [range])
  React.useEffect(() => { load() }, [load])

  const lines = [
    { key: 'cpu' as const, name: t('CPU ПК панели', 'CPU'), color: '#3b82f6', width: 3, unit: '%' },
    { key: 'ram' as const, name: t('RAM ПК панели', 'RAM'), color: '#a855f7', width: 3, unit: '%' },
    { key: 'players' as const, name: t('Игроки онлайн', 'Players online'), color: '#10b981', width: 2, unit: '' },
  ]

  const points = data ?? []
  const maxY = Math.max(100, ...points.map((p) => p.players))
  const x = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom)
  const fmtTime = (ms: number) => range === '24h'
    ? new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : new Date(ms).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  // A smooth path, as recharts' type="monotone" (simple Catmull-Rom to Bezier)
  const path = (key: Line['key']) => {
    const pts = points.map((p, i) => [x(i), y(p[key])] as const)
    if (pts.length < 2) return ''
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
    }
    return d
  }
  type Line = (typeof lines)[number]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length < 2 || !svgRef.current) return
    const box = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f))
  const xTicks = points.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (points.length - 1))) : []
  const hp = hover !== null ? points[hover] : null

  return (
    <div className="w-full p-3 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-end">
        <div className="flex items-center gap-2 bg-card p-1.5 rounded-xl border border-gray-800 shadow-sm">
          {(['24h', '7d', '30d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setHover(null) }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-tighter ${range === r ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
              {r.toUpperCase()}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-800 mx-1"></div>
          <button onClick={load} className={`p-1.5 text-gray-500 hover:text-white transition-all ${fetching ? 'text-primary' : ''}`} title={t('Обновить', 'Refresh')}>
            <RefreshCcw size={14} className={fetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-card p-4 md:p-8 rounded-2xl border border-gray-800 shadow-xl min-h-[600px] flex flex-col">
        <div className="flex items-center gap-2 mb-8 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10 max-w-fit">
          <Info size={16} className="text-blue-500 shrink-0" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {t('CPU и RAM - ПК, на котором работает панель. Игроки - сумма по всем серверам.', 'CPU and RAM of the panel PC; players summed over all servers.')}
          </p>
        </div>

        <div className="flex-1 w-full relative min-h-[460px]">
          {data === null ? (
            <div className="h-[460px] flex items-center justify-center"><RefreshCcw size={32} className="text-primary animate-spin" /></div>
          ) : points.length > 1 ? (
            <div className="relative">
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                {/* Legend */}
                <g>
                  {lines.map((l, i) => (
                    <g key={l.key} transform={`translate(${W / 2 - 180 + i * 140}, 16)`}>
                      <circle cx="0" cy="0" r="5" fill={l.color} />
                      <text x="12" y="4" fontSize="10" fontWeight="bold" fill={l.color} style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>{l.name}</text>
                    </g>
                  ))}
                </g>
                {/* Grid and axes */}
                {yTicks.map((v) => (
                  <g key={v}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1f2937" strokeDasharray="3 3" />
                    <text x={PAD.left - 10} y={y(v) + 3} fontSize="10" fill="#4b5563" textAnchor="end">{v}</text>
                  </g>
                ))}
                {xTicks.map((i, n) => (
                  <text key={n} x={x(i)} y={H - PAD.bottom + 20} fontSize="10" fill="#4b5563" textAnchor={n === 0 ? 'start' : n === xTicks.length - 1 ? 'end' : 'middle'}>{fmtTime(points[i].t)}</text>
                ))}
                <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#4b5563" />
                {/* Lines */}
                {lines.map((l) => <path key={l.key} d={path(l.key)} fill="none" stroke={l.color} strokeWidth={l.width} strokeLinejoin="round" />)}
                {/* Hover */}
                {hp && hover !== null && (
                  <g>
                    <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#4b5563" />
                    {lines.map((l) => <circle key={l.key} cx={x(hover)} cy={y(hp[l.key])} r={l.width === 3 ? 6 : 4} fill={l.color} />)}
                  </g>
                )}
              </svg>
              {hp && hover !== null && (
                <div
                  className="absolute top-10 pointer-events-none bg-[#1e293b] border border-gray-700 p-4 rounded-xl shadow-2xl backdrop-blur-md"
                  style={hover > points.length / 2 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}
                >
                  <p className="text-xs font-bold text-gray-400 mb-3 border-b border-gray-700 pb-2">{fmtTime(hp.t)}</p>
                  {lines.map((l) => (
                    <div key={l.key} className="flex items-center justify-between gap-6 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }}></div>
                        <span className="text-[11px] font-bold text-gray-300 uppercase">{l.name}</span>
                      </div>
                      <span className="text-xs font-black text-white">{hp[l.key].toFixed(l.unit ? 2 : 0)} {l.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-[460px] flex flex-col items-center justify-center text-gray-600 space-y-4">
              <Info size={48} />
              <p className="text-sm font-bold uppercase tracking-widest text-center">
                {t('Данных пока нет.', 'No analytics data collected yet.')}
                <br />
                <span className="text-[10px] text-gray-700">{t('Замеры делаются каждые 5 минут.', 'Data snapshots are taken every 5 minutes.')}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
