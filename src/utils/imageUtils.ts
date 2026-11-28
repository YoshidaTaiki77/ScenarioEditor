import type { ActiveMode, ReferenceImage, VisibilityType } from '../types/scenario';

export const MAX_REFERENCE_IMAGES = 6;
export const MAX_CHARACTER_IMAGES = MAX_REFERENCE_IMAGES;
export const MAX_IMAGE_LONG_EDGE = 1200;
export const MAX_INPUT_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const SAFE_DATA_URL_RE = /^data:image\/(?:webp|jpeg|png|gif);base64,[A-Za-z0-9+/=]+$/;

export function isSafeImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && SAFE_DATA_URL_RE.test(value);
}

export function isReferenceImageVisibleInMode(
  visibility: VisibilityType,
  mode: ActiveMode
): boolean {
  if (mode === 'general') {
    return visibility !== 'adult_only';
  }
  return visibility !== 'general_alt';
}

export const isCharacterImageVisibleInMode = isReferenceImageVisibleInMode;

export function filterReferenceImagesForMode(
  images: ReferenceImage[] | undefined,
  mode: ActiveMode
): ReferenceImage[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  return images.filter((img) => isReferenceImageVisibleInMode(img.visibility, mode));
}

export const filterCharacterImagesForMode = filterReferenceImagesForMode;

export function normalizeReferenceImages(rawImages: unknown): ReferenceImage[] | undefined {
  if (!Array.isArray(rawImages) || rawImages.length === 0) return undefined;

  const normalized: ReferenceImage[] = [];
  const seenIds = new Set<string>();

  for (let idx = 0; idx < rawImages.length && normalized.length < MAX_REFERENCE_IMAGES; idx++) {
    const rawImg = rawImages[idx] as Partial<ReferenceImage> | null | undefined;
    if (!rawImg || typeof rawImg !== 'object' || !isSafeImageDataUrl(rawImg.dataUrl)) {
      continue;
    }

    const baseId =
      typeof rawImg.id === 'string' && rawImg.id.trim()
        ? rawImg.id.trim().slice(0, 80)
        : `img_${idx + 1}`;
    let uniqueId = baseId;
    let suffix = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${baseId}_${suffix++}`;
    }
    seenIds.add(uniqueId);

    const visibility: VisibilityType =
      rawImg.visibility === 'adult_only' || rawImg.visibility === 'general_alt'
        ? rawImg.visibility
        : 'common';
    const label = typeof rawImg.label === 'string' ? rawImg.label.trim().slice(0, 60) : '';
    const width =
      typeof rawImg.width === 'number' && Number.isFinite(rawImg.width) && rawImg.width > 0
        ? Math.round(rawImg.width)
        : undefined;
    const height =
      typeof rawImg.height === 'number' && Number.isFinite(rawImg.height) && rawImg.height > 0
        ? Math.round(rawImg.height)
        : undefined;
    const createdAt =
      typeof rawImg.createdAt === 'string' && rawImg.createdAt.trim()
        ? rawImg.createdAt.trim()
        : undefined;

    normalized.push({
      id: uniqueId,
      dataUrl: rawImg.dataUrl,
      label,
      visibility,
      width,
      height,
      createdAt,
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function deriveImageLabelFromFilename(filename: string, fallbackIndex: number): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '').trim();
  if (!withoutExt) return `設定画像 ${fallbackIndex}`;
  return withoutExt.slice(0, 24);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    img.src = src;
  });
}

function canvasHasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    // Sample every 16th pixel for fast alpha detection
    for (let i = 3; i < data.length; i += 64) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface CompressedImageResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Validates and compresses a local raster image file (PNG/JPEG/WebP/GIF)
 * into a compact Data URL (WebP preferred, preserving transparency; JPEG/PNG fallback).
 * SVG is intentionally rejected to prevent script injection risks.
 */
export async function compressImageFileToDataUrl(file: File): Promise<CompressedImageResult> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    throw new Error('SVG画像は安全のため登録できません。PNG / JPEG / WebP / GIF を選択してください。');
  }
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error('対応形式は PNG / JPEG / WebP / GIF のみです。');
  }
  if (file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error('ファイルサイズが大きすぎます（15MB以下の画像を選択してください）。');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) {
      throw new Error('画像のサイズを取得できませんでした。');
    }

    const longEdge = Math.max(naturalW, naturalH);
    const scale = longEdge > MAX_IMAGE_LONG_EDGE ? MAX_IMAGE_LONG_EDGE / longEdge : 1;
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('画像処理用の描画コンテキストを取得できませんでした。');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (supports transparency and offers high compression)
    let dataUrl = canvas.toDataURL('image/webp', 0.84);
    if (!dataUrl.startsWith('data:image/webp')) {
      // Fallback for browsers without WebP encoding
      const hasAlpha = canvasHasTransparency(ctx, targetW, targetH);
      if (hasAlpha) {
        dataUrl = canvas.toDataURL('image/png');
      } else {
        // Composite onto white background before JPEG encoding
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = targetW;
        jpegCanvas.height = targetH;
        const jCtx = jpegCanvas.getContext('2d');
        if (jCtx) {
          jCtx.fillStyle = '#ffffff';
          jCtx.fillRect(0, 0, targetW, targetH);
          jCtx.drawImage(canvas, 0, 0);
          dataUrl = jpegCanvas.toDataURL('image/jpeg', 0.85);
        } else {
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        }
      }
    }

    // If still very large (> 350KB) try a slightly tighter WebP/JPEG pass
    if (estimateDataUrlBytes(dataUrl) > 350 * 1024) {
      const tighter = dataUrl.startsWith('data:image/webp')
        ? canvas.toDataURL('image/webp', 0.72)
        : dataUrl.startsWith('data:image/jpeg')
          ? canvas.toDataURL('image/jpeg', 0.72)
          : dataUrl;
      if (tighter.startsWith('data:image/')) {
        dataUrl = tighter;
      }
    }

    if (!isSafeImageDataUrl(dataUrl)) {
      throw new Error('画像の変換結果が不正な形式でした。');
    }

    return {
      dataUrl,
      width: targetW,
      height: targetH,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
