import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Clock,
  Download,
  Eye,
  FilePlus2,
  Folder,
  FolderInput,
  GitBranch,
  GripVertical,
  LayoutGrid,
  List,
  MapPin,
  Network,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  PlotCard,
  PlotCardStatus,
  PlotData,
  PlotScope,
  SceneData,
  VisibilityType,
} from '../types/scenario';
import {
  cleanupCardConnections,
  reassignChartSlotsAfterListReorder,
} from '../utils/plotChartLayout';
import { getPlotFilename, triggerDownload } from '../utils/storage';
import { PlotFlowChart } from './PlotFlowChart';
import { SceneLinkCombobox, type SceneUsageEntry } from './SceneLinkCombobox';

export type MoveCardPosition = 'end' | 'start';

interface PlotBoardProps {
  plot: PlotData;
  allPlots?: PlotData[];
  scenes: SceneData[];
  sceneFolders?: string[];
  characters?: CharacterData[];
  activeMode: ActiveMode;
  compact?: boolean;
  onUpdatePlot: (updated: PlotData) => void;
  onAssignSceneToCard?: (plotId: string, cardId: string, sceneId: string) => void;
  onCreateSceneAndLink?: (plotId: string, cardId: string) => void;
  onMoveScenesToFolder?: (sceneIds: string[], targetFolder: string) => void;
  onMoveCardToPlot?: (
    sourcePlotId: string,
    targetPlotId: string,
    cardId: string,
    options: {
      position: MoveCardPosition;
      openTargetPlot: boolean;
      moveLinkedSceneToTargetFolder?: boolean;
    }
  ) => void;
  onSelectSplitPlot?: (plotId: string) => void;
  onOpenScene: (sceneId: string) => void;
}

interface PendingSceneReassign {
  targetCardId: string;
  targetCardOrder: number;
  targetCardTitle: string;
  sceneId: string;
  sceneTitle: string;
  sceneFilename: string;
  conflicts: SceneUsageEntry[];
}

interface PendingMoveCardState {
  card: PlotCard;
  targetPlotId: string;
  position: MoveCardPosition;
  openTargetPlot: boolean;
  moveLinkedSceneToTargetFolder: boolean;
}

type DropSide = 'before' | 'after';

interface DragOverState {
  cardId: string;
  side: DropSide;
  isMultiCol: boolean;
}

type PlotViewMode = 'timeline' | 'chart' | 'grid';

