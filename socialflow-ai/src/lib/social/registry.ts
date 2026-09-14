import type { PlatformCode } from '../platforms/platforms';
import { PLATFORMS } from '../platforms/platforms';
import { env } from '../env';
import type { SocialProvider } from './types';
import { DemoProvider } from './providers/DemoProvider';
import { InstagramProvider } from './providers/InstagramProvider';
import { FacebookProvider } from './providers/FacebookProvider';
import { XProvider } from './providers/XProvider';
import { LinkedInProvider } from './providers/LinkedInProvider';
import { TikTokProvider } from './providers/TikTokProvider';
import { YouTubeProvider } from './providers/YouTubeProvider';
import { ThreadsProvider } from './providers/ThreadsProvider';
import { PinterestProvider } from './providers/PinterestProvider';
import { GoogleBusinessProvider } from './providers/GoogleBusinessProvider';

/**
 * Sağlayıcı kayıt defteri (registry).
 * ---------------------------------------------------------------------------
 * Yeni platform eklemek için:
 *   1. PLATFORMS dizisine kodu ekle
 *   2. PLATFORM_META kaydını tanımla
 *   3. providers/XxxProvider.ts adaptörünü yaz
 *   4. Aşağıdaki `factories` haritasına ekle
 * Uygulamanın geri kalanında HİÇBİR değişiklik gerekmez.
 */

type Factory = () => SocialProvider;

const factories: Record<PlatformCode, Factory> = {
  INSTAGRAM: () => new InstagramProvider(),
  FACEBOOK: () => new FacebookProvider(),
  X: () => new XProvider(),
  LINKEDIN: () => new LinkedInProvider(),
  TIKTOK: () => new TikTokProvider(),
  YOUTUBE: () => new YouTubeProvider(),
  THREADS: () => new ThreadsProvider(),
  PINTEREST: () => new PinterestProvider(),
  GOOGLE_BUSINESS: () => new GoogleBusinessProvider()
};

const instances = new Map<string, SocialProvider>();

/**
 * Platform adaptörünü döndürür.
 * - DEMO_MODE=true veya API kimlik bilgileri yoksa DemoProvider döner.
 * - DemoProvider ASLA yayınlanmış gibi davranmaz.
 */
export function getProvider(platform: PlatformCode | string, options: { forceReal?: boolean } = {}): SocialProvider {
  const code = platform as PlatformCode;
  if (!PLATFORMS.includes(code)) {
    throw new Error(`Bilinmeyen platform: ${platform}`);
  }

  const configured = Boolean(env.providers[code]?.id && env.providers[code]?.secret);
  const useDemo = !options.forceReal && (env.demoMode || !configured);

  const key = `${code}:${useDemo ? 'demo' : 'real'}`;
  const cached = instances.get(key);
  if (cached) return cached;

  const provider = useDemo ? new DemoProvider(code) : factories[code]();
  instances.set(key, provider);
  return provider;
}

export function isDemoProvider(platform: PlatformCode | string): boolean {
  const code = platform as PlatformCode;
  const configured = Boolean(env.providers[code]?.id && env.providers[code]?.secret);
  return env.demoMode || !configured;
}

export function allProviders(forceReal = false): SocialProvider[] {
  return PLATFORMS.map((p) => getProvider(p, { forceReal }));
}

export { DemoProvider };
