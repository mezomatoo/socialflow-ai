import { charLength, extractHashtagTokens, extractMentions, extractProtectedTerms, extractUrls, splitSentences, truncateWords } from '../text';
import type { ContentType, PlatformCode } from '../platforms/platforms';
import { PLATFORM_META } from '../platforms/platforms';
import type { PlatformRuleView } from '../rules/ruleEngine';
import { AI_SAFETY_RULES, completeJson } from './llmClient';
import { applyStyleLocally, buildBrandVoicePrompt, type BrandVoiceInput } from './brandVoice';
import { compressTurkish, verifyProtectedTerms, type Modification } from './semanticRewriter';
import { generateHashtags, appendHashtags, type HashtagSuggestion } from './hashtagService';

/**
 * CaptionAdaptationService — "Platform Uyarlama Motoru"
 * ---------------------------------------------------------------------------
 * Tek bir ana açıklamadan, her platform + içerik türü için BAĞIMSIZ ve
 * optimize edilmiş bir metin üretir.
 *
 * Asla karakter sınırından kesmez: önce LLM ile anlamsal yeniden yazım,
 * LLM erişimi yoksa yerel kademeli anlamsal kısaltma motoru kullanılır.
 * Fiyat, tarih, ürün adı, bağlantı, zorunlu hashtag ve zorunlu mention
 * HER ZAMAN korunur.
 */

export interface AdaptationInput {
  masterCaption: string;
  platform: PlatformCode | string;
  contentType: ContentType | string;
  maximumLength: number;
  preferredLength?: number;
  brandVoice?: BrandVoiceInput | null;
  style?: string;
  requiredTerms?: string[];
  requiredHashtags?: string[];
  requiredMentions?: string[];
  prohibitedTerms?: string[];
  language?: string;
  /** Kural motoru kaydı (medya/etiket kısıtları için). */
  rule?: PlatformRuleView | null;
  brandName?: string | null;
  campaignName?: string | null;
  location?: string | null;
  linkUrl?: string | null;
  defaultCta?: string | null;
  hashtagPlacement?: 'INLINE' | 'FIRST_COMMENT' | 'SEPARATE';
  storyText?: string | null;
}

export interface AdaptationOutput {
  caption: string;
  title?: string | null;
  hashtags: string[];
  hashtagBlock: string;
  firstComment: string | null;
  callToAction: string | null;
  shortened: boolean;
  truncated: boolean;
  modifications: Modification[];
  warnings: string[];
  charactersUsed: number;
  limit: number;
  preferredLimit: number;
  mentions: string[];
  urls: string[];
  storyText: string | null;
  engine: 'LLM' | 'LOCAL';
  missingTerms: string[];
  suggestions: HashtagSuggestion[];
}

/**
 * Ana giriş noktası.
 */
