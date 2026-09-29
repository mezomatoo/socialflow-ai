'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import type { AdAccountView, AdvertisingOverview } from '@/lib/advertising/service';
const panel = 'rounded-xl border border-slate-200 bg-white p-5';
const button = 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600';
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const states: Record<string, string> = { CONNECTED: 'Doğrulanmış', UNVERIFIED: 'Doğrulanmamış', REAUTH_REQUIRED: 'Yeniden yetkilendirme gerekli', DISCONNECTED: 'Bağlantı kesildi', ERROR: 'Bağlantı hatası' };
const date = (v: string | null, timezone: string) => v ? new Date(v).toLocaleString('tr-TR', { timeZone: timezone }) : 'Henüz yok';
export function AdvertisingView({ overview, mode }: { overview: AdvertisingOverview; mode: 'overview' | 'accounts' }) {
  const [provider, setProvider] = useState(''), [brand, setBrand] = useState(''), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<AdAccountView[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(mode === 'accounts');
  const [detail, setDetail] = useState<AdAccountView | null>(null), [mapping, setMapping] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [connecting, setConnecting] = useState('');
  const searchParams = useSearchParams();
  const sequence = useRef(0);
  useEffect(() => {
    const result = searchParams.get('baglanti');
    if (!result) return;
    const messages: Record<string, string> = {
      connected: 'Google Ads hesabı bağlandı ve erişilebilen müşteri hesapları doğrulandı.',
      DENIED: 'Google Ads erişim izni verilmedi.',
      CONFIGURATION: 'Google Ads bağlantısı için sunucu yapılandırması tamamlanmamış.',
      NO_ACCOUNTS: 'Bu Google hesabıyla erişilebilen bir Google Ads müşteri hesabı bulunamadı.',
      PROVIDER_AUTH: 'Google Ads yetkilendirmesi veya developer token geçersiz.',
      INVALID_STATE: 'Google Ads bağlantı isteği geçersiz veya süresi dolmuş.',
      provider_error: 'Google Ads hesabı doğrulanamadı. Lütfen tekrar deneyin.'
    };
    if (result === 'connected') setNotice(messages[result]);
    else setError(messages[result] ?? 'Google Ads bağlantısı tamamlanamadı.');
  }, [searchParams]);
  useEffect(() => {
    if (mode !== 'accounts') return;
    let cancelled = false; setLoading(true); setError(''); setDetail(null);
    api.get<{ items: AdAccountView[]; total: number }>(`/api/advertising/accounts?${new URLSearchParams({ provider, brand, page: String(page) })}`)
      .then(r => { if (!cancelled) { setItems(r.items); setTotal(r.total); } })
      .catch(e => { if (!cancelled) { setItems([]); setError(e instanceof Error ? e.message : 'Hesaplar yüklenemedi.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, provider, brand, page, refresh]);
  async function open(id: string) {
    const seq = ++sequence.current; setError(''); setDetail(null);
    try { const d = await api.get<AdAccountView>(`/api/advertising/accounts/${encodeURIComponent(id)}`); if (seq === sequence.current) { setDetail(d); setMapping(d.brandId ?? ''); } }
    catch (e) { if (seq === sequence.current) setError(e instanceof Error ? e.message : 'Hesap yüklenemedi.'); }
  }
  async function save() {
    if (!detail) return; setBusy(true); setError(''); setNotice('');
    try { await api.patch(`/api/advertising/accounts/${encodeURIComponent(detail.id)}`, { brandId: mapping || null, version: detail.version }); setNotice('Marka eşleştirmesi kaydedildi. Platforma veya bütçeye değişiklik gönderilmedi.'); setRefresh(v => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Eşleştirme kaydedilemedi.'); }
    finally { setBusy(false); }
  }
  async function connect(providerCode: string) {
    setConnecting(providerCode); setError(''); setNotice('');
    try {
      const result = await api.post<{ authorizeUrl: string }>(`/api/advertising/providers/${encodeURIComponent(providerCode)}/connect`);
      if (!result.authorizeUrl) throw new Error('Yetkilendirme bağlantısı oluşturulamadı.');
      window.location.assign(result.authorizeUrl);
    } catch (e) {
      setConnecting('');
      setError(e instanceof Error ? e.message : 'Google Ads bağlantısı başlatılamadı.');
    }
  }
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-violet-700">Reklamlar · Google Ads bağlantısı</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{mode === 'overview' ? 'Reklam özeti' : 'Reklam hesapları'}</h1><p className="mt-2 text-sm text-slate-600">Organik yayınlarınızdan bağımsız, çalışma alanınıza özel reklam merkezi.</p></div><button className={`${button} border-blue-200 bg-blue-50 text-blue-800`} disabled={!overview.canConnectGoogleAds || Boolean(connecting)} onClick={() => void connect('GOOGLE')} aria-describedby="ads-limitation">{connecting === 'GOOGLE' ? 'Google Ads bağlanıyor…' : 'Google Ads hesabı bağla'}</button></header>
    <nav aria-label="Reklam bölümleri" className="flex flex-wrap gap-2">{[['/app/reklamlar', 'Genel bakış', 'overview'], ['/app/reklamlar/hesaplar', 'Hesaplar', 'accounts']].map(([href, label, key]) => <Link key={href} href={href} aria-current={mode === key ? 'page' : undefined} className={`${button} ${mode === key ? 'border-violet-300 bg-violet-50 text-violet-800' : ''}`}>{label}</Link>)}</nav>
    <section id="ads-limitation" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Google Ads bağlantısı okuma yetkisiyle etkin.</strong><p className="mt-1">Google OAuth ile erişebildiğiniz müşteri hesapları doğrulanıp çalışma alanınıza eklenir. Kampanya oluşturma, reklam yayınlama, bütçe değişikliği ve finansal metrik senkronizasyonu henüz kapalıdır; bağlantı reklam harcaması başlatmaz.</p></section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    {mode === 'overview' ? <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{['Harcama', 'Aktif kampanya', 'Gösterim', 'Tıklama', 'Dönüşüm', 'Gelir', 'ROAS', 'Edinme maliyeti'].map(label => <div className={panel} key={label}><p className="text-sm text-slate-600">{label}</p><p className="my-3 text-3xl font-semibold text-slate-400" aria-label="Veri mevcut değil">—</p><p className="text-xs text-slate-500">Henüz senkronize edilmedi</p></div>)}</div>
      <section className={panel}><h2 className="font-semibold">Ölçüm durumu</h2><p className="mt-2 text-sm text-slate-600">Kayıtlı reklam hesabı: <strong>{overview.totalAccounts}</strong> · Çalışma alanı saat dilimi: {overview.workspaceTimezone}</p><p className="mt-2 text-sm text-slate-600">Eksik veri sıfır değildir. Hesapların özgün para birimleri korunur; döviz dönüşümü, gelir tahmini veya birleşik ROAS hesaplanmaz.</p><Link href="/app/reklamlar/hesaplar" className="mt-4 inline-block text-sm font-semibold text-violet-700 underline">Hesapları incele →</Link></section>
    </> : <>
      <section className={panel}><div className="grid items-end gap-4 sm:grid-cols-3"><label className="text-sm">Sağlayıcı<select aria-label="Sağlayıcı" className={field} value={provider} onChange={e => { setProvider(e.target.value); setPage(1); }}><option value="">Tüm sağlayıcılar</option>{overview.providers.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label className="text-sm">Marka<select aria-label="Marka" className={field} value={brand} onChange={e => { setBrand(e.target.value); setPage(1); }}><option value="">Tüm markalar</option>{overview.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className={button} disabled={loading || busy} onClick={() => setRefresh(v => v + 1)}>Yerel listeyi yenile</button></div><p className="mt-3 text-xs text-slate-500">Yenileme yalnızca kayıtlı verileri okur; sağlayıcı senkronizasyonu başlatmaz.</p></section>
      <section aria-label="Kayıtlı hesaplar" aria-busy={loading} className="space-y-3">{loading ? <p role="status" className={panel}>Hesaplar yükleniyor…</p> : !error && !items.length ? <div className={`${panel} py-10 text-center`}><h2 className="font-semibold">{provider || brand ? 'Filtreye uygun hesap bulunamadı' : 'Henüz kayıtlı reklam hesabı yok'}</h2><p className="mt-2 text-sm text-slate-500">Google Ads hesabınızı bağlayarak erişebildiğiniz müşteri hesaplarını burada doğrulayabilirsiniz.</p></div> : items.map(a => <article key={a.id} className={`${panel} flex flex-wrap items-center justify-between gap-3`}><div><h2 className="font-semibold">{a.displayName}</h2><p className="mt-1 break-all text-sm text-slate-500">{a.providerName} · {a.providerAccountId} · {states[a.connectionStatus] ?? 'Bilinmeyen durum'}</p><p className="mt-1 text-sm">{a.brand?.name ?? 'Marka atanmamış'} · {a.currency ?? 'Para birimi bilinmiyor'} · {a.timezone ?? 'Saat dilimi bilinmiyor'}</p></div><button className={button} disabled={busy} onClick={() => void open(a.id)}>Hesabı incele</button></article>)}</section>
      {!loading && !error && total > 0 && <div className="flex items-center justify-between gap-2"><button className={button} disabled={page <= 1 || busy} onClick={() => setPage(v => v - 1)}>Önceki</button><span className="text-sm">{total} hesap · Sayfa {page} / {Math.ceil(total / 30)}</span><button className={button} disabled={page * 30 >= total || busy} onClick={() => setPage(v => v + 1)}>Sonraki</button></div>}
      {detail && <section aria-label="Hesap ayrıntıları" className={panel}><div className="flex justify-between gap-3"><h2 className="font-semibold">{detail.displayName} · Hesap ayrıntıları</h2><button className={button} disabled={busy} onClick={() => { ++sequence.current; setDetail(null); }}>Kapat</button></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{[['OAuth durumu', states[detail.connectionStatus] ?? 'Bilinmiyor'], ['Token bitişi', date(detail.tokenExpiresAt, overview.workspaceTimezone)], ['Hesap doğrulaması', date(detail.lastValidatedAt, overview.workspaceTimezone)], ['Kampanya son senkronizasyonu', date(detail.lastCampaignSyncAt, overview.workspaceTimezone)], ['Analiz son senkronizasyonu', date(detail.lastMetricsSyncAt, overview.workspaceTimezone)], ['Dönüşüm son senkronizasyonu', date(detail.lastConversionSyncAt, overview.workspaceTimezone)], ['Katalog son senkronizasyonu', date(detail.lastCatalogSyncAt, overview.workspaceTimezone)], ['Webhook', 'Yapılandırılmadı'], ['Yetenek / API sürümü', `${detail.capabilityVersion ?? 'Yok'} / ${detail.capabilityApiVersion ?? 'Yok'}`], ['Sağlayıcı saat dilimi', detail.providerTimezone ?? 'Bilinmiyor']].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="mt-1 break-words">{v}</dd></div>)}</dl><p className="mt-4 text-xs text-slate-500">Tarihler: {overview.workspaceTimezone}. Geçmiş senkronizasyon tarihi güncel veri garantisi değildir. Google Ads bu sürümde yalnızca hesap ve kampanya okuma yetkisiyle bağlıdır.</p><div className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-48 text-sm">Marka eşleştirmesi<select aria-label="Marka eşleştirmesi" disabled={!overview.canManageAccounts || busy} className={field} value={mapping} onChange={e => setMapping(e.target.value)}><option value="">Marka atanmamış</option>{overview.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className={button} disabled={!overview.canManageAccounts || busy || mapping === (detail.brandId ?? '')} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Eşleştirmeyi kaydet'}</button></div><p className="mt-2 text-xs text-slate-500">Yalnızca sahip ve yöneticiler değiştirebilir. Bu yerel işlem denetim kaydına yazılır; bütçeyi etkilemez.</p></section>}
    </>}
    <section><h2 className="text-lg font-semibold">Reklam sağlayıcıları</h2><p className="mt-1 text-sm text-slate-500">Google Ads şu anda okuma yetkisiyle kullanılabilir. YouTube, Google Ads kapsamındadır; diğer sağlayıcılar dizin kaydıdır.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{overview.providers.map(p => { const live = p.implementation !== 'NOT_IMPLEMENTED'; return <article key={p.code} className={panel}><h3 className="font-semibold" style={{ color: p.color }}>{p.name}</h3><p className="mt-1 text-xs text-slate-500">{p.placementsLabel}</p><p className="my-3 text-sm text-slate-600">{live ? 'OAuth bağlantısı ve müşteri hesabı doğrulaması etkin. Finansal işlemler kapalı.' : 'OAuth ve reklam API adaptörü henüz uygulanmadı.'}</p><button className={button} disabled={!live || (p.code === 'GOOGLE' ? !overview.canConnectGoogleAds : !overview.canManageAccounts) || Boolean(connecting)} onClick={() => live && void connect(p.code)} aria-label={`${p.name} hesabı bağla`}>{connecting === p.code ? 'Bağlanıyor…' : live ? 'Hesap bağla' : 'Hesap bağla · Etkin değil'}</button></article>; })}</div></section>
    <details className={panel}><summary className="cursor-pointer font-semibold">Sonraki aşamalar · Henüz kullanılabilir değil</summary><p className="mt-3 text-sm text-slate-600">Kampanyalar · Yeni reklam sihirbazı · Kreatifler · Hedef kitleler · Dönüşümler · Pixel / CAPI · Kataloglar · Medya planlama · Bütçeler · Raporlar · Reklam ayarları</p><p className="mt-3 text-sm text-slate-500">Önce Meta hesap ve kampanya okuma, ardından metrikler. Finansal işlemler ancak ayrı yetki, onay ve güvenlik kontrolleri tamamlandığında açılacak.</p></details>
  </div>;
}
