# Sosyal Medya Sağlayıcıları

SocialFlow AI, her platformu **modüler bir adaptör** olarak soyutlar. Platform mantığı (OAuth, yayınlama,
doğrulama, analitik) uygulamanın geri kalanına **sızmaz**; tüm kod `SocialProvider` arayüzünü uygular.

---

## Desteklenen platformlar

| Platform | Kod | İçerik türleri |
|---|---|---|
| Instagram | `INSTAGRAM` | FEED, STORY, REEL |
| Facebook | `FACEBOOK` | FEED, STORY, REEL |
| X (Twitter) | `X` | POST |
| LinkedIn | `LINKEDIN` | POST, PROFILE_POST |
| TikTok | `TIKTOK` | VIDEO |
| YouTube | `YOUTUBE` | VIDEO |
| YouTube Shorts | `YOUTUBE` | SHORTS |
| Threads | `THREADS` | POST |
| Pinterest | `PINTEREST` | PIN |
| Google Business Profile | `GOOGLE_BUSINESS` | LOCAL_POST |

> YouTube ve YouTube Shorts aynı `YOUTUBE` platform kodunu, farklı `contentType` (VIDEO / SHORTS) kullanır.
> Her kombinasyonun limiti `PlatformRule`'da ayrı satırdır (bkz. `BUILTIN_RULES`).

---

## Adaptör arayüzü

`src/lib/social/types.ts` → `SocialProvider`:

```ts
interface SocialProvider {
  readonly platform: PlatformCode;
  readonly label: string;
  readonly apiVersion: string;

  // OAuth
  getAuthorizationUrl(p: { state; redirectUri; codeVerifier?; scopes? }): string;
  exchangeCode(p: { code; redirectUri; codeVerifier? }): Promise<TokenSet>;
  refreshToken(t: { accessToken; refreshToken? }): Promise<TokenSet>;
  fetchAccountProfiles(accessToken): Promise<AccountProfile[]>;
  validateToken(accessToken): Promise<{ valid: boolean; message? }>;

  // Doğrulama (kural motoruna ek, sağlayıcıya özgü)
  validateMedia(input, rule): MediaValidationResult;
  validateCaption(caption, rule): CaptionValidationResult;

  // Yayınlama
  publishPost(payload): Promise<PublishResult>;
  publishStory(payload): Promise<PublishResult>;
  publishVideo(payload): Promise<PublishResult>;
  schedulePost(payload): Promise<PublishResult>;
  deletePost(externalPostId, accessToken): Promise<{ ok; message? }>;
  getPostStatus(externalPostId, accessToken): Promise<PostStatusResult>;
  getAnalytics(externalPostId, accessToken): Promise<AnalyticsResult | null>;

  supports(contentType): boolean;
}
```

`PublishPayload` yayınlanacak her şeyi taşır: hesap bilgisi, açıklama, etiketler, ilk yorum, CTA, bağlantı,
medya URL'leri (sağlayıcının çekebileceği mutlak URL), `idempotencyKey`, `demoMode` ve **yalnızca sunucu
tarafında** eklenen `accessToken`.

`PublishResult` ise `ok`, `demoMode`, `externalPostId`, `permalink`, ham `providerCode/providerMessage/httpStatus`
(log için) ve kullanıcıya gösterilen Türkçe `friendlyMessage` + önerilen `action` + `retryable` içerir.

---

## Registry (sağlayıcı seçimi)

`src/lib/social/registry.ts` → `getProvider(platform, { forceReal? })`:

```
useDemo = !forceReal && (env.demoMode || kimlik bilgisi yok)
provider = useDemo ? new DemoProvider(platform) : new <Platform>Provider()
```

- `DEMO_MODE=true` **veya** ilgili platformun `*_APP_ID`/`*_APP_SECRET` (OAuth) kimlik bilgileri tanımsızsa
  → `DemoProvider` döner.
- Örnekler `instances` haritasında önbelleğe alınır (`PLATFORM:demo|real`).
- Bilinmeyen platform → `Error("Bilinmeyen platform: ...")`.

**Yeni platform eklemek:**
1. `PLATFORMS` dizisine kodu ekle (`src/lib/platforms/platforms.ts`).
2. `PLATFORM_META` kaydını tanımla (ad, ikon, renkler).
3. `BUILTIN_RULES`'a içerik türü satırlarını ekle (`src/lib/platforms/builtinRules.ts`).
4. `src/lib/social/providers/XxxProvider.ts` adaptörünü yaz.
5. `registry.ts` → `factories` haritasına ekle.
6. `.env`'e kimlik bilgisi değişkenlerini ekle (`env.providers`).

> Uygulamanın geri kalanında **hiçbir değişiklik gerekmez** — composer, kuyruk, yayınlama ve doğrulama
> otomatik olarak yeni platformu destekler.

---

## DemoProvider (demo dürüstlüğü)

`src/lib/social/providers/DemoProvider.ts`:

