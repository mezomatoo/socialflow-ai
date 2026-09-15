# Faz 5 — Aşama 1 teslim raporu

**Tarih:** 15 Eylül 2026  
**Durum:** İlk gelen kutusu aşaması çalışır. **Faz 5 bütünü ve canlı sağlayıcı entegrasyonu tamamlanmadı.**  
**Canlı ekran:** `/app/gelen-kutusu`  
**Menü:** Topluluk ve Müşteriler → Gelen Kutusu

## COMPLETED — Tamamlananlar

- Mevcut uygulama önce başlatıldı ve canlı gösterildi. Yeni bir uygulama veya kimlik/yayınlama sistemi kurulmadı.
- [Faz 1–4 denetimi](PHASE5_AUDIT.md) yazıldı. Checkout'ta Faz 5 bulunmadığı ve önceki fazların bazı parçalarının eksik olduğu belirlendi.
- SocialProvider sözleşmesine ayrı engagement yetenekleri eklendi. Publishing yetenekleri değiştirilmedi.
- Konuşma, mesaj, katılımcı ve olay işleme temeli eklendi.
- Mevcut Job kuyruğuna `InboxEventJob` entegre edildi; ayrı kuyruk/broker kurulmadı.
- Türkçe üç sütunlu Gelen Kutusu, mobil liste/konuşma/bağlam görünümü eklendi.
- Elle etkileşim ekleme, listeleme, arama, filtreleme, sayfalama, okundu işaretleme, durum/öncelik, kişiye/kendine atama, etiket ve @üye bildirimli iç notlar çalışır.
- Atama geçmişi ve kritik işlemlerin audit kayıtları aynı veritabanı işlemi içinde yazılır.
- Marka bağlamından mevcut Marka Kiti'ne bağlantı verilir.
- İyileştirilen eski sorun: çıkış işlemi `NextResponse.next()` nedeniyle HTTP 500 döndürüyordu; artık uygun JSON 200 ve çerez temizleme yanıtı verir.

### İstenen adım sırasına göre gerçek ilerleme

| Adım | Durum |
|---|---|
| 1 — Denetim | Tamamlandı; geçiş borçları belgeli |
| 2 — Provider capability | Sözleşme ve kapalı varsayılanlar tamamlandı |
| 3 — Normalize konuşma/mesaj | Tamamlandı; elle giriş kaynağıyla doğrulandı |
| 4 — Webhook ingestion mimarisi | **Kısmi:** imza/zaman doğrulama yardımcıları, normalize olay kaydı, idempotency ve kuyruk var. Canlı provider normalizer/public webhook endpoint henüz yok |
| 5 — Unified Inbox | Elle eklenen kayıtlarla çalışır; sosyal API senkronizasyonu değildir |
| 6 — Atama/etiket/iç not | Kişi atama, etiket, iç not ve bildirim tamamlandı; ekibe atama yok |
| 7–32 | Tamamlandı denmez. İlk sırada Instagram dikeyinin resmî izinler ve testlerle tamamlanması var |

## TESTED — Test edilenler

| Kontrol | Sonuç |
|---|---|
| `npm run typecheck` | Başarılı |
| `npm test` | **16/16** mevcut regresyon testi başarılı |
| `npm run test:inbox` | **16/16** yeni test başarılı |
| `npm run build` | Prisma generate + Next üretim derlemesi başarılı |
| Lint | Hata yok; önceki BrandKit/Composer kodunda 2 hook dependency uyarısı devam ediyor |
| HTTP testleri | Oturumsuz 401, korumalı sayfada giriş yönlendirmesi, giriş 200, eksik/uydurulmuş CSRF 403, olmayan kayıt 404, geçersiz JSON 400, çıkış 200, iptal edilmiş oturum 401 |
| Tarayıcı | Chromium: oluştur → kuyruk → konuşma → kendime ata → iç not → etiket → çöz; başarılı |
| Mobil | 390×844 görünüm, müşteri bağlamı ve listeye dönüş; yatay taşma yok |
| Tarayıcı hataları | Test akışında pageerror yok |
| Son canlı kontrol | `/app/gelen-kutusu` HTTP 200 |
| Şema | 49 modelin kolonları hedef şema ile eşleşiyor; foreign_key_check temiz |
| Tekrarlı migration | İkinci çalıştırmada değişiklik yok |
| `git diff --check` | Temiz |

