import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { audit } from '@/lib/security/audit';

function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  return String(s)
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'marka';
}

function serialize(b: any) {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    primaryColor: b.primaryColor,
    secondaryColor: b.secondaryColor,
    fontStyle: b.fontStyle,
    website: b.website,
    defaultCta: b.defaultCta,
    description: b.description,
    targetAudience: b.targetAudience,
    defaultStyle: b.defaultStyle,
    defaultHashtags: b.defaultHashtags,
    requiredHashtags: b.requiredHashtags,
    bannedHashtags: b.bannedHashtags,
    defaultMentions: b.defaultMentions,
    isDefault: b.isDefault,
    voice: b.voice
      ? {
          ...b.voice,
          allowedTerms: b.voice.allowedTerms.split(',').map((s: string) => s.trim()).filter(Boolean),
          bannedTerms: b.voice.bannedTerms.split(',').map((s: string) => s.trim()).filter(Boolean),
          mustKeepTerms: b.voice.mustKeepTerms.split(',').map((s: string) => s.trim()).filter(Boolean)
        }
      : null,
    _count: b._count
  };
}

export const GET = apiRoute(async (_request, { session }) => {
  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { voice: true, _count: { select: { socialAccounts: true, contents: true } } }
  });
  return ok({ items: brands.map(serialize) });
});

export const POST = apiRoute(
  async (request, { session }) => {
    const body = await request.json().catch(() => ({}));
    if (!body.name) return badRequest('Marka adı zorunludur.');

    const count = await prisma.brand.count({ where: { workspaceId: session.user.workspaceId } });
    const brand = await prisma.brand.create({
      data: {
        workspaceId: session.user.workspaceId,
        name: String(body.name),
        slug: slugify(String(body.name)) + (count ? `-${count + 1}` : ''),
        logoUrl: body.logoUrl ? String(body.logoUrl) : null,
        primaryColor: body.primaryColor ? String(body.primaryColor) : '#6D28D9',
        secondaryColor: body.secondaryColor ? String(body.secondaryColor) : '#0EA5E9',
        fontStyle: body.fontStyle ? String(body.fontStyle) : 'Inter',
        website: body.website ? String(body.website) : null,
        defaultCta: body.defaultCta ? String(body.defaultCta) : null,
        description: body.description ? String(body.description) : null,
        targetAudience: body.targetAudience ? String(body.targetAudience) : null,
        defaultStyle: body.defaultStyle ? String(body.defaultStyle) : 'PROFESSIONAL',
        defaultHashtags: String(body.defaultHashtags ?? ''),
        requiredHashtags: String(body.requiredHashtags ?? ''),
        bannedHashtags: String(body.bannedHashtags ?? ''),
        defaultMentions: String(body.defaultMentions ?? ''),
        isDefault: count === 0,
        voice: {
          create: {
            tone: body.voice?.tone ? String(body.voice.tone) : 'profesyonel ve samimi',
            personality: body.voice?.personality ?? null,
            audience: body.voice?.audience ?? body.targetAudience ?? null,
            allowedTerms: Array.isArray(body.voice?.allowedTerms) ? body.voice.allowedTerms.join(', ') : '',
            bannedTerms: Array.isArray(body.voice?.bannedTerms) ? body.voice.bannedTerms.join(', ') : '',
            mustKeepTerms: Array.isArray(body.voice?.mustKeepTerms) ? body.voice.mustKeepTerms.join(', ') : '',
            formality: body.voice?.formality ?? 'NEUTRAL',
            emojiLevel: body.voice?.emojiLevel ?? 'MEDIUM'
          }
        }
      },
      include: { voice: true, _count: { select: { socialAccounts: true, contents: true } } }
    });

    await audit({ workspaceId: session.user.workspaceId, userId: session.user.id, action: 'brand.create', entityType: 'Brand', entityId: brand.id, request });
    return ok(serialize(brand));
  },
  { limit: 30 }
);
