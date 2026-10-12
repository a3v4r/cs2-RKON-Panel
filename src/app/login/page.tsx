"use client";

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(data.error || 'Не удалось войти');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#09090b] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 text-white">
          <Lock className="text-primary" size={22} />
          <h1 className="text-xl font-bold">CS2 RCON Panel</h1>
        </div>
        <Input
          autoFocus
          autoCapitalize="none"
          autoComplete="username"
          placeholder="Логин"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-11 bg-white/5 border-border text-white"
        />
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 bg-white/5 border-border text-white"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={loading} className="h-11 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
          {loading ? 'Вход...' : 'Войти'}
        </Button>
      </form>
    </div>
  );
}
