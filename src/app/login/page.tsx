"use client";

import React, { useState } from 'react';
import { Crosshair, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { LanguageMenu } from '@/components/layout/language-menu';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t('Не удалось войти', 'Sign-in failed'));
      setLoading(false);
    }
  };

  const field = 'block w-full pl-11 py-2.5 bg-background/50 border border-input rounded-xl text-white placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm';

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute top-4 right-4 z-10"><LanguageMenu /></div>
      {/* Soft blue glow in the corners */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[30%] w-[30%] rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-700 shadow-xl shadow-primary/30">
            <Crosshair size={34} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Matchdesk</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('Панель судьи для турниров CS2', 'Referee panel for CS2 tournaments')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-xl sm:p-8">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400">{error}</div>
          )}
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-300">{t('Логин', 'Username')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground"><User size={18} /></div>
              <input
                id="username"
                autoFocus
                autoCapitalize="none"
                autoComplete="username"
                placeholder={t('Логин', 'Username')}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${field} pr-4`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">{t('Пароль', 'Password')}</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground"><Lock size={18} /></div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-gray-300"
                aria-label={showPassword ? t('Скрыть пароль', 'Hide password') : t('Показать пароль', 'Show password')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {loading && <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {loading ? t('Вход...', 'Signing in...') : t('Войти', 'Sign in')}
          </button>
        </form>
      </div>
    </div>
  );
}
