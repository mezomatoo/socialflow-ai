'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Spinner } from '@/components/ui';
import { AuthError, AuthField, AuthSuccess } from '@/app/(auth)/AuthShell';

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) return setError('Sıfırlama bağlantısı eksik veya geçersiz. Lütfen yeni bir bağlantı isteyin.');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalıdır.');
    if (password !== password2) return setError('Şifreler birbiriyle eşleşmiyor.');

    setLoading(true);
    try {
      const res = await api.post<{ message: string }>('/api/auth/reset-password', { token, password });
      setDone(res.message);
      setTimeout(() => router.push('/giris'), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Şifre güncellenemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError message={error} />
      <AuthSuccess message={done} />

      <AuthField id="password" label="Yeni şifre" hint="En az 8 karakter.">
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </AuthField>

      <AuthField id="password2" label="Yeni şifre (tekrar)">
        <input
          id="password2"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
      </AuthField>

      <button type="submit" className="btn-primary btn-md w-full justify-center" disabled={loading || Boolean(done)}>
        {loading ? <Spinner size={15} /> : null}
        {loading ? 'Güncelleniyor…' : 'Şifremi güncelle'}
      </button>
    </form>
  );
}
