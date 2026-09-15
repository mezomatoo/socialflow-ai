'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/client/api';
import { Spinner } from '@/components/ui';
import { AuthError, AuthField } from '@/app/(auth)/AuthShell';

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) return setError('Lütfen ad ve soyadınızı girin.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Geçerli bir e-posta adresi girin.');
    if (password.length < 8) return setError('Şifre en az 8 karakter olmalıdır.');
    if (password !== password2) return setError('Şifreler birbiriyle eşleşmiyor.');
    if (!terms) return setError('Devam etmek için kullanım koşullarını kabul etmelisiniz.');

    setLoading(true);
    try {
      await api.post('/api/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
        workspaceName: workspaceName.trim() || undefined
      });
      router.push('/app/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <AuthError message={error} />

      <AuthField id="name" label="Ad soyad">
        <input
          id="name"
          className="input"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Deniz Yılmaz"
        />
      </AuthField>

      <AuthField id="email" label="İş e-postası">
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

      <AuthField id="workspaceName" label="Çalışma alanı adı" hint="Acenteyseniz müşteri veya ekip adınızı yazabilirsiniz.">
        <input
          id="workspaceName"
          className="input"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="Örn. Nova Dijital Ajans"
        />
      </AuthField>

      <AuthField id="password" label="Şifre" hint="En az 8 karakter.">
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

      <AuthField id="password2" label="Şifre (tekrar)">
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

      <label className="flex items-start gap-2 text-[12.5px] text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-line text-brand focus-ring"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
        />
        <span>Kullanım koşullarını ve gizlilik politikasını okudum, kabul ediyorum.</span>
      </label>

      <button type="submit" className="btn-primary btn-md w-full justify-center" disabled={loading}>
        {loading ? <Spinner size={15} /> : null}
        {loading ? 'Hesap oluşturuluyor…' : 'Ücretsiz hesap oluştur'}
      </button>
    </form>
  );
}
