/**
 * Seed güvenlik kapısı (Faz 7 §15, §62)
 * ---------------------------------------------------------------------------
 * Üretim veritabanının yanlışlıkla silinip demo veriyle doldurulmasını engeller.
 * seed.ts TÜM tabloları temizler; bu yüzden üretimde çalışması yalnızca
 * SEED_ALLOW_PRODUCTION=true ile AÇIKÇA onaylandığında mümkündür.
 * Saf fonksiyondur — test edilebilir, yan etkisi yoktur.
 */

export interface SeedGateInput {
  /** APP_ENV=production ise true. */
  isProduction: boolean;
  /** SEED_ALLOW_PRODUCTION=true ise true (açık operatör onayı). */
  allowProductionSeed: boolean;
}

export interface SeedGateResult {
  allowed: boolean;
  reason?: string;
}

export function isSeedAllowed(input: SeedGateInput): SeedGateResult {
  if (!input.isProduction) return { allowed: true };
  if (input.allowProductionSeed) {
    return { allowed: true, reason: 'SEED_ALLOW_PRODUCTION=true — üretim seed açıkça onaylandı.' };
  }
  return {
    allowed: false,
    reason:
      'ENGELLENDİ: Bu komut TÜM veritabanı tablolarını siler ve demo veri yazar. ' +
      'Üretim ortamında (APP_ENV=production) çalıştırmak için SEED_ALLOW_PRODUCTION=true ' +
      'ortam değişkenini açıkça ayarlayın. Gerçek veri yedeklerinin alındığından emin olun.'
  };
}
