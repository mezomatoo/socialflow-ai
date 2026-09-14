import { startQueueWorker } from './lib/queue/handlers';

/**
 * Next.js instrumentation — sunucu başlarken bir kez çalışır.
 * Kalıcı iş kuyruğunun işçisini (zamanlanmış yayınlar, token yenileme,
 * medya işleme, analiz senkronu) burada başlatıyoruz.
 *
 * Üretimde çok örnekli (multi-instance) dağıtımda işçiyi ayrı bir süreçte
 * çalıştırmak için `QUEUE_WORKER_ENABLED` benzeri bir bayrak ekleyin.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.QUEUE_WORKER_ENABLED === 'false') return;
    startQueueWorker();
    console.log('[socialflow] arka plan iş kuyruğu başlatıldı');
  }
}
