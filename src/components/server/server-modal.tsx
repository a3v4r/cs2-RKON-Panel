"use client"

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ServerProfile } from '@/lib/db'

interface ServerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (server: ServerProfile) => void
  server?: ServerProfile | null
}

export function ServerModal({ open, onOpenChange, onSave, server }: ServerModalProps) {
  const [formData, setFormData] = useState<ServerProfile>({
    name: '',
    host: '',
    port: 27015,
    rcon_password: '',
    country_code: 'RU',
    mode: 'matchzy',
  })

  useEffect(() => {
    if (server) {
      // The stored password is never sent to the browser: empty field = keep it
      setFormData({ ...server, mode: server.mode === 'vanilla' ? 'vanilla' : 'matchzy', rcon_password: '' })
    } else {
      setFormData({
        name: '',
        host: '',
        port: 27015,
        rcon_password: '',
        country_code: 'RU',
        mode: 'matchzy',
      })
    }
  }, [server, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#09090b] border-border text-white">
        <DialogHeader>
          <DialogTitle>{server ? 'Изменить сервер' : 'Новый сервер'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              placeholder="Турнирный сервер #1"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-white/5 border-border"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">Адрес / IP</Label>
              <Input
                id="host"
                placeholder="127.0.0.1"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="bg-white/5 border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Порт</Label>
              <Input
                id="port"
                type="number"
                placeholder="27015"
                min={1}
                max={65535}
                value={Number.isFinite(formData.port) ? formData.port : ''}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                className="bg-white/5 border-border"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">RCON-пароль</Label>
            <Input
              id="password"
              type="password"
              placeholder={server ? 'Оставьте пустым, чтобы не менять' : '••••••••'}
              value={formData.rcon_password}
              onChange={(e) => setFormData({ ...formData, rcon_password: e.target.value })}
              className="bg-white/5 border-border"
              required={!server}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mode">Режим сервера</Label>
            <select
              id="mode"
              value={formData.mode ?? 'matchzy'}
              onChange={(e) => setFormData({ ...formData, mode: e.target.value as ServerProfile['mode'] })}
              className="w-full bg-white/5 border border-border rounded-md px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="matchzy" className="bg-[#09090b]">MatchZy (плагин матчей)</option>
              <option value="vanilla" className="bg-[#09090b]">Vanilla (без плагина, ESL-конфиги)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              От режима зависят быстрые действия: команды MatchZy или конфиги и откат стандартными средствами CS2.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Код страны (флаг)</Label>
            <Input
              id="country"
              placeholder="RU"
              value={formData.country_code}
              onChange={(e) => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })}
              className="bg-white/5 border-border"
              maxLength={2}
            />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {server ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
