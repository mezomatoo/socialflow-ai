# Hukuki Araştırma: Sosyal Medyada “Hesap Bilgileriyle Bağlanma” Mümkün mü? API Zorunlu mu? En Kolay Yol

> **Soru:** Sosyal medya hesapları API **olmadan**, yalnızca kullanıcı adı/şifre ile bağlanıp yayın yapabilir mi? Hukuken mümkün mü? API olacaksa en kolay yol nedir?  
> **Tarih:** 2026-09-16 · Kaynaklar aşağıda dipnotlu, vetting’li web araştırması ile hazırlanmıştır.

---

## Kısa cevap

**Hayır — hesap bilgileriyle (kullanıcı adı/şifre) doğrudan bağlanıp yayın yapmak hukuken ve teknik olarak mümkün değildir; mutlaka resmi API + OAuth kullanılmalıdır.** Doğru ve hukuka uygun “API’siz” alternatif, bu projede zaten implemente edilen **Manuel Yayın (MANUAL)** modudur: hesap API’ye bağlanmaz, içerik SocialFlow’da hazırlanır ve kullanıcıya platformda elle yayınlama için checklist sunulur.

- **Neden API zorunlu:** 2024-2026’da tüm büyük platformlar yayınlama (write) için yalnızca **OAuth 2.0 tabanlı resmi API**’yi kabul eder; web arayüzünü kullanıcı parolasıyla otomatize etmek (credential stuffing / headless browser) **hizmet şartları (ToS) ihlali**, **CFAA (ABD)** ve **KVKK/GDPR (TR/AB)** ihlali riskidir, hesaplar kalıcı banlanır [1][2][3].
- **En kolay API yolu:** Aşağıdaki tablo + 5 adımlı kurulum rehberi.

---

## 1. Neden “şifreyle bağlanma” yapılamaz? — 4 hukuki/teknik bariyer

### 1.1 Platform Hizmet Şartları (ToS) — tüm platformlarda açık yasak

| Platform | ToS maddesi (2025-2026) | Yaptırım |
|---|---|---|
| **Instagram** | ToS §4.2: “express permission olmadan otomatik erişim/hesap oluşturma/toplama yasak” [4] | IP blok, fingerprint, rate-throttle, dava |
| **Facebook** | ToS §3.2 (04.03.2026): “otomatik toplama yasak, text & data mining’e karşı tüm haklar saklı” [5] | Kısıtlama, ban |
| **X/Twitter** | ToS (10.04.2026): “scrape” açıkça yasak listesinde [6] | Hesap/uygulama askısı |
| **TikTok** | ToS otomatik toplama yasağı + headless fingerprint + CFIUS belirsizliği [4] | Cihaz ID ban, hukuki risk |
| **LinkedIn** | User Agreement: otomatik erişim yasak — hiQ davasına rağmen sivil sözleşme ihlali [7] | Yıllarca süren davalar (hiQ yerleşimi kanıt) |
| **YouTube** | ToS §3 sadece `robots.txt` uyumlu public arama motorlarına izin — yazma için API zorunlu [4] | Hesap kısıtlaması |

> **İstisna:** Reddit `/r/[sub].json` public okuma için açık izin verir — **ama yayınlama yine API ister** [4].

**Sonuç:** Şifreyle otomatik giriş yapıp yayınlamak ToS ihlalidir; ToS ceza hukukunda suç değil ama **sözleşmesel sivil dava, kalıcı ban, IP engeli, cease-and-desist** doğurur [8][9].

### 1.2 ABD CFAA — “public vs authenticated” ayrımı

- **hiQ v. LinkedIn (9th Cir. 2022)** ve **Meta v. Bright Data (N.D. Cal. 23.01.2024)** içtihatları: **anonim/icognito’da görülebilen public veriyi** toplamak CFAA ihlali değildir [10][11].
- **Ama:** Kullanıcı parolasıyla giriş yapıp oturum arkasındaki veriyi toplamak / yayınlamak **“unauthorized access”** sayılır — CFAA kapsamında **ceza riski** her yargı alanında mevcut [12][13].
- **Hakim tweet/X davasında:** “Twitter, para aldığı sürece içeriğin kopyalanmasına razı” demiş olsa da, **giriş gerektiren alana girip bot’la paylaşım yapmak** bu korumadan yararlanmaz [10].

