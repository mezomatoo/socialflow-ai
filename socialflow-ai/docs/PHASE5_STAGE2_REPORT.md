# Faz 5 — Aşama 2: Instagram OAuth ön koşulu

Tarih: 15 Eylül 2026. Dal: `arena/01a0a3eb-socialflow-ai`.

**Durum:** Instagram hesabını doğrulayarak bağlama/yeniden yetkilendirme kod akışı eklendi. Canlı Meta hesabı ve App Review ile uçtan uca doğrulama yapılmadı. Bu aşama, canlı gelen kutusu webhook/yanıt entegrasyonunun ön koşuludur; onun tamamlandığı anlamına gelmez.

## COMPLETED — Tamamlananlar ve GitHub kayıtları

Her tamamlanan kod adımı test edildikten sonra commit edildi ve aynı çalışma dalına push edildi:

| Commit | İşlem |
|---|---|
| `4f17f82` | OAuth state kullanıcı/workspace/provider bağı; atomik tek kullanımlık tüketim; PKCE verifier temizliği |
| `3978963` | Hedef hesap/redirect URI/hesap sürümü için ekleyici migration; yedekli uygulama aracı |
| `5678a30` | Instagram callback, doğrulanmış izinler ve doğru hesap eşleştirmesi; şifreli tokenı atomik değiştirme |
| `a4441cb` | OAuth öncesi gerçek hesabı bağlı göstermeme; hesap ekleme RBAC/tenant/kimlik kontrolleri |
| `377966e` | Proxy uyumlu göreli ve sabit callback dönüşü; doğru yetkilendirme düğmesi metni |

İlgili akış:

`Sosyal Medya Hesapları → Yetkilendir → mevcut InstagramProvider OAuth → /api/auth/instagram/callback → state + hesap + izin doğrulama → mevcut SocialProviderToken kaydına şifreli yazma → Türkçe sonuç bildirimi`.

- Mevcut Instagram publishing OAuth izinleri korunur; gerçek hesabın kayıtlı ilave izinleri de yeniden istenir ve verilmeden token değiştirilmez.
- Demo kapsamları gerçek API izni olarak istenmez.
- Mevcut gerçek hesabın provider ID'si sabittir; ilk bağlantıda/demo dönüşümünde verilen kullanıcı adı, Meta'nın döndürdüğü yetkili profesyonel hesapla eşleşmelidir. Birden fazla/yanlış eşleşme reddedilir.
- OAuth sırasında hesap değiştirilir veya bağlantı kesilirse callback onu tekrar etkinleştiremez.
- Meta iptali, eksik izin, ağ/provider hatası ve yanlış hesap mevcut tokenı temizlemez.
- Demo ve preview otomatik oturumları canlı OAuth tamamlayamaz.
- Yeni gerçek hesap `NEEDS_REAUTH` olarak eklenir; sadece OAuth doğrulaması `ACTIVE` yapar. İstemci tarafından gönderilen `externalId`, `scopes`, `connectionStatus`, `demoAccount` iddiaları gerçek bağlantı kanıtı olarak kabul edilmez.

## TESTED — Test edilenler

Toplam **53/53** test başarılı:

| Komut | Sonuç |
|---|---|
| `npm test` | 16/16 önceki içerik/publishing/Marka Kiti testleri |
| `npm run test:inbox` | 16/16 Gelen Kutusu testleri |
| `npm run test:oauth` | 3/3 state bağlama, süresi dolma ve eşzamanlı replay testi |
| `npm run test:instagram` | 14/14 callback, izin, token koruma, hesap değiştirme, demo ve pagination testleri |
| `npm run test:accounts` | 4/4 doğrulanmamış bağlantı, tenant, RBAC ve normalize handle testleri |
| `npm run typecheck` | Başarılı |
| `npm run build` | Başarılı |
| Lint | Hata yok; önceki 2 hook dependency uyarısı devam ediyor |
| `git diff --check` | Temiz |

Instagram testleri **enjekte edilen sahte test adaptörü / stub HTTP yanıtları** kullanır; gerçek Meta API başarısı olarak raporlanmaz. Test kayıtları yalnızca test.db'de, testlerin oluşturduğu benzersiz çalışma alanlarında tutulur ve temizlenir.

