# SocialFlow AI — Webhook Güvenliği, Çıkış Webhook'ları, E-posta Soyutlaması ve Performans İndeksleri Raporu

> **Kapsam:**
> ① Webhook güvenlik temeli (sağlayıcı callback imza doğrulama + event-id dedupe iskeleti, §78)
> ② Çıkış webhook'ları (imzalı payload + retry/dead-letter + devre kesici, §93)
> ③ E-posta sağlayıcı soyutlaması (SMTP / API / Console / Memory + şifre sıfırlama + devHint üretimde kapalı, §107)
> ④ Performans: Dashboard/takvim sorgularına eksik indeks denetimi ve optimizasyonu (§119-§120)
> **Tarih:** 15 Eylül 2026 · **Dal:** `arena/01a0a6ec-socialflow-ai` · **Durum:** Tamamlandı, test edildi ve çalışır durumda.

---

## 1. Yapılan İşlerin Özeti

| İş Kalemi | Kapsam & Standart | Durum | Doğrulama & Kanıt |
|---|---|---|---|
| **① Webhook Güvenlik Temeli** (§78) | Meta/X sağlayıcı HMAC-SHA256 zamanlama güvenli imza doğrulaması, replay attack zaman toleransı, Meta `hub.challenge` abonelik doğrulaması, veritabanı destekli event-ID deduplication iskeleti | ✅ Tamamlandı | `tests/webhook-security.test.ts` (7 test geçti), `/api/v1/webhooks/inbound/[provider]` uç noktası |
| **② Çıkış Webhook'ları** (§93) | İmzalı payload (`x-socialflow-signature-256`), olay filtreleme/wildcard, exponential backoff ile 5 deneme, Dead-Letter Queue (DLQ), 10 ardışık hatada devre kesici (circuit breaker), DLQ replay mekanizması, `FF_OUTGOING_WEBHOOKS` bayrağı | ✅ Tamamlandı | `tests/outbound-webhooks.test.ts` (9 test geçti), `/api/v1/webhooks/outgoing/**` API rotaları, `OutboundWebhookJob` kuyruk işleyicisi |
| **③ E-posta Sağlayıcı Soyutlaması** (§107) | `EmailProvider` arayüzü; sıfır bağımlılık yerel Node.js socket tabanlı `SmtpEmailProvider` (RFC 5321/5322 MIME, AUTH LOGIN, UTF-8 Base64), `ResendEmailProvider`, `SendGridEmailProvider`, `MemoryEmailProvider`, `ConsoleEmailProvider`; Türkçe şifre sıfırlama şablonu; **üretimde `devHint` kesinlikle kapalı** (`undefined`) | ✅ Tamamlandı | `tests/email-provider.test.ts` (6 test geçti), `/api/v1/auth/forgot-password` uç noktası |
| **④ Performans & İndeks Denetimi** (§119-§120) | `Content`, `PlatformContent`, `Schedule`, `MediaVariant`, `ContentPlanItem`, `Job` modellerine eksik bileşik indeksler eklendi; `EXPLAIN QUERY PLAN` ile tablo taramaları (SCAN TABLE) ve bellek içi sıralamalar (B-TREE SORT) elendi | ✅ Tamamlandı | `tests/performance-indexes.test.ts` (3 test geçti), `src/lib/database/indexAudit.ts` (`allQueriesUseIndex: true`) |

---

## 2. Mimari ve Bileşen Detayları

### 2.1. Webhook Güvenlik Temeli (§78)
- **İmza Doğrulama (`src/lib/webhooks/incoming.ts`):** `verifyWebhookSignature(rawBody, signature, secret)` fonksiyonu Node.js `crypto.timingSafeEqual` kullanarak timing attack zafiyetlerini engeller. `sha256=` ön ekini veya yalın 64-karakter hex formatını destekler.
- **Zaman Damgası Kontrolü:** `validWebhookTimestamp` fonksiyonu geleceğe yönelik 5 dakikalık tolerans ve Meta'nın 36 saatlik yeniden deneme penceresine uygun geriye dönük doğrulama yapar.
- **Kalıcı Tekilleştirme (Deduplication Skeleton):** `InboundWebhookEvent` tablosunda `@@unique([provider, eventId])` kısıtıyla mükerrer sağlayıcı callback'leri yakalanır. İlk gelişte `PENDING` durumuyla kaydedilip arka plan kuyruğuna (`InboundWebhookJob`) eklenir; tekrar geldiğinde `duplicate: true` döner ve mükerrer iş oluşturulmaz. Eğer aynı eventId ile farklı payload gelirse `duplicateMismatch: true` olarak işaretlenir.
- **Abonelik Onayı (Challenge):** `GET /api/v1/webhooks/inbound/[provider]` rotası Meta `hub.mode=subscribe`, `hub.challenge` ve `hub.verify_token` parametrelerini doğrulayarak resmî Meta webhook el sıkışmasını tamamlar.