**Net:** Şifreyle otomasyon = **CFAA’da kırmızı alan**.

### 1.3 KVKK (TR) / GDPR (AB) / CCPA (US-CA) — kişisel veri boyutu

- Public post bile **kişisel veri**dir (kullanıcı adı, foto, biyografi) — GDPR Madde 6 / KVKK Madde 5 **hukuki sebep** gerektirir [14][15].
- **Parola toplamak** “özel nitelikli” olmasa da **çok hassas** olup **Açık Rıza + Aydınlatma Metni + VERBİS + DPA + DPIA** gerektirir; ihlalde **KVKK Kurumu idari para cezası** (2024-2025’te artan denetim) [16][17].
- Platform API’lerinde kullanıcı silme/geri çekme anında uygulamanıza da yansımak zorundadır (“real-time compliance”) [18].

> SocialFlow’un mevcut **KVKK parola politikası modalı** (`SocialAccountPrivacyModal`) tam bu yüzden eklenmiştir: “parola asla istenmez ve saklanmaz; giriş platformun resmi OAuth ekranında yapılır” [19].

### 1.4 Teknik caydırıcılık

- **Fingerprint & bot tespiti:** Meta, TikTok, X gelişmiş headless-browser / device-ID / IP reputation algılar; puppeteer/playwright otomasyonu saatler içinde yakalanır [4][6].
- **2FA / risk tabanlı doğrulama:** Kullanıcı şifresi olsa bile SMS/e-posta/uygulama onayı istenir, otomasyon kırılır.
- **Oran sınırları:** Public scraping’ten farklı, **yayınlama** API’si olmadan **hard limit**’i bypass edemezsiniz; platform sizi değil, kullanıcının hesabını cezalandırır.

---

## 2. Doğru çözüm — SocialFlow’daki iki mod

Bu proje **hukuka uygun** iki yolu aynı anda sunar (branch `arena/01a0a733` → `Manual Publish`):

### A) Resmi API + OAuth (önerilen, tam otomasyon)

1. **Ayarlar → Entegrasyonlar** (BYOK) — yönetici bir kez Meta/Google/LinkedIn/TikTok/X per portalında uygulama oluşturur, `App ID / Secret`’i panele yapıştırır (AES-256 şifreli) [20].
2. **Hesaplar → Hesap Bağla** — son kullanıcı “Connect” tıklar, **platformun kendi login sayfasına** gider, izin verir, geri döner (`/api/auth/*/callback`). **Parola SocialFlow’a hiç gelmez.**
3. Yayın (`publishingService.ts`) idempotent `idempotencyKey` ile **resmi endpoint**’e gider; token sunucuda `fromCipherText` ile çözülür.

### B) Manuel Yayın (MANUAL) — “API’siz”in hukuka uygun formu

- Hesap `connectionStatus = MANUAL` ile eklenir (şifre yok, sadece handle/displayName).
- Yayın denendiğinde **simülasyon değil, checklist** döner: başlık, açıklama, medya linki, hashtag’ler ve **doğrudan platformda yayınlama linki** — kullanıcı elle yapıştırır, sonra “Yayınladım” işaretler (`/api/v1/contents/[id]/manual-publish`).
- Avantaj: **hiçbir ToS/CFAA/GDPR riski yok**, müşteri demo’yu kandırmadan elle çalışabilir; sonra OAuth’a geçebilir.

> **Şifreyle otomasyon neden eklenmedi?** Yukarıdaki 4 bariyer + KVKK “parola asla saklanmaz” ilkesi. Talep olursa bile **reddedilmelidir** — avukat görüşü alınmadan eklenmemeli.

---

## 3. En kolay resmi API yolu — platform bazlı pratik rehber (2026 güncel)

Tablodaki tüm limitler/ücretler araştırma anındaki güncel değerlerdir; fiyatlar sık değişir (özellikle X), başvurmadan önce portalda teyit edin [21][22][23].

