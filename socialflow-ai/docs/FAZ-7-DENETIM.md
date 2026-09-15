# Faz 7 Denetimi — Üretim Hazırlık ve Canlıya Geçiş Matrisi

> Tarih: 2026-09-15 • Dal: `arena/01a0a552-socialflow-ai` • Başlangıç HEAD: `0343666`
> Yöntem: GitHub-first denetim. Mevcut depo tek doğruluk kaynağı; çalışan modüller korunur,
> tekrar (V2) sistemi yazılmaz. Bu belge Faz 7'nin iç durum matrisidir ve işlemler
> tamamlandıkça güncellenir.

---

## 1. Depo Durumu (denetim anı)

| Konu | Bulgu | Sınıflandırma |
|---|---|---|
| Dal / HEAD | `arena/01a0a552-socialflow-ai` @ `0343666`, ağaç temiz | — |
| CI pipeline (GitHub Actions) | `.github/workflows/` yok | **MISSING** |
| CD (staging/production, onay, concurrency) | Yok | **MISSING** |
| Health endpoint (liveness/readiness) | `src/app/api` altında yalnız `auth` + `v1`; health yok | **MISSING** |
| Güvenlik başlıkları (CSP/HSTS/…) | `src/middleware.ts` yalnız oturum+yönlendirme; başlık yok | **MISSING** |
| Seed güvenliği | `prisma/seed.ts` TÜM tabloları silip demo veri basar; üretim koruması yok | **NOT PRODUCTION READY** |
| Ortam ayrımı | `.env.example` + `APP_ENV`/`DEMO_MODE`/`FF_*` mevcut; middleware önizleme otologin üretimde kapalı | WORKING |
| Çalıştırma/worker | `npm run worker` → `src/lib/queue/handlers` (tek kuyruk; retry+backoff+maxAttempts var) | PARTIAL (dead-letter görünürlüğü yok) |
| Yapılandırılmış log | `src/lib/observability.ts`: JSON satır, requestId, `redact()` | WORKING |
| Audit log | `src/lib/security/audit` yaygın kullanımda; gizli değer yazılmıyor | WORKING |
| Rate limit | `apiRoute({ limit })` üzerinden; login 12/5dk, AI uçları 10–60 | WORKING |
| Çerez güvenliği | httpOnly + Secure + SameSite(lax/none) + CSRF (sf_csrf + x-csrf-token) | WORKING |
| E-posta altyapısı | Şifre sıfırlama bağlantısı yalnız sunucu logu (yalnız dev/demo `devHint`); sağlayıcı yok | **MISSING** (dış yapılandırma gerekir) |
| Inbound webhook (sağlayıcı) | Route yok | **MISSING** (sağlayıcı onayı/bağlantısı gerekir) |
| Admin operasyon merkezi | Yalnız `/app/admin/ai-kullanim` + `admin/rules` | PARTIAL |
| Testler | 142/142 geçer (`npm test`); typecheck 0; lint 0 hata; build OK | WORKING |

## 2. Faz 1–6 Modül Matrisi

