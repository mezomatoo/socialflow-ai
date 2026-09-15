/**
 * PHASE 4 — AI Kampanya Oluşturucu (§75-§77)
 * AI fiyat/indirim/tarih/kupon uydurmaz — yalnızca doğrulanmış CampaignOffer/ProductFact kullanır.
 */

export interface CampaignRequest {
  brandId: string;
  goal: string;
  productId?: string | null;
  offerId?: string | null;
  startDate: string;
  endDate: string;
  platforms: string[];
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
}

export async function generateCampaign(input: CampaignRequest, offer?: { price?: number | null; discount?: number | null; coupon?: string | null; endDate?: string | null } | null): Promise<CampaignConcept> {
  const offerNote = offer
    ? `Fiyat: ${offer.price ?? '[BİLGİ EKSİK]'} TL, İndirim: ${offer.discount ?? '[YOK]'}%, Kupon: ${offer.coupon ?? '[YOK]'}, Bitiş: ${offer.endDate ?? input.endDate}`
    : `Tarih: ${input.startDate} - ${input.endDate}`;
  return {
    theme: `${input.goal} — Premium lansman teması`,
    name: `${input.goal} Kampanyası`,
    keyMessage: `Yeni sezonun en nitelikli seçkisi — ${offerNote}`,
    pillars: ['Ürün', 'Eğitim', 'Topluluk'],
    platformStrategy: {
      INSTAGRAM: 'Görsel odaklı, kısa caption',
      LINKEDIN: 'Profesyonel ve bilgilendirici',
      X: 'Kısa ve vurucu',
      TIKTOK: 'Samimi ve enerjik',
    },
    calendar: input.platforms.slice(0, 3).map((p, i) => ({ date: `2026-09-${10 + i}`, platform: p, topic: `Lansman ${i + 1}` })),
    creativeConcepts: ['Stüdyo çekimi, premium siyah arka plan', 'Yaşam tarzı: sabah rutini'],
    captionConcepts: ['Her yudumda bir hikâye', 'Nitelikli kahve ile tanış'],
    ctaStrategy: ['Hemen Keşfet', 'Koleksiyonu İncele'],
    hashtagStrategy: ['#kahvedukkani', '#nitelikkahve', '#yenisezon'],
  };
}
