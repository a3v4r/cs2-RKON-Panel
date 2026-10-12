"use client"

import React from 'react'
import { Settings, Moon, Sun, Bell, Shield, Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { UsersSettings, AuditLog } from '@/components/settings/users-settings'

export function GeneralSettings({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white flex items-center">
          <Settings className="mr-3 text-primary" size={32} />
          General Settings
        </h2>
        <p className="text-muted-foreground mt-2">Manage your application preferences and appearance.</p>
      </div>

      <div className="space-y-6">
        {isAdmin && <UsersSettings />}
        {isAdmin && <AuditLog />}

        {/* Appearance */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
            <Sun className="mr-2" size={14} />
            Appearance
          </h3>
          <div className="p-4 rounded-xl border border-border bg-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <Moon size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Dark Mode</div>
                <div className="text-xs text-muted-foreground">Always stay in the dark.</div>
              </div>
            </div>
            <Switch checked={true} disabled />
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
            <Bell className="mr-2" size={14} />
            Notifications
          </h3>
          <div className="p-4 rounded-xl border border-border bg-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Server Alerts</div>
                <div className="text-xs text-muted-foreground">Notify when a server goes offline.</div>
              </div>
              <Switch checked={false} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Match Status</div>
                <div className="text-xs text-muted-foreground">Notify when a match starts or ends.</div>
              </div>
              <Switch checked={true} />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center">
            <Shield className="mr-2" size={14} />
            Security
          </h3>
          <div className="p-4 rounded-xl border border-border bg-white/5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">Remember Passwords</div>
                <div className="text-xs text-muted-foreground">Save RCON passwords locally (encrypted).</div>
              </div>
              <Switch checked={true} />
            </div>
          </div>
        </div>

        {/* About */}
        <div className="pt-6 border-t border-border">
          <div className="flex items-center space-x-2 text-muted-foreground mb-4">
            <Info size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">About</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>CS2 RCON Panel v1.0.0 (Portable)</p>
            <p className="mt-1">Developed for professional tournament administration.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
