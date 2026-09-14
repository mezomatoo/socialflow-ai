import prisma from '../prisma';
import { getAllRules, type PlatformRuleView } from '../rules/ruleEngine';
import { validateMediaForRule, checkSafeArea } from '../media/validate';
import { charLength } from '../text';
import { PLATFORM_META, type ContentType, type PlatformCode } from '../platforms/platforms';
import type { MediaIssue } from '../media/types';

/**
 * ValidationService — "Yayın Kontrolü"
 * ---------------------------------------------------------------------------
 * Yayınlamadan önce her hedef kural motoruna karşı doğrulanır ve kullanıcıya
 * Türkçe, anlaşılır bir kontrol listesi gösterilir:
 *
 *   Instagram Gönderisi   ✓ Görsel ölçüsü uygun
 *   X                     ⚠ Metin sınırına göre AI tarafından kısaltıldı
 *   Sonuç: 4 / 4 platform yayına hazır
 */

export interface CheckLine {
  code: string;
  level: 'OK' | 'WARNING' | 'ERROR';
  message: string;
}

export interface TargetCheck {
  platformContentId: string;
  platform: PlatformCode;
  contentType: ContentType;
  label: string;
  platformName: string;
  ready: boolean;
  checks: CheckLine[];
  issues: MediaIssue[];
  accountLabel: string | null;
  accountStatus: string | null;
  demoAccount: boolean;
  charUsed: number;
  charLimit: number;
}

export interface PreflightReport {
  contentId: string;
  targets: TargetCheck[];
  readyCount: number;
  totalCount: number;
  headline: string;
  blocking: boolean;
  demoMode: boolean;
}

