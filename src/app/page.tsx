"use client";

import React, { useState } from 'react';
import { Sidebar, SECTIONS, Section } from '@/components/layout/sidebar';
import { ServerDashboard, ServerSample } from '@/components/server/dashboard';
import { RCONConsole } from '@/components/server/console';
import { ServerChat } from '@/components/server/chat';
import { Menu, Crosshair, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchGenerator } from '@/components/server/match-generator';
import { GeneralSettings } from '@/components/settings/general-settings';
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

const HISTORY_POINTS = 120; // 10 minutes of 5 s polls

const INITIAL_INFO = {
  name: "Загрузка...",
  map: "---",
  players: { online: 0, max: 0, bots: 0 },
  ping: 0,
  status: 'loading' as const,
};

// Local time of the panel viewer, handy when filling in disputes and pause logs
function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!now) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
      <Clock size={14} className="text-primary" />
      <div className="leading-none">
        <div className="text-xs font-bold text-white tabular-nums">{now.toLocaleTimeString('ru-RU')}</div>
        <div className="text-[9px] text-muted-foreground mt-0.5">{now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Section>("dashboard");
  const [serverInfo, setServerInfo] = useState<any>(INITIAL_INFO);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<{ role: Role } | null>(null);
  // Ping and player count of the selected server over the last minutes, for the overview charts
  const [history, setHistory] = useState<ServerSample[]>([]);

  const loadServers = async () => {
    try {
      const data = await db_helper.getServers();
      setServers(data);
      if (data.length > 0 && !activeServerId) {
        setActiveServerId(data[0].id || null);
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
    }
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
    if (!server) throw new Error("Сервер не выбран");
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
      alert(`Не удалось сохранить сервер: ${(error as Error).message}`);
    }
  };

  const handleDeleteServer = async (id: number) => {
    if (confirm("Удалить этот сервер?")) {
      try {
        await db_helper.deleteServer(id);
        await loadServers();
        if (activeServerId === id) {
          setActiveServerId(null);
        }
      } catch (error) {
        alert(`Не удалось удалить сервер: ${(error as Error).message}`);
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
      throw new Error(`сервер ещё завершает матч ${status.matchid}: GOTV дописывает демку (до ~2 минут после конца карты). Подождите и нажмите ещё раз.`);
    }
    if (status && status.gamestate !== 'none') {
      throw new Error(`на сервере уже загружен матч ${status.matchid}. Если он не нужен - сначала остановите его.`);
    }
    const reply = output.split('\n').map((line) => line.replace(/[\x00-\x1f]/g, '').trim()).filter(Boolean).join(' ');
    throw new Error(`сервер не загрузил матч${reply ? `: ${reply}` : ''}`);
  };

  if (!me) {
    return <div className="h-[100dvh] bg-background" />;
  }
  if (me.role === 'broadcast') {
    return <BroadcastView />;
  }
  const isJudge = me.role === 'judge';

  return (
    <div className="flex h-[100dvh] w-full bg-background text-white">
      {/* Sidebar: static on desktop, drawer on phones */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          servers={servers}
          activeServerId={activeServerId}
          serverOnline={serverInfo.status === 'loading' ? null : serverInfo.status === 'online'}
          activeSection={activeTab}
          onSelectSection={(section) => { setActiveTab(section); setSidebarOpen(false); }}
          onSelectServer={(id) => { setActiveServerId(id); setActiveTab('dashboard'); setSidebarOpen(false); }}
          onAddServer={() => { setEditingServer(null); setIsModalOpen(true); setSidebarOpen(false); }}
          onEditServer={(server) => { setEditingServer(server); setIsModalOpen(true); setSidebarOpen(false); }}
          onDeleteServer={handleDeleteServer}
          onClose={() => setSidebarOpen(false)}
          canManage={isJudge}
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
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">{SECTIONS[activeTab].label}</div>
              <div className="text-[11px] text-muted-foreground truncate leading-tight">{selectedServer?.name ?? 'Matchdesk'}</div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -mr-1 rounded-lg text-muted-foreground hover:text-white"
            aria-label="Открыть меню"
          >
            <Menu size={24} />
          </button>
        </header>

        <RequestsBanner />

        {activeTab === 'general-settings' || activeServerId ? (
          <div className="flex-1 flex flex-col overflow-auto">
            {/* Page header (desktop) */}
            <div className="hidden md:flex items-start justify-between gap-4 px-6 pt-6">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-white tracking-tight">{SECTIONS[activeTab].label}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {SECTIONS[activeTab].hint}
                  {activeTab !== 'general-settings' && <> · <span className="text-white/80">{selectedServer?.name}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
              <HeaderClock />
              {activeTab !== 'general-settings' && (
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider shrink-0',
                  serverInfo.status === 'online' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : serverInfo.status === 'offline' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                    : 'text-muted-foreground bg-white/5 border-white/10',
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', serverInfo.status === 'online' ? 'bg-emerald-400 animate-pulse' : serverInfo.status === 'offline' ? 'bg-red-400' : 'bg-muted-foreground')} />
                  {serverInfo.status === 'online' ? 'сервер на связи' : serverInfo.status === 'offline' ? 'нет связи' : 'подключение...'}
                </div>
              )}
              </div>
            </div>

            {activeTab === 'general-settings' && <GeneralSettings />}
            {activeTab === "dashboard" && (
              <ServerDashboard
                serverInfo={serverInfo}
                history={history}
                canManage={isJudge}
                onSendCommand={handleRconCommand}
                onNavigate={setActiveTab}
                onAddServer={() => { setEditingServer(null); setIsModalOpen(true); }}
              />
            )}
            {activeTab === "live" && activeServerId && (
              <LiveMatch key={activeServerId} serverId={activeServerId} />
            )}
            {activeTab === "console" && (
              <div className="flex-1 min-h-[420px] p-3 md:p-6">
                <RCONConsole onSendCommand={handleRconCommand} />
              </div>
            )}
            {activeTab === "chat" && activeServerId && (
              <ServerChat serverId={activeServerId} onBroadcast={(msg) => handleRconCommand(`say ${msg}`)} />
            )}
            {activeTab === "maps" && (
              <MapSelector
                currentMap={serverInfo.map}
                onChangeMap={(map) => handleRconCommand(`map ${map}`)}
                onCommand={handleRconCommand}
              />
            )}
            {activeTab === "settings" && selectedServer && (
              <ServerSettings
                key={selectedServer.id}
                server={selectedServer}
                onEdit={() => { setEditingServer(selectedServer); setIsModalOpen(true); }}
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
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Crosshair size={28} /></div>
            <div className="text-white font-semibold">Сервер не выбран</div>
            <div className="text-sm text-muted-foreground max-w-xs">
              {servers.length ? 'Выберите сервер в меню.' : isJudge ? 'Добавьте первый сервер: меню → блок «Сервер» → «Добавить сервер».' : 'Судьи ещё не добавили серверы.'}
            </div>
            <button onClick={() => setSidebarOpen(true)} className="md:hidden mt-1 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">Открыть меню</button>
          </div>
        )}
      </main>

      <ServerModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        onSave={handleSaveServer}
        server={editingServer}
      />
    </div>
  );
}
