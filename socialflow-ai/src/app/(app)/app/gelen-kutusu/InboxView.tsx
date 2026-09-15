'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/ui/Icon';
import { PLATFORM_META, type PlatformCode } from '@/lib/platforms/platforms';
import { CONVERSATION_STATUSES, CONVERSATION_TYPES, PRIORITIES, type InboxDetail, type InboxOptions, type InboxSummary } from '@/lib/inbox/contracts';
import type { EngagementCapabilities } from '@/lib/social/engagement';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600';
const primary = `${button} !border-violet-700 !bg-violet-700 !text-white hover:!bg-violet-800`;
const label = (map: Record<string, string>, key: string) => map[key] || key;
const platformName = (key: string) => PLATFORM_META[key as PlatformCode]?.name ?? key;
const date = (value: string) => new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function Select({ title, value, onChange, entries, empty = 'Tümü', disabled = false }: { title: string; value: string; onChange: (value: string) => void; entries: [string, string][]; empty?: string | null; disabled?: boolean }) {
  return <label className="block min-w-0 text-xs font-medium text-slate-600">{title}<select className={`${field} mt-1`} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{empty !== null && <option value="">{empty}</option>}{entries.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
export function InboxView({ options, capabilities }: { options: InboxOptions; capabilities: EngagementCapabilities }) {
  const [items, setItems] = useState<InboxSummary[]>([]), [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(''), [detail, setDetail] = useState<InboxDetail | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({}), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [threadLoading, setThreadLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [refreshed, setRefreshed] = useState('');
  const [showCreate, setShowCreate] = useState(false), [showContext, setShowContext] = useState(false);
  const [note, setNote] = useState(''), [mention, setMention] = useState(''), [tag, setTag] = useState('');
  const [pendingEvent, setPendingEvent] = useState(''), [polling, setPolling] = useState(false);
  const listSequence = useRef(0), threadSequence = useRef(0);
  const setFilter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };
  const load = useCallback(async () => {
    const sequence = ++listSequence.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ ...filters, page: String(page) });
      const result = await api.get<{ items: InboxSummary[]; total: number }>(`/api/inbox?${query}`);
      if (sequence !== listSequence.current) return;
      setItems(result.items); setTotal(result.total); setRefreshed(new Date().toLocaleTimeString('tr-TR')); setError('');
    } catch (e) { if (sequence === listSequence.current) setError(e instanceof Error ? e.message : 'Konuşmalar yüklenemedi.'); }
    finally { if (sequence === listSequence.current) setLoading(false); }
  }, [filters, page]);
  const loadThread = useCallback(async (id: string) => {
    const sequence = ++threadSequence.current;
    setThreadLoading(true);
    try {
      const result = await api.get<InboxDetail>(`/api/inbox/${id}`);
      if (sequence === threadSequence.current) setDetail(result);
    } catch (e) { if (sequence === threadSequence.current) { setDetail(null); setError(e instanceof Error ? e.message : 'Konuşma yüklenemedi.'); } }
    finally { if (sequence === threadSequence.current) setThreadLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('conversation'); if (id) setSelected(id); }, []);
  useEffect(() => { setDetail(null); setNote(''); setMention(''); setTag(''); setShowContext(false); if (selected) void loadThread(selected); else ++threadSequence.current; }, [selected, loadThread]);
  useEffect(() => {
    if (!pendingEvent || !polling) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>, attempts = 0;
    const poll = async () => {
      try {
        const event = await api.get<{ status: string; conversationId: string | null; failed: boolean }>(`/api/inbox/events/${pendingEvent}`);
        if (cancelled) return;
        if (event.status === 'DONE' && event.conversationId) {
          setSelected(event.conversationId); setPendingEvent(''); setPolling(false); setNotice('Etkileşim kaydedildi. Sosyal ağa hiçbir mesaj gönderilmedi.'); void load(); return;
        }
        if (event.failed) { setPolling(false); setError('Olay işlenemedi. Kayıt korundu; yönetici iş kuyruğunu incelemeli.'); return; }
        if (++attempts >= 15) { setPolling(false); setNotice('Kayıt kuyrukta korunuyor. İşçinin çalıştığından emin olup durumu tekrar kontrol edin.'); return; }
        timer = setTimeout(poll, 2000);
      } catch (e) { if (!cancelled) { setPolling(false); setError(e instanceof Error ? e.message : 'Olay durumu alınamadı.'); } }
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [pendingEvent, polling, load]);
  async function mutate(action: string, value?: unknown, mentionUserIds?: string[]) {
    if (!detail || busy) return;
    const id = detail.id;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.patch(`/api/inbox/${id}`, { action, value, mentionUserIds, version: detail.version });
      if (action === 'note') { setNote(''); setMention(''); }
      if (action === 'tag') setTag('');
      setNotice(action === 'note' ? 'İç not kaydedildi. Müşteriye veya sosyal ağa gönderilmedi.' : 'Değişiklik kaydedildi.');
      await Promise.all([loadThread(id), load()]);
    } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); await loadThread(id); }
    finally { setBusy(false); }
  }
  const platformOptions = Array.from(new Set(options.accounts.map(a => a.platform))).map(p => [p, platformName(p)] as [string, string]);
  return <div className="mx-auto max-w-[1700px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-1 text-xs font-semibold uppercase tracking-widest text-violet-700">Topluluk ve müşteri iletişimi</div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Gelen Kutusu</h1><p className="mt-1 text-sm text-slate-600">Konuşmaları takip edin, ekibinize atayın ve birlikte çözün.</p></div>
      <div className="flex gap-2"><button className={button} onClick={() => { void load(); if (selected) void loadThread(selected); }} disabled={loading || busy}><Icon name="refresh" size={16} />Yenile</button>{options.canManage && <button className={primary} onClick={() => setShowCreate(v => !v)} aria-expanded={showCreate}><Icon name="plus" size={16} />Etkileşim Ekle</button>}</div>
    </header>
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><Icon name="info" size={20} /><div><strong>Bağlantı durumu: Elle kayıt</strong><p className="mt-1">Sosyal ağlardan otomatik mesaj alımı henüz etkin değil. Yalnızca sizin eklediğiniz etkileşimler gösterilir. Yayınlama bağlantılarınız bundan bağımsızdır.</p></div></div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    {pendingEvent && <div className="flex items-center gap-3 text-sm text-slate-600" role="status">{polling ? 'Etkileşim işleniyor…' : 'Kuyrukta bekleyen kayıt var.'}<button className={button} onClick={() => setPolling(true)} disabled={polling}>Durumu Kontrol Et</button></div>}
    {showCreate && <CreateInteraction options={options} onClose={() => setShowCreate(false)} onCreated={id => { setShowCreate(false); setPendingEvent(id); setPolling(true); setNotice('Elle eklenen etkileşim güvenli iş kuyruğuna alındı.'); }} />}
    <section aria-label="Konuşma filtreleri" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="text-xs font-medium text-slate-600">Konuşmalarda ara<input className={`${field} mt-1`} placeholder="Müşteri, mesaj veya etiket…" maxLength={200} value={filters.q || ''} onChange={e => setFilter('q', e.target.value)} /></label>
        <Select title="Platform" value={filters.platform || ''} onChange={v => setFilter('platform', v)} entries={platformOptions} />
        <Select title="Marka" value={filters.brand || ''} onChange={v => setFilter('brand', v)} entries={options.brands.map(b => [b.id, b.name])} />
        <Select title="Durum" value={filters.status || ''} onChange={v => setFilter('status', v)} entries={Object.entries(CONVERSATION_STATUSES)} />
        <Select title="Atanan kişi" value={filters.assigned || ''} onChange={v => setFilter('assigned', v)} entries={[["me", 'Bana atananlar'], ['none', 'Atanmamış'], ...options.users.map(u => [u.id, u.name] as [string, string])]} />
      </div>
      <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">Diğer filtreler</summary><div className="mt-3 grid items-end gap-3 sm:grid-cols-4"><Select title="Öncelik" value={filters.priority || ''} onChange={v => setFilter('priority', v)} entries={Object.entries(PRIORITIES)} /><Select title="Etkileşim türü" value={filters.type || ''} onChange={v => setFilter('type', v)} entries={Object.entries(CONVERSATION_TYPES)} /><Select title="Hesap" value={filters.account || ''} onChange={v => setFilter('account', v)} entries={options.accounts.map(a => [a.id, a.handle])} /><label className="flex items-center gap-2 py-2"><input type="checkbox" checked={filters.unread === 'true'} onChange={e => setFilter('unread', e.target.checked ? 'true' : '')} />Yalnızca okunmamış</label></div></details>
      {Object.values(filters).some(Boolean) && <button className="mt-3 text-sm font-medium text-violet-700 underline" onClick={() => { setFilters({}); setPage(1); }}>Filtreleri temizle</button>}
    </section>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:grid xl:grid-cols-[minmax(240px,0.9fr)_minmax(320px,1.6fr)_minmax(230px,0.8fr)]">
      <section aria-label="Konuşma listesi" aria-busy={loading} className={`${selected ? 'hidden xl:block' : ''} min-w-0 border-r border-slate-200`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4"><h2 className="text-sm font-semibold">Konuşmalar <span className="ml-1 rounded-full bg-slate-100 px-2 py-1 text-slate-600">{total}</span></h2><span className="text-xs text-slate-500">{loading ? 'Yükleniyor…' : 'Güncel kayıtlar'}</span></div>
        <div className="max-h-[680px] min-h-[300px] overflow-y-auto">{items.length ? items.map(item => <button key={item.id} disabled={busy} onClick={() => setSelected(item.id)} aria-current={selected === item.id ? 'true' : undefined} className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${selected === item.id ? 'border-l-4 border-l-violet-600 bg-violet-50' : ''}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-900">{item.participant.displayName}</span><span className="shrink-0 text-[11px] text-slate-500">{date(item.lastMessageAt)}</span></div><div className="mt-1 text-xs text-violet-700">{platformName(item.provider)} · {label(CONVERSATION_TYPES, item.type)}</div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.messages[0]?.text}</p><div className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{label(CONVERSATION_STATUSES, item.status)}</span><span className={`rounded px-2 py-1 ${item.priority === 'URGENT' ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-800'}`}>{label(PRIORITIES, item.priority)}</span>{item._count.messages > 0 && <span className="rounded bg-violet-100 px-2 py-1 text-violet-800">{item._count.messages} okunmamış</span>}</div><p className="mt-2 truncate text-xs text-slate-500">{item.brand.name} · {options.users.find(u => u.id === item.assignedTo)?.name || 'Atanmamış'}</p></button>) : !loading && <div className="px-5 py-16 text-center"><Icon name="inbox" size={36} className="mx-auto text-slate-400" /><h3 className="mt-3 font-semibold text-slate-800">Henüz konuşma yok</h3><p className="mt-2 text-sm text-slate-500">Filtreleri değiştirin veya yetkiniz varsa bir etkileşim ekleyin.</p></div>}</div>
        <div className="flex items-center justify-between border-t border-slate-200 p-3"><button className={button} disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Önceki</button><span className="text-xs">{page}. sayfa</span><button className={button} disabled={page * 30 >= total || loading} onClick={() => setPage(p => p + 1)}>Sonraki</button></div>
      </section>
      <section aria-label="Konuşma akışı" aria-busy={threadLoading} className={`${!selected ? 'hidden xl:flex' : 'flex'} min-w-0 flex-col bg-slate-50/60`}>
        {!detail || threadLoading ? <div className="flex min-h-[550px] flex-1 flex-col items-center justify-center p-8 text-center"><Icon name="inbox" size={44} className="text-violet-300" /><h2 className="mt-4 text-lg font-semibold text-slate-800">{threadLoading ? 'Konuşma yükleniyor…' : 'Her konuşma, tek bir yerde'}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">Mesajları ve ekip içi notları görmek için listeden bir konuşma seçin.</p>{selected && <button className={`${button} mt-4 xl:hidden`} onClick={() => setSelected('')}>Listeye Dön</button>}</div> : <>
          <div className="border-b border-slate-200 bg-white p-4"><div className="mb-3 flex justify-between xl:hidden"><button className={button} onClick={() => setSelected('')}>← Liste</button><button className={button} onClick={() => setShowContext(v => !v)}>Müşteri Bilgisi</button></div><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-slate-900">{detail.participant.displayName}</h2><p className="mt-1 text-xs text-slate-500">{platformName(detail.provider)} · {detail.account.handle}</p></div>{options.canManage && <button className={button} disabled={busy || detail.status === 'RESOLVED'} onClick={() => void mutate('status', 'RESOLVED')}><Icon name="check" size={16} />Çöz</button>}</div><div className="mt-3 flex items-center justify-between gap-2"><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Elle eklenen kayıt · API verisi değil</span>{options.canManage && detail._count.messages > 0 && <button className="text-xs font-medium text-violet-700 underline" disabled={busy} onClick={() => void mutate('read')}>Okundu İşaretle</button>}</div></div>
          <div className="flex max-h-[480px] min-h-[260px] flex-1 flex-col gap-4 overflow-y-auto p-5" role="log" aria-label="Mesajlar ve iç notlar">{detail.messages.map(message => <article key={message.id} className={`max-w-[94%] rounded-xl border p-4 ${message.direction === 'INTERNAL' ? 'self-end border-amber-200 bg-amber-50' : 'self-start border-slate-200 bg-white'}`}><div className="mb-2 flex flex-wrap items-center gap-3 text-xs"><strong className="text-slate-700">{message.sender}</strong><span className="text-slate-500">{date(message.sentAt)}</span></div>{message.direction === 'INTERNAL' && <p className="mb-2 text-xs font-semibold text-amber-900">İç Not — müşteriye gönderilmez</p>}<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{message.text}</p></article>)}</div>
          <div className="border-t border-slate-200 bg-white p-4"><p className="mb-3 rounded-lg bg-slate-100 p-3 text-xs leading-5 text-slate-600">{capabilities.limitation}</p>{options.canManage ? <form onSubmit={e => { e.preventDefault(); void mutate('note', note, mention ? [mention] : []); }}><label className="text-sm font-semibold text-amber-900" htmlFor="inbox-note">İç Not Ekle</label><textarea id="inbox-note" className={`${field} mt-2 min-h-[95px]`} placeholder="Yalnızca ekibinizin göreceği bir not yazın…" maxLength={5000} value={note} onChange={e => setNote(e.target.value)} required disabled={busy} /><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div className="min-w-[160px]"><Select title="@ Ekip üyesinden bahset" value={mention} onChange={id => { setMention(id); const user = options.users.find(u => u.id === id); if (user && !note.includes(`@${user.name}`)) setNote(n => `${n}${n ? ' ' : ''}@${user.name} `); }} entries={options.users.map(u => [u.id, u.name])} empty="Bildirim gönderme" disabled={busy} /></div><button className={primary} disabled={busy || !note.trim()}>İç Notu Kaydet</button></div></form> : <p className="text-sm text-slate-500">Görüntüleme yetkisiyle bağlısınız. Düzenleme için çalışma alanı yöneticinizle görüşün.</p>}</div>
        </>}
      </section>
      <aside aria-label="Müşteri ve konuşma bilgisi" className={`${showContext ? 'block' : 'hidden xl:block'} min-w-0 border-l border-slate-200 bg-white p-4`}>
        {detail && !threadLoading ? <div className="space-y-5"><div><h2 className="text-sm font-semibold text-slate-900">Müşteri Bilgisi</h2><div className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-700">{detail.participant.displayName.slice(0, 1).toLocaleUpperCase('tr')}</div><p className="mt-3 font-semibold text-slate-800">{detail.participant.displayName}</p><p className="mt-1 text-xs leading-5 text-slate-500">Elle girilmiş kimlik. Başka hesaplarla otomatik birleştirilmez.</p></div>
          <div className="border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Marka</p><Link className="mt-1 block text-sm font-medium text-violet-700 underline" href={`/marka-kiti/${detail.brand.id}`}>{detail.brand.name} → Marka Kiti</Link><p className="mt-3 text-xs text-slate-500">Hesap</p><p className="mt-1 text-sm text-slate-800">{detail.account.displayName}</p></div>
          <Select title="Durum" value={detail.status} onChange={v => void mutate('status', v)} entries={Object.entries(CONVERSATION_STATUSES)} empty={null} disabled={!options.canManage || busy} />
          <Select title="Öncelik" value={detail.priority} onChange={v => void mutate('priority', v)} entries={Object.entries(PRIORITIES)} empty={null} disabled={!options.canManage || busy} />
          <div><Select title="Kişiye Ata" value={detail.assignedTo || ''} onChange={v => void mutate('assign', v || null)} entries={options.users.map(u => [u.id, u.name])} empty="Atanmamış" disabled={!options.canManage || busy} />{options.canManage && <button className="mt-2 text-xs font-medium text-violet-700 underline" onClick={() => void mutate('assign', options.userId)} disabled={busy}>Kendime Ata</button>}</div>
          <div><h3 className="text-xs font-semibold text-slate-600">Etiketler</h3><div className="mt-2 flex flex-wrap gap-2">{detail.tags.map(t => <span key={t.name} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{t.name}{options.canManage && <button aria-label={`${t.name} etiketini kaldır`} className="ml-2 font-bold" onClick={() => void mutate('removeTag', t.name)} disabled={busy}>×</button>}</span>)}{detail.tags.length === 0 && <span className="text-xs text-slate-400">Etiket eklenmedi.</span>}</div>{options.canManage && <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); void mutate('tag', tag); }}><input className={field} aria-label="Yeni etiket" placeholder="Satış, Destek…" value={tag} onChange={e => setTag(e.target.value)} maxLength={40} required disabled={busy} /><button className={button} disabled={busy || !tag.trim()} aria-label="Etiket ekle">+</button></form>}</div>
          <div className="border-t border-slate-100 pt-4"><h3 className="text-xs font-semibold text-slate-600">Atama Geçmişi</h3>{detail.assignments.length ? detail.assignments.map(a => <p key={a.id} className="mt-3 text-xs leading-5 text-slate-500">{a.actor.name} → {options.users.find(u => u.id === a.assignedTo)?.name || (a.assignedTo ? 'Pasif üye' : 'Atanmamış')}<br />{date(a.createdAt)}</p>) : <p className="mt-2 text-xs text-slate-400">Henüz atama yapılmadı.</p>}</div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">CRM, potansiyel müşteri dönüşümü ve AI yanıt önerileri sonraki aşamada etkinleştirilecek.</div>
        </div> : <p className="pt-8 text-center text-sm text-slate-400">Konuşma seçildiğinde müşteri ve marka bilgileri burada görünür.</p>}
      </aside>
    </div>
    <p className="text-xs text-slate-500">Son liste yenileme: {refreshed || '—'} · Otomatik sağlayıcı senkronizasyonu kapalı · Saat dilimi: İstanbul</p>
  </div>;
}
function CreateInteraction({ options, onClose, onCreated }: { options: InboxOptions; onClose: () => void; onCreated: (id: string) => void }) {
  const [account, setAccount] = useState(options.accounts[0]?.id || ''), [name, setName] = useState(''), [text, setText] = useState(''), [type, setType] = useState('COMMENT');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const eventKey = useRef('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    if (!eventKey.current) eventKey.current = crypto.randomUUID();
    try { const event = await api.post<{ id: string }>('/api/inbox', { eventKey: eventKey.current, socialAccountId: account, name, text, type }); onCreated(event.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Kayıt eklenemedi.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-violet-200 bg-white p-5" aria-label="Elle etkileşim ekle">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Elle Etkileşim Ekle</h2><p className="mt-1 text-xs text-slate-500">Yalnızca yasal olarak elde ettiğiniz bilgileri girin. Bu işlem sosyal ağa mesaj göndermez.</p></div><button type="button" className={button} onClick={onClose} disabled={busy}>Kapat</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><Select title="Sosyal hesap" value={account} onChange={v => { setAccount(v); eventKey.current = ''; }} entries={options.accounts.map(a => [a.id, `${platformName(a.platform)} · ${a.handle}`])} empty={null} disabled={busy} /><Select title="Etkileşim türü" value={type} onChange={v => { setType(v); eventKey.current = ''; }} entries={Object.entries(CONVERSATION_TYPES)} empty={null} disabled={busy} /><label className="text-xs font-medium text-slate-600">Müşterinin görünen adı<input autoFocus className={`${field} mt-1`} value={name} onChange={e => { setName(e.target.value); eventKey.current = ''; }} maxLength={100} required disabled={busy} /></label></div>
    <label className="block text-xs font-medium text-slate-600">Alınan mesaj<textarea className={`${field} mt-1 min-h-[100px]`} value={text} onChange={e => { setText(e.target.value); eventKey.current = ''; }} placeholder="Müşterinin mesajını buraya girin…" maxLength={5000} required disabled={busy} /></label>
    {!options.accounts.length && <p className="text-sm text-amber-800">Önce mevcut Sosyal Medya Hesapları ekranında markaya bağlı bir hesap oluşturun.</p>}
    <button className={primary} disabled={busy || !account || !name.trim() || !text.trim()}>{busy ? 'Kaydediliyor…' : 'Etkileşimi Kaydet'}</button>
  </form>;
}
