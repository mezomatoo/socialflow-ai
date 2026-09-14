import { apiRoute, ok } from '@/lib/api';
import { listVersions } from '@/lib/services/contentService';

/** Sürüm geçmişi */
export const GET = apiRoute(async (_request, { params }) => {
  const versions = await listVersions(params.id);
  return ok({
    items: versions.map((v) => ({
      id: v.id,
      version: v.version,
      kind: v.kind,
      note: v.note,
      createdAt: v.createdAt,
      createdById: v.createdById,
      payload: safeParse(v.payload)
    }))
  });
});

function safeParse(raw: string) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