- Gerçek paylaşım **yapmaz** ve yapmış gibi **davranmaz**.
- Yayınlama hattının (kuyruk → doğrulama → deneme → durum → bildirim → retry) uçtan uca test edilmesi için
  gerçekçi bir simülasyon üretir; `latencyMs` ile gecikme, `failingPlatforms` ile kasıtlı hata simüle edilebilir.
- Sonuçlar her zaman `demoMode: true` işaretlenir; `permalink` **null** kalır (sahte kalıcı bağlantı üretilmez),
  `providerPostId` `demo_*` öneki taşır.
- Arayüzde "Demo Modu — gerçek sosyal medya paylaşımı yapılmadı." uyarısı gösterilir.
- `getAuthorizationUrl()` → `/sosyal-hesaplar?demo=1` (gerçek OAuth başlatmaz).

---

## OAuth2 akışı (gerçek mod)

`src/lib/social/oauth2.ts` + `OAuth2Provider`:

1. **State + PKCE üretimi:** `generateState()`, `generateCodeVerifier()`, `codeChallengeFromVerifier()`.
   `createOAuthState()` → `OAuthState` satırı (kısa ömürlü, tek kullanımlık).
2. **Yetkilendirme:** `buildAuthorizationUrl(config, { state, redirectUri, codeVerifier })` → kullanıcı
   sağlayıcıya yönlendirilir.
3. **Geri dönüş:** `/api/accounts/[id]/connect` → `consumeOAuthState(state)` (CSRF/tekrar-kullanım koruması)
   → `exchangeAuthorizationCode()` → `normalizeTokenResponse()` → `TokenSet`.
4. **Token saklama:** `toCipherText()` ile AES-256-GCM şifrelenir, `SocialProviderToken.accessTokenEnc`/
   `refreshTokenEnc` alanlarına **base64 String** yazılır. `tokenSetToExpiry()` ile `expiresAt`/`refreshExpiresAt`.
5. **Yenileme:** `refreshAccessToken()`; süresi dolan token'lar `TokenRefreshJob` ile kuyrukta yenilenir.
6. **Yayınlama:** `publishPlatformContent` token'ı **yalnızca sunucu tarafında** `fromCipherText()` ile çözer,
   `payload.accessToken`'a ekler. Token asla loglanmaz, asla istemciye dönmez, asla localStorage'a yazılmaz.

> `apiGet<T>(url, accessToken)` sağlayıcı API çağrıları için yardımcıdır.

---

## Yayınlama hattı (sağlayıcıdan bağımsız)

`src/lib/social/publishingService.ts`:

```
publishPlatformContent(pcId, ctx)
  ├─ PlatformContent + content + socialAccount + mediaAsset yükle
  ├─ APPROVAL_PENDING ise durdur (onay akışı)
  ├─ getRule(workspace, platform, contentType) — kural yoksa hata
  ├─ İdempotency: idempotencyKey = "pc:<id>:v<version>"
  │     mevcut PUBLISHED varsa → "zaten yayınlandı" (çift gönderim YOK)
  ├─ runPrePublishChecks: hesap bağlantısı, açıklama sınırı, medya, render
  ├─ status = PUBLISHING, publication = IN_PROGRESS
  ├─ buildPayload (medya URL, etiketler, ilk yorum, CTA, bağlantı)
  ├─ gerçek modda token çöz (demo modda atla)
  ├─ provider.publishPost/Story/Video (contentType'a göre)
  ├─ PublicationAttempt kaydet (ok, httpStatus, providerCode, durationMs)
  ├─ başarılı → publication/platformContent = PUBLISHED, notify, audit, rollup
  └─ başarısız → FAILED, friendlyMessage, notify, audit, rollup
```

- **Hedef bazlı bağımsızlık:** `publishContent(contentId, ctx)` tüm etkin hedefleri sırayla yayınlar; her
  hedefin kendi durumu güncellenir. Bir hedefin başarısızlığı diğerlerini **etkilemez**.
- **Kısmi başarı:** `rollupContentStatus` → bir kısmı PUBLISHED + bir kısmı FAILED ⇒ `PARTIALLY_PUBLISHED`.
- **Yeniden deneme:** `retryPlatformContent(pcId, ctx)` yalnızca o hedefi yeniden yayınlar; idempotency anahtarı
  aynı kaldığı için çift gönderim oluşmaz.
- **Hata çevirisi:** `toFriendlyError()` sağlayıcının ham hatasını Türkçe, kullanıcıya uygun mesaja + önerilen
  aksiyona (ör. "Hesabı Yeniden Bağla") çevirir; `retryable` (429/5xx → true, 401/403 → genelde false).

---

## Analitik dürüstlüğü

`getAnalytics()` yalnızca **gerçek modda** ve sağlayıcı API'sinden veri döndüğünde çağrılır
(`AnalyticsResult.source: 'API'`). Demo modda `AnalyticsSnapshot` **üretilmez**; "Analizler" ekranı boş kalır ve
bunu kullanıcıya açıkça belirtir. Sahte/uydurma analitik yoktur. Resmî olmayan scraping veya parola otomasyonu kullanılmaz.