HTTP testi `tests/inbox-http.mjs` içindedir. PREVIEW_AUTOLOGIN=false ile **ayrı test.db** üzerinde çalıştırılır. Demo otomatik oturumun açık olduğu test, üretim kimlik doğrulamasının kanıtı olarak kullanılmadı. Tarayıcı doğrulaması yerel Chromium ile yapıldı; Arena proxy/üçüncü taraf çerez davranışının tüm kombinasyonları test edilmedi.

Tarayıcı testinde oluşturulan, “gerçek müşteri değil” etiketli tek test kaydı ve ona ait test artefaktları temizlendi. Mevcut kullanıcı kayıtlarına dokunulmadı; sahte mesaj/duygu/gelir analitiği bırakılmadı.

## DATABASE CHANGES — Veritabanı değişiklikleri

Eklenen **6 model** (43 → 49 model):

1. SocialParticipant
2. SocialConversation
3. SocialMessage
4. ConversationAssignment
5. ConversationTag
6. InboxEvent

Migration dosyaları:
- `202609150001_baseline`: başlangıç şemasının kaydı; mevcut DB'ye tekrar uygulanmaz.
- `202609150002_inbox_foundation`: ek tablolar ve composite unique index'ler. Eski tabloyu DROP/yeniden oluşturma veya DELETE yok.

`User`, `Brand`, `SocialAccount` modellerine workspace+id bileşik indeks/ters ilişkiler eklendi. Yeni ilişkiler workspace'i de taşıyan foreign key'lerle sınırlandırıldı. Hesap→marka uyumu ve atanacak aktif kullanıcı servis katmanında ayrıca doğrulanır.

`python3 scripts/migrate-inbox.py prisma/dev.db` başlangıç şemasını doğrular, yedek alır, migration ve Prisma history kaydını uygular, mevcut **43 tablonun kayıt sayısını koruduğunu** kontrol eder. Yedekler Git dışında `prisma/backups/` altındadır. Uygulama veritabanı sıfırlanmadı. Başlangıçta bulunmayan yerel dev/test DB'ler dışında seed çalıştırılmadı.

Gelen kutusu geçmişi olan demo hesap artık fiziksel silinmek yerine bağlantısı kesilerek korunur. Konuşma geçmişi olan marka silme isteği anlaşılır hata döndürür. Gerçek hesap token bağlantı kesme akışı korunur.

## PROVIDER CAPABILITIES — Sağlayıcı yetenekleri

`supportsComments`, `supportsCommentReply`, `supportsDM`, `supportsMentions`, `supportsReviews`, `supportsMessageHistory`, `supportsModeration`, `supportsWebhooks`, `supportsRealtimeEvents` sözleşmeye eklendi.

**Hepsi bu aşamada false.** Bu değerler sağlayıcının teorik API kapsamını değil, uygulamada doğrulanmış ve etkin entegrasyon kapsamını belirtir. Instagram dahil hiçbir platformda canlı inbox bağlantısı yapılmış gibi gösterilmez. Mevcut publishing adaptörleri bağımsız çalışmayı sürdürür.

## INBOX CHANGES — Gelen Kutusu değişiklikleri

