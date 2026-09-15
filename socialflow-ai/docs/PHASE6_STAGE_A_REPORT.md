# Phase 6 — Stage A: Reklam altyapısı

15 Eylül 2026. Mevcut uygulamaya eklenen ilk aşama; **Phase 6'nın tamamı veya Meta entegrasyonu tamamlanmış değildir.**

## COMPLETED
- Kod öncesi repo/şema/migration/24 alan denetimi: `PHASE6_AUDIT.md`.
- Ayrı READ-first AdvertisingProviderAdapter, kayıt dizini, 27 yetenek sözleşmesi ve reklam rol izinleri.
- Workspace kapsamlı hesap listeleme/ayrıntı/özet API; yerel marka eşleştirmesi, optimistic sürüm kontrolü ve atomik audit.
- Türkçe ana Reklamlar kategorisi; `/app/reklamlar` ve `/app/reklamlar/hesaplar`. Yerel filtreleme/sayfalama, hesap ayrıntısı ve yetkili marka eşleştirme UI.
- 23 özellik bayrağı: yalnız paidMedia varsayılan açık; sağlayıcı, finansal ve ileri modüller kapalı.
- Yeni reklam/bağlantı düğmeleri açıklamalı devre dışı; sonraki bölümler çalışan modül gibi değil yol haritası olarak gösterilir.

## TESTED
- `npm test`: 16/16; `test:inbox`: 16/16; `test:oauth`: 3/3; `test:instagram`: 14/14; `test:accounts`: 4/4; `test:advertising`: 19/19. **72/72**, atlanan yok.
- `npm run typecheck`, üretim build, `git diff --check`: başarılı. Build mevcut doğrulanmış Prisma query engine ile ortam override kullanılarak çalıştırıldı.
- Chromium/Playwright üretim sunucusu smoke: 1440px masaüstü ve 390px mobil; boş hesap durumu, sağlayıcı filtresi, yenileme, sekiz eksik metrik, yedi pasif sağlayıcı kartı; yatay taşma ve JS runtime hatası yok. Mobil sidebar geçişinin tamamlanması beklendi.
- Gerçek çerez oturumuyla HTTP: eksik CSRF 403; aynı sahte cookie+header tokenı kayıtlı oturumla eşleşmediği için 403; doğru CSRF ile bulunmayan hesap 404; finansal işlem 403; uygulanmamış OAuth 422; okuma no-store.
- Smoke sandbox araçlarıyla çalıştırıldı; kalıcı otomatik reklam testleri `tests/advertising-{contracts,service}.test.ts`. Gerçek sağlayıcı hesabında uçtan uca test yapılmadı.

## DATABASE CHANGES
- Additive `202609150004_advertising_foundation`: AdAccount, AdAccountCredential, AdProviderCapability; 49 → 52 Prisma model.
- Güvenli installer: önceki migration/checksum denetimi, SQLite yedeği, eski kayıt sayısı/FK kontrolleri; tekrar çalıştırmada no-op.
- Dev/test DB'ye uygulandı; migration sırasında mevcut 49 tablonun kayıt sayıları korundu. Son kontrolde ikisinde de dört migration, FK ihlali yok.
- Reset/reseed yok; eski migration dosyaları değişmedi. DB/token/yedek Git'e eklenmedi. Yerel yedek harici felaket kurtarma yedeği değildir.

## AD PROVIDERS
Meta, Google, LinkedIn, TikTok, X, Pinterest, Snapchat yalnız dizin yer tutucularıdır. **Canlı reklam entegrasyonu: 0.** YouTube Google Ads altında; ikinci kampanya/organik yayın sistemi yok.

## PROVIDER CAPABILITIES
27 yetenek mevcut adaptörlerde false. Hesap kanıtı, doğrulanmış bağlantı ve adaptör desteğiyle kesiştirilir; DB'deki true uygulanmamış işlemi açamaz. Bozuk kanıt kapalı sonuç verir. Sağlayıcı READ metotları açık API_LIMITATION döndürür, sahte veri üretmez.

## PLATFORM RULES
Sağlayıcıya özgü reklam kuralları/API sürümü/format-policy denetimi henüz yok. Organik kurallar değişmedi. Meta READ öncesi güncel resmî Marketing API belgeleri, izinler, sürüm ve sınırlamalar doğrulanmalı.

## AD ACCOUNT CONNECTIONS
Yerel okuma ve marka eşleştirmesi çalışır. OAuth/token import/sağlayıcı keşfi/senkronizasyonu yok. Organik token reklam yetkisi sayılmaz. Credential alanları okuma sorgusuna/DTO'ya alınmaz; yalnız expiry metadatası gösterilir. Tokenı eksik/süresi geçmiş veya doğrulaması olmayan CONNECTED kayıt yeniden yetki gerektirir. Geçmiş sync tarihi güncel sağlık garantisi değildir.

