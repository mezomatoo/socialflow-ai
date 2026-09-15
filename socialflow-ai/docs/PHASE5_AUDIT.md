# Faz 5 geçiş denetimi — 15 Eylül 2026

## Karar
Bu checkout yeni bir proje değildir. Ancak **Faz 1–4 tamamen bitmiş değildir ve Faz 5 bulunmamaktadır**. Mevcut sistem genişletilecek; eksik önceki fazlar yapılmış sayılmayacaktır. İlk aşama: normalize gelen kutusu, güvenli olay işleme temeli, Türkçe üç sütunlu arayüz, kişi atama, etiket ve iç not. Canlı sağlayıcı gönderimi bu aşamada kapalıdır. Sonraki adım tek sağlayıcı (Instagram) dikey entegrasyonudur.

## İncelenen alanlar / tekrar kullanım
| Alan | Kanıt ve durum | Faz 5 yaklaşımı |
|---|---|---|
| Uygulama | Next.js 14.2.35 App Router, React 18, Tailwind; tek uygulama `socialflow-ai/` | Aynı AppShell, apiRoute, istemci API yardımcısı |
| Veritabanı | Prisma 5.22; 1181 satırlık SQLite şeması; 43 model. PostgreSQL yalnızca hedef olarak belgelenmiş | Ek tablolar; mevcut tablolar/veriler korunur |
| Migration | Checkout'ta migration klasörü/yürütülmüş migration geçmişi yok; README db push kullanıyor | Mevcut şema için baseline, ardından yalnızca ekleyici SQL; mevcut DB'ye baseline körlemesine uygulanmaz |
| Kimlik / izolasyon | User bir workspace'e bağlı; Session hash, HttpOnly cookie; API sorgularında workspace kapsamı | Aynı oturum; yeni serviste her girişte workspace ve rol doğrulaması |
| RBAC / onay | OWNER/ADMIN/EDITOR/CREATOR/APPROVER/VIEWER, Content.approvedById/approvedAt, BrandKit izin kümeleri | Yeni kimlik veya ekip sistemi yok; mevcut aktif kullanıcıya atama |
| Ekip / yorum | Tam ekip/grup üyeliği ve genel içerik yorum sistemi bulunmadı | Ekibe atama tamamlandı denmeyecek; iç notlar müşteri mesajından açıkça ayrılır |
| Brand / Brand Kit | Brand, BrandVoice, BrandKit ve sürüm/renk/logo/CTA/yasal kural koleksiyonları var | Sağ panel mevcut marka bağlantısını kullanır; yeniden marka modeli yok |
| İçerik | Content → PlatformContent, bağımsız hedefler ve ContentVersion | Yayınlama modelleri değiştirilmez |
| Sağlayıcı | SocialProvider, BaseSocialProvider, OAuth2Provider, registry ve 9 platform kodu | Aynı sözleşmeye ayrı engagement yetenekleri; varsayılan kapalı |
| OAuth | State/PKCE, token şifreleme ve başlatma var | Mevcut bağlantıya dokunulmaz; **üretilen `/api/auth/{platform}/callback` rotaları checkout'ta yok** |
| Yayınlama | publishingService, Publication, PublicationAttempt, kısmi başarısızlık / retry | Dokunulmaz; gelen kutusu arızası bağımsız kalır |
| Zamanlama / kuyruk | Schedule, Job, koşullu claim, worker, retry | Aynı Job'a InboxEventJob eklenebilir; ikinci kuyruk kurulmaz |
| Kuyruk riskleri | next.config instrumentationHook etkin değil; enqueue read-then-create; retry gecikmesi lineer (doküman üstel diyor); FAILED terminal durum | İlk aşamada ayrı CLI işçi kullanımı belgelenir; eski yayın davranışına sessiz müdahale yok |
| Analitik / kampanya | AnalyticsSnapshot, analyticsService, Campaign ve içerik ilişkisi var; kapsamlı kampanya ekranı yok | Hayalî etkileşim/gelir/duygu verisi üretilmez |
| Medya | MediaAsset, canvas varyantları, storage soyutlaması | Yeni medya mimarisi yok; gelen mesaj dosyaları ilk aşamada kapalı |
| AI | Deterministik içerik servisleri + isteğe bağlı LLM, brandVoice | Yanıt asistanı sonraki aşama; ürün gerçeği yoksa fiyat uydurulmaz |
| Creative Studio | Bayraklar mevcut; tam stüdyo/AI üretim iş akışı yok | Tamamlandı olarak işaretlenmez |
| Otomasyon | `automationEngine` bayrağı false; genel koşul/aksiyon motoru yok | Job kuyruğu otomasyon motoru diye sunulmaz |
| Bildirimler | Notification, notify, kullanıcı/çalışma alanı kayıtları var | Atama ve @üye iç not bildirimlerinde mevcut tablo kullanılır |
| Product Catalog / Knowledge Base | Model/servis bulunmadı | AI fiyat yanıtı kabul testi şu anda engelli |
| BrandMemory / semantik | BrandMemory modeli ve nullable embedding var; semanticSearch false; vektör sorgu motoru yok | Bellek semantik arama çalışıyor denmez |
| White label | AppSettings appName/logo/renk/font mevcut | İleride aynı ayarlar genişletilir |
| Faz 5 | Conversation, Contact, Lead, Listening, Review, API key, entitlement modelleri ve rotaları yok | Aşamalı ekleme |

