import { Suspense } from 'react';
import { getAppBranding } from '@/lib/settings/appSettings';
import prisma from '@/lib/prisma';
import { AuthShell } from '@/app/(auth)/AuthShell';
import { ResetPasswordForm } from './ResetPasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yeni Şifre Belirle' };

export default async function ResetPasswordPage() {
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  const branding = await getAppBranding(workspace?.id ?? null);

  return (
    <AuthShell
      appName={branding.appName}
      primaryColor={branding.primaryColor}
      secondaryColor={branding.secondaryColor}
      logoMark={branding.logoMark}
      title="Yeni şifrenizi belirleyin"
      description="Bağlantı tek kullanımlıktır ve 30 dakika içinde geçerliliğini yitirir."
      footer={
        <>
          <a href="/giris" className="font-semibold text-brand hover:underline">
            Giriş sayfasına dön
          </a>
        </>
      }
    >
      <Suspense fallback={<div className="skeleton h-56 w-full" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
