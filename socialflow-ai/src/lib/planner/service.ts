/**
 * PHASE 4 — AI İçerik Planlayıcı (§80-§85, §123)
 * ---------------------------------------------------------------------------
 * SUNUCU TARAFINDA çalışır; ContentPlan/ContentPlanItem GERÇEK kayıtlardır.
 *
 * Girdiler (§81): marka, platformlar, tarih aralığı, kampanya, hedef, sıklık,
 * hedef kitle, ton. Bağlam: Marka Kiti (ton/CTA/onaylı hashtag) + kampanya +
 * son 30 günlük GERÇEK içerik konuları (tekrar önleme §84).
 *
 * Üretim (§52-§55): harici AI yapılandırılmışsa prompt şablonu + şema ile
 * yapılandırılmış çıktı istenir ve DOĞRULANIR; doğrulama/erişim başarısızsa
 * deterministik yerel planlayıcı devreye girer. Her iki durumda da planın
 * hangi motorla üretildiği dürüstçe kaydedilir.
 *
 * GÜVENLİK (§83/§85): plan ASLA yayınlanmaz; "Takvime Ekle" yalnızca TASLAK
 * içerik açar. Geçmiş veri yetersizse plan bu etiketle işaretlenir; uydurma
 * performans verisi üretilmez.
 */
import prisma from '../prisma';
import { completeJson } from '../ai/llmClient';
import { getTemplate, renderTemplate, validateOutput } from '../ai/promptTemplates';
import { ensureBrandKit } from '../brandkit/service';
import { recordGeneration } from '../ai/generationLog';
import { trackUsage, estimateTokens } from '../ai/usage';

export interface PlanRequest {
  brandId: string;
  platforms: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  campaignId?: string | null;
  goal?: string | null;
  frequency?: string | null;
  targetAudience?: string | null;
  tone?: string | null;
  importantDates?: string | null;
}

export interface PlanItemResult {
  id: string;
  date: string;
  timeSuggestion: string;
  platform: string;
  contentType: string;
  topic: string;
  headline: string;
  captionConcept: string;
  creativeConcept: string;
  cta: string;
  hashtags: string[];
  status: string;
  contentId: string | null;
}

export interface PlanResult {
  planId: string;
  title: string;
  brandId: string;
  campaignId: string | null;
  dateFrom: string;
  dateTo: string;
  platforms: string[];
  engine: 'ai' | 'deterministic';
  engineLabel: string;
  dataBasis: 'INSUFFICIENT_HISTORY' | 'RECENT_HISTORY';
  dataBasisNote: string;
  duplicatesAvoided: number;
  items: PlanItemResult[];
}

const CONTENT_TYPES: Record<string, string> = {
  INSTAGRAM: 'FEED',
  FACEBOOK: 'FEED',
  LINKEDIN: 'POST',
  X: 'POST',
  TIKTOK: 'VIDEO',
  YOUTUBE: 'VIDEO',
  PINTEREST: 'PIN',
  THREADS: 'POST'
};

/** Platform için önerilen saat (yerel saat) — öneridir, garantisi yoktur. */
const TIME_SUGGESTIONS: Record<string, string> = {
  INSTAGRAM: '12:00',
  FACEBOOK: '15:00',
  LINKEDIN: '09:30',
  X: '17:00',
  TIKTOK: '20:00',
  YOUTUBE: '18:00',
  PINTEREST: '21:00',
  THREADS: '13:00'
};

const TOPIC_PILLARS = [
  { topic: 'Eğitici', concept: 'Takipçiye somut fayda sağlayan nasıl-yapılır / ipucu içeriği' },
  { topic: 'Etkileşim', concept: 'Soru, anket veya yorum çağrısıyla etkileşim kuran içerik' },
  { topic: 'Marka Hikayesi', concept: 'Markanın hikâyesini, ekibini veya üretim sürecini anlatan içerik' },
  { topic: 'Ürün', concept: 'Ürünü/hizmeti merkeze alan, abartısız tanıtım içeriği' },
  { topic: 'Topluluk', concept: 'Müşteri hikâyesi, sosyal kanıt veya topluluk payı' },
  { topic: 'Kampanya', concept: 'Duyurulan kampanya/hedefiyle bağlantılı içerik' }
] as const;

