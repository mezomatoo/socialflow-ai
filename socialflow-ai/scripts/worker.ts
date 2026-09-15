// Explicit worker entrypoint. Uses the existing queue, not a second job system.
import { startQueueWorker } from '../src/lib/queue/handlers';
startQueueWorker();
console.log('SocialFlow AI işçisi çalışıyor.');
// Existing worker interval is unref'ed for Next.js; retain the standalone process.
setInterval(() => {}, 60_000);
