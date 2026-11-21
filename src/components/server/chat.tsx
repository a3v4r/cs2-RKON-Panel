"use client";

import React, { useState } from 'react';
import { Send, Clock, Save, Trash2, Plus, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { ChatHistory } from './chat-history';

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
    <div className="p-3 md:p-6 space-y-6 animate-in fade-in duration-500">
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
                className="flex-1 min-w-0 h-[42px] bg-background/50 border border-gray-800 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-xl px-4 text-sm text-gray-200 placeholder-gray-600 outline-none transition-all"
              />
              <button
                type="button"
                disabled={!message.trim()}
                onClick={() => { setTemplateForm({ name: '', message }); setAddingTemplate(true); }}
                className="flex items-center justify-center w-[42px] h-[42px] shrink-0 rounded-xl border border-gray-800 text-gray-400 hover:text-primary hover:border-primary/50 transition-all active:scale-95 disabled:opacity-50"
                title={t('Сохранить как шаблон', 'Save as template')}
              >
                <Save size={16} />
              </button>
              <button
                type="submit"
                disabled={!message.trim()}
                className="flex items-center justify-center gap-2 h-[42px] px-5 shrink-0 rounded-xl bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Send size={16} />
                <span className="hidden sm:inline">{t('Отправить', 'Send')}</span>
              </button>
            </div>
            <div className="text-xs text-muted-foreground italic px-1">
              {status || <>{t('Отправитель:', 'Sender:')} <span className="text-primary font-bold">Console</span></>}
            </div>
          </form>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
          <div className="p-4 md:p-6 rounded-2xl border border-border bg-card shadow-lg shadow-black/20">
            <h3 className="text-lg font-semibold mb-1 flex items-center">
              <Clock size={18} className="mr-2 text-primary" />
              {t('Автосообщения', 'Auto messages')}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {t('Отправляет сам сервер панели - работают, даже если все браузеры закрыты.', 'Sent by the panel server itself - they work even with all browsers closed.')}
            </p>
            <div className="space-y-2">
              {autoMessages.length === 0 && !addingAuto && (
                <div className="text-sm text-muted-foreground/50 italic py-4 text-center border border-dashed border-border rounded-md">
                  {t('На этом сервере автосообщений нет.', 'No auto messages on this server.')}
                </div>
              )}
              {autoMessages.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white/5">
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(checked) => run(async () => {
                      await api(`/api/auto-messages/${m.id}`, { method: 'PUT', body: { enabled: checked } });
                      loadAuto();
                    })}
                    aria-label={m.enabled ? t('Выключить', 'Turn off') : t('Включить', 'Turn on')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white break-words">{m.message}</p>
                    <p className="text-xs text-muted-foreground">{t(`раз в ${m.intervalMinutes} мин`, `every ${m.intervalMinutes} min`)}{m.enabled ? '' : t(' • выключено', ' • off')}</p>
                  </div>
                  <button
                    onClick={() => { if (confirm(t('Удалить это автосообщение?', 'Delete this auto message?'))) run(async () => { await api(`/api/auto-messages/${m.id}`, { method: 'DELETE' }); loadAuto(); }); }}
                    className="p-2 text-muted-foreground hover:text-red-500"
                    title={t('Удалить', 'Delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {addingAuto ? (
              <form onSubmit={saveAuto} className="mt-4 space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <textarea
                  value={autoForm.message}
                  onChange={(e) => setAutoForm({ ...autoForm, message: e.target.value })}
                  placeholder={t('Текст сообщения', 'Message text')}
                  maxLength={200}
                  required
                  className="w-full h-20 bg-black/40 border border-border rounded-md p-2 text-sm text-white resize-none outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <select
                    value={autoForm.intervalMinutes}
                    onChange={(e) => setAutoForm({ ...autoForm, intervalMinutes: Number(e.target.value) })}
                    className="h-10 flex-1 rounded-md border border-border bg-background/50 px-2 text-sm text-white"
                    aria-label={t('Интервал', 'Interval')}
                  >
                    {INTERVALS.map((n) => <option key={n} value={n}>{t(`раз в ${n} мин`, `every ${n} min`)}</option>)}
                  </select>
                  <Button type="submit" className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground">{t('Добавить', 'Add')}</Button>
                  <Button type="button" variant="ghost" className="h-10" onClick={() => setAddingAuto(false)}>{t('Отмена', 'Cancel')}</Button>
                </div>
              </form>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 border-dashed"
                onClick={() => { setAutoForm({ ...autoForm, message: autoForm.message || message }); setAddingAuto(true); }}
              >
                <Plus size={14} className="mr-2" />
                {t('Добавить автосообщение', 'Add auto message')}
              </Button>
            )}
          </div>

        {/* Templates */}
        <div className="p-4 md:p-6 rounded-2xl border border-border bg-card shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Save size={18} className="mr-2 text-primary" />
              {t('Шаблоны', 'Templates')}
            </h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAddingTemplate(!addingTemplate)} title={t('Добавить шаблон', 'Add template')}>
              <Plus size={16} />
            </Button>
          </div>

          {addingTemplate && (
            <form onSubmit={saveTemplate} className="mb-4 space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder={t('Название (необязательно)', 'Name (optional)')}
                maxLength={60}
                className="w-full h-10 bg-black/40 border border-border rounded-md px-2 text-sm text-white outline-none focus:border-primary"
              />
              <textarea
                value={templateForm.message}
                onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                placeholder={t('Текст сообщения', 'Message text')}
                maxLength={200}
                required
                className="w-full h-20 bg-black/40 border border-border rounded-md p-2 text-sm text-white resize-none outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <Button type="submit" className="h-10 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">{t('Сохранить', 'Save')}</Button>
                <Button type="button" variant="ghost" className="h-10" onClick={() => setAddingTemplate(false)}>{t('Отмена', 'Cancel')}</Button>
              </div>
            </form>
          )}

          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {templates.length === 0 && (
                <div className="text-sm text-muted-foreground/50 italic py-4 text-center">{t('Шаблонов пока нет.', 'No templates yet.')}</div>
              )}
              {templates.map((template) => (
                <div key={template.id} className="p-3 rounded-lg border border-border bg-white/5 hover:border-primary/30 transition-all group">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-bold text-white truncate">{template.name}</span>
                    <div className="flex items-center space-x-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setMessage(template.message)} className="p-2 hover:text-primary" title={t('Вставить в поле сообщения', 'Insert into message field')}>
                        <CornerDownLeft size={14} />
                      </button>
                      <button onClick={() => send(template.message)} className="p-2 hover:text-primary" title={t('Отправить сразу', 'Send now')}>
                        <Send size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(t(`Удалить шаблон «${template.name}»?`, `Delete template "${template.name}"?`))) run(async () => { await api(`/api/templates/${template.id}`, { method: 'DELETE' }); loadTemplates(); }); }}
                        className="p-2 hover:text-red-500"
                        title={t('Удалить', 'Delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{template.message}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
