import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAppBranding } from '@/lib/settings/appSettings';
import prisma from '@/lib/prisma';
import { AuthShell } from '@/app/(auth)/AuthShell';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kayıt Ol' };

export default async function RegisterPage() {
  // Zaten oturumu olan kullanıcı doğrudan panele gider.
  if (cookies().get('sf_session')?.value) redirect('/app/dashboard');

  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  const branding = await getAppBranding(workspace?.id ?? null);

  return (
    <AuthShell
      appName={branding.appName}
      primaryColor={branding.primaryColor}
      secondaryColor={branding.secondaryColor}
      logoMark={branding.logoMark}
      title="Hesap oluşturun"
      description="Kendi çalışma alanınızı açın; markalarınızı ekleyip ilk içeriğinizi birkaç dakikada oluşturun."
      footer={
        <>
          Zaten hesabınız var mı?{' '}
          <a href="/giris" className="font-semibold text-brand hover:underline">
            Giriş yapın
          </a>
        </>
      }
      aside={
        <>
          <h2 className="max-w-md text-[30px] font-extrabold leading-[1.18] tracking-tight">
            Çok markalı sosyal medya yönetimi, tek panelde.
          </h2>
          <ul className="mt-6 space-y-3 text-[14px] text-white/75">
            <li>• Çalışma alanı (workspace) ve marka izolasyonu</li>
            <li>• Platform kurallarına göre anlamsal açıklama uyarlaması</li>
            <li>• Orijinali bozmayan medya varyantları</li>
            <li>• Taslak, önizleme ve platform bazlı düzenleme</li>
          </ul>
        </>
      }
    >
      <Suspense fallback={<div className="skeleton h-72 w-full" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
