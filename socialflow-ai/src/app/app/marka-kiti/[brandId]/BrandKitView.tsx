'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Badge, ProgressBar, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError } from '@/lib/client/api';
import { COLLECTIONS } from '@/lib/brandkit/collections';
import { BRAND_KIT_TABS, LOCK_MODE_LABELS, type LockMode } from '@/lib/brandkit/constants';
import { CollectionPanel } from './CollectionPanel';
import { GeneralPanel, AiRulesPanel, VoicePanel, VersionsPanel, InfoPanel } from './KitPanels';

interface Completeness { score: number; sections: { key: string; label: string; weight: number; complete: boolean; detail?: string }[] }
interface Permissions { view: boolean; edit: boolean; approve: boolean; lock: boolean; export: boolean; manage_assets: boolean }
interface Data { kit: any; completeness: Completeness; permissions: Permissions; flags: Record<string, boolean> }

const TAB_ICONS: Record<string, string> = {
  genel: 'brand', logo: 'image', renkler: 'palette', tipografi: 'text', 'marka-dili': 'sparkles',
  slogan: 'zap', cta: 'target', 'hashtag-mention': 'hashtag', 'gorsel-stil': 'shapes',
  'sosyal-kurallar': 'monitor', 'urun-kurallari': 'grid', 'kampanya-kurallari': 'target',
  sablonlar: 'layers', dosyalar: 'folder', yasal: 'shield', 'ai-kurallari': 'magic',
  'marka-hafizasi': 'database', 'surum-gecmisi': 'history'
};

function scoreTone(s: number): 'danger' | 'warning' | 'success' {
  return s >= 80 ? 'success' : s >= 45 ? 'warning' : 'danger';
}

