"use client";

import React, { useState } from 'react';
import { Sidebar, SECTIONS, SERVER_SECTIONS, Section } from '@/components/layout/sidebar';
import { ServerSwitcher } from '@/components/layout/server-switcher';
import { ServersView } from '@/components/servers/servers-view';
import { CreateServerModal } from '@/components/servers/create-server-modal';
import { ServerDashboard, ServerSample } from '@/components/server/dashboard';
import { RCONConsole } from '@/components/server/console';
import { ServerChat } from '@/components/server/chat';
import { Menu, Crosshair, Clock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchGenerator } from '@/components/server/match-generator';
import { GeneralSettings } from '@/components/settings/general-settings';
import { BackupsView } from '@/components/settings/backups-view';
import { AnalyticsView } from '@/components/settings/analytics-view';
import { UsersView } from '@/components/settings/users-view';
import { db_helper, ServerProfile } from '@/lib/db';
import { fetchServerInfo } from '@/lib/a2s';
import { sendRconCommand } from '@/lib/rcon';
import { ServerModal } from '@/components/server/server-modal';
import { MapSelector } from '@/components/server/map-selector';
import { ServerSettings } from '@/components/server/server-settings';
import { BroadcastView } from '@/components/broadcast/broadcast-view';
import { RequestsBanner } from '@/components/server/requests-banner';
import { LiveMatch } from '@/components/server/live-match';
import { fetchMe, Role } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { LanguageMenu } from '@/components/layout/language-menu';

const HISTORY_POINTS = 120; // 10 minutes of 5 s polls
const ACTIVE_SERVER_KEY = 'cs2panel.activeServer';

const INITIAL_INFO = {
  name: "...",
  map: "---",
  players: { online: 0, max: 0, bots: 0 },
  ping: 0,
  status: 'loading' as const,
};

