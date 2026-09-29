# Google Ads bağlantısı

SocialFlow AI içindeki Google Ads bağlantısı **salt okuma** dikeyidir. Google OAuth ile
kullanıcının erişebildiği müşteri hesapları doğrulanır ve `AdAccount` olarak çalışma alanına
kaydedilir. Bu akış organik Google/YouTube hesabı bağlantısından ayrıdır; organik token reklam
yetkisi sayılmaz.

## Sunucu ayarları

`.env` dosyasına aşağıdaki değerleri ekleyin:

```dotenv
# Google Cloud OAuth istemcisi
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...

# Google Ads Manager hesabındaki developer token
GOOGLE_ADS_DEVELOPER_TOKEN=...

# Bir MCC üzerinden müşteri hesapları okunuyorsa MCC kimliği; tireler isteğe bağlıdır.
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890

# Kullanılan REST API sürümü (varsayılan: v22)
GOOGLE_ADS_API_VERSION=v22
```

`GOOGLE_ADS_CLIENT_ID` ve `GOOGLE_ADS_CLIENT_SECRET` boş bırakılırsa OAuth için mevcut
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` değerlerine geri dönülür. Üretimde reklam ve
organik/YouTube OAuth uygulamalarını ayırmak daha güvenlidir.

Google Cloud OAuth istemcisinde şu redirect URI **birebir** tanımlanmalıdır:

```text
${APP_URL}/api/auth/google-ads/callback
```

Üretimde `APP_URL` kök HTTPS origin olmalıdır. Geliştirmede yalnızca `localhost` veya
`127.0.0.1` için HTTP kabul edilir. Gizli değerleri Git'e veya sohbet mesajlarına koymayın.

## Akış

1. `/app/reklamlar` veya `/app/reklamlar/hesaplar` ekranından **Google Ads hesabı bağla** seçilir.
2. Sunucu tek kullanımlık, kısa ömürlü OAuth state ve PKCE verifier üretir.
3. Kullanıcı Google'ın resmi izin ekranına yönlendirilir; yalnızca
   `https://www.googleapis.com/auth/adwords` scope'u istenir.
4. Callback, state ve oturum/çalışma alanı bağını doğrular; authorization code'u token'a çevirir.
5. `customers:listAccessibleCustomers` ve müşteri sorgusu ile hesap adı, ID, para birimi ve
   sağlayıcı saat dilimi Google Ads API'den okunur.
6. Yalnızca doğrulama başarılı olduktan sonra token, `AdAccountCredential` içinde AES-GCM ile
   şifrelenir; hesaplar `AdAccount` ve sağlayıcı yetenek kanıtı olarak kaydedilir.

Tokenlar tarayıcıya, localStorage'a, API DTO'larına veya loglara gönderilmez. Yeniden bağlanma
sırasında Google yeni refresh token döndürmezse mevcut şifreli refresh token korunur.

## Kapsam ve sınırlar

- Etkin: Google Ads müşteri hesabı OAuth bağlantısı, erişilebilir hesap keşfi, hesap ayrıntıları
  ve kampanya okuma sözleşmesi.
- Kapalı: kampanya/reklam oluşturma, bütçe veya teklif değişikliği, duraklatma/etkinleştirme,
  dönüşüm yükleme, katalog, webhook ve finansal metrik/ROAS üretimi.
- Google Ads API veya developer token hataları kullanıcıya güvenli ve kısa mesajlarla gösterilir;
  Google'ın ham yanıtı veya token içeriği sızdırılmaz.
- Demo modu gerçek Google Ads'e bağlanmayı reddeder. Gerçek bağlantı için `DEMO_MODE=false`
  ve çalışma alanının demo modunun kapalı olması gerekir.

`GOOGLE_ADS_LOGIN_CUSTOMER_ID` bir MCC üzerinden müşteri hesaplarına erişimde önemlidir. Tek bir
müşteri hesabına doğrudan erişen OAuth kullanıcılarında boş bırakılabilir. Developer token'ın
Google Ads hesabı ve kullanılan API sürümüyle uyumlu olması gerekir.
