# SocialFlow AI

**Tek bir görsel + tek bir ana açıklama → tüm sosyal medya platformları için optimize edilmiş, zamanlanmış ve yayınlanmış içerikler.**

SocialFlow AI, bir master içeriği (medya + açıklama) alır; seçtiğiniz platform ve içerik türleri için
**anlamı koruyarak** yeniden yazar (asla karakter sınırından kesmez), medyayı **akıllı kırpma** ile her
platformun oranına uyarlar (asla esnetmez), önizleme, manuel düzenleme, anında yayınlama veya zamanlama
ve panelden takip imkânı sunar. Tüm arayüz **Türkçe**'dir.

> **Demo Modu:** Varsayılan yapılandırmada (`DEMO_MODE=true`) gerçek sosyal medya paylaşımı **yapılmaz**.
> Yayınlar "Demo Modu — gerçek sosyal medya paylaşımı yapılmadı" etiketiyle simülasyon olarak işaretlenir.
> Sahte kalıcı bağlantı (permalink) veya sahte analitik üretilmez.

---

## Öne çıkan özellikler

- **Tek master, çoklu platform:** Bir `Content` → N `PlatformContent` çocuğu. Ağ başına kampanya **kopyalanmaz**.
- **AI metin uyarlaması:** Platform sınırına **anlamsal yeniden yazım** ile sığdırır. Ürün adı, fiyat, tarih,
  indirim oranı, kampanya koşulları, bağlantılar ve zorunlu etiketler **korunur**; metin asla kesilmez.
- **Akıllı medya motoru:** Odak noktası tespiti + akıllı kırpma ile her orana (1:1, 4:5, 9:16, 16:9, 2:3…)
  varyant üretir. Orijinal master medya **değiştirilmez**. Görsel genişletme (AI extend) yalnızca açık izinle.
- **Yapılandırma odaklı platform kuralları:** Karakter limitleri, oranlar, dosya boyutları, etiket sınırları ve
  API yetenekleri veritabanında (`PlatformRule`) tutulur — bileşenlerde **sabit değer yoktur**.
- **10 platform adaptörü:** Instagram, Facebook, X, LinkedIn, TikTok, YouTube, YouTube Shorts, Threads,
  Pinterest, Google Business Profile. Modüler sağlayıcı mimarisi.
- **Ön kontrol (preflight), zamanlama, onay akışı, bildirimler, denetim kaydı, analitik.**
- **İdempotent yayınlama:** Retry'larda çift gönderim oluşmaz. Kısmi başarısızlıkta içerik
  `PARTIALLY_PUBLISHED` olur ve **yalnızca başarısız hedef** yeniden denenir.
- **Güvenlik:** Sunucu taraflı oturumlar, CSRF koruması, rol tabanlı yetki, AES-256-GCM ile şifrelenmiş token'lar.

---

## Teknoloji

| Katman | Seçim |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Stil | Tailwind CSS |
| ORM / DB | Prisma + PostgreSQL (demo için SQLite) |
| Depolama | S3 uyumlu (veya yerel disk) |
| Arka plan işleri | Veritabanı tabanlı, kalıcı iş kuyruğu |
| AI | Deterministik (yerel) motor; isteğe bağlı OpenAI / Anthropic |

---

## Hızlı başlangıç

```bash
# 1) Bağımlılıklar
npm ci

# 2) Ortam değişkenleri
cp .env.example .env

# 3) Veritabanı şeması + demo verisi (SQLite)
npx prisma db push
npm run db:seed

# 4) Geliştirme sunucusu
npm run dev
# → http://localhost:3000
```

**Demo girişi:** `demo@socialflow.ai` / `Sosyal2026!` (OWNER rolü)
Ek roller: `editor@socialflow.ai`, `onaylayici@socialflow.ai` (aynı parola).

> Medya varyantları tarayıcıda (canvas) üretildiği için demo görselleri raster (JPEG) olarak
> `storage/demo/` ve `public/demo/` altında seed edilir.

