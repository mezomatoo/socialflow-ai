import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { getUsageSummary } from '@/lib/ai/usage';
import { AiHistoryView } from './AiHistoryView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Geçmişi' };

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/giris');
  const workspaceId = session.user.workspaceId;

  // GERÇEK veriler: AiGeneration kayıtları + bu ay AiUsage özeti + geri bildirimler.
  const [generations, usage, feedbacks] = await Promise.all([
    prisma.aiGeneration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        type: true,
        provider: true,
        model: true,
        status: true,
        errorCode: true,
        tokensIn: true,
        tokensOut: true,
        durationMs: true,
        createdAt: true,
        brandId: true
      }
    }),
    getUsageSummary(workspaceId, 'month'),
    prisma.aiFeedback.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { outputId: true, rating: true }
    })
  ]);

  const ratingByOutput: Record<string, string> = {};
  for (const f of feedbacks) {
    if (f.outputId && !ratingByOutput[f.outputId]) ratingByOutput[f.outputId] = f.rating;
  }

  const brandIds = [...new Set(generations.map((g) => g.brandId).filter((id): id is string => Boolean(id)))];
  const brandRows = brandIds.length
    ? await prisma.brand.findMany({ where: { workspaceId, id: { in: brandIds } }, select: { id: true, name: true } })
    : [];
  const brandNameById = new Map(brandRows.map((b) => [b.id, b.name]));

  const items = generations.map((g) => ({
    id: g.id,
    type: g.type,
    provider: g.provider,
    model: g.model,
    status: g.status,
    errorCode: g.errorCode,
    tokensIn: g.tokensIn,
    tokensOut: g.tokensOut,
    durationMs: g.durationMs,
    createdAt: g.createdAt.toISOString(),
    brandName: g.brandId ? brandNameById.get(g.brandId) ?? null : null,
    rating: ratingByOutput[g.id] ?? null
  }));

  return (
    <AiHistoryView
      items={items}
      usage={{ totalCost: usage.totalCost, totalImages: usage.totalImages, totalTokens: usage.totalTokens, requests: usage.records.length }}
    />
  );
}
