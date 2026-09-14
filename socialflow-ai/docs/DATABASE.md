# Veritabanı

Şema: `prisma/schema.prisma` — **43 model** (28 çekirdek + 15 Phase 4 Brand Kit). Demo/geliştirme **SQLite**, üretim **PostgreSQL**.
Aynı şema her iki sağlayıcıyla çalışır; yalnızca `provider` ve birkaç alan tipi değişir.
Şema `prisma db push` ile yönetilir (migration dizini yok); Phase 4 modelleri **additive** eklendi (veri kaybı yok).

---

## Model grupları

### Kimlik & çalışma alanı
| Model | Amaç | Notlar |
|---|---|---|
| `Workspace` | Çok kiracılı (multi-tenant) kök | `slug@unique`, `demoMode`, `timezone`, `locale`, `plan` |
| `User` | Kullanıcı | `email@unique`, `role` (OWNER/ADMIN/EDITOR/APPROVER/VIEWER), `passwordHash` |
| `Session` | Sunucu taraflı oturum | `tokenHash`, `csrfToken`, `expiresAt`, IP/UA |
| `AppSettings` | Çalışma alanı ayarları | 1:1 Workspace |
| `AuditLog` | Denetim kaydı | `action`, `entityType`, `entityId`, `metadata` |

### Marka & ses
| Model | Amaç |
|---|---|
| `Brand` | Marka profili (`slug`, renkler, `defaultStyle`, varsayılan/zorunlu/yasaklı etiketler) |
| `BrandVoice` | Marka sesi profili (AI prompt'ları için) |
| `Campaign` | Kampanya grupları (içerikler bir kampanyaya bağlanabilir) |

### Phase 4 — Brand Kit (marka kimliğinin merkezi doğruluk kaynağı)
`BrandKit`, `Brand` ile **1:1**'dir ve mevcut `Brand`/`BrandVoice`/`MediaAsset` sistemlerini
**genişletir** (kopyalamaz). Tüm AI/kreatif modülleri buradan beslenir. Her kayıt `workspaceId`
+ `brandId` taşır → **çoklu-marka izolasyonu**. Onay deseni: `DRAFT | PENDING_APPROVAL | APPROVED | ARCHIVED`.

| Model | Amaç | Notlar |
|---|---|---|
| `BrandKit` | Aggregate kök | `brandId@unique`, `completenessScore`, `lockMode` (OFF/STANDARD/STRICT), `consistencyGate`, temel bilgi + iletişim (§5-§6) |
| `BrandKitVersion` | Sürüm geçmişi | `@@unique([brandKitId,version])`, tam JSON `snapshot` (§45-§46) |
| `BrandLogo` | Logo + kullanım kuralları | `usageType`, `storageKey`/`mediaAssetId`, `misuseRules` JSON (§7-§10) |
| `BrandColor` | Renk paleti | `hex/rgb/cmyk/pantone`, `category`, `prohibited` (§11-§14) |
| `BrandTypography` | Font rolleri | `role`, `fontFamily`, lisans alanları (§16-§18) |
| `BrandMessage` | Slogan & mesajlar | `type` (MAIN_SLOGAN/USP/...) (§23-§24) |
| `BrandCTA` | CTA'lar | `category` (PREFERRED/FORBIDDEN/CAMPAIGN), `platform?` (§25-§26) |
| `BrandHashtag` | Marka kiti etiketleri | workspace `HashtagSet`'i **tamamlar** (§27) |
| `BrandMention` | Marka kiti bahsetmeleri | workspace `SavedMention`'ı **tamamlar** (§28) |
| `BrandVisualRule` | Görsel stil kuralları | esnek `category` + JSON `config` (§29-§33) |
| `BrandPlatformRule` | Platform kuralları | `@@unique([brandKitId,platform,contentType])` (§34) |
| `BrandLegalRule` | Yasal + kampanya biçim kuralları | `category` (LEGAL_INFO/CAMPAIGN_RULE) (§35-§36) |
| `BrandAsset` | Marka dosyaları | `storage()` üzerinde, opsiyonel `mediaAssetId` (§37) |
| `BrandReference` | Beğenilen/kaçınılacak tasarımlar | `kind` (LIKED/AVOID) (§52) |
| `BrandMemory` | Marka hafızası | onaylı içerikten öğrenme (varsayılan KAPALI), `embedding?` (§50-§51) |

**Servis katmanı:** `src/lib/brandkit/` — `constants.ts` (18 sekme + enum/etiketler),
`permissions.ts` (§138: view/edit/approve/lock/export/manage_assets → rol kümeleri),
`featureFlags.ts` (§137: AI/otomasyon bayrakları varsayılan KAPALI), `completeness.ts` (§40: 0-100),
`types.ts` (`brandKitInclude` + `BrandKitAggregate`), `service.ts` (`ensureBrandKit` backfill + idempotent,
`getBrandKit`, `listBrandKitsForWorkspace`, `recomputeCompleteness`, `updateBrandKit`, `createBrandKitVersion`).
`ensureBrandKit` mevcut `Brand` alanlarını (renk/font/CTA/hashtag/mention/logo) zengin modellere
**backfill** eder — additive, asla üzerine yazmaz.

### Sosyal hesaplar & token'lar
| Model | Amaç | Notlar |
|---|---|---|
| `SocialAccount` | Bağlı platform hesabı | `@@unique([workspaceId, platform, handle])`, `connectionStatus`, `demoAccount` |
| `SocialProviderToken` | OAuth token'ları | `accessTokenEnc`/`refreshTokenEnc` **şifreli** (AES-256-GCM, base64 `String`) |
| `ProviderIntegration` | Sağlayıcı entegrasyon durumu | Uygulama genelinde yapılandırma |
| `OAuthState` | OAuth akış state/PKCE | `state`, `codeVerifier`, kısa ömürlü |

### Medya
| Model | Amaç | Notlar |
|---|---|---|
| `MediaFolder` | Medya klasörleri | |
| `MediaAsset` | Orijinal master medya | `storageKey` (asla değişmez), `kind`, `mimeType`, `format`, `bytes`, `width/height`, `durationMs`, `focalPoint`, `@@unique([workspaceId, contentHash])` |

### İçerik (çekirdek)
| Model | Amaç | Notlar |
|---|---|---|
| `Content` | **Master içerik** | `masterCaption`, `storyText`, `brandId`, `status`, `scheduleMode`, `version`, `timezone` |
| `ContentMedia` | Content ↔ MediaAsset | `@@unique([contentId, mediaId])`, `position` |
| `ContentVersion` | Sürüm geçmişi | `@@unique([contentId, version])`, `kind` (ORIGINAL/AI_ADAPTED/MANUAL/RESTORED), `payload` (JSON string) |
| `PlatformContent` | **Platform çocuğu** | `key="PLATFORM:CONTENT_TYPE"`, `@@unique([contentId, key])`; metin, medya varyantı, durum, zamanlama |

### Yayınlama & zamanlama
| Model | Amaç | Notlar |
|---|---|---|
| `Schedule` | Zamanlama kaydı | `platformContentId@unique` (1:1), `scheduledFor`, `timezone`, `status`, `jobId` |
| `Publication` | Yayın denemesi (idempotent) | `idempotencyKey@unique = "pc:<id>:v<version>"`, `status`, `providerPostId`, `permalink`, `demoMode`, `attempts/maxAttempts` |
| `PublicationAttempt` | Her deneme kaydı | `attempt`, `ok`, `httpStatus`, `providerCode`, `friendlyMessage`, `durationMs` |
| `Job` | Kalıcı iş kuyruğu | `type`, `payload`, `status`, `runAt`, `attempts`, `lockedBy`, `idempotencyKey@unique` |

### Kurallar & keşif
| Model | Amaç | Notlar |
|---|---|---|
| `PlatformRule` | Yapılandırma odaklı limitler | `@@unique([workspaceId, platform, contentType])`; dosya boyutları **KB**; JSON alanlar `String` |
| `HashtagSet` / `HashtagEntry` | Etiket setleri | |
| `SavedMention` | Kayıtlı mention'lar | `required` işareti |

### Analitik & bildirim
| Model | Amaç | Notlar |
|---|---|---|
| `AnalyticsSnapshot` | Gerçek ölçüm anlık görüntüsü | **Demo modda üretilmez** (sahte analitik yok) |
| `Notification` | Kullanıcı bildirimleri | `type`, `severity`, `title`, `message`, `actionLabel/Route` |

---

## Önemli ilişkiler

```
Workspace 1─* Brand 1─* Content 1─* PlatformContent 1─1 Schedule
                                   1─* Publication 1─* PublicationAttempt
                                   1─* AnalyticsSnapshot
Content     *─* MediaAsset (ContentMedia üzerinden)
Content     1─* ContentVersion
SocialAccount 1─* PlatformContent   (1─1 SocialProviderToken)
Workspace   1─* PlatformRule / Job / Notification / AuditLog
```

- **Silme davranışı:** Çoğu ilişki `onDelete: Cascade` (ör. `Content` silinince çocuklar, yayınlar, sürümler).
  `PlatformContent.socialAccountId` ve `mediaAssetId` → `onDelete: SetNull` (hesap/medya silinirse hedef kalır).

---

## SQLite → PostgreSQL geçişi

Şema, SQLite demo ve PostgreSQL üretim arasında taşınabilir olacak şekilde tasarlanmıştır.

1. `schema.prisma` içinde `datasource db { provider = "postgresql" }` yapın
   (veya `DATABASE_URL`'yi `postgresql://...` olarak ayarlayıp provider'ı değiştirin).
2. `DATABASE_URL="postgresql://user:pass@host:5432/socialflow?schema=public"`
3. `npx prisma migrate dev` (veya ilk kurulumda `npx prisma db push`).
4. `npx prisma generate`.

### Taşınabilirlik için alınan kararlar
- **Dosya boyutları KB saklanır** (`maxFileSizeKb`, `maxVideoFileSizeKb`, `MediaAsset.bytes` KB değil bayt ama
  `Int` sınırları gözetilir). SQLite/Prisma `Int` 4 GB'ta taşar; bu yüzden kural boyutları KB tutulur.
- **Şifreli token'lar base64 `String`** olarak saklanır (Prisma `Unsupported("Bytes")` alanları
  create/update'ten hariç tutulduğu için `Bytes` yerine `String`).
- **JSON alanlar `String`** olarak saklanır ve uygulama katmanında `JSON.parse/stringify` yapılır
  (`PlatformRule.supportedAspectRatios`, `ContentVersion.payload`, `Job.payload`, `PlatformContent.edits/focalPoint`…).
  Bu, SQLite'ta `Json` desteği olmamasına karşı taşınabilirliği korur.
- **Opsiyonel Prisma string'lerine `null` atanmaz** — `undefined` kullanılır.
- **Skaler `where` için `{ in: [...] }`** — `where.status = ["SCHEDULED"]` değil.

---

## İdempotency ve durum türetme

- **Yayınlama idempotency:** `Publication.idempotencyKey = "pc:<platformContentId>:v<content.version>"`.
  Aynı anahtar varsa yeni Publication **oluşturulmaz**; mevcut kayıt güncellenir. Retry çift gönderim yaratmaz.
- **Kuyruk idempotency:** `Job.idempotencyKey = "publish:<platformContentId>:v<version>"`.
  `enqueue` aynı anahtarla ikinci kez iş oluşturmaz (`created=false`); `rescheduleJob` mevcut işi günceller.
- **Durum türetme:** `Content.status`, `rollupContentStatus` ile `PlatformContent` çocuklarından türetilir
  (PUBLISHED / PARTIALLY_PUBLISHED / PUBLISHING / FAILED / SCHEDULED / APPROVAL_PENDING / DRAFT).

---

## Seed

`prisma/seed.ts` (ESM, `tsx` ile çalışır) demo verisini oluşturur:

- Workspace `demo-ajans` (plan AGENCY, `demoMode=true`, Europe/Istanbul).
- Kullanıcılar: `demo@` (OWNER), `editor@`, `onaylayici@` — parola `Sosyal2026!`.
- Markalar: `kahve-dukkani`, `aurora-tekstil`.
- 9 platform için demo sosyal hesaplar (ACTIVE), 15 yerleşik `PlatformRule`, hashtag setleri, mention'lar.
- 6 raster (JPEG) demo medya (`storage/demo/*.jpg`) + örnek içerikler.
- **Analitik snapshot üretmez** (demo modda analitik boş kalır ve bu kullanıcıya belirtilir).

> Seed yeniden çalıştırılabilir; medya tanımları JPEG'dir (SVG değil) — böylece `validateMediaForRule`
> demo medyayı her platformda geçerli bulur ve demo yayınlanabilir.