Tarayıcı kontrolü (Chromium): Sosyal Medya Hesapları, demo yeniden yetkilendirme bildirimi, Türkçe callback hata bildirimi, 390 px mobil görünüm ve mevcut Gelen Kutusu açıldı; yatay taşma/runtime hatası görülmedi. Demo tıklaması dış Meta sayfasına gitmedi.

HTTP kontrolü: geçersiz callback / demo otomatik oturum için 303 ve yalnızca `/sosyal-hesaplar?baglanti=forbidden`; code/state/provider hata metni Location içine taşınmadı. `Cache-Control: no-store` ve `Referrer-Policy: no-referrer` mevcut. Canlı Gelen Kutusu HTTP 200.

## DATABASE CHANGES — Veritabanı

`202609150003_oauth_binding` yalnızca OAuthState'e üç nullable alan ekler:
- `socialAccountId`
- `redirectUri`
- `accountUpdatedAt`

Yeni model yok; toplam 49 model. Eski OAuth kayıtları değiştirilmez, ancak hesap bağı olmayan eski state'ler yeni Instagram callback ile tamamlanamaz; kullanıcı bağlantıyı yeniden başlatır.

`python3 scripts/migrate-oauth.py prisma/dev.db` ve ayrı test.db üzerinde uygulandı. Önce uygulama/işçi durduruldu. Online SQLite backup alındı, önceki migration checksum'ları ve FK'ler doğrulandı; **49 mevcut tablonun kayıt sayıları korundu**. İkinci çalıştırmada değişiklik yapılmadı. Veritabanı sıfırlanmadı ve seed çalıştırılmadı.

GitHub'a kod/migration/test/doküman gönderilir; **.env, tokenlar, DB dosyaları ve yerel yedekler gönderilmez**. Yerel yedek ayrı bir üretim/offsite yedekleme sistemi yerine geçmez.

## PROVIDER CAPABILITIES — Sağlayıcı yetenekleri

- Sadece mevcut InstagramProvider genişletildi; başka platform dikeyi açılmadı.
- Facebook Login üzerinden Instagram profesyonel hesap keşfi ve `/me/permissions` izin kontrolü eklendi.
- Cursor pagination sabit `graph.facebook.com` origin'inde yapılır; `paging.next` URL'sine token gönderilmez.
- Hesap keşfi gereksiz Page access_token alanını artık istemez.
- Token değişimi/bağlantı sorgularında zaman aşımı ve redirect reddi var.
- Mevcut Graph v21.0 publishing endpoint'leri bu aşamada topluca değiştirilmedi; deployment öncesinde seçilen sürümün yaşam döngüsü tekrar doğrulanmalı.
- Yorum/DM/mention/review/webhook/yanıt engagement capability bayrakları **kapalı kalır**. OAuth başarısı inbox entegrasyonu başarısı değildir.

## INBOX CHANGES — Gelen Kutusu

Mevcut elle giriş akışı korunur. Canlı webhook veya sosyal ağa gönderilen reply eklenmedi. Inbox, publishing bağlantı sağlığını otomatik sahiplenmez. Sonraki adım güvenilir account mapping ve Instagram provider normalizer'dır.

## CRM CHANGES — CRM

Bu aşamada yok. Katılımcı kayıtları lead/contact gibi sunulmaz.

## LISTENING CHANGES — Dinleme

Bu aşamada yok. Scraping veya sahte mention eklenmedi.

## SECURITY CHECKS — Güvenlik

- Tek kullanımlık state koşullu DB güncellemesiyle atomik tüketilir; 8 eşzamanlı denemeden yalnızca biri başarılıdır.
- Yanlış kullanıcı/workspace/provider denemesi doğru kullanıcının state'ini tüketmez.
- Callback ve bağlantı başlangıcı gerçek oturum ve persisted EDITOR+ yetkisi gerektirir; preview otomatik oturumu reddedilir.
- Bağlantı başlangıcı ve hesap ekleme, mevcut session-bound CSRF kontrolüne bağlıdır.
- Yetki, hesap sürümü ve workspace demo durumu provider çağrılarından sonra transaction içinde tekrar doğrulanır.
- Token/hesap/audit yazımı aynı transaction'dadır; başarısız yeniden yetkilendirmede eski token byte-for-byte korunur.
- Başka workspace markasıyla hesap oluşturma, geçersiz platform ve role spoof reddedilir.
- Başarı sonrası replay provider'a ikinci token isteği göndermez.
- Sabit göreli redirect; kullanıcı redirect parametresi veya provider hata metni kullanılmaz.

