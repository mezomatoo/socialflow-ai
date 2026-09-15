'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { Spinner } from '@/components/ui';
import { AuthError, AuthField, AuthSuccess } from '@/app/(auth)/AuthShell';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(null);
    setDevLink(null);
    setLoading(true);
    try {
      const res = await api.post<{ message: string; devHint?: string }>('/api/auth/forgot-password', {
        email: email.trim()
      });
      setSent(res.message);
      if (res.devHint) setDevLink(res.devHint);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İstek gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError message={error} />
      <AuthSuccess message={sent} />

      {devLink ? (
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
          Geliştirme/demo modu: e-posta gönderimi yapılandırılmadığı için bağlantı burada gösteriliyor —{' '}
          <a href={devLink} className="font-semibold text-brand hover:underline">
            şifremi sıfırla
          </a>
        </p>
      ) : null}

      <AuthField id="email" label="E-posta">
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@sirket.com"
        />
      </AuthField>

      <button type="submit" className="btn-primary btn-md w-full justify-center" disabled={loading}>
        {loading ? <Spinner size={15} /> : null}
        {loading ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
      </button>
    </form>
  );
}
