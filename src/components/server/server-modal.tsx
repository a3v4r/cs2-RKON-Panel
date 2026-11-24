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
import { useT } from '@/lib/i18n'

interface ServerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (server: ServerProfile) => void
  server?: ServerProfile | null
}

export function ServerModal({ open, onOpenChange, onSave, server }: ServerModalProps) {
  const { t } = useT()
  const [formData, setFormData] = useState<ServerProfile>({
    name: '',
    host: '',
    port: 27015,
    rcon_password: '',
    country_code: 'RU'
  })

  useEffect(() => {
    if (server) {
      // stored password never reaches the browser: empty = keep
      setFormData({ ...server, rcon_password: '' })
    } else {
      setFormData({
        name: '',
        host: '',
        port: 27015,
        rcon_password: '',
        country_code: 'RU'
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
      <DialogContent className="sm:max-w-[425px] border-border text-white">
        <DialogHeader>
          <DialogTitle>{server ? t('Изменить сервер', 'Edit server') : t('Новый сервер', 'New server')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('Название', 'Name')}</Label>
            <Input
              id="name"
              placeholder={t('Турнирный сервер #1', 'Tournament server #1')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-white/5 border-border"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="host">{t('Адрес / IP', 'Address / IP')}</Label>
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
              <Label htmlFor="port">{t('Порт', 'Port')}</Label>
              <Input
                id="port"
                type="number"
                placeholder="27015"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                className="bg-white/5 border-border"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('RCON-пароль', 'RCON password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={server ? t('Оставьте пустым, чтобы не менять', 'Leave empty to keep current') : '••••••••'}
              value={formData.rcon_password}
              onChange={(e) => setFormData({ ...formData, rcon_password: e.target.value })}
              className="bg-white/5 border-border"
              required={!server}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t('Код страны (флаг)', 'Country code (flag)')}</Label>
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
              {t('Отмена', 'Cancel')}
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {server ? t('Сохранить', 'Save') : t('Добавить', 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
