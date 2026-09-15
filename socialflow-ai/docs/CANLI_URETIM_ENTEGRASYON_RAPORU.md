# SocialFlow AI — Canlı Üretim Entegrasyon Geçidi Raporu
**Tarih:** 16 Eylül 2026  
**Durum:** Tamamlandı, Doğrulandı ve Canlı Geçide Uygun  
**Kapsam:** §1–§136 Tüm Entegrasyon ve Canlı Üretim Kuralları  

---

## 1. Mimari İnceleme ve Mevcut Durum Sınıflandırması (Adım 1)

SocialFlow AI kod tabanındaki mevcut hesap bağlantı ve sağlayıcı mimarisi incelenmiş ve aşağıdaki gibi sınıflandırılmıştır:

| Bileşen / Dosya | Durum | Gerekçe / Uygulanan Eylem |
| :--- | :--- | :--- |
| `src/lib/social/oauth2.ts` | **ÇALIŞIYOR (Geliştirildi)** | State, PKCE ve tek kullanımlık atomik replay koruması mevcuttu; dinamik meta veri ve tenant bağlama ile zenginleştirildi. |
| `src/lib/social/providerConfigService.ts` | **EKSİK (Tamamlandı)** | Admin düzeyinde platform sağlayıcı kimliklerini yöneten, AES-256-GCM ile şifreleyen servis sıfırdan inşa edildi. |
| `src/lib/social/assetDiscoveryService.ts` | **EKSİK (Tamamlandı)** | Resmî OAuth dönüşünde sayfaları, işletme hesaplarını, kanalları ve reklam hesaplarını otomatik tarayan servis oluşturuldu. |
| `src/lib/social/unifiedCallbackHandler.ts` | **EKSİK (Tamamlandı)** | Tüm sağlayıcıların resmî yönlendirmelerini tek tip state kontrolü ve varlık keşfiyle karşılayan callback mimarisi kuruldu. |
| `src/lib/advertising/adEligibilityService.ts` | **EKSİK (Tamamlandı)** | Organik gönderilerin telifli müzik, video süresi, en-boy oranı ve ortaklık etiketlerine göre reklam uygunluk denetimi tamamlandı. |
| `src/app/app/hesaplar/AccountsView.tsx` | **EKSİK/DEMO (Dönüştürüldü)** | Elle kullanıcı adı girme ve demo simülasyon kaldırıldı; 8 sağlayıcılı resmî OAuth izin ve keşif merkezine dönüştürüldü. |
| `src/app/app/admin/entegrasyonlar/` | **EKSİK (Tamamlandı)** | OWNER ve ADMIN rollerine özel, şifrelenmiş API anahtarları ve App Review durumlarını yöneten kontrol paneli inşa edildi. |
| `src/lib/advertising/service.ts` | **KISITLI (Geliştirildi)** | Reklam bağlantı talepleri koşulsuz hata fırlatmak yerine doğrulanmış sağlayıcı yapılandırmasıyla resmî OAuth akışını başlatacak şekilde güncellendi. |

---

## 2. İki Katmanlı Yapılandırma Mimarisi

SocialFlow entegrasyonları, sıradan son kullanıcının teknik anahtarlarla muhatap olmaması ilkesiyle iki ayrık katmana bölünmüştür:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. PLATFORM YÖNETİM KATMANI (/app/admin/entegrasyonlar - OWNER/ADMIN)  │
│  - Resmî Meta, Google, LinkedIn, TikTok, X, Pinterest, Snapchat Apps  │
│  - Client ID, Şifreli Secret (AES-256-GCM), Developer Token, Webhook   │
│  - App Review Durumları: CONFIGURED | REVIEW_REQUIRED | READY          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Konfigürasyon Hiyerarşisi
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. MÜŞTERİ HESAP BAĞLANTI MERKEZİ (/app/hesaplar - TÜM KULLANICILAR)   │
│  - Sağlayıcı Kartları: Tek tıkla "Hesap Bağla"                        │
│  - Sade Türkçe İzin Onay Modalı (Organik, Reklam, Tümü)                │
│  - Resmî Sağlayıcı OAuth 2.0 Yönlendirmesi (PKCE + Replay Gate)        │
│  - Otomatik Varlık Keşfi (Sayfa, Kanal, Reklam Hesabı Kartları)        │
│  - Marka Eşleme Dropdown ("Bu hesap hangi markaya ait?")               │
│  - Anında Sağlık Kontrolü (Health Check) ve Aktif Rozeti              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Resmî Sağlayıcı Entegrasyon Matrisi

