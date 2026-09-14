# Mimari

SocialFlow AI, **Next.js 14 App Router** üzerine kurulu, sunucu tarafı yetkilendirme ve yapılandırma odaklı
platform kurallarıyla çalışan bir uygulamadır. Bu belge katmanları, çekirdek veri modelini, istek akışını ve
arka plan iş kuyruğunu açıklar.

---

## 1. Katmanlar

```
┌──────────────────────────────────────────────────────────────┐
│  Arayüz (Türkçe)        src/app/(app)/*  +  src/components/*   │
│  Next.js sunucu bileşenleri + 'use client' etkileşimli adalar  │
├──────────────────────────────────────────────────────────────┤
│  API katmanı              src/app/api/**/route.ts (~40 rota)   │
│  apiRoute() sarmalayıcı → { ok, data } / { ok:false, error }   │
│  Oturum + CSRF + rol + hız sınırı burada uygulanır             │
├──────────────────────────────────────────────────────────────┤
│  Servis katmanı           src/lib/services/*  +  social/*  + ai/*│
│  contentService, validationService, schedulingService,         │
│  publishingService, analyticsService, mediaService, notify     │
├──────────────────────────────────────────────────────────────┤
│  Etki alanı kuralları     src/lib/rules (PlatformRule motoru)  │
│  src/lib/platforms (meta + yerleşik kurallar)                  │
├──────────────────────────────────────────────────────────────┤
│  Altyapı                  prisma (DB), storage (S3/yerel),     │
│  queue (kalıcı işler), crypto (token), auth/session, security  │
└──────────────────────────────────────────────────────────────┘
```

**İlke:** Platform mantığı (limitler, oranlar, yetenekler) yalnızca `rules` + `platforms` + `social/providers`
içinde yaşar. Uygulamanın geri kalanı bu soyutlamalara bağımlıdır; bileşenlerde sabit sosyal medya değeri yoktur.

---

## 2. Çekirdek veri modeli: 1 master → N çocuk

Kampanya ağ başına **kopyalanmaz**. Tek bir `Content` master içeriği temsil eder; her platform/içerik-türü
kombinasyonu için bir `PlatformContent` çocuğu türetilir.

```
Content (master: medya + ana açıklama + marka + zamanlama)
  ├── ContentMedia ──► MediaAsset (orijinal master, asla değişmez)
  ├── ContentVersion (ORIGINAL | AI_ADAPTED | MANUAL | RESTORED)
  └── PlatformContent (her hedef bağımsız metin/varyant/durum/zamanlama taşır)
        key = "PLATFORM:CONTENT_TYPE"  (içerik başına benzersiz)
        ├── Schedule (1:1)
        ├── Publication[] (idempotencyKey = "pc:<id>:v<version>")
        │     └── PublicationAttempt[]
        └── AnalyticsSnapshot[]
```

- `PlatformContent.key = contentKey(platform, contentType)` → `@@unique([contentId, key])`.
- Seçim değiştiğinde `syncSelections` yeni hedefleri ekler, çıkarılanları siler; **yayınlanmış** hedefler korunur
  (silinmez, `enabled=false` yapılır).
- İçerik durumu çocuklardan **türetilir** (`rollupContentStatus`):
  - hepsi PUBLISHED → `PUBLISHED`
  - bir kısmı PUBLISHED + bir kısmı FAILED → `PARTIALLY_PUBLISHED`
  - herhangi biri PUBLISHING → `PUBLISHING`
  - hepsi FAILED → `FAILED`; SCHEDULED varsa `SCHEDULED`; APPROVAL_PENDING varsa `APPROVAL_PENDING`.

---

## 3. İçerik yaşam döngüsü (composer akışı)

```
1. Oluştur      POST /api/contents
                { brandId, masterCaption, mediaIds[], selections[{platform,contentType,accountId}] }
                → createContent → syncSelections (N PlatformContent, DRAFT)

2. Uyarla       POST /api/contents/[id]/adapt   { targetIds?, preserveManual? }
                → adaptContentToPlatforms → adaptCaption (her hedef için bağımsız)
                → captionSource=AI, charUsed ≤ charLimit, ContentVersion(AI_ADAPTED)

3. Doğrula      GET  /api/contents/[id]/validate
                → runPreflight → PreflightReport { readyCount, totalCount, blocking, headline }

4. Düzenle      PATCH /api/contents/[id]/platform-content/[pcId]
                { caption? hashtags? cta? firstComment? aspectRatio? cropMode? focalPoint? edits? mediaAssetId? }

5a. Planla      POST /api/contents/[id]/schedule { scheduledFor, timezone?, targetIds?, aiSuggested? }
                → scheduleContent → SCHEDULED + Schedule + kuyruk işi (publish:<pcId>:v<version>)

5b. Yayınla     POST /api/contents/[id]/publish { strict?, targetIds? }
                → publishContent → her hedef için publishPlatformContent (bağımsız)

6. Yeniden dene POST /api/contents/[id]/retry  (yalnızca başarısız hedefler)

7. Sürümler     GET  /api/contents/[id]/versions
                POST /api/contents/[id]/restore-version { version }
```

---

## 4. API sözleşmesi

Tüm rotalar `apiRoute()` sarmalayıcısını kullanır ve tutarlı bir zarf döndürür:

```jsonc
// Başarılı
{ "ok": true, "data": { /* ... */ } }

// Hata (mesajlar Türkçe, kullanıcıya gösterilebilir)
{ "ok": false, "error": { "code": "CSRF_FAILED", "message": "...", "details": {} } }
```

