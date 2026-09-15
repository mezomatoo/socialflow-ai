import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Giriş / kayıt / şifre sıfırlama ekranlarının ortak kabuğu.
 * Tamamen Türkçe, erişilebilir (semantik başlık, odak durumları) ve mobil uyumlu.
 */
export function AuthShell({
  appName,
  primaryColor,
  secondaryColor,
  logoMark,
  title,
  description,
  children,
  footer,
  aside
}: {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  logoMark: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-white">
      <div
        className="relative hidden w-[42%] max-w-[560px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-12"
        style={{ background: `linear-gradient(150deg, ${primaryColor} 0%, #1e1b4b 58%, #0f172a 100%)` }}
        aria-hidden="true"
      >
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: secondaryColor }}
        />
        <Link href="/giris" className="relative flex items-center gap-3 focus-ring rounded-xl">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-[15px] font-black backdrop-blur">
            {logoMark.slice(0, 2)}
          </span>
          <span className="text-[19px] font-extrabold tracking-tight">{appName}</span>
        </Link>

        <div className="relative">
          {aside ?? (
            <>
              <h2 className="max-w-md text-[30px] font-extrabold leading-[1.18] tracking-tight">
                Tek master içerik, tüm platformlara uyarlanmış hâliyle.
              </h2>
              <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-white/70">
                Bir açıklama yazın, platformları seçin; başlık, etiket ve medya varyantlarını SocialFlow AI hazırlasın.
              </p>
            </>
          )}
        </div>

        <p className="relative text-[11.5px] text-white/40">
          © {new Date().getFullYear()} {appName} · Türkçe arayüz · Europe/Istanbul
        </p>
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[14px] font-black text-white"
              style={{ background: primaryColor }}
            >
              {logoMark.slice(0, 2)}
            </span>
            <span className="text-[17px] font-extrabold tracking-tight text-slate-900">{appName}</span>
          </div>

          <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">{description}</p>

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-6 text-[13px] text-slate-500">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

/** Form alanı (etiketli, erişilebilir). */
export function AuthField({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11.5px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5" role="alert">
      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      <p className="text-[12.5px] font-medium leading-relaxed text-danger">{message}</p>
    </div>
  );
}

export function AuthSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-2.5" role="status">
      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
      <p className="text-[12.5px] font-medium leading-relaxed text-success">{message}</p>
    </div>
  );
}
