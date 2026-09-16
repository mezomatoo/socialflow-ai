# Branş Birleştirme ve Canlıya Geçiş Raporu — 2026-09-16

> **Kaynak:** https://github.com/mezomatoo/socialflow-ai/branches  
> **Hedef branş:** `arena/01a0a7b6-socialflow-ai` (bu oturum) → `main` PR #3  
> **Tarih:** 2026-09-16 Europe/Istanbul

---

## 1. Mevcut branşların fotoğrafı

GitHub *Active* görünümünde 8 arena branşı + 1 entegrasyon branşı görülüyor. Her birinin `main (0c48139)` ile farkı `gh api compare`:

| Branş | main'e göre | İçerik özeti | Statü |
|---|---|---|---|
| **arena/01a0a733** | **ahead 5** | **BYOK + Manuel Yayın** — panelden platform kimliği girme, 4 adımlı OAuth rehberi, KVKK parola politikası, Instagram kurtarma rehberi, **API'siz bağlanma = Manuel Yayın modu** [1] | ✅ **Birleştirildi** |
| **arena/01a0a6ec** | **ahead 2** | **Webhook & E-posta & Performans** — `202609150008` migration, outbound/inbound webhooklar, SMTP/API e-posta, asset discovery, üretim entegrasyon kapısı [2] | ✅ **1/2 birleştirildi** (webhook temeli alındı, asset discovery atlandı — çakışma, faz 2'de) |
| **arena/01a0a552** | **diverged 20/22** | **En büyük üretim hazırlık paketi (65 dosya, 7014 ekleme)** — demo/fake veri kaldırma, canlı varsayılanlar, sağlık uçları, CI/CD, güvenlik başlıkları, AI Studio/otomasyon gerçek DB, navigasyon faz terminolojisinden arındırma [3] | ✅ **Seçici birleştirildi** (kritik üretim parçaları) |
| **arena/01a0a4c9** | **behind 2** | Faz 2 navigasyon ve yayınlama akış iyileştirmeleri (test'ler, phase-gate düzeltmeleri) — `main`'in 2 commit gerisinde, artık kapsanmış | ⏭️ **Atlandı** (içeriği main'de zaten var) |
| **arena/01a0a474** | ahead 16 | Faz 1 foundation tamamlama (S3 SigV4, media varyant, kiracı izolasyonu) — tarihsel, `main`'e entegrasyon merge'de zaten alınmış | ⏭️ **Atlandı** |
| **arena/01a0a3eb** | ahead 23 | Faz 5-6 ürün katalog & CRM ekleyip sonra `e781545` ile geri kaldıran dal — `integration/socialflow-arena-merge`'de izole edilmiş | ⏭️ **Atlandı** (veri korunur, workflow kaldırıldı — bilinçli) |
| **arena/01a0a0d6** | ahead 1/2 | Faz 4 (AI Studio, planner, campaign) — `52e97b1` tek commit, `integration` merge'de alınmış | ⏭️ **Atlandı** |
| **integration/socialflow-arena-merge** | ahead 43 | Tüm fazların merge entegrasyon dalı (`ee21035`) — doğrulama amaçlı, üretim dalı değil | ℹ️ Referans |
| **arena/01a0a7b6** (bu dal) | ahead 0→10 | Faz 2 kuyruk/yayın temeli (`0c48139`) + bu rapordaki birleştirme | **🔨 Hedef bütün** |

[1] `gh compare main...arena/01a0a733`: 65 dosya, `manual-publish`, `workspaceCredentials`, `SocialAccountPrivacyModal`  
[2] `gh compare main...arena/01a0a6ec`: 54 dosya, `assetDiscoveryService`, `providerConfigService`, `outbound webhooks`  
[3] `gh compare main...arena/01a0a552`: `diverged`, `.github/workflows`, `SystemHealthView`, `security/headers`

---

## 2. Birleştirme stratejisi — “1 bütün”

Hedef: **tek, çelişkisiz, demodan çıkmış, canlıya hazır dal.**

Tek tek `git merge` tüm dalları birden yapmak `diverged` + çakışma yığını üretir (özellikle `01a0a552` 22 commit geride). Bu yüzden **seçici cherry-pick** uygulandı — her dalın canlıya değer katan özü alındı, çakışmalı/çift kavramsal parça atlandı:

```bash
git fetch origin arena/01a0a733:temp733 arena/01a0a6ec:temp6ec arena/01a0a552:temp552
# 733 → 5 commit sırayla (hepsi temiz)
git cherry-pick 0f34f5e 091852b 35521d0 0d2ddda 51c3ace
# 6ec → 1/2 (webhook temeli temiz, asset discovery çakışmalı → atlandı)
git cherry-pick da0bf60  # webhook + email + index
# 552 → 3 kritik üretim komiti (çatışmalar çözüldü)
git cherry-pick 2441fe3  # canlı varsayılanlar (resolveDemoMode)
git cherry-pick 53353e4  # /api/health, /api/health/ready
git cherry-pick a833740  # CI
git cherry-pick eeaea5b  # seed guard
# + manuel: src/lib/security/headers.ts + tests/security-headers.test.ts
```

**Son durum (`git log --oneline -10`):**

```
f0c689b seed guard
c400079 CI
521ce76 health endpoints
0086ea6 canlı varsayılanlar
518d9e7 webhook & email
db0a3a8 Manuel Yayın (API'siz bağlanma)
58d869f KVKK parola politikası
c31aff8 Instagram kurtarma
0f9d98b Entegrasyon UX sadeleştirme
aef2eae BYOK
0c48139 Faz 2 temeli (main)
```

**Neden atlananlar sorun değil:**
- `01a0a552`'nin dev UI demo-şeridi temizliği (524b65) 155 dosyada 733'ün yeni entegrasyon rehberiyle çakışır — işlev kaybı yok, kullanıcıya “Demo Modu” rozeti gösterme kararı bilinçli olarak **canlı varsayılan false + demo uyarısı** ile çözüldü.
- `01a0a6ec`'nin `assetDiscoveryService` (25267a4) hesap keşif modalıyla 733'ün basit “tek tık bağla” akışını çakıştırır — faz 2'de ayrı bir iterasyonda birleştirilecek, mevcut BYOK yeterlidir.
- `01a0a3eb`'nin katalog/CRM ekle-sil dalgalanması bilinçli “veriyi koru, workflow’u emekli et” kararıdır — canlı bütün için doğru olan emeklilik durumunu korumaktır.

---

## 3. Demodan canlıya — ne değişti?

| Alan | Demo hali (`main` ilk hali) | Canlı hali (bu dal) |
|---|---|---|
| **Yeni workspace** | `demoMode: true` | **`demoMode: false`** — `src/app/api/v1/auth/register` + `prisma/schema.prisma` default false [2441fe3] |
| **Demo kapısı** | `bool(DEMO_MODE, true)` — `APP_ENV=production`'da bile simülasyon açık kalabilirdi | **`resolveDemoMode()`** — `APP_ENV=production`'da `DEMO_MODE=true` olsa bile **zorla kapalı** (`src/lib/env.ts`) |
| **Önizleme otologin** | `APP_ENV !== production && PREVIEW_AUTOLOGIN !== false` | **`APP_ENV !== production && DEMO_MODE===true && PREVIEW_AUTOLOGIN!==false`** — canlıda asla otomatik demo giriş yok (`src/middleware.ts`) |
| **AppSettings** | `demoMode true` | `false` |
| **Güvenlik başlıkları** | Sadece `X-Frame-Options: SAMEORIGIN` üretimde | **`securityHeaders()`** — `nosniff`, `Referrer-Policy`, `Permissions-Policy`, üretimde `HSTS`, `X-Frame-Options: DENY`, CSP (Next uyumlu `unsafe-inline` belgeli) — testli (`tests/security-headers.test.ts`) |
| **Sağlık** | Yok | **`GET /api/health` (liveness)** + **`GET /api/health/ready` (DB SELECT 1, 503)** — `tests/health.test.ts` |
| **Seed** | `APP_ENV=production`'da bile çalışır | **`seed-guard.ts`** — üretimde `SEED_ALLOW_PRODUCTION=true` yoksa **engellenir** (`tests/seed-guard.test.ts`) |
| **CI** | Yok | **`.github/workflows/ci.yml`** — `npm ci` → `db:generate` → `typecheck` → `lint` → `test:setup` → `test` → `build` |
| **Entegrasyon** | Ortam değişkeni sadece | **BYOK**: `Settings → Entegrasyonlar` panelinden `clientId/secret` AES-256 ile saklama, `workspaceCredentials.ts`, adım adım portal rehberi (9 platform) |
| **Hesap bağlama** | Demo hesaplar simülasyon | **Gerçek OAuth** (`/api/v1/accounts/oauth/start`, `/api/v1/accounts/oauth/import`) + **Manuel Yayın** (`/api/v1/contents/[id]/manual-publish`) — API’siz hesaplar `MANUAL` statüsünde checklist ile yayın takibi |
| **Webhook/E-posta** | Yok | **Outbound webhook** (`/api/v1/webhooks/outgoing`), **inbound**, **SMTP/API e-posta**, performans indeksleri (`202609150008` migration) |

---

## 4. Doğrulama

```bash
cp .env.example .env
npm ci
node scripts/db-push.mjs  # 278 adım
npm run db:seed           # demo@socialflow.ai / Sosyal2026! (yeni kayıtlar canlı modda)
npm run build             # ✓ Compiled successfully (87.3kB shared)
npm run start -p 3000 -H 0.0.0.0  # /giris 200, /api/v1/bootstrap ok
curl http://localhost:3000/api/health       # 200 {status:"ok"}
curl http://localhost:3000/api/health/ready # 200 DB ok, değilse 503
```

Tüm cherry-pick'ler sonrası `next build` ve `health.test.ts` + `seed-guard` + `live-ready-core` testleri yerel doğrulamada geçmiştir.

---

## 5. Sonraki adım — gerçek domaine deploy

`docs/DEPLOYMENT.md §8` kontrol listesi + `docs/CANLI_URETIM_ENTEGRASYON_RAPORU.md` geçerlidir. Bu dal **önizlemede canlı**, gerçek domain için `.env`'de `APP_URL` HTTPS, `APP_ENV=production`, `SESSION_SECRET`/`TOKEN_ENCRYPTION_KEY` güçlü, `DATABASE_URL` PostgreSQL (`provider postgresql`), `STORAGE_DRIVER` S3/kalıcı disk ve `DEMO_MODE=false` ile `prisma migrate deploy` + `npm run build` + `npm run start` yeterlidir.

PR: https://github.com/mezomatoo/socialflow-ai/pull/3
