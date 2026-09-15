import { NextRequest, NextResponse } from 'next/server';
import { readLocal } from '@/lib/storage/storage';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
};

/** Yerel depolama sürücüsü için dosya sunumu. (S3 sürücüsünde gerekmez.) */
export async function GET(_req: NextRequest, { params }: { params: { key: string[] } }) {
  const key = (params.key ?? []).join('/');
  if (!key) return new NextResponse('Not found', { status: 404 });

  const file = await readLocal(key);
  if (!file) return new NextResponse('Not found', { status: 404 });

  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const type = MIME[ext] ?? 'application/octet-stream';

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
