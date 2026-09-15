import { apiRoute, ok } from '@/lib/api';
import { getUsageSummary } from '@/lib/ai/usage';
import { aiModeLabel, activeProvider } from '@/lib/ai/llmClient';

/**
 * PHASE 4 — AI Kullanım Özeti (§57)
 * GET: çalışma alanının gerçek AiUsage kayıtlarından özet döner.
 * Yetki: her oturum kendi çalışma alanının özetini görebilir (sahip/yönetici
 * dışındaki roller için maliyet alanı çalışma alanına aittir; kayıt bazlı
 * ayrıntı kullanıcı bazında filtrelenmez — çalışma alanı içi şeffaflık).
 */

export const GET = apiRoute(async (request, { session }) => {
  const periodParam = new URL(request.url).searchParams.get('period');
  const period = periodParam === 'today' ? 'today' : 'month';
  const summary = await getUsageSummary(session.user.workspaceId, period);
  return ok({
    ...summary,
    provider: activeProvider(),
    aiMode: aiModeLabel(),
    period
  });
});
