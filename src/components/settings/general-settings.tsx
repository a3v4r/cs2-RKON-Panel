"use client"

import React from 'react'
import { Settings, Info } from 'lucide-react'
import { AuditLog } from '@/components/settings/audit-log'

export function GeneralSettings() {
  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white flex items-center">
          <Settings className="mr-3 text-primary" size={32} />
          General Settings
        </h2>
        <p className="text-muted-foreground mt-2">Panel activity log and version.</p>
      </div>

      <div className="space-y-6">
        <AuditLog />

        {/* About */}
        <div className="pt-6 border-t border-border">
          <div className="flex items-center space-x-2 text-muted-foreground mb-4">
            <Info size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">About</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>CS2 RCON Panel v{process.env.NEXT_PUBLIC_PANEL_VERSION}</p>
            <p className="mt-1">Passwords and logins are set in settings.ini of the tournament kit.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
