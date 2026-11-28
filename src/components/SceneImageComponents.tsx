import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CornerDownLeft,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  ReferenceImage,
  SceneData,
  VisibilityType,
  WorldSettingData,
} from '../types/scenario';
import {
  MAX_SCENE_IMAGES,
  compressImageFileToDataUrl,
  deriveImageLabelFromFilename,
  estimateDataUrlBytes,
  extractSceneImageTags,
  filterReferenceImagesForMode,
  formatBytesCompact,
  formatSceneImageTag,
  resolveSceneImageRef,
  splitTextWithSceneImages,
  type ResolvedSceneImage,
} from '../utils/imageUtils';
import { ImageLightboxModal } from './CharacterImageGallery';

export type SceneImageTrayTab = 'scene' | 'library';
type LibraryFilter = 'all' | 'participating' | 'character' | 'world';

interface LibraryImageCandidate {
  ref: string;
  sourceType: 'character' | 'world';
  sourceName: string;
  isParticipating?: boolean;
  image: ReferenceImage;
}

function buildLibraryCandidates(
  scene: SceneData,
  characters: CharacterData[],
  worldSettings: WorldSettingData[],
  activeMode: ActiveMode
): {
  charItems: LibraryImageCandidate[];
  worldItems: LibraryImageCandidate[];
  participatingCount: number;
  total: number;
} {
  const participatingIds = new Set(scene.characters);
  const orderedChars = [
    ...characters.filter((c) => participatingIds.has(c.id)),
    ...characters.filter((c) => !participatingIds.has(c.id)),
  ];

  const charItems: LibraryImageCandidate[] = [];
  let participatingCount = 0;

  for (const char of orderedChars) {
    const visible = filterReferenceImagesForMode(char.images, activeMode);
    const isPart = participatingIds.has(char.id);
    for (const img of visible) {
      if (isPart) participatingCount += 1;
      charItems.push({
        ref: `char:${char.id}:${img.id}`,
        sourceType: 'character',
        sourceName: char.common.name,
        isParticipating: isPart,
        image: img,
      });
    }
  }

  const worldItems: LibraryImageCandidate[] = [];
  for (const w of worldSettings) {
    const visible = filterReferenceImagesForMode(w.images, activeMode);
    for (const img of visible) {
      worldItems.push({
        ref: `world:${w.id}:${img.id}`,
        sourceType: 'world',
        sourceName: w.name,
        image: img,
      });
    }
  }

  return {
    charItems,
    worldItems,
    participatingCount,
    total: charItems.length + worldItems.length,
  };
}

interface SceneImageTrayProps {
  scene: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  activeTab?: SceneImageTrayTab;
  onChangeActiveTab?: (tab: SceneImageTrayTab) => void;
  onUpdateSceneImages: (nextImages: ReferenceImage[]) => void;
  onInsertImageTag: (tag: string) => void;
  onClose: () => void;
}

