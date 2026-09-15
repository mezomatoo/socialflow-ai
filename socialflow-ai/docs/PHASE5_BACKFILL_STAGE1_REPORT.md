# Faz 5 eksiklerinin tamamlanması — ara teslim 1

15 Eylül 2026. Kullanıcının düzeltmesi üzerine yeni Phase 6 sağlayıcı çalışmalarına ara verildi. İstenen dört eksikten **ürün kataloğu ve CRM/Lead temel iş akışları** eklendi. **Ajans portalı ve genel otomasyon motoru henüz uygulanmadı; istek bütünüyle tamamlanmış değildir.** Eski audit belgeleri kendi tarihlerindeki durumu gösterir; bu rapor güncel eklemedir.

## COMPLETED

### Ürün Kataloğu — `/app/katalog`
- Tek merkezi Product → ProductVariant; mevcut Workspace ve Brand ilişkileri. Sağlayıcıya özel ikinci ürün sistemi yok.
- Ürün oluşturma/düzenleme, SKU ile arama, marka/durum filtresi ve sayfalama.
- Varyant ekleme, workspace içinde tekil/normalize SKU; ürün başına 50 varyant sınırı açık.
- Tam sayı alt birim fiyatı, özgün para birimi ve ölçeği. TRY/USD/EUR/GBP/JPY/KWD destekli; FX yok. Bilinmeyen fiyat/stok null, ücretsiz/sıfır stok ayrı değerlerdir.
- Kullanıcı onaylı fiyat/stok düzeltmesi; gerekçe, optimistic sürüm, atomik audit ve InventoryMovement geçmişi. Sayıma dayalı stok; sipariş/mağaza senkronizasyonu değil.
- Arşivleme/yeniden etkinleştirme; geçmiş silinmez. Arşivlenmiş ürünün stok mutasyonu/fact reader kullanımı engellenir.
- Sunucu `productFacts` mevcut gerçek kayıtları kaynağı/doğrulama tarihiyle sunar; AI veya harici sağlayıcıya otomatik gönderim yok.

### CRM/Lead — `/app/musteriler`
- Kişi ekleme/düzenleme/arama/marka filtresi/sayfalama/arşivleme; isteğe bağlı e-posta/telefon. Hukuki dayanak beyanı zorunlu, otomatik kimlik birleştirme yok.
- Kişiye bağlı fırsat açma; mevcut User'a sorumlu atama ve mevcut Campaign ile ilişki. İkinci kampanya sistemi yok.
- Yeni → Nitelikli → Teklif → Kazanıldı/Kaybedildi aşamaları; manuel düzeltme mümkün, gerekçeli ve sürümlü işlem geçmişi. AI-only puanlama/otomatik karar yok.
- Ekip içi notlar; hiçbir dış mesaj veya yayın işi oluşmaz.
- Aynı workspace **ve marka** konuşmasını kişiye bağlama/yanlış eşleştirmeyi kaldırma. Mesaj/katılımcı/orijinal konuşma değişmez. CRM → Gelen Kutusu ve Gelen Kutusu → CRM gezinmesi.

## TESTED
- Mevcut 72 + katalog 14 + CRM 12 = **98/98** test; atlanan yok.
- `npm run typecheck`, üretim build ve `git diff --check` başarılı.
- Katalog tarayıcı E2E: gerçek oturum, ürün oluşturma, fiyat/stok düzeltme, stok geçmişi, ek varyant, bilinmeyen değerler, arşiv/filtre.
- CRM tarayıcı E2E: gerçek oturum, kişi/fırsat oluşturma, WON geçişi, iç not/geçmiş, arşiv/filtre.
- İki akış 390px mobilde yatay taşma/JS hatası olmadan sınandı. Ayrı test DB ve geçici workspace kullanıldı; yalnız test fixture kayıtları temizlendi.
- HTTP: her iki modülde eksik CSRF ve aynı sahte cookie/header tokenı 403. Reklamlar/organik hesaplar/Gelen Kutusu smoke tekrar geçti.
- CRM ilk test çalışması fixture'daki tekrarlanan sosyal hesap handle'ı nedeniyle başarısızdı; benzersiz handle düzeltildi, ardından tüm 12 test ve son 98 testlik regresyon geçti.

## DATABASE CHANGES
- `005_product_catalog`: Product, ProductVariant, InventoryMovement. Migration sırasında önceki 52 tablonun kayıt sayıları korundu.
- `006_crm_leads`: Contact, Lead, LeadActivity, ContactConversationLink; mevcut Campaign'e composite unique index. Önceki 55 tablonun kayıt sayıları korundu.
- 52 → 59 model. Dev/test DB'de altı migration, final foreign_key_check boş.
- İki migration güvenli installer ile yedeklenerek uygulandı; tekrar uygulama no-op doğrulandı. Reset/reseed/eski migration değişikliği yok. DB/backup/PII Git'e eklenmedi.

## AD PROVIDERS
Yeni reklam sağlayıcısı eklenmedi; mevcut yedi dizin yer tutucusu korunur. Canlı reklam entegrasyonu hâlâ yok.

## PROVIDER CAPABILITIES
Katalog/CRM kullanıcı tarafından girilen gerçek kayıtlarla çalışır. Mağaza, sipariş, stok veya CRM sağlayıcısı senkronizasyonu varmış gibi sunulmaz.

## PLATFORM RULES
Mevcut organik kurallar değiştirilmedi. Yeni reklam/platform kural uygulaması bu kapsamda değil.

