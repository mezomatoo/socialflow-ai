import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { getContentDetail } from '@/lib/services/contentService';
import { PLATFORM_LIST } from '@/lib/platforms/platforms';
import { moduleState } from '@/lib/phase/phaseGates';
import { ComposerView } from './ComposerView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'İçerik Düzenle' };

export default async function ComposerPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/giris');
  const ws = session.user.workspaceId;

  const detail = await getContentDetail(params.id, ws);
  if (!detail) notFound();

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: ws },
    select: { id: true, platform: true, handle: true, displayName: true, demoAccount: true, connectionStatus: true, accountType: true },
    orderBy: { createdAt: 'asc' }
  });

  // Faz 2: hedef bazlı yayın geçmişi (denemeler + anlık görüntü) — §61
  const publications = await prisma.publication.findMany({
    where: { platformContentId: { in: detail.platformContents.map((pc: any) => pc.id) } },
    include: { attemptsLog: { orderBy: { attempt: 'desc' } }, snapshot: true }
  });
  const publicationHistory: Record<string, any> = {};
  for (const pub of publications) {
    publicationHistory[pub.platformContentId] = {
      status: pub.status,
      attempts: pub.attempts,
      lastError: pub.lastError,
      normalizedErrorCode: pub.normalizedErrorCode,
      publishedAt: pub.publishedAt ? pub.publishedAt.toISOString() : null,
      permalink: pub.permalink,
      providerPostId: pub.providerPostId,
      demoMode: pub.demoMode,
      snapshot: pub.snapshot
        ? {
            caption: pub.snapshot.caption,
            contentVersion: pub.snapshot.contentVersion,
            platformRuleVersion: pub.snapshot.platformRuleVersion,
            accountHandle: pub.snapshot.accountHandle,
            mediaKind: pub.snapshot.mediaKind,
            createdAt: pub.snapshot.createdAt.toISOString()
          }
        : null,
      attemptsLog: pub.attemptsLog.map((a) => ({
        attempt: a.attempt,
        ok: a.ok,
        providerCode: a.providerCode,
        normalizedCode: a.normalizedCode,
        friendlyMessage: a.friendlyMessage,
        durationMs: a.durationMs,
        createdAt: a.createdAt.toISOString()
      }))
    };
  }

  const platforms = PLATFORM_LIST.map((p) => ({
    code: p.code,
    name: p.name,
    color: p.brandColor,
    contentTypes: p.contentTypes.map((ct) => ({
      code: ct,
      label: p.contentTypeLabels?.[ct as keyof typeof p.contentTypeLabels] ?? ct
    }))
  }));

  // Date'leri ISO string'e çevir (JSON-serialize edilebilir)
  const serialized = JSON.parse(
    JSON.stringify({
      ...detail,
      media: detail.media.map((m: any) => ({ position: m.position, media: m.media })),
      platformContents: detail.platformContents.map((pc: any) => ({
        ...pc,
        focalPoint: pc.focalPoint ? JSON.parse(pc.focalPoint) : null,
        rule: pc.rule
          ? {
              ...pc.rule,
              safeArea: pc.rule.safeArea ?? null
            }
          : null
      }))
    })
  );

  return (
    <ComposerView
      content={serialized}
      accounts={JSON.parse(JSON.stringify(accounts))}
      platforms={platforms}
      timezone={session.user.timezone}
      demoMode={session.user.demoMode}
      role={session.user.role}
      modules={moduleState()}
      publicationHistory={publicationHistory}
    />
  );
}
