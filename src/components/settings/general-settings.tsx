"use client"

import React from 'react'
import { Info } from 'lucide-react'
import { AuditLog } from '@/components/settings/audit-log'

export function GeneralSettings() {
  return (
    <div className="p-3 md:p-6 max-w-3xl space-y-8">

      <div className="space-y-6">
        <AuditLog />

        {/* About */}
        <div className="pt-6 border-t border-border">
          <div className="flex items-center space-x-2 text-muted-foreground mb-4">
            <Info size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">О панели</span>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Matchdesk, версия {process.env.NEXT_PUBLIC_PANEL_VERSION}</p>
            <p className="mt-1">Логины и пароли задаются в settings.ini турнирного комплекта.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