// Local time of the panel viewer (as the server clock on the Quatrix dashboard), handy for pause and dispute logs
function HeaderClock() {
  const { locale } = useT();
  const [now, setNow] = useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!now) return null;
  const zone = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return (
    <div className="hidden md:flex items-center gap-2 h-[46px] px-3 rounded-xl border border-gray-800 bg-sidebar/50 text-gray-400">
      <Clock size={14} className="text-primary" />
      <div className="flex flex-col">
        <span className="text-[10px] font-black leading-none uppercase tracking-widest text-white tabular-nums">
          {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </span>
        <span className="text-[8px] font-medium leading-none text-gray-500 mt-1 uppercase">{zone}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { t, lang } = useT();
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Section>("dashboard");
  const [serverInfo, setServerInfo] = useState<any>(INITIAL_INFO);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  // "Create server" dialog: new server (null) or launch settings of a panel-run one
  const [createOpen, setCreateOpen] = useState(false);
  const [editingManaged, setEditingManaged] = useState<ServerProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<{ role: Role; name?: string } | null>(null);
  // Ping and player count of the selected server over the last minutes, for the overview charts
  const [history, setHistory] = useState<ServerSample[]>([]);

  const loadServers = async () => {
    try {
      const data = await db_helper.getServers();
      setServers(data);
      setActiveServerId((current) => {
        if (current && data.some((s) => s.id === current)) return current;
        let saved: number | null = null;
        try { saved = Number(localStorage.getItem(ACTIVE_SERVER_KEY)) || null; } catch {}
        return data.find((s) => s.id === saved)?.id ?? data[0]?.id ?? null;
      });
      if (data.length === 0) setActiveTab((tab) => (SERVER_SECTIONS.includes(tab) ? 'servers' : tab));
    } catch (error) {
      console.error("Failed to load servers:", error);
    }
  };

  const selectServer = (id: number) => {
    setActiveServerId(id);
    try { localStorage.setItem(ACTIVE_SERVER_KEY, String(id)); } catch {}
  };

  // Poll server info
  React.useEffect(() => {
    if (!activeServerId) return;
    
    const server = servers.find(s => s.id === activeServerId);
    if (!server) return;

    setHistory([]);
    const updateInfo = async () => {
      try {
        const info = await fetchServerInfo(server.id!);
        setServerInfo({
          ...info,
          status: 'online'
        });
        setHistory((h) => [...h.slice(-(HISTORY_POINTS - 1)), { t: Date.now(), ping: info.ping, players: info.players.online }]);
      } catch (error) {
        setServerInfo({
          ...INITIAL_INFO,
          name: server.name,
          status: 'offline'
        });
        // A dropped server shows up on the charts as a fall to zero
        setHistory((h) => [...h.slice(-(HISTORY_POINTS - 1)), { t: Date.now(), ping: 0, players: 0 }]);
      }
    };

    updateInfo();
    const interval = setInterval(updateInfo, 5000);
    return () => clearInterval(interval);
  }, [activeServerId, servers]);


  const handleRconCommand = async (command: string) => {
    const server = servers.find(s => s.id === activeServerId);
    if (!server) throw new Error(t('Сервер не выбран', 'No server selected'));
    return await sendRconCommand(server.id!, command);
  };

  // Who is logged in decides what to show; the server list is only for judges
  React.useEffect(() => {
    fetchMe().then((user) => {
      setMe(user);
      if (user.role !== 'broadcast') loadServers();
    }).catch(() => {});
  }, []);

  const handleSaveServer = async (server: ServerProfile) => {
    try {
      if (server.id) {
        await db_helper.updateServer(server.id, server);
      } else {
        await db_helper.addServer(server);
      }
      await loadServers();
      setEditingServer(null);
    } catch (error) {
      alert(`${t('Не удалось сохранить сервер', 'Could not save the server')}: ${(error as Error).message}`);
    }
  };

  const handleSaveManaged = async (server: ServerProfile) => {
    if (server.id) await db_helper.updateServer(server.id, server);
    else await db_helper.addServer(server);
    await loadServers();
  };

  const editServer = (server: ServerProfile) => {
    if (server.managed) {
      setEditingManaged(server);
      setCreateOpen(true);
    } else {
      setEditingServer(server);
      setIsModalOpen(true);
    }
  };

  const handleDeleteServer = async (id: number) => {
    if (confirm(t('Удалить этот сервер?', 'Delete this server?'))) {
      try {
        await db_helper.deleteServer(id);
        // loadServers moves the selection to another server if this one was selected
        await loadServers();
      } catch (error) {
        alert(`${t('Не удалось удалить сервер', 'Could not delete the server')}: ${(error as Error).message}`);
      }
    }
  };

  const selectedServer = servers.find(s => s.id === activeServerId);

  const handleStartMatch = async (config: string) => {
    if (!selectedServer) return;
    try {
      await sendRconCommand(
        selectedServer.id!,
        `matchzy_loadmatch_json ${config}`
      );
    } catch (error) {
      console.error('Failed to start match:', error);
      throw error;
    }
  };

  const handleStopMatch = async () => {
    if (!selectedServer) return;
    try {
      await sendRconCommand(
        selectedServer.id!,
        'get5_endmatch'
      );
    } catch (error) {
      console.error('Failed to stop match:', error);
      throw error;
    }
  };

  const handleLaunchMatch = async (config: string, url: string) => {
    if (!selectedServer) return;
    const output = await sendRconCommand(
      selectedServer.id!,
      `matchzy_loadmatch_url "${url}"`
    );
    // MatchZy loads the config before answering, so the server must now report this match id;
    // it refuses (in its console reply) while another match is loaded, including the ~2 min after a match ends.
    const status = await sendRconCommand(selectedServer.id!, 'get5_status')
      .then((out) => JSON.parse(out.slice(out.indexOf('{'))))
      .catch(() => null);
    const matchid = String(JSON.parse(config).matchid ?? '');
    if (status && String(status.matchid) === matchid) return;
    if (status?.gamestate === 'post_game') {
      throw new Error(t(`сервер ещё завершает матч ${status.matchid}: GOTV дописывает демку (до ~2 минут после конца карты). Подождите и нажмите ещё раз.`, `the server is still finishing match ${status.matchid}: GOTV is writing the demo (up to ~2 minutes after the map ends). Wait and press again.`));
    }
    if (status && status.gamestate !== 'none') {
      throw new Error(t(`на сервере уже загружен матч ${status.matchid}. Если он не нужен - сначала остановите его.`, `match ${status.matchid} is already loaded on the server. If it is not needed, stop it first.`));
    }
    const reply = output.split('\n').map((line) => line.replace(/[\x00-\x1f]/g, '').trim()).filter(Boolean).join(' ');
    throw new Error(`${t('сервер не загрузил матч', 'the server did not load the match')}${reply ? `: ${reply}` : ''}`);
  };

  if (!me) {
    return <div className="h-[100dvh] bg-background" />;
  }
  if (me.role === 'broadcast') {
    return <BroadcastView />;
  }
  const isJudge = me.role === 'judge';

  const needsServer = SERVER_SECTIONS.includes(activeTab);
  const openAdd = () => { setEditingServer(null); setIsModalOpen(true); };

  return (
    <div className="flex h-[100dvh] w-full bg-background text-white">
      {/* Sidebar: static on desktop, drawer on phones */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          activeSection={activeTab}
          onSelectSection={(section) => { setActiveTab(section); setSidebarOpen(false); }}
          onClose={() => setSidebarOpen(false)}
          user={me}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Phone top bar */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 bg-sidebar border-b border-border md:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center">
              <Crosshair size={18} className="text-white" />
            </div>
            <div className="text-sm font-bold text-white truncate">{SECTIONS[activeTab].label[lang]}</div>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -mr-1 rounded-lg text-muted-foreground hover:text-white"
            aria-label={t('Открыть меню', 'Open menu')}
          >
            <Menu size={24} />
          </button>
        </header>

        <RequestsBanner />

        <div className="flex-1 flex flex-col overflow-auto">
          {/* Page header: title on the left; server, language, clock and status on the right, as in Quatrix */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 px-3 md:px-6 pt-3 md:pt-6">
            <div className="hidden md:block min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-tight">{(SECTIONS[activeTab].title ?? SECTIONS[activeTab].label)[lang]}</h1>
              <p className="text-gray-400 mt-1 font-medium text-sm">{SECTIONS[activeTab].hint[lang]}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {activeTab === 'dashboard' && <LanguageMenu />}
              {needsServer && servers.length > 0 && (
                <ServerSwitcher className="flex-1 md:flex-none md:w-64 md:min-w-[200px]" servers={servers} activeServerId={activeServerId} onSelect={selectServer} />
              )}
              <HeaderClock />
              {needsServer && servers.length > 0 && (
                <div className={cn(
                  'hidden md:flex items-center gap-2 h-[46px] px-3 rounded-xl border transition-all duration-300',
                  serverInfo.status === 'online' ? 'bg-green-500/10 border-green-500/20 text-green-500'
                    : serverInfo.status === 'offline' ? 'bg-red-500/10 border-red-500/20 text-red-500'
                    : 'bg-white/5 border-gray-800 text-gray-400',
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', serverInfo.status === 'online' ? 'bg-green-500 animate-pulse' : serverInfo.status === 'offline' ? 'bg-red-500' : 'bg-gray-500')} />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                    {serverInfo.status === 'online' ? t('Сервер на связи', 'Server connected')
                      : serverInfo.status === 'offline' ? t('Нет связи', 'Disconnected')
                      : t('Подключение...', 'Connecting...')}
                  </span>
                </div>
              )}
            </div>
          </header>

          {activeTab === 'general-settings' && <GeneralSettings />}
          {activeTab === 'backups' && <BackupsView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'users' && <UsersView />}
          {activeTab === 'servers' && (
            <ServersView
              servers={servers}
              canManage={isJudge}
              onRefresh={loadServers}
              onCreate={() => { setEditingManaged(null); setCreateOpen(true); }}
              onConnect={openAdd}
              onOpenSettings={() => setActiveTab('general-settings')}
              onEdit={editServer}
              onDelete={handleDeleteServer}
              onOpen={(id, section) => { selectServer(id); setActiveTab(section); }}
            />
          )}

          {needsServer && !selectedServer ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Layers size={28} /></div>
              <div className="text-white font-semibold">{t('Серверов пока нет', 'No servers yet')}</div>
              <div className="text-sm text-muted-foreground max-w-xs">{t('Создайте или подключите сервер в разделе «Серверы», и здесь появятся его инструменты.', 'Create or connect a server in the Servers section and its tools will appear here.')}</div>
              <button onClick={() => setActiveTab('servers')} className="mt-1 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/20">{t('Перейти к серверам', 'Go to servers')}</button>
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                <ServerDashboard
                  serverInfo={serverInfo}
                  history={history}
                  canManage={isJudge}
                  onSendCommand={handleRconCommand}
                  onNavigate={setActiveTab}
                  onAddServer={() => setActiveTab('servers')}
                />
              )}
              {activeTab === "live" && activeServerId && (
                <LiveMatch key={activeServerId} serverId={activeServerId} />
              )}
              {activeTab === "console" && (
                <div className="flex-1 min-h-[420px] p-3 md:p-6">
                  <RCONConsole key={activeServerId} onSendCommand={handleRconCommand} />
                </div>
              )}
              {activeTab === "chat" && activeServerId && (
                <ServerChat key={activeServerId} serverId={activeServerId} managed={!!selectedServer?.managed} onBroadcast={(msg) => handleRconCommand(`say ${msg}`)} />
              )}
              {activeTab === "maps" && (
                <MapSelector
                  key={activeServerId}
                  serverId={activeServerId!}
                  currentMap={serverInfo.map}
                  online={serverInfo.status === 'online'}
                  onCommand={handleRconCommand}
                />
              )}
              {activeTab === "settings" && selectedServer && (
                <ServerSettings
                  key={selectedServer.id}
                  server={selectedServer}
                  onEdit={() => editServer(selectedServer)}
                  onCommand={handleRconCommand}
                />
              )}
              {activeTab === "match" && activeServerId && (
                <MatchGenerator
                  key={activeServerId}
                  serverId={activeServerId}
                  onStartMatch={handleStartMatch}
                  onLaunchMatch={handleLaunchMatch}
                  onStopMatch={handleStopMatch}
                />
              )}
            </>
          )}
        </div>
      </main>

      <CreateServerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        server={editingManaged}
        servers={servers}
        onSave={handleSaveManaged}
      />

      <ServerModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        onSave={handleSaveServer}
        server={editingServer}
      />
    </div>
  );
}