- `/app/gelen-kutusu`; kısa `/gelen-kutusu` yönlendirmesi.
- `/api/inbox`, `/api/inbox/[id]`, `/api/inbox/options`, `/api/inbox/events/[id]`.
- 30 kayıt/sayfa; müşteri adı, mesaj ve etiket araması.
- Platform, marka, hesap, durum, öncelik, tür, atanan kişi ve okunmamış filtreleri.
- Konuşma sürümüyle optimistic concurrency; eski sürümle yazma 409 verir.
- İç notlar `direction=INTERNAL`, `messageType=NOTE` olarak ayrılır. Dış mesaj gönderen kod yolu yoktur.
- Elle girilmiş aynı isimli iki kişi otomatik birleştirilmez.
- Olay deduplication, mesaj benzersizliği, aynı anahtar/farklı içerik çatışması, işlem sonrası olay payload temizliği.
- Dış ağa reply API isteği de 422 `API_LIMITATION` ile reddedilir; yalnızca UI gizlemesi yapılmadı.

Henüz yok: ekibe atama, toplu aksiyonlar, kayıtlı görünümler, tarih/duygu/intent filtreleri, medya/cevap şablonları, gerçek zamanlı sağlayıcı güncellemeleri.

## CRM CHANGES — CRM değişiklikleri

Bu aşamada **yok**. Katılımcı modeli CRM contact/lead modeli olarak sunulmaz. Lead'e dönüşüm, müşteri timeline'ı ve attribution sonraki aşamalardır.

## LISTENING CHANGES — Dinleme değişiklikleri

Bu aşamada **yok**. Sosyal dinleme/marka izleme/inceleme için sahte veri, scraping veya çalışmayan menü sayfaları eklenmedi.

## SECURITY CHECKS — Güvenlik kontrolleri

- Yeni servisler her çağrıda oturum kullanıcısını DB'den yeniden doğrular; aktif kullanıcı ve workspace kontrolü yapar.
- Yazma rolleri: OWNER, ADMIN, EDITOR. VIEWER rolünü istek içinden OWNER gösterme girişimi reddedilir.
- Tenant dışı okuma/yazma/hesap/atama/@mention/işçi olay eşleştirmesi reddedilir; olmayan kayıtla aynı 404.
- Composite foreign key ile tenant dışı mesaj ekleme ayrıca DB seviyesinde reddedilir.
- Yeni mutasyonlar mevcut CSRF katmanına ek olarak **Session.csrfToken** ile doğrulanır. Uydurulmuş eşleşen çerez+header da 403 verir.
- İstekler rate limit, 32 KiB gövde sınırı ve alan/enum allowlist doğrulaması kullanır.
- Transaction içinde atama+bildirim+audit; kısmi yazma ve eski sürümden güncelleme test edilir.
- Hesap marka değiştirme işlemine workspace doğrulaması ve hesap mutasyonlarına EDITOR yetkisi eklendi.
- Provider HMAC-SHA256 ve 36 saatlik retry penceresine uygun zaman doğrulama **yardımcıları** test edildi. Bu, canlı webhook endpoint güvenlik kabulünün geçtiği anlamına gelmez; endpoint açık değildir.
- SSO/SCIM/client isolation/public API scope kontrolleri henüz uygulanmadı.

## PRIVACY CHECKS — Gizlilik kontrolleri

- Gereksiz ham provider payload/token tutulmaz; yalnızca elle girilen sınırlı mesaj/isim ve işlem kimlikleri işlenir.
- İşlenmiş olay payload'ı temizlenir; aynı mesaj iki yerde tutulmaz.
- İç not metni ve kişisel bilgi audit/atama/@mention bildirim gövdesine kopyalanmaz.
- Müşteri verisi AI sağlayıcısına gönderilmez; bu aşamada AI yanıt servisi yoktur.
- Hassas nitelik çıkarımı, kimlik otomatik eşleştirme veya korunan özelliklerden lead puanlama yoktur.
- Genel Prisma hata loglarının ve eski servis loglarının kurumsal PII sertleştirmesi hâlâ gereklidir.

## REGRESSION CHECKS — Regresyon kontrolleri

Mevcut içerik/publishing kısmi başarısızlık/Marka Kiti testleri geçti. Yeni test, gelen kutusu mutasyonunun sosyal hesap/token kaydını ve Publication sayısını değiştirmediğini doğrular. Giriş ve çıkış HTTP üzerinden doğrulandı.

