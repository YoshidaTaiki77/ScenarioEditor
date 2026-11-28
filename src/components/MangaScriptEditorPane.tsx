import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  GripVertical,
  LayoutGrid,
  ListTree,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  MangaBindingDirection,
  MangaPage,
  MangaPanel,
  MangaSpeech,
  MangaSpeechType,
  ProjectData,
  SceneData,
  WorldSettingData,
} from '../types/scenario';
import {
  MANGA_PAGE_CHAR_WARNING_LIMIT,
  MANGA_PAGE_PANEL_WARNING_LIMIT,
  MANGA_SPEECH_CHAR_WARNING_LIMIT,
  MANGA_SPEECH_TYPE_META,
  MANGA_SPEECH_TYPES,
  buildMangaSpreads,
  compileMangaSpeechText,
  countPageStats,
  createEmptyMangaPage,
  createEmptyMangaPanel,
  createEmptyMangaSpeech,
  exportCspTypesettingText,
  exportMangaScriptDocument,
  getMangaPageSideInfo,
  getPageCountGuide,
  parseMangaMarkdown,
  serializeMangaMarkdown,
} from '../utils/mangaEngine';

export interface MangaScriptEditorHandle {
  jumpToLine: (line: number) => void;
  insertAtCursor: (text: string, placeCaretBefore?: string) => void;
}

type MangaSubView = 'structured' | 'daiwari' | 'markdown' | 'preview';

