export const INSTAGRAM_CONNECTION_MESSAGES = {
  connected: 'Instagram hesabı resmî OAuth ile bağlandı. Gelen Kutusu bağlantısı ayrıca etkinleştirilmelidir.',
  denied: 'Meta yetkilendirmesi iptal edildi. Önceki bağlantınız değiştirilmedi.',
  invalid_state: 'Bağlantı isteği geçersiz veya süresi dolmuş. Sosyal Medya Hesapları ekranından yeniden başlatın.',
  forbidden: 'Bu bağlantıyı yönetme yetkiniz yok veya gerçek kullanıcı oturumu gerekli.',
  configuration: 'Gerçek bağlantı için demo modunu kapatın, API yapılandırmasını ve HTTPS uygulama adresini doğrulayın.',
  account_mismatch: 'Yetkilendirilen Instagram hesapları seçtiğiniz hesapla eşleşmedi. Önceki bağlantınız korundu.',
  permissions: 'Gerekli veya mevcut bağlantıda kullanılan izinler verilmedi. Önceki bağlantınız korundu.',
  stale_account: 'Hesap bağlantı başlatıldıktan sonra değiştirildi. Güvenlik için işlemi yeniden başlatın.',
  provider_error: 'Meta bağlantısı doğrulanamadı. Önceki bağlantınız değiştirilmedi. Daha sonra yeniden deneyin.',
  not_found: 'Hesap bulunamadı.'
} as const;
export type InstagramConnectionCode = keyof typeof INSTAGRAM_CONNECTION_MESSAGES;
export class InstagramConnectionError extends Error {
  constructor(public code: Exclude<InstagramConnectionCode, 'connected'>, public status = 400) { super(INSTAGRAM_CONNECTION_MESSAGES[code]); }
}
