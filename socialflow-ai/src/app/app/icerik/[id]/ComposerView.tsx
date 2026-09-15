'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { Badge, EmptyState, Modal, ProgressBar, Spinner, StatusPill, Switch } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { api, ApiError, debounce } from '@/lib/client/api';
import { charLength } from '@/lib/text';
import { formatDate, formatDateTime, formatTime, toLocalInputValue, zonedTimeToUtc } from '@/lib/format';
import { VariantPreview, type PreviewRule } from '@/components/media/VariantPreview';
import {
  CONTENT_STYLE_LABELS,
  CONTENT_TYPE_LABELS,
  PLATFORM_META,
  PUBLISH_STATUS_LABELS,
  type PlatformCode
} from '@/lib/platforms/platforms';

/* ------------------------------------------------------------------ types */
interface RuleView extends PreviewRule {
  label: string;
  maxCaptionLength: number;
  recommendedCaptionLength: number;
  maxHashtags: number;
  recommendedHashtags: number;
  clickableLinks: boolean;
  supportsScheduling: boolean;
  supportsFirstComment: boolean;
  maxMediaCount: number;
}

interface MediaAsset {
  id: string;
  publicUrl: string | null;
  kind: string;
  width: number | null;
  height: number | null;
  focalPoint?: { x: number; y: number; method?: string } | null;
}

interface Target {
  id: string;
  platform: string;
  contentType: string;
  key: string;
  enabled: boolean;
  caption: string;
  captionSource: string;
  hashtags: string;
  cta: string | null;
  firstComment: string | null;
  socialAccountId: string | null;
  socialAccount?: { id: string; handle: string; displayName: string; demoAccount: boolean } | null;
  mediaAsset?: MediaAsset | null;
  mediaAssetId: string | null;
  aspectRatio: string | null;
  focalPoint: any;
  cropMode: string;
  charLimit: number;
  charUsed: number;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  lastError: string | null;
  retryCount: number;
  permalink: string | null;
  rule: RuleView | null;
  variants: any[];
}

interface ContentDetail {
  id: string;
  title: string | null;
  masterCaption: string;
  storyText: string | null;
  linkUrl: string | null;
  defaultStyle: string;
  defaultCta: string | null;
  hashtagPlacement: string;
  status: string;
  adaptState: string;
  version: number;
  scheduledFor: string | null;
  publishedAt: string | null;
  brand: { id: string; name: string; primaryColor: string };
  media: { position: number; media: MediaAsset }[];
  platformContents: Target[];
}

interface Account {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  demoAccount: boolean;
  connectionStatus: string;
  accountType: string;
}
interface PlatformDef {
  code: string;
  name: string;
  color: string;
  contentTypes: { code: string; label: string }[];
}

interface PreflightTarget {
  platformContentId: string;
  ready: boolean;
  checks: { code: string; level: 'OK' | 'INFO' | 'WARNING' | 'ERROR'; message: string }[];
  charUsed: number;
  charLimit: number;
}
interface Preflight {
  readyCount: number;
  /** İçerik (platform kuralları) açısından hazır hedef sayısı. */
  contentReadyCount?: number;
  totalCount: number;
  headline: string;
  blocking: boolean;
  /** Yayın için henüz bekleyen hedef sayısı (ör. hesap bağlama). */
  publishingPending?: number;
  phase1Mode?: boolean;
  targets: PreflightTarget[];
}