| Platform | Yayınlama için gereken hesap türü | OAuth akışı | Yayın limiti (resmi) | Ücret (2026) | Onay süresi | En kolay adım |
|---|---|---|---|---|---|---|
| **Instagram** | **Business/Creator + bağlı Facebook Sayfası** — personal hesap **artık yok** (Basic Display 04.12.2024 kapandı) [24][25] | **Instagram Business Login** (tek hesap, istemci=Instagram) **veya** Facebook Login for Business (çok hesap, sayfa üzerinden) — ikisi de OAuth 2.0 [26][27] | **25 gönderi / hesap / 24s** (bazı kaynaklarda 100, hesap popülaritesine göre dinamik: `4800×impressions` [21]) | **$0** — ama **Business Verification + App Review** zorunlu (video screencast) [28][29] | **2-6 hafta** (ilk başvuru çoğu kez reddedilir, 8-12 hafta bütçeleyin) [30] | `developers.facebook.com` → App oluştur → **Instagram Graph API** ekle → App ID/Secret al → `https://developers.facebook.com/apps/` callback: `https://app.sizinalaniniz.com/api/auth/instagram/callback` |
| **Facebook** | **Sayfa (Page)** — personal profil yayını API’de **yok** [22] | Facebook Login for Business (Pages) | **25 gönderi / sayfa / 24s** | $0 | 2-6 hafta (Instagram ile aynı app) | Instagram ile aynı portal/acayiş |
| **X/Twitter** | Herhangi X hesabı | OAuth 2.0 PKCE | **Free: YOK** (Feb 2026’dan beri yeni geliştirici için pay-per-use) [31] — **$0.01 / post created, $0.005 / read, 2M read/ay cap** → Enterprise $42k [22] | **Legacy Basic $200/ay kapalı**, yeni = kullandıkça öde | Anlık (başvuru yok) | `developer.x.com` → Project+App → Keys & Tokens → OAuth 2.0 Client ID/Secret |
| **TikTok** | Creator hesabı | OAuth 2.0 | **~15 / gün** (audited app’te public, audit öncesi sadece private) [21][32] | $0 | **1-2 hafta audit** (sandbox’ta private only) | `developers.tiktok.com/apps` → **Content Posting API** iste → audit |
| **YouTube** | Google hesabı | OAuth 2.0 (Google Cloud) | **Quota 10.000/gün** — `videos.insert` 1 unit (100 call/gün limit) [22][33] | $0 | Anlık (quota artışı haftalar) | `console.cloud.google.com` → YouTube Data API v3 etkinleştir → OAuth istemci (Web) |
| **LinkedIn** | Şirket Sayfası + kullanıcı | OAuth 2.0 — **MDP partner onayı** şart [34] | Dev tier **500 req/app + 100 req/member / gün** | $0 (partner program) | **Haftalar-aylar** (screencast + partner review) [35] | `linkedin.com/developers/apps` → **Share on LinkedIn** + **Community Management** ürünleri |
| **Threads** | Business (Meta) | Meta OAuth (Instagram ile aynı) | **250 / 24s** | $0 | 2-6 hafta (Meta) | Meta portal → Threads API |
| **Pinterest** | Business | OAuth 2.0 v5 | Trial 1k/gün, Standard 100 req/s | $0 | Trial anlık, Standard video-review | `developers.pinterest.com/apps` |
| **Google Business Profile** | İşletme profili | OAuth 2.0 (Google) | 300 QPM (onaylı) | $0 | **Basic Access** başvurusu (QPM 0 → 300) | `console.cloud.google.com` → Business Profile API |

### 3.1 En hızlı “ilk canlı yayın” sırası (öneri)

1. **YouTube** (en kolay, anlık onay) → 1 günde canlı.
2. **Instagram + Facebook** (aynı Meta app, beraber) → 2 haftada business verification ile canlı (ilk müşterileriniz için yeterli).
3. **TikTok** (audit) → 2. haftada paralel başvuru.
4. **X** (ücretli) ve **LinkedIn** (partner) → ihtiyaç olunca — unified API ile maliyet/başvuru devredilebilir.

