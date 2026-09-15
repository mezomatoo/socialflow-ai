import { createHmac, timingSafeEqual } from 'crypto';
/** Gateway primitive only: no unauthenticated ingestion route is enabled in this stage.
 * Meta retry window is 36h; persisted event/message deduplication is still mandatory.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export function validWebhookTimestamp(seconds: unknown, now = Date.now()): boolean {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds * 1000 <= now + 300_000 && seconds * 1000 >= now - 36 * 60 * 60_000;
}