## AD ACCOUNT CONNECTIONS
Reklam/organik credential tabloları ve bağlantıları değiştirilmedi. Katalogdan sağlayıcı kataloğuna aktarım yapılmaz.

## AD CREATION STATUS
Reklam WRITE kapalı; ürün veya kazanılmış fırsat reklam başlatmaz.

## CONVERSION STATUS
WON fırsat tahsilat/gelir/dönüşüm kanıtı değildir. Yeni revenue/ROAS/CPA sonucu veya analitik satırı üretilmez.

## FINANCIAL SAFETY CHECKS
Katalog fiyatı yerel ürün gerçeğidir; ödeme/harcama komutu değildir. Ondalık yuvarlama, negatif stok, aşırı sayı, desteklenmeyen currency ve eksik onay testli reddedilir. Fırsat kazanımı Job/AnalyticsSnapshot oluşturmaz.

## SECURITY CHECKS
- Aktif kullanıcı ve rol her servis girişinde DB'den okunur; gövdedeki workspace/role/izinler kabul edilmez.
- VIEWER okuyabilir; OWNER/ADMIN/EDITOR yazabilir. Yeni yazma endpoint'leri session-bound CSRF ve rate limit kullanır.
- Workspace dışı marka/ürün/varyant/kişi/konuşma/kampanya/sorumlu reddedilir; composite FK'ler DB sınırı sağlar.
- Sürüm uyuşmazlığı değişiklikleri geri alır; başarısız SKU/eşleştirme transaction'ı kısmi kayıt bırakmaz.
- 16 KiB gövde sınırı ve hassas hata metnini gizleyen hata zarfı. Okuma/hata yanıtları no-store.

## PRIVACY CHECKS
Kişi email/telefonu audit metadatasına kopyalanmaz; notlar dış servise/LLM'e aktarılmaz. Eşleştirme manuel/geri alınabilir. Arşivleme **kişisel veriyi silme değildir**; UI bunu açıklar. Hukuki dayanak kutusu hukuki uygunluğu otomatik kanıtlamaz. Kurumsal saklama/silme talebi akışı henüz yok.

## API LIMITATIONS
- Katalog: 50 varyant/ürün; ayrıntıda son 20 stok hareketi. Görsel, kategori ağacı, feed/import, sipariş, rezervasyon ve mağaza senkronizasyonu henüz yok.
- CRM: 100 fırsat/kişi; ayrıntıda son 30 aktivite/fırsat. Seçiciler son 100 mevcut kampanya ve bağlanmamış konuşmayı sunar. Toplu import/export, merge ve gelişmiş kanban/raporlar henüz yok.
- Product facts okuyucusu AI yanıt akışına henüz bağlanmadı; AI ürün fiyatını doğru cevaplıyor kabul testi tamamlanmış sayılmaz.

## REGRESSION CHECKS
Önceki sekiz test grubunun tamamı çalıştırıldı. Content/PlatformContent/Publication/MediaAsset/BrandKit/provider token mimarisi yeniden yazılmadı. Inbox'a yalnız tenant-scope CRM bağlantı kimliği eklendi; flag kapalıysa döndürülmez.

## CURRENT ISSUES
- **Ajans/client portalı ve genel otomasyon motoru açık işlerdir.** agencyManagement/clientPortal/automationEngine bayrakları kapalıdır; menü/boş ekran eklenerek tamamlandı denmedi.
- Önceki Faz 5 sağlayıcı gönderimi/dinleme/reviews/public API/abonelik gibi açık başlıklar da bu teslimle kapanmadı.
- 7 bağımlılık güvenlik bulgusu ve eski audit borçları sürüyor. Build başarılı olmakla birlikte hook lint uyarıları mevcut; temiz lint iddiası yok.

## NEXT
1. Ajans: mevcut Brand üzerinden müşteri kapsamı, client üyelik/izinleri; süreli/iptal edilebilir güvenli portal erişimi. İç not ve diğer müşterilerin verisi hiçbir portal DTO'suna girmemeli. Müşteri değerlendirmesi mevcut içerik/onay akışına bağlanmalı; otomatik yayın olmamalı.
2. Otomasyon: mevcut Job kuyruğunda çalışan tek koşul/aksiyon motoru; varsayılan pasif kurallar, dry-run, açık etkinleştirme, idempotency, tenant/rol tekrar denetimi, retry/DLQ ve denetim kaydı. Otomatik dış mesaj, yayın ve finansal aksiyonlar açılmamalı.
3. Bu iki dikeyin güvenlik/UI/regresyon testleri ve ayrı commit/push'ları; ardından eksik Faz 5 kabul testleri yeniden değerlendirilmeli.

## Çalıştırma ve GitHub
- Sayfalar: `/app/katalog`, `/app/musteriler`.
- Bayraklar: `FF_PRODUCT_CATALOG`, `FF_SOCIAL_CRM`, `FF_LEAD_MANAGEMENT`; bu yerel iş akışları varsayılan açık.
- Testler: `npm run test:catalog`, `npm run test:crm`. `test:setup` mevcut veri üzerinde kullanılmamalı.
- Migration kurulumu: uygulama/worker durdurulduktan sonra önce `python3 scripts/migrate-catalog.py prisma/dev.db`, ardından `python3 scripts/migrate-crm.py prisma/dev.db`. Mevcut migration 004 gerekli.
- Dal: `arena/01a0a3eb-socialflow-ai`; main değiştirilmedi. Commitler push edildi: `55b8bca`, `1b63d32`, `edd7b83`, `7abe2d8`, `5b98023`, `3163feb`, `924c346`.
