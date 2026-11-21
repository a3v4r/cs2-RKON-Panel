"use client";

import React, { useState } from 'react';
import { Send, Clock, Save, Trash2, Plus, CornerDownLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { ChatHistory } from './chat-history';
import { CustomSelect } from '@/components/ui/custom-select';

interface Template {
  id: number;
  name: string;
  message: string;
}

interface AutoMessage {
  id: number;
  message: string;
  intervalMinutes: number;
  enabled: boolean;
}

interface ServerChatProps {
  serverId: number;
  onBroadcast: (message: string) => Promise<string>;
  // Started by the panel: the chat log is set up in its cfg
  managed?: boolean;
}

const INTERVALS = [1, 2, 3, 5, 10, 15, 30, 60];

// Quatrix styles: cards, form inputs, Button (md) and IconButton (sm, ghost)
const card = 'bg-card border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-2xl';
const field = 'w-full bg-background/50 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600';
const btn = 'flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap px-5 py-1.5 text-sm rounded-xl font-bold h-[34px]';
const btnPrimary = 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95';
const btnSecondary = 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700/50 active:scale-95';
const btnGhost = 'text-gray-400 hover:text-white hover:bg-white/5 active:scale-95';
const iconBtnSm = 'flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed p-1 rounded-lg w-7 h-7 shrink-0 text-gray-400 hover:text-white hover:bg-white/5';

// Quatrix Switch (track + thumb on a hidden checkbox)
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group select-none" title={label}>
      <div className="relative flex items-center shrink-0 mt-0.5">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <div className="w-10 h-5 bg-white/5 border border-white/10 rounded-full transition-all duration-300 peer-checked:bg-primary/20 peer-checked:border-primary/50 group-hover:border-white/20" />
        <div className="absolute left-1 top-1 w-3 h-3 bg-gray-400 rounded-full transition-all duration-300 transform peer-checked:translate-x-5 peer-checked:bg-primary peer-checked:shadow-[0_0_10px_rgba(59,130,246,0.8)] peer-checked:scale-110" />
      </div>
    </label>
  );
}

