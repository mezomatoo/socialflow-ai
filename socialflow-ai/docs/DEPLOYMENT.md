# Dağıtım (Deployment)

Bu belge SocialFlow AI'in üretim dağıtımını kapsar: ortam değişkenleri, veritabanı, depolama, iş kuyruğu,
çok örnekli ölçekleme ve yayın öncesi kontrol listesi.

---

## 1. Gereksinimler

- Node.js **20+**
- PostgreSQL **14+** (üretim) — demo SQLite'tan geçiş aşağıda
- S3 uyumlu nesne depolama (veya kalıcı yerel disk)
- Ters proxy (Nginx/Caddy/ALB) — TLS sonlandırma
- Sağlayıcı OAuth kimlik bilgileri (gerçek paylaşım için)

---

## 2. Ortam değişkenleri

`.env.example` dosyasını kopyalayıp doldurun. Üretimde **tüm gizli değerleri** değiştirin.

### Uygulama
| Değişken | Açıklama | Üretim |
|---|---|---|
| `APP_URL` | Mutlak temel URL (medya URL'leri için) | `https://app.ornek.com` |
| `APP_ENV` | `development` / `production` | `production` |
| `SESSION_SECRET` | Oturum imza anahtarı | **32+ karakter rastgele** |
| `TOKEN_ENCRYPTION_KEY` | Token şifreleme (AES-256-GCM) | **64 hex karakter rastgele** |
| `DEMO_MODE` | `true` → gerçek paylaşım yok | Gerçek paylaşım için `false` |

> `SESSION_SECRET` ve `TOKEN_ENCRYPTION_KEY` değiştirilirse mevcut oturumlar ve **şifreli token'lar geçersiz olur**
> (token'ların yeniden bağlanması gerekir). Bu anahtarları yedekleyin ve döndürme planı yapın.

### Veritabanı
| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/socialflow?schema=public` |

### Depolama (S3 uyumlu)
| Değişken | Açıklama |
|---|---|
| `STORAGE_DRIVER` | `local` veya `s3` |
| `STORAGE_LOCAL_DIR` | Yerel sürücü dizini (kalıcı disk olmalı) |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | S3 uyumlu yapılandırma |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Kimlik bilgileri |
| `S3_FORCE_PATH_STYLE` | MinIO/CF R2 için genelde `true` |

> Sağlayıcıların medyayı çekebilmesi için `APP_URL` **herkese açık** olmalı veya medya URL'leri imzalı/erişilebilir olmalı.

### Yapay zekâ
| Değişken | Açıklama |
|---|---|
| `AI_PROVIDER` | `deterministic` / `openai` / `anthropic` |
| `AI_DEMO_MODE` | `true` → yerel motor tercih edilir |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI (opsiyonel) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic (opsiyonel) |

### Sosyal medya sağlayıcıları (gerçek mod)
Her platform için `*_APP_ID`/`*_APP_SECRET` (veya `*_CLIENT_ID`/`*_CLIENT_SECRET`). Kimlik bilgisi tanımsızsa
`getProvider` o platform için otomatik olarak `DemoProvider`'a düşer.

### Kuyruk & hız sınırı
| Değişken | Açıklama |
|---|---|
| `QUEUE_POLL_INTERVAL_MS` | İşçi yoklama aralığı (varsayılan 5000) |
| `QUEUE_CONCURRENCY` | İşçi eşzamanlılığı (varsayılan 2) |
| `QUEUE_WORKER_ENABLED` | `false` → bu örnekte işçiyi kapat (ayrı işçi süreci için) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | API hız sınırı |

---

## 3. Kurulum adımları

```bash
# Bağımlılıklar (ci = reproducible)
npm ci

# Prisma istemcisini üret
npx prisma generate

# Şemayı PostgreSQL'e uygula
#  - ilk kurulum / geliştirme:  npx prisma db push
#  - versiyonlu migration:      npx prisma migrate deploy
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# Üretim derlemesi
npm run build

# (İsteğe bağlı) demo verisi — ÜRETİMDE ÇALIŞTIRMAYIN
# npm run db:seed

# Sunucu
npm run start
```

> `npm run build` = `prisma generate && next build`. Build, ESLint **hatalarında** başarısız olur
> (uyarılarda değil). Build sırasında `next dev` çalışıyorsa durdurun (aynı `.next` dizinini paylaşır).

---

## 4. SQLite → PostgreSQL geçişi

1. `schema.prisma`: `datasource db { provider = "postgresql" }`.
2. `DATABASE_URL`'yi PostgreSQL bağlantı dizesine ayarlayın.
3. `npx prisma migrate dev --name init` (şemayı oluşturur) veya mevcut veriyi taşıyın.
4. `npx prisma generate`.

Şema taşınabilir olacak şekilde tasarlanmıştır: JSON alanlar `String` (uygulamada parse), şifreli token'lar
base64 `String`, dosya boyutları KB. Ayrıntı için bkz. [DATABASE.md](DATABASE.md).

---

## 5. İş kuyruğu ve ölçekleme

Kuyruk veritabanı tabanlıdır; harici broker gerektirmez. İşçi `src/instrumentation.ts` içinde
`register()` → `startQueueWorker()` ile **Node.js runtime'da bir kez** başlar.

### Tek örnek
Varsayılan: web sunucusu ve işçi aynı süreçte. Küçük/orta ölçek için yeterlidir.

### Çok örnekli (yatay ölçekleme)
Web örneklerinde işçiyi kapatıp **ayrı bir işçi süreci** çalıştırın:

```bash
# Web örnekleri (işçi kapalı)
QUEUE_WORKER_ENABLED=false npm run start

# Ayrı işçi örneği (yalnızca bir veya birkaç tane)
QUEUE_WORKER_ENABLED=true npm run start
```

- İşler `claimNextJob(workerId)` ile **kilitlenir** (`lockedBy`/`lockedAt`) → aynı iş iki kez işlenmez.
- `idempotencyKey@unique` çift kuyruğa almayı engeller; yayın idempotency anahtarı (`pc:<id>:v<version>`)
  çift gönderimi engeller.
- Başarısız işler `failJob` ile üstel geri çekilme ve `maxAttempts` ile yeniden denenir.

> Zamanlanmış yayınlar `runAt` geldiğinde işçi tarafından alınır. İşçi yoksa yayın **yapılmaz** —
> üretimde en az bir işçi örneğinin çalıştığını izleyin.

---

## 6. Ters proxy & TLS

- `sf_session` ve `sf_csrf` çerezleri **HttpOnly** ve `Secure` (üretimde) işaretlenmelidir — TLS zorunlu.
- `APP_URL` HTTPS olmalı; medya URL'leri bu temele göre mutlaklaştırılır.
- İstemci yarığı `0.0.0.0:3000`'e bağlanır; proxy `X-Forwarded-For`/`X-Forwarded-Proto` iletmelidir
  (hız sınırı IP'yi buradan okur).
- **Çerçeveleme koruması:** `X-Frame-Options: SAMEORIGIN` yalnızca `APP_ENV=production` iken gönderilir
  (clickjacking koruması). Geliştirmede gönderilmez; böylece canlı önizleme/proxy uygulamayı farklı bir
  origin'de iframe içinde gösterebilir. `next.config.js` ayrıca `allowedDevOrigins` ile `*.e2b.app` üzerinden
  gelen cross-origin `/_next/*` dev isteklerine izin verir.

Örnek (Nginx):
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 64m;   # medya yüklemeleri için
}
```

---

## 7. Yedekleme & izleme

- **Veritabanı:** PostgreSQL düzenli yedek (token'lar şifreli olsa da içerik/iş verisi kritik).
- **Depolama:** S3 sürümleme/yaşam döngüsü; yerel diskte kalıcı hacim.
- **İzleme:** `Job.status=FAILED` ve `attempts=maxAttempts` olan işleri; `Publication.status=FAILED`
  kayıtlarını; `AuditLog`'u izleyin. Kuyruk derinliğini (`status=QUEUED`) takip edin.
- **Sağlık:** Uygulama `/giris` 200 dönmeli; kuyruk işçisi log'da "arka plan iş kuyruğu başlatıldı" yazmalı.

---

## 8. Yayın öncesi kontrol listesi

- [ ] `APP_ENV=production`
- [ ] `SESSION_SECRET` ve `TOKEN_ENCRYPTION_KEY` güçlü, benzersiz, yedeklendi
- [ ] `DEMO_MODE=false` (gerçek paylaşım isteniyorsa) + tüm sağlayıcı kimlik bilgileri tanımlı
- [ ] `DATABASE_URL` PostgreSQL; `prisma migrate deploy` çalıştırıldı
- [ ] `STORAGE_DRIVER` + S3/yerel yapılandırması; medya URL'leri herkese açık/erişilebilir
- [ ] `APP_URL` HTTPS ve doğru
- [ ] En az bir **işçi örneği** çalışıyor (`QUEUE_WORKER_ENABLED=true`)
- [ ] Web örneklerinde `QUEUE_WORKER_ENABLED=false` (çok örnekli ise)
- [ ] TLS + HttpOnly/Secure çerezler; proxy `X-Forwarded-*` iletiyor
- [ ] `npm run build` hatasız; `npm test` geçiyor
- [ ] Veritabanı/depolama yedekleme + kuyruk izleme kurulu
- [ ] AI anahtarları (varsa) yalnızca sunucu tarafında; `AI_PROVIDER` bilinçli seçildi

> **Demo'dan gerçeğe geçiş:** `DEMO_MODE=false` yapıp kimlik bilgilerini girdikten sonra bile, bir içerik
> yayınlanmadan önce ilgili `PlatformRule`'un ve hesap bağlantısının (`connectionStatus=ACTIVE`) geçerli
> olduğundan emin olun. API doğrulamadan "yayınlandı" denmez.
