# Faz 6 geçiş denetimi — 15 Eylül 2026

## Karar ve kapsam
Başlangıç commit'i `4faca17`. Tek mevcut uygulama genişletilir. Kullanıcı belgesindeki “Faz 1–5 tamamen uygulandı” varsayımı bu checkout ile uyuşmuyor: Faz 5'in normalize elle giriş Gelen Kutusu ve Instagram OAuth ön koşulu var, tam CRM/dinleme/ajans/enterprise sistemi yok. Faz 6 reklam temeli mevcut eksikleri örtmeden bağımsız, ekleyici ve harcama yapamayan bir modül olarak başlatılır.

İlk kapsam: adım 1 denetim → adım 2 AdvertisingProviderAdapter sözleşmesi → adım 3 reklam hesabı/capability modelleri → adım 4 Reklamlar ana kategorisi → adım 5 Reklam Hesapları ekranı. Meta READ dikeyi bundan sonra gelir; OAuth'u, API sürümü, izinleri ve App Review tamamlanmadan hesap bağlı gösterilmez. Aynı anda yedi canlı reklam entegrasyonu yapılmaz.

## İncelenen mimari ve yeniden kullanım
| Alan | Checkout kanıtı | Faz 6 kararı |
|---|---|---|
| Repository | Next 14.2.35, React 18, TS, Prisma 5.22, Tailwind; 50 API route ve 71 lib dosyası | Aynı App Router, AppShell, apiRoute, client API ve Türkçe UI |
| Şema | SQLite, 49 model; schema.prisma | Reklam tabloları eklenir; mevcut tablolar silinmez/yeniden kurulmaz |
| Migration | 001 baseline; 002 altı inbox modeli/composite indeksler; 003 OAuthState'e üç alan | Tüm SQL dosyaları gözden geçirildi. DB history checksum'ları eşleşiyor ve FK kontrolü temiz. Yeni migration yalnızca additive |
| Workspace | User→Workspace, Brand→Workspace, scoped queries, bazı composite FK'ler | Reklam hesabı workspace+id ve brand workspace kapsamıyla sınırlandırılacak |
| RBAC | OWNER/ADMIN/EDITOR/APPROVER/CREATOR/VIEWER; hasRole ve BrandKit açık izin kümeleri | Aynı User ve Session üzerinde `ads:*` izin matrisi; ikinci kimlik sistemi yok |
| Oturum/CSRF | DB oturum hash'i, HttpOnly cookie; yeni API'lerde session-bound CSRF opt-in | Yeni reklam mutasyonlarında sessionCsrf=true; persisted rol/aktiflik yeniden kontrol edilir |
| Brand Kit | Brand, BrandVoice, BrandKit, BrandKitVersion ve onaylı koleksiyonlar | Gelecekte reklam snapshot/ön kontrol için kaynak; bugün aynen korunur |
| Product Catalog | Product/ürün kataloğu modeli veya servisi yok | İkinci ürün sistemi kurulmaz; Catalog Ads kapalı ve bağımlılık eksik olarak belirtilir |
| Campaign | Workspace kapsamlı Campaign; Content ve AnalyticsSnapshot ilişkileri | İkinci master kampanya kurulmaz. Gelecekte paid hierarchy mevcut Campaign'i genişletecek |
| Content/Publication | Content→PlatformContent→Publication/Attempt, ContentVersion, ContentMedia, MediaAsset | Reklam üretimi gelecekte snapshot üzerinden; organik kayıtları değiştirmez |
| SocialProvider | Mevcut 9 platform kodu, BaseSocialProvider, OAuth2Provider, registry | Reklam adaptör sözleşmesi ayrı; organik registry/tokenlar değiştirilmez |
| OAuth | Instagram callback, atomic state, doğru hesap/izin, şifreli SocialProviderToken | OAuth güvenlik/crypto yardımcıları tekrar kullanılabilir. Ads tokenları organik tokenlardan ayrı tutulmalı |
| Analytics | AnalyticsSnapshot ve organik analyticsService | Reklam ölçümleri ayrı model/semantik ister. Harcama/gelir/ROAS organik ölçümlerden türetilmez |
| AI | Tek llmClient, deterministic/OpenAI/Anthropic, caption/brandVoice servisleri | Yeni AI sistemi yok; bütçe ve reklam yayınlama otomasyonu kapalı |
| Creative Studio | Tam modül yok, özellik bayrakları var | “AI ile reklama uyarla” çalışıyor denmez |
| Automation | Genel tetikleyici/koşul/aksiyon motoru yok; bayrak kapalı | Mevcut Job iş kuyruğu otomasyon motoru diye sunulmaz; ikinci motor kurulmaz |
| Job/worker | Kalıcı Job, koşullu claim, processJob, standalone worker | Gelecekte SyncAdAccounts/SyncAdMetrics aynı kuyruğa; organik iş tipleri korunur |
| Unified Inbox | Conversation/Message/Participant, assignment/note/tag, manuel event, audit/notification | Dokunulmaz; reklam arızası inbox'u bozmaz |
| CRM/Lead | Model/servis yok | Bağımlılık eksik; reklam lead/gelir sonucu uydurulmaz |
| Agency/Client | Tam client modeli/portal yok; yalnızca AppSettings branding | İstemci onayı varmış gibi geçilmez |
| Public API/Webhook | API keys/scopes/outgoing delivery yok; inbox webhook imza yardımcıları var, public ingress kapalı | Conversion Hub/public API hazır sayılmaz |
| Subscription/Entitlement | Workspace.plan string; gerçek entitlement/subscription modelleri yok | Reklam flag'leri mevcut ortak registry'de; fiyatlandırma mantığı icat edilmez |
| Creator/UGC/Affiliate/Commerce | İlgili modeller/servisler yok | Korunacak çalışan modül bulunmadı; ücretli kullanım hakları/doğrulanmış ürün olmadan entegrasyon açılmaz |

