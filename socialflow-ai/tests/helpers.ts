/**
 * Test yardımcıları — seed edilmiş test veritabanından bağlam çözer.
 * Tests, dev.db'yi kirletmemek için ayrı bir `test.db` üzerinde koşar
 * (DATABASE_URL npm script içinde ayarlanır).
 */
import prisma from '../src/lib/prisma';
import type { PublishContext } from '../src/lib/social/publishingService';

export interface SeedContext {
  workspaceId: string;
  userId: string;
  brandId: string;
  demoMode: boolean;
}

/** Seed edilmiş demo çalışma alanını/marka/kullanıcıyı çözer. */
export async function getSeedContext(): Promise<SeedContext> {
  const workspace = await prisma.workspace.findUnique({ where: { slug: 'demo-ajans' } });
  if (!workspace) {
    throw new Error('Test veritabanı seed edilmemiş. Önce `npm run test:setup` çalıştırın.');
  }
  const user = await prisma.user.findFirst({ where: { workspaceId: workspace.id, email: 'demo@socialflow.ai' } });
  const brand = await prisma.brand.findFirst({ where: { workspaceId: workspace.id, slug: 'kahve-dukkani' } });
  if (!user || !brand) throw new Error('Seed verisi eksik (kullanıcı veya marka bulunamadı).');
  return { workspaceId: workspace.id, userId: user.id, brandId: brand.id, demoMode: workspace.demoMode };
}

export function ctxOf(c: SeedContext): PublishContext {
  return { workspaceId: c.workspaceId, userId: c.userId, demoMode: true };
}

/** Verilen platform için aktif bir sosyal hesap döndürür. */
export async function accountFor(workspaceId: string, brandId: string, platform: string): Promise<string> {
  const acc =
    (await prisma.socialAccount.findFirst({ where: { workspaceId, brandId, platform, connectionStatus: 'ACTIVE' } })) ??
    (await prisma.socialAccount.findFirst({ where: { workspaceId, platform, connectionStatus: 'ACTIVE' } }));
  if (!acc) throw new Error(`${platform} için seed edilmiş aktif hesap yok.`);
  return acc.id;
}

/** Kare (1:1) demo görselini döndürür — FEED/POST hedefleri için güvenli. */
export async function squareMediaId(workspaceId: string): Promise<string> {
  const m =
    (await prisma.mediaAsset.findFirst({ where: { workspaceId, kind: 'IMAGE', filename: { contains: 'square' } } })) ??
    (await prisma.mediaAsset.findFirst({ where: { workspaceId, kind: 'IMAGE' } }));
  if (!m) throw new Error('Seed edilmiş görsel medya yok.');
  return m.id;
}

/** Bir içeriğin tüm PlatformContent çocuklarını döndürür. */
export async function targetsOf(contentId: string) {
  return prisma.platformContent.findMany({ where: { contentId }, orderBy: { createdAt: 'asc' } });
}

/** Test sonrası temizlik: içeriği (ve bağlantılı kayıtları) siler. */
export async function cleanupContent(contentId: string) {
  await prisma.content.delete({ where: { id: contentId } }).catch(() => {});
}

export { prisma };
