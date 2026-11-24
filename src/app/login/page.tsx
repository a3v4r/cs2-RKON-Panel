"use client";

import React, { useState } from 'react';
import { Crosshair, User, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
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
      setError(data.error || t('Не удалось войти', 'Login failed'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute top-4 right-4 z-10"><LanguageMenu /></div>

      <div className="fixed top-0 left-0 w-full h-full z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center shadow-xl shadow-primary/30">
              <Crosshair size={52} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Matchdesk</h1>

          <p className="text-gray-400 mt-2">{t('Панель судьи для турниров CS2', 'Referee panel for CS2 tournaments')}</p>
        </div>

        <div className="bg-card border border-gray-800/50 rounded-2xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">{t('С возвращением', 'Welcome back')}</h2>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="username">
                {t('Логин', 'Username')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-500" />
                </div>
                <input
                  className="block w-full pl-11 pr-4 py-2.5 bg-background/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm"
                  id="username"
                  placeholder={t('Логин', 'Username')}
                  required
                  type="text"
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="password">
                {t('Пароль', 'Password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-500" />
                </div>
                <input
                  className="block w-full pl-11 pr-12 py-2.5 bg-background/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none text-sm"
                  id="password"
                  placeholder="••••••••"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('Скрыть пароль', 'Hide password') : t('Показать пароль', 'Show password')}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2">
              <button
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card focus:ring-primary transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                type="submit"
                aria-label={loading ? t('Вход...', 'Signing in...') : undefined}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogIn size={18} />
                    {t('Войти', 'Sign In')}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