---

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu (0.0.0.0:3000) |
| `npm run build` | `prisma generate` + üretim derlemesi |
| `npm run start` | Üretim sunucusu |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Şemayı veritabanına uygula |
| `npm run db:seed` | Demo verisini yükle |
| `npm run db:studio` | Prisma Studio |
| `npm run test:setup` | Ayrı `test.db` kurar + seed eder |
| `npm test` | Entegrasyon testleri (kritik yol + kısmi başarısızlık) |

> **Not:** `next dev` çalışırken `next build` çalıştırmayın — ikisi aynı `.next` dizinini paylaştığı
> için dev sunucusu bozulur. Build almadan önce dev sunucusunu durdurun.

---

## Proje yapısı

```
src/
  app/
    (app)/            # Oturum gerektiren Türkçe arayüz sayfaları
      anasayfa/       # Panel (dashboard)
      yeni-icerik/    # İçerik oluşturma sihirbazı + [id] composer
      takvim/ taslaklar/ planlananlar/ yayinlananlar/
      medya/ sosyal-hesaplar/ marka-profilleri/
      ai-asistan/ analizler/ bildirimler/ ayarlar/
    api/              # ~40 route.ts (JSON API)
    giris/            # Giriş sayfası
  lib/
    ai/               # Metin uyarlaması, anlamsal yeniden yazım, etiket, zamanlama, marka sesi
    media/            # Canvas medya motoru (kırpma/odak/varyant) + doğrulama
    platforms/        # PLATFORM_META, içerik türleri, yerleşik kurallar
    rules/            # PlatformRule motoru (yapılandırma odaklı)
    social/           # Sağlayıcı adaptörleri + registry + OAuth2 + publishingService
    queue/            # Kalıcı iş kuyruğu + iş yürütücüler
    services/         # content, validation, scheduling, analytics, media, notifications
    auth/ security/ storage/ crypto.ts env.ts
  components/         # ui/ media/ content/ layout/
prisma/
  schema.prisma       # 28 model
  seed.ts             # Demo verisi
tests/                # node:test entegrasyon testleri (tsx)
docs/                 # Mimari, veritabanı, sağlayıcılar, dağıtım, güvenlik, AI
```

---

## Dokümantasyon

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Katmanlar, veri modeli, istek akışı, API zarfı, kuyruk
- [DATABASE.md](docs/DATABASE.md) — Prisma şeması, ilişkiler, SQLite→PostgreSQL geçişi
- [SOCIAL_PROVIDERS.md](docs/SOCIAL_PROVIDERS.md) — Adaptör mimarisi, OAuth2, yeni platform ekleme
- [AI_SERVICES.md](docs/AI_SERVICES.md) — Deterministik/LLM motorları, anlamsal yeniden yazım, güvenlik kuralları
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — Üretim dağıtımı, ortam değişkenleri, kontrol listesi
- [SECURITY.md](docs/SECURITY.md) — Oturum, CSRF, RBAC, token şifreleme, denetim

---

## Temel ilkeler (pazarlıksız)

1. Sosyal medya limitleri **asla sabit kodlanmaz**; merkezî, güncellenebilir `PlatformRule` kullanılır.
2. AI metni **asla kesmez**; anlamı, marka tonunu ve gerçekleri (fiyat/tarih/koşul/bağlantı) koruyarak yeniden yazar.
3. Görsel **asla esnetilmez**; akıllı kırpma + odak noktası kullanılır, orijinal master korunur.
4. OAuth token'ları **asla localStorage'da tutulmaz**; sunucu tarafında şifreli saklanır, resmî OAuth akışları kullanılır.
5. API doğrulamadan **asla "yayınlandı" denmez**; demo modu açıkça etiketlenir.
6. Sahte üretim analitiği üretilmez; resmî olmayan scraping/parola otomasyonu kullanılmaz.
7. Yayınlama **idempotent**tir; retry çift gönderim yaratmaz.
8. AI, kullanıcının vermediği fiyat/indirim/tarih/teknik özellik/yasal-iddia/URL **uydurmaz**.

Varsayılan yerel ayarlar: **Europe/Istanbul**, DD.MM.YYYY, 24 saat, TRY/₺, Türkçe.
