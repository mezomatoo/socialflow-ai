/** MediaAsset → API/istemci DTO dönüşümü (route dosyalarından bağımsız). */

export function safeJson(raw: any): any {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export function safeJsonArray(raw: any): any[] {
  const v = safeJson(raw);
  return Array.isArray(v) ? v : [];
}

export function serializeMedia(m: any) {
  return {
    id: m.id,
    kind: m.kind,
    filename: m.filename,
    originalName: m.originalName,
    publicUrl: m.publicUrl,
    storageKey: m.storageKey,
    mimeType: m.mimeType,
    format: m.format,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    aspectRatio: m.aspectRatio,
    focalPoint: safeJson(m.focalPoint),
    analysis: safeJson(m.analysis),
    derivatives: safeJsonArray(m.derivatives),
    tags: String(m.tags ?? '').split(',').filter(Boolean),
    campaign: m.campaign,
    brandId: m.brandId,
    brandName: m.brand?.name ?? null,
    status: m.status,
    createdAt: m.createdAt
  };
}
