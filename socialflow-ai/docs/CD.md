# Sürekli Dağıtım (CD) — Ortam ve Sözleşme

> Faz 7 §23–§28. Bu belge, `.github/workflows/deploy.yml` iş akışının
> kullandığı dağıtım sözleşmesini ve ortam ayrımını açıklar.

## 1. Ortam Ayrımı (§23)

| Ortam | GitHub Environment | Amaç |
|---|---|---|
| `staging` | `staging` | Sürüm adayı doğrulaması (üretim benzeri yapı) |
| `production` | `production` | Canlı müşteri ortamı |

Geliştirme/testler **her zaman** ayrı SQLite dosyalarıyla çalışır; üretim
veritabanı CI/CD'de asla kullanılmaz (§21).

## 2. Kurulum (depo sahibi tarafından yapılır)

1. **Environments:** GitHub → Settings → Environments → `staging` ve
   `production` ortamlarını oluşturun.
2. **Üretim onayı (§24):** `production` ortamında *Required reviewers*
   ekleyin — dağıtım, onayınız olmadan ilerlemez.
3. **Secrets (ortam başına):**

| Secret | Anlamı |
|---|---|
| `STAGING_DEPLOY_WEBHOOK` / `PRODUCTION_DEPLOY_WEBHOOK` | Dağıtım kancası (PaaS deploy hook URL'si veya kendi sunucunuzun HTTPS ucu). JSON gövdesi: `{commit, environment, runId}`. HTTP 2xx beklendi. |
| `STAGING_APP_URL` / `PRODUCTION_APP_URL` | Ortamın temel URL'si — dağıtım sonrası duman testi (`/api/health`, `/api/health/ready`) bu adres üzerinden yapılır (§146/§153). |

## 3. Dürüstlük Sözleşmesi (§75, §154)

- Secret yapılandırılmamışsa dağıtım işi **gerçek başarısızlıkla biter** ve
  GitHub Deployment kaydına "hedef yapılandırılmadı" notu düşer.
  Sahte "dağıtıldı" durumu ÜRETİLMEZ.
- Duman testi 200 döndürmüyorsa dağıtım kaydı `failure` olarak kapatılır.
- Her dağıtım; commit, ortam, zaman damgası ve koşu kimliğiyle
  GitHub Deployment geçmişinde izlenebilir (§28).

## 4. Migration Ön Kontrolü (§62/§63)

`deploy.yml` şemayı **atık bir SQLite** dosyasına uygular
(`prisma/migration-check.db`) — üretim veritabanına dokunulmaz.
Gerçek PostgreSQL doğrulaması için staging'de ayrı bir doğrulama
veritabanı kullanın; üretim migration'ları her zaman yedek alındıktan
sonra ve geri dönüş planıyla uygulanır (bkz. `docs/DEPLOYMENT.md`).
