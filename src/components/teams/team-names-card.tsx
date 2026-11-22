"use client";

import React from 'react';
import { Shield, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { CustomSelect } from '@/components/ui/custom-select';
import { Team, teamsApi } from '@/lib/teams';

// Team names on the scoreboard without a MatchZy match (mp_teamname_1/2, mp_teamflag_1/2).
// A loaded MatchZy match sets them from its config itself.
// stacked: the two teams one under the other on wide screens, where the card sits in a narrow side column
export function TeamNamesCard({ onSendCommand, onOpenLibrary, stacked }: { onSendCommand: (command: string) => Promise<string>; onOpenLibrary: () => void; stacked?: boolean }) {
  const { t } = useT();
  const [library, setLibrary] = React.useState<Team[]>([]);
  const [slots, setSlots] = React.useState([{ id: 0, name: '', flag: '' }, { id: 0, name: '', flag: '' }]);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    teamsApi.list().then(setLibrary).catch(() => {});
  }, []);

  const pick = (i: number, id: number) => {
    const team = library.find((tm) => tm.id === id);
    setSlots((s) => s.map((slot, j) => (j === i ? { id, name: team?.name ?? slot.name, flag: team?.flag ?? '' } : slot)));
  };
  const setName = (i: number, name: string) => setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, name } : slot)));

  // Quotes and ; would break the console command
  const clean = (text: string) => text.replace(/["';]/g, '').trim();

  const apply = async () => {
    setBusy(true);
    setStatus(null);
    try {
      for (const [i, slot] of slots.entries()) {
        await onSendCommand(`mp_teamname_${i + 1} "${clean(slot.name)}"`);
        await onSendCommand(`mp_teamflag_${i + 1} "${clean(slot.flag)}"`);
      }
      setStatus({ ok: true, text: t('Названия заданы', 'Names set') });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { value: 0, label: t('Вручную', 'By hand') },
    ...library.map((tm) => ({ value: tm.id, label: tm.tag ? `${tm.name} [${tm.tag}]` : tm.name })),
  ];

  return (
    <div className="p-4 sm:p-6 bg-card rounded-2xl border border-gray-800/60 shadow-lg shadow-black/20 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0"><Shield size={20} /></div>
          <div className="min-w-0">
            <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{t('Названия команд', 'Team names')}</h3>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{t('до старта, без матча MatchZy', 'before the start, without a MatchZy match')}</p>
          </div>
        </div>
        <button type="button" onClick={onOpenLibrary} className="shrink-0 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary transition-colors">
          {t('Библиотека', 'Library')}
        </button>
      </div>

      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', stacked && 'xl:grid-cols-1')}>
        {slots.map((slot, i) => (
          <div key={i} className="space-y-2 min-w-0">
            <div className={cn('text-[10px] font-black uppercase tracking-wider', i === 0 ? 'text-sky-400' : 'text-amber-400')}>
              {i === 0 ? t('Команда 1 · CT в начале', 'Team 1 · CT at start') : t('Команда 2 · T в начале', 'Team 2 · T at start')}
            </div>
            {library.length > 0 && <CustomSelect size="sm" className="h-[34px]" options={options} value={slot.id} onChange={(id) => pick(i, id)} />}
            <input
              value={slot.name}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={i === 0 ? t('Команда 1', 'Team 1') : t('Команда 2', 'Team 2')}
              maxLength={40}
              className="w-full bg-background/50 border border-gray-800 rounded-xl px-3 h-[34px] text-sm text-white placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="px-5 h-[34px] rounded-xl bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {busy ? t('Отправка...', 'Sending...') : t('Задать', 'Apply')}
        </button>
        {status && (
          <span className={cn('min-w-0 flex items-center gap-1.5 text-xs font-medium', status.ok ? 'text-emerald-400' : 'text-red-400')}>
            {status.ok ? <Check size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
            <span className="truncate">{status.text}</span>
          </span>
        )}
      </div>
    </div>
  );
}