export function ServerChat({ serverId, onBroadcast, managed }: ServerChatProps) {
  const { t } = useT();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [autoMessages, setAutoMessages] = useState<AutoMessage[]>([]);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', message: '' });
  const [addingAuto, setAddingAuto] = useState(false);
  const [autoForm, setAutoForm] = useState({ message: '', intervalMinutes: 5 });

  const loadTemplates = React.useCallback(() => {
    api<Template[]>('/api/templates').then(setTemplates).catch((e) => setStatus(e.message));
  }, []);
  const loadAuto = React.useCallback(() => {
    api<AutoMessage[]>(`/api/servers/${serverId}/auto-messages`).then(setAutoMessages).catch((e) => setStatus(e.message));
  }, [serverId]);

  React.useEffect(loadTemplates, [loadTemplates]);
  React.useEffect(loadAuto, [loadAuto]);

  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(''), 3000);
  };

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) flash(done);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    run(() => onBroadcast(text.trim()), t('Отправлено в чат', 'Sent to chat'));
  };

  const saveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api('/api/templates', { body: templateForm });
      setTemplateForm({ name: '', message: '' });
      setAddingTemplate(false);
      loadTemplates();
    });
  };

  const saveAuto = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/servers/${serverId}/auto-messages`, { body: autoForm });
      setAutoForm({ message: '', intervalMinutes: autoForm.intervalMinutes });
      setAddingAuto(false);
      loadAuto();
    });
  };

  return (
    <div className="p-3 md:p-6 grid gap-4 md:gap-6 xl:grid-cols-3 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="xl:col-span-2 min-w-0">
      <ChatHistory
        serverId={serverId}
        managed={managed}
        footer={
          <form onSubmit={(e) => { e.preventDefault(); send(message); setMessage(''); }} className="space-y-2">
            <div className="flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('Сообщение всем игрокам...', 'Message to all players...')}
                maxLength={200}
                className="flex-1 min-w-0 h-11 bg-background/50 border border-gray-800 rounded-xl px-4 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-gray-600"
              />
              <button
                type="button"
                disabled={!message.trim()}
                onClick={() => { setTemplateForm({ name: '', message }); setAddingTemplate(true); }}
                className="flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-background/50 border border-gray-800 hover:border-primary/50 text-gray-400 hover:text-primary transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('Сохранить как шаблон', 'Save as template')}
                aria-label={t('Сохранить как шаблон', 'Save as template')}
              >
                <Save size={16} />
              </button>
              <button
                type="submit"
                disabled={!message.trim()}
                className="h-11 inline-flex items-center justify-center gap-2 px-4 sm:px-6 rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('Отправить', 'Send')}
              >
                <Send size={16} />
                <span className="hidden sm:inline">{t('Отправить', 'Send')}</span>
              </button>
            </div>
            <div className="text-[11px] text-gray-500 px-1">
              {status || <>{t('Сообщение уйдёт в общий чат от имени', 'The message goes to all chat as')} <span className="text-primary font-bold">Console</span></>}
            </div>
          </form>
        }
      />
      </div>

      <div className="space-y-4 md:space-y-6 min-w-0">
        {/* Auto messages */}
        <section className={card}>
          <CardHeader icon={<Clock size={18} />} title={t('Автосообщения', 'Auto messages')} subtitle={t('шлёт сервер панели, даже без браузера', 'sent by the panel, no browser needed')} />
          <div className="mt-5 space-y-2">
            {autoMessages.length === 0 && !addingAuto && (
              <div className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-800 rounded-xl">
                {t('На этом сервере автосообщений нет.', 'No auto messages on this server.')}
              </div>
            )}
            {autoMessages.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-4 rounded-xl border border-gray-800 bg-background/50 hover:border-primary/30 transition-all group">
                <Toggle
                  checked={m.enabled}
                  onChange={(checked) => run(async () => {
                    await api(`/api/auto-messages/${m.id}`, { method: 'PUT', body: { enabled: checked } });
                    loadAuto();
                  })}
                  label={m.enabled ? t('Выключить', 'Turn off') : t('Включить', 'Turn on')}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 break-words">{m.message}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{t(`раз в ${m.intervalMinutes} мин`, `every ${m.intervalMinutes} min`)}{m.enabled ? '' : t(' • выключено', ' • off')}</p>
                </div>
                <button
                  onClick={() => { if (confirm(t('Удалить это автосообщение?', 'Delete this auto message?'))) run(async () => { await api(`/api/auto-messages/${m.id}`, { method: 'DELETE' }); loadAuto(); }); }}
                  className={cn(iconBtnSm, 'hover:text-red-400 hover:bg-red-500/10')}
                  title={t('Удалить', 'Delete')}
                  aria-label={t('Удалить', 'Delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {addingAuto ? (
            <form onSubmit={saveAuto} className="mt-4 space-y-3">
              <textarea
                value={autoForm.message}
                onChange={(e) => setAutoForm({ ...autoForm, message: e.target.value })}
                placeholder={t('Текст сообщения', 'Message text')}
                maxLength={200}
                required
                className={cn(field, 'h-24 resize-none')}
              />
              <CustomSelect
                options={INTERVALS.map((n) => ({ value: n, label: t(`раз в ${n} мин`, `every ${n} min`) }))}
                value={autoForm.intervalMinutes}
                onChange={(v) => setAutoForm({ ...autoForm, intervalMinutes: v })}
                icon={<Clock className="w-4 h-4" />}
              />
              <div className="flex gap-2">
                <button type="submit" className={cn(btn, btnPrimary, 'flex-1')}>{t('Добавить', 'Add')}</button>
                <button type="button" className={cn(btn, btnGhost)} onClick={() => setAddingAuto(false)}>{t('Отмена', 'Cancel')}</button>
              </div>
            </form>
          ) : (
            <button
              className={cn(btn, btnSecondary, 'w-full mt-4')}
              onClick={() => { setAutoForm({ ...autoForm, message: autoForm.message || message }); setAddingAuto(true); }}
            >
              <span className="mr-2"><Plus size={14} /></span>
              {t('Добавить автосообщение', 'Add auto message')}
            </button>
          )}
        </section>

        {/* Templates */}
        <section className={card}>
          <div className="flex items-center justify-between gap-2 mb-5">
            <CardHeader icon={<Save size={18} />} title={t('Шаблоны', 'Templates')} subtitle={t('вставить или отправить сразу', 'insert or send at once')} />
            <button
              onClick={() => setAddingTemplate(!addingTemplate)}
              className={cn(iconBtnSm, addingTemplate && 'text-primary hover:text-primary')}
              title={t('Добавить шаблон', 'Add template')}
              aria-label={t('Добавить шаблон', 'Add template')}
            >
              <Plus size={16} />
            </button>
          </div>

          {addingTemplate && (
            <form onSubmit={saveTemplate} className="mb-4 space-y-3">
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder={t('Название (необязательно)', 'Name (optional)')}
                maxLength={60}
                className={field}
              />
              <textarea
                value={templateForm.message}
                onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                placeholder={t('Текст сообщения', 'Message text')}
                maxLength={200}
                required
                className={cn(field, 'h-24 resize-none')}
              />
              <div className="flex gap-2">
                <button type="submit" className={cn(btn, btnPrimary, 'flex-1')}>{t('Сохранить', 'Save')}</button>
                <button type="button" className={cn(btn, btnGhost)} onClick={() => setAddingTemplate(false)}>{t('Отмена', 'Cancel')}</button>
              </div>
            </form>
          )}

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <div className="space-y-2">
              {templates.length === 0 && (
                <div className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-800 rounded-xl">{t('Шаблонов пока нет.', 'No templates yet.')}</div>
              )}
              {templates.map((template) => (
                <div key={template.id} className="p-4 rounded-xl border border-gray-800 bg-background/50 hover:border-primary/30 transition-all group">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-bold text-white truncate">{template.name}</span>
                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setMessage(template.message)} className={cn(iconBtnSm, 'hover:text-primary')} title={t('Вставить в поле сообщения', 'Insert into message field')} aria-label={t('Вставить в поле сообщения', 'Insert into message field')}>
                        <CornerDownLeft size={14} />
                      </button>
                      <button onClick={() => send(template.message)} className={cn(iconBtnSm, 'hover:text-primary')} title={t('Отправить сразу', 'Send now')} aria-label={t('Отправить сразу', 'Send now')}>
                        <Send size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(t(`Удалить шаблон «${template.name}»?`, `Delete template "${template.name}"?`))) run(async () => { await api(`/api/templates/${template.id}`, { method: 'DELETE' }); loadTemplates(); }); }}
                        className={cn(iconBtnSm, 'hover:text-red-400 hover:bg-red-500/10')}
                        title={t('Удалить', 'Delete')}
                        aria-label={t('Удалить', 'Delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{template.message}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Header as on the Match and Console pages
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
