'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui';
import {
  computeTargetSize,
  detectFocalPoint,
  loadImage,
  ratioValue,
  renderVariant,
  type RenderOutput
} from '@/lib/media/engine';
import type { FocalPoint } from '@/lib/media/types';

export interface PreviewRule {
  recommendedAspectRatio: string;
  supportedAspectRatios: string[];
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  safeArea: { top: number; bottom: number; left: number; right: number } | null;
}

interface Props {
  /** Master medya kaynak URL'si. */
  src: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  kind: string;
  rule: PreviewRule | null;
  ratio?: string | null;
  focalPoint?: FocalPoint | null;
  cropMode?: 'SMART' | 'MANUAL' | 'FIT';
  /** Odak noktası elle değiştirildiğinde (oransal x,y). */
  onFocalChange?: (fp: FocalPoint) => void;
  /** Varyant render edildiğinde (üst bileşen kaydedebilsin diye). */
  onRendered?: (out: { dataUrl: string; width: number; height: number; bytes: number }) => void;
  editable?: boolean;
  showSafeArea?: boolean;
  className?: string;
}

/**
 * Platforma özel medya önizlemesi. Orijinal dosyaya DOKUNMAZ; canvas üzerinde
 * akıllı kırpma + odak noktası ile hedef oranda varyant üretir. Asla esnetmez.
 */
export function VariantPreview({
  src,
  sourceWidth,
  sourceHeight,
  kind,
  rule,
  ratio,
  focalPoint,
  cropMode = 'SMART',
  onFocalChange,
  onRendered,
  editable = false,
  showSafeArea = true,
  className = ''
}: Props) {
  const [output, setOutput] = useState<RenderOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFocal, setAutoFocal] = useState<FocalPoint | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const activeRatio = ratio || rule?.recommendedAspectRatio || '1:1';
  const isVideo = kind === 'VIDEO';

  const render = useCallback(async () => {
    if (!src || !rule || isVideo) return;
    setLoading(true);
    setError(null);
    try {
      if (!imgRef.current || imgRef.current.src !== src) {
        imgRef.current = await loadImage(src);
      }
      const img = imgRef.current;
      const sw = sourceWidth || img.naturalWidth;
      const sh = sourceHeight || img.naturalHeight;

      // Önizleme için çıktıyı makul bir boyuta indir (performans), ama oranı koru.
      const previewMax = 720;
      const size = computeTargetSize(activeRatio, {
        minWidth: Math.min(rule.minWidth, previewMax),
        minHeight: Math.min(rule.minHeight, previewMax),
        maxWidth: Math.min(rule.maxWidth, previewMax),
        maxHeight: Math.min(rule.maxHeight, previewMax)
      });

      let fp = focalPoint ?? autoFocal;
      if (!fp) {
        fp = await detectFocalPoint(img, sw, sh);
        setAutoFocal(fp);
      }

      const out = await renderVariant({
        source: img,
        sourceWidth: sw,
        sourceHeight: sh,
        targetRatio: ratioValue(activeRatio),
        targetWidth: size.width,
        targetHeight: size.height,
        focalPoint: fp,
        edits: { cropMode },
        mimeType: 'image/jpeg',
        quality: 0.88
      });
      setOutput(out);
      onRendered?.({ dataUrl: out.dataUrl, width: out.width, height: out.height, bytes: out.bytes });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Önizleme oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }, [src, rule, isVideo, activeRatio, sourceWidth, sourceHeight, focalPoint, autoFocal, cropMode, onRendered]);

  useEffect(() => {
    render();
  }, [render]);

  function handlePick(e: React.MouseEvent) {
    if (!editable || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const fp: FocalPoint = { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), method: 'MANUAL' };
    setAutoFocal(fp);
    onFocalChange?.(fp);
  }

  const safe = rule?.safeArea;

  if (!src) {
    return (
      <div className={`flex aspect-square items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle text-ink-faint ${className}`}>
        <span className="flex flex-col items-center gap-1 text-[12px]">
          <Icon name="image" size={24} /> Medya seçilmedi
        </span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-line bg-black ${className}`} style={{ aspectRatio: activeRatio.replace(':', ' / ') }}>
        <video src={src} className="h-full w-full object-cover" muted playsInline />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
            <Icon name="play" size={22} />
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={wrapRef}
        onClick={handlePick}
        className={`relative w-full overflow-hidden rounded-xl border border-line bg-surface-subtle ${editable ? 'cursor-crosshair' : ''}`}
        style={{ aspectRatio: activeRatio.replace(':', ' / ') }}
      >
        {output ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={output.dataUrl} alt="Platform önizlemesi" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-ink-faint">
            {loading ? <Spinner size={20} /> : <Icon name="image" size={24} />}
          </span>
        )}

        {/* Odak noktası işareti */}
        {(focalPoint ?? autoFocal) && (
          <span
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600/90 shadow"
            style={{ left: `${(focalPoint ?? autoFocal)!.x * 100}%`, top: `${(focalPoint ?? autoFocal)!.y * 100}%` }}
          />
        )}

        {/* Güvenli alan kılavuzu */}
        {showSafeArea && safe && (safe.top || safe.bottom || safe.left || safe.right) ? (
          <span
            className="pointer-events-none absolute border border-dashed border-white/70"
            style={{
              top: `${safe.top * 100}%`,
              bottom: `${safe.bottom * 100}%`,
              left: `${safe.left * 100}%`,
              right: `${safe.right * 100}%`
            }}
          />
        ) : null}

        {error && (
          <span className="absolute inset-x-0 bottom-0 bg-danger/85 px-2 py-1 text-[11px] text-white">{error}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
        <span>
          {activeRatio} · {output ? `${output.width}×${output.height}` : '—'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="crop" size={11} />
          {cropMode === 'FIT' ? 'Sığdır' : cropMode === 'MANUAL' ? 'Elle' : 'Akıllı kırpma'}
        </span>
      </div>
      {editable && <p className="hint mt-0.5">Odak noktasını taşımak için görsele tıklayın.</p>}
    </div>
  );
}
