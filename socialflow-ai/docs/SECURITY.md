# Güvenlik

SocialFlow AI; oturum, CSRF, rol tabanlı yetki, token şifreleme, hız sınırı ve denetim kaydı katmanlarıyla
çok kiracılı (multi-tenant) bir uygulamadır. Bu belge tehdit modelini ve alınan önlemleri açıklar.

---

## 1. Oturum yönetimi

`src/lib/auth/session.ts` + `src/middleware.ts`:

- **Sunucu taraflı oturum:** `Session` tablosunda `tokenHash` (SHA-256), `csrfToken`, `expiresAt`, `ip`, `userAgent`,
  `revokedAt`. Ham oturum token'ı yalnızca **HttpOnly** çerezde (`sf_session`) tutulur — JS erişemez (XSS'e karşı).
- **Çerez bayrakları:** `httpOnly` (oturum), `sameSite=lax`, `secure` (üretimde `APP_ENV=production`), `path=/`,
  `maxAge = SESSION_TTL_DAYS`.
- **Edge middleware:** Yalnızca `sf_session` çerezinin **varlığını** kontrol eder (hızlı, DB'ye gitmez); korumalı
  sayfalara erişimde `/giris`'e yönlendirir. **Gerçek yetkilendirme her API rotasında ve sunucu bileşeninde** yapılır
  (`requireSession()` + DB doğrulaması).
- **Çıkış:** `destroySession()` oturumu `revokedAt` ile iptal eder ve çerezleri temizler.
- **Token'lar asla localStorage'da tutulmaz.** Oturum ve CSRF HttpOnly/çerez tabanlıdır.

### Önizleme otomatik girişi (yalnızca geliştirme + demo)
Arena canlı önizlemesi uygulamayı, **çerez saklamayan** (opak/üçüncü-taraf) bir iframe içinde ve
`e2b-traffic-access-token` gerektiren bir proxy arkasında sunar; ayrıca ham URL ayrı sekmede açılamaz.
Bu ortamda çerez tabanlı oturum teknik olarak çalışamaz. Bu yüzden **yalnızca** aşağıdaki koşulda
geçerli bir çerez oturumu yoksa demo kullanıcıya (`PREVIEW_DEMO_EMAIL`, varsayılan `demo@socialflow.ai`)
otomatik oturum verilir:

```
previewAuth = APP_ENV != "production"  &&  DEMO_MODE != "false"  &&  PREVIEW_AUTOLOGIN != "false"
```

- `previewAuth` etkinken: `getSession()` çerez yoksa demo oturumuna düşer, middleware korumalı sayfalara
  izin verir ve `verifyCsrf()` CSRF double-submit'i atlar (çerez saklanamadığı için).
- **Üretimde (`APP_ENV=production`) bu davranış TAMAMEN kapalıdır** — normal çerez + CSRF + RBAC güvenliği
  aynen uygulanır. Geliştirmede de `PREVIEW_AUTOLOGIN=false` ile kapatılabilir.
- Bu bir kolaylıktır ve yalnızca demo/önizleme içindir; gerçek kimlik doğrulamanın yerini almaz.

---

## 2. CSRF koruması

`src/lib/api.ts` → `apiRoute()` sarmalayıcı + `verifyCsrf()`:

- **Double-submit cookie:** `sf_csrf` çerezi (JS okuyabilir) + `x-csrf-token` (veya `x-xsrf-token`) başlığı.
  İstemci yarığı (`src/lib/client/api.ts`) her mutasyonda başlığı otomatik ekler.
- Yalnızca **mutasyon** yöntemleri (POST/PATCH/PUT/DELETE) doğrulanır; GET/HEAD/OPTIONS muaftır.
- Karşılaştırma **timing-safe** (`crypto.timingSafeEqual`) — zamanlama saldırısına karşı.
- Başarısızsa `403 CSRF_FAILED` ("Sayfayı yenileyip tekrar deneyin.").
- **Token rotasyonu:** Her girişten sonra `sf_csrf` yenilenir; istemci her mutasyondan önce güncel token'ı okumalıdır.

---

## 3. Rol tabanlı yetki (RBAC)

`assertRole(session, minimum)` + `hasRole(userRole, minimum)`:

| Rol | Kapsam |
|---|---|
| `OWNER` | Tam yetki (çalışma alanı sahibi) |
| `ADMIN` | Yönetim (ayarlar, kurallar, hesaplar) |
| `EDITOR` | İçerik oluşturma/düzenleme/yayınlama |
| `APPROVER` | Onay akışı (APPROVAL_PENDING içerikleri onaylama) |
| `VIEWER` | Salt okunur |

- **Çalışma alanı izolasyonu:** Her sorgu `workspaceId` ile kapsamlanır. Bir çalışma alanının kullanıcısı başka
  bir çalışma alanının içeriğini/hesabını/medyasını göremez veya değiştiremez
  (`publishPlatformContent` bile `pc.content.workspaceId !== ctx.workspaceId` ise reddeder).
- **Onay akışı:** `APPROVAL_PENDING` durumdaki hedef, onaylanmadan yayınlanamaz.

---

## 4. Token şifreleme (OAuth)

`src/lib/crypto.ts`:

- Sosyal sağlayıcı token'ları **AES-256-GCM** ile şifrelenir: `v1:<iv>:<authTag>:<ciphertext>` (base64).
- Anahtar `TOKEN_ENCRYPTION_KEY` (yoksa `SESSION_SECRET`) → SHA-256 ile 32 bayta türetilir.
- Şifreli token'lar `SocialProviderToken.accessTokenEnc`/`refreshTokenEnc` alanlarında **String** saklanır.
- Token **yalnızca sunucu tarafında**, yayın işi çalışırken `fromCipherText()` ile çözülür; `payload.accessToken`'a
  eklenir. **Asla loglanmaz, asla istemciye dönmez, asla localStorage'a yazılmaz.**
- GCM authTag bütünlüğü sağlar; biçim bozuksa veya anahtar değişmişse çözme başarısız olur
  → kullanıcıya "Hesabı yeniden bağlayın" aksiyonu.

> `TOKEN_ENCRYPTION_KEY` döndürülürse mevcut token'lar çözülemez; hesapların yeniden bağlanması gerekir.

---

## 5. Hız sınırı (rate limiting)

`src/lib/security/rateLimit.ts` + `apiRoute()`:

- Anahtar `${ip}:${pathname}`; pencere/limit `env.rateLimit` (varsayılan 120/60sn; `apiRoute` varsayılanı 180).
- Aşımda `429` + `rateLimitHeaders` (`X-RateLimit-*`, `Retry-After`).
- Brute-force (giriş) ve API kötüye kullanımını sınırlar. IP, ters proxy'nin `X-Forwarded-For` başlığından okunur.

---

## 6. Denetim kaydı (audit log)

`src/lib/security/audit.ts` → `audit({ workspaceId, userId, action, entityType, entityId, metadata })`:

- Kritik olaylar `AuditLog`'a yazılır: `publication.success`, `publication.failed`, içerik/hesap/kural değişiklikleri.
- Ham sağlayıcı hata kodları (`providerCode`, `httpStatus`) yalnızca log içindir; kullanıcıya Türkçe `friendlyMessage` gösterilir.

---

## 7. Girdi doğrulama

- API gövdeleri `src/lib/zod-lite.ts` ile doğrulanır; geçersiz girdi `400` + Türkçe mesaj.
- Tüm metin/mutasyon mesajları Türkçe ve kullanıcıya gösterilebilir; iç hata ayrıntıları sızdırılmaz.
- Medya yüklemede `contentHash` (SHA-256) ile tekilleştirme (`@@unique([workspaceId, contentHash])`).
- Prisma parametreli sorgular → SQL enjeksiyonuna karşı koruma.

---

## 8. Demo modu dürüstlüğü (güven/etik)

- `DEMO_MODE=true` iken `getProvider` → `DemoProvider`: gerçek paylaşım **yapmaz**, yapmış gibi **davranmaz**.
- Yayınlar `demoMode=true` işaretlenir; `permalink=null` (sahte kalıcı bağlantı yok), `providerPostId=demo_*`.
- Bildirimler "Demo Modu — gerçek sosyal medya paylaşımı yapılmadı." der.
- **Sahte analitik üretilmez** (demo modda `AnalyticsSnapshot` yazılmaz).
- **API doğrulamadan "yayınlandı" denmez.** İdempotency anahtarı çift gönderimi engeller.

---

## 9. AI güvenliği

`AI_SAFETY_RULES` (bkz. [AI_SERVICES.md](AI_SERVICES.md)):

- AI; fiyat, indirim, tarih, teknik özellik, yasal/tıbbi iddia veya URL **uydurmaz**. Yalnızca kullanıcının/marka
  profilinin verdiği bilgiler kullanılır; eksikse `[BİLGİ EKSİK: ...]` işaretlenir.
- Korunan terimler (ürün adı, fiyat, tarih, koşul, bağlantı, zorunlu etiket/mention) aynen korunur; metin kesilmez.
- LLM anahtarları yalnızca sunucu tarafında; asla `NEXT_PUBLIC_*` ile istemciye sızmaz.
- Hashtag güvenliği: spam/yasaklı etiketler (`#takipçisatın`, `#like4like` vb.) elenir.

---

## 10. Yasaklı uygulamalar

- **Resmî olmayan scraping veya parola otomasyonu kullanılmaz.** Yalnızca resmî OAuth akışları ve resmî API'ler.
- Kullanıcı sosyal medya parolaları **hiçbir zaman** istenmez veya saklanmaz.
- Sahte beğeni/takipçi/etkileşim üretilmez.

---

## 11. Üretim güvenlik kontrol listesi

- [ ] `SESSION_SECRET` ve `TOKEN_ENCRYPTION_KEY` güçlü, benzersiz, yedeklendi
- [ ] `APP_ENV=production` → çerezler `Secure`; tüm trafik HTTPS
- [ ] `DEMO_MODE=false` (gerçek paylaşım) + sağlayıcı kimlik bilgileri; aksi halde demo etiketlemesi görünür
- [ ] RBAC rolleri doğru atanmış; çalışma alanı izolasyonu test edildi
- [ ] Hız sınırı etkin; proxy `X-Forwarded-For`/`X-Forwarded-Proto` iletiyor
- [ ] Denetim kaydı izleniyor; token döndürme planı var
- [ ] LLM/sağlayıcı anahtarları yalnızca sunucu tarafında, gizli; log'da token yok
- [ ] `npm run build` + `npm test` geçiyor (idempotency ve kısmi başarısızlık testleri dahil)