export async function runPreflight(
  contentId: string,
  workspaceId: string,
  options: { demoMode?: boolean } = {}
): Promise<PreflightReport> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      media: { include: { media: true } },
      platformContents: {
        where: { enabled: true },
        include: { socialAccount: true, mediaAsset: true }
      },
      brand: true
    }
  });
  if (!content) throw new Error('İçerik bulunamadı.');

  const rules = await getAllRules(workspaceId);
  const primaryMedia = content.media[0]?.media ?? null;
  const targets: TargetCheck[] = [];

  for (const pc of content.platformContents) {
    const rule = rules.find((r) => r.platform === pc.platform && r.contentType === pc.contentType) ?? null;
    const platformName = PLATFORM_META[pc.platform as PlatformCode]?.name ?? pc.platform;
    const checks: CheckLine[] = [];
    const issues: MediaIssue[] = [];

    if (!rule) {
      checks.push({
        code: 'RULE_MISSING',
        level: 'ERROR',
        message: `${platformName} için platform kuralı bulunamadı. Yönetici ayarlarından kuralları yükleyin.`
      });
    } else {
      // Hesap bağlantısı
      if (!pc.socialAccount) {
        checks.push({ code: 'ACCOUNT_MISSING', level: 'ERROR', message: 'Bu hedef için sosyal medya hesabı seçilmedi.' });
      } else if (pc.socialAccount.connectionStatus !== 'ACTIVE') {
        checks.push({
          code: 'ACCOUNT_INACTIVE',
          level: 'ERROR',
          message:
            pc.socialAccount.connectionStatus === 'NEEDS_REAUTH' || pc.socialAccount.connectionStatus === 'EXPIRED'
              ? `${pc.socialAccount.displayName} hesabının bağlantısının yenilenmesi gerekiyor.`
              : `${pc.socialAccount.displayName} hesabı aktif değil.`
        });
      } else {
        checks.push({ code: 'ACCOUNT_OK', level: 'OK', message: 'Hesap bağlantısı aktif' });
      }

      // Medya
      const media = pc.mediaAsset ?? primaryMedia;
      const requiresMedia = ['REEL', 'SHORTS', 'VIDEO', 'STORY', 'PIN'].includes(pc.contentType);
      if (!media && requiresMedia) {
        checks.push({ code: 'MEDIA_MISSING', level: 'ERROR', message: `${rule.label} için medya yüklenmesi gerekiyor.` });
      } else if (!media) {
        checks.push({ code: 'MEDIA_OPTIONAL', level: 'OK', message: 'Metin gönderisi — medya gerekmiyor' });
      } else {
        const ratioOk =
          media.width && media.height
            ? rule.supportedAspectRatios.some((r) => {
                const [a, b] = r.split(':').map(Number);
                return a && b ? Math.abs(a / b - media.width! / media.height!) / (a / b) < 0.05 : false;
              })
            : true;
        const mediaIssues = validateMediaForRule(
          {
            kind: media.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            mimeType: media.mimeType,
            format: media.format,
            bytes: media.bytes,
            width: media.width,
            height: media.height,
            durationMs: media.durationMs
          },
          rule
        );
        issues.push(...mediaIssues);
        const blocking = mediaIssues.filter((i) => i.level === 'ERROR');
        const warnings = mediaIssues.filter((i) => i.level !== 'ERROR');

        if (blocking.length) {
          for (const b of blocking) checks.push({ code: b.code, level: 'ERROR', message: b.message });
        } else {
          checks.push({ code: 'MEDIA_SIZE', level: 'OK', message: 'Dosya boyutu uygun' });
          checks.push({
            code: 'MEDIA_RATIO',
            level: ratioOk ? 'OK' : 'WARNING',
            message: ratioOk
              ? `Görsel ölçüsü uygun (${rule.recommendedAspectRatio})`
              : `Kaynak oranı ${rule.recommendedAspectRatio} değil — akıllı kırpma uygulanacak`
          });
        }
        for (const w of warnings) checks.push({ code: w.code, level: w.level === 'WARNING' ? 'WARNING' : 'OK', message: w.message });

        // Varyant üretildi mi?
        if (pc.renderedKey) {
          checks.push({ code: 'VARIANT_OK', level: 'OK', message: `${rule.recommendedAspectRatio} varyantı oluşturuldu` });
        } else if (requiresMedia || !ratioOk) {
          checks.push({
            code: 'VARIANT_MISSING',
            level: 'WARNING',
            message: 'Platforma özel medya varyantı henüz oluşturulmadı. "AI ile Platformlara Uyarla" adımını çalıştırın.'
          });
        }

        // Güvenli alan
        if (rule.safeArea) {
          const analysis = safeParse(media.analysis);
          const regions = [
            ...(analysis?.faces ?? []).map((f: any) => ({ ...f, label: 'Yüz' })),
            ...(analysis?.textRegions ?? []).map((t: any) => ({ ...t, label: 'Metin' })),
            ...(analysis?.logoRegion ? [{ ...analysis.logoRegion, label: 'Logo' }] : [])
          ];
          const safeIssues = checkSafeArea(rule, regions);
          issues.push(...safeIssues);
          checks.push(
            safeIssues.length
              ? { code: 'SAFE_AREA', level: 'WARNING', message: safeIssues[0].message }
              : { code: 'SAFE_AREA_OK', level: 'OK', message: 'Güvenli alan uygun' }
          );
        }
      }

      // Açıklama
      const used = charLength(pc.caption ?? '');
      if (!pc.caption || used === 0) {
        checks.push({ code: 'CAPTION_EMPTY', level: 'WARNING', message: 'Bu hedef için açıklama boş.' });
      } else if (used > rule.maxCaptionLength) {
        checks.push({
          code: 'CAPTION_TOO_LONG',
          level: 'ERROR',
          message: `Açıklama ${used} karakter; sınır ${rule.maxCaptionLength} karakter.`
        });
      } else if (
        pc.captionSource === 'AI' &&
        charLength(content.masterCaption ?? '') > rule.maxCaptionLength
      ) {
        checks.push({
          code: 'CAPTION_AI',
          level: 'WARNING',
          message: `Master metin ${rule.maxCaptionLength} karakter sınırını aştığı için AI bu hedefte anlamı koruyarak kısalttı (${used}/${rule.maxCaptionLength}). Gözden geçirin.`
        });
      } else {
        checks.push({ code: 'CAPTION_OK', level: 'OK', message: `Açıklama uygun (${used}/${rule.maxCaptionLength})` });
      }

      // Bağlantı
      if (content.linkUrl && !rule.clickableLinks) {
        checks.push({
          code: 'LINK_NOT_CLICKABLE',
          level: 'OK',
          message: 'Bağlantı tıklanabilir değil; CTA yönlendirmesi eklendi.'
        });
      }

      // Hashtag
      const tags = String(pc.hashtags ?? '').split(/\s+/).filter(Boolean);
      if (rule.maxHashtags === 0 && tags.length > 0) {
        checks.push({ code: 'HASHTAG_UNSUPPORTED', level: 'WARNING', message: 'Bu platform hashtag önermiyor.' });
      } else if (rule.maxHashtags && tags.length > rule.maxHashtags) {
        checks.push({ code: 'HASHTAG_LIMIT', level: 'ERROR', message: `${tags.length} hashtag; sınır ${rule.maxHashtags}.` });
      }
    }

    const ready = !checks.some((c) => c.level === 'ERROR');
    targets.push({
      platformContentId: pc.id,
      platform: pc.platform as PlatformCode,
      contentType: pc.contentType as ContentType,
      label: rule?.label ?? `${platformName}`,
      platformName,
      ready,
      checks,
      issues,
      accountLabel: pc.socialAccount ? `${pc.socialAccount.displayName} ${pc.socialAccount.handle}` : null,
      accountStatus: pc.socialAccount?.connectionStatus ?? null,
      demoAccount: pc.socialAccount?.demoAccount ?? true,
      charUsed: charLength(pc.caption ?? ''),
      charLimit: rule?.maxCaptionLength ?? pc.charLimit
    });
  }

  const readyCount = targets.filter((t) => t.ready).length;
  const totalCount = targets.length;
  const headline =
    totalCount === 0
      ? 'Yayınlanacak hedef seçilmedi.'
      : readyCount === totalCount
        ? `${readyCount} / ${totalCount} platform yayına hazır`
        : `${readyCount} / ${totalCount} platform yayına hazır — ${totalCount - readyCount} hedefte sorun var`;

  return {
    contentId,
    targets,
    readyCount,
    totalCount,
    headline,
    blocking: readyCount === 0 || targets.some((t) => t.checks.some((c) => c.level === 'ERROR')),
    demoMode: options.demoMode ?? true
  };
}

function safeParse(raw: string | null | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export type { PlatformRuleView };
