/**
 * Test ortamı: harici AI sağlayıcısı ERİŞİLEMEZ olarak yapılandırılır.
 * Bu modül, ilgili modüller (env, provider, servisler) içe aktarılmadan ÖNCE
 * yüklenmelidir; bu yüzden test dosyalarında ilk import olarak yer alır.
 */
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';
process.env.AI_TIMEOUT_MS = '1500';

export const OFFLINE_AI = true;
