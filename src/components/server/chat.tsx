"use client";

import React, { useState } from 'react';
import { MessageSquare, Send, Clock, Save, Trash2, Plus, CornerDownLeft, MessagesSquare, RefreshCw, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

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

interface CollectedMessage {
  id: number;
  at: string;
  author: string;
  steamId: string;
  team: string;
  teamOnly: boolean;
  text: string;
  console: boolean;
}

interface CollectorStatus {
  url: string | null;
  lastPacketAt: string | null;
  lastConfiguredAt: string | null;
  lastError: string | null;
}

interface ChatResponse {
  messages: CollectedMessage[];
  collector: CollectorStatus;
}

interface ServerChatProps {
  serverId: number;
  onBroadcast: (message: string) => Promise<string>;
}

const INTERVALS = [1, 2, 3, 5, 10, 15, 30, 60];

const TEAM_LABEL: Record<string, string> = { CT: 'CT', T: 'T', SPEC: 'SPEC' };

const teamClass = (team: string) =>
  team === 'CT'
    ? 'bg-blue-500/15 text-blue-300 border-blue-500/20'
    : team === 'T'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
      : 'bg-white/5 text-muted-foreground border-border';

const timeLabel = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export function ServerChat({ serverId, onBroadcast }: ServerChatProps) {
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [autoMessages, setAutoMessages] = useState<AutoMessage[]>([]);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', message: '' });
  const [addingAuto, setAddingAuto] = useState(false);
  const [autoForm, setAutoForm] = useState({ message: '', intervalMinutes: 5 });
  const [chatMessages, setChatMessages] = useState<CollectedMessage[]>([]);
  const [collector, setCollector] = useState<CollectorStatus | null>(null);
  const [chatError, setChatError] = useState('');
  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const loadTemplates = React.useCallback(() => {
    api<Template[]>('/api/templates').then(setTemplates).catch((e) => toast.error(`Шаблоны не загрузились: ${(e as Error).message}`));
  }, []);
  const loadAuto = React.useCallback(() => {
    api<AutoMessage[]>(`/api/servers/${serverId}/auto-messages`).then(setAutoMessages).catch((e) => toast.error(`Автосообщения не загрузились: ${(e as Error).message}`));
  }, [serverId]);

  React.useEffect(loadTemplates, [loadTemplates]);
  React.useEffect(loadAuto, [loadAuto]);

  // The panel server collects chat on its own; this only refreshes what is shown.
  const serverIdRef = React.useRef(serverId);
  serverIdRef.current = serverId;
  const loadChat = React.useCallback(async () => {
    const requestedFor = serverId;
    try {
      const data = await api<ChatResponse>(`/api/servers/${serverId}/chat`);
      if (serverIdRef.current !== requestedFor) return;
      setChatMessages(data.messages);
      setCollector(data.collector);
      setChatError('');
    } catch (e) {
      if (serverIdRef.current !== requestedFor) return;
      setChatError((e as Error).message);
    }
  }, [serverId]);

  React.useEffect(() => {
    setChatMessages([]);
    setCollector(null);
    setChatError('');
  }, [serverId]);

  usePolling(loadChat, 4000);

  React.useEffect(() => {
    const viewport = chatScrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [chatMessages]);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    run(() => onBroadcast(text.trim()), 'Отправлено в чат');
  };

  const deleteAuto = async (m: AutoMessage) => {
    const ok = await confirmDialog({
      title: 'Удалить автосообщение?',
      description: `«${m.message}» перестанет отправляться на сервер.`,
      confirmLabel: 'Удалить',
      destructive: true,
    });
    if (!ok) return;
    run(async () => { await api(`/api/auto-messages/${m.id}`, { method: 'DELETE' }); loadAuto(); }, 'Автосообщение удалено');
  };

  const deleteTemplate = async (template: Template) => {
    const ok = await confirmDialog({
      title: 'Удалить шаблон?',
      description: `Шаблон «${template.name || template.message}» будет удалён.`,
      confirmLabel: 'Удалить',
      destructive: true,
    });
    if (!ok) return;
    run(async () => { await api(`/api/templates/${template.id}`, { method: 'DELETE' }); loadTemplates(); }, 'Шаблон удалён');
  };

  const clearChatFeed = async () => {
    const ok = await confirmDialog({
      title: 'Очистить историю чата?',
      description: 'Собранные сообщения исчезнут из панели. Новые сообщения продолжат собираться.',
      confirmLabel: 'Очистить',
      destructive: true,
    });
    if (!ok) return;
    run(async () => {
      await api(`/api/servers/${serverId}/chat`, { method: 'DELETE' });
      setChatMessages([]);
    }, 'История чата очищена');
  };

  const saveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api('/api/templates', { body: templateForm });
      setTemplateForm({ name: '', message: '' });
      setAddingTemplate(false);
      loadTemplates();
    }, 'Шаблон сохранён');
  };

  const saveAuto = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api(`/api/servers/${serverId}/auto-messages`, { body: autoForm });
      setAutoForm({ message: '', intervalMinutes: autoForm.intervalMinutes });
      setAddingAuto(false);
      loadAuto();
    }, 'Автосообщение добавлено');
  };

  return (
    <div className="p-3 md:p-6 space-y-6 animate-in fade-in duration-500">
      {/* Player chat feed: collected by the panel server, not by this tab */}
      <div className="p-4 md:p-6 rounded-xl border border-border bg-[#09090b]">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold flex flex-wrap items-center gap-2">
              <span className="flex items-center">
                <MessagesSquare size={18} className="mr-2 text-primary" />
                Чат игроков
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                сбор идёт
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Сообщения собирает сервер панели: вкладку можно закрыть, история не пропадёт.
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
              {collector?.url
                ? `Приём лога: ${collector.url}`
                : 'Адрес приёма определяется...'}
              {collector?.lastPacketAt ? ` • последнее: ${timeLabel(collector.lastPacketAt)}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadChat()} title="Обновить">
              <RefreshCw size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={clearChatFeed}
              disabled={chatMessages.length === 0}
              title="Очистить историю"
            >
              <Eraser size={15} />
            </Button>
          </div>
        </div>

        {chatError && (
          <div className="mb-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            {chatError}
          </div>
        )}
        {!chatError && collector?.lastError && (
          <div className="mb-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            Подписка на лог: {collector.lastError}
          </div>
        )}

        <ScrollArea className="h-[340px]" ref={chatScrollRef}>
          <div className="space-y-1 pr-4">
            {chatMessages.length === 0 && !chatError && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <MessageSquare size={28} className="text-muted-foreground/20" />
                <p className="text-sm italic text-muted-foreground/50">Сообщений пока нет.</p>
                <p className="max-w-sm text-xs text-muted-foreground/40">
                  Как только игроки начнут писать в общий или командный чат, строки появятся здесь.
                </p>
              </div>
            )}
            {chatMessages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-border',
                  m.console && 'opacity-70',
                )}
              >
                <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground/60">{timeLabel(m.at)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="max-w-[180px] truncate text-xs font-bold text-white" title={m.author}>{m.author}</span>
                    {m.team && (
                      <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase', teamClass(m.team))}>
                        {TEAM_LABEL[m.team] ?? m.team}
                      </span>
                    )}
                    {m.teamOnly && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">команда</span>
                    )}
                    {m.console && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">консоль</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-white/90">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

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
                  Отправитель: <span className="text-primary font-bold">Console</span>
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
                    onClick={() => deleteAuto(m)}
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
                        onClick={() => deleteTemplate(template)}
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
