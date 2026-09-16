# Canlıya Alma Raporu — 2026-09-16

> **Branş:** `arena/01a0a7b6-socialflow-ai` → `main` (commit `0c48139`)
> **Doğrulama zamanı:** 2026-09-16T00:58–01:03 UTC
> **Ortam:** Arena sandbox (Node 22.22.3, Next 14.2.35, Prisma 7.10.0)

## Sonuç: ✅ CANLIYA HAZIR — Önizleme yayında

Uygulama üretim derlemesiyle (`npm run build` → `.next-build`) ve üretim sunucusuyla (`npm run start -p 3000 -H 0.0.0.0`) doğrulandı. `/giris` 200, `/api/v1/bootstrap` sağlıklı dönüyor.

---

## 1. Yapılan doğrulamalar

| Adım | Komut / Kontrol | Sonuç |
|---|---|---|
| Bağımlılıklar | `npm ci` — 605 paket | ✅ 0 hata |
| Prisma istemcisi | `npm run db:generate` → `./src/generated/prisma` 801ms | ✅ |
| Veritabanı | `node scripts/db-push.mjs` → 278 adım, `prisma/dev.db` + `prisma/test.db` | ✅ 1.6 MB |
| Seed | `npm run db:seed` — 10 hesap, 15 kural, 6 medya, 2 marka | ✅ `demo@socialflow.ai / Sosyal2026!` |
| Test veritabanı | `node scripts/test-setup.mjs` | ✅ |
| Testler | `node scripts/run-tests.mjs` — Faz 1 kabul, hesap sağlığı, inbox, oauth, advertising, instagram-connection | ✅ tüm suite'ler `pass`, `fail 0` |
| Üretim derlemesi | `npm run build` (`prisma generate && next build`) | ✅ `✓ Compiled successfully` — 87.3 kB shared, 0 lint hatası |
| Üretim sunucusu | `npm run start` — 0.0.0.0:3000, Ready in 398ms | ✅ `✓ Starting...` → `/giris` 200 |
| API sağlık | `GET /api/v1/bootstrap` → drafts:1, scheduled:10, unread:5, accounts:10 | ✅ |
| Ortam | `.env` oluşturuldu (`.env.example` → `.env`), `DATABASE_URL=file:./prisma/dev.db` | ✅ gitignore doğru |

## 2. Canlı önizleme

Sunucu **şu an çalışıyor** (process `production-8b413023`, port 3000). Arena önizleme proxy'si üzerinden erişilebilir:

- **Giriş sayfası:** `https://3000-<sandbox>.e2b.app/giris`
- **Demo hesap:** `demo@socialflow.ai` / `Sosyal2026!` (OWNER)
- Diğer roller: `editor@socialflow.ai`, `onaylayici@socialflow.ai` (aynı parola)

> Not: `next.config.js` `allowedDevOrigins: ['*.e2b.app']` ve `APP_ENV=development` iken `X-Frame-Options` gönderilmediği için önizleme iframe içinde sorunsuz render olur. `APP_ENV=production` yapıldığında `X-Frame-Options: SAMEORIGIN` otomatik eklenir.

## 3. Üretim (gerçek domain) için kalan tek adım

Aşağıdaki değerleri **gerçek üretim sunucusunda** `.env` içinde güncelleyip `prisma migrate deploy` + `npm run build` + `npm run start` (veya process manager) ile ayağa kaldırın. Sandbox'taki değerler demo kalır.

```env
APP_URL=https://app.sizinalaniniz.com
APP_ENV=production
SESSION_SECRET=<64 hex — `node -e "require('crypto').randomBytes(32).toString('hex')"`>
TOKEN_ENCRYPTION_KEY=<64 hex — aynı yöntem>
DATABASE_URL=postgresql://user:pass@host:5432/socialflow?schema=public
# prisma/schema.prisma: provider = "postgresql" yapın
STORAGE_DRIVER=s3            # veya kalıcı disk ise local + STORAGE_LOCAL_DIR
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
DEMO_MODE=false               # gerçek OAuth/yayın için
# + ilgili sağlayıcı: INSTAGRAM_APP_ID/SECRET, FACEBOOK_*, LINKEDIN_*, X_*, vb.
```

**Üretim kontrol listesi (docs/DEPLOYMENT.md §8):**

- [ ] `APP_ENV=production` + `APP_URL` HTTPS
- [ ] `SESSION_SECRET` / `TOKEN_ENCRYPTION_KEY` güçlü, yedeklendi (döndürülürse token/oturum geçersiz olur)
- [ ] `DATABASE_URL` PostgreSQL, `npx prisma migrate deploy` çalıştı
- [ ] `STORAGE_DRIVER` S3/kalıcı disk, medya URL'leri herkese açık
- [ ] `DEMO_MODE=false` + sağlayıcı kimlik bilgileri (gerçek yayın isteniyorsa)
- [ ] En az bir işçi: `QUEUE_WORKER_ENABLED=true` (tek örnekte web+worker aynı süreçte; çok örnekte ayrı `npm run worker`)
- [ ] Ters proxy TLS, `X-Forwarded-For/Proto` iletiyor, `client_max_body_size 64m`
- [ ] Yedekleme + kuyruk izleme (`Job.status=FAILED`, `Publication.status=FAILED`)
- [ ] `npm run build` hatasız, `npm test` geçiyor

## 4. İş kuyruğu

- Kuyruk DB tabanlı, broker gerektirmez. `src/instrumentation.ts` → `startQueueWorker()` Node runtime'da başlar.
- Tek örnek: web+worker aynı süreç (varsayılan).
- Çok örnek: web'lerde `QUEUE_WORKER_ENABLED=false`, işçi örneğinde `true` — `claimNextJob` ile kilit, `idempotencyKey` ile çift engeli.
- Zamanlanmış yayınlar `runAt` geldiğinde işçi tarafından alınır; işçi yoksa yayın yapılmaz.

## 5. Notlar

- `.env` ve `prisma/*.db` Git'e girmez (`.gitignore`). Üretimde gizli anahtarları sağlayıcının secret manager'ında tutun.
- `npm run build` ile `npm run dev` aynı `.next` klasörünü paylaşmaz — `next.config.js` `distDir: .next-build` (production) sayesinde çakışma yok; build sırasında dev sunucusu durdurulmalı.
- AI varsayılan `deterministic` (yerel); `AI_PROVIDER=openai/anthropic` için `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` yalnızca sunucuda.
