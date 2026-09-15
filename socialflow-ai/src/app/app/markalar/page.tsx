import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { BrandsView } from './BrandsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marka Profilleri' };

function csv(v: string | null): string[] {
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export default async function BrandsPage() {
  const session = await getSession();
  if (!session) redirect('/giris');

  const brands = await prisma.brand.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { voice: true, _count: { select: { socialAccounts: true, contents: true } } }
  });

  const items = brands.map((b) => ({
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
    defaultHashtags: csv(b.defaultHashtags),
    requiredHashtags: csv(b.requiredHashtags),
    bannedHashtags: csv(b.bannedHashtags),
    defaultMentions: csv(b.defaultMentions),
    isDefault: b.isDefault,
    accounts: b._count.socialAccounts,
    contents: b._count.contents,
    voice: b.voice
      ? {
          tone: b.voice.tone,
          personality: b.voice.personality,
          audience: b.voice.audience,
          allowedTerms: csv(b.voice.allowedTerms),
          bannedTerms: csv(b.voice.bannedTerms),
          mustKeepTerms: csv(b.voice.mustKeepTerms),
          formality: b.voice.formality,
          emojiLevel: b.voice.emojiLevel
        }
      : null
  }));

  return <BrandsView items={JSON.parse(JSON.stringify(items))} />;
}