- **Kimlik:** Her mutasyon `sf_session` çerezi + `x-csrf-token` başlığı (veya `sf_csrf` çerezi) gerektirir.
- **Yetki:** `requireSession()` + `assertRole()` (OWNER/ADMIN/EDITOR/APPROVER/VIEWER).
- **Hız sınırı:** `rateLimit(key)` — pencere/limit `env.rateLimit`.
- **Çalışma alanı izolasyonu:** Her sorgu `workspaceId` ile kapsamlanır; başka çalışma alanının verisi dönmez.

### Rota grupları

| Grup | Rotalar |
|---|---|
| Kimlik | `/api/auth/login`, `/api/auth/logout`, `/api/bootstrap` |
| İçerik | `/api/contents`, `/api/contents/[id]` (+ adapt, validate, schedule, publish, retry, versions, restore-version, platform-content/[pcId]) |
| Medya | `/api/media`, `/api/media/[id]` (+ focal, variant), `/api/media/upload`, `/api/media/file/[...key]` |
| AI | `/api/ai/adapt`, `/api/ai/generate`, `/api/ai/hashtags`, `/api/ai/spellcheck`, `/api/ai/timing` |
| Hesaplar | `/api/accounts`, `/api/accounts/[id]` (+ connect) |
| Kurallar | `/api/rules`, `/api/rules/[id]`, `/api/admin/rules/reset` |
| Marka | `/api/brands`, `/api/brands/[id]` |
| Analitik | `/api/analytics/summary`, `/api/analytics/daily` |
| Diğer | `/api/calendar`, `/api/search`, `/api/notifications` (+ read, read-all), `/api/settings/branding`, `/api/settings/integrations` |

---

## 5. Arka plan iş kuyruğu

Veritabanı tabanlı, kalıcı (durable) bir kuyruktur; harici broker gerektirmez.

- **Model:** `Job { type, payload, status, runAt, attempts, maxAttempts, lockedBy, idempotencyKey@unique }`.
- **İş türleri:** `PublishContentJob`, `MediaProcessingJob`, `AnalyticsSyncJob`, `TokenRefreshJob`.
- **İdempotency:** `enqueue({ idempotencyKey })` aynı anahtarla ikinci kez iş **oluşturmaz** (`created=false`).
  Zamanlanmış yayınlar `publish:<platformContentId>:v<version>` anahtarını kullanır; yeniden planlama
  `rescheduleJob` ile aynı işi günceller.
- **İşçi:** `src/instrumentation.ts` → `startQueueWorker()` sunucu açılışında **bir kez** başlar
  (`NEXT_RUNTIME === 'nodejs'`). `claimNextJob(workerId)` ile iş kilitleyip `processJob` yürütür;
  başarısızlıkta `failJob` üstel geri çekilme ile yeniden dener.
- **Çok örnekli dağıtım:** İşçiyi kapatmak için `QUEUE_WORKER_ENABLED=false` (bkz. DEPLOYMENT.md).

---

## 6. Medya motoru

- **Orijinal korunur:** `MediaAsset.storageKey` master dosyadır; asla değiştirilmez.
- **Varyant üretimi:** İstemci tarafında canvas ile (`src/lib/media/engine.ts`): `detectFocalPoint`,
  `computeSmartCrop`, `computeTargetSize`, `renderVariant`. **Asla esnetmez** — hedef orana akıllı kırpma.
  `MediaEdits.cropMode`: `SMART | MANUAL | FIT | AI_EXTEND` (AI_EXTEND yalnızca açık izinle).
- **Sunucu varyantı:** `POST /api/media/[id]/variant` (formData) — `renderedKey`/`renderedUrl` üretir.
- **Doğrulama:** `validateMediaForRule(media, rule)` — oran/boyut/boyut-KB/süre kontrolleri; ERROR seviyesi yayınları engeller.
- **Depolama soyutlaması:** `storage()` → yerel disk veya S3 uyumlu sürücü (`StorageDriver`).

---

## 7. Yapılandırma odaklı platform kuralları

`PlatformRule` motoru (`src/lib/rules/ruleEngine.ts`) tüm limitleri merkezî tutar:

- `getRule(workspaceId, platform, contentType)` → `PlatformRuleView`.
- DB'de satır yoksa `BUILTIN_RULES`'a düşer (her çalışma alanı için `ensureRules` ile DB'ye yazılabilir).
- 15 sn önbellek (`invalidateRuleCache` ile tazelenir).
- Dosya boyutları **KB** saklanır (SQLite/Prisma `Int` 4 GB taşmasını önlemek için), görünüme bayt olarak döner.
- X/Twitter bağlantıları 23 karakter sayar (`urlWeight`).

Kurallar Admin Ayarları'ndan (`/api/rules/[id]`, `/api/admin/rules/reset`) güncellenebilir → `source: MANUAL`.

---

## 8. Sağlayıcı adaptörleri (özet)

`getProvider(platform)` → demo modda veya kimlik bilgisi yoksa `DemoProvider`, aksi halde gerçek adaptör.
Her adaptör `SocialProvider` arayüzünü uygular (`publishPost`, `publishStory`, `publishVideo`).
Ayrıntı için bkz. [SOCIAL_PROVIDERS.md](SOCIAL_PROVIDERS.md).

---

## 9. Yerel ayarlar

- Varsayılan saat dilimi **Europe/Istanbul**; tarihler **DD.MM.YYYY**; **24 saat**; para birimi **TRY/₺**; dil **Türkçe**.
- `src/lib/format.ts`: `formatDate`, `formatTime`, `formatDateTime`, `formatBytes`, `toLocalInputValue`, `zonedTimeToUtc`.
- Karakter sayımı kod noktası tabanlıdır (`Array.from(text).length`) — emoji/Türkçe karakterler doğru sayılır.