### 2.2. Çıkış Webhook'ları (§93)
- **Veri Modeli (`WebhookSubscription` & `WebhookDelivery`):** Her çalışma alanına özel abonelikler ve teslimat kayıtları tutulur.
- **İmza ve Başlıklar:** Her istek `x-socialflow-signature-256` (HMAC-SHA256), `x-socialflow-timestamp`, `x-socialflow-delivery-id`, `x-socialflow-event` ve `SocialFlow-Webhooks/1.0` kullanıcı aracısı ile iletilir.
- **Retry ve DLQ Mekanizması:**
  - HTTP 2xx: `DELIVERED` ve ardışık hata sayacı sıfırlanır.
  - HTTP 4xx/5xx veya ağ hatası: `attempts` artırılır.
  - 1-4. denemeler: `RETRYING` durumu ve `10s * 2^(attempt-1)` exponential backoff ile kuyruğa yeniden planlanır.
  - 5. deneme (maxAttempts): `DEAD_LETTER` durumuna çekilir, hata mesajı kaydedilir.
  - Devre Kesici (Circuit Breaker): Bir abonelik peş peşe 10 kez `DEAD_LETTER` hatası üretirse otomatik olarak `isActive: false` yapılır ve `disabledReason` atanır.
  - Replay API: Dead-letter teslimatları `/api/v1/webhooks/outgoing/deliveries/[id]/retry` ile tek tıkla yeniden işletilebilir.

### 2.3. E-posta Sağlayıcı Soyutlaması (§107)
- **`EmailProvider` Arayüzü:** `src/lib/email/types.ts`
- **Sağlayıcılar:**
  - `SmtpEmailProvider`: Yerel Node.js soketleriyle EHLO, STARTTLS, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT komutlarını çalıştıran, RFC 5322 MIME formatında multipart/alternative HTML+Text e-posta üreten bağımlılıksız istemci.
  - `ResendEmailProvider` & `SendGridEmailProvider`: Resmî REST API uç noktalarıyla çalışan HTTP istemcileri.
  - `MemoryEmailProvider` & `ConsoleEmailProvider`: Testler ve yerel geliştirme için bellek içi outbox ve konsol çıktısı.
- **Güvenlik Kuralı (§107):**
  - Şifre sıfırlama (`/api/v1/auth/forgot-password`) isteğinde kullanıcı e-postası kayıtlı olsun ya da olmasın aynı nötr yanıt döner (kullanıcı numaralandırma engeli).
  - `devHint` alanı **üretim ortamında (`isProduction: true`) KESİNLİKLE tanımsız (`undefined`) döner**.
  - Yalnızca yerel geliştirme ve test ortamında (`!isProduction`) kolaylık amacıyla link döner.

### 2.4. Performans ve İndeks Denetimi (§119-§120)
Prisma şemasında aşağıdaki eksik indeksler eklendi:
1. `Content`:
   - `@@index([workspaceId, updatedAt])`: Dashboard son 6 içerik sorgusunu B-Tree sıralamasından kurtarır.
   - `@@index([workspaceId, brandId])`: İçerik listesinde marka bazlı filtrelemeyi hızlandırır.
2. `PlatformContent`:
   - `@@index([scheduledFor])` ve `@@index([enabled, scheduledFor])`: Takvim tarih aralığı sorgularını `PlatformContent_enabled_scheduledFor_idx` indeksine yönlendirir.
   - `@@index([socialAccountId])` ve `@@index([mediaAssetId])`: İlişkili foreign key sorgularını indeksler.
3. `Schedule`:
   - `@@index([scheduledFor, status])`: Yaklaşan paylaşım hatırlatmalarını optimize eder.
   - `@@index([contentId])`: Master içerik silme ve sorgulamalarında tablo taramasını engeller.
4. `MediaVariant`:
   - `@@index([workspaceId, createdAt])`: Varyant listesini hızlandırır.
5. `ContentPlanItem`:
   - `@@index([workspaceId, date])`: AI Planlayıcı takvim sorgularını doğrudan indeksler.
6. `Job`:
   - `@@index([workspaceId, status])` ve `@@index([workspaceId, createdAt])`: Kuyruk işçisi ve bakım temizliklerini optimize eder.

---

## 3. Test ve Kalite Güvencesi

Tüm testler çalıştırılmış ve sıfır hata ile geçmiştir:

```
Total Test Suites : 24
Total Unit & Integration Tests : 171
Passed : 171
Failed : 0
Typecheck : Passed (tsc --noEmit, 0 error)
Production Build : Passed (Next.js 14.2.35, 66 route başarıyla derlendi)
```
