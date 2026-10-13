"use client";

import React, { useState } from 'react';
import { MessageSquare, Send, Clock, Save, Trash2, Plus, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

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
}

const INTERVALS = [1, 2, 3, 5, 10, 15, 30, 60];

export function ServerChat({ serverId, onBroadcast }: ServerChatProps) {
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
    run(() => onBroadcast(text.trim()), 'Отправлено в чат');
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
      <div className="grid gap-6 md:grid-cols-2">
        {/* Chat Input */}
        <div className="space-y-4">
          <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <MessageSquare size={18} className="mr-2 text-primary" />
              Сообщение в чат
            </h3>
            <div className="space-y-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Сообщение всем игрокам..."
                maxLength={200}
                className="w-full h-32 bg-white/5 border border-border rounded-md p-3 text-sm text-white resize-none focus:ring-1 focus:ring-primary outline-none"
              />
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="text-xs text-muted-foreground italic">
                  {status || <>Отправитель: <span className="text-primary font-bold">Console</span></>}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!message.trim()}
                    onClick={() => { setTemplateForm({ name: '', message }); setAddingTemplate(true); }}
                    className="h-11"
                    title="Сохранить как шаблон"
                  >
                    <Save size={16} />
                  </Button>
                  <Button
                    onClick={() => send(message)}
                    disabled={!message.trim()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-6"
                  >
                    Отправить
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]">
            <h3 className="text-lg font-semibold mb-1 flex items-center">
              <Clock size={18} className="mr-2 text-primary" />
              Автосообщения
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Отправляет сам сервер панели - работают, даже если все браузеры закрыты.
            </p>
            <div className="space-y-2">
              {autoMessages.length === 0 && !addingAuto && (
                <div className="text-sm text-muted-foreground/50 italic py-4 text-center border border-dashed border-border rounded-md">
                  На этом сервере автосообщений нет.
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
                    aria-label={m.enabled ? 'Выключить' : 'Включить'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white break-words">{m.message}</p>
                    <p className="text-xs text-muted-foreground">раз в {m.intervalMinutes} мин{m.enabled ? '' : ' • выключено'}</p>
                  </div>
                  <button
                    onClick={() => { if (confirm('Удалить это автосообщение?')) run(async () => { await api(`/api/auto-messages/${m.id}`, { method: 'DELETE' }); loadAuto(); }); }}
                    className="p-2 text-muted-foreground hover:text-red-500"
                    title="Удалить"
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
                  placeholder="Текст сообщения"
                  maxLength={200}
                  required
                  className="w-full h-20 bg-black/40 border border-border rounded-md p-2 text-sm text-white resize-none outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <select
                    value={autoForm.intervalMinutes}
                    onChange={(e) => setAutoForm({ ...autoForm, intervalMinutes: Number(e.target.value) })}
                    className="h-10 flex-1 rounded-md border border-border bg-[#18181b] px-2 text-sm text-white"
                    aria-label="Интервал"
                  >
                    {INTERVALS.map((n) => <option key={n} value={n}>раз в {n} мин</option>)}
                  </select>
                  <Button type="submit" className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground">Добавить</Button>
                  <Button type="button" variant="ghost" className="h-10" onClick={() => setAddingAuto(false)}>Отмена</Button>
                </div>
              </form>
            ) : (
              <Button
                variant="outline"
                className="w-full mt-4 border-dashed"
                onClick={() => { setAutoForm({ ...autoForm, message: autoForm.message || message }); setAddingAuto(true); }}
              >
                <Plus size={14} className="mr-2" />
                Добавить автосообщение
              </Button>
            )}
          </div>
        </div>

        {/* Templates */}
        <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Save size={18} className="mr-2 text-primary" />
              Шаблоны
            </h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAddingTemplate(!addingTemplate)} title="Добавить шаблон">
              <Plus size={16} />
            </Button>
          </div>

          {addingTemplate && (
            <form onSubmit={saveTemplate} className="mb-4 space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Название (необязательно)"
                maxLength={60}
                className="w-full h-10 bg-black/40 border border-border rounded-md px-2 text-sm text-white outline-none focus:border-primary"
              />
              <textarea
                value={templateForm.message}
                onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                placeholder="Текст сообщения"
                maxLength={200}
                required
                className="w-full h-20 bg-black/40 border border-border rounded-md p-2 text-sm text-white resize-none outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <Button type="submit" className="h-10 flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">Сохранить</Button>
                <Button type="button" variant="ghost" className="h-10" onClick={() => setAddingTemplate(false)}>Отмена</Button>
              </div>
            </form>
          )}

          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {templates.length === 0 && (
                <div className="text-sm text-muted-foreground/50 italic py-4 text-center">Шаблонов пока нет.</div>
              )}
              {templates.map((template) => (
                <div key={template.id} className="p-3 rounded-lg border border-border bg-white/5 hover:border-primary/30 transition-all group">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-bold text-white truncate">{template.name}</span>
                    <div className="flex items-center space-x-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setMessage(template.message)} className="p-2 hover:text-primary" title="Вставить в поле сообщения">
                        <CornerDownLeft size={14} />
                      </button>
                      <button onClick={() => send(template.message)} className="p-2 hover:text-primary" title="Отправить сразу">
                        <Send size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Удалить шаблон «${template.name}»?`)) run(async () => { await api(`/api/templates/${template.id}`, { method: 'DELETE' }); loadTemplates(); }); }}
                        className="p-2 hover:text-red-500"
                        title="Удалить"
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
