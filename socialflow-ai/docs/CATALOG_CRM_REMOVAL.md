# Ürün Kataloğu ve CRM/Lead kaldırma kaydı

15 Eylül 2026 — Kullanıcı bu iki modülü kullanışlı bulmadığı için sistemden kaldırılmasını istedi. Önceki tamamlanma planı bu modülleri tekrar ekleme talimatı değildir.

## Kaldırılanlar
- `/app/katalog` ve `/app/musteriler` sayfaları ve istemci bileşenleri.
- `/api/catalog/**`, `/api/crm/**` içindeki 11 route dosyası; yalnız menü gizleme yapılmadı.
- Katalog/CRM servisleri ve yalnız bu servislerin kullandığı business yardımcıları.
- Menüler, AppShell/layout seçenekleri, productCatalog/socialCRM/leadManagement özellik bayrakları ve ayar etiketleri.
- Gelen Kutusu → CRM bağlantısı, CRM sorgusu ve DTO alanı. Konuşma katılımcısı bilgisi, ekip içi notlar ve marka bağlantısı korundu.
- Artık mevcut olmayan işlevleri test eden katalog/CRM test dosyaları ve npm scriptleri. Yerlerine kaldırmanın geri bozulmasını yakalayan `test:removed-modules` eklendi.
- Eski aşama raporunun başına artık geçerli olmadığını belirten not eklendi.

## Veri koruma sınırı
Uygulama işlevleri tamamen kaldırıldı; **veritabanı verileri fiziksel olarak silinmedi**. Product, ProductVariant, InventoryMovement, Contact, Lead, LeadActivity, ContactConversationLink tabloları, bunların Prisma tanımları ve uygulanmış 005/006 migration/installer geçmişi uyumluluk ve veri kaybını önlemek için tutuldu. Bu modüllerin kayıtlarına erişen uygulama API'si veya ekranı artık yok. Önceki env bayraklarını true yapmak bunları geri açmaz.

Dev ve test DB'de bu yedi tablonun tüm satırları ve migration geçmişi kaldırma öncesi/sonrası sayı+SHA-256 ile birebir karşılaştırıldı: değişiklik yok. İki DB'de foreign_key_check boş. Reset, reseed veya DROP TABLE çalıştırılmadı.

## Doğrulama
- `npm test`: 16/16.
- `npm run test:inbox`: 16/16.
- `npm run test:oauth`: 3/3.
- `npm run test:instagram`: 14/14.
- `npm run test:accounts`: 4/4.
- `npm run test:advertising`: 19/19.
- `npm run test:removed-modules`: 4/4.
- **Toplam 76/76**, atlanan yok. Eski 26 katalog/CRM testi kaldırılmış işlevlere ait olduğundan çalıştırılmadı; başarılı sayılmadı.
- TypeScript ve üretim build başarılı; `git diff --check` temiz. Build başarısı sıfır lint uyarısı iddiası değildir.
- Üretim sunucusunda gerçek oturumla eski iki sayfa ve CRM deep-link: 404.
- Kaldırılan 11 API yolu × GET/POST/PATCH/DELETE: **44/44 istek 404**.
- Masaüstü ve 390px mobilde kaldırılmış modül bağlantıları yok; yatay taşma/JS runtime hatası yok.
- Gelen Kutusu, Sosyal Medya Hesapları ve Reklamlar sayfaları açılıyor. Reklamların mevcut tarayıcı güvenlik smoke'u da tekrar geçti (session CSRF, finansal 403, OAuth sınırlaması, no-store).

## Kapsam dışı
Ajans portalı/otomasyon veya yeni reklam sağlayıcısı geliştirilmedi. Organik yayınlama, mevcut kuyruk, Brand Kit, kullanıcı oturumu ve reklam altyapısı korundu. Önceki dependency audit borcu bu kaldırma işlemiyle çözülmüş sayılmaz.
