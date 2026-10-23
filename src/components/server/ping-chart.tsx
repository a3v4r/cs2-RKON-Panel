"use client";

import React from 'react';
import { Activity } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface PingSample {
  /** Unix timestamp (ms) of the poll that produced this value */
  t: number;
  ping: number;
}

interface PingChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples: PingSample[];
  average: number | null;
  current: number;
  serverName: string;
  online: boolean;
}

// A hole longer than three polls means the server did not answer: the line is
// broken there instead of drawing a straight segment across downtime.
const GAP_MS = 15_000;
const CHART_HEIGHT = 200;
const PAD = { top: 16, right: 12, bottom: 24, left: 38 };

function formatClock(t: number) {
  return new Date(t).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function samplesLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} замер`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} замера`;
  return `${count} замеров`;
}

// The chart is drawn at the container's real pixel width so the labels keep the
// same size on a phone and on a desktop (a scaled viewBox would shrink them).
function useElementWidth<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function PingChart({ samples, average }: { samples: PingSample[]; average: number | null }) {
  const [containerRef, measuredWidth] = useElementWidth<HTMLDivElement>();
  const width = measuredWidth > 0 ? measuredWidth : 560;
  const plotWidth = Math.max(width - PAD.left - PAD.right, 10);
  const plotHeight = CHART_HEIGHT - PAD.top - PAD.bottom;
  const baseY = PAD.top + plotHeight;

  const geometry = React.useMemo(() => {
    const values = samples.map((sample) => sample.ping);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max((rawMax - rawMin) * 0.15, 3);
    let yMin = Math.max(0, Math.floor(rawMin - padding));
    let yMax = Math.ceil(rawMax + padding);
    // Keep a flat line readable and give the average line some room
    if (yMax - yMin < 10) yMax = yMin + 10;
    const ySpan = yMax - yMin;

    const firstT = samples[0].t;
    const lastT = samples[samples.length - 1].t;
    const tSpan = Math.max(lastT - firstT, 1);

    const x = (t: number) =>
      samples.length === 1
        ? PAD.left + plotWidth / 2
        : PAD.left + ((t - firstT) / tSpan) * plotWidth;
    const y = (value: number) => PAD.top + ((yMax - value) / ySpan) * plotHeight;

    const ticks = Array.from({ length: 4 }, (_, i) => {
      const value = yMin + (ySpan * i) / 3;
      return { value, y: y(value) };
    });

    // Split into segments so downtime shows as a gap, not as invented latency
    const segments: PingSample[][] = [];
    for (const sample of samples) {
      const last = segments[segments.length - 1];
      if (last && sample.t - last[last.length - 1].t <= GAP_MS) last.push(sample);
      else segments.push([sample]);
    }

    return { x, y, ticks, segments, firstT, lastT };
  }, [samples, plotHeight, plotWidth]);

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="overflow-visible text-muted-foreground"
        role="img"
        aria-label="График пинга во времени"
      >
        <defs>
          <linearGradient id="ping-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {geometry.ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity={0.14}
              strokeDasharray={i === 0 ? undefined : '3 5'}
            />
            <text
              x={PAD.left - 6}
              y={tick.y + 3}
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              opacity={0.7}
            >
              {Math.round(tick.value)}
            </text>
          </g>
        ))}

        {average !== null && (
          <line
            x1={PAD.left}
            x2={PAD.left + plotWidth}
            y1={geometry.y(average)}
            y2={geometry.y(average)}
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.9}
          />
        )}

        {geometry.segments.map((segment, i) => {
          const points = segment
            .map((sample) => `${geometry.x(sample.t)},${geometry.y(sample.ping)}`)
            .join(' ');
          if (segment.length === 1) {
            return (
              <circle
                key={i}
                cx={geometry.x(segment[0].t)}
                cy={geometry.y(segment[0].ping)}
                r={2.5}
                fill="#10b981"
              />
            );
          }
          return (
            <g key={i}>
              <polygon
                points={`${geometry.x(segment[0].t)},${baseY} ${points} ${geometry.x(
                  segment[segment.length - 1].t,
                )},${baseY}`}
                fill="url(#ping-area-fill)"
              />
              <polyline
                points={points}
                fill="none"
                stroke="#10b981"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Current value stands out, the rest of the line stays calm */}
        {samples.length > 0 && (
          <circle
            cx={geometry.x(samples[samples.length - 1].t)}
            cy={geometry.y(samples[samples.length - 1].ping)}
            r={3}
            fill="#10b981"
            stroke="#09090b"
            strokeWidth={1.5}
          />
        )}

        <text
          x={PAD.left}
          y={CHART_HEIGHT - 7}
          textAnchor="start"
          fontSize={9}
          fill="currentColor"
          opacity={0.7}
        >
          {formatClock(geometry.firstT)}
        </text>
        {geometry.lastT > geometry.firstT && (
          <text
            x={PAD.left + plotWidth}
            y={CHART_HEIGHT - 7}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
            opacity={0.7}
          >
            {formatClock(geometry.lastT)}
          </text>
        )}
        <text x={4} y={10} fontSize={9} fill="currentColor" opacity={0.6}>
          ms
        </text>
      </svg>
    </div>
  );
}

function PingStat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-white/5 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </div>
      <div className={cn('text-sm font-bold leading-tight truncate', className)}>{value}</div>
    </div>
  );
}

export function PingChartDialog({
  open,
  onOpenChange,
  samples,
  average,
  current,
  serverName,
  online,
}: PingChartDialogProps) {
  const values = samples.map((sample) => sample.ping);
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;
  const durationMin =
    samples.length > 1
      ? Math.max(0, Math.round((samples[samples.length - 1].t - samples[0].t) / 60_000))
      : 0;

  const windowText =
    samples.length > 0
      ? `${samplesLabel(samples.length)}${durationMin >= 1 ? ` за ~${durationMin} мин` : ''}`
      : online
        ? 'замеров ещё нет'
        : 'сервер недоступен';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto bg-[#09090b] border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity size={16} className="text-emerald-500" />
            График пинга
          </DialogTitle>
          <DialogDescription className="truncate">
            {serverName} · {windowText}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PingStat
            label="Сейчас"
            value={online ? `${current}ms` : '—'}
            className="text-emerald-500"
          />
          <PingStat
            label="Средний"
            value={average !== null ? `${average}ms` : '—'}
            className="text-amber-500"
          />
          <PingStat label="Минимум" value={min !== null ? `${min}ms` : '—'} />
          <PingStat label="Максимум" value={max !== null ? `${max}ms` : '—'} />
        </div>

        {samples.length > 0 ? (
          <div className="rounded-lg border border-border bg-black/30 px-2 py-2">
            <PingChart samples={samples} average={average} />
            <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-emerald-500" />
                пинг по замерам
              </span>
              {average !== null && (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t border-dashed border-amber-500" />
                  средний
                </span>
              )}
              <span className="ml-auto">разрыв линии — сервер не отвечал</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
            <Activity size={20} className="opacity-50" />
            <span>
              {online
                ? 'Замеров пока нет — первые данные появятся после следующего опроса.'
                : 'Сервер недоступен, пинг не измеряется.'}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