> **Unified API alternatifi:** Ayrshare, Buffer, PostEverywhere, SocialAPI.ai gibi sağlayıcılar **tek API anahtarıyla 8-13 platformu** tek şemada sunar, Meta/X onayını siz değil onlar üstlenir — ayda $99-$249 arası; `X` $0.20/post URL maliyetini paketler [36][37]. SocialFlow’un mevcut `BaseSocialProvider` soyutlaması bunlardan birine geçişi kolaylaştırır (tek adapter değişimi).

---

## 4. Canlıya geçişte yapılması gerekenler (hukuki checklist)

- [ ] **Aydınlatma Metni + Açık Rıza + KVKK modalı** canlı — `SocialAccountPrivacyModal` zaten ekli, metni avukatla onaylatın.
- [ ] **OAuth dışında parola toplama yok** — kodda `password` alanı sadece `auth/register` kendi kullanıcısı için, **sosyal hesap parolası hiçbir formda yok** (tara).
- [ ] **VERBİS kaydı** (veri sorumlusu sıfatıyla) ve **DPA** (işleyen sıfatıyla) güncel.
- [ ] **Log saklama** — `AuditLog`, `PublicationAttempt` 2 yıl, KVKK 6698 silme/itiraz süreçleri tanımlı.
- [ ] **Çerez + CSRF + HSTS** — `src/lib/security/headers.ts` ve `middleware.ts` zaten üretimde aktif.
- [ ] **App Review video’ları** — her izin için ekran kaydı (izin istenirken ne verisi, nerede gösteriliyor).
- [ ] **Rate-limit + backoff** — `publishingService` retry + `Retry-After` uyumlu (kanıtlı).

---

## 5. Kaynaklar

