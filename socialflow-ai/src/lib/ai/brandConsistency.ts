/**
 * PHASE 4 — BrandConsistencyService (§53-§55, §40-§41)
 * ---------------------------------------------
 * İçerik, marka kitine ne kadar uyuyor? Logo, renk, tipografi, ton, slogan,
 * CTA, hashtag, görsel stil ve yasal kurallar kontrol edilir.
 *
 * §40 GÜVENLİK AYRIMI:
 *   - DETERMİNİSTİK kurallar (yasaklı kelime/renk/hashtag, yasak CTA, zorunlu
 *     hukuki metin) kilit moduna göre engelleyebilir.
 *   - AI DANIŞSAL kuralları (ton algısı vb.) ASLA tek başına engellemez;
 *     yalnızca uyarı/öneri üretir.
 * §41 CİNLİYET: pass | warn (WARNING) | fail (BLOCKING adayı).
 */

export type CheckSeverity = 'pass' | 'warn' | 'fail';

export interface ConsistencyInput {
  brandKit: any;
  content: { caption?: string; cta?: string; hashtags?: string; colors?: string[]; logoUrl?: string; tone?: string };
  /** İçeriğin hedef platformu — platforma özel kural varsa devreye girer. */
  platform?: string | null;
}

export interface ConsistencyCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  severity: CheckSeverity;
  /** true: kesin kural (kilit moduna göre engelleyebilir); false: danışsal (asla engellemez). */
  deterministic: boolean;
}

export interface ConsistencyResult {
  score: number; // 0-100
  checks: ConsistencyCheck[];
  gate: 'ALLOW' | 'WARN' | 'REQUIRE_APPROVAL' | 'BLOCK';
  message: string;
  /** Kilit modu sonuçla birlikte döner; istemci yeniden sormadan politika görebilir. */
  lockMode: string;
  /** Kontrolün yapıldığı kit sürümü — üretim kayıtlarında izlenebilirlik (§56). */
  brandKitVersion: number;
}