## Başlangıç doğrulaması (kod değişikliğinden önce)
- `npm ci`: başarılı; 7 güvenlik bildirimi (2 orta, 4 yüksek, 1 kritik). Next/esbuild/tsx/postcss/glob ve eslint zinciri; üretim için ayrı güncelleme ve regresyon gerekli.
- `npm run typecheck`: başarılı.
- `npm test`: 16/16 başarılı (ayrı, yeni test.db üzerinde).
- `npm run build`: başarılı (Prisma generate + Next üretim derlemesi).
- Canlı uygulama: 0.0.0.0:3000, `/anasayfa` HTTP 200.
- Bu checkout'ta başlangıçta DB dosyası yoktu. Yeni yerel dev/test DB oluşturuldu; yalnızca bu boş DB'ler seed edildi. **Mevcut seed.ts tüm veriyi temizler; mevcut kurulumda tekrar çalıştırılmamalıdır.**

### Sandbox kurulum kısıtı
binaries.prisma.sh TLS bağlantısı engelliydi. Prisma 5.22 query engine alternatifi, resmî sunucudaki SHA-256 (`35860a5c0fb2f79e7b38c40747c4d212318d97e1910ca528b133c802716de0b8`) ile byte-byte doğrulanarak yalnızca node_modules içine alındı. Şema SQL'i resmî `@prisma/schema-engine-wasm` ile offline datamodel diff üzerinden üretildi. Uygulamanın bağımlılık sürümü veya veritabanı sürücüsü değiştirilmedi. Generate/build için bu sandbox'ta `PRISMA_SCHEMA_ENGINE_BINARY=/bin/false` ve doğrulanmış `PRISMA_QUERY_ENGINE_LIBRARY` kullanıldı; db push/migrate CLI bu ortamda henüz çalışmıyor. Normal dağıtım Prisma'nın resmî motor sunucusuna erişebilmelidir.

## Güvenlik / gizlilik borçları
- Demo önizleme otomatik OWNER oturumu ve CSRF atlaması mevcut davranıştır. Gerçek müşteri verisiyle kullanılmamalı; üretimde APP_ENV=production, DEMO_MODE=false, PREVIEW_AUTOLOGIN=false zorunlu.
- Mevcut verifyCsrf double-submit karşılaştırıyor; yorumda belirtilen Session.csrfToken eşleştirmesi yapılmıyor.
- Mevcut API wrapper geliştirmede hata mesajı döndürüyor; ham hatalar loglanabiliyor.
- Workspace düzeyinde RBAC var; brand/client bazlı üyelik henüz yok. Client Portal açılmamalı.
- Gerçek sağlayıcı kimlik bilgileri/izinleri olmadan OAuth/yayın/webhook uçtan uca üretim testi yapılmadı.

## Sağlayıcı dokümanı kontrolü
15 Eylül 2026'da Meta'nın güncel dokümanı incelendi:
https://developers.facebook.com/documentation/instagram-platform/webhooks

Doküman: ham gövde üzerinde X-Hub-Signature-256 HMAC-SHA256, GET verify token/challenge, canlı uygulama ve Advanced Access, işletme doğrulaması, profesyonel hesap ve comment izinleri, 36 saate kadar retry/dedup gerektiriyor. Facebook Login ve Instagram Login izinleri/token/endpoint'leri farklıdır; mevcut yayınlama OAuth'unun inbox için hazır olduğu varsayılmamalı. Comment moderation referans sayfası araç üzerinden içerik döndürmedi. Bu nedenle yanıt/DM/moderasyon yetenekleri açılmayacak; sağlayıcı dikeyinin tamamlanması sonraki aşamanın kapısıdır.

## Aşama sınırı
Bu çalışma Faz 5'in tamamını teslim etmez. Önce kullanıcı tarafından girilen gerçek etkileşimlerle çalışan, açıkça **elle eklenen kayıt** olarak etiketlenen gelen kutusu temeli teslim edilir. Resmî API'den alınmış gibi örnek mesaj veya sahte başarı üretilmez. Canlı webhook, yanıt gönderme, CRM, dinleme, SLA, AI, ajans, public API ve enterprise sonraki aşamalar için açıkça raporlanır.

## Uygulama aşaması sonu ek bulgular
- HTTP regresyonda mevcut `destroySession()` yanıtının App Route içinde `NextResponse.next()` kullandığı ve 500 döndürdüğü bulundu; JSON başarı yanıtıyla düzeltildi.
- Yeni inbox mutasyonlarında `apiRoute` opt-in session-bound CSRF kontrolü eklendi; eski rotaların davranışı korunur.
- Hesap marka ilişkisinde workspace doğrulaması ve hesap değişikliklerine EDITOR yetkisi eklendi.
- Son şema: 43 mevcut + 6 yeni = 49 model. Ayrıntılar aşama raporundadır.