interface FocusedFieldTarget {
  kind: 'visual' | 'speech' | 'sfx' | 'note';
  pageIndex: number;
  panelIndex?: number;
  speechIndex?: number;
  element: HTMLTextAreaElement | HTMLInputElement;
}

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onFocusEl?: (el: HTMLTextAreaElement) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  onFocusEl,
  placeholder,
  minRows = 2,
  className = '',
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 20 + 10)}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => onFocusEl?.(e.currentTarget)}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none ${className}`}
    />
  );
};

interface MangaScriptEditorPaneProps {
  project: ProjectData;
  scene: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  onUpdateScene: (updated: SceneData) => void;
  onCursorChange: (cursorIndex: number) => void;
  onOpenMangaExport: (tab?: 'csp' | 'script') => void;
}

export const MangaScriptEditorPane = forwardRef<
  MangaScriptEditorHandle,
  MangaScriptEditorPaneProps
>(
  (
    {
      project,
      scene,
      characters,
      worldSettings,
      activeMode,
      onUpdateScene,
      onCursorChange,
      onOpenMangaExport,
    },
    ref
  ) => {
    const [subView, setSubView] = useState<MangaSubView>('structured');
    const [previewTab, setPreviewTab] = useState<'script' | 'csp'>('script');
    const [collapsedPages, setCollapsedPages] = useState<Record<number, boolean>>({});
    const [draggingPageIndex, setDraggingPageIndex] = useState<number | null>(null);
    const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);
    const [copiedCsp, setCopiedCsp] = useState(false);

    const markdownTextareaRef = useRef<HTMLTextAreaElement>(null);
    const pageContainerRefs = useRef<Record<number, HTMLElement | null>>({});
    const lastFocusedRef = useRef<FocusedFieldTarget | null>(null);

    const isAdult = activeMode === 'adult';
    const binding: MangaBindingDirection = scene.mangaBinding ?? 'rtl';
    const startPage = Math.max(1, scene.mangaStartPage ?? 1);

    const pages = useMemo(() => parseMangaMarkdown(scene.body), [scene.body]);
    const spreads = useMemo(
      () => buildMangaSpreads(pages, startPage, binding),
      [pages, startPage, binding]
    );
    const pageGuide = useMemo(() => getPageCountGuide(pages.length), [pages.length]);

    const orderedCharacters = useMemo(() => {
      const participating = characters.filter((c) => scene.characters.includes(c.id));
      const others = characters.filter((c) => !scene.characters.includes(c.id));
      return [...participating, ...others];
    }, [characters, scene.characters]);

    const totalStats = useMemo(() => {
      let panelCount = 0;
      let speechCount = 0;
      let totalChars = 0;
      for (const p of pages) {
        const s = countPageStats(p);
        panelCount += s.panelCount;
        speechCount += s.speechCount;
        totalChars += s.totalChars;
      }
      return { panelCount, speechCount, totalChars };
    }, [pages]);

    const commitPages = useCallback(
      (nextPages: MangaPage[]) => {
        const serialized = serializeMangaMarkdown(nextPages);
        onUpdateScene({ ...scene, body: serialized });
      },
      [scene, onUpdateScene]
    );

    // Clear focus tracking when switching scenes
    useEffect(() => {
      lastFocusedRef.current = null;
      setCollapsedPages({});
    }, [scene.sceneId]);

    const scrollToPage = useCallback((pageIndex: number) => {
      setSubView('structured');
      setCollapsedPages((prev) => ({ ...prev, [pageIndex]: false }));
      requestAnimationFrame(() => {
        const el = pageContainerRefs.current[pageIndex];
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        jumpToLine(line: number) {
          if (subView === 'markdown') {
            const ta = markdownTextareaRef.current;
            if (!ta) return;
            const lines = scene.body.split(/\r?\n/);
            let offset = 0;
            for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
              offset += lines[i].length + 1;
            }
            ta.focus();
            ta.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
            onCursorChange(offset);
            return;
          }

          // In structured/daiwari/preview mode, find which page owns this line and scroll to it
          const lines = scene.body.split(/\r?\n/);
          let pageIdx = 0;
          let seenPage = false;
          for (let i = 0; i < Math.min(line, lines.length); i++) {
            if (/^##\s+P\d+/i.test(lines[i].trim())) {
              if (seenPage) pageIdx += 1;
              seenPage = true;
            }
          }
          scrollToPage(Math.min(pageIdx, Math.max(0, pages.length - 1)));
        },
        insertAtCursor(text: string, placeCaretBefore?: string) {
          if (subView === 'markdown') {
            const ta = markdownTextareaRef.current;
            if (!ta) return;
            const start = ta.selectionStart ?? scene.body.length;
            const end = ta.selectionEnd ?? scene.body.length;
            const nextBody = scene.body.slice(0, start) + text + scene.body.slice(end);
            onUpdateScene({ ...scene, body: nextBody });
            const caretOffset = placeCaretBefore ? text.indexOf(placeCaretBefore) : -1;
            const nextCaret = caretOffset >= 0 ? start + caretOffset : start + text.length;
            requestAnimationFrame(() => {
              ta.focus();
              ta.setSelectionRange(nextCaret, nextCaret);
              onCursorChange(nextCaret);
            });
            return;
          }

          const target = lastFocusedRef.current;
          if (!target || !document.body.contains(target.element)) {
            // Fallback: append to first page / first panel speech or visual
            const nextPages = pages.map((p, idx) => {
              if (idx !== 0) return p;
              const panels = p.panels.map((pn, kIdx) => {
                if (kIdx !== 0) return pn;
                if (pn.speeches.length > 0) {
                  return {
                    ...pn,
                    speeches: pn.speeches.map((sp, sIdx) =>
                      sIdx === 0 ? { ...sp, text: `${sp.text}${text}` } : sp
                    ),
                  };
                }
                return { ...pn, visual: `${pn.visual}${text}` };
              });
              return { ...p, panels };
            });
            commitPages(nextPages);
            return;
          }

          const el = target.element;
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          const nextValue = el.value.slice(0, start) + text + el.value.slice(end);
          const caretOffset = placeCaretBefore ? text.indexOf(placeCaretBefore) : -1;
          const nextCaret = caretOffset >= 0 ? start + caretOffset : start + text.length;

          const nextPages = pages.map((p, pIdx) => {
            if (pIdx !== target.pageIndex) return p;
            if (target.kind === 'note') {
              return { ...p, note: nextValue };
            }
            return {
              ...p,
              panels: p.panels.map((pn, kIdx) => {
                if (kIdx !== target.panelIndex) return pn;
                if (target.kind === 'visual') return { ...pn, visual: nextValue };
                if (target.kind === 'sfx') return { ...pn, sfx: nextValue };
                if (target.kind === 'speech') {
                  return {
                    ...pn,
                    speeches: pn.speeches.map((sp, sIdx) =>
                      sIdx === target.speechIndex ? { ...sp, text: nextValue } : sp
                    ),
                  };
                }
                return pn;
              }),
            };
          });

          commitPages(nextPages);
          requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(nextCaret, nextCaret);
          });
        },
      }),
      [subView, scene, pages, commitPages, onUpdateScene, onCursorChange, scrollToPage]
    );

    // Page CRUD & Reorder
    const addPage = (count = 1) => {
      const added: MangaPage[] = [];
      for (let i = 0; i < count; i++) {
        added.push(createEmptyMangaPage(3));
      }
      const nextPages = [...pages, ...added];
      commitPages(nextPages);
      if (subView === 'structured') {
        const targetIdx = pages.length;
        requestAnimationFrame(() => {
          pageContainerRefs.current[targetIdx]?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        });
      }
    };

    const duplicatePage = (pageIndex: number) => {
      const source = pages[pageIndex];
      if (!source) return;
      const cloned: MangaPage = {
        ...createEmptyMangaPage(1),
        note: source.note,
        panels: source.panels.map((pn) => ({
          ...createEmptyMangaPanel(),
          visual: pn.visual,
          sfx: pn.sfx,
          speeches: pn.speeches.map((sp) => ({
            ...createEmptyMangaSpeech(sp.speaker),
            type: sp.type,
            text: sp.text,
          })),
        })),
      };
      const next = [...pages];
      next.splice(pageIndex + 1, 0, cloned);
      commitPages(next);
    };

    const deletePage = (pageIndex: number) => {
      if (pages.length <= 1) return;
      commitPages(pages.filter((_, idx) => idx !== pageIndex));
    };

    const movePage = (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= pages.length ||
        toIndex >= pages.length
      ) {
        return;
      }
      const next = [...pages];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commitPages(next);
    };

    const updatePageNote = (pageIndex: number, note: string) => {
      commitPages(pages.map((p, idx) => (idx === pageIndex ? { ...p, note } : p)));
    };

    // Panel CRUD & Reorder
    const addPanel = (pageIndex: number) => {
      const defaultSpeaker = orderedCharacters[0]?.shortName ?? '';
      commitPages(
        pages.map((p, idx) =>
          idx === pageIndex
            ? { ...p, panels: [...p.panels, createEmptyMangaPanel(defaultSpeaker)] }
            : p
        )
      );
    };

    const updatePanel = (pageIndex: number, panelIndex: number, patch: Partial<MangaPanel>) => {
      commitPages(
        pages.map((p, pIdx) =>
          pIdx === pageIndex
            ? {
                ...p,
                panels: p.panels.map((pn, kIdx) =>
                  kIdx === panelIndex ? { ...pn, ...patch } : pn
                ),
              }
            : p
        )
      );
    };

    const deletePanel = (pageIndex: number, panelIndex: number) => {
      commitPages(
        pages.map((p, pIdx) => {
          if (pIdx !== pageIndex || p.panels.length <= 1) return p;
          return { ...p, panels: p.panels.filter((_, kIdx) => kIdx !== panelIndex) };
        })
      );
    };

    const movePanel = (pageIndex: number, fromIdx: number, toIdx: number) => {
      commitPages(
        pages.map((p, pIdx) => {
          if (pIdx !== pageIndex) return p;
          if (toIdx < 0 || toIdx >= p.panels.length) return p;
          const nextPanels = [...p.panels];
          const [moved] = nextPanels.splice(fromIdx, 1);
          nextPanels.splice(toIdx, 0, moved);
          return { ...p, panels: nextPanels };
        })
      );
    };

    // Speech CRUD & Reorder
    const addSpeech = (pageIndex: number, panelIndex: number) => {
      const defaultSpeaker = orderedCharacters[0]?.shortName ?? '';
      commitPages(
        pages.map((p, pIdx) =>
          pIdx === pageIndex
            ? {
                ...p,
                panels: p.panels.map((pn, kIdx) =>
                  kIdx === panelIndex
                    ? { ...pn, speeches: [...pn.speeches, createEmptyMangaSpeech(defaultSpeaker)] }
                    : pn
                ),
              }
            : p
        )
      );
    };

    const updateSpeech = (
      pageIndex: number,
      panelIndex: number,
      speechIndex: number,
      patch: Partial<MangaSpeech>
    ) => {
      commitPages(
        pages.map((p, pIdx) =>
          pIdx === pageIndex
            ? {
                ...p,
                panels: p.panels.map((pn, kIdx) =>
                  kIdx === panelIndex
                    ? {
                        ...pn,
                        speeches: pn.speeches.map((sp, sIdx) =>
                          sIdx === speechIndex ? { ...sp, ...patch } : sp
                        ),
                      }
                    : pn
                ),
              }
            : p
        )
      );
    };

    const deleteSpeech = (pageIndex: number, panelIndex: number, speechIndex: number) => {
      commitPages(
        pages.map((p, pIdx) =>
          pIdx === pageIndex
            ? {
                ...p,
                panels: p.panels.map((pn, kIdx) =>
                  kIdx === panelIndex
                    ? { ...pn, speeches: pn.speeches.filter((_, sIdx) => sIdx !== speechIndex) }
                    : pn
                ),
              }
            : p
        )
      );
    };

    const moveSpeech = (
      pageIndex: number,
      panelIndex: number,
      fromIdx: number,
      toIdx: number
    ) => {
      commitPages(
        pages.map((p, pIdx) =>
          pIdx === pageIndex
            ? {
                ...p,
                panels: p.panels.map((pn, kIdx) => {
                  if (kIdx !== panelIndex || toIdx < 0 || toIdx >= pn.speeches.length) return pn;
                  const next = [...pn.speeches];
                  const [moved] = next.splice(fromIdx, 1);
                  next.splice(toIdx, 0, moved);
                  return { ...pn, speeches: next };
                }),
              }
            : p
        )
      );
    };

    const compiledCspPreview = useMemo(
      () => exportCspTypesettingText([scene], characters, worldSettings, activeMode),
      [scene, characters, worldSettings, activeMode]
    );

    const compiledScriptPreview = useMemo(
      () =>
        exportMangaScriptDocument(
          project,
          [scene],
          characters,
          worldSettings,
          activeMode,
          scene
        ).content,
      [project, scene, characters, worldSettings, activeMode]
    );

    const handleQuickCopyCsp = async () => {
      try {
        await navigator.clipboard.writeText(compiledCspPreview);
        setCopiedCsp(true);
        setTimeout(() => setCopiedCsp(false), 1800);
      } catch {
        // Ignore clipboard denial
      }
    };

    const renderDaiwariCard = (
      slot: { page: MangaPage; pageIndex: number; info: ReturnType<typeof getMangaPageSideInfo> } | undefined,
      emptyHint: string
    ) => {
      if (!slot) {
        return (
          <div className="flex min-h-[190px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-[11px] text-slate-400">
            <span>{emptyHint}</span>
          </div>
        );
      }

      const { page, pageIndex, info } = slot;
      const stats = countPageStats(page);
      const isDragging = draggingPageIndex === pageIndex;
      const isDragOver = dragOverPageIndex === pageIndex && draggingPageIndex !== pageIndex;
      const panelWarn = stats.panelCount > MANGA_PAGE_PANEL_WARNING_LIMIT;
      const charWarn = stats.totalChars > MANGA_PAGE_CHAR_WARNING_LIMIT;

      return (
        <div
          draggable
          onDragStart={(e) => {
            setDraggingPageIndex(pageIndex);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(pageIndex));
          }}
          onDragOver={(e) => {
            if (draggingPageIndex === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragOverPageIndex !== pageIndex) setDragOverPageIndex(pageIndex);
          }}
          onDragLeave={() => {
            if (dragOverPageIndex === pageIndex) setDragOverPageIndex(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingPageIndex !== null && draggingPageIndex !== pageIndex) {
              movePage(draggingPageIndex, pageIndex);
            }
            setDraggingPageIndex(null);
            setDragOverPageIndex(null);
          }}
          onDragEnd={() => {
            setDraggingPageIndex(null);
            setDragOverPageIndex(null);
          }}
          className={`flex min-h-[190px] flex-col rounded-lg border bg-white p-3 shadow-2xs transition-all ${
            isDragging
              ? 'opacity-45 border-slate-300'
              : isDragOver
                ? isAdult
                  ? 'border-rose-500 ring-2 ring-rose-200'
                  : 'border-slate-700 ring-2 ring-slate-200'
                : info.isTurnPage
                  ? 'border-slate-300'
                  : 'border-slate-200'
          }`}
        >
          {/* Daiwari Page Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                title="ドラッグしてページ順を入れ替え"
                className="cursor-grab text-slate-300 hover:text-slate-600 active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <span className="font-code text-xs font-bold text-slate-900">
                P{info.pageNumber}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                  info.isTurnPage
                    ? isAdult
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {info.shortLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => scrollToPage(pageIndex)}
                className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
              >
                編集へ
              </button>
              {pages.length > 1 && (
                <button
                  type="button"
                  onClick={() => deletePage(pageIndex)}
                  title="このページを削除"
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Editable Page Summary / Hook */}
          <div className="mt-2">
            <textarea
              rows={2}
              value={page.note}
              onChange={(e) => updatePageNote(pageIndex, e.target.value)}
              placeholder={
                info.isTurnPage
                  ? 'このページの要約・めくり（引き）の狙い...'
                  : 'このページの展開メモ・要約...'
              }
              className="w-full resize-none rounded border border-slate-200/80 bg-slate-50/60 px-2 py-1 text-[11px] leading-snug text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Compact Panel Preview */}
          <div className="mt-2 flex-1 space-y-1 text-[11px] text-slate-600">
            {page.panels.slice(0, 3).map((pn, idx) => {
              const firstSpeech = pn.speeches.find((s) => s.text.trim());
              return (
                <div
                  key={pn.id}
                  className="truncate rounded bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                >
                  <span className="font-code text-slate-400 mr-1">[{idx + 1}]</span>
                  <span>
                    {pn.visual.trim() ||
                      (firstSpeech
                        ? `${firstSpeech.speaker ? `${firstSpeech.speaker}: ` : ''}${firstSpeech.text}`
                        : '（未入力）')}
                  </span>
                </div>
              );
            })}
            {page.panels.length > 3 && (
              <div className="pl-1 text-[10px] text-slate-400">
                …ほか {page.panels.length - 3} コマ
              </div>
            )}
          </div>

          {/* Page Density Metrics */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 font-code text-[10px] tabular-nums">
            <div className="flex items-center gap-2">
              <span className={panelWarn ? 'font-semibold text-amber-700' : 'text-slate-500'}>
                {stats.panelCount}コマ
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{stats.speechCount}フキダシ</span>
            </div>
            <span className={charWarn ? 'font-semibold text-amber-700' : 'text-slate-500'}>
              {stats.totalChars}字
            </span>
          </div>
        </div>
      );
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50/40">
        {/* Manga Sub-Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sub-view Switcher */}
            <div
              role="group"
              aria-label="マンガ脚本の表示切替"
              className="flex items-center rounded-md border border-slate-200 bg-white p-0.5"
            >
              <button
                type="button"
                onClick={() => setSubView('structured')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  subView === 'structured'
                    ? isAdult
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                <span>構造編集</span>
              </button>
              <button
                type="button"
                onClick={() => setSubView('daiwari')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  subView === 'daiwari'
                    ? isAdult
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>台割（見開き）</span>
              </button>
              <button
                type="button"
                onClick={() => setSubView('markdown')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  subView === 'markdown'
                    ? isAdult
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>テキスト編集</span>
              </button>
              <button
                type="button"
                onClick={() => setSubView('preview')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  subView === 'preview'
                    ? isAdult
                      ? 'bg-rose-700 text-white'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>展開プレビュー</span>
              </button>
            </div>

            {/* Binding Direction & Start Page */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <select
                value={binding}
                aria-label="綴じ方向"
                onChange={(e) =>
                  onUpdateScene({
                    ...scene,
                    mangaBinding: e.target.value as MangaBindingDirection,
                  })
                }
                className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none"
              >
                <option value="rtl">右綴じ（日本標準）</option>
                <option value="ltr">左綴じ</option>
              </select>

              <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                <span>開始P</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={startPage}
                  onChange={(e) => {
                    const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    onUpdateScene({ ...scene, mangaStartPage: n });
                  }}
                  className="w-11 bg-transparent text-right font-code text-[11px] text-slate-900 focus:outline-none tabular-nums"
                />
              </label>

              <span
                className={`hidden sm:inline-flex items-center rounded border px-2 py-0.5 font-code text-[10px] tabular-nums ${
                  pageGuide.isMultipleOf4
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {pageGuide.summary}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleQuickCopyCsp()}
              title="クリスタ（ストーリーエディタ）用テキストをクリップボードへコピー"
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              {copiedCsp ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">写植コピー済</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>クリスタ写植コピー</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenMangaExport('csp')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium text-white whitespace-nowrap ${
                isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>マンガ書き出し</span>
            </button>
          </div>
        </div>

        {/* VIEW 1: Structured Page & Panel Editor */}
        {subView === 'structured' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-4xl space-y-5">
              {/* Quick Page Navigation Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[11px] font-medium text-slate-500">ページ移動:</span>
                  {pages.map((p, pIdx) => {
                    const info = getMangaPageSideInfo(startPage + pIdx, binding);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => scrollToPage(pIdx)}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-code text-[11px] text-slate-700 hover:bg-slate-100"
                      >
                        P{info.pageNumber}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addPage(1)}
                    className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" />
                    <span>+1P</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addPage(2)}
                    className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <BookOpen className="h-3 w-3" />
                    <span>+見開き(2P)</span>
                  </button>
                </div>
              </div>

              {/* Pages */}
              {pages.map((page, pageIndex) => {
                const pageNum = startPage + pageIndex;
                const sideInfo = getMangaPageSideInfo(pageNum, binding);
                const stats = countPageStats(page);
                const isCollapsed = Boolean(collapsedPages[pageIndex]);
                const panelOverLimit = stats.panelCount > MANGA_PAGE_PANEL_WARNING_LIMIT;
                const charOverLimit = stats.totalChars > MANGA_PAGE_CHAR_WARNING_LIMIT;

                return (
                  <section
                    key={page.id}
                    ref={(el) => {
                      pageContainerRefs.current[pageIndex] = el;
                    }}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"
                  >
                    {/* Page Header */}
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${
                        sideInfo.isTurnPage
                          ? isAdult
                            ? 'border-rose-200 bg-rose-50/40'
                            : 'border-amber-200/80 bg-amber-50/35'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedPages((prev) => ({
                              ...prev,
                              [pageIndex]: !prev[pageIndex],
                            }))
                          }
                          className="rounded p-0.5 text-slate-500 hover:bg-slate-200/60"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <span className="font-code text-sm font-bold text-slate-900">
                          P{pageNum}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                            sideInfo.isTurnPage
                              ? isAdult
                                ? 'border-rose-200 bg-rose-100/70 text-rose-800'
                                : 'border-amber-200 bg-amber-100/70 text-amber-900'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          {sideInfo.shortLabel}
                        </span>
                        <span
                          className={`font-code text-[11px] tabular-nums ${
                            panelOverLimit ? 'font-semibold text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          {stats.panelCount}コマ
                        </span>
                        <span className="text-slate-300">·</span>
                        <span
                          className={`font-code text-[11px] tabular-nums ${
                            charOverLimit ? 'font-semibold text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          セリフ {stats.totalChars}字
                        </span>
                        {(panelOverLimit || charOverLimit) && (
                          <span
                            title="1ページの密度が高めです（目安：8コマ以内・200字以内）"
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            <span>密度注意</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={pageIndex === 0}
                          onClick={() => movePage(pageIndex, pageIndex - 1)}
                          title="ページを前へ移動"
                          className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pageIndex === pages.length - 1}
                          onClick={() => movePage(pageIndex, pageIndex + 1)}
                          title="ページを後ろへ移動"
                          className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicatePage(pageIndex)}
                          title="このページを複製"
                          className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {pages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deletePage(pageIndex)}
                            title="このページを削除"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-4 p-4">
                        {/* Page Hook / Note */}
                        <div>
                          <label className="block space-y-1">
                            <span className="text-[11px] font-medium text-slate-500">
                              ページの狙い・めくり（引き）メモ
                            </span>
                            <input
                              type="text"
                              value={page.note}
                              onChange={(e) => updatePageNote(pageIndex, e.target.value)}
                              onFocus={(e) => {
                                lastFocusedRef.current = {
                                  kind: 'note',
                                  pageIndex,
                                  element: e.currentTarget,
                                };
                              }}
                              placeholder={
                                sideInfo.isTurnPage
                                  ? '例: 最後のコマで表情を引きにして次ページへめくらせる'
                                  : '例: 場の空気感と2人のテンポ良いやり取りを提示'
                              }
                              className="w-full rounded border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
                            />
                          </label>
                        </div>

                        {/* Panels */}
                        <div className="space-y-3">
                          {page.panels.map((panel, panelIndex) => (
                            <div
                              key={panel.id}
                              className="rounded-lg border border-slate-200/90 bg-slate-50/40 p-3 space-y-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-code text-xs font-semibold text-slate-700">
                                  コマ {panelIndex + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={panelIndex === 0}
                                    onClick={() => movePanel(pageIndex, panelIndex, panelIndex - 1)}
                                    title="コマを上へ"
                                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={panelIndex === page.panels.length - 1}
                                    onClick={() => movePanel(pageIndex, panelIndex, panelIndex + 1)}
                                    title="コマを下へ"
                                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                  {page.panels.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => deletePanel(pageIndex, panelIndex)}
                                      title="このコマを削除"
                                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Visual / Composition */}
                              <div className="space-y-1">
                                <span className="block text-[11px] font-medium text-slate-500">
                                  構図・絵のト書き（アングル・表情・背景・演出）
                                </span>
                                <AutoGrowTextarea
                                  value={panel.visual}
                                  onChange={(val) =>
                                    updatePanel(pageIndex, panelIndex, { visual: val })
                                  }
                                  onFocusEl={(el) => {
                                    lastFocusedRef.current = {
                                      kind: 'visual',
                                      pageIndex,
                                      panelIndex,
                                      element: el,
                                    };
                                  }}
                                  placeholder="例: 夕日の差し込む図書室のロングショット。栞の背中越しに蓮が立つ。"
                                  minRows={2}
                                />
                              </div>

                              {/* Speeches */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium text-slate-500">
                                    セリフ・フキダシ（{panel.speeches.length}）
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addSpeech(pageIndex, panelIndex)}
                                    className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                  >
                                    <MessageSquarePlus className="h-3 w-3 text-slate-500" />
                                    <span>セリフ追加</span>
                                  </button>
                                </div>

                                {panel.speeches.length === 0 ? (
                                  <div className="rounded border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-[11px] text-slate-400">
                                    無言コマ（セリフなし）— 「セリフ追加」でフキダシを追加できます
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {panel.speeches.map((sp, speechIndex) => {
                                      const compiledLen = compileMangaSpeechText(
                                        sp.text,
                                        characters,
                                        worldSettings,
                                        activeMode
                                      ).replace(/\s+/g, '').length;
                                      const tooLong = compiledLen > MANGA_SPEECH_CHAR_WARNING_LIMIT;
                                      const isRegisteredSpeaker = orderedCharacters.some(
                                        (c) => c.shortName === sp.speaker
                                      );

                                      return (
                                        <div
                                          key={sp.id}
                                          className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <select
                                                value={sp.type}
                                                aria-label="フキダシ種別"
                                                onChange={(e) =>
                                                  updateSpeech(pageIndex, panelIndex, speechIndex, {
                                                    type: e.target.value as MangaSpeechType,
                                                  })
                                                }
                                                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none ${MANGA_SPEECH_TYPE_META[sp.type].badgeStyle}`}
                                              >
                                                {MANGA_SPEECH_TYPES.map((t) => (
                                                  <option key={t} value={t}>
                                                    {MANGA_SPEECH_TYPE_META[t].label}
                                                  </option>
                                                ))}
                                              </select>

                                              {sp.type !== 'narration' && (
                                                <div className="flex items-center gap-1">
                                                  <select
                                                    value={isRegisteredSpeaker ? sp.speaker : '__custom__'}
                                                    aria-label="話者選択"
                                                    onChange={(e) => {
                                                      if (e.target.value !== '__custom__') {
                                                        updateSpeech(
                                                          pageIndex,
                                                          panelIndex,
                                                          speechIndex,
                                                          { speaker: e.target.value }
                                                        );
                                                      }
                                                    }}
                                                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none"
                                                  >
                                                    <option value="">話者なし</option>
                                                    {orderedCharacters.map((c) => (
                                                      <option key={c.id} value={c.shortName}>
                                                        {c.shortName}（{c.common.name}）
                                                      </option>
                                                    ))}
                                                    {!isRegisteredSpeaker && sp.speaker && (
                                                      <option value="__custom__">
                                                        任意入力: {sp.speaker}
                                                      </option>
                                                    )}
                                                  </select>
                                                  <input
                                                    type="text"
                                                    value={sp.speaker}
                                                    onChange={(e) =>
                                                      updateSpeech(
                                                        pageIndex,
                                                        panelIndex,
                                                        speechIndex,
                                                        { speaker: e.target.value }
                                                      )
                                                    }
                                                    placeholder="話者名"
                                                    className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                                                  />
                                                </div>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                              <span
                                                title={`展開後の文字数（目安 ${MANGA_SPEECH_CHAR_WARNING_LIMIT}文字以内）`}
                                                className={`font-code text-[10px] tabular-nums ${
                                                  tooLong
                                                    ? 'font-semibold text-amber-700'
                                                    : 'text-slate-400'
                                                }`}
                                              >
                                                {compiledLen}字
                                              </span>
                                              <button
                                                type="button"
                                                disabled={speechIndex === 0}
                                                onClick={() =>
                                                  moveSpeech(
                                                    pageIndex,
                                                    panelIndex,
                                                    speechIndex,
                                                    speechIndex - 1
                                                  )
                                                }
                                                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                              >
                                                <ArrowUp className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={speechIndex === panel.speeches.length - 1}
                                                onClick={() =>
                                                  moveSpeech(
                                                    pageIndex,
                                                    panelIndex,
                                                    speechIndex,
                                                    speechIndex + 1
                                                  )
                                                }
                                                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                              >
                                                <ArrowDown className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  deleteSpeech(pageIndex, panelIndex, speechIndex)
                                                }
                                                className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                          </div>

                                          <AutoGrowTextarea
                                            value={sp.text}
                                            onChange={(val) =>
                                              updateSpeech(pageIndex, panelIndex, speechIndex, {
                                                text: val,
                                              })
                                            }
                                            onFocusEl={(el) => {
                                              lastFocusedRef.current = {
                                                kind: 'speech',
                                                pageIndex,
                                                panelIndex,
                                                speechIndex,
                                                element: el,
                                              };
                                            }}
                                            placeholder="セリフ本文（{{キャラID.firstPerson}} や [IF_MODE: ...] も利用可）"
                                            minRows={1}
                                            className={tooLong ? 'border-amber-300 bg-amber-50/25' : ''}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* SFX */}
                              <div className="flex items-center gap-2">
                                <span className="shrink-0 text-[11px] font-medium text-slate-500">
                                  描き文字・擬音 (SFX)
                                </span>
                                <input
                                  type="text"
                                  value={panel.sfx}
                                  onChange={(e) =>
                                    updatePanel(pageIndex, panelIndex, { sfx: e.target.value })
                                  }
                                  onFocus={(e) => {
                                    lastFocusedRef.current = {
                                      kind: 'sfx',
                                      pageIndex,
                                      panelIndex,
                                      element: e.currentTarget,
                                    };
                                  }}
                                  placeholder="例: ドンッ / ざわ… / キーンコーン"
                                  className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => addPanel(pageIndex)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 py-2 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-100/70 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>P{pageNum} にコマを追加</span>
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Add Page Footer */}
              <div className="flex flex-wrap items-center justify-center gap-2 pb-6">
                <button
                  type="button"
                  onClick={() => addPage(1)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>ページを追加（P{startPage + pages.length}）</span>
                </button>
                <button
                  type="button"
                  onClick={() => addPage(2)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>見開きを追加（+2P）</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: Daiwari (Spread Overview) */}
        {subView === 'daiwari' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-5xl space-y-4">
              {/* Daiwari Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
                    <span>台割（見開き構成）</span>
                    <span
                      className={`rounded border px-2 py-0.5 font-code text-[11px] font-medium tabular-nums ${
                        pageGuide.isMultipleOf4
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {pageGuide.summary}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    全 {pages.length}ページ · {totalStats.panelCount}コマ · {totalStats.speechCount}
                    フキダシ · セリフ計 {totalStats.totalChars.toLocaleString()}字（カードをドラッグしてページ順を入れ替え可能）
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addPage(1)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+1P追加</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addPage(2)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>+見開き(2P)</span>
                  </button>
                </div>
              </div>

              {/* Column Direction Indicator */}
              <div className="grid grid-cols-2 gap-3 px-1 text-center text-[11px] font-medium text-slate-500">
                <div>{binding === 'rtl' ? '← 左ページ（めくり・引き）' : '左ページ'}</div>
                <div>{binding === 'rtl' ? '右ページ（見開き入り） →' : '右ページ（めくり・引き） →'}</div>
              </div>

              {/* Spreads */}
              <div className="space-y-4 pb-6">
                {spreads.map((row) => (
                  <div
                    key={row.spreadIndex}
                    className="grid grid-cols-1 gap-3 md:grid-cols-2"
                  >
                    {renderDaiwariCard(
                      row.left,
                      binding === 'rtl' ? '次話へ / 裏表紙側' : '表紙裏 / 見返し'
                    )}
                    {renderDaiwariCard(
                      row.right,
                      binding === 'rtl' ? '表紙裏 / 見返し（単独開始ページ）' : '次話へ / 裏表紙側'
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Raw Markdown Bidirectional Editor */}
        {subView === 'markdown' && (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-1.5 text-[11px] text-slate-500">
              書式例: <span className="font-code text-slate-700">## P1</span> /{' '}
              <span className="font-code text-slate-700">&gt; 狙い: ...</span> /{' '}
              <span className="font-code text-slate-700">### コマ1</span> /{' '}
              <span className="font-code text-slate-700">- 構図: ...</span> /{' '}
              <span className="font-code text-slate-700">- セリフ[通常] 話者: ...</span> /{' '}
              <span className="font-code text-slate-700">- 擬音: ...</span>
              （構造編集と自動同期されます）
            </div>
            <textarea
              ref={markdownTextareaRef}
              value={scene.body}
              onChange={(e) => {
                onUpdateScene({ ...scene, body: e.target.value });
                onCursorChange(e.target.selectionStart);
              }}
              onClick={(e) => onCursorChange(e.currentTarget.selectionStart)}
              onKeyUp={(e) => onCursorChange(e.currentTarget.selectionStart)}
              spellCheck={false}
              className="h-full w-full flex-1 resize-none border-0 bg-white px-6 py-5 font-code text-xs leading-7 text-slate-900 focus:outline-none"
            />
          </div>
        )}

        {/* VIEW 4: Live Compiled Preview */}
        {subView === 'preview' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewTab('script')}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    previewTab === 'script'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  展開済みマンガ脚本
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('csp')}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    previewTab === 'csp'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  クリスタ写植プレビュー
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                <span>{isAdult ? 'R18モード展開中' : '一般用モード展開中'}</span>
                <button
                  type="button"
                  onClick={() => onOpenMangaExport(previewTab)}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  詳細設定で書き出し...
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <pre className="mx-auto max-w-4xl whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-5 font-code text-xs leading-relaxed text-slate-800 select-text">
                {previewTab === 'script' ? compiledScriptPreview : compiledCspPreview}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }
);

MangaScriptEditorPane.displayName = 'MangaScriptEditorPane';
