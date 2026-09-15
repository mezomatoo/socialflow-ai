/**
 * PHASE 4 — Content & Video Repurposing (§78-§86)
 */

export function repurposeCaption(input: { sourceCaption: string; fromPlatform: string; toPlatforms: string[]; brandTone?: string }): Record<string, string> {
  const base = input.sourceCaption.trim();
  const out: Record<string, string> = {};
  for (const p of input.toPlatforms) {
    if (p === 'X') out[p] = base.slice(0, 280);
    else if (p === 'LINKEDIN') out[p] = `💼 ${base}\n\n#profesyonel`;
    else if (p === 'INSTAGRAM') out[p] = `${base}\n\n✨`;
    else if (p === 'TIKTOK') out[p] = base.slice(0, 150) + ' 🎥';
    else out[p] = base;
  }
  return out;
}

export interface VideoAnalysis {
  durationMs: number;
  scenes: { startMs: number; endMs: number; label: string }[];
  transcription?: string;
  highlights: { startMs: number; endMs: number; reason: string }[];
  hooks: { type: 'question' | 'problem' | 'benefit' | 'curiosity' | 'story'; text: string }[];
}

export async function analyzeVideo(input: { storageKey: string; durationMs?: number }): Promise<VideoAnalysis> {
  const dur = input.durationMs ?? 60_000;
  return {
    durationMs: dur,
    scenes: [
      { startMs: 0, endMs: 5000, label: 'Giriş' },
      { startMs: 5000, endMs: 20000, label: 'Ürün tanıtımı' },
      { startMs: 20000, endMs: 40000, label: 'Fayda anlatımı' },
      { startMs: 40000, endMs: dur, label: 'Kapanış / CTA' },
    ],
    transcription: 'Merhaba, bugün yeni ürünümüzü tanıtıyoruz...',
    highlights: [{ startMs: 15000, endMs: 37000, reason: 'Ürünün temel faydasının açıklandığı bölüm.' }],
    hooks: [
      { type: 'question', text: 'Nitelikli kahvenin sırrını biliyor musunuz?' },
      { type: 'benefit', text: 'Her yudumda daha fazla aroma.' },
      { type: 'curiosity', text: 'Bu kahve neden bu kadar özel?' },
    ],
  };
}

export function suggestClips(analysis: VideoAnalysis): { start: string; end: string; label: string }[] {
  return analysis.highlights.map((h) => ({
    start: msToTime(h.startMs),
    end: msToTime(h.endMs),
    label: h.reason,
  }));
}

function msToTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function generateCaptionVariants(caption: string): Record<string, string> {
  return {
    short: caption.slice(0, 80),
    medium: caption.slice(0, 160),
    long: caption,
    professional: `💼 ${caption}`,
    premium: `✨ ${caption} — premium deneyim`,
    friendly: `😊 ${caption}`,
    sales: `🔥 ${caption} — Kaçırma!`,
    educational: `📚 Biliyor muydunuz? ${caption}`,
    storytelling: `Bir hikâyemiz var: ${caption}`,
  };
}