export const SceneImageTray: React.FC<SceneImageTrayProps> = ({
  scene,
  characters,
  worldSettings,
  activeMode,
  activeTab: controlledTab,
  onChangeActiveTab,
  onUpdateSceneImages,
  onInsertImageTag,
  onClose,
}) => {
  const isAdult = activeMode === 'adult';
  const images = scene.images ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [internalTab, setInternalTab] = useState<SceneImageTrayTab>('scene');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (next: SceneImageTrayTab) => {
    setInternalTab(next);
    onChangeActiveTab?.(next);
  };

  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [justInsertedKey, setJustInsertedKey] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [insertAfterUpload, setInsertAfterUpload] = useState(true);
  const [lightboxState, setLightboxState] = useState<{
    images: ReferenceImage[];
    index: number;
  } | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setLightboxState(null);
    setIsDraggingOver(false);
    setLibraryQuery('');
    setLibraryFilter('all');
  }, [scene.sceneId]);

  const triggerInsertWithFeedback = (feedbackKey: string, tag: string) => {
    onInsertImageTag(tag);
    setJustInsertedKey(feedbackKey);
    window.setTimeout(() => {
      setJustInsertedKey((prev) => (prev === feedbackKey ? null : prev));
    }, 1500);
  };

  const hiddenAdultCount = useMemo(
    () => (isAdult ? 0 : images.filter((img) => img.visibility === 'adult_only').length),
    [images, isAdult]
  );

  const displayedEntries = useMemo(
    () =>
      images
        .map((img, originalIndex) => ({ img, originalIndex }))
        .filter(({ img }) => isAdult || img.visibility !== 'adult_only'),
    [images, isAdult]
  );

  const displayedImages = useMemo(
    () => displayedEntries.map((e) => e.img),
    [displayedEntries]
  );

  const insertedRefCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of extractSceneImageTags(scene.body)) {
      const key = tag.ref.startsWith('scene:') ? tag.ref.slice('scene:'.length) : tag.ref;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [scene.body]);

  const libraryItems = useMemo(
    () => buildLibraryCandidates(scene, characters, worldSettings, activeMode),
    [scene, characters, worldSettings, activeMode]
  );

  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    const matchesQuery = (item: LibraryImageCandidate) => {
      if (!q) return true;
      return (
        item.sourceName.toLowerCase().includes(q) ||
        (item.image.label || '').toLowerCase().includes(q)
      );
    };

    const charItems =
      libraryFilter === 'world'
        ? []
        : libraryItems.charItems.filter((item) => {
            if (libraryFilter === 'participating' && !item.isParticipating) return false;
            return matchesQuery(item);
          });

    const worldItems =
      libraryFilter === 'character' || libraryFilter === 'participating'
        ? []
        : libraryItems.worldItems.filter(matchesQuery);

    return {
      charItems,
      worldItems,
      total: charItems.length + worldItems.length,
    };
  }, [libraryItems, libraryFilter, libraryQuery]);

  const remainingSlots = Math.max(0, MAX_SCENE_IMAGES - images.length);

  const processFiles = useCallback(
    async (fileList: File[] | FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setErrorMsg(null);
      if (images.length >= MAX_SCENE_IMAGES) {
        setErrorMsg(`シーン画像は1シーンにつき最大${MAX_SCENE_IMAGES}枚まで登録できます。`);
        return;
      }

      const slots = MAX_SCENE_IMAGES - images.length;
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
          onUpdateSceneImages([...images, ...created]);
          if (insertAfterUpload) {
            const tags = created.map((img) => formatSceneImageTag(img.id, img.label)).join('\n');
            onInsertImageTag(tags);
          }
        }

        if (errors.length > 0) {
          setErrorMsg(errors[0]);
        } else if (skippedByLimit > 0) {
          setErrorMsg(
            `上限（最大${MAX_SCENE_IMAGES}枚）に達したため、${skippedByLimit}枚は追加されませんでした。`
          );
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [images, isAdult, insertAfterUpload, onUpdateSceneImages, onInsertImageTag]
  );

  // Allow Ctrl/Cmd+V image paste into tray when not typing in an input/textarea
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
        setActiveTab('scene');
        void processFiles(imageFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFiles]);

  const handleUpdateImage = (originalIndex: number, patch: Partial<ReferenceImage>) => {
    onUpdateSceneImages(
      images.map((img, idx) => (idx === originalIndex ? { ...img, ...patch } : img))
    );
  };

  const handleDeleteImage = (originalIndex: number) => {
    onUpdateSceneImages(images.filter((_, idx) => idx !== originalIndex));
    setLightboxState(null);
  };

  const handleMoveImage = (originalIndex: number, direction: -1 | 1) => {
    const target = originalIndex + direction;
    if (target < 0 || target >= images.length) return;
    const copy = [...images];
    const [moved] = copy.splice(originalIndex, 1);
    copy.splice(target, 0, moved);
    onUpdateSceneImages(copy);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          setActiveTab('scene');
          void processFiles(e.dataTransfer.files);
        }
      }}
      className={`shrink-0 border-b transition-colors ${
        isDraggingOver
          ? isAdult
            ? 'border-rose-400 bg-rose-50/70'
            : 'border-slate-500 bg-slate-100/80'
          : 'border-slate-200 bg-slate-50/80'
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

      {/* Tray Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200/70">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab('scene')}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                activeTab === 'scene'
                  ? isAdult
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="h-3 w-3" />
              <span>このシーンの画像</span>
              <span className="font-code text-[10px] opacity-80 tabular-nums">
                ({images.length}/{MAX_SCENE_IMAGES})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                activeTab === 'library'
                  ? isAdult
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3 w-3" />
              <span>キャラ／世界観から引用</span>
              <span className="font-code text-[10px] opacity-80 tabular-nums">
                ({libraryItems.total})
              </span>
            </button>
          </div>

          {hiddenAdultCount > 0 && activeTab === 'scene' && (
            <span className="text-[10px] text-slate-500">
              R18専用 {hiddenAdultCount}枚を非表示中
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'scene' && (
            <>
              <label className="hidden sm:flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={insertAfterUpload}
                  onChange={(e) => setInsertAfterUpload(e.target.checked)}
                />
                <span>追加時にカーソル行へ挿入</span>
              </label>

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
                <span>{isProcessing ? '読み込み中...' : 'PCから追加'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="画像トレイを閉じる"
            className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tray Body */}
      <div className="max-h-68 overflow-y-auto p-3 space-y-2.5">
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

        {activeTab === 'scene' ? (
          displayedEntries.length === 0 ? (
            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <button
                type="button"
                disabled={isProcessing || remainingSlots === 0}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-center transition-colors hover:border-slate-400 hover:bg-white disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-700">
                  {hiddenAdultCount > 0
                    ? '一般用モードで表示できるシーン画像がありません（PCから追加）'
                    : 'クリック・ドラッグ＆ドロップ・貼り付けでシーン画像を追加'}
                </span>
                <span className="text-[10px] text-slate-400">
                  最大{MAX_SCENE_IMAGES}枚・長辺1200pxへ自動圧縮
                </span>
              </button>

              {libraryItems.total > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('library')}
                  className={`flex sm:w-64 shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-4 py-3 text-center transition-colors ${
                    isAdult
                      ? 'border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-100/70'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-semibold">
                    キャラ・世界観から引用する（{libraryItems.total}枚） →
                  </span>
                  <span className="text-[10px] opacity-75">
                    登録済みの設定画像を容量増加なしで挿入
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {displayedEntries.map(({ img, originalIndex }, displayIdx) => {
                const insertCount = insertedRefCounts.get(img.id) ?? 0;
                const isDimmedInAdult = isAdult && img.visibility === 'general_alt';
                const sizeLabel = formatBytesCompact(estimateDataUrlBytes(img.dataUrl));
                const feedbackKey = `scene:${img.id}`;
                const wasInserted = justInsertedKey === feedbackKey;

                return (
                  <div
                    key={img.id}
                    className={`flex w-52 shrink-0 flex-col overflow-hidden rounded-lg border bg-white ${
                      img.visibility === 'adult_only'
                        ? 'border-rose-200'
                        : isDimmedInAdult
                          ? 'border-slate-200 opacity-65'
                          : 'border-slate-200'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="group relative flex h-24 items-center justify-center overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px] bg-slate-50">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxState({ images: displayedImages, index: displayIdx })
                        }
                        title="クリックして拡大表示"
                        className="flex h-full w-full items-center justify-center p-1 focus:outline-none"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.label || 'シーン画像'}
                          className="max-h-full max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.03]"
                        />
                      </button>

                      <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-1">
                        {insertCount > 0 ? (
                          <span className="rounded bg-emerald-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            挿入済{insertCount > 1 ? ` ×${insertCount}` : ''}
                          </span>
                        ) : (
                          <span className="rounded bg-slate-800/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            未挿入
                          </span>
                        )}
                        {img.visibility === 'adult_only' && (
                          <span className="rounded bg-rose-700/90 px-1 py-0.5 text-[9px] font-semibold text-white">
                            R18
                          </span>
                        )}
                        {img.visibility === 'general_alt' && (
                          <span className="rounded bg-sky-700/85 px-1 py-0.5 text-[9px] font-medium text-white">
                            一般
                          </span>
                        )}
                      </div>

                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute right-1 top-1 rounded bg-slate-900/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Maximize2 className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    {/* Controls */}
                    <div className="space-y-1.5 border-t border-slate-100 p-2">
                      <input
                        type="text"
                        value={img.label}
                        onChange={(e) =>
                          handleUpdateImage(originalIndex, { label: e.target.value })
                        }
                        placeholder="キャプション・メモ"
                        aria-label="シーン画像のラベル"
                        className="w-full rounded border border-slate-200 bg-slate-50/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          triggerInsertWithFeedback(
                            feedbackKey,
                            formatSceneImageTag(img.id, img.label)
                          )
                        }
                        className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white transition-colors ${
                          wasInserted
                            ? 'bg-emerald-600'
                            : isAdult
                              ? 'bg-rose-700 hover:bg-rose-800'
                              : 'bg-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        {wasInserted ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>挿入しました</span>
                          </>
                        ) : (
                          <>
                            <CornerDownLeft className="h-3 w-3" />
                            <span>カーソル行へ挿入</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-between gap-1">
                        <select
                          value={img.visibility}
                          aria-label="シーン画像の公開区分"
                          onChange={(e) =>
                            handleUpdateImage(originalIndex, {
                              visibility: e.target.value as VisibilityType,
                            })
                          }
                          className={`min-w-0 flex-1 rounded border px-1 py-0.5 text-[10px] font-medium focus:outline-none ${
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
                          <button
                            type="button"
                            disabled={originalIndex === 0}
                            onClick={() => handleMoveImage(originalIndex, -1)}
                            title="左へ移動"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={originalIndex === images.length - 1}
                            onClick={() => handleMoveImage(originalIndex, 1)}
                            title="右へ移動"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(originalIndex)}
                            title={`削除 (${sizeLabel})`}
                            className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {remainingSlots > 0 && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/70 p-3 text-center text-slate-500 hover:border-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
                >
                  <ImagePlus className="h-4 w-4 text-slate-400" />
                  <span className="text-[11px] font-medium">PCから追加</span>
                  <span className="text-[10px] text-slate-400">残り{remainingSlots}枚</span>
                </button>
              )}
            </div>
          )
        ) : libraryItems.total === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-center text-xs text-slate-500">
            キャラクター設定や世界観設定に登録済みの設定画像がありません（現在のモードで表示可能な画像がここに並びます）。
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Search & Quick Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1 max-w-xs">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="名前・ラベルで絞り込み..."
                  aria-label="引用画像を絞り込み"
                  className="w-full rounded border border-slate-200 bg-white py-1 pl-6 pr-6 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                {libraryQuery && (
                  <button
                    type="button"
                    onClick={() => setLibraryQuery('')}
                    aria-label="検索をクリア"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="inline-flex flex-wrap items-center gap-1 text-[10px]">
                {(
                  [
                    ['all', `すべて (${libraryItems.total})`],
                    ...(libraryItems.participatingCount > 0
                      ? [['participating', `登場キャラ (${libraryItems.participatingCount})`]]
                      : []),
                    ['character', `キャラ (${libraryItems.charItems.length})`],
                    ['world', `世界観 (${libraryItems.worldItems.length})`],
                  ] as Array<[LibraryFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLibraryFilter(key)}
                    className={`rounded border px-2 py-0.5 font-medium transition-colors ${
                      libraryFilter === key
                        ? isAdult
                          ? 'border-rose-300 bg-rose-700 text-white'
                          : 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredLibrary.total === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-center text-xs text-slate-500">
                条件に一致する登録済み画像がありません。
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredLibrary.charItems.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                      <Users className="h-3 w-3 text-slate-400" />
                      <span>キャラクター設定画像（容量増加なしで引用挿入）</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {filteredLibrary.charItems.map((item, idx) => {
                        const wasInserted = justInsertedKey === item.ref;
                        return (
                          <div
                            key={item.ref}
                            className="flex w-44 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxState({
                                  images: filteredLibrary.charItems.map((x) => x.image),
                                  index: idx,
                                })
                              }
                              className="group relative flex h-20 w-full items-center justify-center overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px] bg-slate-50 p-1"
                              title="クリックして拡大確認"
                            >
                              <img
                                src={item.image.dataUrl}
                                alt={item.image.label || item.sourceName}
                                className="max-h-full max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.03]"
                              />
                              {item.isParticipating && (
                                <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-900/75 px-1 py-0.5 text-[9px] font-medium text-white">
                                  登場中
                                </span>
                              )}
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-1 top-1 rounded bg-slate-900/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <Maximize2 className="h-2.5 w-2.5" />
                              </span>
                            </button>
                            <div className="space-y-1 border-t border-slate-100 p-1.5">
                              <div className="truncate text-[11px] font-medium text-slate-800">
                                {item.sourceName}
                                {item.image.label ? ` / ${item.image.label}` : ''}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  triggerInsertWithFeedback(
                                    item.ref,
                                    formatSceneImageTag(
                                      item.ref,
                                      item.image.label
                                        ? `${item.sourceName}（${item.image.label}）`
                                        : item.sourceName
                                    )
                                  )
                                }
                                className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                                  wasInserted
                                    ? 'bg-emerald-600 text-white'
                                    : isAdult
                                      ? 'bg-rose-700 text-white hover:bg-rose-800'
                                      : 'bg-slate-800 text-white hover:bg-slate-900'
                                }`}
                              >
                                {wasInserted ? (
                                  <>
                                    <Check className="h-3 w-3" />
                                    <span>挿入しました</span>
                                  </>
                                ) : (
                                  <>
                                    <CornerDownLeft className="h-3 w-3" />
                                    <span>カーソル行へ挿入</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredLibrary.worldItems.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                      <BookOpen className="h-3 w-3 text-slate-400" />
                      <span>世界観設定画像（容量増加なしで引用挿入）</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {filteredLibrary.worldItems.map((item, idx) => {
                        const wasInserted = justInsertedKey === item.ref;
                        return (
                          <div
                            key={item.ref}
                            className="flex w-44 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxState({
                                  images: filteredLibrary.worldItems.map((x) => x.image),
                                  index: idx,
                                })
                              }
                              className="group relative flex h-20 w-full items-center justify-center overflow-hidden bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px] bg-slate-50 p-1"
                              title="クリックして拡大確認"
                            >
                              <img
                                src={item.image.dataUrl}
                                alt={item.image.label || item.sourceName}
                                className="max-h-full max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.03]"
                              />
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-1 top-1 rounded bg-slate-900/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <Maximize2 className="h-2.5 w-2.5" />
                              </span>
                            </button>
                            <div className="space-y-1 border-t border-slate-100 p-1.5">
                              <div className="truncate text-[11px] font-medium text-slate-800">
                                {item.sourceName}
                                {item.image.label ? ` / ${item.image.label}` : ''}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  triggerInsertWithFeedback(
                                    item.ref,
                                    formatSceneImageTag(
                                      item.ref,
                                      item.image.label
                                        ? `${item.sourceName}（${item.image.label}）`
                                        : item.sourceName
                                    )
                                  )
                                }
                                className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                                  wasInserted
                                    ? 'bg-emerald-600 text-white'
                                    : isAdult
                                      ? 'bg-rose-700 text-white hover:bg-rose-800'
                                      : 'bg-slate-800 text-white hover:bg-slate-900'
                                }`}
                              >
                                {wasInserted ? (
                                  <>
                                    <Check className="h-3 w-3" />
                                    <span>挿入しました</span>
                                  </>
                                ) : (
                                  <>
                                    <CornerDownLeft className="h-3 w-3" />
                                    <span>カーソル行へ挿入</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ImageLightboxModal
        images={lightboxState?.images ?? []}
        activeIndex={lightboxState ? lightboxState.index : null}
        onChangeIndex={(nextIdx) =>
          setLightboxState((prev) => (prev ? { ...prev, index: nextIdx } : null))
        }
        onClose={() => setLightboxState(null)}
        altFallback="シーン画像"
      />
    </div>
  );
};

interface PanelImagePickerModalProps {
  open: boolean;
  panelTitle: string;
  scene: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  onSelectTag: (tag: string) => void;
  onPickFromPc: () => void;
  onClose: () => void;
}

export const PanelImagePickerModal: React.FC<PanelImagePickerModalProps> = ({
  open,
  panelTitle,
  scene,
  characters,
  worldSettings,
  activeMode,
  onSelectTag,
  onPickFromPc,
  onClose,
}) => {
  const isAdult = activeMode === 'adult';
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'scene' | 'character' | 'world'>('all');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSourceFilter('all');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const candidates = useMemo(() => {
    if (!open) return { sceneItems: [], charItems: [], worldItems: [], total: 0 };
    const visibleSceneImgs = filterReferenceImagesForMode(scene.images, activeMode);
    const sceneItems = visibleSceneImgs.map((img) => ({
      ref: img.id,
      tag: formatSceneImageTag(img.id, img.label),
      title: img.label || 'シーン画像',
      subtitle: 'このシーン',
      image: img,
    }));

    const lib = buildLibraryCandidates(scene, characters, worldSettings, activeMode);
    const charItems = lib.charItems.map((item) => ({
      ref: item.ref,
      tag: formatSceneImageTag(
        item.ref,
        item.image.label ? `${item.sourceName}（${item.image.label}）` : item.sourceName
      ),
      title: item.image.label ? `${item.sourceName} / ${item.image.label}` : item.sourceName,
      subtitle: item.isParticipating ? 'キャラ（登場中）' : 'キャラ',
      image: item.image,
    }));
    const worldItems = lib.worldItems.map((item) => ({
      ref: item.ref,
      tag: formatSceneImageTag(
        item.ref,
        item.image.label ? `${item.sourceName}（${item.image.label}）` : item.sourceName
      ),
      title: item.image.label ? `${item.sourceName} / ${item.image.label}` : item.sourceName,
      subtitle: '世界観',
      image: item.image,
    }));

    return {
      sceneItems,
      charItems,
      worldItems,
      total: sceneItems.length + charItems.length + worldItems.length,
    };
  }, [open, scene, characters, worldSettings, activeMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (title: string, subtitle: string) =>
      !q || title.toLowerCase().includes(q) || subtitle.toLowerCase().includes(q);

    const list = [
      ...(sourceFilter === 'all' || sourceFilter === 'scene'
        ? candidates.sceneItems.filter((i) => match(i.title, i.subtitle))
        : []),
      ...(sourceFilter === 'all' || sourceFilter === 'character'
        ? candidates.charItems.filter((i) => match(i.title, i.subtitle))
        : []),
      ...(sourceFilter === 'all' || sourceFilter === 'world'
        ? candidates.worldItems.filter((i) => match(i.title, i.subtitle))
        : []),
    ];
    return list;
  }, [candidates, sourceFilter, query]);

  if (!open) return null;

  const remainingSlots = Math.max(0, MAX_SCENE_IMAGES - (scene.images?.length ?? 0));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${panelTitle} に添付する参考画像を選択`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {panelTitle} に参考画像を添付
            </h3>
            <p className="text-[11px] text-slate-500">
              登録済みのキャラ・世界観・シーン画像をクリックしてそのまま添付できます
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={remainingSlots === 0}
              onClick={() => {
                onClose();
                onPickFromPc();
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45"
            >
              <ImagePlus className="h-3.5 w-3.5 text-slate-500" />
              <span>PCから追加</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キャラ名・世界観名・ラベルで絞り込み..."
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="inline-flex flex-wrap items-center gap-1 text-[11px]">
            {(
              [
                ['all', `すべて (${candidates.total})`],
                ['character', `キャラ (${candidates.charItems.length})`],
                ['world', `世界観 (${candidates.worldItems.length})`],
                ['scene', `シーン (${candidates.sceneItems.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSourceFilter(key)}
                className={`rounded border px-2 py-1 font-medium transition-colors ${
                  sourceFilter === key
                    ? isAdult
                      ? 'border-rose-300 bg-rose-700 text-white'
                      : 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-xs text-slate-500">
              <span>選択できる登録済み画像がありません。</span>
              {remainingSlots > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPickFromPc();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>PCから画像を選んで添付する</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((item) => (
                <button
                  key={item.ref}
                  type="button"
                  onClick={() => {
                    onSelectTag(item.tag);
                    onClose();
                  }}
                  className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:border-slate-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <div className="relative flex h-28 w-full items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px] p-1.5">
                    <img
                      src={item.image.dataUrl}
                      alt={item.title}
                      className="max-h-full max-w-full object-contain transition-transform duration-150 group-hover:scale-[1.03]"
                    />
                    <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-slate-900/75 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {item.subtitle}
                    </span>
                  </div>
                  <div className="border-t border-slate-100 p-2">
                    <div className="truncate text-[11px] font-medium text-slate-800">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-[10px] font-medium text-slate-500 group-hover:text-slate-900">
                      クリックしてこのコマへ添付
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const INLINE_PREVIEW_TOKEN_REGEX =
  /(\{\{[^{}\r\n]+\}\})|《《([^《》\r\n]+?)》》|[｜|]([^｜|《》\r\n]{1,40})《([^《》\r\n]{1,40})》|([一-龯々〆ヶ]+)《([^《》\r\n]{1,40})》/g;

function renderFormattedPreviewText(text: string): React.ReactNode {
  if (
    !text ||
    (!text.includes('{{') && !text.includes('《'))
  ) {
    return text;
  }

  const nodes: React.ReactNode[] = [];
  const re = new RegExp(INLINE_PREVIEW_TOKEN_REGEX.source, 'g');
  let lastIndex = 0;
  let tokenIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [
      ,
      unresolvedVar,
      boutenInner,
      pipeRubyBase,
      pipeRubyText,
      kanjiRubyBase,
      kanjiRubyText,
    ] = match;

    if (unresolvedVar) {
      nodes.push(
        <span
          key={`uvar-${tokenIdx}`}
          title="未解決の変数タグです（キャラID・世界観IDまたは項目名を確認してください）"
          className="mx-0.5 inline rounded border border-amber-300/90 bg-amber-50 px-1 py-0 font-code text-[0.85em] text-amber-800"
        >
          {unresolvedVar}
        </span>
      );
    } else if (boutenInner) {
      nodes.push(
        <span key={`bouten-${tokenIdx}`} className="novel-bouten">
          {boutenInner}
        </span>
      );
    } else if (pipeRubyBase && pipeRubyText) {
      nodes.push(
        <ruby key={`pruby-${tokenIdx}`} className="novel-ruby">
          {pipeRubyBase}
          <rp>（</rp>
          <rt>{pipeRubyText}</rt>
          <rp>）</rp>
        </ruby>
      );
    } else if (kanjiRubyBase && kanjiRubyText) {
      nodes.push(
        <ruby key={`kruby-${tokenIdx}`} className="novel-ruby">
          {kanjiRubyBase}
          <rp>（</rp>
          <rt>{kanjiRubyText}</rt>
          <rp>）</rp>
        </ruby>
      );
    }

    tokenIdx += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type PreviewBlockItem =
  | { kind: 'text'; text: string }
  | { kind: 'r18_start'; label: string }
  | { kind: 'r18_end' }
  | { kind: 'missing'; ref: string; caption: string }
  | { kind: 'image'; resolved: ReturnType<typeof resolveSceneImageRef> & {}; lightboxIdx: number };

function splitTextWithR18Dividers(
  text: string
): Array<
  | { kind: 'text'; text: string }
  | { kind: 'r18_start'; label: string }
  | { kind: 'r18_end' }
> {
  if (!/\[R18_BLOCK_(?:START|END)/i.test(text)) {
    return text.length > 0 ? [{ kind: 'text', text }] : [];
  }

  const lines = text.split('\n');
  const blocks: Array<
    | { kind: 'text'; text: string }
    | { kind: 'r18_start'; label: string }
    | { kind: 'r18_end' }
  > = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    // Trim leading/trailing empty lines directly adjacent to visual dividers
    while (buffer.length > 0 && buffer[0] === '') buffer.shift();
    while (buffer.length > 0 && buffer[buffer.length - 1] === '') buffer.pop();
    if (buffer.length > 0) {
      blocks.push({ kind: 'text', text: buffer.join('\n') });
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const startMatch = trimmed.match(/^\[R18_BLOCK_START(?::\s*([^\]]*))?\]$/i);
    if (startMatch) {
      flushBuffer();
      blocks.push({ kind: 'r18_start', label: (startMatch[1] ?? '').trim() });
      continue;
    }
    if (/^\[R18_BLOCK_END\]$/i.test(trimmed)) {
      flushBuffer();
      blocks.push({ kind: 'r18_end' });
      continue;
    }
    buffer.push(line);
  }

  flushBuffer();
  return blocks;
}

interface RichScenePreviewProps {
  compiledText: string;
  scene: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  verticalWriting?: boolean;
  monospace?: boolean;
  emptyPlaceholder?: string;
}

export const RichScenePreview: React.FC<RichScenePreviewProps> = ({
  compiledText,
  scene,
  characters,
  worldSettings,
  activeMode,
  verticalWriting = false,
  monospace = false,
  emptyPlaceholder = '（本文を入力すると展開結果が表示されます）',
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const parsedSegments = useMemo(() => {
    const rawSegments = splitTextWithSceneImages(compiledText);
    const lightboxList: ReferenceImage[] = [];

    // 1. Resolve images and drop hidden images (e.g. adult_only images in general mode),
    // merging adjacent text segments so hidden images never create phantom paragraph gaps.
    const merged: PreviewBlockItem[] = [];
    for (const seg of rawSegments) {
      if (seg.type === 'text') {
        const prev = merged[merged.length - 1];
        if (prev && prev.kind === 'text') {
          prev.text = `${prev.text}\n${seg.text}`;
        } else {
          merged.push({ kind: 'text', text: seg.text });
        }
        continue;
      }

      const resolved = resolveSceneImageRef(
        seg.ref,
        seg.caption,
        scene,
        characters,
        worldSettings,
        activeMode
      );
      if (!resolved) {
        merged.push({ kind: 'missing', ref: seg.ref, caption: seg.caption });
        continue;
      }
      if (!resolved.visibleInMode) {
        continue;
      }
      const lbIdx = lightboxList.length;
      lightboxList.push({
        ...resolved.image,
        label: resolved.caption || resolved.image.label,
      });
      merged.push({ kind: 'image', resolved, lightboxIdx: lbIdx });
    }

    // 2. Expand [R18_BLOCK_START: ...] / [R18_BLOCK_END] lines inside text segments into visual dividers
    const enriched: PreviewBlockItem[] = [];
    for (const item of merged) {
      if (item.kind === 'text') {
        enriched.push(...splitTextWithR18Dividers(item.text));
      } else {
        enriched.push(item);
      }
    }

    return { enriched, lightboxList };
  }, [compiledText, scene, characters, worldSettings, activeMode]);

  useEffect(() => {
    setLightboxIndex(null);
  }, [scene.sceneId, activeMode]);

  const hasVisibleContent = parsedSegments.enriched.some(
    (item) => item.kind !== 'text' || item.text.trim().length > 0
  );

  if (!compiledText || !hasVisibleContent) {
    return <span className="text-slate-400">{emptyPlaceholder}</span>;
  }

  return (
    <>
      <div
        className={
          verticalWriting
            ? 'flex flex-col gap-3'
            : monospace
              ? 'space-y-3 font-code text-xs leading-relaxed text-slate-800'
              : 'space-y-3 font-editorial text-sm leading-[1.85] text-slate-800'
        }
      >
        {parsedSegments.enriched.map((item, idx) => {
          if (item.kind === 'r18_start') {
            return (
              <div
                key={`r18s-${idx}`}
                role="separator"
                className={
                  verticalWriting
                    ? 'mx-1 flex items-center gap-2 select-none'
                    : 'my-1.5 flex items-center gap-2.5 select-none'
                }
              >
                <div
                  className={
                    verticalWriting
                      ? 'w-px flex-1 bg-rose-200/90'
                      : 'h-px flex-1 bg-rose-200/90'
                  }
                />
                <span className="shrink-0 rounded border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 font-sans text-[10px] font-medium tracking-wide text-rose-700">
                  {item.label || 'R18ブロック'}
                </span>
                <div
                  className={
                    verticalWriting
                      ? 'w-px flex-1 bg-rose-200/90'
                      : 'h-px flex-1 bg-rose-200/90'
                  }
                />
              </div>
            );
          }

          if (item.kind === 'r18_end') {
            return (
              <div
                key={`r18e-${idx}`}
                role="separator"
                className={
                  verticalWriting
                    ? 'mx-1 flex items-center gap-2 select-none opacity-80'
                    : 'my-1.5 flex items-center gap-2 select-none opacity-80'
                }
              >
                <div
                  className={
                    verticalWriting
                      ? 'w-px flex-1 border-l border-dashed border-rose-200'
                      : 'h-px flex-1 border-t border-dashed border-rose-200'
                  }
                />
                <span className="shrink-0 font-sans text-[9px] text-rose-400">
                  ブロック終了
                </span>
                <div
                  className={
                    verticalWriting
                      ? 'w-px flex-1 border-l border-dashed border-rose-200'
                      : 'h-px flex-1 border-t border-dashed border-rose-200'
                  }
                />
              </div>
            );
          }

          if (item.kind === 'text') {
            return (
              <div key={`txt-${idx}`} className="whitespace-pre-wrap break-words select-text">
                {renderFormattedPreviewText(item.text)}
              </div>
            );
          }

          if (item.kind === 'missing') {
            return (
              <div
                key={`miss-${idx}`}
                style={verticalWriting ? { writingMode: 'horizontal-tb' } : undefined}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-800"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  画像が見つかりません: <code className="font-code">{item.ref}</code>
                  {item.caption ? `（${item.caption}）` : ''}
                </span>
              </div>
            );
          }

          const { resolved, lightboxIdx } = item;
          const sourceBadge =
            resolved.source === 'character'
              ? `キャラ: ${resolved.sourceName}`
              : resolved.source === 'world'
                ? `世界観: ${resolved.sourceName}`
                : null;

          return (
            <figure
              key={`img-${idx}-${resolved.ref}`}
              style={verticalWriting ? { writingMode: 'horizontal-tb' } : undefined}
              className={`my-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs ${
                verticalWriting ? 'w-60 shrink-0 self-center' : 'max-w-md'
              }`}
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(lightboxIdx)}
                title="クリックして画像を拡大表示"
                className="group relative flex max-h-64 w-full items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:14px_14px] p-1.5 focus:outline-none"
              >
                <img
                  src={resolved.image.dataUrl}
                  alt={resolved.caption || 'シーン画像'}
                  className="max-h-60 max-w-full rounded object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 className="h-2.5 w-2.5" />
                  拡大
                </span>
              </button>
              <figcaption className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px] text-slate-600">
                <span className="truncate font-medium text-slate-700">
                  {resolved.caption || resolved.image.label || 'イメージ画像'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {sourceBadge && (
                    <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                      {sourceBadge}
                    </span>
                  )}
                  {resolved.image.visibility === 'adult_only' && (
                    <span className="rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      R18
                    </span>
                  )}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <ImageLightboxModal
        images={parsedSegments.lightboxList}
        activeIndex={lightboxIndex}
        onChangeIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        altFallback="シーン画像"
      />
    </>
  );
};

interface MangaPanelImageStripProps {
  visualText: string;
  scene: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  onRemoveTag: (rawTag: string) => void;
}

export const MangaPanelImageStrip: React.FC<MangaPanelImageStripProps> = ({
  visualText,
  scene,
  characters,
  worldSettings,
  activeMode,
  onRemoveTag,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const items = useMemo(() => {
    const tags = extractSceneImageTags(visualText);
    const resolvedList: Array<{ raw: string; resolved: ResolvedSceneImage }> = [];
    for (const tag of tags) {
      const resolved = resolveSceneImageRef(
        tag.ref,
        tag.caption,
        scene,
        characters,
        worldSettings,
        activeMode
      );
      if (resolved && resolved.visibleInMode) {
        resolvedList.push({ raw: tag.raw, resolved });
      }
    }
    return resolvedList;
  }, [visualText, scene, characters, worldSettings, activeMode]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {items.map((entry, idx) => (
          <div
            key={`${entry.raw}-${idx}`}
            className="group relative flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1 pr-6 shadow-2xs"
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(idx)}
              title="クリックして参考画像を拡大表示"
              className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:10px_10px]"
            >
              <img
                src={entry.resolved.image.dataUrl}
                alt={entry.resolved.caption}
                className="max-h-full max-w-full object-contain"
              />
            </button>
            <div className="min-w-0 max-w-[140px]">
              <div className="truncate text-[11px] font-medium text-slate-800">
                {entry.resolved.caption}
              </div>
              <div className="flex items-center gap-1 text-[9px] text-slate-400">
                <span>
                  {entry.resolved.source === 'character'
                    ? `キャラ: ${entry.resolved.sourceName}`
                    : entry.resolved.source === 'world'
                      ? `世界観: ${entry.resolved.sourceName}`
                      : 'シーン画像'}
                </span>
                {entry.resolved.image.visibility === 'adult_only' && (
                  <span className="rounded bg-rose-600 px-1 text-white">R18</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemoveTag(entry.raw)}
              title="このコマから画像タグを外す"
              className="absolute right-1 top-1 rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <ImageLightboxModal
        images={items.map((i) => ({
          ...i.resolved.image,
          label: i.resolved.caption || i.resolved.image.label,
        }))}
        activeIndex={lightboxIndex}
        onChangeIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        altFallback="コマ参考画像"
      />
    </>
  );
};