function parseDate(value: string, endOfDay = false): Date {
  const d = new Date(`${value}T00:00:00Z`);
  if (endOfDay) d.setUTCHours(23, 59, 59, 0);
  return d;
}

function perWeekFromFrequency(frequency?: string | null): number {
  if (!frequency) return 3;
  if (frequency.includes('2')) return 2;
  if (frequency.includes('3')) return 3;
  if (frequency.includes('4')) return 4;
  if (frequency.toLowerCase().includes('gün') || frequency.toLowerCase().includes('gunde') || frequency.toLowerCase().includes('her')) return 7;
  return 3;
}

function normalizeHashtags(raw: unknown, approved: string[]): string[] {
  let list: string[] = [];
  if (Array.isArray(raw)) list = raw.map((h) => String(h).trim());
  else if (typeof raw === 'string') list = raw.split(/[,\s]+/);
  list = list
    .map((h) => h.replace(/^#*/, '#'))
    .filter((h) => /^#[\p{L}\p{N}_]+$/u.test(h) && h.length > 1)
    .slice(0, 8);
  // Yalnızca kitte onaylı olanlar + hiçbiri yoksa boş liste (uydurma hashtag yok).
  if (approved.length) {
    const lower = approved.map((a) => a.toLowerCase());
    list = list.filter((h) => lower.includes(h.toLowerCase()));
  } else {
    list = [];
  }
  return [...new Set(list)];
}

function sanitizeItems(rawItems: unknown, opts: { approvedHashtags: string[]; preferredCta: string | null; platforms: string[]; seenTopics: Set<string> }): {
  items: any[];
  duplicatesAvoided: number;
} {
  const source = Array.isArray(rawItems) ? rawItems.slice(0, 60) : [];
  const items: any[] = [];
  let duplicatesAvoided = 0;
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const platform = String(r.platform ?? '').toUpperCase();
    if (!opts.platforms.includes(platform)) continue;
    const topic = String(r.topic ?? '').trim().slice(0, 80);
    const headline = String(r.headline ?? '').trim().slice(0, 160);
    if (!topic || !headline) continue;
    // §84 — belirgin tekrar konuları ele (aynı normalleştirilmiş başlık/konu)
    const key = `${topic}|${headline}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (opts.seenTopics.has(key)) {
      duplicatesAvoided++;
      continue;
    }
    opts.seenTopics.add(key);
    items.push({
      date: String(r.date ?? '').slice(0, 10),
      platform,
      contentType: String(r.contentType ?? CONTENT_TYPES[platform] ?? 'POST').toUpperCase().slice(0, 20),
      topic,
      headline,
      captionConcept: String(r.captionConcept ?? '').trim().slice(0, 400),
      creativeConcept: String(r.creativeConcept ?? '').trim().slice(0, 400),
      cta: String(r.cta ?? opts.preferredCta ?? '').trim().slice(0, 60) || null,
      hashtags: normalizeHashtags(r.hashtags, opts.approvedHashtags)
    });
  }
  return { items, duplicatesAvoided };
}

/** Deterministik yerel planlayıcı — marka bağlamıyla, uydurma veri olmadan. */
function deterministicPlanItems(input: PlanRequest, perWeek: number, opts: { approvedHashtags: string[]; preferredCta: string | null; recentTopics: Set<string> }): { items: any[]; duplicatesAvoided: number } {
  const start = parseDate(input.dateFrom);
  const end = parseDate(input.dateTo, true);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const total = Math.min(30, Math.max(1, Math.round((days / 7) * perWeek)));
  const gapDays = Math.max(1, Math.floor(7 / Math.max(1, Math.min(perWeek, 7))));
  const seen = new Set<string>();
  const items: any[] = [];
  let duplicatesAvoided = 0;

  for (let i = 0; i < total; i++) {
    const platform = input.platforms[i % input.platforms.length];
    const pillar = TOPIC_PILLARS[i % TOPIC_PILLARS.length];
    const date = new Date(start.getTime() + i * gapDays * 86400000);
    if (date > end) break;
    const goalPart = input.goal ? `${input.goal} — ` : '';
    const headline = `${goalPart}${pillar.topic} içeriği ${i + 1}`;
    const key = `${pillar.topic}|${headline}`.toLowerCase();
    if (opts.recentTopics.has(key) || seen.has(key)) {
      duplicatesAvoided++;
      continue;
    }
    seen.add(key);
    items.push({
      date: date.toISOString().slice(0, 10),
      platform,
      contentType: CONTENT_TYPES[platform] ?? 'POST',
      topic: pillar.topic,
      headline,
      captionConcept: `${pillar.concept}. Marka tonu: ${input.tone ?? 'Marka sesine uygun'}.`,
      creativeConcept: 'Marka kitindeki onaylı renk paleti ve görsel kurallarla uyumlu sade kompozisyon.',
      cta: opts.preferredCta,
      hashtags: opts.approvedHashtags.slice(0, 4)
    });
  }
  return { items, duplicatesAvoided };
}

/**
 * Plan üretir ve VERİTABANINA yazar (§82). Çalışma alanı izolasyonu burada
 * zorlanır: marka/kampanya başka çalışma alanına aitse bulunamaz.
 */
export async function generateContentPlan(input: PlanRequest, ctx: { workspaceId: string; userId: string }): Promise<PlanResult> {
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: ctx.workspaceId } });
  if (!brand) throw new Error('Marka bulunamadı.');
  if (!input.platforms.length) throw new Error('En az bir platform seçilmelidir.');

  let campaignName: string | null = null;
  if (input.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: ctx.workspaceId } });
    if (!campaign) throw new Error('Kampanya bulunamadı.');
    campaignName = campaign.name;
  }

  // Marka Kiti bağlamı (§60)
  const kit = await ensureBrandKit({ workspaceId: ctx.workspaceId, brandId: input.brandId });
  const approvedHashtags = (kit?.hashtags ?? [])
    .filter((h: any) => h.category === 'APPROVED' && h.approvalStatus === 'APPROVED')
    .map((h: any) => String(h.tag).replace(/^#*/, '#'));
  const preferredCta = (kit?.ctas ?? []).find((c: any) => c.category === 'PREFERRED' && c.approvalStatus === 'APPROVED')?.text ?? brand.defaultCta ?? null;
  const tone = input.tone ?? kit?.brand?.voice?.tone ?? null;

  // §84 — son 30 günün gerçek konuları (tekrar önleme bağlamı)
  const since = new Date(Date.now() - 30 * 86400000);
  const recentContents = await prisma.content.findMany({
    where: { workspaceId: ctx.workspaceId, brandId: input.brandId, createdAt: { gte: since } },
    select: { title: true, masterCaption: true },
    take: 50
  });
  const recentTopics = new Set<string>();
  for (const c of recentContents) {
    const t = (c.title ?? c.masterCaption.slice(0, 60)).toLowerCase().trim();
    if (t) recentTopics.add(t);
  }

  // §85 — geçmiş veri yeterliliği (GERÇEK sayım; uydurma yok)
  const dataBasis: PlanResult['dataBasis'] = recentContents.length >= 5 ? 'RECENT_HISTORY' : 'INSUFFICIENT_HISTORY';
  const dataBasisNote =
    dataBasis === 'RECENT_HISTORY'
      ? `Son 30 günde ${recentContents.length} gerçek içerik analiz edilerek öneriler geçmişe göre dengelendi.`
      : 'Son 30 günde yeterli içerik geçmişi yok; öneriler marka kitine göre üretilti ve performans temelli DEĞİLDİR.';

  const perWeek = perWeekFromFrequency(input.frequency);
  const started = Date.now();

  // ---- AI üretimi (şemayla doğrulanmış) veya deterministik düşüş ----------
  const tpl = await getTemplate('contentPlanner');
  const schema = tpl?.outputSchema ?? { type: 'object', properties: { items: { type: 'array' } } };
  const promptUser = renderTemplate(tpl?.template ?? 'Marka: {{brand}}\nKampanya: {{campaign}}\nTarih aralığı: {{from}} - {{to}}\nPlatformlar: {{platforms}}', {
    brand: brand.name,
    campaign: campaignName ?? 'yok',
    from: input.dateFrom,
    to: input.dateTo,
    platforms: input.platforms.join(', ')
  });
  const detail = [
    `Hedef: ${input.goal ?? 'belirtilmedi'}`,
    `Sıklık: haftada ${perWeek}`,
    `Hedef kitle: ${input.targetAudience ?? 'belirtilmedi'}`,
    `Ton: ${tone ?? 'marka sesi'}`,
    `Önemli tarihler: ${input.importantDates ?? 'yok'}`,
    `Onaylı hashtagler: ${approvedHashtags.join(' ') || 'yok'}`,
    `Tercih edilen CTA: ${preferredCta ?? 'yok'}`,
    `Son 30 günün konuları (TEKRAR ETME): ${[...recentTopics].slice(0, 20).join(' | ') || 'yok'}`,
    `Çıktı dili Türkçe olmalı. Fiyat/indirim/tarih UYDURMA.`
  ].join('\n');

  let engine: PlanResult['engine'] = 'deterministic';
  let rawItems: unknown = null;

  const outcome = await completeJson<Record<string, unknown>>({
    system:
      (tpl?.systemPrompt ?? 'Aylık içerik takvimi planlayan stratejistsin.') +
      ' Yalnızca verilen platformları ve onaylı hashtagleri kullan; fiyat, indirim veya tarih UYDURMA; JSON şemasına uy.',
    user: `${promptUser}\n\n${detail}\n\nHer öğe: { date (YYYY-MM-DD), platform, contentType, topic, headline, captionConcept, creativeConcept, cta, hashtags[] }`,
    schema,
    task: 'planner.generateContentPlan',
    temperature: 0.7,
    usage: { workspaceId: ctx.workspaceId, userId: ctx.userId, brandId: input.brandId }
  });

  if (outcome.data && Array.isArray((outcome.data as any).items)) {
    const validated = validateOutput<{ items: unknown[] }>(schema, outcome.data);
    if (validated && Array.isArray(validated.items)) {
      rawItems = validated.items;
      engine = 'ai';
    }
  }

  let generated: { items: any[]; duplicatesAvoided: number };
  const seenTopics = new Set<string>();
  if (engine === 'ai' && rawItems) {
    generated = sanitizeItems(rawItems, { approvedHashtags, preferredCta, platforms: input.platforms, seenTopics });
    if (generated.items.length < 3) {
      // AI çıktısı yetersizse deterministik planla BİRLEŞTİR (dürüst motor etiketi korunur)
      const fallback = deterministicPlanItems(input, perWeek, { approvedHashtags, preferredCta, recentTopics });
      const mergedKeys = new Set(generated.items.map((i) => `${i.topic}|${i.headline}`.toLowerCase()));
      for (const item of fallback.items) {
        const key = `${item.topic}|${item.headline}`.toLowerCase();
        if (!mergedKeys.has(key)) {
          generated.items.push(item);
          mergedKeys.add(key);
        }
      }
    }
  } else {
    generated = deterministicPlanItems(input, perWeek, { approvedHashtags, preferredCta, recentTopics });
  }

  const engineLabel = engine === 'ai' ? 'AI sağlayıcısı ile üretildi' : 'Yerel motorla üretildi (harici AI yapılandırılmadı)';

  // ---- Kayıt (§82) ---------------------------------------------------------
  const title = `${brand.name} — ${input.goal ?? 'İçerik Planı'} (${input.dateFrom} → ${input.dateTo})`;
  const plan = await prisma.contentPlan.create({
    data: {
      workspaceId: ctx.workspaceId,
      brandId: input.brandId,
      campaignId: input.campaignId ?? null,
      title,
      dateFrom: parseDate(input.dateFrom),
      dateTo: parseDate(input.dateTo, true),
      goal: input.goal ?? null,
      frequency: input.frequency ?? null,
      platforms: JSON.stringify(input.platforms),
      status: 'DRAFT',
      createdBy: ctx.userId,
      items: {
        create: generated.items.map((item) => ({
          workspaceId: ctx.workspaceId,
          brandId: input.brandId,
          date: parseDate(item.date || input.dateFrom),
          platform: item.platform,
          contentType: item.contentType ?? 'POST',
          topic: item.topic,
          headline: item.headline,
          captionConcept: item.captionConcept ?? null,
          creativeConcept: item.creativeConcept ?? null,
          cta: item.cta ?? null,
          hashtags: JSON.stringify(item.hashtags ?? []),
          status: 'PLANNED'
        }))
      }
    },
    include: { items: { orderBy: { date: 'asc' } } }
  });

  await recordGeneration({
    workspaceId: ctx.workspaceId,
    brandId: input.brandId,
    userId: ctx.userId,
    type: 'GENERATE_CAPTION', // en yakın mevcut tür; ayrıntı metadata'da
    provider: engine === 'ai' ? outcome.result.provider : 'deterministic',
    model: outcome.result.model,
    prompt: promptUser,
    status: engine === 'ai' ? 'SUCCESS' : 'SKIPPED',
    durationMs: Date.now() - started,
    metadata: { planner: true, planId: plan.id, engine, itemCount: plan.items.length, estimatedTokens: estimateTokens(promptUser) }
  }).catch(() => undefined);
  await trackUsage({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    brandId: input.brandId,
    provider: engine === 'ai' ? outcome.result.provider : 'deterministic',
    service: 'textGeneration',
    task: 'planner.generateContentPlan',
    tokensIn: estimateTokens(promptUser),
    durationMs: Date.now() - started,
    costUSD: 0,
    meta: { planId: plan.id, engine }
  });

  return {
    planId: plan.id,
    title,
    brandId: input.brandId,
    campaignId: input.campaignId ?? null,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    platforms: input.platforms,
    engine,
    engineLabel,
    dataBasis,
    dataBasisNote,
    duplicatesAvoided: generated.duplicatesAvoided,
    items: plan.items.map((item) => ({
      id: item.id,
      date: item.date.toISOString().slice(0, 10),
      timeSuggestion: TIME_SUGGESTIONS[item.platform] ?? '12:00',
      platform: item.platform,
      contentType: item.contentType ?? 'POST',
      topic: item.topic ?? '',
      headline: item.headline ?? '',
      captionConcept: item.captionConcept ?? '',
      creativeConcept: item.creativeConcept ?? '',
      cta: item.cta ?? '',
      hashtags: JSON.parse(item.hashtags || '[]') as string[],
      status: item.status,
      contentId: item.contentId
    }))
  };
}

/** Plan listesi (çalışma alanına özgü, son planlar). */
export async function listPlans(workspaceId: string, take = 10) {
  const plans = await prisma.contentPlan.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { items: { orderBy: { date: 'asc' } } }
  });
  return plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    brandId: plan.brandId,
    campaignId: plan.campaignId,
    dateFrom: plan.dateFrom.toISOString().slice(0, 10),
    dateTo: plan.dateTo.toISOString().slice(0, 10),
    platforms: JSON.parse(plan.platforms || '[]'),
    status: plan.status,
    items: plan.items.map((item) => ({
      id: item.id,
      date: item.date.toISOString().slice(0, 10),
      timeSuggestion: TIME_SUGGESTIONS[item.platform] ?? '12:00',
      platform: item.platform,
      contentType: item.contentType ?? 'POST',
      topic: item.topic ?? '',
      headline: item.headline ?? '',
      captionConcept: item.captionConcept ?? '',
      creativeConcept: item.creativeConcept ?? '',
      cta: item.cta ?? '',
      hashtags: JSON.parse(item.hashtags || '[]') as string[],
      status: item.status,
      contentId: item.contentId
    }))
  }));
}

/**
 * "Takvime Ekle" (§83/§138): plan öğesinden TASLAK içerik oluşturur.
 * ASLA yayınlanmaz/zamanlanmaz; içerik DRAFT durumunda açılır ve öğe
 * CREATED olarak işaretlenir (izlenebilirlik).
 */
export async function applyPlanItem(opts: { workspaceId: string; userId: string; itemId: string }) {
  const item = await prisma.contentPlanItem.findFirst({
    where: { id: opts.itemId, workspaceId: opts.workspaceId },
    include: { plan: true }
  });
  if (!item) return null;
  if (item.contentId) return { contentId: item.contentId, alreadyApplied: true };

  const hashtags = (JSON.parse(item.hashtags || '[]') as string[]).join(' ').trim();
  const masterCaption = [item.captionConcept ?? item.headline ?? '', hashtags].filter(Boolean).join('\n\n');

  const { createContent } = await import('../services/contentService');
  const content = await createContent({
    workspaceId: opts.workspaceId,
    brandId: item.brandId,
    campaignId: item.plan.campaignId ?? null,
    title: item.headline ?? `${item.topic} — plan öğesi`,
    masterCaption,
    defaultCta: item.cta ?? undefined,
    userId: opts.userId
  });

  await prisma.contentPlanItem.update({
    where: { id: item.id },
    data: { status: 'CREATED', contentId: content.id }
  });

  return { contentId: content.id, alreadyApplied: false };
}
