'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';

export function LoginForm({ demoUser }: { demoUser: { email: string; password: string; appName: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('yonlendir') || '/app/dashboard';

  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/login', { email, password });
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/6 px-3 py-2.5" role="alert">
          <Icon name="alert-triangle" size={15} className="mt-0.5 shrink-0 text-danger" strokeWidth={2.2} />
          <p className="text-[12.5px] font-medium leading-relaxed text-danger">{error}</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="label">
          E-posta
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@sirket.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Şifre
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPass ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="input pr-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-slate-100 hover:text-ink"
            aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            <Icon name={showPass ? 'eye-off' : 'eye'} size={16} />
          </button>
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
        {loading ? <Spinner size={17} /> : <Icon name="logout" size={16} className="rotate-180" />}
        {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
      </button>

      <div className="rounded-lg border border-line bg-slate-50 px-3 py-2.5">
        <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Demo hesabı</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11.5px] text-slate-800">{demoUser.email}</code>
          <br />
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11.5px] text-slate-800">Sosyal2026!</code>
        </p>
        <button
          type="button"
          className="mt-2 text-[12px] font-bold text-violet-700 hover:underline"
          onClick={() => {
            setEmail(demoUser.email);
            setPassword('Sosyal2026!');
          }}
        >
          Demo bilgilerini doldur
        </button>
      </div>

      <p className="text-center text-[11.5px] leading-relaxed text-slate-400">
        Bu uygulama güvenli oturum çerezleri (HttpOnly), CSRF koruması ve hız sınırlama kullanır.
        <br />
        Sosyal medya parolanız hiçbir zaman istenmez; bağlantılar resmî OAuth akışıyla kurulur.
      </p>
    </form>
  );
}