| Modül | Sınıflandırma | Faz 7 aksiyonu |
|---|---|---|
| Kimlik doğrulama, çalışma alanı, marka | WORKING | NO ACTION ( sertleştirme denetimi ayrı ) |
| İçerik composer, taslak, otomatik kayıt, platform varyantları | WORKING | NO ACTION |
| Medya kütüphanesi, orijinal dokunulmazlık | WORKING | NO ACTION |
| OAuth hesaplar, yayın, zamanlama, PublicationAttempt, yeniden deneme | WORKING (canlı yayın `DEMO_MODE=false` + gerçek sağlayıcı kimliği ister) | DISABLE UNTIL CONFIGURED (belgelendi) |
| RBAC, onay akışı, yorumlar, kampanya (kanonik) | WORKING | NO ACTION |
| Analitik snapshot + raporlar | PARTIAL (sağlayıcı verisi bağlandığında gerçek) | NO ACTION + tazelik etiketi |
| BrandKit (sürümleme, Brand Lock, puan) | WORKING | NO ACTION |
| AI Stüdyo zinciri (MediaAsset→MasterCreative→kalite) | WORKING | FIX: aynı-hash yeniden üretimde P2002 kenar durumu |
| AiUsage / PromptTemplate / AiFeedback | WORKING | FIX: `POST /api/v1/ai/generate` 400 görev eşlemesi |
| AI Planlayıcı (ContentPlan, Takvime Ekle→taslak) | WORKING | NO ACTION |
| AI Kampanya (kanonik Campaign) | WORKING | NO ACTION |
| Otomasyon motoru (kural, yürütme, döngü koruması) | WORKING (`0343666`) | NO ACTION |
| **Trendler** | **DEMO DATA ONLY** — `trends/service.ts` her zaman `demoTrends` döner; hatta `providerConfigured:true` dalında bile sahte | **REPLACE: üretimde yalnız gerçek durum (kaynak yok → "yapılandırılmadı")** |
| **Rakip Analizi** | **MOCK ONLY** — `competitor/service.ts` sabit `mockCompetitors/mockInsights`, görünüm bunu çizer | **REPLACE: sahte veriyi kaldır, dürüst boş/unavailable durumu** |
| Semantik arama | **DEAD CODE (DEMO)** — `search/semantic.ts` `demoIndex`; gerçek arama `/api/v1/search` zaten DB-backed ve workspace izoleli | **REMOVE PLACEHOLDER** |
| `ai/creative.ts` + `creativeQuality.ts` | DEAD CODE (importer yok) | REMOVE |
| `prisma-mock.ts` | DEAD CODE (importer yok) | REMOVE |
| Gelen Kutusu (Faz 5) | PARTIAL (gerçek tablolar + testler; sağlayıcı webhook'u yok) | INTEGRATE (sağlayıcı bağlıyken) |
| CRM / Lead | PARTIAL (migration + tablolar mevcut) | VERIFY |
| Reklamcılık (Faz 6 temel) | PARTIAL (contracts + service + testler; gerçek adapter yapılandırma ister) | DISABLE UNTIL CONFIGURED |
| Dönüşüm / Atıf / Gelir | PARTIAL | VERIFY (ayrı inceleme) |
| Sosyal Commerce / Ürün kataloğu | Kullanıcı kararıyla kaldırıldı (`a65661b`) | OUT OF SCOPE (veri korunur) |
| Navigasyon | WORKING — işlevsel gruplar, faz terminolojisi yok, "Sonraki Faz Modülleri" yok | NO ACTION |

## 3. Faz 7 İş Sırası (atomik işlemler)

Her işlem: test → typecheck/lint → (gerekiyorsa build) → atomik commit → push → Türkçe rapor.

1. **[Bu commit] Denetim matrisi** — bu belge.
2. **Health endpoints** — `GET /api/health` (liveness) + bağımlılık kontrollü readiness (DB); sahte "yeşil" yok.
3. **Seed üretim koruması** — `APP_ENV=production` + açık `SEED_ALLOW_PRODUCTION=true` olmadan seed çalışmaz.
4. **CI pipeline** — GitHub Actions: install → db:generate → typecheck → lint → test → build.
5. **Güvenlik başlıkları** — CSP(rgeliştirme uyumlu), HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options.
6. **Sahte trend/rakip verisinin kaldırılması** — üretimde yalnız gerçek durum; demo veri ve `providerConfigured:true` sahte dalı silinir.
7. **Ölü kod temizliği** — `search/semantic.ts`, `ai/creative.ts`, `ai/creativeQuality.ts`, `prisma-mock.ts` (importer=0 doğrulanır).
8. **`POST /api/v1/ai/generate` 400 görev eşleme düzeltmesi.**
9. **AI Stüdyo aynı-hash P2002** — yeniden üretimde çakışma dürüstçe yönetilir.
10. **CD iş akışı** — staging/production environment ayrımı + concurrency + deployment kaydı (deploy hedefi altyapıya bağlı; iş akışı iskeleti + kilit).
11. **Worker görünürlüğü** — iş başarısızlıklarında FAILED durum görünürlüğü + admin sağlık özeti (sahte yeşil yok).

## 4. Bilinen Dış Bağımlılıklar (canlıya geçiş blokerleri)

| Modül | Bloker | Gerekli |
|---|---|---|
| Canlı sosyal yayın | Gerçek OAuth uygulaması + app review | Sağlayıcı developer hesabı, callback URL, production anahtarları |
| E-posta (şifre sıfırlama, davet) | İşlemsel e-posta sağlayıcısı yok | Sağlayıcı hesabı + SPF/DKIM/DMARC |
| Inbound webhook | Genel HTTPS + sağlayıcı onayı | Üretim alan adı + sağlayıcı yapılandırması |
| Trend sağlayıcı | Lisanslı/resmî kaynak yok | Yapılandırılınca açılır; aksi hâlde dürüst "yapılandırılmadı" |
| Reklam yazma | Gerçek AdvertisingProviderAdapter kimlik bilgileri | Yapılandırma + onay akışı |