## Değişiklik öncesi doğrulama
- `npm test`: 16/16
- `npm run test:inbox`: 16/16
- `npm run test:oauth`: 3/3
- `npm run test:instagram`: 14/14
- `npm run test:accounts`: 4/4
- Toplam: **53/53 başarılı**. Testler ayrı test.db üzerinde; reset/seed çalıştırılmadı.
- `npm run typecheck`: başarılı.
- `npm run build`: başarılı; sandbox'taki önceden doğrulanmış Prisma query engine kullanıldı. Native schema engine indirme kısıtı sürüyor; ayrıntı PHASE5_AUDIT.md'de.
- `npm audit`: 7 bildirim; 2 orta, 4 yüksek, 1 kritik. Bağımlılıklar bu aşamada değiştirilmedi.
- Mevcut 3 migration'ın DB checksum/finished kayıtları doğrulandı. `PRAGMA foreign_key_check`: ihlal yok.

## Açık teknik borçlar / geçiş kapıları
1. Tam Faz 5 ve birçok Faz 3–4 modülü yok. Eksik sistemlerin regresyonunu geçtiğimiz iddia edilemez.
2. Demo preview sentetik OWNER oturumu ve geliştirme CSRF atlaması mevcut. Gerçek reklam tokenı/finansal işlem bu oturumla kullanılamaz.
3. Eski bazı API'ler sadece double-submit CSRF kullanır. Yeni finansal alanlar açık izin ve session-bound CSRF gerektirir.
4. Mevcut ORM/API/proxy loglarının kapsamlı PII/token temizliği tamamlanmadı; OAuth code query string'leri reverse proxy loglarından çıkarılmalıdır.
5. Standalone `npm run worker` gerekir; Next instrumentation hook garanti değil. Mevcut retry lineer, terminal FAILED; reklam yaratma retry'si bundan otomatik türetilmemeli.
6. Gerçek sağlayıcı hesabıyla uçtan uca OAuth/publishing/ads testi yapılmadı; önceki Instagram testleri kontrollü adaptör yanıtları kullanır.
7. Fiyat/ürün/lead/order/gelir kaynakları yok. Finansal kartlarda “veri yok” gösterilecek, sahte 0 veya ROAS üretilemeyecek.
8. RPO/RTO, offsite DB/storage backup ve restore tatbikatı üretim kapısıdır. Yerel migration yedekleri GitHub yedeği değildir.

## Koruma ilkeleri
- SocialAccount/SocialProviderToken, Content, PlatformContent, Publication ve organik kuyruk akışları değiştirilmez.
- Reklam hesabı ve reklam tokenı ayrı; organik bağlantıdan otomatik token kopyalama yok.
- WRITE ve bütün harcama işlemleri varsayılan kapalı. Sadece UI gizlemek yeterli değildir; servis/API seviyesinde de reddedilir.
- Provider capability “API teorik olarak yapabilir” değil, bu sürümde doğrulanmış/etkin entegrasyon demektir. Desteklenmeyen veya henüz bağlanmamış fonksiyon uydurulmaz.
- Aktif reklam bağlantısı için OAuth/izin/hesap kimliği doğrulanmalı; manuel kayıt aktif bağlantı kanıtı değildir.