export function BrandKitView({ brandId, initialData, demoMode }: { brandId: string; initialData: Data; demoMode: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Data>(initialData);
  const [tab, setTab] = useState<string>(BRAND_KIT_TABS[0].id);
  const [loading, setLoading] = useState(false);
  const [showScore, setShowScore] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Data>(`/api/brands/${brandId}/marka-kiti`);
      setData(res);
    } catch (e) {
      toast.error('Yenilenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  const { kit, completeness, permissions } = data;
  const brand = kit.brand ?? {};
  const canEdit = permissions.edit;

  function panel() {
    switch (tab) {
      case 'genel':
        return <GeneralPanel kit={kit} canEdit={canEdit} onChanged={refresh} />;
      case 'marka-dili':
        return <VoicePanel kit={kit} canEdit={canEdit} onChanged={refresh} />;
      case 'ai-kurallari':
        return <AiRulesPanel kit={kit} canLock={permissions.lock} onChanged={refresh} />;
      case 'surum-gecmisi':
        return <VersionsPanel brandId={brandId} currentVersion={kit.currentVersion} canEdit={canEdit} />;
      case 'hashtag-mention':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="section-title mb-2">Hashtag</h3>
              <CollectionPanel brandId={brandId} def={COLLECTIONS.hashtags} items={kit.hashtags ?? []} canEdit={canEdit} onChanged={refresh} />
            </div>
            <div>
              <h3 className="section-title mb-2">Mention</h3>
              <CollectionPanel brandId={brandId} def={COLLECTIONS.mentions} items={kit.mentions ?? []} canEdit={canEdit} onChanged={refresh} />
            </div>
          </div>
        );
      case 'urun-kurallari':
        return (
          <div className="space-y-4">
            <div className="card card-pad">
              <h3 className="section-title mb-1">Ürün Kataloğu — Doğrulanmış Kaynak</h3>
              <p className="section-sub mb-3">AI kampanya ve içerik üretiminde yalnızca buradaki doğrulanmış ürün bilgileri kullanılır. “İddia yoksa uydurma” kuralı aktiftir.</p>
              <ul className="space-y-2">
                {[
                  { id: 'p1', name: 'Etiyopya Yirgacheffe 250g', price: '189,00 ₺', claim: 'Etekten fincana izlenebilir, 1200m rakım, yıkama proses' },
                  { id: 'p2', name: 'Filtre Kahve Demleme Seti', price: '450,00 ₺', claim: 'V60 porselen, 600ml server, Japon yapımı' },
                  { id: 'p3', name: 'Cold Brew Şişe 300ml', price: '65,00 ₺', claim: '12 saat soğuk demleme, katkısız' },
                ].map(p => (
                  <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
                    <div><p className="text-[13px] font-bold text-ink">{p.name}</p><p className="text-[12px] text-ink-muted">{p.claim}</p></div>
                    <Badge tone="success">{p.price}</Badge>
                  </li>
                ))}
              </ul>
              <p className="hint mt-3">Yönetim: Marka Kiti API üzerinden ürün ekleyin — AI bu listeyi “verified fact” olarak görür, listede olmayan indirim/tarih uydurulmaz.</p>
            </div>
            <CollectionPanel brandId={brandId} def={COLLECTIONS['legal-rules']} items={kit.legalRules ?? []} canEdit={canEdit} onChanged={refresh} filter={(r) => r.category === 'CLAIM_RULE'} preset={{ category: 'CLAIM_RULE' }} />
          </div>
        );
      case 'sablonlar':
        return <InfoPanel icon="layers" title="Şablonlar" description="Marka şablonları ve kreatif ön ayarları Şablon/Kreatif Stüdyo modülüyle etkinleşecek." />;
      case 'kampanya-kurallari':
        return (
          <CollectionPanel
            brandId={brandId}
            def={COLLECTIONS['legal-rules']}
            items={kit.legalRules ?? []}
            canEdit={canEdit}
            onChanged={refresh}
            filter={(r) => r.category === 'CAMPAIGN_RULE'}
            preset={{ category: 'CAMPAIGN_RULE' }}
          />
        );
      case 'yasal':
        return (
          <CollectionPanel
            brandId={brandId}
            def={COLLECTIONS['legal-rules']}
            items={kit.legalRules ?? []}
            canEdit={canEdit}
            onChanged={refresh}
            filter={(r) => r.category !== 'CAMPAIGN_RULE'}
            preset={{ category: 'LEGAL_INFO' }}
          />
        );
      default: {
        const map: Record<string, string> = {
          logo: 'logos', renkler: 'colors', tipografi: 'typography', slogan: 'messages',
          cta: 'ctas', 'gorsel-stil': 'visual-rules', 'sosyal-kurallar': 'platform-rules',
          dosyalar: 'assets', 'marka-hafizasi': 'memories'
        };
        const collKey = map[tab];
        if (!collKey) return <InfoPanel icon="info" title="Sekme" description="Bu sekme hazırlanıyor." />;
        const def = COLLECTIONS[collKey];
        const itemsKey: Record<string, string> = {
          logos: 'logos', colors: 'colors', typography: 'typography', messages: 'messages',
          ctas: 'ctas', 'visual-rules': 'visualRules', 'platform-rules': 'platformRules',
          assets: 'assets', memories: 'memories'
        };
        const items = kit[itemsKey[collKey]] ?? [];
        return (
          <CollectionPanel
            brandId={brandId}
            def={def}
            items={items}
            canEdit={permissions[def.perm]}
            onChanged={refresh}
          />
        );
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Başlık */}
      <div className="mb-5">
        <Link href="/app/marka-kiti" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted hover:text-ink">
          <Icon name="collapse" size={14} /> Tüm Marka Kitleri
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line" style={{ background: `color-mix(in srgb, ${brand.primaryColor ?? '#7C4DFF'} 12%, white)` }}>
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt={brand.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-[16px] font-extrabold" style={{ color: brand.primaryColor ?? '#7C4DFF' }}>{String(brand.name ?? '?').charAt(0)}</span>
              )}
            </span>
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-ink sm:text-[26px]">{brand.name} Marka Kiti</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
                <Badge tone="neutral"><Icon name="layers" size={11} /> v{kit.currentVersion}</Badge>
                {kit.lockMode !== 'OFF' ? <Badge tone="warning"><Icon name="shield" size={11} /> Kilit: {LOCK_MODE_LABELS[kit.lockMode as LockMode]}</Badge> : <Badge tone="neutral"><Icon name="shield" size={11} /> Kilit Kapalı</Badge>}
                {demoMode ? <Badge tone="info">Demo Modu</Badge> : null}
                {permissions.export && <button onClick={async () => { try { const res = await fetch(`/api/brands/${brandId}/marka-kiti/export`); if (!res.ok) throw new Error(await res.text()); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${brand.slug ?? brandId}-marka-kiti.json`; a.click(); URL.revokeObjectURL(url); toast.success('Marka kiti dışa aktarıldı'); } catch(e){ toast.error('Dışa aktarılamadı', e instanceof Error ? e.message : 'hata'); } }} className="btn-secondary btn-xs"><Icon name="download" size={12} /> Dışa Aktar</button>}
                {loading ? <Spinner size={13} /> : null}
              </div>
            </div>
          </div>

          {/* Doluluk */}
          <div className="w-full max-w-[260px]">
            <button className="mb-1 flex w-full items-center justify-between text-[12.5px]" onClick={() => setShowScore((s) => !s)}>
              <span className="font-semibold text-ink-muted">Kit Doluluk</span>
              <span className="font-extrabold text-ink">%{completeness.score}</span>
            </button>
            <ProgressBar value={completeness.score} max={100} tone={scoreTone(completeness.score)} />
            {showScore ? (
              <ul className="mt-2 space-y-1 rounded-xl border border-line bg-surface-subtle p-2.5">
                {completeness.sections.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-[12px]">
                    <Icon name={s.complete ? 'check-circle' : 'alert-triangle'} size={13} />
                    <span className={s.complete ? 'text-ink' : 'text-ink-muted'}>{s.label}</span>
                    {s.detail ? <span className="ml-auto text-ink-faint">{s.detail}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sekmeler + panel */}
      <div className="flex flex-col gap-5 md:flex-row">
        <nav className="no-scrollbar -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 md:mx-0 md:w-60 md:flex-col md:overflow-visible md:px-0">
          {BRAND_KIT_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold transition-all md:w-full ' +
                  (active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink')
                }
              >
                <Icon name={TAB_ICONS[t.id] ?? 'info'} size={15} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1">{panel()}</div>
      </div>
    </div>
  );
}
