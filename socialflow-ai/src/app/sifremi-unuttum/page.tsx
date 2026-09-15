import { Suspense } from 'react';
import { getAppBranding } from '@/lib/settings/appSettings';
import prisma from '@/lib/prisma';
import { AuthShell } from '@/app/(auth)/AuthShell';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Şifremi Unuttum' };

export default async function ForgotPasswordPage() {
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  const branding = await getAppBranding(workspace?.id ?? null);

  return (
    <AuthShell
      appName={branding.appName}
      primaryColor={branding.primaryColor}
      secondaryColor={branding.secondaryColor}
      logoMark={branding.logoMark}
      title="Şifrenizi sıfırlayın"
      description="Kayıtlı e-posta adresinizi girin; size tek kullanımlık bir sıfırlama bağlantısı gönderelim."
      footer={
        <>
          <a href="/giris" className="font-semibold text-brand hover:underline">
            Giriş sayfasına dön
          </a>
        </>
      }
      aside={
        <>
          <h2 className="max-w-md text-[30px] font-extrabold leading-[1.18] tracking-tight">
            Güvenli oturum, güvenli sıfırlama.
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-white/70">
            Sıfırlama bağlantıları 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Şifreniz değiştiğinde tüm
            cihazlardaki oturumlarınız kapatılır.
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="skeleton h-48 w-full" />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
