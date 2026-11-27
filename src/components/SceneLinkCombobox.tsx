import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  FilePlus2,
  Folder,
  Link2Off,
  Search,
  X,
} from 'lucide-react';
import type { PlotCard, SceneData } from '../types/scenario';

export interface SceneUsageEntry {
  plotId: string;
  plotTitle: string;
  cardId: string;
  cardOrder: number;
  cardTitle: string;
}

interface SceneLinkComboboxProps {
  card: PlotCard;
  plotId: string;
  scenes: SceneData[];
  sceneUsageMap: Map<string, SceneUsageEntry[]>;
  linkedSceneFolder?: string;
  isAdult: boolean;
  onSelectScene: (sceneId: string) => void;
  onCreateAndLinkScene?: () => void;
}

interface PopoverCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

type SelectableOption =
  | { kind: 'unlink'; sceneId: '' }
  | {
      kind: 'scene';
      scene: SceneData;
      otherUsages: SceneUsageEntry[];
      isCurrent: boolean;
      inLinkedFolder: boolean;
    };

export const SceneLinkCombobox: React.FC<SceneLinkComboboxProps> = ({
  card,
  plotId,
  scenes,
  sceneUsageMap,
  linkedSceneFolder,
  isAdult,
  onSelectScene,
  onCreateAndLinkScene,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [linkedFolderOnly, setLinkedFolderOnly] = useState(Boolean(linkedSceneFolder));
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const linkedScene = useMemo(
    () => scenes.find((s) => s.sceneId === card.linkedSceneId),
    [scenes, card.linkedSceneId]
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = Math.min(Math.max(rect.width, 300), Math.min(410, vw - margin * 2));
    const left = Math.max(margin, Math.min(rect.left, vw - width - margin));

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;

    if (openUpward) {
      setCoords({
        left,
        width,
        bottom: vh - rect.top + 4,
        maxHeight: Math.max(200, Math.min(370, spaceAbove - 4)),
      });
    } else {
      setCoords({
        left,
        width,
        top: rect.bottom + 4,
        maxHeight: Math.max(200, Math.min(370, spaceBelow - 4)),
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLinkedFolderOnly(Boolean(linkedSceneFolder));
  }, [open, linkedSceneFolder]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && popoverRef.current?.contains(e.target as Node)) {
        return;
      }
      updatePosition();
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlightedIndex(0);
    }
  }, [open]);

  const enrichedScenes = useMemo(() => {
    const items = scenes.map((scene) => {
      const otherUsages = (sceneUsageMap.get(scene.sceneId) ?? []).filter(
        (entry) => !(entry.plotId === plotId && entry.cardId === card.cardId)
      );
      const inLinkedFolder = Boolean(linkedSceneFolder && scene.folder === linkedSceneFolder);
      return {
        scene,
        otherUsages,
        isCurrent: scene.sceneId === card.linkedSceneId,
        inLinkedFolder,
      };
    });

    if (!linkedSceneFolder) return items;

    return [...items].sort((a, b) => {
      if (a.inLinkedFolder === b.inLinkedFolder) return 0;
      return a.inLinkedFolder ? -1 : 1;
    });
  }, [scenes, sceneUsageMap, plotId, card.cardId, card.linkedSceneId, linkedSceneFolder]);

  const searchFilteredScenes = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/[\s\u3000]+/)
      .filter(Boolean);

    if (tokens.length === 0) return enrichedScenes;

    return enrichedScenes.filter(({ scene, otherUsages }) => {
      const usageText = otherUsages
        .map((u) => `${u.plotTitle} #${String(u.cardOrder).padStart(2, '0')} ${u.cardTitle}`)
        .join(' ');
      const folderText = scene.folder ? `${scene.folder} scenes/${scene.folder}` : '';
      const haystack = `${folderText} ${scene.title} ${scene.filename} ${usageText}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [enrichedScenes, query]);

  const folderFilteredScenes = useMemo(() => {
    if (!linkedSceneFolder || !linkedFolderOnly) return searchFilteredScenes;
    return searchFilteredScenes.filter((item) => item.inLinkedFolder);
  }, [searchFilteredScenes, linkedSceneFolder, linkedFolderOnly]);

  const displayedScenes = useMemo(() => {
    if (!unlinkedOnly) return folderFilteredScenes;
    return folderFilteredScenes.filter((item) => item.otherUsages.length === 0);
  }, [folderFilteredScenes, unlinkedOnly]);

  const hiddenOtherFolderCount = searchFilteredScenes.length - folderFilteredScenes.length;
  const hiddenUsedCount = folderFilteredScenes.length - displayedScenes.length;

  const selectableOptions: SelectableOption[] = useMemo(() => {
    const list: SelectableOption[] = [];
    if (card.linkedSceneId && query.trim() === '') {
      list.push({ kind: 'unlink', sceneId: '' });
    }
    for (const item of displayedScenes) {
      list.push({ kind: 'scene', ...item });
    }
    return list;
  }, [card.linkedSceneId, query, displayedScenes]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, unlinkedOnly, linkedFolderOnly, open]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[highlightedIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  const handleSelectOption = (option: SelectableOption) => {
    setOpen(false);
    if (option.kind === 'unlink') {
      onSelectScene('');
    } else {
      onSelectScene(option.scene.sceneId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (selectableOptions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % selectableOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + selectableOptions.length) % selectableOptions.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = selectableOptions[highlightedIndex];
      if (target) {
        handleSelectOption(target);
      }
    }
  };

  const formatUsageLabel = (usages: SceneUsageEntry[]) => {
    const first = usages[0];
    const orderTag = `#${String(first.cardOrder).padStart(2, '0')} ${first.cardTitle}`;
    const loc = first.plotId === plotId ? orderTag : `${first.plotTitle} / ${orderTag}`;
    const extra = usages.length > 1 ? ` 他${usages.length - 1}件` : '';
    return `${loc}${extra}`;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-no-drag="true"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        title={
          linkedScene
            ? `${linkedScene.folder ? `${linkedScene.folder} / ` : ''}${linkedScene.title} (${linkedScene.filename})`
            : 'クリックして紐付けるシーンを検索・選択'
        }
        className={`flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded border bg-white px-2 py-1 text-left text-xs transition-colors focus:outline-none ${
          open
            ? isAdult
              ? 'border-rose-400 ring-1 ring-rose-300'
              : 'border-slate-500 ring-1 ring-slate-300'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">
          {linkedScene ? (
            <>
              {linkedScene.folder && (
                <span className="mr-1 rounded bg-slate-100 px-1 py-0 text-[10px] font-medium text-slate-600">
                  {linkedScene.folder}/
                </span>
              )}
              <span className="font-medium text-slate-700">{linkedScene.title}</span>
              <span className="ml-1 font-code text-[10px] text-slate-400">
                ({linkedScene.filename})
              </span>
            </>
          ) : card.linkedSceneId ? (
            <span className="text-amber-700">不明なシーン ({card.linkedSceneId})</span>
          ) : (
            <span className="text-slate-400">
              {linkedSceneFolder
                ? `シーン未紐付け（${linkedSceneFolder}/ から検索）`
                : 'シーン未紐付け（検索して選択）'}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            data-no-drag="true"
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              maxHeight: `${coords.maxHeight}px`,
            }}
            className="z-50 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
          >
            {/* Search Input & Filter Switches */}
            <div className="border-b border-slate-100 p-2 space-y-2 bg-slate-50/70">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="シーン名・フォルダ名・ファイル名で検索..."
                  aria-label="紐付けシーンを検索"
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    aria-label="検索文字をクリア"
                    className="absolute right-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5 px-0.5">
                {linkedSceneFolder && (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={linkedFolderOnly}
                      onClick={() => setLinkedFolderOnly((v) => !v)}
                      className="flex min-w-0 items-center gap-2 text-left text-[11px] text-slate-700 hover:text-slate-900"
                    >
                      <span
                        aria-hidden="true"
                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                          linkedFolderOnly
                            ? isAdult
                              ? 'bg-rose-700'
                              : 'bg-slate-800'
                            : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                            linkedFolderOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      <span className="truncate font-medium">
                        連携フォルダ内のみ ({linkedSceneFolder}/)
                      </span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={unlinkedOnly}
                    onClick={() => setUnlinkedOnly((v) => !v)}
                    className="flex items-center gap-2 text-left text-[11px] text-slate-700 hover:text-slate-900"
                  >
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                        unlinkedOnly
                          ? isAdult
                            ? 'bg-rose-700'
                            : 'bg-slate-800'
                          : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                          unlinkedOnly ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                    <span className="font-medium">未紐付けシーンのみ表示</span>
                  </button>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                    {displayedScenes.length}件
                  </span>
                </div>
              </div>
            </div>

            {/* Candidate List */}
            <div role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
              {selectableOptions.map((option, idx) => {
                const isHighlighted = idx === highlightedIndex;

                if (option.kind === 'unlink') {
                  return (
                    <button
                      key="__unlink__"
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectOption(option)}
                      className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-left text-xs transition-colors ${
                        isHighlighted ? 'bg-slate-100 text-slate-900' : 'text-slate-600'
                      }`}
                    >
                      <Link2Off className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>シーン未紐付け（紐付けを解除）</span>
                    </button>
                  );
                }

                const { scene, otherUsages, isCurrent, inLinkedFolder } = option;
                const isUsedElsewhere = otherUsages.length > 0;

                return (
                  <button
                    key={scene.sceneId}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectOption(option)}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors ${
                      isHighlighted
                        ? isAdult
                          ? 'bg-rose-50/80'
                          : 'bg-slate-100'
                        : isCurrent
                          ? 'bg-slate-50'
                          : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-slate-900">
                          {scene.title}
                        </span>
                        {inLinkedFolder && !linkedFolderOnly && (
                          <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1 py-0 text-[9px] font-medium text-slate-700">
                            連携
                          </span>
                        )}
                        {scene.visibility === 'adult_only' && (
                          <span className="shrink-0 rounded border border-rose-200 bg-rose-50 px-1 py-0 text-[9px] font-medium text-rose-700">
                            R18
                          </span>
                        )}
                        {scene.visibility === 'general_alt' && (
                          <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1 py-0 text-[9px] font-medium text-slate-600">
                            一般差替
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                        {scene.folder && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0 text-slate-600">
                            <Folder className="h-2.5 w-2.5 text-slate-400" />
                            <span>{scene.folder}</span>
                          </span>
                        )}
                        <span className="font-code text-slate-400">
                          {scene.folder ? `${scene.folder}/${scene.filename}` : scene.filename}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          {scene.body.length.toLocaleString()}字
                        </span>
                        {isUsedElsewhere && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 border border-amber-200/80">
                            使用中: {formatUsageLabel(otherUsages)}
                          </span>
                        )}
                      </div>
                    </div>

                    {isCurrent && (
                      <Check
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          isAdult ? 'text-rose-700' : 'text-slate-800'
                        }`}
                      />
                    )}
                  </button>
                );
              })}

              {displayedScenes.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-slate-500 space-y-2">
                  <p>
                    {query.trim()
                      ? `「${query.trim()}」に一致するシーンがありません`
                      : linkedFolderOnly && linkedSceneFolder
                        ? `連携フォルダ「${linkedSceneFolder}/」に${unlinkedOnly ? '未紐付けの' : ''}シーンがありません`
                        : unlinkedOnly
                          ? '未紐付けのシーンがありません'
                          : 'シーンがまだありません'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {linkedFolderOnly && hiddenOtherFolderCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setLinkedFolderOnly(false)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        他フォルダのシーン（{hiddenOtherFolderCount}件）も表示
                      </button>
                    )}
                    {unlinkedOnly && hiddenUsedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setUnlinkedOnly(false)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        使用中のシーン（{hiddenUsedCount}件）も表示
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {linkedSceneFolder && onCreateAndLinkScene && (
              <div className="border-t border-slate-100 bg-slate-50/70 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onCreateAndLinkScene();
                  }}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isAdult
                      ? 'bg-rose-700 text-white hover:bg-rose-800'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  <FilePlus2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    「{linkedSceneFolder}/」に新規シーンを作成して紐付け
                  </span>
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
