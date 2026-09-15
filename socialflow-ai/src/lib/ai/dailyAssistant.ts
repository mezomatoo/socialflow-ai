/**
 * PHASE 4 — AI Günlük Asistan (§125-§127)
 * Gerçek sistem durumuna göre öncelikli görevler üretir.
 */

export interface AssistantItem {
  id: string;
  type: 'scheduled' | 'approval' | 'account' | 'gap' | 'warning' | 'tip';
  title: string;
  detail: string;
  actionLabel?: string;
  actionRoute?: string;
  priority: number;
}

export async function getDailyAssistant(workspaceId: string): Promise<{ greeting: string; items: AssistantItem[]; actionCenter: AssistantItem[] }> {
  // Mock gerçek veriler — prod'da gerçek content/account/analytics sorguları
  const items: AssistantItem[] = [
    { id: '1', type: 'scheduled', title: 'Bugün 4 paylaşım planlı.', detail: 'Instagram (2), LinkedIn (1), X (1)', actionLabel: 'Takvimi gör', actionRoute: '/app/takvim', priority: 1 },
    { id: '2', type: 'approval', title: '2 içerik onay bekliyor.', detail: 'Kahve Dükkanı — taslaklar', actionLabel: 'Onayla', actionRoute: '/app/icerik/taslaklar', priority: 1 },
    { id: '3', type: 'account', title: 'Instagram hesabınız yeniden bağlantı gerektiriyor.', detail: 'Token süresi dolmak üzere', actionLabel: 'Bağla', actionRoute: '/app/hesaplar', priority: 2 },
    { id: '4', type: 'gap', title: 'Yarın içerik takviminizde boşluk var.', detail: 'AI ile plan önerisi alabilirsiniz', actionLabel: 'Plan öner', actionRoute: '/app/ai-planlayici', priority: 3 },
  ];
  const warnings: AssistantItem[] = [
    { id: 'w1', type: 'warning', title: 'Son 10 içeriğinizin 8’i ürün tanıtımı.', detail: 'Denge için eğitici ve topluluk içerikleri ekleyin.', priority: 2 },
    { id: 'w2', type: 'warning', title: 'Bu hafta Story planınız boş.', detail: 'Hikaye etkileşimi yüksek.', priority: 3 },
  ];
  return {
    greeting: `Günaydın! Bugün için ${items.length} öncelikli göreviniz var.`,
    items,
    actionCenter: [...items, ...warnings].sort((a, b) => a.priority - b.priority),
  };
}