export async function adaptCaption(input: AdaptationInput): Promise<AdaptationOutput> {
  const rule = input.rule;
  const limit = input.maximumLength || rule?.maxCaptionLength || 2200;
  const preferred = input.preferredLength ?? rule?.recommendedCaptionLength ?? Math.min(limit, 500);
  const platformMeta = PLATFORM_META[input.platform as PlatformCode];
  const warnings: string[] = [];
  const modifications: Modification[] = [];

  // --- Korunacak varlıklar --------------------------------------------------
  const master = input.masterCaption ?? '';
  const protectedTerms = Array.from(
    new Set(
      [
        ...(input.requiredTerms ?? []),
        ...(input.brandVoice?.mustKeepTerms ?? []),
        ...(input.brandName ? [input.brandName] : []),
        ...extractProtectedTerms(master)
      ]
        .map((t) => (t ?? '').trim())
        .filter(Boolean)
    )
  );
  const requiredMentions = Array.from(
    new Set([...(input.requiredMentions ?? []), ...extractMentions(master), ...(input.brandVoice?.allowedTerms ?? []).filter((t) => t.startsWith('@'))])
  );
  const urls = extractUrls(master);
  const explicitLink = input.linkUrl?.trim() || urls[0] || '';

  // --- Hashtag bütçesi ------------------------------------------------------
  const maxHashtags = rule?.maxHashtags ?? 0;
  const placement = input.hashtagPlacement ?? 'INLINE';
  const hashtagsInline = placement === 'INLINE' && maxHashtags > 0;

  const hashtagResult = await generateHashtags({
    text: master,
    brandName: input.brandName,
    requiredHashtags: input.requiredHashtags,
    bannedHashtags: input.prohibitedTerms?.filter((t) => t.startsWith('#')).map((t) => t.replace('#', '')),
    campaignName: input.campaignName,
    maxHashtags,
    recommendedHashtags: rule?.recommendedHashtags ?? Math.min(maxHashtags, 4),
    contentType: String(input.contentType)
  });

  if (hashtagResult.removedBlocked.length) {
    warnings.push(
      `Güvensiz veya yasaklı ${hashtagResult.removedBlocked.length} etiket elendi: ${hashtagResult.removedBlocked.slice(0, 5).join(', ')}`
    );
  }
  if (maxHashtags === 0 && extractHashtagTokens(master).length > 0) {
    warnings.push(`${platformMeta?.name ?? input.platform} bu içerik türünde hashtag önermiyor; metindeki etiketler kaldırıldı.`);
  }

  const hashtagBlock = hashtagsInline ? hashtagResult.block : '';
  const hashtagBudget = hashtagBlock ? charLength(hashtagBlock) + 2 : 0;
  const bodyLimit = Math.max(40, limit - hashtagBudget);

  // --- CTA ------------------------------------------------------------------
  const cta = buildCta(input, platformMeta?.name ?? String(input.platform), warnings);
  const ctaBudget = cta && placement !== 'SEPARATE' ? charLength(cta) + 2 : 0;
  const textLimit = Math.max(30, bodyLimit - ctaBudget);

  // --- Metin uyarlaması -----------------------------------------------------
  let body = master.trim();
  let engine: 'LLM' | 'LOCAL' = 'LOCAL';
  let shortened = false;
  let truncated = false;

  // Metindeki hashtagleri gövdeden ayır (ayrı yönetiliyor)
  body = body.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/\s{2,}/g, ' ').trim();

  const needsWork =
    charLength(body) > textLimit ||
    Boolean(input.style) ||
    (input.brandVoice?.bannedTerms?.length ?? 0) > 0;

  if (needsWork) {
    const llmResult = await tryLlmAdaptation(input, {
      textLimit,
      protectedTerms,
      requiredMentions,
      style: input.style ?? 'PROFESSIONAL',
      cta
    });

    if (llmResult) {
      engine = 'LLM';
      body = llmResult.caption;
      shortened = llmResult.shortened;
      if (llmResult.warnings?.length) warnings.push(...llmResult.warnings);
      if (llmResult.modifications?.length) {
        modifications.push(
          ...llmResult.modifications.map((m) => ({
            stage: 'llm',
            from: typeof m === 'string' ? m : String((m as any).from ?? ''),
            to: typeof m === 'string' ? '' : String((m as any).to ?? ''),
            reason: typeof m === 'string' ? 'LLM düzenlemesi' : String((m as any).reason ?? 'LLM düzenlemesi')
          }))
        );
      }
    } else {
      // Yerel motor
      const style = (input.style ?? 'PROFESSIONAL') as any;
      body = applyStyleLocally(body, style, input.brandVoice);

      if (charLength(body) > textLimit) {
        const compressed = compressTurkish(body, textLimit, {
          protectedTerms,
          brandNames: input.brandName ? [input.brandName] : [],
          stripHashtags: true
        });
        body = compressed.text;
        shortened = compressed.shortened;
        truncated = compressed.truncated;
        modifications.push(...compressed.modifications);
        warnings.push(...compressed.warnings);
      }
      if (compressedExtra(body, textLimit)) {
        body = compressedExtra(body, textLimit)!;
        truncated = true;
        warnings.push('Metin sınıra sığmadığı için sözcük sınırından kısaltıldı.');
      }
    }
  }

  // Bağlantı: tıklanabilir değilse metne ham URL koymak yerine yönlendirme kullan
  if (explicitLink && rule && !rule.clickableLinks && !body.includes(explicitLink)) {
    // URL eklemiyoruz; CTA zaten "profildeki bağlantı" diyor.
    warnings.push(
      `${platformMeta?.name ?? input.platform} açıklamasındaki bağlantılar tıklanabilir değil. Bağlantı CTA metnine yönlendirme olarak eklendi.`
    );
  } else if (explicitLink && rule?.clickableLinks) {
    if (!body.includes(explicitLink)) {
      const withLink = `${body} ${explicitLink}`.trim();
      if (charLength(withLink) + hashtagBudget <= limit) body = withLink;
      else warnings.push('Bağlantı karakter sınırına takıldı; açıklamaya eklenmedi.');
    }
  }

  // Zorunlu mentionlar korunuyor mu?
  for (const m of requiredMentions) {
    if (m && !body.includes(m)) {
      const withMention = `${body} ${m}`.trim();
      if (charLength(withMention) + hashtagBudget <= limit) body = withMention;
      else warnings.push(`Zorunlu mention "${m}" karakter sınırına takıldığı için eklenemedi.`);
    }
  }

  // Yasaklı terimler
  for (const banned of input.prohibitedTerms ?? []) {
    const t = banned.trim().replace(/^#/, '');
    if (!t || t.startsWith('@')) continue;
    if (body.toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'))) {
      body = body.replace(new RegExp(escapeRegExp(t), 'gi'), '');
      warnings.push(`Yasaklı ifade metinden çıkarıldı: "${t}".`);
    }
  }

  // --- Birleştirme ----------------------------------------------------------
  let caption = body.trim();
  if (cta && placement !== 'SEPARATE' && !caption.includes(cta)) {
    const trial = `${caption}\n\n${cta}`;
    if (charLength(trial) + hashtagBudget <= limit) caption = trial;
    else {
      const short = cta.split(/[.\s]/).slice(0, 3).join(' ');
      const trial2 = `${caption}\n\n${short}`;
      if (charLength(trial2) + hashtagBudget <= limit) caption = trial2;
    }
  }

  let firstComment: string | null = null;
  if (hashtagsInline) {
    const appended = appendHashtags(caption, hashtagBlock, limit);
    if (appended.added) caption = appended.caption;
    else warnings.push('Hashtagler karakter sınırına sığmadı; "İlk yorum" veya "Ayrı tut" seçeneğini kullanabilirsiniz.');
  } else if (placement === 'FIRST_COMMENT') {
    if (rule?.supportsFirstComment) firstComment = hashtagBlock || null;
    else warnings.push(`${platformMeta?.name ?? input.platform} ilk yorum özelliğini desteklemiyor; hashtagler ayrı tutuldu.`);
  }

  // Son güvenlik ağı: asla sınırı aşma
  if (charLength(caption) > limit) {
    caption = truncateWords(caption, limit);
    truncated = true;
    warnings.push('Son kontrolde metin sınır dışı kaldı ve güvenli biçimde kısaltıldı.');
  }

  const missingTerms = verifyProtectedTerms(caption, protectedTerms.filter((t) => !t.startsWith('http')));

  // --- Başlık (YouTube/Pinterest vb.) ---------------------------------------
  const title = buildTitle(input, caption, master);

  // --- Hikaye metni ---------------------------------------------------------
  const storyText = input.storyText ? await adaptStoryText(input.storyText || master, input, rule) : null;

  return {
    caption,
    title,
    hashtags: hashtagResult.selected.map((h) => h.tag),
    hashtagBlock,
    firstComment,
    callToAction: cta,
    shortened,
    truncated,
    modifications,
    warnings: dedupe(warnings),
    charactersUsed: charLength(caption),
    limit,
    preferredLimit: preferred,
    mentions: extractMentions(caption),
    urls: extractUrls(caption),
    storyText,
    engine,
    missingTerms,
    suggestions: hashtagResult.selected
  };
}