function normalizeContent(c: any): ContentDetail {
  return {
    ...c,
    platformContents: (c.platformContents ?? []).map((pc: any) => ({
      ...pc,
      focalPoint: typeof pc.focalPoint === 'string' && pc.focalPoint ? safeParse(pc.focalPoint) : pc.focalPoint ?? null
    }))
  };
}
function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ view */
export function ComposerView({
  content: initial,
  accounts,
  platforms,
  timezone,
  demoMode,
  role,
  modules
}: {
  content: any;
  accounts: Account[];
  platforms: PlatformDef[];
  timezone: string;
  demoMode: boolean;
  role: string;
  modules?: Record<string, { enabled: boolean; phase: number; label: string; notice: string }>;
}) {
  // Modül kapıları: kapalı modüller çalışıyormuş gibi GÖSTERİLMEZ.
  const publishingEnabled = modules?.socialPublishing?.enabled ?? false;
  const schedulingEnabled = modules?.scheduling?.enabled ?? false;
  const accountsEnabled = modules?.socialAccounts?.enabled ?? false;
  const router = useRouter();
  const toast = useToast();
  const [content, setContent] = useState<ContentDetail>(() => normalizeContent(initial));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [adapting, setAdapting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [selOpen, setSelOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  // Ana açıklamanın en son uyarlandığı anlık görüntü. Master bundan farklıysa
  // kullanıcıya "yeniden oluşturulsun mu?" sorulur (#20).
  const [adaptedMaster, setAdaptedMaster] = useState<string | null>(() =>
    (initial.platformContents ?? []).some((t: any) => (t.caption ?? '').length > 0) ? initial.masterCaption : null
  );

  const masterMedia = useMemo(() => {
    const sorted = [...(content.media ?? [])].sort((a, b) => a.position - b.position);
    return sorted[0]?.media ?? null;
  }, [content.media]);

  const targets = useMemo(() => content.platformContents ?? [], [content.platformContents]);

  // Hedef seçim kutuları: hazır olanlar varsayılan işaretli
  useEffect(() => {
    setIncluded((prev) => {
      const next: Record<string, boolean> = {};
      for (const t of targets) next[t.id] = prev[t.id] ?? !['PUBLISHED', 'PUBLISHING'].includes(t.status);
      return next;
    });
  }, [targets]);

  const reload = useCallback(async () => {
    try {
      const fresh = await api.get<any>(`/api/contents/${content.id}`);
      setContent(normalizeContent(fresh));
    } catch {
      /* sessiz */
    }
  }, [content.id]);

  /* --- master otomatik kaydetme --- */
  const pushMaster = useCallback(
    async (patch: Partial<ContentDetail>) => {
      setSaveState('saving');
      try {
        const fresh = await api.patch<any>(`/api/contents/${content.id}`, patch);
        setContent((prev) => ({ ...normalizeContent(fresh), platformContents: fresh.platformContents?.length ? normalizeContent(fresh).platformContents : prev.platformContents }));
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
      } catch (e) {
        setSaveState('idle');
        toast.error('Kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      }
    },
    [content.id, toast]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedMaster = useRef(debounce((patch: Partial<ContentDetail>) => pushMaster(patch), 700)).current;

  function editMaster(patch: Partial<ContentDetail>) {
    setContent((prev) => ({ ...prev, ...patch }));
    debouncedMaster(patch);
  }

  /* --- hedef açıklama kaydetme --- */
  async function saveTargetCaption(t: Target, caption: string) {
    setContent((prev) => ({
      ...prev,
      platformContents: prev.platformContents.map((x) =>
        x.id === t.id ? { ...x, caption, charUsed: charLength(caption), captionSource: 'MANUAL' } : x
      )
    }));
    try {
      await api.patch(`/api/contents/${content.id}/platform-content/${t.id}`, { caption });
    } catch (e) {
      toast.error('Metin kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      reload();
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedCaption = useRef(
    debounce((t: Target, caption: string) => saveTargetCaption(t, caption), 700)
  ).current;

  function editCaption(t: Target, caption: string) {
    setContent((prev) => ({
      ...prev,
      platformContents: prev.platformContents.map((x) => (x.id === t.id ? { ...x, caption, charUsed: charLength(caption) } : x))
    }));
    debouncedCaption(t, caption);
  }

  /* --- hesap atama --- */
  async function assignAccount(t: Target, accountId: string | null) {
    setContent((prev) => ({
      ...prev,
      platformContents: prev.platformContents.map((x) =>
        x.id === t.id ? { ...x, socialAccountId: accountId, socialAccount: accounts.find((a) => a.id === accountId) ?? null } : x
      )
    }));
    try {
      await api.patch(`/api/contents/${content.id}`, { accountAssignments: [{ platformContentId: t.id, accountId }] });
    } catch (e) {
      toast.error('Hesap atanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      reload();
    }
  }


  /* --- platform medya varyantı kalıcılığı (§42–43) --------------------------
   * Önizleme canvas'ı hedef oranı tarayıcıda üretir; üretilen türev sunucuya
   * yüklenir (MediaVariant + PlatformContent.renderedKey). Orijinal dosya
   * asla değiştirilmez; aynı oran/odak için tekrar yükleme yapılmaz.
   * Yöntem etiketi dürüsttür: elle odak → USER_FOCAL_POINT, aksi DETERMINISTIC
   * ("AI akıllı kırpma" denmez). */
  const variantTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const variantSigs = useRef<Record<string, string>>({});
  const [variantStates, setVariantStates] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  function handleVariantRendered(t: Target, src: MediaAsset, ratio: string, out: { dataUrl: string; width: number; height: number; bytes: number }) {
    const sig = `${src.id}|${ratio}|${t.cropMode ?? 'SMART'}|${JSON.stringify(t.focalPoint ?? null)}`;
    if (variantSigs.current[t.id] === sig) return;
    clearTimeout(variantTimers.current[t.id]);
    variantTimers.current[t.id] = setTimeout(() => {
      void persistVariant(t, src, ratio, out, sig);
    }, 1200);
  }

  async function persistVariant(t: Target, src: MediaAsset, ratio: string, out: { dataUrl: string; width: number; height: number; bytes: number }, sig: string) {
    if (variantSigs.current[t.id] === sig) return;
    variantSigs.current[t.id] = sig;
    setVariantStates((prev) => ({ ...prev, [t.id]: 'saving' }));
    try {
      const blob = await (await fetch(out.dataUrl)).blob();
      const fd = new FormData();
      fd.append('mode', 'variant');
      fd.append('parentMediaId', src.id);
      fd.append('platform', t.platform);
      fd.append('contentType', t.contentType);
      fd.append('ratio', ratio);
      fd.append('width', String(out.width));
      fd.append('height', String(out.height));
      fd.append('cropMode', t.cropMode ?? 'SMART');
      fd.append('method', t.cropMode === 'MANUAL' || t.focalPoint ? 'USER_FOCAL_POINT' : 'DETERMINISTIC');
      fd.append('focalPoint', JSON.stringify(t.focalPoint ?? null));
      fd.append('blob', blob, `varyant-${t.platform.toLowerCase()}-${ratio.replace(':', 'x')}.jpg`);
      const saved = await api.upload<{ storageKey: string; publicUrl: string | null }>('/api/media/upload', fd);

      await api.patch(`/api/contents/${content.id}/platform-content/${t.id}`, {
        aspectRatio: ratio,
        renderedKey: saved.storageKey,
        renderedUrl: saved.publicUrl ?? null,
        targetWidth: out.width,
        targetHeight: out.height
      });
      setContent((prev) => ({
        ...prev,
        platformContents: prev.platformContents.map((x) =>
          x.id === t.id ? { ...x, aspectRatio: ratio, renderedKey: saved.storageKey, renderedUrl: saved.publicUrl ?? null } : x
        )
      }));
      setVariantStates((prev) => ({ ...prev, [t.id]: 'saved' }));
    } catch (e) {
      variantSigs.current[t.id] = '';
      setVariantStates((prev) => ({ ...prev, [t.id]: 'error' }));
      toast.error('Medya varyantı kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  /* --- odak / oran --- */
  async function saveVisual(t: Target, patch: { focalPoint?: any; aspectRatio?: string; cropMode?: string }) {
    setContent((prev) => ({
      ...prev,
      platformContents: prev.platformContents.map((x) => (x.id === t.id ? { ...x, ...patch } : x))
    }));
    try {
      await api.patch(`/api/contents/${content.id}/platform-content/${t.id}`, patch);
    } catch (e) {
      toast.error('Görsel ayarı kaydedilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  /* --- tümünü uyarla --- */
  async function adaptAll(preserveManual = true) {
    setAdapting(true);
    try {
      const res = await api.post<{ results: any[]; content: any; aiNotice?: string | null }>(`/api/contents/${content.id}/adapt`, { preserveManual });
      setContent(normalizeContent(res.content));
      setAdaptedMaster(content.masterCaption);
      const shortened = res.results.filter((r) => r.shortened).length;
      const truncated = res.results.filter((r) => r.truncated).length;
      const summary = `${res.results.length} hedef uyarlandı.${shortened ? ` ${shortened} metin kısaltıldı.` : ''}${truncated ? ` ${truncated} metin sınıra takıldı, gözden geçirin.` : ''}`;
      if (res.aiNotice) {
        // AI servisine ulaşılamadı: metinler yerel motorla üretildi, elle
        // düzenleme ve kaydetme ENGELLENMEZ (§69).
        toast.warning('AI servisine şu anda ulaşılamıyor', `${res.aiNotice} ${summary}`);
      } else {
        toast.success('AI uyarlaması tamamlandı', summary);
      }
      if (preflight) validate();
    } catch (e) {
      toast.error('Uyarlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setAdapting(false);
    }
  }

  /* --- yalnızca seçili hedefleri uyarla --- */
  async function adaptSelected() {
    const ids = targets.filter((t) => included[t.id]).map((t) => t.id);
    if (ids.length === 0) {
      toast.error('Hedef seçilmedi', 'Yeniden uyarlanacak hedefleri işaretleyin.');
      return;
    }
    setAdapting(true);
    try {
      const res = await api.post<{ results: any[]; content: any; aiNotice?: string | null }>(`/api/contents/${content.id}/adapt`, {
        targetIds: ids,
        preserveManual: false
      });
      setContent(normalizeContent(res.content));
      setAdaptedMaster(content.masterCaption);
      if (res.aiNotice) {
        toast.warning('AI servisine şu anda ulaşılamıyor', `${res.aiNotice} ${res.results.length} hedef yerel motorla yeniden oluşturuldu.`);
      } else {
        toast.success('Seçili hedefler uyarlandı', `${res.results.length} hedef yeniden oluşturuldu.`);
      }
    } catch (e) {
      toast.error('Uyarlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setAdapting(false);
    }
  }

  /* --- tek hedefi uyarla --- */
  async function adaptOne(t: Target) {
    try {
      const res = await api.post<{ results: any[]; content: any; aiNotice?: string | null }>(`/api/contents/${content.id}/adapt`, {
        targetIds: [t.id],
        preserveManual: false
      });
      setContent(normalizeContent(res.content));
      if (res.aiNotice) {
        toast.warning('AI servisine şu anda ulaşılamıyor', `${metaName(t.platform)} yerel motorla uyarlandı. Metni dilediğiniz gibi düzenleyebilirsiniz.`);
      } else {
        toast.success(`${metaName(t.platform)} uyarlandı`);
      }
    } catch (e) {
      toast.error('Uyarlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  /* --- doğrulama --- */
  async function validate() {
    setValidating(true);
    try {
      const report = await api.get<Preflight>(`/api/contents/${content.id}/validate`);
      setPreflight(report);
    } catch (e) {
      toast.error('Kontrol başarısız', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setValidating(false);
    }
  }

  /* --- seçimleri uygula --- */
  async function applySelections(selections: { platform: string; contentType: string; accountId: string | null }[]) {
    setSelOpen(false);
    try {
      const fresh = await api.patch<any>(`/api/contents/${content.id}`, { selections });
      setContent(normalizeContent(fresh));
      toast.success('Platform seçimi güncellendi');
      setPreflight(null);
    } catch (e) {
      toast.error('Seçim güncellenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  /* --- hemen yayınla --- */
  async function publishNow() {
    const targetIds = targets.filter((t) => included[t.id]).map((t) => t.id);
    if (targetIds.length === 0) {
      toast.error('Hedef seçilmedi', 'Yayınlamak için en az bir hedef işaretleyin.');
      return;
    }
    setPublishing(true);
    try {
      const res = await api.post<{ ready: number; total: number; results: any[] }>(`/api/contents/${content.id}/publish`, { targetIds });
      await reload();
      if (res.ready === res.total && res.total > 0) {
        toast.success(demoMode ? 'Demo yayını tamamlandı' : 'Yayınlandı', `${res.ready}/${res.total} hedef başarılı.`);
      } else {
        toast.warning('Kısmen yayınlandı', `${res.ready}/${res.total} hedef başarılı. Başarısız olanlar yeniden denenebilir.`);
      }
    } catch (e) {
      toast.error('Yayınlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
      await reload();
    } finally {
      setPublishing(false);
    }
  }

  /* --- yeniden dene --- */
  async function retryFailed() {
    try {
      const res = await api.post<{ ready: number; total: number }>(`/api/contents/${content.id}/retry`, {});
      await reload();
      toast.success('Yeniden denendi', `${res.ready}/${res.total} hedef başarılı.`);
    } catch (e) {
      toast.error('Yeniden denenemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    }
  }

  const failedCount = targets.filter((t) => t.status === 'FAILED').length;
  const readyCount = preflight
    ? preflight.phase1Mode
      ? preflight.contentReadyCount ?? preflight.readyCount
      : preflight.readyCount
    : targets.filter((t) => included[t.id]).length;
  const masterDirty = adaptedMaster !== null && content.masterCaption !== adaptedMaster && targets.some((t) => (t.caption ?? '').length > 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Üst çubuk */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/icerik/taslaklar" className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-brand-600">
            <Icon name="arrowLeft" size={13} /> İçeriklere dön
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-full min-w-[240px] border-none bg-transparent p-0 text-[22px] font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-faint sm:text-[26px]"
              placeholder="İçerik başlığı…"
              value={content.title ?? ''}
              onChange={(e) => editMaster({ title: e.target.value })}
            />
            <StatusPill status={content.status} />
            {saveState === 'saving' && <span className="hint inline-flex items-center gap-1"><Spinner size={12} /> Kaydediliyor…</span>}
            {saveState === 'saved' && <span className="hint inline-flex items-center gap-1 text-success"><Icon name="check" size={12} /> Kaydedildi</span>}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {content.brand.name} · sürüm {content.version} ·{' '}
            {content.scheduledFor ? `${formatDateTime(content.scheduledFor, timezone)} planlandı` : 'planlanmadı'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary btn-md" onClick={() => setSelOpen(true)}>
            <Icon name="grid" size={15} /> Platformlar ({targets.length})
          </button>
          <button className="btn-secondary btn-md" onClick={() => adaptAll()} disabled={adapting || targets.length === 0}>
            {adapting ? <Spinner size={15} /> : <Icon name="sparkles" size={15} />} AI ile Uyarla
          </button>
          <button className="btn-secondary btn-md" onClick={validate} disabled={validating || targets.length === 0}>
            {validating ? <Spinner size={15} /> : <Icon name="shield" size={15} />} Yayın Kontrolü
          </button>
          <button className="btn-ghost btn-md" onClick={() => setVersionsOpen(true)}>
            <Icon name="history" size={15} /> Sürüm Geçmişi
          </button>
          {schedulingEnabled && (
            <button className="btn-ghost btn-md" onClick={() => setSchedOpen(true)} disabled={targets.length === 0}>
              <Icon name="clock" size={15} /> Planla
            </button>
          )}
          {publishingEnabled && (
            <button className="btn-primary btn-md" onClick={() => setPublishOpen(true)} disabled={publishing || targets.length === 0}>
              {publishing ? <Spinner size={15} /> : <Icon name="send" size={15} />} Şimdi Yayınla
            </button>
          )}
        </div>
      </div>

      {!publishingEnabled && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-[12.5px] text-ink">
          <Icon name="info" size={15} className="text-info" />
          <span>
            {modules?.socialPublishing?.notice ??
              'Yayın modülü bu kurulumda kapalı. İçeriklerinizi hazırlayıp taslak olarak saklayabilirsiniz.'}
          </span>
        </div>
      )}
      {publishingEnabled && demoMode && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-[12.5px] text-ink">
          <Icon name="alert-triangle" size={15} className="text-warning" />
          <span><strong>Demo Modu —</strong> gerçek sosyal medya paylaşımı yapılmadı. Yayınlar simülasyon olarak işaretlenir.</span>
        </div>
      )}

      {/* Ana açıklama değişti: yeniden üretim seçenekleri (#20) */}
      {masterDirty && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between rounded-xl border px-4 py-3 border-warning/40 bg-warning/10">
          <div className="flex items-start gap-2">
            <Icon name="sparkles" size={17} className="text-warning mt-0.5 shrink-0" />
            <p className="text-[13px] font-medium text-ink">
              <b>Ana açıklama değiştirildi.</b> Platforma özel içerikler yeniden oluşturulsun mu?
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <button className="btn-ghost btn-sm" onClick={() => setAdaptedMaster(content.masterCaption)}>Mevcut Metinleri Koru</button>
            <button className="btn-outline btn-sm" onClick={adaptSelected} disabled={adapting}>Sadece Seçtiklerimi</button>
            <button className="btn-primary btn-sm" onClick={() => adaptAll(false)} disabled={adapting}>
              {adapting ? <Spinner size={13} /> : null} Tümünü Yeniden Oluştur
            </button>
          </div>
        </div>
      )}

      {/* Ön kontrol özeti */}
      {preflight && (
        <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${preflight.blocking ? 'border-danger/30 bg-danger/10' : 'border-success/30 bg-success/10'}`}>
          <Icon name={preflight.blocking ? 'alert-triangle' : 'check-circle'} size={18} className={preflight.blocking ? 'text-danger' : 'text-success'} />
          <p className="flex-1 text-[13px] font-medium text-ink">
            {preflight.headline}
            {preflight.phase1Mode && (preflight.publishingPending ?? 0) > 0 && (
              <span className="ml-1 text-ink-muted">
                · Yayın için gereken {preflight.publishingPending} koşul henüz sağlanmadı.
              </span>
            )}
          </p>
          <span className="hint">
            {preflight.phase1Mode
              ? `${preflight.contentReadyCount ?? preflight.readyCount}/${preflight.totalCount} hedef kurala uygun`
              : `${preflight.readyCount}/${preflight.totalCount} hedef yayına hazır`}
          </span>
        </div>
      )}

      {failedCount > 0 && publishingEnabled && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <Icon name="x-circle" size={18} className="text-danger" />
          <p className="flex-1 text-[13px] font-medium text-ink">{failedCount} hedef yayınlanamadı.</p>
          <button className="btn-secondary btn-sm" onClick={retryFailed}>
            <Icon name="refresh" size={13} /> Yeniden Dene
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[400px_1fr]">
        {/* Sol: master içerik */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:h-fit">
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <h2 className="section-title">Ana Açıklama</h2>
              <p className="section-sub">Tüm platformlar bu master metinden türetilir.</p>
            </header>
            <div className="p-4">
              <textarea
                className="textarea"
                rows={9}
                value={content.masterCaption}
                onChange={(e) => editMaster({ masterCaption: e.target.value })}
                placeholder="Ana açıklamanızı yazın…"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="hint">{charLength(content.masterCaption)} karakter</span>
                <span className="hint">Uyarlama: {ADAPT_LABELS[content.adaptState] ?? content.adaptState}</span>
              </div>

              <div className="mt-3 space-y-3 border-t border-line pt-3">
                <div>
                  <label className="label">Hikaye metni</label>
                  <input className="input" value={content.storyText ?? ''} onChange={(e) => editMaster({ storyText: e.target.value })} placeholder="Hikayeler için ayrı metin" />
                </div>
                <div>
                  <label className="label">Bağlantı</label>
                  <input className="input" value={content.linkUrl ?? ''} onChange={(e) => editMaster({ linkUrl: e.target.value })} placeholder="https://" />
                </div>
                <div>
                  <label className="label">Anlatım tarzı</label>
                  <select className="select" value={content.defaultStyle} onChange={(e) => editMaster({ defaultStyle: e.target.value })}>
                    {Object.entries(CONTENT_STYLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Master medya */}
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <h2 className="section-title">Master Medya</h2>
              <p className="section-sub">Orijinal korunur; varyantlar otomatik üretilir.</p>
            </header>
            <div className="p-4">
              {masterMedia ? (
                <div className="flex items-center gap-3">
                  <div className="checkerboard h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-subtle">
                    {masterMedia.publicUrl && masterMedia.kind !== 'VIDEO' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={masterMedia.publicUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-faint"><Icon name="video" size={20} /></span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{masterMedia.kind === 'VIDEO' ? 'Video' : 'Görsel'}</p>
                    <p className="text-[11.5px] text-ink-faint">{masterMedia.width}×{masterMedia.height}</p>
                  </div>
                </div>
              ) : (
                <p className="hint py-4 text-center">Bu içeriğe medya eklenmedi. Metin gönderisi olarak devam edebilirsiniz.</p>
              )}
            </div>
          </section>
        </aside>

        {/* Sağ: hedefler */}
        <div className="space-y-4">
          {targets.length === 0 ? (
            <div className="card p-6">
              <EmptyState
                icon="grid"
                title="Henüz platform seçilmedi"
                description="Bu içeriği hangi platform ve içerik türlerinde yayınlamak istediğinizi seçin."
                action={
                  <button className="btn-primary btn-md" onClick={() => setSelOpen(true)}>
                    <Icon name="plus" size={15} /> Platform Seç
                  </button>
                }
              />
            </div>
          ) : (
            targets.map((t) => (
              <TargetCard
                key={t.id}
                t={t}
                content={content}
                masterMedia={masterMedia}
                accounts={accounts.filter((a) => a.platform === t.platform)}
                preflightTarget={preflight?.targets.find((p) => p.platformContentId === t.id) ?? null}
                included={Boolean(included[t.id])}
                onToggleInclude={(v) => setIncluded((prev) => ({ ...prev, [t.id]: v }))}
                onEditCaption={(c) => editCaption(t, c)}
                onAssignAccount={(id) => assignAccount(t, id)}
                onAdapt={() => adaptOne(t)}
                onVisual={(patch) => saveVisual(t, patch)}
                onRendered={(out) => {
                  const src = t.mediaAsset ?? masterMedia;
                  if (src) handleVariantRendered(t, src, t.aspectRatio ?? t.rule?.recommendedAspectRatio ?? '1:1', out);
                }}
                variantState={variantStates[t.id]}
                demoMode={demoMode}
              />
            ))
          )}
        </div>
      </div>

      {/* Alt yayın çubuğu */}
      {targets.length > 0 && (
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-[13px] font-medium text-ink">
            {Object.values(included).filter(Boolean).length} hedef seçildi
            {preflight && (
              <span className="text-ink-faint">
                {' '}
                · {preflight.phase1Mode ? preflight.contentReadyCount ?? preflight.readyCount : preflight.readyCount}{' '}
                {preflight.phase1Mode ? 'hedef kurala uygun' : 'yayına hazır'}
              </span>
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className="btn-secondary btn-md" onClick={validate} disabled={validating}>
              {validating ? <Spinner size={14} /> : <Icon name="shield" size={14} />} Kontrol
            </button>
            {schedulingEnabled && (
              <button className="btn-ghost btn-md" onClick={() => setSchedOpen(true)}>
                <Icon name="clock" size={14} /> Planla
              </button>
            )}
            {publishingEnabled && (
              <button className="btn-primary btn-md" onClick={() => setPublishOpen(true)} disabled={publishing || targets.length === 0}>
                {publishing ? <Spinner size={14} /> : <Icon name="send" size={14} />} Şimdi Yayınla
              </button>
            )}
          </div>
        </div>
      )}

      {selOpen && (
        <SelectionModal
          platforms={platforms}
          accounts={accounts}
          accountsEnabled={accountsEnabled}
          targets={targets}
          onClose={() => setSelOpen(false)}
          onApply={applySelections}
        />
      )}

      {schedulingEnabled && schedOpen && (
        <ScheduleModal
          content={content}
          timezone={timezone}
          included={included}
          targets={targets}
          onClose={() => setSchedOpen(false)}
          onScheduled={() => {
            setSchedOpen(false);
            reload();
          }}
        />
      )}

      {publishingEnabled && publishOpen && (
        <PublishConfirmModal
          content={content}
          targets={targets}
          included={included}
          brand={content.brand ?? null}
          publishing={publishing}
          onClose={() => setPublishOpen(false)}
          onSchedule={() => {
            setPublishOpen(false);
            setSchedOpen(true);
          }}
          onPublish={async () => {
            setPublishOpen(false);
            await publishNow();
          }}
        />
      )}

      {versionsOpen && (
        <VersionHistoryModal contentId={content.id} onClose={() => setVersionsOpen(false)} onRestored={() => { setVersionsOpen(false); reload(); }} />
      )}
    </div>
  );
}

const ADAPT_LABELS: Record<string, string> = {
  NONE: 'uyarlanmadı',
  ADAPTING: 'uyarlanıyor',
  ADAPTED: 'uyarlandı',
  PARTIAL: 'kısmen uyarlandı',
  ERROR: 'hata'
};

function metaName(platform: string) {
  return PLATFORM_META[platform as PlatformCode]?.name ?? platform;
}

/* ------------------------------------------------------------- TargetCard */
function TargetCard({
  t,
  content,
  masterMedia,
  accounts,
  preflightTarget,
  included,
  onToggleInclude,
  onEditCaption,
  onAssignAccount,
  onAdapt,
  onVisual,
  onRendered,
  variantState,
  demoMode
}: {
  t: Target;
  content: ContentDetail;
  masterMedia: MediaAsset | null;
  accounts: Account[];
  preflightTarget: PreflightTarget | null;
  included: boolean;
  onToggleInclude: (v: boolean) => void;
  onEditCaption: (c: string) => void;
  onAssignAccount: (id: string | null) => void;
  onAdapt: () => void;
  onVisual: (patch: { focalPoint?: any; aspectRatio?: string; cropMode?: string }) => void;
  /** Canvas'ta üretilen varyantın kaydedilmesi için üst bileşene bildirilir (§43). */
  onRendered: (out: { dataUrl: string; width: number; height: number; bytes: number }) => void;
  variantState?: 'saving' | 'saved' | 'error';
  demoMode: boolean;
}) {
  const [showChecks, setShowChecks] = useState(false);
  const limit = t.rule?.maxCaptionLength ?? t.charLimit;
  const used = charLength(t.caption);
  const over = used > limit;
  const near = !over && used > limit * 0.9;
  const sourceMedia = t.mediaAsset ?? masterMedia;
  const ratio = t.aspectRatio ?? t.rule?.recommendedAspectRatio ?? '1:1';
  const errors = preflightTarget?.checks.filter((c) => c.level === 'ERROR') ?? [];
  const warnings = preflightTarget?.checks.filter((c) => c.level === 'WARNING') ?? [];
  // INFO satırları: ilgili modül bir sonraki fazda açılacağı için bilgilendirir.
  const infos = preflightTarget?.checks.filter((c) => c.level === 'INFO') ?? [];

  return (
    <section className={`card overflow-hidden ${included ? '' : 'opacity-70'}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Switch checked={included} onChange={onToggleInclude} />
        <PlatformIcon platform={t.platform} size={24} rounded="md" />
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-ink">
            {metaName(t.platform)} · {CONTENT_TYPE_LABELS[t.contentType] ?? t.contentType}
          </p>
          <p className="text-[11.5px] text-ink-faint">
            {t.captionSource === 'AI' ? 'AI uyarlaması' : t.captionSource === 'MANUAL' ? 'Elle düzenlendi' : t.captionSource === 'ORIGINAL' ? 'Orijinal' : 'Bekliyor'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={t.status} />
          {t.socialAccount?.demoAccount && <Badge tone="warning">Demo</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[200px_1fr]">
        {/* Önizleme */}
        <div>
          <VariantPreview
            src={sourceMedia?.publicUrl ?? null}
            sourceWidth={sourceMedia?.width ?? null}
            sourceHeight={sourceMedia?.height ?? null}
            kind={sourceMedia?.kind ?? 'IMAGE'}
            rule={t.rule}
            ratio={ratio}
            focalPoint={t.focalPoint}
            cropMode={(t.cropMode as any) ?? 'SMART'}
            editable
            onFocalChange={(fp) => onVisual({ focalPoint: fp })}
            onRendered={onRendered}
          />
          {variantState ? (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
              {variantState === 'saving' ? (
                <>
                  <Spinner size={11} /> Varyant kaydediliyor…
                </>
              ) : variantState === 'saved' ? (
                <>
                  <Icon name="check" size={12} className="text-success" /> Varyant kaydedildi
                </>
              ) : (
                <>
                  <Icon name="alert-triangle" size={12} className="text-danger" /> Varyant kaydedilemedi
                </>
              )}
            </p>
          ) : null}
          {t.rule && t.rule.supportedAspectRatios.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {t.rule.supportedAspectRatios.map((r) => (
                <button
                  key={r}
                  onClick={() => onVisual({ aspectRatio: r })}
                  className={`chip ${r === ratio ? 'chip-active' : ''}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <select
            className="select mt-2 w-full"
            value={t.socialAccountId ?? ''}
            onChange={(e) => onAssignAccount(e.target.value || null)}
          >
            <option value="">Hesap seçilmedi</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.handle} {a.connectionStatus !== 'ACTIVE' ? '(bağlı değil)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Açıklama */}
        <div className="min-w-0">
          <textarea
            className="textarea"
            rows={6}
            value={t.caption}
            onChange={(e) => onEditCaption(e.target.value)}
            placeholder="Bu platform için uyarlanmış açıklama…"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`text-[12px] font-semibold ${over ? 'text-danger' : near ? 'text-warning' : 'text-ink-faint'}`}>
              {used}/{limit}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (used / limit) * 100)}%`, background: over ? 'var(--danger)' : near ? 'var(--warning)' : 'var(--brand-600)' }} />
            </div>
            {over && <Badge tone="danger">Sınır aşıldı</Badge>}
            <button className="btn-ghost btn-sm ml-auto" onClick={onAdapt}>
              <Icon name="sparkles" size={13} /> Yeniden uyarla
            </button>
          </div>

          {t.hashtags && (
            <p className="mt-2 text-[12px] text-ink-muted">
              <span className="font-semibold text-ink-faint">Etiketler:</span> {t.hashtags}
            </p>
          )}
          {t.firstComment && (
            <p className="mt-1 text-[12px] text-ink-muted">
              <span className="font-semibold text-ink-faint">İlk yorum:</span> {t.firstComment}
            </p>
          )}

          {t.lastError && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[12px] text-danger">
              <Icon name="alert-triangle" size={13} className="mt-0.5" /> {t.lastError}
            </p>
          )}
          {t.permalink && (
            <a href={t.permalink} target="_blank" rel="noreferrer" className="link mt-2 inline-flex items-center gap-1 text-[12px]">
              <Icon name="globe" size={12} /> Yayınlanan gönderiyi gör
            </a>
          )}

          {/* Ön kontrol satırları */}
          {(errors.length > 0 || warnings.length > 0 || infos.length > 0) && (
            <div className="mt-2">
              <button className="btn-ghost btn-sm" onClick={() => setShowChecks((s) => !s)}>
                <Icon
                  name={errors.length ? 'alert-triangle' : 'info'}
                  size={13}
                  className={errors.length ? 'text-danger' : warnings.length ? 'text-warning' : 'text-info'}
                />
                {errors.length > 0 && <>{errors.length} hata, </>}
                {warnings.length} uyarı{infos.length > 0 && <>, {infos.length} bilgi</>}
                <Icon name={showChecks ? 'chevronDown' : 'chevronRight'} size={13} />
              </button>
              {showChecks && (
                <ul className="mt-1 space-y-1">
                  {[...errors, ...warnings].map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink-muted">
                      <Icon name={c.level === 'ERROR' ? 'x-circle' : 'alert-triangle'} size={12} className={`mt-0.5 ${c.level === 'ERROR' ? 'text-danger' : 'text-warning'}`} />
                      {c.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- SelectionModal */
function SelectionModal({
  platforms,
  accounts,
  accountsEnabled,
  targets,
  onClose,
  onApply
}: {
  platforms: PlatformDef[];
  accounts: Account[];
  accountsEnabled: boolean;
  targets: Target[];
  onClose: () => void;
  onApply: (sel: { platform: string; contentType: string; accountId: string | null }[]) => void;
}) {
  const [sel, setSel] = useState<{ platform: string; contentType: string; accountId: string | null }[]>(
    targets.filter((t) => t.enabled).map((t) => ({ platform: t.platform, contentType: t.contentType, accountId: t.socialAccountId }))
  );

  function toggle(platform: string, contentType: string) {
    setSel((prev) => {
      const exists = prev.some((s) => s.platform === platform && s.contentType === contentType);
      if (exists) return prev.filter((s) => !(s.platform === platform && s.contentType === contentType));
      const first = accounts.find((a) => a.platform === platform && a.connectionStatus === 'ACTIVE');
      return [...prev, { platform, contentType, accountId: first?.id ?? null }];
    });
  }

  const locked = new Set(targets.filter((t) => ['PUBLISHED', 'PUBLISHING'].includes(t.status)).map((t) => `${t.platform}:${t.contentType}`));

  return (
    <Modal
      open
      onClose={onClose}
      title="Platform ve İçerik Türleri"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <span className="hint">{sel.length} hedef seçildi</span>
          <div className="flex gap-2">
            <button className="btn-secondary btn-md" onClick={onClose}>Vazgeç</button>
            <button className="btn-primary btn-md" onClick={() => onApply(sel)}>Uygula</button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {!accountsEnabled && (
          <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-[12.5px] text-ink">
            Hesap bağlama bu kurulumda kapalı. Hedefleri hesap
            seçmeden de hazırlayabilirsiniz.
          </p>
        )}
        {platforms.map((p) => (
          <div key={p.code} className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2">
              <PlatformIcon platform={p.code} size={22} rounded="md" />
              <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
              {!accounts.some((a) => a.platform === p.code) && (
                <Badge tone="warning">{accountsEnabled ? 'Bağlı hesap yok' : 'Hesap bağlama kapalı'}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {p.contentTypes.map((ct) => {
                const key = `${p.code}:${ct.code}`;
                const active = sel.some((s) => s.platform === p.code && s.contentType === ct.code);
                const isLocked = locked.has(key);
                return (
                  <button
                    key={ct.code}
                    disabled={isLocked}
                    onClick={() => toggle(p.code, ct.code)}
                    className={`chip ${active ? 'chip-active' : ''} ${isLocked ? 'opacity-60' : ''}`}
                    style={active ? { background: p.color, borderColor: p.color, color: '#fff' } : undefined}
                    title={isLocked ? 'Yayınlanmış hedef kaldırılamaz' : undefined}
                  >
                    {active && <Icon name="check" size={12} />} {ct.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- ScheduleModal */
function ScheduleModal({
  content,
  timezone,
  included,
  targets,
  onClose,
  onScheduled
}: {
  content: ContentDetail;
  timezone: string;
  included: Record<string, boolean>;
  targets: Target[];
  onClose: () => void;
  onScheduled: () => void;
}) {
  const toast = useToast();
  const [when, setWhen] = useState(() =>
    toLocalInputValue(content.scheduledFor ? new Date(content.scheduledFor) : new Date(Date.now() + 3600_000), timezone)
  );
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ label: string; iso: string; basedOnData: boolean }[]>([]);
  const targetIds = targets.filter((t) => included[t.id]).map((t) => t.id);

  async function suggest() {
    setSuggesting(true);
    try {
      const res = await api.post<{ slots: { label: string; iso: string | null; basedOnData: boolean }[] }>('/api/ai/timing', {
        timezone,
        count: 5
      });
      setSuggestions(res.slots.filter((s) => s.iso).map((s) => ({ label: s.label, iso: s.iso!, basedOnData: s.basedOnData })));
    } catch (e) {
      toast.error('Öneri alınamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setSuggesting(false);
    }
  }

  async function schedule() {
    if (targetIds.length === 0) {
      toast.error('Hedef seçilmedi', 'En az bir hedef işaretleyin.');
      return;
    }
    setBusy(true);
    try {
      const iso = zonedTimeToUtc(when, timezone).toISOString();
      await api.post(`/api/contents/${content.id}/schedule`, { scheduledFor: iso, targetIds, timezone });
      toast.success('Planlandı', `${formatDateTime(iso, timezone)} için kuyruğa alındı.`);
      onScheduled();
    } catch (e) {
      toast.error('Planlanamadı', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelSchedule() {
    setBusy(true);
    try {
      await api.post(`/api/contents/${content.id}/schedule`, { cancel: true });
      toast.success('Planlama iptal edildi');
      onScheduled();
    } catch (e) {
      toast.error('İptal edilemedi', e instanceof ApiError ? e.message : 'Beklenmeyen hata.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Yayını Planla"
      footer={
        <div className="flex justify-between gap-2">
          {content.scheduledFor && (
            <button className="btn-danger btn-md" onClick={cancelSchedule} disabled={busy}>Planlamayı İptal Et</button>
          )}
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary btn-md" onClick={onClose}>Vazgeç</button>
            <button className="btn-primary btn-md" onClick={schedule} disabled={busy}>
              {busy ? 'Planlanıyor…' : 'Planla'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Tarih ve saat</label>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          <p className="hint mt-1">Zaman dilimi: {timezone} · {targetIds.length} hedef planlanacak</p>
        </div>

        <div className="border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">AI zaman önerileri</p>
            <button className="btn-ghost btn-sm" onClick={suggest} disabled={suggesting}>
              {suggesting ? <Spinner size={13} /> : <Icon name="sparkles" size={13} />} Öner
            </button>
          </div>
          {suggestions.length === 0 ? (
            <p className="hint">Etkileşim verinize göre en uygun zamanları önerir. Gerçek veri yoksa genel en iyi uygulamalar kullanılır.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="chip"
                  onClick={() => setWhen(toLocalInputValue(new Date(s.iso), timezone))}
                  title={s.basedOnData ? 'Gerçek etkileşim verisine dayalı' : 'Genel en iyi uygulama'}
                >
                  <Icon name={s.basedOnData ? 'chart' : 'clock'} size={12} /> {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ========================================================================= */
/* PublishConfirmModal — yayınlama onayı (#22)                                */
/* ========================================================================= */
function PublishConfirmModal({
  content,
  targets,
  included,
  brand,
  publishing,
  onClose,
  onSchedule,
  onPublish
}: {
  content: any;
  targets: any[];
  included: Record<string, boolean>;
  brand: { name: string } | null;
  publishing: boolean;
  onClose: () => void;
  onSchedule: () => void;
  onPublish: () => void;
}) {
  const selected = targets.filter((t) => included[t.id] && t.enabled);
  const platformSet = Array.from(new Set(selected.map((t) => t.platform)));
  const destinations = platformSet.map((p) => metaName(p)).join(', ');
  const mediaCount = (content.media ?? []).length;
  const noCaption = selected.filter((t) => !(t.caption ?? '').trim()).length;

  return (
    <Modal open onClose={onClose} size="lg" title="Paylaşımı Onayla" description="Yayınlamadan önce hedefleri son bir kez gözden geçirin.">
      <div className="space-y-3">
        <Row label="Marka" value={brand?.name ?? '—'} />
        <Row label="Medya" value={`${mediaCount} medya öğesi`} />
        <Row label="Platform" value={`${platformSet.length} platform`} />
        <Row label="Toplam yayın" value={`${selected.length} gönderi`} />
        <div className="pt-1">
          <p className="text-xs text-ink-faint mb-1.5">Hedefler</p>
          <div className="space-y-1.5">
            {selected.length === 0 && <p className="text-sm text-ink-faint">Seçili hedef yok.</p>}
            {selected.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-alt/40 px-3 py-2">
                <PlatformIcon platform={t.platform} />
                <span className="text-sm font-medium text-ink">{metaName(t.platform)}</span>
                <span className="text-[11px] text-ink-faint">{t.contentTypeLabel}</span>
                <span className="ml-auto text-[11px] tabular-nums text-ink-faint">{t.charactersUsed ?? charLength(t.caption ?? '')}/{t.maxChars}</span>
              </div>
            ))}
          </div>
        </div>
        {noCaption > 0 && (
          <p className="text-[12px] text-warning font-medium">
            <Icon name="alert-triangle" size={13} className="inline mr-1 align-[-2px]" />
            {noCaption} hedefte açıklama boş. Boş gönderiler yayınlanamaz.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button className="btn-ghost btn-md" onClick={onClose}>İptal</button>
        <button className="btn-ghost btn-md" onClick={onClose}>Taslak Kaydet</button>
        <button className="btn-outline btn-md" onClick={onSchedule}><Icon name="clock" size={14} /> Planla</button>
        <button className="btn-primary btn-md" onClick={onPublish} disabled={publishing || selected.length === 0 || noCaption > 0}>
          {publishing ? <Spinner size={14} /> : <Icon name="send" size={14} />} {selected.length} İçeriği Şimdi Yayınla
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface-alt/40 px-3 py-2">
      <span className="text-[13px] text-ink-faint">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}

/* ========================================================================= */
/* VersionHistoryModal — sürüm geçmişi (#39)                                  */
/* ========================================================================= */
function VersionHistoryModal({ contentId, onClose, onRestored }: { contentId: string; onClose: () => void; onRestored: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [openPayload, setOpenPayload] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ items: any[] }>(`/api/contents/${contentId}/versions`);
      setItems(d.items ?? []);
    } catch (e) {
      toast.error('Sürümler yüklenemedi', e instanceof ApiError ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [contentId]);
  useEffect(() => { load(); }, [load]);

  const KIND: Record<string, string> = { ORIGINAL: 'Orijinal', AI_ADAPTED: 'AI Uyarlaması', MANUAL: 'Manuel', RESTORED: 'Geri Alındı' };
  const KIND_TONE: Record<string, string> = { ORIGINAL: 'neutral', AI_ADAPTED: 'brand', MANUAL: 'info', RESTORED: 'success' };

  async function restore(version: number) {
    setBusy(version);
    try {
      await api.post(`/api/contents/${contentId}/restore-version`, { version });
      toast.success('Sürüm geri alındı', `v${version} içeriğe uygulandı.`);
      onRestored();
    } catch (e) {
      toast.error('Geri alınamadı', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title="Sürüm Geçmişi" description="İçeriğin önceki sürümlerini görüntüleyin ve geri alın.">
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-faint">Henüz sürüm kaydı yok.</div>
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <div key={v.id} className="rounded-xl border border-line bg-surface-alt/30">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <Badge tone={(KIND_TONE[v.kind] ?? 'neutral') as any}>{KIND[v.kind] ?? v.kind}</Badge>
                <span className="text-sm font-semibold text-ink">v{v.version}</span>
                {v.note && <span className="text-[12px] text-ink-faint">{v.note}</span>}
                <span className="ml-auto text-[12px] text-ink-faint">{formatDateTime(v.createdAt)}</span>
                <button className="btn-ghost btn-sm" onClick={() => setOpenPayload(openPayload === v.version ? null : v.version)}>
                  {openPayload === v.version ? 'Gizle' : 'Önizle'}
                </button>
                <button className="btn-outline btn-sm" onClick={() => restore(v.version)} disabled={busy !== null}>
                  {busy === v.version ? <Spinner size={13} /> : <Icon name="history" size={13} />} Geri Al
                </button>
              </div>
              {openPayload === v.version && v.payload && (
                <div className="border-t border-line px-3 py-2.5 space-y-2">
                  <div>
                    <p className="text-[11px] text-ink-faint mb-1">Ana Açıklama</p>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 text-[12px] text-ink-soft">{v.payload.masterCaption || '(boş)'}</pre>
                  </div>
                  {Array.isArray(v.payload.platformContents) && v.payload.platformContents.length > 0 && (
                    <div>
                      <p className="text-[11px] text-ink-faint mb-1">Platform İçerikleri</p>
                      <div className="space-y-1">
                        {v.payload.platformContents.slice(0, 12).map((p: any, i: number) => (
                          <div key={i} className="rounded-lg border border-line bg-surface p-2">
                            <p className="text-[11px] font-medium text-ink">{metaName(p.platform)} · {p.contentType}</p>
                            <p className="line-clamp-2 text-[12px] text-ink-faint">{p.caption || '(boş)'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
