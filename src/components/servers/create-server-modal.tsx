"use client";

import React from 'react';
import { ChevronDown, Rocket } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { ManagedConfig, ServerProfile } from '@/lib/db';
import { useT, tNow } from '@/lib/i18n';

interface CreateServerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Existing server to edit; without it a new one is created
  server?: ServerProfile | null;
  servers: ServerProfile[];
  onSave: (server: ServerProfile) => Promise<void>;
}

type Form = { name: string; port: string; rcon_password: string; country_code: string } & Omit<ManagedConfig, 'tvPort' | 'maxPlayers'> & { tvPort: string; maxPlayers: string };

const MAPS = ['de_dust2', 'de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_vertigo', 'de_train', 'de_overpass'];

// Next free pair of ports on this PC: 27015/27020, 27025/27030, ...
function freePorts(servers: ServerProfile[], start = 27015) {
  const taken = new Set(servers.flatMap((s) => [s.port, s.managed?.tvPort ?? 0]));
  for (let port = start; port < start + 1000; port += 10) {
    if (!taken.has(port) && !taken.has(port + 5)) return { port, tvPort: port + 5 };
  }
  return { port: 27015, tvPort: 27020 };
}

function emptyForm(servers: ServerProfile[], start?: number): Form {
  const { port, tvPort } = freePorts(servers, start);
  const n = servers.filter((s) => s.managed).length + 1;
  return {
    name: tNow(`Турнирный сервер #${n}`, `Tournament server #${n}`),
    port: String(port),
    tvPort: String(tvPort),
    map: 'de_dust2',
    maxPlayers: '12',
    password: '',
    rcon_password: '',
    country_code: 'RU',
    bindIp: '0.0.0.0',
    autoRestart: true,
  };
}

// "Create server" as in Quatrix: the panel writes the config and starts cs2.exe itself, no .bat files
export function CreateServerModal({ open, onOpenChange, server, servers, onSave }: CreateServerModalProps) {
  const [form, setForm] = React.useState<Form>(() => emptyForm(servers));
  const [advanced, setAdvanced] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const { t } = useT();

  React.useEffect(() => {
    if (!open) return;
    setError('');
    setAdvanced(false);
    if (server?.managed) {
      setForm({
        name: server.name,
        port: String(server.port),
        tvPort: String(server.managed.tvPort),
        map: server.managed.map,
        maxPlayers: String(server.managed.maxPlayers),
        password: server.managed.password,
        rcon_password: '',
        country_code: server.country_code ?? '',
        bindIp: server.managed.bindIp,
        autoRestart: server.managed.autoRestart,
      });
    } else {
      setForm(emptyForm(servers));
      // Ports start from the default port set in the panel settings
      api<{ defaultPort: number }>('/api/panel-settings').then((st) => setForm(emptyForm(servers, st.defaultPort))).catch(() => {});
    }
  }, [open, server]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: server?.id,
        name: form.name.trim(),
        host: '127.0.0.1',
        port: Number(form.port),
        rcon_password: form.rcon_password,
        country_code: form.country_code.trim().toUpperCase() || undefined,
        managed: {
          tvPort: Number(form.tvPort),
          map: form.map.trim(),
          maxPlayers: Number(form.maxPlayers),
          password: form.password,
          bindIp: form.bindIp.trim(),
          autoRestart: form.autoRestart,
        },
      });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[92dvh] overflow-y-auto border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/15 text-primary"><Rocket size={16} /></span>
            {server ? t('Параметры сервера', 'Server options') : t('Создать сервер', 'Create server')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {server
              ? t('Новые параметры применятся при следующем запуске сервера.', 'New options take effect the next time the server starts.')
              : t('Панель сама соберёт конфиг и запустит сервер CS2 на этом ПК. Батники больше не нужны.', 'The panel builds the config and runs the CS2 server on this PC. No batch files needed.')}
          </p>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 pt-2">
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</div>}

          <Field label={t('Название (hostname)', 'Name (hostname)')}>
            <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Порт сервера', 'Server port')}>
              <Input required inputMode="numeric" value={form.port} onChange={(e) => set('port', e.target.value)} />
            </Field>
            <Field label={t('Порт GOTV', 'GOTV port')}>
              <Input required inputMode="numeric" value={form.tvPort} onChange={(e) => set('tvPort', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Карта при запуске', 'Startup map')}>
              <Input required list="create-server-maps" value={form.map} onChange={(e) => set('map', e.target.value)} />
              <datalist id="create-server-maps">{MAPS.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
            <Field label={t('Мест на сервере', 'Max players')}>
              <Input required inputMode="numeric" value={form.maxPlayers} onChange={(e) => set('maxPlayers', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('RCON-пароль', 'RCON password')}>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={server ? t('не менять', 'keep current') : t('сгенерировать', 'generate')}
                value={form.rcon_password}
                onChange={(e) => set('rcon_password', e.target.value)}
              />
            </Field>
            <Field label={t('Пароль для игроков', 'Player password')}>
              <Input placeholder={t('без пароля', 'no password')} value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div>
              <div className="text-sm font-medium text-white">{t('Перезапуск при падении', 'Restart on crash')}</div>
              <div className="text-xs text-muted-foreground">{t('Если сервер упадёт после минуты работы, панель запустит его снова', 'If the server crashes after running for a minute, the panel starts it again')}</div>
            </div>
            <Switch checked={form.autoRestart} onCheckedChange={(v) => set('autoRestart', v)} />
          </div>

          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white"
          >
            <ChevronDown size={14} className={cn('transition-transform', advanced && 'rotate-180')} />
            {t('Дополнительно', 'Advanced')}
          </button>
          {advanced && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('IP для сервера и RCON', 'Server and RCON IP')}>
                <Input value={form.bindIp} onChange={(e) => set('bindIp', e.target.value)} />
              </Field>
              <Field label={t('Код страны (флаг)', 'Country code (flag)')}>
                <Input maxLength={2} value={form.country_code} onChange={(e) => set('country_code', e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-white hover:bg-white/5">
              {t('Отмена', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {server ? t('Сохранить', 'Save') : t('Создать сервер', 'Create server')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
