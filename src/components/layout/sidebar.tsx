"use client";

import React from 'react';
import { 
  Plus, 
  Settings, 
  Terminal, 
  Users, 
  LayoutDashboard, 
  Map as MapIcon, 
  MessageSquare,
  Activity,
  ChevronLeft,
  ChevronRight,
  Server,
  Edit,
  Trash2,
  MoreVertical,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ROLE_LABELS, Role } from '@/lib/api';

interface SidebarProps {
  servers: any[];
  activeServerId: number | null;
  onSelectServer: (id: number) => void;
  onAddServer: () => void;
  onEditServer: (server: any) => void;
  onDeleteServer: (id: number) => void;
  onOpenGeneralSettings: () => void;
  canManage: boolean;
  user: { role: Role };
}

export function Sidebar({ 
  servers, 
  activeServerId, 
  onSelectServer, 
  onAddServer,
  onEditServer,
  onDeleteServer,
  onOpenGeneralSettings,
  canManage,
  user
}: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className={cn(
      "flex flex-col h-screen border-r border-border bg-[#09090b] transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && <h1 className="text-xl font-bold tracking-tight text-white">CS2 RCON</h1>}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:inline-flex text-muted-foreground hover:text-white"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </Button>
      </div>

      {/* Servers List */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          {!collapsed && <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servers</span>}
          {canManage && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddServer}>
              <Plus size={16} />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1">
            {servers.map((server) => (
              <div
                key={server.id}
                onClick={() => onSelectServer(server.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectServer(server.id); }}
                className={cn(
                  "flex items-center w-full p-2 rounded-md transition-all group cursor-pointer",
                  activeServerId === server.id 
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="flex items-center shrink-0 mr-3">
                   {server.country_code ? (
                     <span className="text-lg leading-none">{getFlagEmoji(server.country_code)}</span>
                   ) : (
                     <Server size={18} />
                   )}
                </div>
                {!collapsed && (
                  <div className="flex flex-col items-start overflow-hidden text-left flex-1 px-3">
                    <span className="text-sm font-medium truncate w-full">{server.name}</span>
                    <span className="text-[10px] opacity-50 truncate w-full">{server.host}:{server.port}</span>
                  </div>
                )}
                {!collapsed && canManage && (
                  <div className="flex md:hidden md:group-hover:flex items-center space-x-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 md:h-6 md:w-6 text-muted-foreground hover:text-white"
                      onClick={(e) => { e.stopPropagation(); onEditServer(server); }}
                    >
                      <Edit size={12} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 md:h-6 md:w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDeleteServer(server.id); }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border mt-auto">
        {!collapsed && (
          <div className="px-2 pb-2 text-xs text-muted-foreground truncate">
            {ROLE_LABELS[user.role]}
          </div>
        )}
        <button 
          onClick={onOpenGeneralSettings}
          className={cn(
            "flex items-center w-full p-2 rounded-md text-muted-foreground hover:bg-white/5 hover:text-white transition-all",
            collapsed ? "justify-center" : "space-x-3"
          )}
        >
          <Settings size={18} />
          {!collapsed && <span className="text-sm font-medium">Settings</span>}
        </button>
        <button 
          onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
          className={cn(
            "flex items-center w-full p-2 rounded-md text-muted-foreground hover:bg-white/5 hover:text-white transition-all",
            collapsed ? "justify-center" : "space-x-3"
          )}
        >
          <LogOut size={18} />
          {!collapsed && <span className="text-sm font-medium">Выйти</span>}
        </button>
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