export function checkBrandConsistency(input: ConsistencyInput): ConsistencyResult {
  const kit = input.brandKit;
  const lockMode: string = kit?.lockMode ?? 'OFF';
  const checks: ConsistencyCheck[] = [];

  // ---- DETERMİNİSTİK KURALLAR ---------------------------------------------

  // Renk kontrolü — yasaklı renk kullanıldı mı?
  const prohibited = (kit.colors ?? []).filter((c: any) => c.prohibited).map((c: any) => String(c.hex).toLowerCase());
  const usedProhibited = (input.content.colors ?? []).some((hex) => prohibited.includes(String(hex).toLowerCase()));
  checks.push({
    key: 'colors',
    label: 'Renk paleti',
    ok: !usedProhibited,
    detail: usedProhibited ? 'Yasaklı renk tespit edildi.' : `${(kit.colors ?? []).length} onaylı renk`,
    severity: usedProhibited ? 'fail' : 'pass',
    deterministic: true,
  });

  // Yasak CTA — kesin kural
  const forbiddenCtas = (kit.ctas ?? []).filter((c: any) => c.category === 'FORBIDDEN').map((c: any) => String(c.text).toLowerCase());
  const usedForbiddenCta = Boolean(input.content.cta) && forbiddenCtas.includes(String(input.content.cta).toLowerCase());
  // Tercih edilen CTA — danışsal uyarı
  const preferredCtas = (kit.ctas ?? []).filter((c: any) => c.category === 'PREFERRED').map((c: any) => c.text);
  const ctaOffList = Boolean(input.content.cta) && preferredCtas.length > 0 && !preferredCtas.includes(input.content.cta);
  checks.push({
    key: 'cta',
    label: 'CTA',
    ok: !usedForbiddenCta && !ctaOffList,
    detail: usedForbiddenCta
      ? 'Yasaklı CTA kullanıldı.'
      : ctaOffList
        ? `Tercih edilen listede değil: "${input.content.cta}"`
        : 'CTA uygun',
    severity: usedForbiddenCta ? 'fail' : ctaOffList ? 'warn' : 'pass',
    // Listede olmayan CTA uyarıdır; yalnız açıkça yasaklı olan kesin kuraldır.
    deterministic: usedForbiddenCta,
  });

  // Hashtag — yasaklı var mı? (kesin kural)
  const bannedTags = (kit.hashtags ?? []).filter((h: any) => h.category === 'BANNED').map((h: any) => String(h.tag).toLowerCase());
  const usedBanned = bannedTags.some((t: string) => (input.content.hashtags ?? '').toLowerCase().includes(t));
  checks.push({
    key: 'hashtags',
    label: 'Hashtag',
    ok: !usedBanned,
    detail: usedBanned ? 'Yasaklı hashtag kullanıldı.' : 'Hashtag uygun',
    severity: usedBanned ? 'fail' : 'pass',
    deterministic: true,
  });

  // Yasaklı kelime — BrandVoice bannedTerms (kesin kural)
  const bannedTerms = String(kit.brand?.voice?.bannedTerms ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const hitBannedTerm = bannedTerms.find((w: string) => (input.content.caption ?? '').toLowerCase().includes(w.toLowerCase()));
  checks.push({
    key: 'bannedWords',
    label: 'Yasaklı kelime',
    ok: !hitBannedTerm,
    detail: hitBannedTerm ? `Yasaklı kelime tespit edildi: "${hitBannedTerm}"` : 'Yasaklı kelime yok',
    severity: hitBannedTerm ? 'fail' : 'pass',
    deterministic: true,
  });

  // Hukuki kurallar (§46): zorunlu metin yokluğu kesin kualdır; yasak terminoloji kesin kuraldır.
  const legalRules = kit.legalRules ?? [];
  const activeLegal = legalRules.filter(
    (r: any) => r.approvalStatus === 'APPROVED' && (!r.platform || !input.platform || r.platform === input.platform)
  );
  for (const rule of activeLegal) {
    const requiredText = String(rule.requiredText ?? '').trim();
    if (requiredText && rule.category !== 'FORBIDDEN_TERM') {
      const missing = !(input.content.caption ?? '').includes(requiredText);
      checks.push({
        key: `legal:${rule.id}`,
        label: `Zorunlu hukuki metin`,
        ok: !missing,
        detail: missing ? `Şu metin bulunamadı: "${requiredText.slice(0, 60)}"` : 'Zorunlu metin mevcut',
        severity: missing ? 'fail' : 'pass',
        deterministic: true,
      });
    }
    const forbiddenTerms = String(rule.forbiddenTerms ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const hit = forbiddenTerms.find((w: string) => (input.content.caption ?? '').toLowerCase().includes(w.toLowerCase()));
    if (hit) {
      checks.push({
        key: `legal-term:${rule.id}`,
        label: 'Yasak terminoloji',
        ok: false,
        detail: `Yasaklı terim: "${hit}"`,
        severity: 'fail',
        deterministic: true,
      });
    }
  }

  // ---- AI DANIŞSAL KURALLAR (asla engellemez — §40) ------------------------

  // Logo — var mı? (danışsal: içerikte logo kullanımı zorunlu değildir)
  const hasLogo = (kit.logos ?? []).length > 0;
  checks.push({
    key: 'logo',
    label: 'Logo',
    ok: hasLogo,
    detail: hasLogo ? 'Logo tanımlı' : 'Logo eksik',
    severity: hasLogo ? 'pass' : 'warn',
    deterministic: false,
  });

  // Ton — kaba bilgi; AI görüşü yalnızca öneridir
  checks.push({
    key: 'tone',
    label: 'Marka tonu',
    ok: true,
    detail: kit.brand?.voice?.tone ?? 'Varsayılan ton',
    severity: 'pass',
    deterministic: false,
  });

  // ---- SKOR VE KAPI --------------------------------------------------------

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  const blockingFail = checks.some((c) => c.severity === 'fail' && c.deterministic);
  const advisoryFail = checks.some((c) => c.severity === 'fail' && !c.deterministic);
  const anyWarn = checks.some((c) => c.severity === 'warn');

  const gateSetting: string = kit.consistencyGate ?? 'WARNING';
  let gate: ConsistencyResult['gate'] = 'ALLOW';
  if (blockingFail) {
    // Kesin kural ihlali: kilit/capı politika belirler
    if (lockMode === 'STRICT' || gateSetting === 'BLOCK') gate = 'BLOCK';
    else if (lockMode === 'STANDARD' || gateSetting === 'REQUIRE_APPROVAL') gate = 'REQUIRE_APPROVAL';
    else gate = 'WARN';
  } else if (gateSetting === 'BLOCK' && advisoryFail) {
    // Kapı BLOCK'a çekilse bile yalnız AI görüşüyle engellenmez (§40): onay gerekir.
    gate = 'REQUIRE_APPROVAL';
  } else if (gateSetting === 'REQUIRE_APPROVAL' && (advisoryFail || anyWarn)) {
    gate = 'REQUIRE_APPROVAL';
  } else if (advisoryFail || anyWarn || gateSetting === 'WARNING') {
    gate = advisoryFail || anyWarn ? 'WARN' : 'ALLOW';
  }

  const message =
    gate === 'BLOCK'
      ? 'Marka uyumu kritik ihlal nedeniyle yayın engellendi.'
      : gate === 'REQUIRE_APPROVAL'
        ? 'Marka uyumu onay gerektiriyor.'
        : gate === 'WARN'
          ? 'Marka uyumunda uyarılar var, gözden geçirmeniz önerilir.'
          : 'Marka uyumu iyi.';

  return {
    score,
    checks,
    gate,
    message,
    lockMode,
    brandKitVersion: kit?.currentVersion ?? 1,
  };
}

export function consistencyBadge(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}
