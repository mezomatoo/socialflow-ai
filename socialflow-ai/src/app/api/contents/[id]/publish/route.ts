import { apiRoute, ok, badRequest } from '@/lib/api';
import prisma from '@/lib/prisma';
import { publishContent } from '@/lib/social/publishingService';
import { runPreflight } from '@/lib/services/validationService';
import { audit } from '@/lib/security/audit';

/** "Şimdi Yayınla" — tüm hedefleri sırayla yayınlar (kısmi başarı korunur). */
export const POST = apiRoute(
  async (request, { session, params }) => {
    const content = await prisma.content.findFirst({ where: { id: params.id, workspaceId: session.user.workspaceId } });
    if (!content) return badRequest('İçerik bulunamadı.');

    const body = await request.json().catch(() => ({}));
    const preflight = await runPreflight(params.id, session.user.workspaceId, { demoMode: session.user.demoMode });

    if (body.strict !== false && preflight.readyCount === 0) {
      return badRequest(preflight.headline || 'Yayına hazır hedef bulunmuyor.');
    }

    const targetIds: string[] | undefined = Array.isArray(body.targetIds) ? body.targetIds.map(String) : undefined;
    const targets = targetIds
      ? preflight.targets.filter((t) => targetIds.includes(t.platformContentId) && t.ready)
      : preflight.targets.filter((t) => t.ready);

    await prisma.content.update({ where: { id: params.id }, data: { status: 'PUBLISHING', scheduleMode: 'NOW' } });

    const results = [];
    for (const t of targets) {
      const { publishPlatformContent } = await import('@/lib/social/publishingService');
      results.push(
        await publishPlatformContent(t.platformContentId, {
          workspaceId: session.user.workspaceId,
          userId: session.user.id,
          demoMode: session.user.demoMode
        })
      );
    }

    await audit({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      action: 'content.publish',
      entityType: 'Content',
      entityId: params.id,
      metadata: { targets: results.length, demoMode: session.user.demoMode },
      request
    });

    const fresh = await prisma.content.findUnique({ where: { id: params.id }, select: { status: true } });
    return ok({
      results,
      ready: results.filter((r) => r.ok).length,
      total: results.length,
      skipped: preflight.targets.filter((t) => !t.ready).map((t) => ({ label: t.label, reason: t.checks.find((c) => c.level === 'ERROR')?.message })),
      contentStatus: fresh?.status ?? 'DRAFT',
      demoMode: session.user.demoMode
    });
  },
  { limit: 20, windowMs: 60_000 }
);
