import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import { getAppBranding } from '@/lib/settings/appSettings';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Giriş Yap' };

const FEATURES = [
  {
    icon: 'sparkles',
    title: 'Tek açıklamadan tüm platformlara',
    text: 'Ana metni bir kez yazın; AI her platform için anlamını koruyarak ayrı ayrı uyarlasın.'
  },
  {
    icon: 'crop',
    title: 'Akıllı medya uyarlama',
    text: '1:1, 4:5, 9:16 ve 16:9 varyantları otomatik üretilir. Orijinal dosyanız asla değişmez.'
  },
  {
    icon: 'calendar',
    title: 'Tek merkezden planlama ve yayın',
    text: '6 içeriği birden planlayın, yayın durumunu tek panelden izleyin, başarısız olanı tek tıkla tekrar deneyin.'
  }
];

export default async function LoginPage() {
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
  const branding = await getAppBranding(workspace?.id ?? null);
  const demoUser = await prisma.user.findFirst({ where: { workspaceId: workspace?.id ?? '' }, select: { email: true } });

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sol — marka paneli */}
      <div
        className="relative hidden w-[46%] max-w-[620px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14"
        style={{ background: `linear-gradient(150deg, ${branding.primaryColor} 0%, #1e1b4b 58%, #0f172a 100%)` }}
      >
        <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl" style={{ background: branding.secondaryColor }} />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-[380px] w-[380px] rounded-full opacity-20 blur-3xl" style={{ background: branding.accentColor }} />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-[15px] font-black backdrop-blur">
              {branding.logoMark.slice(0, 2)}
            </span>
            <span className="text-[19px] font-extrabold tracking-tight">{branding.appName}</span>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-[34px] font-extrabold leading-[1.15] tracking-tight xl:text-[40px]">
            Tüm sosyal medyanız tek bir profesyonel kontrol merkezinde.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
            Bir görsel yükleyin, bir açıklama yazın, platformları seçin. Gerisini uyarlama motoru halletsin.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 backdrop-blur">
                  <FeatureIcon name={f.icon} />
                </span>
                <span>
                  <span className="block text-[14px] font-bold">{f.title}</span>
                  <span className="mt-0.5 block max-w-sm text-[12.5px] leading-relaxed text-white/60">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11.5px] text-white/40">
          © {new Date().getFullYear()} {branding.appName} · Türkçe arayüz · Europe/Istanbul
        </p>
      </div>

      {/* Sağ — form */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[14px] font-black text-white"
              style={{ background: branding.primaryColor }}
            >
              {branding.logoMark.slice(0, 2)}
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-slate-900">{branding.appName}</span>
          </div>

          <h2 className="text-[26px] font-extrabold tracking-tight text-slate-900">Tekrar hoş geldiniz</h2>
          <p className="mt-1.5 text-[13.5px] text-slate-500">Devam etmek için hesabınıza giriş yapın.</p>

          <div className="mt-7">
            <Suspense fallback={<div className="skeleton h-64 w-full" />}>
              <LoginForm demoUser={demoUser ? { email: demoUser.email, password: '', appName: branding.appName } : null} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const d: Record<string, React.ReactNode> = {
    sparkles: <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z M18.5 15.5 19.2 17.4 21 18.1 19.2 18.8 18.5 20.7 17.8 18.8 16 18.1 17.8 17.4z" />,
    crop: <path d="M6 2v14a2 2 0 0 0 2 2h14 M2 6h14a2 2 0 0 1 2 2v14" />,
    calendar: <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18M8 3v4M16 3v4" />
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d[name]}
    </svg>
  );
}
