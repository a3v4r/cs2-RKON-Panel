"use client";

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { ServerDashboard } from '@/components/server/dashboard';
import { RCONConsole } from '@/components/server/console';
import { ServerChat } from '@/components/server/chat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, Terminal, MessageSquare, Settings, Map as MapIcon, Trophy, Menu } from 'lucide-react';
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
import { fetchMe, Role } from '@/lib/api';

const INITIAL_INFO = {
  name: "Loading...",
  map: "---",
  players: { online: 0, max: 0, bots: 0 },
  ping: 0,
  status: 'loading' as const,
};

export default function Home() {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [serverInfo, setServerInfo] = useState<any>(INITIAL_INFO);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [me, setMe] = useState<{ role: Role } | null>(null);

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

    const updateInfo = async () => {
      try {
        const info = await fetchServerInfo(server.id!);
        setServerInfo({
          ...info,
          status: 'online'
        });
      } catch (error) {
        setServerInfo({
          ...INITIAL_INFO,
          name: server.name,
          status: 'offline'
        });
      }
    };

    updateInfo();
    const interval = setInterval(updateInfo, 5000);
    return () => clearInterval(interval);
  }, [activeServerId, servers]);


  const handleRconCommand = async (command: string) => {
    const server = servers.find(s => s.id === activeServerId);
    if (!server) throw new Error("No server selected");
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
      console.error("Failed to save server:", error);
    }
  };

  const handleDeleteServer = async (id: number) => {
    if (confirm("Are you sure you want to delete this server?")) {
      try {
        await db_helper.deleteServer(id);
        await loadServers();
        if (activeServerId === id) {
          setActiveServerId(null);
        }
      } catch (error) {
        console.error("Failed to delete server:", error);
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
    try {
      await sendRconCommand(
        selectedServer.id!,
        `matchzy_loadmatch_url "${url}"`
      );
    } catch (error) {
      console.error('Failed to launch match via URL:', error);
      throw error;
    }
  };

  if (!me) {
    return <div className="h-[100dvh] bg-[#09090b]" />;
  }
  if (me.role === 'broadcast') {
    return <BroadcastView />;
  }
  const isJudge = me.role === 'judge';

  return (
    <div className="flex h-[100dvh] w-full bg-[#09090b] text-white">
      {/* Sidebar: static on desktop, drawer on phones */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={(id) => { setActiveServerId(id); setActiveTab('dashboard'); setSidebarOpen(false); }}
          onAddServer={() => { setEditingServer(null); setIsModalOpen(true); setSidebarOpen(false); }}
          onEditServer={(server) => { setEditingServer(server); setIsModalOpen(true); setSidebarOpen(false); }}
          onDeleteServer={handleDeleteServer}
          canManage={isJudge}
          user={me}
          onOpenGeneralSettings={() => { setActiveTab('general-settings'); setSidebarOpen(false); }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Phone top bar */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-md text-muted-foreground hover:text-white"
            aria-label="Открыть список серверов"
          >
            <Menu size={22} />
          </button>
          <span className="text-sm font-medium truncate">{selectedServer?.name ?? 'CS2 RCON'}</span>
        </div>

        <RequestsBanner />

        {activeTab === 'general-settings' ? (
          <div className="flex-1 overflow-auto">
            <GeneralSettings />
          </div>
        ) : activeServerId ? (
          <>
            {/* Server Header */}
            <div className="flex items-center justify-between gap-4 px-3 md:px-6 py-2 md:py-4 border-b border-border bg-[#09090b]">
              <div className="hidden md:flex items-center space-x-4 shrink-0">
                <div className="text-sm font-medium text-muted-foreground">
                  Selected: <span className="text-white">{selectedServer?.name}</span>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto overflow-x-auto">
                <TabsList className="bg-white/5 border border-border w-max">
                  <TabsTrigger value="dashboard" aria-label="Dashboard" title="Dashboard" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <LayoutDashboard size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </TabsTrigger>
                  <TabsTrigger value="console" aria-label="Console" title="Console" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Terminal size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Console</span>
                  </TabsTrigger>
                  <TabsTrigger value="chat" aria-label="Chat" title="Chat" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <MessageSquare size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Chat</span>
                  </TabsTrigger>
                  <TabsTrigger value="maps" aria-label="Maps" title="Maps" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <MapIcon size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Maps</span>
                  </TabsTrigger>
                  <TabsTrigger value="match" aria-label="Match" title="Match" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Trophy size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Match</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings" aria-label="Settings" title="Settings" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Settings size={14} className="sm:mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {activeTab === "dashboard" && (
                <ServerDashboard 
                  serverInfo={serverInfo} 
                  canManage={isJudge}
                  onSendCommand={handleRconCommand}
                />
              )}
              {activeTab === "console" && (
                <div className="h-full p-3 md:p-6">
                  <RCONConsole onSendCommand={handleRconCommand} />
                </div>
              )}
              {activeTab === "chat" && (
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
              {activeTab === "match" && (
                <MatchGenerator 
                  key={activeServerId}
                  serverId={activeServerId}
                  onStartMatch={handleStartMatch} 
                  onLaunchMatch={handleLaunchMatch}
                  onStopMatch={handleStopMatch} 
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground italic">
            Select a server from the sidebar to start managing.
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
