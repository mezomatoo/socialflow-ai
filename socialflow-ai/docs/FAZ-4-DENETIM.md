# Faz 4 Denetim ve Durum Matrisi — 15 Eylül 2026

Bu belge, Faz 4 master spesifikasyonunun GitHub'daki mevcut uygulamayla madde madde
karşılaştırmasıdır. Kaynak: mevcut checkout (`arena/01a0a552-socialflow-ai`,
`ee21035` "chore: validate merged SocialFlow build"). Amaç: çalışan kodu yeniden
yazmadan eksikleri tamamlamak (§0-§2).

## Başlangıç doğrulaması (kod değişikliği öncesi)

| Kontrol | Sonuç |
|---|---|
| `git status` | Temiz, commit edilmemiş değişiklik yok |
| `npm ci` | Başarılı |
| `npm run typecheck` | Başarılı |
| `npm test` (41 dosya) | 101/101 geçti |
| `npm run lint` | 2 uyarı (react-hooks), hata yok |
| `npm run build` | Başarılı |
| Veritabanı | Yeni yerel dev/test DB kuruldu + seed; mevcut veri sıfırlanmadı |

## Durum matrisi

| # | Spesifikasyon | Mevcut durum | Sınıf | Aksiyon |
|---|---|---|---|---|
| 1 | §13 "Sonraki Faz Modülleri" kaldırılacak | `src/lib/ui/nav.ts` grubunda hâlâ "Sonraki Faz Modülleri" başlığı var | İHLAL | DÜZELT — işlevsel kategorilere böl |
| 2 | §10 Ürün/Mağaza/Fırsat UI'da yok | Katalog/CRM daha önce kaldırılmış (`CATALOG_CRM_REMOVAL.md`), `test:removed-modules` koruyor; nav'da yok; CampaignOffer/Product tabloları veri koruması için duruyor | ÇALIŞIYOR | KORU |
| 3 | §16 Müşteri UI'sında faz terminolojisi yok | "Faz 1 — Üretim ve hazırlık" (dashboard), "Faz 2'de etkinleşecek" (composer), "Faz N" rozeti (PhaseNotice) müşteriye görünüyor | İHLAL | DÜZELT |
| 4 | §9/§144 Faz 1-3 çalışır olmalı | Yayınlama/zamanlama/hesap/analitik/bildirim altyapısı tam ve testli; ANCAK `phaseGates` varsayılanları hepsini KAPALI tutuyor → müşteri yayını/sıralamayı göremiyor | KISMEN | DÜZELT — tamamlanmış modüller varsayılan açık |
| 5 | §17-36 Marka Kiti çekirdeği | Tam CRUD, 13 koleksiyon, sürümleme, izinler, kilit (OFF/STANDARD/STRICT), tamamlanma skoru; 23 test | ÇALIŞIYOR | KORU |
| 6 | §121 Composer entegrasyonu | `NewContentView` içinde MOCK tutarlılık kontrolü ("gerçekte API'den çekilir" yorumlu) | PLACEHOLDER | DÜZELT — gerçek API |
| 7 | §52-53 AI sağlayıcı soyutlaması | provider.ts + llmClient (deterministic/OpenAI/Anthropic), turuncu zam aşımı/hata yolları | ÇALIŞIYOR | KORU |
| 8 | §54 PromptTemplate | DB modeli var ama servis SABİT dizi kullanıyor | PLACEHOLDER | TAMAMLA — DB destekli |
| 9 | §57 AiUsage | In-memory mock dizi; DB modeli kullanılmıyor; admin ekranı mock | PLACEHOLDER | TAMAMLA |
| 10 | §58 AiFeedback | DB modeli var; servis/API/UI yok | EKSİK | UYGULA |
| 11 | §56 AiGeneration kaydı | generationLog.ts gerçek DB yazar (hash'li prompt) | ÇALIŞIYOR | KORU/GENİŞLET |
| 12 | §50/§122 AI Stüdyo | Görünüm tarayıcı tarafında sahte görsellerle çalışıyor (`/demo/*.jpg`), API/DB/MediaAsset zinciri yok | PLACEHOLDER | UYGULA — sunucu tarafı |
| 13 | §63 Akıllı yeniden boyutlandırma | İstemci tarafı sahte storageKey; mevcut MediaVariant altyapısı kullanılmıyor | PLACEHOLDER | UYGULA |
| 14 | §64-66 Kreatif varyasyon | İstemci tarafı sahte varyasyon | PLACEHOLDER | UYGULA |
| 15 | §70-71 MarkaTutarlılık servisi | Saf fonksiyon var; yalnız istemcide kullanılıyor | KISMEN | SUNUCUYA TAŞI |
| 16 | §68-69 Kreatif kalite servisi | Saf fonksiyon; CreativeQualityScore modeli kullanılmıyor | KISMEN | TAMAMLA |
| 17 | §80-85 AI Planlayıcı | Sabit konu listesiyle istemci tarafı üretim; ContentPlan modeli kullanılmıyor; "Takvime Ekle" yok | PLACEHOLDER | UYGULA |
| 18 | §86 AI Kampanya Oluşturucu | ai-kampanya sayfası mevcut | DOĞRULANACAK | KONTROL ET |
| 19 | §98-103 Otomasyon | `mockRules` istemcide; API/DB/audit/loop koruması yok | PLACEHOLDER | UYGULA |
| 20 | §92-93 Trendler | Yapılandırılmış kaynak yokken SAHTE demo trend verisi gösteriliyor | İHLAL (§93) | DÜZELT — sahte veri gösterme |
| 21 | §94-95 Rakip analizi | Mock rakip/incegörü istemcide; CompetitorProfile modeli kullanılmıyor | PLACEHOLDER | UYGULA — kullanıcı kaynaklı veri |
| 22 | §96-97 Anlamsal arama | `search/semantic.ts` sahte demoIndex; gerçek `/api/v1/search` ayrı ve çalışıyor | PLACEHOLDER | SAHTEYİ KALDIR, gerçek aramayla birleştir |
| 23 | §104-105 Günlük AI Asistanı | Dashboard SAHTE veri gösteriyor ("Bugün 4 paylaşım planlı" uydurma) | İHLAL (§105) | DÜZELT — gerçek uygulama durumu |
| 24 | §72/§77 Yeniden kullanım | Naive `slice()` istemci fonksiyonu; gerçek captionAdaptationService mevcut | KISMEN | MEVCUT SERVİSLE BİRLEŞTİR |
| 25 | §73-76 Video istihbaratı | Sabit sahte analiz döndürüyor | PLACEHOLDER | DÜRÜST yetenek kapısı |
| 26 | §79 ContentExperiment | Yalnızca model | EKSİK | MİNİMAL UYGULA/BELGELE |
| 27 | §90-91 Performans tahmini | Mock sezgisel; bayrak kapalı; hiçbir yerde kullanılmıyor | PLACEHOLDER | Bayraklı bırak, sahte sayı yok |
| 28 | §45 Marka Kiti dışa aktarma | Versions API var; dışa aktarma doğrulanacak | DOĞRULANACAK | KONTROL ET |
| 29 | §115 Veritabanı varlıkları | Tüm Faz 4 modelleri şemada mevcut (BrandKit…AnalyticsAnomaly) | ÇALIŞIYOR | KORU — kopya model YOK |
| 30 | §116 Özellik bayrakları | featureFlags.ts mevcut | ÇALIŞIYOR | KORU |
| 31 | §117-119 Sunucu tarafı yetki | brandkit izinleri sunucuda uygulanıyor; yeni uçlar aynı deseni izleyecek | ÇALIŞIYOR | KORU/GENİŞLET |
| 32 | Çalışma alanı izolasyonu | brandkit + kritik yol testleri geçiriyor | ÇALIŞIYOR | KORU + yeni modüllere test |

## Kararlar

- **KORU:** Marka Kiti çekirdeği, AI sağlayıcı soyutlaması, AiGeneration kaydı,
  katalog/CRM kaldırma kararı, kuyruk/yayınlama altyapısı, test ekosistemi.
- **DÜZELT:** Nav başlığı ve faz terminolojisi, kapı varsayılanları, trend/sahte
  veri ihlalleri, günlük asistan sahte verisi, Composer mock tutarlılığı.
- **TAMAMLA/UYGULA:** PromptTemplate/AiUsage/AiFeedback DB katmanı, AI Stüdyo
  sunucu zinciri (AiImageGeneration → MediaAsset → MasterCreative/CreativeVariant),
  Planlayıcı DB + Takvime Ekle, Otomasyon DB + API + audit + loop koruması,
  rakip profilleri (kullanıcı kaynaklı), yeniden kullanım API'si.
- **KOPYA OLUŞTURMA:** BrandKitV2/AiStudioV2/PlannerV2/AutomationV2 yok; mevcut
  `src/lib/brandkit`, `src/lib/ai`, `src/lib/planner`, `src/lib/automation`
  modülleri yerinde genişletilir.