## PRIVACY CHECKS — Gizlilik

- Tokenlar mevcut AES-256-GCM yardımcılarıyla şifrelenir; API response'a, audit'e veya callback Location'a konmaz.
- Callback audit yalnızca sabit provider/reason kodları taşır; state ve authorization code kaydedilmez.
- State tüketiminden sonra PKCE verifier DB'den temizlenir.
- Yeni akış müşteri mesajını AI'ye göndermez.
- **Deployment notu:** Next geliştirme sunucusu ve reverse proxy erişim logları query string yazabilir. Gerçek OAuth için callback query'lerinin proxy/APM loglarından çıkarılması gerekir; bu uygulama kodu dışındaki katmanlar burada yapılandırılmadı.

## REGRESSION CHECKS — Regresyon

Önceki 32 test geçti; yeni testler callback'in Publication sayısını değiştirmediğini ve hata halinde hesap/token kaydını koruduğunu doğrular. Publishing/scheduling iş türleri ve Brand Kit değiştirilmedi. Mevcut Job işçisi tekrar başlatıldı. Gerçek sosyal ağa yayınlama regresyonu için bağlı test hesabı gereklidir; yapılmış sayılmaz.

## API LIMITATIONS — Kısıtlamalar

Resmî kaynaklar 15 Eylül 2026'da incelendi:
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login
- https://developers.facebook.com/docs/graph-api/reference/user/permissions/

Facebook Login modeli tüketici hesaplarını değil, Facebook Sayfasıyla ilişkili Instagram profesyonel hesaplarını hedefler. Yalnızca `granted` izinler kabul edilir; talep edilmiş izin, verilmiş izin sayılmaz. Inbox yorum ve DM izinleri ayrıca doğrulanacaktır.

Gerçek çalıştırma için: doğru Meta app kimlik bilgileri, kayıtlı HTTPS callback URI, gerçek kullanıcı oturumu, demo olmayan workspace, gerekli Meta izinleri/App Review ve yetkili profesyonel hesap gerekir. Bunlar olmadan gerçek bağlantı yapıldığı iddia edilmez.

## CURRENT ISSUES — Açık konular

- Canlı Instagram webhook/comment/reply/DM dikeyi henüz tamamlanmadı.
- Bu aşama yalnızca Instagram callback'ini tamamlar; diğer sağlayıcı callback eksikleri devam eder.
- Başlangıç denetimindeki bağımlılık güvenlik bildirimleri, genel otomasyon/Product Catalog/Creative Studio ve kurumsal güvenlik borçları devam eder.
- Doğrulanmış token saklama mevcut sistem üzerinden yapılır; uzun ömürlü token dönüşümü/otomatik yenilemenin Meta'ya özgü tamamlanması ayrıca gereklidir.
- Çok sayıda hesabı olan kullanıcıda pagination 20 sayfalık güvenli sınırı aşarsa işlem başarısız olur; kısmi listeyle yanlış hesap bağlanmaz.
- .env ve yerel DB'nin GitHub dışında tutulması güvenlik gereğidir; veri kaybına karşı kalıcı haricî yedekleme ayrıca gereklidir.

## NEXT — Sıradaki adım

1. Instagram comment webhook alanları/örnek payload/izin matrisi ve hesabın webhook abonelik durumu.
2. Ham gövde HMAC doğrulaması, replay ve timestamp kontrolü, belirsiz olmayan hesap/workspace eşleştirmesi.
3. Mevcut InboxEvent/Job yapısına provider normalizer entegrasyonu; gerçek gelen yorumların idempotent kaydı.
4. Resmî comment reply endpoint'i, izin kontrolü, güvenli retry ve manuel kullanıcı onaylı gönderim.
5. Bu dikey tamamlandıktan sonra desteklenen DM, hazır yanıtlar ve bilgiye dayalı AI taslakları.

Bu aşamadaki tamamlanan ve test edilen kod adımları aynı dala ayrı commit ve push ile kaydedildi.
