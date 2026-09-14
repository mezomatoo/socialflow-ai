import type { ContentType, PlatformCode } from '../platforms/platforms';

export interface FocalPoint {
  x: number; // 0..1
  y: number; // 0..1
  method?: 'AUTO' | 'FACE' | 'SUBJECT' | 'MANUAL' | 'CENTER';
  confidence?: number;
  faces?: { x: number; y: number; w: number; h: number }[];
}

export interface MediaAnalysis {
  focalPoint?: FocalPoint;
  faces?: { x: number; y: number; w: number; h: number; confidence: number }[];
  hasText?: boolean;
  textRegions?: { x: number; y: number; w: number; h: number }[];
  logoRegion?: { x: number; y: number; w: number; h: number } | null;
  dominantColors?: string[];
  brightness?: number; // 0..1
  blurScore?: number; // 0..1 (yüksek = bulanık)
  subjects?: string[];
  analyzedAt?: string;
}

export interface MediaVariant {
  platform: PlatformCode;
  contentType: ContentType;
  ratio: string; // "1:1"
  width: number;
  height: number;
  bytes?: number;
  storageKey?: string;
  publicUrl?: string;
  crop?: { x: number; y: number; w: number; h: number }; // kaynak üzerindeki kırpma alanı (oransal)
  method?: 'SMART_CROP' | 'FIT' | 'AI_EXTEND' | 'MANUAL';
  focalPoint?: FocalPoint;
}

export interface MediaAssetView {
  id: string;
  kind: string;
  filename: string;
  originalName: string;
  publicUrl: string | null;
  storageKey: string;
  mimeType: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  aspectRatio: number | null;
  focalPoint: FocalPoint | null;
  analysis: MediaAnalysis | null;
  derivatives: MediaVariant[];
  tags: string[];
  campaign: string | null;
  brandId: string | null;
  brandName?: string | null;
  status: string;
  createdAt: string;
}

export interface MediaIssue {
  level: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string; // Türkçe, kullanıcıya gösterilir
  platform?: PlatformCode;
  contentType?: ContentType;
  suggestion?: string;
}
