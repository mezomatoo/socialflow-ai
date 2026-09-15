/**
 * PHASE 4 — AI İçerik Planlayıcı (§70-§74)
 */

export interface PlanRequest {
  brandId: string;
  campaignId?: string | null;
  platforms: string[];
  dateFrom: string;
  dateTo: string;
  goal?: string | null;
  frequency?: string | null;
  targetAudience?: string | null;
}

export interface PlanItem {
  date: string;
  platform: string;
  contentType: string;
  topic: string;
  headline: string;
  captionConcept: string;
  creativeConcept: string;
  cta: string;
  hashtags: string[];
}

const TOPICS = ['Ürün tanıtımı', 'Eğitici', 'Etkileşim', 'Marka Hikayesi', 'Kampanya', 'Sosyal Kanıt', 'Topluluk', 'Kurumsal'];

export async function generateContentPlan(input: PlanRequest): Promise<PlanItem[]> {
  const start = new Date(input.dateFrom);
  const end = new Date(input.dateTo);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const items: PlanItem[] = [];
  const perWeek = input.frequency?.includes('3') ? 3 : 4;
  const total = Math.min(14, Math.ceil((days / 7) * perWeek));
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getTime() + (i * 86400000 * 7) / perWeek);
    const platform = input.platforms[i % input.platforms.length] ?? 'INSTAGRAM';
    const topic = TOPICS[i % TOPICS.length];
    items.push({
      date: d.toISOString().slice(0, 10),
      platform,
      contentType: platform === 'INSTAGRAM' ? 'FEED' : 'POST',
      topic,
      headline: `${topic}: ${input.goal ?? 'Yeni sezon'} — ${i + 1}`,
      captionConcept: `${topic} odaklı, samimi ve bilgilendirici caption.`,
      creativeConcept: 'Doğal ışık, premium his, ürün ön planda.',
      cta: 'Hemen Keşfet',
      hashtags: ['kahve', 'nitelikkahve'],
    });
  }
  return items;
}
