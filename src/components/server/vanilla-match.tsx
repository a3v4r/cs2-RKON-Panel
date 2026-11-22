"use client";

import React from 'react';
import { AlertCircle, CheckCircle2, Coffee, History, Play, RefreshCw, Repeat, Scale, Swords, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { TeamNamesCard } from '@/components/teams/team-names-card';
import { RulesetId, backupFileName, batchCommands, parseBackupFiles, vanillaSteps } from '@/lib/vanilla';

// MatchZy or Vanilla for this server, above the Match setup page
export function MatchModeSwitch({ vanilla, onChange }: { vanilla: boolean; onChange: (vanilla: boolean) => Promise<void> }) {
  const { t } = useT();
  const [busy, setBusy] = React.useState(false);
  const pick = async (next: boolean) => {
    if (next === vanilla || busy) return;
    setBusy(true);
    try {
      await onChange(next);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const option = (on: boolean, label: string, hint: string, value: boolean) => (
    <button
      type="button"
      onClick={() => pick(value)}
      disabled={busy}
      className={cn('flex-1 min-w-0 text-left px-4 py-2.5 rounded-xl border transition-all disabled:opacity-60', on ? 'border-primary bg-primary/10' : 'border-gray-800 bg-background/50 hover:border-primary/50')}
    >
      <div className={cn('text-xs font-black uppercase tracking-wider', on ? 'text-primary' : 'text-gray-300')}>{label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</div>
    </button>
  );
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {option(!vanilla, 'MatchZy', t('Конфиг матча, вето, live-статистика и откаты через плагин', 'Match config, veto, live stats and rollbacks through the plugin'), false)}
      {option(vanilla, 'Vanilla', t('Сервер без плагинов: правила, нож и паузы обычными командами по RCON', 'Server without plugins: rules, knife and pauses by plain RCON commands'), true)}
    </div>
  );
}

// Match control for a server without MatchZy. The knife round is by hand: the judge sees who won and picks the side.
export function VanillaMatch({ onSendCommand, onOpenLibrary }: { onSendCommand: (command: string) => Promise<string>; onOpenLibrary: () => void }) {
  const { t } = useT();
  const [ruleset, setRuleset] = React.useState<RulesetId>('5v5');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  const run = async (commands: string[], done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      for (const batch of batchCommands(commands)) await onSendCommand(batch);
      setStatus({ ok: true, text: done });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rulesets: { id: RulesetId; title: string; detail: string }[] = [
    { id: '5v5', title: t('5 на 5', '5 vs 5'), detail: t('MR12, овертайм MR3 по $12 500, фризтайм 20 с', 'MR12, MR3 overtime with $12,500, 20 s freeze time') },
    { id: '2v2', title: t('2 на 2 · Wingman', '2 vs 2 · Wingman'), detail: t('MR8, овертайм MR3 по $10 000, фризтайм 10 с', 'MR8, MR3 overtime with $10,000, 10 s freeze time') },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {status && (
        <div className={cn('p-4 rounded-xl text-sm font-medium flex items-start gap-2 border', status.ok ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20')}>
          {status.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
          <span className="min-w-0 break-words">{status.text}</span>
        </div>
      )}

      <div className="grid gap-4 md:gap-6 xl:grid-cols-3 items-start">
        <div className="xl:col-span-2 space-y-4 md:space-y-6 min-w-0">
          {/* Rules */}
          <section className={cn(CARD, 'p-4 sm:p-6 space-y-5')}>
            <CardHeader icon={<Scale size={18} />} title={t('Правила', 'Rules')} subtitle={t('отправляются на сервер по RCON', 'sent to the server over RCON')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rulesets.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setRuleset(r.id)}
                  className={cn('text-left p-4 rounded-xl border transition-all', ruleset === r.id ? 'border-primary bg-primary/10' : 'border-gray-800 bg-background/50 hover:border-primary/50')}
                >
                  <div className={cn('text-sm font-black uppercase tracking-wider', ruleset === r.id ? 'text-primary' : 'text-white')}>{r.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.detail}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy} onClick={() => run(vanillaSteps.warmup(ruleset), t('Правила применены, идёт разминка без таймера', 'Rules applied, warmup without a timer'))} className={cn(BTN, 'bg-white/5 hover:bg-white/10 text-white border border-gray-800')}>
                <Coffee size={16} /> {t('Разминка с этими правилами', 'Warmup with these rules')}
              </button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {t('Смена карты возвращает настройки сервера из его cfg: после смены карты нажмите кнопку ещё раз. Названия команд задаются в карточке справа.',
                'A map change brings back the server settings from its cfg: press the button again after a map change. Team names are set in the card on the right.')}
            </p>
          </section>

          {/* Start */}
          <section className={cn(CARD, 'p-4 sm:p-6 space-y-5')}>
            <CardHeader icon={<Swords size={18} />} title={t('Старт', 'Start')} subtitle={t('нож или сразу в игру', 'knife or straight to the game')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" disabled={busy} onClick={() => run(vanillaSteps.knife(ruleset), t('Идёт ножевой раунд. Когда он закончится, выберите ниже, что выбрал победитель.', 'Knife round is on. When it ends, pick below what the winners chose.'))} className={cn(BTN, 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-900/30')}>
                <Swords size={16} /> {t('Ножевой раунд', 'Knife round')}
              </button>
              <button type="button" disabled={busy} onClick={() => run(vanillaSteps.live(ruleset, false), t('Матч начался', 'Match started'))} className={cn(BTN, 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30')}>
                <Play size={16} /> {t('Сразу в игру', 'Go live now')}
              </button>
            </div>

            <div className="p-4 rounded-xl border border-gray-800 bg-background/50 space-y-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">{t('После ножа: победитель выбрал', 'After the knife: the winners chose')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button type="button" disabled={busy} onClick={() => run(vanillaSteps.live(ruleset, false), t('Стороны остались, матч начался', 'Sides kept, match started'))} className={cn(BTN, 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20')}>
                  <Play size={16} /> {t('Остаться', 'Stay')}
                </button>
                <button type="button" disabled={busy} onClick={() => run(vanillaSteps.live(ruleset, true), t('Стороны сменены, матч начался', 'Sides switched, match started'))} className={cn(BTN, 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20')}>
                  <Repeat size={16} /> {t('Сменить стороны', 'Switch sides')}
                </button>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t('Пока команда решает, можно поставить паузу на «Обзоре». Обе кнопки возвращают правила, снимают паузу и перезапускают игру со счёта 0:0.',
                  'While the team decides you can pause on the Overview. Both buttons bring the rules back, unpause and restart the game at 0:0.')}
              </p>
            </div>
          </section>

          <RoundRollback onSendCommand={onSendCommand} />
        </div>

        <div className="min-w-0">
          <TeamNamesCard onSendCommand={onSendCommand} onOpenLibrary={onOpenLibrary} stacked />
        </div>
      </div>
    </div>
  );
}

// Round rollback by the game's own round backups (mp_backup_restore_*), no plugin needed
function RoundRollback({ onSendCommand }: { onSendCommand: (command: string) => Promise<string> }) {
  const { t } = useT();
  const [files, setFiles] = React.useState<{ file: string; round: number }[] | null>(null);
  const [raw, setRaw] = React.useState('');
  const [round, setRound] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  const list = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const output = await onSendCommand('mp_backup_restore_list_files');
      setFiles(parseBackupFiles(output));
      setRaw(output.trim());
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: string, label: string) => {
    if (!confirm(t(`Откатить игру ${label}?`, `Roll the game back ${label}?`))) return;
    setBusy(true);
    setStatus(null);
    try {
      // The server log is echoed into the reply (sv_logecho): keep the server's own answer, "Loaded server checkpoint ..."
      const output = (await onSendCommand(`mp_backup_restore_load_file ${file}`)).split('\n').map((l) => l.trim()).filter((l) => l && !/^L \d\d\//.test(l)).join(' ');
      setStatus({ ok: true, text: output ? `${t('Команда отправлена', 'Command sent')}: ${output}` : t('Команда отправлена', 'Command sent') });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toRound = (n: number) => t(`к началу раунда ${n}`, `to the start of round ${n}`);
  const manual = Number(round);

  return (
    <section className={cn(CARD, 'p-4 sm:p-6 space-y-4')}>
      <div className="flex items-center justify-between gap-3">
        <CardHeader icon={<History size={18} />} title={t('Откат раунда', 'Round rollback')} subtitle={t('бэкапы раундов самой игры', 'the game\'s own round backups')} />
        <button type="button" onClick={list} disabled={busy} className="shrink-0 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {t('Список', 'List')}
        </button>
      </div>

      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <button key={f.file} type="button" disabled={busy} onClick={() => restore(f.file, toRound(f.round + 1))} title={f.file} className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-xl border border-gray-800 bg-background/50 hover:border-primary/50 text-xs font-bold text-gray-200 transition-all disabled:opacity-50">
              <Undo2 size={12} className="text-primary" /> {t(`Раунд ${f.round + 1}`, `Round ${f.round + 1}`)}
            </button>
          ))}
        </div>
      )}
      {files && files.length === 0 && (
        <div className="text-xs text-gray-500 space-y-2">
          {raw.includes('allow_round_backup_files') ? (
            <p className="text-amber-400">{t('Бэкапы раундов на сервере выключены: CS2 пишет их только с параметром запуска -allow_round_backup_files. Серверам, созданным в панели, он добавляется сам (нужен перезапуск сервера); чужому серверу добавьте его в строку запуска.',
              'Round backups are off on the server: CS2 writes them only with the -allow_round_backup_files launch option. Servers created in the panel get it automatically (restart the server); for another server add it to its launch line.')}</p>
          ) : (
            <p>{t('Сервер не прислал файлов бэкапа. Ответ сервера:', 'The server listed no backup files. Server reply:')}</p>
          )}
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-gray-400 bg-background/50 border border-gray-800 rounded-xl p-3 max-h-40 overflow-auto">{raw || '—'}</pre>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">{t('К началу раунда', 'To the start of round')}</span>
        <input
          value={round}
          onChange={(e) => setRound(e.target.value.replace(/\D/g, '').slice(0, 2))}
          inputMode="numeric"
          placeholder="№"
          className="w-16 bg-background/50 border border-gray-800 rounded-xl px-3 h-[34px] text-sm text-white text-center placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button type="button" disabled={busy || !(manual >= 1)} onClick={() => restore(backupFileName(manual - 1), toRound(manual))} className="px-4 h-[34px] rounded-xl bg-white/5 hover:bg-white/10 border border-gray-800 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50">
          {t('Откатить', 'Roll back')}
        </button>
      </div>
      {status && (
        <div className={cn('flex items-start gap-1.5 text-xs font-medium', status.ok ? 'text-emerald-400' : 'text-red-400')}>
          {status.ok ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertCircle size={14} className="shrink-0 mt-px" />}
          <span className="min-w-0 break-words">{status.text}</span>
        </div>
      )}
      <p className="text-xs text-gray-500 leading-relaxed">
        {t('Игра сохраняет состояние в начале каждого раунда (mp_backup_round_auto, включается правилами выше), если сервер запущен с -allow_round_backup_files. Файл backup_round05.txt — начало 6-го раунда.',
          'The game saves its state at the start of every round (mp_backup_round_auto, turned on by the rules above) when the server runs with -allow_round_backup_files. backup_round05.txt is the start of round 6.')}
      </p>
    </section>
  );
}

function CardHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{title}</h3>
        {subtitle && <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Quatrix design tokens, the same as on the Match setup page
const CARD = 'bg-card rounded-2xl border border-gray-800 shadow-2xl';
const BTN = 'inline-flex items-center justify-center gap-2 px-5 py-1.5 text-sm rounded-xl font-bold h-[38px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
