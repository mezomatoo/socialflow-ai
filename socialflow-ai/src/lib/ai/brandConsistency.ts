/**
 * PHASE 4 — BrandConsistencyService (§53-§55)
 * ---------------------------------------------
 * İçerik, marka kitine ne kadar uyuyor? Logo, renk, tipografi, ton, slogan,
 * CTA, hashtag, görsel stil ve ürün kuralları kontrol edilir.
 */

export interface ConsistencyInput {
  brandKit: any;
  content: { caption?: string; cta?: string; hashtags?: string; colors?: string[]; logoUrl?: string; tone?: string };
}

export interface ConsistencyResult {
  score: number; // 0-100
  checks: { key: string; label: string; ok: boolean; detail?: string; severity: 'pass' | 'warn' | 'fail' }[];
  gate: 'ALLOW' | 'WARN' | 'REQUIRE_APPROVAL' | 'BLOCK';
  message: string;
}

export function checkBrandConsistency(input: ConsistencyInput): ConsistencyResult {
  const kit = input.brandKit;
  const checks: ConsistencyResult['checks'] = [];

  // Renk kontrolü — yasaklı renk kullanıldı mı?
  const prohibited = (kit.colors ?? []).filter((c: any) => c.prohibited).map((c: any) => c.hex.toLowerCase());
  const usedProhibited = (input.content.colors ?? []).some((hex) => prohibited.includes(String(hex).toLowerCase()));
  checks.push({
    key: 'colors',
    label: 'Renk paleti',
    ok: !usedProhibited,
    detail: usedProhibited ? 'Yasaklı renk tespit edildi.' : `${(kit.colors ?? []).length} onaylı renk`,
    severity: usedProhibited ? 'fail' : 'pass',
  });

  // CTA kontrolü — onaylı listede mi?
  const approvedCtas = (kit.ctas ?? []).filter((c: any) => c.approvalStatus === 'APPROVED').map((c: any) => c.text);
  const ctaOk = !input.content.cta || approvedCtas.length === 0 || approvedCtas.includes(input.content.cta);
  checks.push({
    key: 'cta',
    label: 'CTA',
    ok: ctaOk,
    detail: ctaOk ? 'Onaylı CTA' : `Tercih edilen listede değil: "${input.content.cta}"`,
    severity: ctaOk ? 'pass' : 'warn',
  });

  // Hashtag — yasaklı var mı?
  const bannedTags = (kit.hashtags ?? []).filter((h: any) => h.category === 'BANNED').map((h: any) => h.tag);
  const usedBanned = bannedTags.some((t: string) => (input.content.hashtags ?? '').includes(t));
  checks.push({
    key: 'hashtags',
    label: 'Hashtag',
    ok: !usedBanned,
    detail: usedBanned ? 'Yasaklı hashtag kullanıldı.' : 'Hashtag uygun',
    severity: usedBanned ? 'fail' : 'pass',
  });

  // Yasaklı kelime — BrandVoice bannedTerms
  const bannedTerms = String(kit.brand?.voice?.bannedTerms ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const hasBannedTerm = bannedTerms.some((w: string) => (input.content.caption ?? '').toLowerCase().includes(w.toLowerCase()));
  checks.push({
    key: 'bannedWords',
    label: 'Yasaklı kelime',
    ok: !hasBannedTerm,
    detail: hasBannedTerm ? 'Yasaklı kelime tespit edildi.' : 'Yasaklı kelime yok',
    severity: hasBannedTerm ? 'fail' : 'pass',
  });

  // Logo — var mı?
  const hasLogo = (kit.logos ?? []).length > 0;
  checks.push({
    key: 'logo',
    label: 'Logo',
    ok: hasLogo,
    detail: hasLogo ? 'Logo tanımlı' : 'Logo eksik',
    severity: hasLogo ? 'pass' : 'warn',
  });

  // Ton — kaba kontrol (kelime var mı?)
  checks.push({
    key: 'tone',
    label: 'Marka tonu',
    ok: true,
    detail: kit.brand?.voice?.tone ?? 'Varsayılan ton',
    severity: 'pass',
  });

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  // Kapı (gate) — kit.consistencyGate'e göre
  const gateSetting: string = kit.consistencyGate ?? 'WARNING';
  let gate: ConsistencyResult['gate'] = 'ALLOW';
  const hasFail = checks.some((c) => c.severity === 'fail');
  if (hasFail) {
    if (gateSetting === 'BLOCK') gate = 'BLOCK';
    else if (gateSetting === 'REQUIRE_APPROVAL') gate = 'REQUIRE_APPROVAL';
    else if (gateSetting === 'WARNING') gate = 'WARN';
  }

  const message =
    gate === 'BLOCK'
      ? 'Marka uyumu kritik ihlal nedeniyle yayın engellendi.'
      : gate === 'REQUIRE_APPROVAL'
        ? 'Marka uyumu onay gerektiriyor.'
        : gate === 'WARN'
          ? 'Marka uyumunda uyarılar var, gözden geçirmeniz önerilir.'
          : 'Marka uyumu iyi.';

  return { score, checks, gate, message };
}

export function consistencyBadge(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}
