"use client"

import React from 'react'
import { Settings, Shield, Zap, Terminal, Database, HardDrive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServerProfile } from '@/lib/db'

interface ServerSettingsProps {
  server: ServerProfile
  onUpdate: (server: ServerProfile) => void
}

export function ServerSettings({ server, onUpdate }: ServerSettingsProps) {
  return (
    <div className="p-3 md:p-6 space-y-8 max-w-4xl">
      <div className="flex items-center space-x-4">
        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <Settings size={32} className="text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{server.name}</h2>
          <p className="text-sm text-muted-foreground">Configuration & Management</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SettingsGroup title="Core Configuration" icon={<Zap size={18} />}>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm">Hostname</span>
            <span className="text-sm text-white font-mono">{server.host}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm">Port</span>
            <span className="text-sm text-white font-mono">{server.port}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">RCON Status</span>
            <span className="text-xs font-bold text-emerald-500 uppercase">Authenticated</span>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Security" icon={<Shield size={18} />}>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm">Password Protection</span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-2">
             <span className="text-sm">RCON Password</span>
             <Button variant="outline" size="sm" className="h-7 text-[10px]">REVEAL</Button>
          </div>
        </SettingsGroup>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50">Maintenance</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MaintenanceButton icon={<RotateCcw className="w-4 h-4" />} label="Hard Restart" />
          <MaintenanceButton icon={<Terminal className="w-4 h-4" />} label="Check Updates" />
          <MaintenanceButton icon={<HardDrive className="w-4 h-4" />} label="Clear Logs" />
        </div>
      </div>

      <div className="pt-6 border-t border-border flex justify-end">
        <Button className="bg-primary hover:bg-primary/90">
             Save Changes
        </Button>
      </div>
    </div>
  )
}

function SettingsGroup({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-[#09090b]">
      <div className="flex items-center text-sm font-bold mb-4 text-white">
        <span className="mr-2 text-primary">{icon}</span>
        {title}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

function MaintenanceButton({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <button className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-all space-y-3">
      <div className="p-3 rounded-full bg-white/5">{icon}</div>
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </button>
  )
}

function RotateCcw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}