function compressedExtra(text: string, limit: number): string | null {
  if (charLength(text) <= limit) return null;
  return truncateWords(text, limit);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCta(input: AdaptationInput, platformName: string, warnings: string[]): string | null {
  const rule = input.rule;
  const custom = input.defaultCta?.trim();
  const hasLink = Boolean(input.linkUrl?.trim() || extractUrls(input.masterCaption)[0]);

  if (!hasLink) {
    return custom && charLength(custom) < 60 ? custom : null;
  }

  if (rule && !rule.clickableLinks) {
    const hint = ['INSTAGRAM', 'TIKTOK', 'THREADS'].includes(String(input.platform))
      ? 'Detaylar profildeki bağlantıda.'
      : 'Detaylar için profilimizi ziyaret edin.';
    return custom ? `${custom} ${hint}` : hint;
  }

  return custom || `${platformName} üzerinden detaylara ulaşabilirsiniz.`;
}

function buildTitle(input: AdaptationInput, caption: string, master: string): string | null {
  const needsTitle = ['YOUTUBE', 'PINTEREST'].includes(String(input.platform));
  if (!needsTitle) return null;
  const source = caption || master;
  const first = splitSentences(source.replace(/#[\p{L}\p{N}_]+/gu, ' '))[0] ?? '';
  const clean = first.replace(/^[\s#>-]+/, '').trim();
  const max = String(input.platform) === 'YOUTUBE' ? (input.contentType === 'SHORTS' ? 100 : 100) : 100;
  return truncateWords(clean || (input.brandName ?? 'Yeni içerik'), max);
}

/**
 * Hikaye metni: ana açıklamadan bağımsız, kısa ve vurucu.
 */
export async function adaptStoryText(
  storyText: string,
  input: AdaptationInput,
  rule?: PlatformRuleView | null
): Promise<string> {
  const limit = Math.min(90, rule?.recommendedCaptionLength ?? 90);
  let text = (storyText ?? '').trim();
  if (!text) text = splitSentences(input.masterCaption)[0] ?? '';
  text = text.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (charLength(text) <= limit) return text;
  const compressed = compressTurkish(text, limit, { protectedTerms: input.requiredTerms });
  return compressed.text;
}

export const STORY_TEXT_IDEAS = [
  'Yeni ürün!',
  'Şimdi keşfet',
  'Detaylar için tıkla',
  'Son gün',
  'Bugüne özel',
  'Stoklar tükeniyor',
  'Yukarı kaydır',
  'Kaçırma',
  'Sınırlı süre',
  'Hemen incele'
];

// ---------------------------------------------------------------------------
// LLM yolu
// ---------------------------------------------------------------------------

interface LlmAdaptContext {
  textLimit: number;
  protectedTerms: string[];
  requiredMentions: string[];
  style: string;
  cta: string | null;
}

interface LlmAdaptResponse {
  caption: string;
  shortened: boolean;
  modifications?: (string | { from?: string; to?: string; reason?: string })[];
  warnings?: string[];
  missingInformation?: string[];
}

const SCHEMA = {
  type: 'object',
  required: ['caption', 'shortened'],
  properties: {
    caption: { type: 'string' },
    shortened: { type: 'boolean' },
    modifications: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } }
  }
};

async function tryLlmAdaptation(input: AdaptationInput, ctx: LlmAdaptContext): Promise<LlmAdaptResponse | null> {
  const rule = input.rule;
  const platformName = PLATFORM_META[input.platform as PlatformCode]?.name ?? String(input.platform);
  const contentTypeLabel = rule?.label ?? `${platformName} ${input.contentType}`;

  const system = [
    'Sen deneyimli bir Türkçe sosyal medya metin yazarısın. Görevin, ana açıklamayı hedef platforma uyarlamak.',
    AI_SAFETY_RULES,
    buildBrandVoicePrompt(input.brandVoice, (input.style ?? 'PROFESSIONAL') as any)
  ].join('\n\n');

  const user = JSON.stringify(
    {
      gorev: 'Ana açıklamayı hedef platform için yeniden yaz',
      masterCaption: input.masterCaption,
      platform: platformName,
      contentType: String(input.contentType),
      hedef: contentTypeLabel,
      maximumLength: ctx.textLimit,
      preferredLength: Math.min(ctx.textLimit, rule?.recommendedCaptionLength ?? ctx.textLimit),
      korunmasiZorunluTerimler: ctx.protectedTerms,
      korunmasiZorunluMentionlar: ctx.requiredMentions,
      yasakliTerimler: input.prohibitedTerms ?? [],
      markaAdi: input.brandName ?? null,
      kampanya: input.campaignName ?? null,
      baglanti: input.linkUrl ?? null,
      cta: ctx.cta,
      dil: 'tr',
      ciktiSemasi: SCHEMA
    },
    null,
    2
  );

  const { data, result } = await completeJson<LlmAdaptResponse>({
    task: 'caption.adapt',
    system,
    user,
    schema: SCHEMA,
    temperature: 0.6,
    maxTokens: 900
  });

  if (result.degraded || !data?.caption) return null;

  const caption = String(data.caption).trim();
  if (!caption) return null;
  if (charLength(caption) > ctx.textLimit) return null; // yerel motora düş

  return {
    caption,
    shortened: Boolean(data.shortened),
    modifications: data.modifications ?? [],
    warnings: [
      ...(data.warnings ?? []),
      ...(data.missingInformation ?? []).map((m) => `Bilgi eksik, uydurulmadı: ${m}`)
    ]
  };
}
