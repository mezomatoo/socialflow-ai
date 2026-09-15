/**
 * PHASE 4 — AI Kampanya Oluşturucu (§86-§87)
 * ---------------------------------------------------------------------------
 * MEVCUT Phase 3 Campaign sistemini GENİŞLETİR; ikinci kampanya modeli kurulmaz.
 * AI; tema, ana mesaj, içerik sütunları, platform planı, mesaj fikirleri, CTA
 * stratejisi ve yayın yapısı önerir. Fiyat/indirim/tarih UYDURMAZ — kupon,
 * teklif veya ürün kataloğu modülü KULLANMAZ (§10/§12/§87; CampaignOffer/Product
 * sahte kataloğu kaldırılmıştır). Kullanıcı metin olarak girdiği gerçek bilgileri
 * önerilere aynen taşınır; kaynağı yoksa bilgi üretilmez (§78).
 */
import prisma from '../prisma';
import { ensureBrandKit } from '../brandkit/service';
import { completeJson } from '../ai/llmClient';
import { getTemplate, renderTemplate, validateOutput } from '../ai/promptTemplates';
import { trackUsage, estimateTokens } from '../ai/usage';
import { audit } from '../security/audit';

export interface CampaignRequest {
  brandId: string;
  goal: string;
  name?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  platforms: string[];
  /** Kullanıcının kendi girdiği GERÇEK kampanya bilgileri (fiyat, tarih, koşul). */
  userFacts?: string | null;
}

export interface CampaignConcept {
  theme: string;
  name: string;
  keyMessage: string;
  pillars: string[];
  platformStrategy: Record<string, string>;
  calendar: { date: string; platform: string; topic: string }[];
  creativeConcepts: string[];
  captionConcepts: string[];
  ctaStrategy: string[];
  hashtagStrategy: string[];
  engine: 'ai' | 'deterministic';
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'kampanya'
  );
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function platformStrategyFor(platforms: string[]): Record<string, string> {
  const map: Record<string, string> = {
    INSTAGRAM: 'Görsel odaklı; kısa ve samimi caption, hikaye serisiyle destek',
    FACEBOOK: 'Topluluk ve duyuru odaklı; bağlantı paylaşımına uygun',
    LINKEDIN: 'Profesyonel ve bilgilendirici; uzun form değer içeriği',
    X: 'Kısa ve vurucu; günlük akışa uygun mesajlar',
    TIKTOK: 'Samimi ve enerjik; kısa video ile dikkat çekme',
    YOUTUBE: 'Anlatı odaklı video; shorts ile desteklenen seriler',
    PINTEREST: 'Keşif odaklı dikey görseller; kalıcı panolar',
    THREADS: 'Rahat ton; kısa konuşma başlatan paylaşımlar'
  };
  const out: Record<string, string> = {};
  for (const p of platforms) out[p] = map[p] ?? 'Marka tonuna uygun içerik';
  return out;
}

/** Kullanıcı gerçeklerini aynen taşır; kaynak yoksa uydurma bilgi eklemez (§78). */
function factPreservingMessage(input: CampaignRequest, kitCtas: string[]): string {
  const base = `${input.goal} odaklı, marka tonunda tutarlı bir kampanya mesajı.`;
  return input.userFacts?.trim() ? `${base} Kampanya bilgileri: ${input.userFacts.trim()}` : `${base} Fiyat/koşul bilgisi yalnızca sizin girdiğiniz kadarıyla paylaşılır; AI kampanya koşulu UYDURMAZ.`;
}