## AD CREATION STATUS
Sihirbaz, PaidCampaignGroup/PlatformAdDraft, creative snapshot ve Meta WRITE uygulanmadı. Content/PlatformContent/MediaAsset değişmez; bu aşamada reklama dönüştürme veya sağlayıcıya gönderme yok.

## CONVERSION STATUS
Pixel/CAPI, conversion gateway, attribution, revenue, creator/UGC, affiliate ve commerce sonraki aşamalardır. Veri toplama başlamadı; dönüşüm/gelir/ROAS uydurulmadı.

## FINANCIAL SAFETY CHECKS
Finansal servis koşulsuz PAID_MEDIA_WRITE_DISABLED döndürür; FF_PAID_MEDIA_WRITE=true bile açamaz. Adaptörde finansal komut yok. OWNER/VIEWER/EDITOR reddi ve Job/Publication/organik token değişmemesi test edildi. Büyük bütçe ikinci onayı ve sağlayıcı finansal audit henüz yok; bu nedenle harcama açılamaz.

## SECURITY CHECKS
- Aktif kullanıcı/rol DB'den doğrulanır; istemcinin OWNER iddiası yetki yükseltmez.
- Workspace dışı hesap/marka reddedilir; composite FK tenant dışı ilişkileri engeller.
- PATCH yalnız brandId+version; bütçe/token/currency/status/permission enjeksiyonu reddedilir. Mutasyon session-bound CSRF ve rate limit kullanır.
- JSON 16 KiB sınırı; reklam hata zarfı beklenmeyen token/hata metni döndürmez. Genel auth wrapper eski davranışını korur.

## PRIVACY CHECKS
Token tarayıcıya/localStorage'a gönderilmez. Credential tablosu şifreli saklama alanları içerir; gerçek token yazan OAuth henüz yok. Hedef kitle/kişisel dönüşüm/hassas özellik çıkarımı yok; reklam ağına çağrı yapılmaz. Özgün currency/timezone korunur; eksik metrik null/NOT_SYNCED, ölçülmüş sıfır ayrı AVAILABLE durumudur.

## API LIMITATIONS
OAuth, campaigns/ads/metrics READ, WRITE, webhook ve conversion API'leri uygulanmadı. Kartlar platformların genel yeteneksizliğini değil **bu sürümün uygulama eksiğini** belirtir. App Review, iş doğrulama, gerçek hesap izinleri ve üretim onayı sınanmadı.

## REGRESSION CHECKS
Önceki 53 test tekrar geçti; organik hesaplar/Gelen Kutusu tarayıcıda açıldı. Yayınlama, auth, Brand Kit, Analytics, approvals ve kuyruk yeniden yazılmadı. Uygulama ve mevcut worker yeniden başlatıldı.

## CURRENT ISSUES
- npm audit borcu: 7 bulgu (2 moderate, 4 high, 1 critical); bağımlılık yükseltmesi yapılmadı.
- Önceki audit'teki eski modüllerin CSRF/loglama/callback/worker garantisi eksikleri sürüyor; tüm ürün güvenli/eksiksiz ilan edilmez.
- Sağlayıcı entegrasyonları/ileri Phase 6 modülleri tamamlanmadı. Demo DB'de gerçek reklam hesabı yok; dolu kayıt/marka eşleştirme ayrı test DB servis testleriyle sınandı; dolu kayıt UI uçtan uca testi yapılmadı.

## NEXT
1. Meta güncel resmî Marketing API belgeleri ve uygulama izinlerini doğrula.
2. Meta resmî OAuth + doğrulanmış ad account READ dikeyini ayrı testli commitlerle tamamla.
3. Meta campaign/ad READ ve currency/timezone/freshness taşıyan metrik geçmişi.
4. Sonra versioned rules, eligibility, immutable snapshots ve sağlayıcıya özgü sihirbaz; WRITE yalnız finansal onay/güvenlik kapıları tamamlanınca.

## GitHub kayıtları
Aynı dalda commit ve push: `arena/01a0a3eb-socialflow-ai`; main değişmedi.
- `53692cb`: audit.
- `3ee0660`: adaptör/izin/metrik sözleşmeleri ve testler.
- `94cf647`: additive şema ve güvenli migration.
- `704defe`: scoped API, marka eşleştirme ve güvenlik testleri.
- `137962b`: Türkçe Reklamlar menüsü ve hesap ekranları.
