"use client"

import React from 'react'
import { Bot, Send, Settings2, Trash2, Loader2, Play, X, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

// The Agent tab: a chat with a language model that reads the servers through the panel (src/server/agent.ts).
// Actions it proposes (RCON, start / stop) wait for "Run". The conversation is kept in this browser.

interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
interface Message { role: 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
interface Pending { id: string; tool: string; description: string }
interface Config { baseUrl: string; model: string; hasKey: boolean; configured: boolean }
interface Model { id: string; name: string; price: { input: number; output: number } | null }

const STORE_KEY = 'matchdesk-agent-chat'

const PRESETS = [
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: '' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'ollama', name: 'Ollama (на этом ПК)', url: 'http://127.0.0.1:11434/v1', model: '' },
]

const field = 'w-full bg-background/50 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none placeholder:text-gray-600'

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

export function AgentView({ selectedServerId }: { selectedServerId?: number | null }) {
  const { t } = useT()
  const [config, setConfig] = React.useState<Config | null>(null)
  const [showSettings, setShowSettings] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [pending, setPending] = React.useState<Pending[]>([])
  const [decisions, setDecisions] = React.useState<Record<string, 'run' | 'skip'>>({})
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const listRef = React.useRef<HTMLDivElement>(null)
  // The saved conversation is read once; saving before that would overwrite it with the empty start state
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    api<Config>('/api/agent').then((c) => { setConfig(c); if (!c.configured) setShowSettings(true) }).catch((e) => setError((e as Error).message))
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (saved?.messages) { setMessages(saved.messages); setPending(saved.pending ?? []) }
    } catch {}
    setLoaded(true)
  }, [])

  React.useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ messages, pending })) } catch {}
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending, busy, loaded])

  const turn = async (next: Message[], decided?: Record<string, 'run' | 'skip'>) => {
    setBusy(true)
    setError('')
    setPending([])
    setDecisions({})
    setMessages(next)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, decisions: decided, selectedServerId: selectedServerId ?? undefined, stream: true }),
        cache: 'no-store',
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      // One JSON event per line: each new message as the agent works, then the whole conversation
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      while (!done) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'message') setMessages((m) => [...m, event.message])
          else if (event.type === 'done') { setMessages(event.messages); setPending(event.pending); done = true }
          else if (event.type === 'error') throw new Error(event.error)
        }
      }
      if (!done) throw new Error(t('Связь с панелью оборвалась посреди ответа', 'The connection to the panel dropped mid-answer'))
    } catch (e) {
      setError((e as Error).message)
      // Decisions not sent: offer them again
      if (decided) setPending(pending)
    } finally {
      setBusy(false)
    }
  }

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    turn([...messages, { role: 'user', content: text }])
  }

  const decide = (id: string, decision: 'run' | 'skip') => {
    const next = { ...decisions, [id]: decision }
    setDecisions(next)
    if (pending.every((p) => next[p.id])) turn(messages, next)
  }

  const clear = () => {
    if (messages.length && !confirm(t('Начать новый разговор? Этот удалится.', 'Start a new conversation? This one is deleted.'))) return
    setMessages([])
    setPending([])
    setDecisions({})
    setError('')
  }

  // Results of tool calls, to show under each call
  const results = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of messages) if (m.role === 'tool' && m.tool_call_id) map.set(m.tool_call_id, m.content ?? '')
    return map
  }, [messages])

  // Calls of the last assistant message still running (no result yet, not waiting for the user)
  const pendingIds = new Set(pending.map((p) => p.id))
  const running = busy && messages.some((m) => m.tool_calls?.some((c) => !results.has(c.id) && !pendingIds.has(c.id)))

  const toolLabel = (call: ToolCall) => {
    const a = parseArgs(call.function.arguments)
    const sid = a.server_id !== undefined ? ` #${a.server_id}` : ''
    switch (call.function.name) {
      case 'wait': return results.has(call.id)
        ? t(`Подождал ${a.seconds ?? ''} с`, `Waited ${a.seconds ?? ''} s`)
        : t(`Жду ${a.seconds ?? ''} с`, `Waiting ${a.seconds ?? ''} s`)
      case 'list_servers': return t('Посмотрел список серверов', 'Listed the servers')
      case 'server_status': return t(`Проверил состояние сервера${sid}`, `Checked server${sid}`)
      case 'list_players': return t(`Посмотрел игроков на сервере${sid}`, `Listed players on server${sid}`)
      case 'recent_chat': return t(`Прочитал чат сервера${sid}`, `Read the chat of server${sid}`)
      case 'read_log': return t(`Прочитал лог: ${a.source}${sid}`, `Read the log: ${a.source}${sid}`)
      case 'plugins_status': return t('Проверил плагины', 'Checked the plugins')
      case 'audit_log': return t('Прочитал журнал действий', 'Read the action log')
      case 'rcon': return `RCON${sid}: ${a.command ?? ''}`
      case 'server_process': return t(`Сервер${sid}: ${a.action}`, `Server${sid}: ${a.action}`)
      case 'panel_api': return t(`Панель: ${a.method} ${a.path}`, `Panel: ${a.method} ${a.path}`)
      default: return call.function.name
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 md:p-6 gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500 truncate">
          {config?.configured
            ? t(`Модель: ${config.model}`, `Model: ${config.model}`)
            : t('Агент не настроен', 'The agent is not set up')}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={clear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-800 text-gray-400 hover:text-white hover:bg-white/5">
            <Trash2 size={14} />{t('Новый разговор', 'New chat')}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border', showSettings ? 'border-primary/40 text-primary bg-primary/10' : 'border-gray-800 text-gray-400 hover:text-white hover:bg-white/5')}>
            <Settings2 size={14} />{t('Подключение', 'Connection')}
          </button>
        </div>
      </div>

      {showSettings && config && (
        <AgentSettings config={config} onSaved={(c) => { setConfig(c); if (c.configured) setShowSettings(false) }} />
      )}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto bg-card border border-gray-800 rounded-2xl p-3 md:p-5 space-y-3">
        {messages.length === 0 && !busy && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-500 py-10">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Bot size={28} /></div>
            <div className="text-sm max-w-md">
              {t(
                'Спросите о серверах, игроках, матче или логах, или попросите что-то сделать: агент сам посмотрит состояние, а действия выполнит только после вашего подтверждения.',
                'Ask about the servers, players, the match or the logs, or ask for something to be done: the agent looks things up itself and runs actions only after you confirm.',
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {[t('Что сейчас на серверах?', 'What is on the servers now?'), t('Почему не применяются скины?', 'Why are skins not applied?'), t('У кого высокий пинг?', 'Who has a high ping?')].map((q) => (
                <button key={q} onClick={() => setInput(q)} className="px-3 py-1.5 rounded-xl border border-gray-800 hover:border-primary/40 hover:text-white">{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 border border-primary/20 px-4 py-2.5 text-sm text-white whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            )
          }
          if (m.role === 'assistant') {
            return (
              <div key={i} className="space-y-1.5">
                {m.content && (
                  <div className="flex">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.04] border border-white/5 px-4 py-2.5 text-sm text-gray-200 whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                )}
                {m.tool_calls?.map((call) => {
                  const result = results.get(call.id)
                  return (
                    <details key={call.id} className="group text-xs text-gray-500">
                      <summary className="flex items-center gap-1.5 cursor-pointer list-none hover:text-gray-300">
                        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                        <span className="truncate">{toolLabel(call)}</span>
                        {result === undefined && pendingIds.has(call.id) && <span className="text-amber-400">{t('ждёт подтверждения', 'waiting for confirmation')}</span>}
                        {result === undefined && !pendingIds.has(call.id) && busy && (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 size={11} className="animate-spin" />
                            {call.function.name === 'wait' ? t('жду...', 'waiting...') : t('выполняется...', 'running...')}
                          </span>
                        )}
                      </summary>
                      {result !== undefined && (
                        <pre className="mt-1 ml-4 max-h-48 overflow-auto rounded-lg bg-black/30 border border-white/5 p-2 text-[11px] text-gray-400 whitespace-pre-wrap break-all">{result}</pre>
                      )}
                    </details>
                  )
                })}
              </div>
            )
          }
          return null
        })}

        {pending.length > 0 && !busy && (
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                <div className="flex-1 min-w-0 text-sm text-amber-100 break-words">
                  <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5 text-amber-400" />{p.description}
                </div>
                {decisions[p.id] ? (
                  <span className="text-xs text-gray-400">{decisions[p.id] === 'run' ? t('выполнить', 'run') : t('отменено', 'cancelled')}</span>
                ) : (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => decide(p.id, 'run')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-blue-600">
                      <Play size={12} />{t('Выполнить', 'Run')}
                    </button>
                    <button onClick={() => decide(p.id, 'skip')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 text-xs font-bold hover:bg-white/5">
                      <X size={12} />{t('Отмена', 'Cancel')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {busy && !running && (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" />{t('Думает...', 'Thinking...')}</div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 break-words">{error}</div>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          disabled={!config?.configured}
          placeholder={config?.configured ? t('Вопрос или просьба. Enter - отправить, Shift+Enter - новая строка', 'Question or request. Enter to send, Shift+Enter for a new line') : t('Сначала настройте подключение', 'Set up the connection first')}
          className={cn(field, 'resize-none py-3 disabled:opacity-50')}
        />
        <button
          onClick={send}
          disabled={busy || !input.trim() || !config?.configured || pending.length > 0}
          title={pending.length ? t('Сначала решите, выполнять ли действия', 'Decide on the actions first') : undefined}
          className="shrink-0 h-[52px] w-[52px] flex items-center justify-center rounded-xl bg-primary text-white hover:bg-blue-600 disabled:opacity-40"
          aria-label={t('Отправить', 'Send')}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}

function AgentSettings({ config, onSaved }: { config: Config; onSaved: (c: Config) => void }) {
  const { t } = useT()
  const [baseUrl, setBaseUrl] = React.useState(config.baseUrl)
  const [apiKey, setApiKey] = React.useState('')
  const [model, setModel] = React.useState(config.model)
  const [models, setModels] = React.useState<Model[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const save = async () => {
    const c = await api<Config>('/api/agent', { method: 'PUT', body: { baseUrl, apiKey, model } })
    setApiKey('')
    return c
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await work() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const preset = PRESETS.find((p) => p.url === baseUrl)
  const price = (m: Model) => (m.price ? ` - $${m.price.input.toFixed(2)} / $${m.price.output.toFixed(2)} за 1M` : '')

  return (
    <div className="bg-card border border-gray-800 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setBaseUrl(p.url); if (p.model) setModel(p.model); if (p.id === 'ollama') setApiKey('-'); setModels([]) }}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border', preset?.id === p.id ? 'border-primary/40 text-primary bg-primary/10' : 'border-gray-800 text-gray-400 hover:text-white')}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">{t('Адрес API (OpenAI-совместимый)', 'API address (OpenAI-compatible)')}</span>
          <input className={field} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">{t('Ключ API', 'API key')}{config.hasKey && <span className="text-green-500"> · {t('сохранён', 'saved')}</span>}</span>
          <input className={field} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.hasKey ? t('не менять', 'keep') : 'sk-...'} />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">{t('Модель', 'Model')}</span>
          <div className="flex gap-2">
            <input className={field} list="agent-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek/deepseek-chat" />
            <button
              onClick={() => run(async () => { await save(); setModels(await api<Model[]>('/api/agent', { body: { action: 'models' } })) })}
              disabled={busy}
              title={t('Загрузить модели, которые умеют вызывать инструменты', 'Load the models that can call tools')}
              className="shrink-0 px-3 rounded-xl border border-gray-800 text-gray-400 hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
          <datalist id="agent-models">
            {models.map((m) => <option key={m.id} value={m.id}>{`${m.name}${price(m)}`}</option>)}
          </datalist>
        </label>
      </div>
      {models.length > 0 && <p className="text-xs text-gray-500">{t(`Найдено моделей с инструментами: ${models.length}. Начните вводить название в поле «Модель».`, `${models.length} models with tool calling found. Start typing in the Model field.`)}</p>}
      <p className="text-[11px] text-gray-500">
        {t(
          'Нужна модель, которая умеет вызывать инструменты (tool calling). Ключ хранится на ПК с панелью и в браузер не отдаётся. Логи, ники и чат, которые агент читает, уходят выбранному сервису.',
          'The model must support tool calling. The key stays on the panel PC and is never sent to the browser. Logs, nicknames and chat the agent reads go to the chosen service.',
        )}
      </p>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
      <div className="flex justify-end">
        <button
          onClick={() => run(async () => onSaved(await save()))}
          disabled={busy || !model.trim()}
          className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-50"
        >
          {t('Сохранить', 'Save')}
        </button>
      </div>
    </div>
  )
}