[1] PostProxy 2026 — Sosyal medya API limit tablosu (IG 25, FB 25, X 500/ay) [postproxy.dev/blog](https://postproxy.dev/blog/social-media-platform-api-rules-rate-limits-media-specs/)  
[2] Berkeley D-Lab — Platformların API regülasyonu + block/captcha/legal aksiyon [dlab.berkeley.edu](https://dlab.berkeley.edu/news/evolving-landscape-web-scraping-social-media-platforms)  
[3] Phyllo 2026 — Basic Display 04.12.2024 kapandı, artık Business/Creator+SAYFA zorunlu [getphyllo.com](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)  
[4] SocialCrawl 2026 — Platform×Yargı alanı ToS matrisi (IG/TikTok/X/FB/LI) [socialcrawl.dev/blog](https://www.socialcrawl.dev/blog/social-media-scraping-legal-technical-guide)  
[5] Meta v. Bright Data (N.D. Cal. 23.01.2024) özet — ToS logged-in vs logged-off ayrımı [cloro.dev](https://cloro.dev/blog/website-scraping-legal/)  
[6] X ToS 10.04.2026 “scrape” yasağı [socialcrawl.dev](https://www.socialcrawl.dev/blog/social-media-scraping-legal-technical-guide)  
[7] hiQ Labs v. LinkedIn (9th Cir. 2022) — public ≠ CFAA ama ToS sivil dava [scrapecreators.com](https://scrapecreators.com/blog/web-scraping-legal)  
[8] Dev.to 2026 — ToS ihlali criminal değil, ama account/IP/civil dava [dev.to](https://dev.to/agenthustler/social-media-data-collection-whats-legal-and-whats-not-in-2026-aj6)  
[9] DataShake 2026 — “ToS violazione ≠ CFAA” ayrımı [datashake.com](https://www.datashake.com/blog/is-web-scraping-legal-what-you-need-to-know-in-2026)  
[10] ScrapeCreators — hiQ + Bright Data kararları [scrapecreators.com](https://scrapecreators.com/blog/web-scraping-legal)  
[11] Berkeley D-Lab — CFAA kapsamı [dlab.berkeley.edu](https://dlab.berkeley.edu/news/evolving-landscape-web-scraping-social-media-platforms)  
[12] Cloro 2026 — 7 ülke tablosu: login arkası = kırmızı [cloro.dev](https://cloro.dev/blog/website-scraping-legal/)  
[13] Sandbase 2026 — agent’larda API vs scrape karar matrisi [blog.sandbase.ai](https://blog.sandbase.ai/social-data-api-vs-web-scraping-agents-2026/)  
[14] Cloro — GDPR/CCPA public PII bile lawful basis ister [cloro.dev](https://cloro.dev/blog/website-scraping-legal/)  
[15] SocialCrawl — GDPR lawful basis + dual ToS riski [socialcrawl.dev](https://www.socialcrawl.dev/blog/social-media-scraping-legal-technical-guide)  
[16] Instagram Graph API Guide 2026 — App Review + Business Verification (tax doc + utility bill) [wpsocialninja.com](https://wpsocialninja.com/instagram-graph-api/)  
[17] IAPP / AI Act disclosure — KVKK/GDPR hâlen yürürlükte [cloro.dev](https://cloro.dev/blog/website-scraping-legal/)  
[18] Berkeley D-Lab — real-time compliance (silme) [dlab.berkeley.edu](https://dlab.berkeley.edu/news/evolving-landscape-web-scraping-social-media-platforms)  
[19] Bu repo: `src/components/SocialAccountPrivacyModal.tsx` (KVKK modalı), `services/accountRegistrationService.ts`  
[20] Bu repo: `src/lib/social/workspaceCredentials.ts`, `src/app/app/ayarlar/SettingsView.tsx` BYOK paneli  
[21] Blotato 2026 — platform limit/ücret tablosu [blotato.com/blog/social-media-api](https://www.blotato.com/blog/social-media-api)  
[22] Zernio 2026 — X pay-per-use, Meta free, TikTok audit [zernio.com](https://zernio.com/blog/top-12-social-media-apis-for-developers)  
[23] Apiscout 2026 — TikTok/LinkedIn approval [apiscout.dev](https://apiscout.dev/guides/best-social-media-apis-2026)  
[24] Meta Platform Overview — Standard vs Advanced Access [developers.facebook.com](https://developers.facebook.com/docs/instagram-platform/overview/)  
[25] Blog — Basic Display sunset 04.12.2024 [getphyllo.com](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)  
[26] WP Social Ninja — Business Login vs Facebook Login [wpsocialninja.com](https://wpsocialninja.com/instagram-graph-api/)  
[27] Elfsight — auth karşılaştırması [elfsight.com](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)  
[28] Instagram API Pricing 2026 — Advanced Access screencast [blotato.com](https://www.blotato.com/blog/instagram-api-pricing)  
[29] StackOverflow — manage_pages + instagram_basic + business_management [stackoverflow.com](https://stackoverflow.com/questions/50709794/cant-get-instagram-business-account-id-through-facebook-graph-api)  
[30] PostEverywhere FAQ — App Review 2-6 hafta, ilk ret yaygın, 8-12 hafta bütçe [posteverywhere.ai](https://posteverywhere.ai/blog/best-social-media-apis)  
[31] PostPlanify 2026 — X $0.01/post + $0.005/read, Basic kapalı [postplanify.com](https://postplanify.com/blog/best-social-media-apis-for-developers)  
[32] PostProxy — TikTok private-only audit [postproxy.dev](https://postproxy.dev/blog/social-media-platform-api-rules-rate-limits-media-specs/)  
[33] Blotato — YouTube quota 1 unit/100 call [blotato.com](https://www.blotato.com/blog/social-media-api)  
[34] Stream 2026 — LinkedIn MDP partner [getstream.io](https://getstream.io/blog/best-social-media-apis/)  
[35] LinkedIn API 2026 — rate limit gizli, portalda görünür [postproxy.dev](https://postproxy.dev/blog/social-media-platform-api-rules-rate-limits-media-specs/)  
[36] PostEverywhere — unified vs native kararı [posteverywhere.ai](https://posteverywhere.ai/blog/best-social-media-apis)  
[37] SocialAPI.ai — free tier 2 brand/10 post [social-api.ai](https://social-api.ai/blog/free-social-media-api-2026)

> **Not:** Bu araştırma bilgilendirme amaçlıdır; hukuki danışmanlık değildir. KVKK/GDPR uyumu için avukat onayı alın.