const STATUS_META: Array<{ value: PlotCardStatus; label: string; style: string }> = [
  { value: 'todo', label: '未着手', style: 'border-slate-200 bg-white text-slate-600' },
  { value: 'draft', label: '下書き', style: 'border-slate-300 bg-slate-100 text-slate-700' },
  { value: 'writing', label: '執筆中', style: 'border-amber-200 bg-amber-50 text-amber-800' },
  { value: 'review', label: '推敲待ち', style: 'border-sky-200 bg-sky-50 text-sky-800' },
  { value: 'done', label: '完了', style: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
];

const VISIBILITY_META: Record<
  VisibilityType,
  {
    shortLabel: string;
    badgeStyle: string;
    accentBorder: string;
  }
> = {
  common: {
    shortLabel: '共通',
    badgeStyle: 'border-slate-200 bg-slate-50 text-slate-600',
    accentBorder: 'border-l-slate-400',
  },
  general_alt: {
    shortLabel: '一般差替',
    badgeStyle: 'border-sky-200 bg-sky-50 text-sky-800',
    accentBorder: 'border-l-sky-500',
  },
  adult_only: {
    shortLabel: 'R18専用',
    badgeStyle: 'border-rose-200 bg-rose-50 text-rose-700',
    accentBorder: 'border-l-rose-600',
  },
};

const SCOPE_LABELS: Array<{ value: PlotScope; label: string }> = [
  { value: 'chapter', label: '章ごと' },
  { value: 'route', label: 'ルート別' },
  { value: 'character', label: 'キャラ別' },
  { value: 'subplot', label: '自由単位' },
];

export const PlotBoard: React.FC<PlotBoardProps> = ({
  plot,
  allPlots = [],
  scenes,
  sceneFolders = [],
  characters = [],
  activeMode,
  compact = false,
  onUpdatePlot,
  onAssignSceneToCard,
  onCreateSceneAndLink,
  onMoveScenesToFolder,
  onMoveCardToPlot,
  onSelectSplitPlot,
  onOpenScene,
}) => {
  const isAdult = activeMode === 'adult';
  const sortedCards = [...plot.cards].sort((a, b) => a.order - b.order);
  const currentFilename = getPlotFilename(plot);
  const otherPlots = useMemo(
    () => allPlots.filter((p) => p.plotId !== plot.plotId),
    [allPlots, plot.plotId]
  );
  const selectableSceneFolders = useMemo(() => {
    if (!plot.linkedSceneFolder || sceneFolders.includes(plot.linkedSceneFolder)) {
      return sceneFolders;
    }
    return [...sceneFolders, plot.linkedSceneFolder];
  }, [sceneFolders, plot.linkedSceneFolder]);

  const outOfFolderLinkedScenes = useMemo(() => {
    if (!plot.linkedSceneFolder) return [];
    const seen = new Set<string>();
    const list: SceneData[] = [];
    for (const c of sortedCards) {
      if (!c.linkedSceneId || seen.has(c.linkedSceneId)) continue;
      const s = scenes.find((sc) => sc.sceneId === c.linkedSceneId);
      if (s && (s.folder ?? '') !== plot.linkedSceneFolder) {
        seen.add(s.sceneId);
        list.push(s);
      }
    }
    return list;
  }, [plot.linkedSceneFolder, sortedCards, scenes]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<PlotViewMode>('timeline');
  const effectiveViewMode: PlotViewMode =
    compact && viewMode === 'chart' ? 'timeline' : viewMode;
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DragOverState | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [editingTimelineCards, setEditingTimelineCards] = useState<Record<string, boolean>>({});
  const [castPickerOpen, setCastPickerOpen] = useState<Record<string, boolean>>({});
  const [pendingReassign, setPendingReassign] = useState<PendingSceneReassign | null>(null);
  const [pendingMoveCard, setPendingMoveCard] = useState<PendingMoveCardState | null>(null);
  const [pendingBulkMoveOpen, setPendingBulkMoveOpen] = useState(false);

  // Plot JSON filename editing state
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(currentFilename);
  const [filenameError, setFilenameError] = useState<string | null>(null);

  useEffect(() => {
    setFilenameDraft(currentFilename);
    setEditingFilename(false);
    setFilenameError(null);
    setEditingTimelineCards({});
    setCastPickerOpen({});
    setPendingReassign(null);
    setPendingMoveCard(null);
    setPendingBulkMoveOpen(false);
  }, [plot.plotId, currentFilename]);

  useEffect(() => {
    if (!pendingReassign && !pendingMoveCard && !pendingBulkMoveOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingReassign(null);
        setPendingMoveCard(null);
        setPendingBulkMoveOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingReassign, pendingMoveCard, pendingBulkMoveOpen]);

  const plotsForLinkCheck = useMemo(
    () => (allPlots.length > 0 ? allPlots : [plot]),
    [allPlots, plot]
  );

  const sceneUsageMap = useMemo(() => {
    const map = new Map<string, SceneUsageEntry[]>();
    for (const p of plotsForLinkCheck) {
      const ordered = [...p.cards].sort((a, b) => a.order - b.order);
      for (const c of ordered) {
        if (!c.linkedSceneId) continue;
        const list = map.get(c.linkedSceneId) ?? [];
        list.push({
          plotId: p.plotId,
          plotTitle: p.title || '無題プロット',
          cardId: c.cardId,
          cardOrder: c.order,
          cardTitle: c.title || '無題カード',
        });
        map.set(c.linkedSceneId, list);
      }
    }
    return map;
  }, [plotsForLinkCheck]);

  const commitFilename = () => {
    const cleaned = filenameDraft.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!cleaned || cleaned === '.json') {
      setFilenameError('有効なファイル名を入力してください。');
      return;
    }
    const normalized = cleaned.toLowerCase().endsWith('.json')
      ? cleaned
      : `${cleaned}.json`;

    const conflict = allPlots.some(
      (p) =>
        p.plotId !== plot.plotId &&
        getPlotFilename(p).toLowerCase() === normalized.toLowerCase()
    );
    if (conflict) {
      setFilenameError('同じファイル名のプロットが既に存在します。');
      return;
    }

    setFilenameError(null);
    setEditingFilename(false);
    if (normalized !== currentFilename) {
      onUpdatePlot({ ...plot, filename: normalized });
    }
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify({ ...plot, filename: currentFilename }, null, 2);
    triggerDownload(currentFilename, payload, 'application/json;charset=utf-8');
  };

  const isDimmed = (vis: VisibilityType) => {
    if (!isAdult && vis === 'adult_only') return true;
    if (isAdult && vis === 'general_alt') return true;
    return false;
  };

  const updateCard = (cardId: string, patch: Partial<PlotCard>) => {
    onUpdatePlot({
      ...plot,
      cards: plot.cards.map((c) => (c.cardId === cardId ? { ...c, ...patch } : c)),
    });
  };

  const commitSceneAssignment = (targetCardId: string, nextSceneId: string) => {
    if (onAssignSceneToCard) {
      onAssignSceneToCard(plot.plotId, targetCardId, nextSceneId);
      return;
    }
    onUpdatePlot({
      ...plot,
      cards: plot.cards.map((c) => {
        if (c.cardId === targetCardId) {
          return { ...c, linkedSceneId: nextSceneId };
        }
        if (nextSceneId && c.linkedSceneId === nextSceneId) {
          return { ...c, linkedSceneId: '' };
        }
        return c;
      }),
    });
  };

  const handleRequestSceneLinkChange = (card: PlotCard, nextSceneId: string) => {
    if (nextSceneId === card.linkedSceneId) return;
    if (!nextSceneId) {
      commitSceneAssignment(card.cardId, '');
      return;
    }

    const conflicts = (sceneUsageMap.get(nextSceneId) ?? []).filter(
      (entry) => !(entry.plotId === plot.plotId && entry.cardId === card.cardId)
    );

    if (conflicts.length === 0) {
      commitSceneAssignment(card.cardId, nextSceneId);
      return;
    }

    const targetScene = scenes.find((s) => s.sceneId === nextSceneId);
    setPendingReassign({
      targetCardId: card.cardId,
      targetCardOrder: card.order,
      targetCardTitle: card.title || '無題カード',
      sceneId: nextSceneId,
      sceneTitle: targetScene?.title ?? nextSceneId,
      sceneFilename: targetScene?.filename ?? '',
      conflicts,
    });
  };

  const toggleCharacterOnCard = (card: PlotCard, charId: string) => {
    const current = card.characters ?? [];
    const next = current.includes(charId)
      ? current.filter((id) => id !== charId)
      : [...current, charId];
    updateCard(card.cardId, { characters: next });
  };

  const addCard = () => {
    const nextOrder = sortedCards.length > 0 ? sortedCards[sortedCards.length - 1].order + 1 : 1;
    const newCard: PlotCard = {
      cardId: `card_${Date.now().toString(36)}`,
      order: nextOrder,
      visibility: isAdult ? 'adult_only' : 'common',
      status: 'todo',
      title: `新規プロットカード ${nextOrder}`,
      memo: '',
      linkedSceneId: '',
      characters: [],
      povCharacterId: '',
      location: '',
      timeOfDay: '',
      mood: '',
      goal: '',
      foreshadowing: '',
      branchCondition: '',
      assetNotes: '',
    };
    onUpdatePlot({
      ...plot,
      cards: [...plot.cards, newCard],
    });
    if (effectiveViewMode === 'timeline') {
      setEditingTimelineCards((prev) => ({ ...prev, [newCard.cardId]: true }));
    }
  };

  const deleteCard = (cardId: string) => {
    const remaining = cleanupCardConnections(
      sortedCards.filter((c) => c.cardId !== cardId)
    ).map((c, idx) => ({ ...c, order: idx + 1 }));
    onUpdatePlot({ ...plot, cards: remaining });
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sortedCards.length) return;
    const copy = [...sortedCards];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    const reordered = reassignChartSlotsAfterListReorder(
      sortedCards,
      copy.map((c, idx) => ({ ...c, order: idx + 1 }))
    );
    onUpdatePlot({ ...plot, cards: reordered });
  };

  const reorderByDrop = (sourceCardId: string, targetCardId: string, side: DropSide) => {
    const fromIndex = sortedCards.findIndex((c) => c.cardId === sourceCardId);
    const hoverIndex = sortedCards.findIndex((c) => c.cardId === targetCardId);
    if (fromIndex === -1 || hoverIndex === -1 || fromIndex === hoverIndex) return;

    const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
    const insertAt = Math.max(
      0,
      Math.min(sortedCards.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
    );
    if (insertAt === fromIndex) return;

    const copy = [...sortedCards];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(insertAt, 0, moved);
    const reordered = reassignChartSlotsAfterListReorder(
      sortedCards,
      copy.map((c, idx) => ({ ...c, order: idx + 1 }))
    );
    onUpdatePlot({ ...plot, cards: reordered });
  };

  const detectMultiColumn = (): boolean => {
    if (compact || effectiveViewMode !== 'grid' || !listRef.current) return false;
    const cols = window.getComputedStyle(listRef.current).gridTemplateColumns;
    if (!cols || cols === 'none') return false;
    return cols.trim().split(/\s+/).length > 1;
  };

  const resetDragState = () => {
    setDraggingCardId(null);
    setDragOver(null);
  };

  const handleCardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isInteractive = Boolean(
      target.closest('input, textarea, select, button[data-no-drag], [data-no-drag="true"]')
    );
    e.currentTarget.draggable = !isInteractive;
  };

  const handleCardMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.draggable = false;
  };

  const handleCardDragStart = (e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    if (!e.currentTarget.draggable) {
      e.preventDefault();
      return;
    }
    setDraggingCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>, cardId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggingCardId || draggingCardId === cardId) {
      if (dragOver?.cardId === cardId) setDragOver(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const isMultiCol = detectMultiColumn();
    const side: DropSide = isMultiCol
      ? e.clientX < rect.left + rect.width / 2
        ? 'before'
        : 'after'
      : e.clientY < rect.top + rect.height / 2
        ? 'before'
        : 'after';

    if (
      dragOver?.cardId !== cardId ||
      dragOver.side !== side ||
      dragOver.isMultiCol !== isMultiCol
    ) {
      setDragOver({ cardId, side, isMultiCol });
    }
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>, targetCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggingCardId || e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetCardId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isMultiCol = detectMultiColumn();
      const side: DropSide =
        dragOver?.cardId === targetCardId
          ? dragOver.side
          : isMultiCol
            ? e.clientX < rect.left + rect.width / 2
              ? 'before'
              : 'after'
            : e.clientY < rect.top + rect.height / 2
              ? 'before'
              : 'after';
      reorderByDrop(sourceId, targetCardId, side);
    }
    e.currentTarget.draggable = false;
    resetDragState();
  };

  const handleCardDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.draggable = false;
    resetDragState();
  };

  const handleContainerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingCardId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingCardId) return;
    e.preventDefault();
    if (dragOver && draggingCardId !== dragOver.cardId) {
      reorderByDrop(draggingCardId, dragOver.cardId, dragOver.side);
    }
    resetDragState();
  };

  const plotSummary = useMemo(() => {
    let doneCount = 0;
    let stagingCount = 0;
    let totalCurrentChars = 0;
    let totalTargetChars = 0;
    for (const c of sortedCards) {
      if (c.status === 'done') doneCount++;
      if (c.inStaging) stagingCount++;
      if (c.targetLength && c.targetLength > 0) totalTargetChars += c.targetLength;
      if (c.linkedSceneId) {
        const sc = scenes.find((s) => s.sceneId === c.linkedSceneId);
        if (sc) totalCurrentChars += sc.body.length;
      }
    }
    return { doneCount, stagingCount, totalCurrentChars, totalTargetChars };
  }, [sortedCards, scenes]);

  const allExpanded =
    sortedCards.length > 0 &&
    (effectiveViewMode === 'timeline'
      ? sortedCards.every((c) => Boolean(editingTimelineCards[c.cardId]))
      : sortedCards.every((c) => Boolean(expandedDetails[c.cardId])));

  const toggleAllDetails = () => {
    const nextVal = !allExpanded;
    const nextState: Record<string, boolean> = {};
    for (const c of sortedCards) {
      nextState[c.cardId] = nextVal;
    }
    if (effectiveViewMode === 'timeline') {
      setEditingTimelineCards(nextState);
    } else {
      setExpandedDetails(nextState);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50/40">
      <datalist id="plot-timeofday-presets">
        <option value="朝" />
        <option value="昼" />
        <option value="放課後 / 夕方" />
        <option value="夜" />
        <option value="深夜" />
      </datalist>
      <datalist id="plot-mood-presets">
        <option value="日常" />
        <option value="コメディ" />
        <option value="穏やか・少し甘い" />
        <option value="シリアス" />
        <option value="緊迫" />
        <option value="切ない" />
        <option value="親密・背徳" />
      </datalist>

      <div className="border-b border-slate-200 bg-white px-4 py-2.5 space-y-2">
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-code text-slate-400">plots/</span>
              {editingFilename ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={filenameDraft}
                    onChange={(e) => {
                      setFilenameDraft(e.target.value);
                      setFilenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitFilename();
                      if (e.key === 'Escape') {
                        setFilenameDraft(currentFilename);
                        setFilenameError(null);
                        setEditingFilename(false);
                      }
                    }}
                    autoFocus
                    aria-label="プロットJSONファイル名"
                    className="w-44 rounded border border-slate-300 bg-white px-2 py-0.5 font-code text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitFilename}
                    title="ファイル名を確定"
                    className="rounded border border-slate-200 bg-slate-800 p-1 text-white hover:bg-slate-900"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilenameDraft(currentFilename);
                      setFilenameError(null);
                      setEditingFilename(false);
                    }}
                    title="キャンセル"
                    className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFilenameDraft(currentFilename);
                    setEditingFilename(true);
                  }}
                  title="クリックしてJSONファイル名を変更"
                  className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-code text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span>{currentFilename}</span>
                  <Pencil className="h-3 w-3 text-slate-400 group-hover:text-slate-700" />
                </button>
              )}
              <span aria-hidden="true">·</span>
              <select
                value={plot.scope ?? 'chapter'}
                aria-label="プロット種別"
                onChange={(e) =>
                  onUpdatePlot({ ...plot, scope: e.target.value as PlotScope })
                }
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                {SCOPE_LABELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    種別: {opt.label}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">·</span>
              <label
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700"
                title="このプロットと連携する scenes/ フォルダ"
              >
                <Folder className="h-3 w-3 shrink-0 text-slate-400" />
                <select
                  value={plot.linkedSceneFolder ?? ''}
                  aria-label="連携シーンフォルダ"
                  onChange={(e) =>
                    onUpdatePlot({
                      ...plot,
                      linkedSceneFolder: e.target.value || undefined,
                    })
                  }
                  className="max-w-[160px] bg-transparent text-[11px] font-medium text-slate-700 focus:outline-none"
                >
                  <option value="">連携フォルダ: なし</option>
                  {selectableSceneFolders.map((folder) => (
                    <option key={folder} value={folder}>
                      連携: {folder}/
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={handleDownloadJson}
              title={`${currentFilename} をダウンロード保存`}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON保存</span>
            </button>
          </div>
        )}

        {filenameError && (
          <p className="text-[11px] font-medium text-rose-600">{filenameError}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {compact && allPlots.length > 1 && onSelectSplitPlot ? (
              <div className="flex items-center gap-1.5">
                <select
                  value={plot.plotId}
                  onChange={(e) => onSelectSplitPlot(e.target.value)}
                  aria-label="スプリットビュー表示プロットを選択"
                  className="w-full max-w-[260px] rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-900 focus:border-slate-400 focus:outline-none"
                >
                  {allPlots.map((p) => (
                    <option key={p.plotId} value={p.plotId}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input
                type="text"
                value={plot.title}
                onChange={(e) => onUpdatePlot({ ...plot, title: e.target.value })}
                aria-label="プロットタイトル"
                placeholder="プロットタイトル"
                className="w-full rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:bg-slate-50 focus:outline-none"
              />
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[11px] text-slate-500 tabular-nums">
              <span>箱書き {sortedCards.length}枚</span>
              {plotSummary.stagingCount > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span>うち未配置 {plotSummary.stagingCount}枚</span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>
                完了 {plotSummary.doneCount}/{sortedCards.length}
              </span>
              {plotSummary.totalCurrentChars > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span>
                    本文計 {plotSummary.totalCurrentChars.toLocaleString()}字
                    {plotSummary.totalTargetChars > 0
                      ? ` / 目標 ${plotSummary.totalTargetChars.toLocaleString()}字`
                      : ''}
                  </span>
                </>
              )}
              {compact && plot.linkedSceneFolder && (
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0 text-[10px] font-medium text-slate-600">
                  <Folder className="h-2.5 w-2.5 text-slate-400" />
                  <span>{plot.linkedSceneFolder}/</span>
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* View Mode Toggle: Timeline / Chart / Grid */}
            <div
              role="group"
              aria-label="プロット表示形式切替"
              className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                title="時系列で物語の流れを俯瞰する1列スリム表示"
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  effectiveViewMode === 'timeline'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>{compact ? '一覧' : '箱書きタイムライン'}</span>
              </button>
              {!compact && (
                <button
                  type="button"
                  onClick={() => setViewMode('chart')}
                  title="2Dフリーキャンバス上でカードをドラッグ配置・矢印結線して展開を思考する表示"
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    effectiveViewMode === 'chart'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  <span>タイムラインチャート</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="カード内で各項目を直接編集する表示"
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  effectiveViewMode === 'grid'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>{compact ? '詳細' : '詳細編集カード'}</span>
              </button>
            </div>

            {sortedCards.length > 0 && effectiveViewMode !== 'chart' && (
              <button
                type="button"
                onClick={toggleAllDetails}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {effectiveViewMode === 'timeline'
                  ? allExpanded
                    ? '編集をすべて閉じる'
                    : 'すべて編集展開'
                  : allExpanded
                    ? '詳細をすべて閉じる'
                    : '詳細をすべて開く'}
              </button>
            )}
            <button
              type="button"
              onClick={addCard}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>カード追加</span>
            </button>
          </div>
        </div>

        {plot.linkedSceneFolder &&
          outOfFolderLinkedScenes.length > 0 &&
          onMoveScenesToFolder && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-900">
              <span className="min-w-0 truncate">
                連携フォルダ外（別フォルダまたは直下）の紐付けシーンが{' '}
                <strong className="font-semibold">{outOfFolderLinkedScenes.length}件</strong>{' '}
                あります
              </span>
              <button
                type="button"
                onClick={() => setPendingBulkMoveOpen(true)}
                className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100/70 shrink-0"
              >
                <FolderInput className="h-3 w-3" />
                <span>「{plot.linkedSceneFolder}/」へ一括移動</span>
              </button>
            </div>
          )}
      </div>

      {effectiveViewMode === 'chart' ? (
        <PlotFlowChart
          plot={plot}
          scenes={scenes}
          characters={characters}
          activeMode={activeMode}
          sceneUsageMap={sceneUsageMap}
          hasOtherPlots={Boolean(onMoveCardToPlot && otherPlots.length > 0)}
          onUpdatePlot={onUpdatePlot}
          onRequestSceneLinkChange={handleRequestSceneLinkChange}
          onCreateSceneAndLink={onCreateSceneAndLink}
          onOpenScene={onOpenScene}
          onRequestMoveCardToOtherPlot={
            onMoveCardToPlot && otherPlots.length > 0
              ? (card) =>
                  setPendingMoveCard({
                    card,
                    targetPlotId: otherPlots[0].plotId,
                    position: 'end',
                    openTargetPlot: false,
                    moveLinkedSceneToTargetFolder: true,
                  })
              : undefined
          }
          onDeleteCard={deleteCard}
        />
      ) : (
      <div
        ref={listRef}
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
        className={`flex-1 overflow-y-auto p-4 ${
          effectiveViewMode === 'timeline'
            ? compact
              ? 'space-y-2.5'
              : 'mx-auto w-full max-w-4xl space-y-2.5'
            : compact
              ? 'space-y-3'
              : 'grid grid-cols-1 md:grid-cols-2 gap-4 content-start'
        }`}
      >
        {sortedCards.map((card, index) => {
          const dimmed = isDimmed(card.visibility);
          const linkedScene = scenes.find((s) => s.sceneId === card.linkedSceneId);
          const isDragging = draggingCardId === card.cardId;
          const isDropTarget = dragOver?.cardId === card.cardId && !isDragging;
          const dropSide = isDropTarget ? dragOver.side : null;
          const isMultiCol = isDropTarget ? dragOver.isMultiCol : false;
          const isDetailOpen = Boolean(expandedDetails[card.cardId]);
          const isTimelineEditing = Boolean(editingTimelineCards[card.cardId]);
          const isCastOpen = Boolean(castPickerOpen[card.cardId]);

          const statusVal: PlotCardStatus = card.status ?? 'todo';
          const statusMeta = STATUS_META.find((s) => s.value === statusVal) ?? STATUS_META[0];
          const visMeta = VISIBILITY_META[card.visibility] ?? VISIBILITY_META.common;
          const cardCharIds = card.characters ?? [];
          const selectedCharacters = characters.filter((ch) => cardCharIds.includes(ch.id));
          const povLabel =
            card.povCharacterId === 'third_person'
              ? '三人称'
              : card.povCharacterId
                ? characters.find((ch) => ch.id === card.povCharacterId)?.shortName ?? ''
                : '';

          const detailFilledCount = [
            card.goal,
            card.branchCondition,
            card.foreshadowing,
            card.assetNotes,
            card.targetLength ? String(card.targetLength) : '',
          ].filter((v) => Boolean(v && v.trim())).length;

          const currentSceneLength = linkedScene ? linkedScene.body.length : 0;
          const targetLength = card.targetLength ?? 0;
          const progressPct =
            linkedScene && targetLength > 0
              ? Math.min(100, Math.round((currentSceneLength / targetLength) * 100))
              : 0;

          const keyTakeaways = [
            card.goal?.trim()
              ? { key: 'goal', label: 'ゴール', text: card.goal.trim(), Icon: Target }
              : null,
            card.branchCondition?.trim()
              ? {
                  key: 'branch',
                  label: '分岐',
                  text: card.branchCondition.trim(),
                  Icon: GitBranch,
                }
              : null,
            card.foreshadowing?.trim()
              ? {
                  key: 'foreshadowing',
                  label: '伏線',
                  text: card.foreshadowing.trim(),
                  Icon: Bookmark,
                }
              : null,
            card.assetNotes?.trim()
              ? {
                  key: 'assets',
                  label: '演出',
                  text: card.assetNotes.trim(),
                  Icon: Clapperboard,
                }
              : null,
          ].filter((item): item is NonNullable<typeof item> => item !== null);

          const hasContextMeta = Boolean(
            card.location?.trim() ||
              card.timeOfDay?.trim() ||
              povLabel ||
              card.mood?.trim() ||
              selectedCharacters.length > 0
          );

          // Shared progress strip rendered whenever targetLength > 0
          const renderProgressStrip = () => {
            if (targetLength <= 0) return null;
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                  <span>
                    {linkedScene ? '執筆ボリューム進捗' : '目標文字数（シーン未紐付け）'}
                  </span>
                  <span className="font-code font-medium text-slate-700">
                    {linkedScene
                      ? `${currentSceneLength.toLocaleString()} / ${targetLength.toLocaleString()}字 (${progressPct}%)`
                      : `目標 ${targetLength.toLocaleString()}字`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all ${
                      progressPct >= 100
                        ? 'bg-emerald-600'
                        : isAdult
                          ? 'bg-rose-600'
                          : 'bg-slate-700'
                    }`}
                    style={{ width: `${linkedScene ? progressPct : 0}%` }}
                  />
                </div>
              </div>
            );
          };

          // Shared always-visible preview of filled goal/branch/foreshadowing/assets
          const renderKeyTakeawaysPreview = () => {
            if (keyTakeaways.length === 0) return null;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {keyTakeaways.map(({ key, label, text, Icon }) => (
                  <div
                    key={key}
                    className="flex items-start gap-1.5 rounded border border-slate-200/70 bg-slate-50/70 px-2 py-1 text-[11px] leading-snug"
                  >
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <span className="mr-1 font-medium text-slate-500">{label}:</span>
                      <span className="text-slate-700 break-words">{text}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          };

          // Shared full detail fields form (goal, branchCondition, targetLength, foreshadowing, assetNotes)
          const renderDetailFormFields = () => (
            <div className="space-y-2 rounded-md border border-slate-200/80 bg-slate-50/50 p-2.5">
              <label className="block space-y-0.5">
                <span className="text-[10px] font-medium text-slate-500">
                  シーンの目的 / ゴール
                </span>
                <input
                  type="text"
                  value={card.goal ?? ''}
                  onChange={(e) => updateCard(card.cardId, { goal: e.target.value })}
                  placeholder="このシーンを終えて変化すること"
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                />
              </label>

              <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-medium text-slate-500">
                    分岐条件 / ルート
                  </span>
                  <input
                    type="text"
                    value={card.branchCondition ?? ''}
                    onChange={(e) =>
                      updateCard(card.cardId, { branchCondition: e.target.value })
                    }
                    placeholder="例: 栞ルート / 好感度5以上"
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                </label>

                <label className="block space-y-0.5">
                  <span className="text-[10px] font-medium text-slate-500">
                    想定文字数（目安）
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={card.targetLength ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateCard(card.cardId, {
                          targetLength: raw === '' ? undefined : Math.max(0, Number(raw)),
                        });
                      }}
                      placeholder="1500"
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 tabular-nums focus:border-slate-400 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-500 shrink-0">字</span>
                  </div>
                </label>
              </div>

              <label className="block space-y-0.5">
                <span className="text-[10px] font-medium text-slate-500">伏線・回収メモ</span>
                <textarea
                  rows={2}
                  value={card.foreshadowing ?? ''}
                  onChange={(e) => updateCard(card.cardId, { foreshadowing: e.target.value })}
                  placeholder="張る伏線・回収する伏線など"
                  className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                />
              </label>

              <label className="block space-y-0.5">
                <span className="text-[10px] font-medium text-slate-500">
                  素材・演出メモ（立ち絵 / スチル / BGM・SE）
                </span>
                <textarea
                  rows={2}
                  value={card.assetNotes ?? ''}
                  onChange={(e) => updateCard(card.cardId, { assetNotes: e.target.value })}
                  placeholder="例: 背景(夕方)、立ち絵差分(照れ)、BGM(静かなピアノ)"
                  className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                />
              </label>
            </div>
          );

          // Shared scene link footer
          const renderSceneLinkFooter = () => (
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <SceneLinkCombobox
                card={card}
                plotId={plot.plotId}
                scenes={scenes}
                sceneUsageMap={sceneUsageMap}
                linkedSceneFolder={plot.linkedSceneFolder}
                isAdult={isAdult}
                onSelectScene={(sceneId) => handleRequestSceneLinkChange(card, sceneId)}
                onCreateAndLinkScene={
                  plot.linkedSceneFolder && onCreateSceneAndLink
                    ? () => onCreateSceneAndLink(plot.plotId, card.cardId)
                    : undefined
                }
              />

              {plot.linkedSceneFolder && !card.linkedSceneId && onCreateSceneAndLink && (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={() => onCreateSceneAndLink(plot.plotId, card.cardId)}
                  title={`連携フォルダ「${plot.linkedSceneFolder}/」に新規シーンを作成して即紐付け`}
                  className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    isAdult
                      ? 'border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  <span>新規作成</span>
                </button>
              )}

              {linkedScene && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-code text-[10px] text-slate-400 tabular-nums">
                    {currentSceneLength.toLocaleString()}字
                  </span>
                  <button
                    type="button"
                    data-no-drag="true"
                    onClick={() => onOpenScene(linkedScene.sceneId)}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      isAdult
                        ? 'text-rose-700 hover:bg-rose-50'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>本文を開く</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );

          // Shared compact cast selector (selected badges + toggle button for unselected characters)
          const renderCastEditor = () => {
            if (characters.length === 0) return null;
            const unselectedChars = characters.filter((ch) => !cardCharIds.includes(ch.id));
            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-0.5 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                    <Users className="h-3 w-3" />
                    <span>登場:</span>
                  </span>
                  {selectedCharacters.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      data-no-drag="true"
                      onClick={() => toggleCharacterOnCard(card, ch.id)}
                      title={`${ch.common.name} を登場キャラから外す`}
                      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        isAdult
                          ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                          : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      <span>{ch.shortName}</span>
                      <X className="h-2.5 w-2.5 opacity-70" />
                    </button>
                  ))}
                  {unselectedChars.length > 0 && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={() =>
                        setCastPickerOpen((prev) => ({
                          ...prev,
                          [card.cardId]: !prev[card.cardId],
                        }))
                      }
                      className="inline-flex items-center gap-0.5 rounded border border-dashed border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      <span>
                        {isCastOpen
                          ? '選択を閉じる'
                          : selectedCharacters.length === 0
                            ? '登場キャラを選択'
                            : '追加'}
                      </span>
                    </button>
                  )}
                </div>

                {isCastOpen && unselectedChars.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 rounded border border-slate-200/80 bg-slate-50/70 p-1.5">
                    {unselectedChars.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        data-no-drag="true"
                        onClick={() => toggleCharacterOnCard(card, ch.id)}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors whitespace-nowrap"
                      >
                        + {ch.shortName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          };

          // Shared card reorder/move/delete toolbar buttons
          const renderCardActionButtons = (includeTimelineEditBtn = false) => (
            <div className="flex items-center gap-0.5 shrink-0">
              {includeTimelineEditBtn && (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={() =>
                    setEditingTimelineCards((prev) => ({
                      ...prev,
                      [card.cardId]: !prev[card.cardId],
                    }))
                  }
                  className={`mr-1 flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    isTimelineEditing
                      ? isAdult
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-slate-700 bg-slate-800 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {isTimelineEditing ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>編集完了</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3 w-3" />
                      <span>編集</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                data-no-drag="true"
                disabled={index === 0}
                onClick={() => moveCard(index, -1)}
                title="上へ移動"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-no-drag="true"
                disabled={index === sortedCards.length - 1}
                onClick={() => moveCard(index, 1)}
                title="下へ移動"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {onMoveCardToPlot && otherPlots.length > 0 && (
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={() =>
                    setPendingMoveCard({
                      card,
                      targetPlotId: otherPlots[0].plotId,
                      position: 'end',
                      openTargetPlot: false,
                      moveLinkedSceneToTargetFolder: true,
                    })
                  }
                  title="別のプロットへ移動"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                data-no-drag="true"
                onClick={() => deleteCard(card.cardId)}
                title="カードを削除"
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );

          const cardBaseClasses = `relative rounded-lg border border-l-4 bg-white transition-all duration-150 ${
            visMeta.accentBorder
          } ${
            isDragging
              ? 'opacity-40 border-dashed border-slate-400 bg-slate-50 scale-[0.99]'
              : isDropTarget
                ? isAdult
                  ? 'border-rose-500 ring-2 ring-rose-500/20'
                  : 'border-slate-700 ring-2 ring-slate-800/15'
                : dimmed
                  ? 'opacity-45 border-slate-200'
                  : 'opacity-100 border-slate-200 hover:border-slate-300'
          }`;

          return (
            <div
              key={card.cardId}
              onMouseDown={handleCardMouseDown}
              onMouseUp={handleCardMouseUp}
              onDragStart={(e) => handleCardDragStart(e, card.cardId)}
              onDragOver={(e) => handleCardDragOver(e, card.cardId)}
              onDrop={(e) => handleCardDrop(e, card.cardId)}
              onDragEnd={handleCardDragEnd}
              className={`${cardBaseClasses} ${
                effectiveViewMode === 'timeline' ? 'px-3.5 py-3' : 'p-3.5'
              }`}
            >
              {isDropTarget && dropSide && (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-10 rounded-full ${
                    isAdult ? 'bg-rose-600' : 'bg-slate-800'
                  } ${
                    isMultiCol
                      ? dropSide === 'before'
                        ? '-left-2 top-2 bottom-2 w-1'
                        : '-right-2 top-2 bottom-2 w-1'
                      : dropSide === 'before'
                        ? 'left-2 right-2 -top-2 h-1'
                        : 'left-2 right-2 -bottom-2 h-1'
                  }`}
                />
              )}

              {/* VIEW MODE 1: Scenario Timeline (Scannable overview + inline edit toggle) */}
              {effectiveViewMode === 'timeline' && !isTimelineEditing ? (
                <div className="space-y-2">
                  {/* Top Row: Grip + Order + Title + Status + Visibility + Actions */}
                  <div className="flex flex-wrap items-start justify-between gap-2 cursor-grab active:cursor-grabbing">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span
                        title="ドラッグして並び替え"
                        className="inline-flex items-center text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-code text-xs font-bold text-slate-400 tabular-nums shrink-0">
                        #{String(card.order).padStart(2, '0')}
                      </span>
                      {card.inStaging && (
                        <span
                          title="タイムラインチャートのアイデア置き場に退避中"
                          className="text-[10px] font-medium text-amber-700"
                        >
                          [未配置]
                        </span>
                      )}
                      <h3 className="text-[14px] font-bold leading-snug text-slate-900 break-words">
                        {card.title || '無題プロットカード'}
                      </h3>
                      <select
                        value={statusVal}
                        aria-label="執筆ステータス"
                        onChange={(e) =>
                          updateCard(card.cardId, { status: e.target.value as PlotCardStatus })
                        }
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium focus:outline-none ${statusMeta.style}`}
                      >
                        {STATUS_META.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${visMeta.badgeStyle}`}
                      >
                        {visMeta.shortLabel}
                      </span>
                    </div>

                    {renderCardActionButtons(true)}
                  </div>

                  {/* Scene Context & Cast Summary Line */}
                  {hasContextMeta && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      {card.location?.trim() && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{card.location.trim()}</span>
                        </span>
                      )}
                      {card.timeOfDay?.trim() && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{card.timeOfDay.trim()}</span>
                        </span>
                      )}
                      {povLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>視点: {povLabel}</span>
                        </span>
                      )}
                      {card.mood?.trim() && (
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{card.mood.trim()}</span>
                        </span>
                      )}
                      {selectedCharacters.length > 0 && (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <Users className="h-3 w-3 text-slate-400 shrink-0" />
                          {selectedCharacters.map((ch) => (
                            <span
                              key={ch.id}
                              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-700"
                            >
                              {ch.shortName}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Narrative Beat Memo */}
                  {card.memo.trim() ? (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                      {card.memo}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      展開メモ未入力（「編集」から詳細を入力できます）
                    </p>
                  )}

                  {/* Always-Visible Goal / Branch / Foreshadowing / Assets Takeaways */}
                  {renderKeyTakeawaysPreview()}

                  {/* Always-Visible Progress Bar (when targetLength > 0) */}
                  {renderProgressStrip()}

                  {/* Compact Footer: Linked Scene Info + Quick Open / Quick Create */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="min-w-0 flex-1 text-[11px] text-slate-500">
                      {linkedScene ? (
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <span className="font-medium text-slate-700 truncate">
                            {linkedScene.title}
                          </span>
                          <span className="font-code text-[10px] text-slate-400 truncate">
                            {linkedScene.folder
                              ? `${linkedScene.folder}/${linkedScene.filename}`
                              : linkedScene.filename}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">シーン未紐付け</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!linkedScene &&
                        plot.linkedSceneFolder &&
                        onCreateSceneAndLink && (
                          <button
                            type="button"
                            data-no-drag="true"
                            onClick={() => onCreateSceneAndLink(plot.plotId, card.cardId)}
                            title={`連携フォルダ「${plot.linkedSceneFolder}/」に新規シーンを作成して即紐付け`}
                            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                              isAdult
                                ? 'border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <FilePlus2 className="h-3 w-3" />
                            <span>連携フォルダに新規作成</span>
                          </button>
                        )}
                      {linkedScene && (
                        <>
                          <span className="font-code text-[10px] text-slate-400 tabular-nums">
                            {currentSceneLength.toLocaleString()}字
                          </span>
                          <button
                            type="button"
                            data-no-drag="true"
                            onClick={() => onOpenScene(linkedScene.sceneId)}
                            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                              isAdult
                                ? 'border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>本文を開く</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* VIEW MODE 2: Grid Edit Card OR Timeline Inline-Edit Expanded */
                <div>
                  {/* Card Header (Drag Handle + Order + Status + Visibility + Reorder/Delete) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 cursor-grab active:cursor-grabbing">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span
                        title="ドラッグして並び替え"
                        className="inline-flex items-center text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-code font-bold text-slate-700 tabular-nums">
                        #{String(card.order).padStart(2, '0')}
                      </span>
                      {card.inStaging && (
                        <span
                          title="タイムラインチャートのアイデア置き場に退避中"
                          className="text-[10px] font-medium text-amber-700"
                        >
                          [未配置]
                        </span>
                      )}

                      <select
                        value={statusVal}
                        aria-label="執筆ステータス"
                        onChange={(e) =>
                          updateCard(card.cardId, { status: e.target.value as PlotCardStatus })
                        }
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none ${statusMeta.style}`}
                      >
                        {STATUS_META.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={card.visibility}
                        aria-label="公開範囲"
                        onChange={(e) =>
                          updateCard(card.cardId, {
                            visibility: e.target.value as VisibilityType,
                          })
                        }
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none ${visMeta.badgeStyle}`}
                      >
                        <option value="common">共通 (common)</option>
                        <option value="general_alt">一般差替 (general_alt)</option>
                        <option value="adult_only">R18専用 (adult_only)</option>
                      </select>
                    </div>

                    {renderCardActionButtons(effectiveViewMode === 'timeline')}
                  </div>

                  {/* Title */}
                  <input
                    type="text"
                    value={card.title}
                    onChange={(e) => updateCard(card.cardId, { title: e.target.value })}
                    placeholder="箱書きタイトル"
                    className="mt-2.5 w-full rounded border border-transparent px-1.5 py-1 text-[15px] font-bold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:bg-slate-50/50 focus:outline-none"
                  />

                  {/* Icon-Labeled Scene Context Inputs (Location, Time, POV, Mood) */}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="relative flex items-center">
                      <MapPin className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                      <input
                        type="text"
                        value={card.location ?? ''}
                        onChange={(e) => updateCard(card.cardId, { location: e.target.value })}
                        placeholder="場所（例: 図書室）"
                        title="場所・背景"
                        className="w-full rounded border border-slate-200/80 bg-slate-50/40 py-1 pl-6 pr-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="relative flex items-center">
                      <Clock className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                      <input
                        type="text"
                        list="plot-timeofday-presets"
                        value={card.timeOfDay ?? ''}
                        onChange={(e) => updateCard(card.cardId, { timeOfDay: e.target.value })}
                        placeholder="時間帯（例: 夕方）"
                        title="時間帯・季節"
                        className="w-full rounded border border-slate-200/80 bg-slate-50/40 py-1 pl-6 pr-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div className="relative flex items-center">
                      <Eye className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                      <select
                        value={card.povCharacterId ?? ''}
                        onChange={(e) =>
                          updateCard(card.cardId, { povCharacterId: e.target.value })
                        }
                        title="視点キャラ (POV)"
                        className="w-full rounded border border-slate-200/80 bg-slate-50/40 py-1 pl-6 pr-2 text-[11px] text-slate-700 focus:border-slate-300 focus:bg-white focus:outline-none"
                      >
                        <option value="">視点: 未指定</option>
                        {characters.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            視点: {ch.shortName}
                          </option>
                        ))}
                        <option value="third_person">視点: 三人称（神視点）</option>
                      </select>
                    </div>
                    <div className="relative flex items-center">
                      <Sparkles className="pointer-events-none absolute left-2 h-3 w-3 text-slate-400" />
                      <input
                        type="text"
                        list="plot-mood-presets"
                        value={card.mood ?? ''}
                        onChange={(e) => updateCard(card.cardId, { mood: e.target.value })}
                        placeholder="トーン（例: 穏やか）"
                        title="感情の起伏・トーン"
                        className="w-full rounded border border-slate-200/80 bg-slate-50/40 py-1 pl-6 pr-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Compact Cast Selector (Selected chips + Expandable picker) */}
                  {characters.length > 0 && <div className="mt-2">{renderCastEditor()}</div>}

                  {/* Main Plot Memo */}
                  <textarea
                    value={card.memo}
                    onChange={(e) => updateCard(card.cardId, { memo: e.target.value })}
                    rows={3}
                    placeholder="展開メモ・狙いなど..."
                    className="mt-2 w-full resize-none rounded border border-slate-200/70 bg-slate-50/50 px-2.5 py-2 text-xs leading-relaxed text-slate-700 focus:border-slate-300 focus:bg-white focus:outline-none"
                  />

                  {/* Always-Visible Key Takeaways Preview when Detail Accordion is Closed in Grid View */}
                  {effectiveViewMode === 'grid' && !isDetailOpen && keyTakeaways.length > 0 && (
                    <div className="mt-2">{renderKeyTakeawaysPreview()}</div>
                  )}

                  {/* Always-Visible Progress Bar (when targetLength > 0) */}
                  {targetLength > 0 && <div className="mt-2">{renderProgressStrip()}</div>}

                  {/* Detail Section: Always open in Timeline Inline Edit; Collapsible in Grid View */}
                  {effectiveViewMode === 'timeline' ? (
                    <div className="mt-2.5">{renderDetailFormFields()}</div>
                  ) : (
                    <div className="mt-2">
                      <button
                        type="button"
                        data-no-drag="true"
                        onClick={() =>
                          setExpandedDetails((prev) => ({
                            ...prev,
                            [card.cardId]: !prev[card.cardId],
                          }))
                        }
                        className="flex w-full items-center justify-between rounded border border-slate-200/80 bg-slate-50/70 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100/80 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          {isDetailOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          <span>構成・演出・目標文字数を編集</span>
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {detailFilledCount > 0 ? `${detailFilledCount}/5 入力済` : '未入力'}
                        </span>
                      </button>

                      {isDetailOpen && <div className="mt-2">{renderDetailFormFields()}</div>}
                    </div>
                  )}

                  {/* Footer: Linked Scene, Quick Create & Jump Button */}
                  <div className="mt-2.5 border-t border-slate-100 pt-2">
                    {renderSceneLinkFooter()}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sortedCards.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">箱書きカードがまだありません</p>
            <p className="mt-1 text-xs text-slate-500">
              「カード追加」からシーン構成のメモを作成できます。
            </p>
          </div>
        )}
      </div>
      )}

      {pendingReassign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingReassign(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-scene-dialog-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <h2
                    id="reassign-scene-dialog-title"
                    className="text-sm font-semibold text-slate-900"
                  >
                    シーン紐付けの変更確認
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    同一シーンを複数カードへ同時に紐付けることはできません
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingReassign(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-xs text-slate-700">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-medium text-slate-500">選択したシーン</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  {pendingReassign.sceneTitle}
                  {pendingReassign.sceneFilename && (
                    <span className="ml-1.5 font-code text-[11px] font-normal text-slate-500">
                      ({pendingReassign.sceneFilename})
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-600">
                  現在の紐付け先（解除されます）
                </div>
                <ul className="space-y-1">
                  {pendingReassign.conflicts.map((c) => (
                    <li
                      key={`${c.plotId}:${c.cardId}`}
                      className="rounded border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-950"
                    >
                      <span className="text-[11px] text-amber-800">
                        {c.plotId === plot.plotId ? '現在のプロット' : c.plotTitle}
                      </span>
                      <span className="mx-1 text-amber-600">/</span>
                      <span className="font-code font-semibold">
                        #{String(c.cardOrder).padStart(2, '0')}
                      </span>{' '}
                      <span className="font-medium">{c.cardTitle}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-600">
                  新しい紐付け先
                </div>
                <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900">
                  <span className="text-[11px] text-slate-500">現在のプロット</span>
                  <span className="mx-1 text-slate-400">/</span>
                  <span className="font-code font-semibold">
                    #{String(pendingReassign.targetCardOrder).padStart(2, '0')}
                  </span>{' '}
                  <span className="font-medium">{pendingReassign.targetCardTitle}</span>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                「紐付けを変更する」を選ぶと、元のカードのシーン紐付けを未紐付けに戻し、このカードへ変更します。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
              <button
                type="button"
                onClick={() => setPendingReassign(null)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  commitSceneAssignment(pendingReassign.targetCardId, pendingReassign.sceneId);
                  setPendingReassign(null);
                }}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span>紐付けを変更する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMoveCard && otherPlots.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingMoveCard(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!onMoveCardToPlot) return;
              onMoveCardToPlot(
                plot.plotId,
                pendingMoveCard.targetPlotId,
                pendingMoveCard.card.cardId,
                {
                  position: pendingMoveCard.position,
                  openTargetPlot: pendingMoveCard.openTargetPlot,
                  moveLinkedSceneToTargetFolder: pendingMoveCard.moveLinkedSceneToTargetFolder,
                }
              );
              setPendingMoveCard(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-plot-card-dialog-title"
            className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FolderInput className="h-4 w-4 text-slate-700 shrink-0" />
                <div>
                  <h2
                    id="move-plot-card-dialog-title"
                    className="text-sm font-semibold text-slate-900"
                  >
                    プロットカードを別プロットへ移動
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    移動元: {plot.title} ({currentFilename})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingMoveCard(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs text-slate-700">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-medium text-slate-500">移動するカード</div>
                <div className="mt-0.5 font-semibold text-slate-900">
                  <span className="font-code text-slate-600">
                    #{String(pendingMoveCard.card.order).padStart(2, '0')}
                  </span>{' '}
                  {pendingMoveCard.card.title || '無題カード'}
                </div>
                {(() => {
                  const linked = scenes.find(
                    (s) => s.sceneId === pendingMoveCard.card.linkedSceneId
                  );
                  if (!linked) return null;
                  return (
                    <div className="mt-1 text-[11px] text-slate-500">
                      紐付けシーン:{' '}
                      {linked.folder && (
                        <span className="mr-1 rounded bg-slate-200/70 px-1 py-0 text-[10px] text-slate-700">
                          {linked.folder}/
                        </span>
                      )}
                      <span className="font-medium text-slate-700">{linked.title}</span>{' '}
                      <span className="font-code text-[10px]">({linked.filename})</span>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-slate-700">
                  移動先プロット（plots/*.json）
                </span>
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                  {otherPlots.map((p) => {
                    const active = pendingMoveCard.targetPlotId === p.plotId;
                    const scopeLabel =
                      SCOPE_LABELS.find((s) => s.value === (p.scope ?? 'chapter'))?.label ?? '章ごと';
                    return (
                      <label
                        key={p.plotId}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
                          active
                            ? isAdult
                              ? 'border-rose-400 bg-rose-50/70'
                              : 'border-slate-800 bg-slate-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50/70'
                        }`}
                      >
                        <input
                          type="radio"
                          name="move-card-target-plot"
                          checked={active}
                          onChange={() =>
                            setPendingMoveCard((prev) =>
                              prev ? { ...prev, targetPlotId: p.plotId } : prev
                            )
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-900">
                            {p.title || '無題プロット'}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span>{scopeLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-code">{getPlotFilename(p)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{p.cards.length}枚</span>
                            {p.linkedSceneFolder && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0 text-slate-600">
                                  <Folder className="h-2.5 w-2.5 text-slate-400" />
                                  <span>{p.linkedSceneFolder}/</span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-slate-700">
                  移動先での挿入位置
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingMoveCard((prev) => (prev ? { ...prev, position: 'end' } : prev))
                    }
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      pendingMoveCard.position === 'end'
                        ? isAdult
                          ? 'border-rose-700 bg-rose-700 text-white'
                          : 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    末尾に追加
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingMoveCard((prev) => (prev ? { ...prev, position: 'start' } : prev))
                    }
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      pendingMoveCard.position === 'start'
                        ? isAdult
                          ? 'border-rose-700 bg-rose-700 text-white'
                          : 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    先頭に追加
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {(() => {
                  const targetPlot = otherPlots.find(
                    (p) => p.plotId === pendingMoveCard.targetPlotId
                  );
                  const linked = scenes.find(
                    (s) => s.sceneId === pendingMoveCard.card.linkedSceneId
                  );
                  if (
                    !linked ||
                    !targetPlot?.linkedSceneFolder ||
                    (linked.folder ?? '') === targetPlot.linkedSceneFolder
                  ) {
                    return null;
                  }
                  return (
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100/70">
                      <input
                        type="checkbox"
                        checked={pendingMoveCard.moveLinkedSceneToTargetFolder}
                        onChange={(e) =>
                          setPendingMoveCard((prev) =>
                            prev
                              ? { ...prev, moveLinkedSceneToTargetFolder: e.target.checked }
                              : prev
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        紐付けシーンを移動先フォルダ（
                        <span className="font-code font-medium">
                          scenes/{targetPlot.linkedSceneFolder}/
                        </span>
                        ）へ移動する
                      </span>
                    </label>
                  );
                })()}

                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100/70">
                  <input
                    type="checkbox"
                    checked={pendingMoveCard.openTargetPlot}
                    onChange={(e) =>
                      setPendingMoveCard((prev) =>
                        prev ? { ...prev, openTargetPlot: e.target.checked } : prev
                      )
                    }
                  />
                  <span>移動後に移動先プロットを開く</span>
                </label>
              </div>

              {pendingMoveCard.card.linkedSceneId && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  ※ 紐付け済みシーンはそのまま維持され、移動先が章プロットの場合は章シーンリストも連動して更新されます。
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
              <button
                type="button"
                onClick={() => setPendingMoveCard(null)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <FolderInput className="h-3.5 w-3.5" />
                <span>移動する</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingBulkMoveOpen && plot.linkedSceneFolder && onMoveScenesToFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingBulkMoveOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-move-scenes-title"
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FolderInput className="h-4 w-4 text-slate-700 shrink-0" />
                <div>
                  <h2
                    id="bulk-move-scenes-title"
                    className="text-sm font-semibold text-slate-900"
                  >
                    紐付け済みシーンを連携フォルダへ一括移動
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    移動先: scenes/{plot.linkedSceneFolder}/
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingBulkMoveOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5 text-xs text-slate-700">
              <p className="leading-relaxed text-slate-600">
                このプロットのカードに紐付いている以下の{' '}
                <strong className="font-semibold text-slate-900">
                  {outOfFolderLinkedScenes.length}件
                </strong>{' '}
                のシーンファイルを「
                <span className="font-code font-medium text-slate-900">
                  scenes/{plot.linkedSceneFolder}/
                </span>
                」へ移動します。
              </p>

              <ul className="space-y-1.5">
                {outOfFolderLinkedScenes.map((s) => (
                  <li
                    key={s.sceneId}
                    className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2"
                  >
                    <div className="font-medium text-slate-900 truncate">{s.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-code text-[10px] text-slate-500">
                      <span className="truncate">
                        {s.folder ? `${s.folder}/${s.filename}` : `scenes/直下/${s.filename}`}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                      <span className="truncate text-slate-700">
                        {plot.linkedSceneFolder}/{s.filename}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                ※ 移動先に同名の .md ファイルが存在する場合は自動的に連番（_2.md 等）を付与します。プロットカードの紐付けは維持されます。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
              <button
                type="button"
                onClick={() => setPendingBulkMoveOpen(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  onMoveScenesToFolder(
                    outOfFolderLinkedScenes.map((s) => s.sceneId),
                    plot.linkedSceneFolder!
                  );
                  setPendingBulkMoveOpen(false);
                }}
                className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <FolderInput className="h-3.5 w-3.5" />
                <span>一括移動する</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

