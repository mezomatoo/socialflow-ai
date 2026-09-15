import prisma from '../prisma';

/**
 * Uygulama markası (ad, logo, renkler) — Admin Ayarları'ndan düzenlenebilir.
 * Varsayılanlar burada tanımlıdır; çalışma alanı için kayıt varsa o kullanılır.
 */

export interface AppBranding {
  appName: string;
  logoMark: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  radius: string;
  fontFamily: string;
  defaultLanguage: string;
  defaultTimezone: string;
  demoBanner: boolean;
  aiProvider: string;
  aiModel: string | null;
  demoMode: boolean;
}

export const DEFAULT_BRANDING: AppBranding = {
  appName: 'SocialFlow AI',
  logoMark: 'SF',
  logoUrl: null,
  primaryColor: '#6D28D9',
  secondaryColor: '#0EA5E9',
  accentColor: '#F59E0B',
  radius: '16px',
  fontFamily: 'Inter',
  defaultLanguage: 'tr',
  defaultTimezone: 'Europe/Istanbul',
  demoBanner: false,
  aiProvider: 'deterministic',
  aiModel: null,
  demoMode: false
};

export async function getAppBranding(workspaceId?: string | null): Promise<AppBranding> {
  if (!workspaceId) return { ...DEFAULT_BRANDING, demoMode: process.env.DEMO_MODE !== 'false' };
  const settings = await prisma.appSettings.findUnique({ where: { workspaceId } });
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { demoMode: true } });
  if (!settings) return { ...DEFAULT_BRANDING, demoMode: workspace?.demoMode ?? false };
  return {
    appName: settings.appName,
    logoMark: settings.logoMark,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    accentColor: settings.accentColor,
    radius: settings.radius,
    fontFamily: settings.fontFamily,
    defaultLanguage: settings.defaultLanguage,
    defaultTimezone: settings.defaultTimezone,
    demoBanner: settings.demoBanner,
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    demoMode: workspace?.demoMode ?? false
  };
}

/** Marka renginden açık/koyu ton paletini türetir (HSL karışımı). */
export function buildPalette(hex: string): Record<string, string> {
  const { h, s, l } = hexToHsl(hex);
  const mix = (target: number, sat = s) => hslToHex(h, sat, target);
  return {
    '--brand-50': mix(Math.min(97, l + (100 - l) * 0.92), Math.min(100, sat(s) * 1.1)),
    '--brand-100': mix(Math.min(94, l + (100 - l) * 0.84)),
    '--brand-200': mix(Math.min(88, l + (100 - l) * 0.68)),
    '--brand-300': mix(Math.min(80, l + (100 - l) * 0.46)),
    '--brand-400': mix(Math.min(68, l + (100 - l) * 0.2)),
    '--brand-500': hslToHex(h, s, l),
    '--brand-600': mix(Math.max(18, l * 0.86)),
    '--brand-700': mix(Math.max(14, l * 0.72)),
    '--brand-800': mix(Math.max(10, l * 0.58)),
    '--brand-900': mix(Math.max(7, l * 0.45))
  };

  function sat(v: number) {
    return Math.min(100, v);
  }
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  let rgb: [number, number, number] = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** CSS değişkenleri olarak satır içi stil nesnesi. */
/** Hex → "r g b" (Tailwind alpha-value desteği için). */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `${r} ${g} ${b}`;
}

/** Statik (marka renginden bağımsız) yüzey/metin değişkenleri. */
export const BASE_RGB_VARS: Record<string, string> = {
  '--surface-rgb': '255 255 255',
  '--surface-subtle-rgb': '248 250 252',
  '--surface-raised-rgb': '255 255 255',
  '--surface-sunken-rgb': '241 245 249',
  '--ink-rgb': '15 23 42',
  '--ink-muted-rgb': '85 98 122',
  '--ink-faint-rgb': '148 163 184',
  '--ink-inverse-rgb': '255 255 255',
  '--line-rgb': '230 234 242',
  '--success-rgb': '16 185 129',
  '--warning-rgb': '245 158 11',
  '--danger-rgb': '239 68 68',
  '--info-rgb': '14 165 233'
};

export function brandingCssVariables(branding: AppBranding): Record<string, string> {
  const palette = buildPalette(branding.primaryColor);
  const rgbVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) {
    rgbVars[`${key}-rgb`] = hexToRgbTriplet(value);
  }
  const radius = parseInt(branding.radius) || 16;
  return {
    ...BASE_RGB_VARS,
    ...palette,
    ...rgbVars,
    '--radius-card': branding.radius,
    '--radius-field': `${Math.max(6, Math.round(radius * 0.62))}px`,
    '--font-ui': `"${branding.fontFamily}", Inter, system-ui, sans-serif`,
    '--accent': branding.accentColor,
    '--secondary': branding.secondaryColor
  } as Record<string, string>;
}
