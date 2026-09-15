'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Spinner, Switch } from '@/components/ui';
import { useToast } from '@/components/ui/Toaster';
import { mockRules, TRIGGER_LABELS, ACTION_LABELS, type AutomationRule } from '@/lib/automation/engine';
import { isFeatureEnabled } from '@/lib/brandkit/featureFlags';

export function AutomationsView({ demoMode }: { demoMode: boolean }) {
  const toast = useToast();
  const [rules, setRules] = useState<AutomationRule[]>(mockRules);
  const [selected, setSelected] = useState<AutomationRule | null>(mockRules[0] ?? null);

  function toggle(id:string) {
    setRules((prev)=> prev.map((r)=> r.id===id ? { ...r, enabled: !r.enabled } : r));
    const r = rules.find((x)=>x.id===id);
    if (r && !r.enabled && r.actions.some((a)=>a.type==='schedule_approved_content')) {
      toast.error('Oto yayın kapalı', 'Otomatik yayın için Seviye 4 ve açık onay gerekir. Audit kaydı oluşturulur.');
    } else {
      toast.success(r?.enabled ? 'Kural kapatıldı' : 'Kural açıldı');
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink sm:text-[28px]">Otomasyonlar</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">EĞER tetikleyici VE koşullar O ZAMAN eylemler. Varsayılan seviye <strong>Seviye 1 — Sadece Öneri</strong>. AI asla sessizce yayınlamaz, onaylamaz veya silmez.</p>
        <div className="mt-2 flex gap-2">
          {demoMode ? <Badge tone="warning">Demo</Badge> : null}
          <Badge tone={isFeatureEnabled('automationEngine') ? 'success' : 'neutral'}>Otomasyon {isFeatureEnabled('automationEngine') ? 'Açık' : 'Kapalı (env)'}</Badge>
          <Badge tone="brand">Loop koruması aktif</Badge>
        </div>
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-[12.5px] leading-relaxed text-ink">
          <strong>Güvenlik:</strong> Otomatik yayın varsayılan kapalıdır. Etkinleştirmek için Seviye 4, açık yetki ve audit kaydı gerekir. Her otomasyon yürütmesi denetlenebilir.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="section-title">Kurallar</h3>
              <button className="btn-primary btn-sm" onClick={()=>toast.success('Taslak oluşturuldu','Yeni otomasyon taslak olarak eklendi.')}><Icon name="plus" size={13}/> Yeni Kural</button>
            </div>
            <ul className="space-y-2">
              {rules.map((r)=>(
                <li key={r.id} className={`rounded-xl border p-3 ${selected?.id===r.id ? 'border-brand-300 bg-brand-50/50' : 'border-line bg-surface hover:bg-surface-subtle'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={()=>setSelected(r)} className="text-left">
                      <p className="text-[13.5px] font-bold">{r.name}</p>
                      <p className="text-[11.5px] text-ink-muted">EĞER {TRIGGER_LABELS[r.trigger]} → {r.actions.map((a)=> ACTION_LABELS[a.type]).join(', ')}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">Seviye {r.autonomyLevel} • {r.enabled ? 'Açık' : 'Kapalı'}</p>
                    </button>
                    <Switch checked={r.enabled} onChange={()=>toggle(r.id)} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="section-title">AI Otomasyon Seviyesi</h3>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { l:'Seviye 1', d:'Sadece Öneri' },
                { l:'Seviye 2', d:'Taslak Oluştur' },
                { l:'Seviye 3', d:'Plan Oluştur' },
                { l:'Seviye 4', d:'Onay Sonrası Otomasyon' },
              ].map((s)=>(
                <div key={s.l} className={`rounded-lg border p-2 text-center ${s.l==='Seviye 1' ? 'border-brand-300 bg-brand-50' : 'border-line'}`}>
                  <p className="text-[12px] font-bold">{s.l}</p><p className="text-[11px] text-ink-muted">{s.d}</p>
                </div>
              ))}
            </div>
            <p className="hint mt-2">Varsayılan Seviye 1’dir. Değişim için Yönetici onayı gerekir.</p>
          </div>
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-bold">{selected.name}</h2>
                  <p className="text-[12.5px] text-ink-muted">Tetikleyici: <Badge tone="brand">{TRIGGER_LABELS[selected.trigger]}</Badge> • Otonomi Seviye {selected.autonomyLevel}</p>
                </div>
                <Badge tone={selected.enabled ? 'success':'neutral'}>{selected.enabled ? 'Etkin':'Devre Dışı'}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="label">EĞER</p>
                  <p className="rounded-lg border border-line bg-surface-subtle p-3 text-[13px]">{TRIGGER_LABELS[selected.trigger]}</p>
                </div>
                <div>
                  <p className="label">VE (koşullar)</p>
                  {selected.conditions.length ? (
                    <ul className="space-y-1">{selected.conditions.map((c:any,i:number)=><li key={i} className="chip">{c.field} {c.operator} {c.value}</li>)}</ul>
                  ) : <p className="hint">Koşul yok (tüm içeriklerde tetiklenir).</p>}
                </div>
                <div>
                  <p className="label">O ZAMAN (eylemler)</p>
                  <ul className="space-y-1.5">
                    {selected.actions.map((a:any,i:number)=>(
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-line p-2.5 text-[13px]">
                        <Icon name="zap" size={14} className="text-brand-600"/> {ACTION_LABELS[a.type]}
                        {a.type==='schedule_approved_content' ? <span className="ml-auto text-[11px] text-warning">Yetki + Audit gerekli</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button className="btn-primary btn-md" onClick={()=>toast.success('Test çalıştırıldı','Koşullar simüle edildi, bildirim gönderildi.')}>Test Et</button>
                <button className="btn-secondary btn-md" onClick={()=>toast.success('Kaydedildi')}>Kaydet</button>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-surface-subtle p-3">
                <p className="text-[12px] font-semibold">Son Yürütmeler (mock)</p>
                <ul className="mt-1 space-y-1 text-[12.5px]">
                  <li className="flex justify-between"><span>10 dk önce</span><Badge tone="success">Başarılı</Badge></li>
                  <li className="flex justify-between"><span>2 saat önce</span><Badge tone="warning">Atlandı (loop koruması)</Badge></li>
                  <li className="flex justify-between"><span>Dün</span><Badge tone="success">Başarılı</Badge></li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center text-ink-muted">Bir kural seçin.</div>
          )}

          <div className="card p-4">
            <h3 className="section-title">Güvenli Otomatik Yayın</h3>
            <p className="hint">Otomatik yayın yalnızca Seviye 4 + açık yapılandırma + yeterli yetki ile çalışır ve audit kaydı bırakır.</p>
            <div className="mt-2 flex items-center gap-2 text-[12.5px]">
              <Switch checked={false} onChange={()=> toast.error('Devre dışı','Yönetici ayarı gerektirir.')} /> Otomatik yayını etkinleştir
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