OAuth callback eksikleri, gerçek sosyal ağa yayın ve mevcut olmayan Creative Studio/otomasyon/client portal gibi alanlar için “tam regresyon geçti” denmez. Gerçek provider kimlik bilgileriyle uçtan uca test yapılmadı.

## API LIMITATIONS — API kısıtlamaları

- Kullanıcı arayüzü açıkça **API KISITLAMASI** ve resmî platform uygulamasından yanıtlama alternatifini gösterir.
- Canlı yorum/DM/mention/review alma, yanıt/hide/delete/block kapalıdır.
- Meta güncel webhook dokümanı incelendi; mevcut OAuth'un inbox izinlerini taşıdığı varsayılmadı. Comment moderation referans içeriği erişim aracıyla alınamadı.
- Yayınlama API erişimi inbox erişimiyle eş tutulmaz.
- Sandbox Prisma native schema-engine indirme erişimi engelli; mevcut sürüm değiştirilmeden doğrulanmış query engine ve resmî offline schema WASM ile kurulum/build sağlandı. Ayrıntı denetim belgesinde.

## CURRENT ISSUES — Açık konular

1. Faz 5'in büyük bölümü henüz yok; bu sürüm tam ticari komuta merkezi olarak sunulmamalı.
2. Eski checkout'ta OAuth callback rotaları, genel otomasyon motoru, Product Catalog, Creative Studio ve semantik motor eksikleri var.
3. npm audit: 7 bildirim (2 orta, 4 yüksek, 1 kritik). Bağımlılık güncellemesi ve yeniden regresyon üretim kapısıdır.
4. Demo önizleme otomatik OWNER oturumu kullanır. Üretim verisiyle kullanılmamalı; üretimde APP_ENV=production, DEMO_MODE=false, PREVIEW_AUTOLOGIN=false gerekir.
5. Worker için `npm run worker` açık tutulmalı. Supervisor/deployment, kuyruk izleme ve yönetici yeniden deneme/DLQ arayüzü sonraki sertleştirme aşaması.
6. Eski route'ların CSRF/log/RBAC borçları ayrıca denetlenmeli. Yeni session-bound kontrol opt-in'dir, bütün eski API davranışı sessizce değiştirilmedi.
7. Yerel migration yedeği, üretim felaket kurtarma stratejisi değildir. Offsite yedek, saklama politikaları, restore tatbikatı ve gerçek RPO/RTO henüz belirlenmedi.
8. Marka/client bazlı yetki modeli yok; bu nedenle müşteri portalı açılmadı.

## NEXT — Sonraki aşama

1. Instagram için güncel resmî comment/DM endpoint, izin, App Review, rate limit ve retention matrisi tamamlanacak.
2. Mevcut OAuth callback ve inbox izin bağlantısı güvenli şekilde tamamlanacak; eski yayın izinleri korunacak.
3. Ham gövde imzası → güvenilir hesap eşleştirmesi → replay dedup → mevcut Job → Instagram normalizer → konuşma hattı dikey test edilecek.
4. Bir sağlayıcıda gerçek yorum/yanıt, izin varsa DM, hata/429/retry/sync/audit testleri bitmeden diğer sağlayıcılara geçilmeyecek.
5. Ardından hazır yanıt, Brand Kit + onaylı bilgi/Product Catalog tabanlı AI taslakları, sentiment/intent, SLA ve inbox analitiği.
6. Sonraki sıra: dinleme → itibar/incelemeler → CRM/lead → bilgi tabanı → otomasyon → ajans/client → API/webhook → entitlement/enterprise → operasyon merkezi.

**Sonuç:** Mevcut sistemi yeniden kurmadan, veriyi koruyan ve gerçek çalışma sınırlarını açıkça gösteren ilk Gelen Kutusu aşaması teslim edildi.
