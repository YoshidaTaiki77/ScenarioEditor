import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { ActiveMode, ReferenceImage, VisibilityType } from '../types/scenario';
import {
  MAX_REFERENCE_IMAGES,
  compressImageFileToDataUrl,
  deriveImageLabelFromFilename,
  estimateDataUrlBytes,
  formatBytesCompact,
} from '../utils/imageUtils';

interface ImageLightboxModalProps {
  images: ReferenceImage[];
  activeIndex: number | null;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
  altFallback?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  images,
  activeIndex,
  onChangeIndex,
  onClose,
  altFallback = '設定画像',
}) => {
  const isOpen = activeIndex !== null && activeIndex >= 0 && activeIndex < images.length;
  const current = isOpen ? images[activeIndex] : null;

  useEffect(() => {
    if (!isOpen || activeIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        onChangeIndex((activeIndex - 1 + images.length) % images.length);
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        onChangeIndex((activeIndex + 1) % images.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, activeIndex, images.length, onChangeIndex, onClose]);

  if (!isOpen || !current || activeIndex === null) return null;

  const visLabel =
    current.visibility === 'adult_only'
      ? 'R18専用'
      : current.visibility === 'general_alt'
        ? '一般用のみ'
        : '共通';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.label || `${altFallback}プレビュー`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-2.5 text-xs text-slate-200">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-white">
              {current.label || `設定画像 ${activeIndex + 1}`}
            </span>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                current.visibility === 'adult_only'
                  ? 'bg-rose-900/80 text-rose-200'
                  : current.visibility === 'general_alt'
                    ? 'bg-sky-900/80 text-sky-200'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              {visLabel}
            </span>
            {current.width && current.height && (
              <span className="hidden sm:inline font-code text-[10px] text-slate-400 tabular-nums">
                {current.width}×{current.height}
              </span>
            )}
            {images.length > 1 && (
              <span className="font-code text-[10px] text-slate-400 tabular-nums">
                {activeIndex + 1} / {images.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="拡大表示を閉じる"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image viewport */}
        <div className="relative flex min-h-[260px] flex-1 items-center justify-center bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] bg-slate-950 p-3 sm:p-5">
          <img
            src={current.dataUrl}
            alt={current.label || altFallback}
            className="max-h-[76vh] max-w-[84vw] object-contain rounded shadow-lg select-none"
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onChangeIndex((activeIndex - 1 + images.length) % images.length)}
                aria-label="前の画像"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/85 p-2 text-slate-200 hover:bg-slate-800 hover:text-white shadow-md transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onChangeIndex((activeIndex + 1) % images.length)}
                aria-label="次の画像"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/85 p-2 text-slate-200 hover:bg-slate-800 hover:text-white shadow-md transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export interface ReferenceImageGalleryProps {
  entityId: string;
  images: ReferenceImage[];
  activeMode: ActiveMode;
  onChangeImages: (nextImages: ReferenceImage[]) => void;
  entityUnitLabel?: string;
  labelPlaceholder?: string;
  altFallback?: string;
}

export const ReferenceImageGallery: React.FC<ReferenceImageGalleryProps> = ({
  entityId,
  images,
  activeMode,
  onChangeImages,
  entityUnitLabel = '1キャラクター',
  labelPlaceholder = 'ラベル（例: 立ち絵・三面図）',
  altFallback = '設定画像',
}) => {
  const isAdult = activeMode === 'adult';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Reset transient UI state when switching target entity
  useEffect(() => {
    setErrorMsg(null);
    setLightboxIndex(null);
    setIsDraggingOver(false);
  }, [entityId]);

  const hiddenAdultCount = useMemo(
    () => (isAdult ? 0 : images.filter((img) => img.visibility === 'adult_only').length),
    [images, isAdult]
  );

  // In general mode, completely hide adult_only images to prevent accidental display.
  // In adult mode, show all images (with general_alt subtly dimmed for management).
  const displayedEntries = useMemo(() => {
    return images
      .map((img, originalIndex) => ({ img, originalIndex }))
      .filter(({ img }) => isAdult || img.visibility !== 'adult_only');
  }, [images, isAdult]);

  const displayedImages = useMemo(
    () => displayedEntries.map((e) => e.img),
    [displayedEntries]
  );

  const remainingSlots = Math.max(0, MAX_REFERENCE_IMAGES - images.length);

  const processFiles = useCallback(
    async (fileList: File[] | FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setErrorMsg(null);
      if (images.length >= MAX_REFERENCE_IMAGES) {
        setErrorMsg(`設定画像は${entityUnitLabel}につき最大${MAX_REFERENCE_IMAGES}枚まで登録できます。`);
        return;
      }

      const slots = MAX_REFERENCE_IMAGES - images.length;
      const toProcess = files.slice(0, slots);
      const skippedByLimit = files.length - toProcess.length;

      setIsProcessing(true);
      try {
        const created: ReferenceImage[] = [];
        const errors: string[] = [];

        for (let i = 0; i < toProcess.length; i++) {
          const f = toProcess[i];
          try {
            const compressed = await compressImageFileToDataUrl(f);
            created.push({
              id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              dataUrl: compressed.dataUrl,
              label: deriveImageLabelFromFilename(f.name, images.length + created.length + 1),
              visibility: isAdult ? 'adult_only' : 'common',
              width: compressed.width,
              height: compressed.height,
              createdAt: new Date().toISOString(),
            });
          } catch (err) {
            errors.push(
              err instanceof Error ? err.message : '画像の読み込みに失敗しました。'
            );
          }
        }

        if (created.length > 0) {
          onChangeImages([...images, ...created]);
          setCollapsed(false);
        }

        if (errors.length > 0) {
          setErrorMsg(errors[0]);
        } else if (skippedByLimit > 0) {
          setErrorMsg(
            `上限（最大${MAX_REFERENCE_IMAGES}枚）に達したため、${skippedByLimit}枚は追加されませんでした。`
          );
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [entityUnitLabel, images, isAdult, onChangeImages]
  );

  // Support Ctrl/Cmd+V image paste when not focused inside a text input/textarea
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isEditingText =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);
      if (isEditingText) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFiles(imageFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFiles]);

  const handleUpdateImage = (originalIndex: number, patch: Partial<ReferenceImage>) => {
    onChangeImages(
      images.map((img, idx) => (idx === originalIndex ? { ...img, ...patch } : img))
    );
  };

  const handleDeleteImage = (originalIndex: number) => {
    onChangeImages(images.filter((_, idx) => idx !== originalIndex));
    setLightboxIndex(null);
  };

  const handleMoveImage = (originalIndex: number, direction: -1 | 1) => {
    const target = originalIndex + direction;
    if (target < 0 || target >= images.length) return;
    const copy = [...images];
    const [moved] = copy.splice(originalIndex, 1);
    copy.splice(target, 0, moved);
    onChangeImages(copy);
  };

  const handleSetPrimary = (originalIndex: number) => {
    if (originalIndex <= 0 || originalIndex >= images.length) return;
    const copy = [...images];
    const [chosen] = copy.splice(originalIndex, 1);
    copy.unshift(chosen);
    onChangeImages(copy);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-lg border transition-colors ${
        isDraggingOver
          ? isAdult
            ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-500/15'
            : 'border-slate-500 bg-slate-100/70 ring-2 ring-slate-500/15'
          : 'border-slate-200 bg-slate-50/40'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void processFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-left text-xs font-semibold text-slate-700 hover:text-slate-900"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
          <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
          <span>設定画像</span>
          <span className="font-code text-[11px] font-normal text-slate-400 tabular-nums">
            ({images.length}/{MAX_REFERENCE_IMAGES})
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {hiddenAdultCount > 0 && (
            <span className="text-[10px] text-slate-500">
              R18専用 {hiddenAdultCount}枚を非表示中
            </span>
          )}
          <button
            type="button"
            disabled={isProcessing || remainingSlots === 0}
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-45 ${
              isAdult
                ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <span>{isProcessing ? '読み込み中...' : '画像を追加'}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-slate-200/70 p-3 space-y-2.5">
          {errorMsg && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800">
              <span className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                <span className="break-words">{errorMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="エラーを閉じる"
                className="rounded p-0.5 text-rose-500 hover:bg-rose-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {displayedEntries.length === 0 ? (
            <button
              type="button"
              disabled={isProcessing || remainingSlots === 0}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white/80 px-4 py-4 text-center transition-colors hover:border-slate-400 hover:bg-white disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5 text-slate-400" />
              <span className="text-xs font-medium text-slate-700">
                {hiddenAdultCount > 0
                  ? '一般用モードで表示できる設定画像がありません（画像を追加）'
                  : 'クリック・ドラッグ＆ドロップ・貼り付けで設定画像を追加'}
              </span>
              <span className="text-[10px] text-slate-400">
                最大{MAX_REFERENCE_IMAGES}枚・PNG / JPEG / WebP / GIF（自動圧縮して保存）
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">
              {displayedEntries.map(({ img, originalIndex }, displayIdx) => {
                const isPrimary = originalIndex === 0;
                const isDimmedInAdult = isAdult && img.visibility === 'general_alt';
                const sizeLabel = formatBytesCompact(estimateDataUrlBytes(img.dataUrl));

                return (
                  <div
                    key={img.id}
                    className={`flex flex-col overflow-hidden rounded-lg border bg-white transition-all ${
                      img.visibility === 'adult_only'
                        ? 'border-rose-200'
                        : isDimmedInAdult
                          ? 'border-slate-200 opacity-65'
                          : 'border-slate-200'
                    }`}
                  >
                    {/* Image Thumbnail Area */}
                    <div className="group relative flex h-44 items-center justify-center overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:12px_12px] bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(displayIdx)}
                        title="クリックして拡大表示"
                        className="flex h-full w-full items-center justify-center p-1.5 focus:outline-none"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.label || altFallback}
                          className="max-h-full max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.02]"
                        />
                      </button>

                      {/* Top-left badges */}
                      <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1">
                        {isPrimary && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                            <span>代表</span>
                          </span>
                        )}
                        {img.visibility === 'adult_only' && (
                          <span className="rounded bg-rose-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            R18専用
                          </span>
                        )}
                        {img.visibility === 'general_alt' && (
                          <span className="rounded bg-sky-700/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            一般のみ
                          </span>
                        )}
                      </div>

                      {/* Expand icon indicator */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-slate-900/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </span>
                    </div>

                    {/* Controls Footer */}
                    <div className="space-y-1.5 border-t border-slate-100 p-2">
                      <input
                        type="text"
                        value={img.label}
                        onChange={(e) =>
                          handleUpdateImage(originalIndex, { label: e.target.value })
                        }
                        placeholder={labelPlaceholder}
                        aria-label="画像のラベル"
                        className="w-full rounded border border-slate-200 bg-slate-50/70 px-2 py-1 text-[11px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                      />

                      <div className="flex items-center justify-between gap-1">
                        <select
                          value={img.visibility}
                          aria-label="画像の公開区分"
                          onChange={(e) =>
                            handleUpdateImage(originalIndex, {
                              visibility: e.target.value as VisibilityType,
                            })
                          }
                          className={`min-w-0 flex-1 rounded border px-1.5 py-0.5 text-[10px] font-medium focus:outline-none ${
                            img.visibility === 'adult_only'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : img.visibility === 'general_alt'
                                ? 'border-sky-200 bg-sky-50 text-sky-800'
                                : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <option value="common">共通</option>
                          <option value="general_alt">一般用のみ</option>
                          <option value="adult_only">R18専用</option>
                        </select>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {!isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(originalIndex)}
                              title="先頭（代表画像）にする"
                              className="rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                            >
                              <Star className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={originalIndex === 0}
                            onClick={() => handleMoveImage(originalIndex, -1)}
                            title="左（前）へ移動"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={originalIndex === images.length - 1}
                            onClick={() => handleMoveImage(originalIndex, 1)}
                            title="右（後）へ移動"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(originalIndex)}
                            title={`この画像を削除 (${sizeLabel})`}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add more tile when under limit */}
              {remainingSlots > 0 && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[160px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-center text-slate-500 transition-colors hover:border-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
                >
                  <ImagePlus className="h-5 w-5 text-slate-400" />
                  <span className="text-[11px] font-medium">画像を追加</span>
                  <span className="text-[10px] text-slate-400">
                    残り{remainingSlots}枚・D&amp;D / 貼付可
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ImageLightboxModal
        images={displayedImages}
        activeIndex={lightboxIndex}
        onChangeIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        altFallback={altFallback}
      />
    </div>
  );
};

interface CharacterImageGalleryProps {
  characterId: string;
  images: ReferenceImage[];
  activeMode: ActiveMode;
  onChangeImages: (nextImages: ReferenceImage[]) => void;
}

export const CharacterImageGallery: React.FC<CharacterImageGalleryProps> = ({
  characterId,
  images,
  activeMode,
  onChangeImages,
}) => (
  <ReferenceImageGallery
    entityId={characterId}
    images={images}
    activeMode={activeMode}
    onChangeImages={onChangeImages}
    entityUnitLabel="1キャラクター"
    labelPlaceholder="ラベル（例: 立ち絵・三面図）"
    altFallback="キャラクター設定画像"
  />
);