export async function generateCampaignConcept(
  input: CampaignRequest,
  ctx: { workspaceId: string; userId: string }
): Promise<CampaignConcept> {
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: ctx.workspaceId } });
  if (!brand) throw new Error('Marka bulunamadı.');
  const kit = await ensureBrandKit({ workspaceId: ctx.workspaceId, brandId: input.brandId });
  const approvedHashtags = (kit?.hashtags ?? [])
    .filter((h: any) => h.category === 'APPROVED' && h.approvalStatus === 'APPROVED')
    .map((h: any) => String(h.tag).replace(/^#*/, '#'));
  const preferredCtas = (kit?.ctas ?? []).filter((c: any) => c.category === 'PREFERRED' && c.approvalStatus === 'APPROVED').map((c: any) => c.text);
  const tone = kit?.brand?.voice?.tone ?? null;
  const slogan = kit?.mainSlogan ?? null;

  const tpl = await getTemplate('campaignBuilder');
  const fallback = (): CampaignConcept => ({
    theme: `${input.goal} — marka kitine uygun tutarlı kampanya teması`,
    name: input.name?.trim() || `${brand.name} ${input.goal} Kampanyası`,
    keyMessage: factPreservingMessage(input, preferredCtas),
    pillars: ['Eğitici', 'Ürün', 'Topluluk'],
    platformStrategy: platformStrategyFor(input.platforms),
    calendar: input.platforms.slice(0, 4).map((p, i) => ({
      date: input.startDate,
      platform: p,
      topic: `${input.goal} açılış içeriği ${i + 1}`
    })),
    creativeConcepts: [
      'Marka paletiyle uyumlu sade kompozisyon; ürün/hizmet merkezi',
      'Müşteri hikâyesi / sosyal kanıt odaklı görsel seri'
    ],
    captionConcepts: [
      slogan ? `${slogan} — ${input.goal} başlıyor.` : `${input.goal} için hazırlığımızı duyuruyoruz.`,
      'Takipçilere somut fayda veren kısa ipucu paylaşımı.'
    ],
    ctaStrategy: preferredCtas.slice(0, 3).length ? preferredCtas.slice(0, 3) : ['Şimdi İncele'],
    hashtagStrategy: approvedHashtags.slice(0, 5),
    engine: 'deterministic'
  });

  const concept = await (async (): Promise<CampaignConcept | null> => {
    const promptUser = renderTemplate(
      tpl?.template ?? 'Marka: {{brand}}\nHedef: {{goal}}\nTarih aralığı: {{from}} - {{to}}\nPlatformlar: {{platforms}}',
      { brand: brand.name, goal: input.goal, from: input.startDate, to: input.endDate, platforms: input.platforms.join(', ') }
    );
    const outcome = await completeJson<Record<string, unknown>>({
      system:
        (tpl?.systemPrompt ?? 'Kampanya kurgusu üreten stratejistsin.') +
        ' Fiyat, indirim, kupon veya tarih UYDURMA. Kullanıcının verdiği gerçek bilgileri aynen koru. JSON şemasına uy. Çıktı Türkçe.',
      user: `${promptUser}\n\nKullanıcının gerçek kampanya bilgileri: ${input.userFacts ?? 'yok'}\nMarka tonu: ${tone ?? 'belirtilmedi'}\nOnaylı hashtagler: ${approvedHashtags.join(' ') || 'yok'}\nOnaylı CTA'lar: ${preferredCtas.join(', ') || 'yok'}`,
      schema: tpl?.outputSchema ?? {},
      task: 'campaign.generateConcept',
      temperature: 0.7,
      usage: { workspaceId: ctx.workspaceId, userId: ctx.userId, brandId: input.brandId }
    });
    if (!outcome.data) return null;
    const validated = validateOutput<{
      theme?: unknown;
      keyMessage?: unknown;
      pillars?: unknown;
      platformStrategy?: unknown;
      creativeConcepts?: unknown;
      captionConcepts?: unknown;
      ctaStrategy?: unknown;
      hashtagStrategy?: unknown;
    }>(tpl?.outputSchema ?? {}, outcome.data);
    if (!validated?.theme || !validated?.keyMessage) return null;
    const strArr = (v: unknown, max: number): string[] =>
      Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).slice(0, max) : [];
    return {
      theme: String(validated.theme).slice(0, 200),
      name: input.name?.trim() || `${brand.name} ${input.goal} Kampanyası`,
      keyMessage: String(validated.keyMessage).slice(0, 500),
      pillars: strArr(validated.pillars, 6),
      platformStrategy: platformStrategyFor(input.platforms),
      calendar: input.platforms.slice(0, 4).map((p, i) => ({ date: input.startDate, platform: p, topic: `${input.goal} açılış içeriği ${i + 1}` })),
      creativeConcepts: strArr(validated.creativeConcepts, 5),
      captionConcepts: strArr(validated.captionConcepts, 5),
      ctaStrategy: strArr(validated.ctaStrategy, 4).length ? strArr(validated.ctaStrategy, 4) : preferredCtas.slice(0, 3),
      hashtagStrategy: approvedHashtags.slice(0, 5),
      engine: 'ai'
    };
  })();

  const finalConcept = concept ?? fallback();
  await trackUsage({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    brandId: input.brandId,
    provider: finalConcept.engine === 'ai' ? 'openai/anthropic' : 'deterministic',
    service: 'textGeneration',
    task: 'campaign.generateConcept',
    tokensIn: estimateTokens(input.goal + (input.userFacts ?? '')),
    costUSD: 0,
    meta: { engine: finalConcept.engine }
  });
  return finalConcept;
}

/**
 * Konseptten GERÇEK Campaign kaydı oluşturur (mevcut sistem, §86).
 * Kupon/teklif/ürün modülü OLUŞTURMAZ (§87).
 */
export async function createCampaignFromConcept(
  input: CampaignRequest,
  concept: CampaignConcept,
  ctx: { workspaceId: string; userId: string }
) {
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: ctx.workspaceId } });
  if (!brand) throw new Error('Marka bulunamadı.');

  let code = slugify(concept.name);
  const exists = await prisma.campaign.findFirst({ where: { workspaceId: ctx.workspaceId, code } });
  if (exists) code = `${code}-${Date.now().toString(36).slice(-4)}`;

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: concept.name.slice(0, 120),
      code,
      startDate: parseDate(input.startDate),
      endDate: parseDate(input.endDate),
      notes: JSON.stringify({
        theme: concept.theme,
        keyMessage: concept.keyMessage,
        pillars: concept.pillars,
        platformStrategy: concept.platformStrategy,
        creativeConcepts: concept.creativeConcepts,
        captionConcepts: concept.captionConcepts,
        ctaStrategy: concept.ctaStrategy,
        hashtagStrategy: concept.hashtagStrategy,
        engine: concept.engine,
        userFacts: input.userFacts ?? null
      })
    }
  });

  await audit({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    action: 'ai.campaign.created',
    entityType: 'Campaign',
    entityId: campaign.id,
    metadata: { engine: concept.engine, platforms: input.platforms }
  });

  return campaign;
}
