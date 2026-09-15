/**
 * PHASE 4 — Product Catalog & Verified Facts (§100-§105)
 * -------------------------------------------------------
 * AI, fiyat/indirim/tarih gibi bilgileri asla uydurmaz — yalnızca VERIFIED
 * ProductFact / CampaignOffer kaynaklarından okur. Tüm içerikler fact traceability
 * ile hangi kaynağın kullanıldığını saklayabilir.
 */

export interface Product {
  id: string;
  workspaceId: string;
  brandId: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  url?: string | null;
  status: string;
}

export interface ProductFact {
  id: string;
  productId: string;
  key: string;
  value: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED';
}

export interface CampaignOffer {
  id: string;
  workspaceId: string;
  brandId: string;
  productId?: string | null;
  price?: number | null;
  currency: string;
  discount?: number | null;
  coupon?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  conditions?: string | null;
  status: 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED';
}

// Mock catalog — gerçekte DB'den gelir
const mockProducts: Product[] = [
  { id: 'prod-1', workspaceId: 'demo-workspace-id', brandId: 'demo-brand-id', name: 'Etiyopya Yirgacheffe 250g', sku: 'ETY-250', category: 'Kahve', description: 'Tek orijin çekirdek', status: 'ACTIVE' },
  { id: 'prod-2', workspaceId: 'demo-workspace-id', brandId: 'demo-brand-id', name: 'Cold Brew 330ml', sku: 'CB-330', category: 'Soğuk Kahve', description: 'Soguk demleme', status: 'ACTIVE' },
];

const mockFacts: ProductFact[] = [
  { id: 'fact-1', productId: 'prod-1', key: 'PRICE', value: '1,299 TL', status: 'VERIFIED' },
  { id: 'fact-2', productId: 'prod-1', key: 'ORIGIN', value: 'Yirgacheffe, Etiyopya', status: 'VERIFIED' },
];

const mockOffers: CampaignOffer[] = [
  { id: 'offer-1', workspaceId: 'demo-workspace-id', brandId: 'demo-brand-id', productId: 'prod-1', price: 1299, currency: 'TRY', discount: 20, coupon: 'YENI20', startDate: '2026-09-01', endDate: '2026-09-20', conditions: '%20 indirim, 20 Eylül 2026 tarihine kadar geçerli.', status: 'VERIFIED' },
];

export function listProducts(workspaceId: string, brandId?: string): Product[] {
  return mockProducts.filter((p) => p.workspaceId === workspaceId && (!brandId || p.brandId === brandId));
}

export function getOfferForProduct(productId: string): CampaignOffer | null {
  return mockOffers.find((o) => o.productId === productId && o.status === 'VERIFIED') ?? null;
}

export function verifiedFactsFor(productId: string): ProductFact[] {
  return mockFacts.filter((f) => f.productId === productId && f.status === 'VERIFIED');
}

export function formatOffer(offer: CampaignOffer): string {
  const parts = [];
  if (offer.price) parts.push(`${offer.price.toLocaleString('tr-TR')} ${offer.currency}`);
  if (offer.discount) parts.push(`%${offer.discount} indirim`);
  if (offer.coupon) parts.push(`Kupon: ${offer.coupon}`);
  if (offer.endDate) parts.push(`Son tarih: ${offer.endDate}`);
  return parts.join(' • ');
}

export function factTrace(caption: string, facts: ProductFact[], offer?: CampaignOffer | null): { caption: string; traces: { key: string; sourceId: string }[] } {
  // Basit izlenebilirlik: caption içindeki fiyat/ürün adını kaynağa bağla
  const traces: { key: string; sourceId: string }[] = [];
  for (const f of facts) if (caption.includes(f.value)) traces.push({ key: f.key, sourceId: f.id });
  if (offer && offer.price && caption.includes(String(offer.price))) traces.push({ key: 'PRICE', sourceId: offer.id });
  return { caption, traces };
}