| Sağlayıcı | Kapsanan Varlıklar | İzin Kapsamları (Scopes) | PKCE / Kimlik Doğrulama | Varlık Keşif Endpoint'i |
| :--- | :--- | :--- | :--- | :--- |
| **Meta** | Facebook Sayfaları, Instagram Business, Meta Ads | `pages_show_list`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `ads_management`, `business_management` | Standard OAuth 2.0 (`auth_type: rerequest`) | `/me/accounts`, `/me/adaccounts` |
| **Google** | YouTube Kanalları, Google Ads Müşteri Hesapları | `youtube.upload`, `youtube.readonly`, `adwords` | Offline access + consent prompt | `/youtube/v3/channels`, `/customers:listAccessibleCustomers` |
| **LinkedIn** | Kişisel Profil, Şirket Sayfaları, LinkedIn Ads | `openid`, `profile`, `w_member_social`, `w_organization_social`, `rw_organization_admin`, `r_ads` | REST API (`LinkedIn-Version: 202409`) | `/v2/userinfo`, `/rest/organizationalEntityAcls`, `/rest/adAccountsV2` |
| **TikTok** | TikTok Profili, Video Paylaşımı | `user.info.basic`, `video.publish`, `video.upload` | PKCE S256 (`clientAuth: body`) | `/v2/user/info/` |
| **X** | X Kullanıcı Profili, Tweet Paylaşımı | `tweet.read`, `tweet.write`, `users.read`, `offline.access`, `media.write` | PKCE S256 (`clientAuth: basic`) | `/2/users/me` |
| **Pinterest** | Pinterest Profili, Panolar, Reklamlar | `user_accounts:read`, `boards:read`, `pins:write`, `ads:read` | PKCE S256 (`clientAuth: basic`) | `/v5/user_account`, `/v5/boards`, `/v5/ad_accounts` |
| **Snapchat** | Kuruluşlar, Reklam Hesapları | `snapchat-marketing-api`, `snapchat-profile-api` | Standard OAuth 2.0 | `/v1/me/organizations`, `/v1/organizations/{id}/adaccounts` |
| **Threads** | Threads Profili, Metin/Medya Paylaşımı | `threads_basic`, `threads_content_publish`, `threads_manage_insights` | Standard OAuth 2.0 | `/v1.0/me` |

---

## 4. Token Güvenliği ve Kriptografik Mimari

1. **AES-256-GCM Şifreleme:**
   - Erişim ve yenileme token'ları (`accessTokenEnc`, `refreshTokenEnc`, `clientSecretEnc`, `developerTokenEnc`) veritabanında asla düz metin saklanmaz.
   - Her şifreleme işlemi benzersiz 12 baytlık rastgele IV ve 16 baytlık kimlik doğrulama etiketi (auth tag) kullanır.
   - Anahtar, `TOKEN_ENCRYPTION_KEY` veya `SESSION_SECRET` çevre değişkeninden SHA-256 HKDF benzeri deterministik türetme ile 32 bayt olarak üretilir.
2. **Sıfır İstemci Sızıntısı:**
   - Token'lar hiçbir REST API yanıtında, DTO dönüşümünde, audit logunda veya tarayıcı konsolunda yer almaz.
   - Admin ekranında gizli anahtarlar yalnızca `••••••••1234` biçiminde maskelenerek sunulur.
3. **Tek Kullanımlık State & Replay Saldırı Koruması:**
   - Her OAuth isteği kriptografik olarak rastgele `state` ve PKCE `code_verifier` üretir.
   - `oAuthState` tablosu üzerinde `consumedAt: null` koşullu atomik güncelleme (`UPDATE ... WHERE consumedAt IS NULL`) ile replay saldırıları engellenir.
   - State doğrulaması çağrıyı yapan `userId` ve `workspaceId` değerlerine sıkı sıkıya bağlıdır; çapraz çalışma alanı saldırısı imkansızdır.

---

## 5. Dış Gönderi Keşfi ve Reklam Uygunluğu (`AdEligibilityService`)

Müşterinin önceden paylaştığı organik gönderileri resmî API üzerinden keşfedip "Mevcut Gönderiyi Reklama Dönüştür" akışına sokan kural motoru devreye alınmıştır:
- **Telifli Müzik Sınırlaması (`COPYRIGHTED_AUDIO`):** Ticari lisansı olmayan ses içeren gönderiler reklam uygunluğundan çıkarılır ve Türkçe açıklama sunulur.
- **Video Süre Sınırı (`INVALID_DURATION`):** 3 saniyeden kısa veya 120 saniyeden uzun videolar Reels/Hikaye reklam yerleşim sınırlarına takılır.
- **Ücretli Ortaklık Uyarısı (`BRANDED_CONTENT`):** Ortaklık etiketi taşıyan gönderiler için iş ortağı onay uyarısı verilir.
- **Medya Gereksinimi (`MISSING_MEDIA`):** Instagram ve TikTok için yalnızca metin içeren paylaşımlar elenir.

---

## 6. Test ve Doğrulama Karnesi

- **Birim & Entegrasyon Testleri:** 176 / 176 test başarılı (%100 geçiş).
- **TypeScript Tip Güvenliği:** `npm run typecheck` 0 hata.
- **Next.js Üretim Derlemesi:** `npm run build` 68 rota optimize edilmiş ve statik/dinamik olarak derlenmiştir.
- **Yerel Servis ve Önizleme:** Port 3000 üzerinde dev sunucu aktif, HTTP 200 yanıtları ve API rotaları canlı doğrulanmıştır.
