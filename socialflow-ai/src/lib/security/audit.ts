import prisma from '../prisma';
import { clientIp, userAgent } from '../auth/session';

/**
 * Denetim kaydı (audit log). Tüm hassas işlemler burada izlenir:
 * hesap bağlama/koparma, yayınlama, ayar değişiklikleri, kural güncellemeleri.
 */
export async function audit(input: {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? '',
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ip: input.request ? clientIp(input.request) : null,
        userAgent: input.request ? userAgent(input.request) : null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null
      }
    });
  } catch (err) {
    // Denetim kaydı başarısız olursa ana akışı bozmayız; ama loglarız.
    console.error('[audit] kayıt yazılamadı', err);
  }
}
