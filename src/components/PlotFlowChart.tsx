import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FilePlus2,
  GitBranch,
  Grid,
  Inbox,
  Link2,
  Maximize2,
  Move,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Unlink,
  Users,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  PlotCard,
  PlotCardStatus,
  PlotData,
  SceneData,
  VisibilityType,
} from '../types/scenario';
import {
  buildSequentialConnections,
  CHART_CARD_HEIGHT,
  CHART_CARD_WIDTH,
  CHART_ORIGIN_X,
  CHART_ORIGIN_Y,
  CHART_PITCH_X,
  cleanupCardConnections,
  computeTidyLayout,
  ensureChartPositions,
  getChartBounds,
  getEdgeBezierPath,
  snapToGrid,
  syncOrderFromChart,
} from '../utils/plotChartLayout';
import { SceneLinkCombobox, type SceneUsageEntry } from './SceneLinkCombobox';

interface PlotFlowChartProps {
  plot: PlotData;
  scenes: SceneData[];
  characters: CharacterData[];
  activeMode: ActiveMode;
  sceneUsageMap: Map<string, SceneUsageEntry[]>;
  hasOtherPlots: boolean;
  onUpdatePlot: (updated: PlotData) => void;
  onRequestSceneLinkChange: (card: PlotCard, nextSceneId: string) => void;
  onCreateSceneAndLink?: (plotId: string, cardId: string) => void;
  onOpenScene: (sceneId: string) => void;
  onRequestMoveCardToOtherPlot?: (card: PlotCard) => void;
  onDeleteCard: (cardId: string) => void;
}

interface SelectedEdge {
  sourceCardId: string;
  targetCardId: string;
}

interface DraggingNodeState {
  cardId: string;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  hasMoved: boolean;
  overStaging: boolean;
}

interface DraggingStagingState {
  cardId: string;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  hasMoved: boolean;
  overCanvas: boolean;
}

interface PanningState {
  startClientX: number;
  startClientY: number;
  originPanX: number;
  originPanY: number;
  hasMoved: boolean;
}

interface ConnectingState {
  sourceCardId: string;
  cursorWorldX: number;
  cursorWorldY: number;
  hoverTargetCardId: string | null;
}

const ZOOM_PRESETS = [0.6, 0.8, 1, 1.25] as const;

const STATUS_META: Array<{
  value: PlotCardStatus;
  label: string;
  textStyle: string;
}> = [
  { value: 'todo', label: '未着手', textStyle: 'text-slate-500' },
  { value: 'draft', label: '下書き', textStyle: 'text-slate-700' },
  { value: 'writing', label: '執筆中', textStyle: 'text-amber-700' },
  { value: 'review', label: '推敲待ち', textStyle: 'text-sky-700' },
  { value: 'done', label: '完了', textStyle: 'text-emerald-700' },
];

const VISIBILITY_META: Record<
  VisibilityType,
  {
    shortLabel: string;
    textStyle: string;
    accentBorder: string;
  }
> = {
  common: {
    shortLabel: '共通',
    textStyle: 'text-slate-500',
    accentBorder: 'border-l-slate-400',
  },
  general_alt: {
    shortLabel: '一般差替',
    textStyle: 'text-sky-700',
    accentBorder: 'border-l-sky-500',
  },
  adult_only: {
    shortLabel: 'R18専用',
    textStyle: 'text-rose-700',
    accentBorder: 'border-l-rose-600',
  },
};

export const PlotFlowChart: React.FC<PlotFlowChartProps> = ({
  plot,
  scenes,
  characters,
  activeMode,
  sceneUsageMap,
  hasOtherPlots,
  onUpdatePlot,
  onRequestSceneLinkChange,
  onCreateSceneAndLink,
  onOpenScene,
  onRequestMoveCardToOtherPlot,
  onDeleteCard,
}) => {
  const isAdult = activeMode === 'adult';

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stagingRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const fittedPlotIdRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 32, y: 32 });
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [stagingOpen, setStagingOpen] = useState<boolean>(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [drawerDetailsOpen, setDrawerDetailsOpen] = useState<boolean>(true);

  const [draggingNode, setDraggingNode] = useState<DraggingNodeState | null>(null);
  const [draggingStaging, setDraggingStaging] = useState<DraggingStagingState | null>(null);
  const [panning, setPanning] = useState<PanningState | null>(null);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastNotice(msg);
  }, []);

  useEffect(() => {
    if (!toastNotice) return;
    const t = window.setTimeout(() => setToastNotice(null), 2400);
    return () => window.clearTimeout(t);
  }, [toastNotice]);

  // Reset ephemeral selection when switching plots
  useEffect(() => {
    setSelectedCardId(null);
    setSelectedEdge(null);
    setConfirmDeleteCardId(null);
    fittedPlotIdRef.current = null;
  }, [plot.plotId]);

  // Ensure every non-staging card has a chartPos (lazy migration without altering order)
  useEffect(() => {
    const ensured = ensureChartPositions(plot.cards);
    if (ensured.changed) {
      onUpdatePlot({ ...plot, cards: ensured.cards });
    }
  }, [plot, onUpdatePlot]);

  const sortedCards = useMemo(
    () => [...plot.cards].sort((a, b) => a.order - b.order),
    [plot.cards]
  );

  const placedCards = useMemo(
    () => sortedCards.filter((c) => !c.inStaging),
    [sortedCards]
  );

  const stagingCards = useMemo(
    () => sortedCards.filter((c) => Boolean(c.inStaging)),
    [sortedCards]
  );

  const cardMap = useMemo(() => {
    const map = new Map<string, PlotCard>();
    for (const c of plot.cards) {
      map.set(c.cardId, c);
    }
    return map;
  }, [plot.cards]);

  const selectedCard = selectedCardId ? cardMap.get(selectedCardId) ?? null : null;

  const isDimmed = useCallback(
    (vis: VisibilityType) => {
      if (!isAdult && vis === 'adult_only') return true;
      if (isAdult && vis === 'general_alt') return true;
      return false;
    },
    [isAdult]
  );

  // Get live position of a placed card (incorporating active drag offset at 60fps)
  const getLivePos = useCallback(
    (card: PlotCard): { x: number; y: number } => {
      if (draggingNode && draggingNode.cardId === card.cardId) {
        return { x: draggingNode.currentX, y: draggingNode.currentY };
      }
      return card.chartPos ?? { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
    },
    [draggingNode]
  );

  const fitToView = useCallback(
    (cardsSource: PlotCard[] = plot.cards) => {
      const container = canvasRef.current;
      if (!container) return;
      const bounds = getChartBounds(cardsSource);
      if (!bounds) {
        setZoom(0.95);
        setPan({ x: 40, y: 40 });
        return;
      }
      const rect = container.getBoundingClientRect();
      const padX = 72;
      const padY = 72;
      const availW = Math.max(240, rect.width - padX * 2);
      const availH = Math.max(200, rect.height - padY * 2);
      const nextZoom = Math.min(1.05, Math.max(0.45, Math.min(availW / bounds.width, availH / bounds.height)));
      const roundedZoom = Math.round(nextZoom * 100) / 100;

      const contentW = bounds.width * roundedZoom;
      const contentH = bounds.height * roundedZoom;
      const nextPanX = Math.round((rect.width - contentW) / 2 - bounds.minX * roundedZoom);
      const nextPanY = Math.round((rect.height - contentH) / 2 - bounds.minY * roundedZoom);

      setZoom(roundedZoom);
      setPan({ x: nextPanX, y: nextPanY });
    },
    [plot.cards]
  );

  // Fit viewport once when opening a plot in chart mode
  useEffect(() => {
    if (fittedPlotIdRef.current === plot.plotId) return;
    const allPlacedHavePos = placedCards.every((c) => Boolean(c.chartPos));
    if (placedCards.length === 0 || allPlacedHavePos) {
      fittedPlotIdRef.current = plot.plotId;
      const raf = window.requestAnimationFrame(() => fitToView(plot.cards));
      return () => window.cancelAnimationFrame(raf);
    }
  }, [plot.plotId, plot.cards, placedCards, fitToView]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const commitCards = useCallback(
    (nextCards: PlotCard[], syncOrder = false) => {
      const cleaned = cleanupCardConnections(nextCards);
      const finalCards = syncOrder ? syncOrderFromChart(cleaned) : cleaned;
      onUpdatePlot({ ...plot, cards: finalCards });
    },
    [onUpdatePlot, plot]
  );

  const updateSingleCard = useCallback(
    (cardId: string, patch: Partial<PlotCard>, syncOrder = false) => {
      const nextCards = plot.cards.map((c) =>
        c.cardId === cardId ? { ...c, ...patch } : c
      );
      commitCards(nextCards, syncOrder);
    },
    [plot.cards, commitCards]
  );

  // Add a card directly on canvas (optional explicit world coordinates) or in staging
  const handleAddCard = useCallback(
    (options: { toStaging?: boolean; worldPos?: { x: number; y: number } } = {}) => {
      const { toStaging = false, worldPos } = options;
      const nextOrder = sortedCards.length > 0 ? sortedCards[sortedCards.length - 1].order + 1 : 1;

      let chartPos: { x: number; y: number } | undefined;
      if (!toStaging) {
        if (worldPos) {
          chartPos = {
            x: snapToGrid(worldPos.x - CHART_CARD_WIDTH / 2, snapEnabled),
            y: snapToGrid(worldPos.y - CHART_CARD_HEIGHT / 2, snapEnabled),
          };
        } else if (placedCards.length > 0) {
          const rightmost = placedCards.reduce((acc, cur) =>
            (cur.chartPos?.x ?? 0) > (acc.chartPos?.x ?? 0) ? cur : acc
          );
          chartPos = {
            x: snapToGrid((rightmost.chartPos?.x ?? CHART_ORIGIN_X) + CHART_PITCH_X, snapEnabled),
            y: snapToGrid(rightmost.chartPos?.y ?? CHART_ORIGIN_Y, snapEnabled),
          };
        } else {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const center = clientToWorld(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2
            );
            chartPos = {
              x: snapToGrid(center.x - CHART_CARD_WIDTH / 2, snapEnabled),
              y: snapToGrid(center.y - CHART_CARD_HEIGHT / 2, snapEnabled),
            };
          } else {
            chartPos = { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
          }
        }
      }

      const newCard: PlotCard = {
        cardId: `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        order: nextOrder,
        visibility: isAdult ? 'adult_only' : 'common',
        status: 'todo',
        title: toStaging ? `アイデア案 ${stagingCards.length + 1}` : `新規シーン ${nextOrder}`,
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
        chartPos,
        inStaging: toStaging ? true : undefined,
      };

      commitCards([...plot.cards, newCard], true);
      if (toStaging) {
        setStagingOpen(true);
      }
      setSelectedEdge(null);
      setSelectedCardId(newCard.cardId);
      setConfirmDeleteCardId(null);
      window.setTimeout(() => titleInputRef.current?.focus(), 40);
    },
    [
      sortedCards,
      placedCards,
      stagingCards.length,
      snapEnabled,
      clientToWorld,
      isAdult,
      commitCards,
      plot.cards,
    ]
  );

  const handleToggleStaging = useCallback(
    (card: PlotCard, toStaging: boolean) => {
      if (toStaging) {
        updateSingleCard(card.cardId, { inStaging: true }, true);
        setStagingOpen(true);
        showToast('アイデア置き場へ退避しました');
      } else {
        let nextPos = card.chartPos;
        if (!nextPos) {
          if (placedCards.length > 0) {
            const rightmost = placedCards.reduce((acc, cur) =>
              (cur.chartPos?.x ?? 0) > (acc.chartPos?.x ?? 0) ? cur : acc
            );
            nextPos = {
              x: snapToGrid((rightmost.chartPos?.x ?? CHART_ORIGIN_X) + CHART_PITCH_X, snapEnabled),
              y: snapToGrid(rightmost.chartPos?.y ?? CHART_ORIGIN_Y, snapEnabled),
            };
          } else {
            nextPos = { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
          }
        }
        updateSingleCard(
          card.cardId,
          { inStaging: undefined, chartPos: nextPos },
          true
        );
        showToast('キャンバスへ配置し、順序を同期しました');
      }
    },
    [updateSingleCard, placedCards, snapEnabled, showToast]
  );

  // Edge mutation helpers
  const addConnection = useCallback(
    (sourceCardId: string, targetCardId: string, label?: string) => {
      if (sourceCardId === targetCardId) return;
      const source = cardMap.get(sourceCardId);
      if (!source) return;
      const existing = source.connections ?? [];
      if (existing.some((c) => c.targetCardId === targetCardId)) {
        setSelectedEdge({ sourceCardId, targetCardId });
        return;
      }
      const nextConns = [
        ...existing,
        label?.trim() ? { targetCardId, label: label.trim() } : { targetCardId },
      ];
      updateSingleCard(sourceCardId, { connections: nextConns }, false);
      setSelectedCardId(null);
      setSelectedEdge({ sourceCardId, targetCardId });
    },
    [cardMap, updateSingleCard]
  );

  const updateConnectionLabel = useCallback(
    (sourceCardId: string, targetCardId: string, label: string) => {
      const source = cardMap.get(sourceCardId);
      if (!source) return;
      const nextConns = (source.connections ?? []).map((c) =>
        c.targetCardId === targetCardId
          ? label.trim()
            ? { targetCardId, label: label.trim() }
            : { targetCardId }
          : c
      );
      updateSingleCard(sourceCardId, { connections: nextConns }, false);
    },
    [cardMap, updateSingleCard]
  );

  const removeConnection = useCallback(
    (sourceCardId: string, targetCardId: string) => {
      const source = cardMap.get(sourceCardId);
      if (!source) return;
      const nextConns = (source.connections ?? []).filter(
        (c) => c.targetCardId !== targetCardId
      );
      updateSingleCard(
        sourceCardId,
        { connections: nextConns.length > 0 ? nextConns : undefined },
        false
      );
      if (
        selectedEdge?.sourceCardId === sourceCardId &&
        selectedEdge?.targetCardId === targetCardId
      ) {
        setSelectedEdge(null);
      }
    },
    [cardMap, updateSingleCard, selectedEdge]
  );

  const handleTidyLayout = () => {
    const nextCards = computeTidyLayout(plot.cards);
    onUpdatePlot({ ...plot, cards: nextCards });
    window.requestAnimationFrame(() => fitToView(nextCards));
    showToast('矢印と時系列に沿って自動整列しました');
  };

  const handleAutoConnectSequence = () => {
    if (placedCards.length < 2) {
      showToast('連結するにはキャンバス上に2枚以上のカードが必要です');
      return;
    }
    const nextCards = buildSequentialConnections(plot.cards);
    onUpdatePlot({ ...plot, cards: nextCards });
    showToast('現在の番号順に矢印を連結しました');
  };

  // Zoom anchored around viewport center
  const applyZoom = useCallback(
    (nextZoomRaw: number, anchorClient?: { x: number; y: number }) => {
      const clamped = Math.round(Math.min(1.5, Math.max(0.4, nextZoomRaw)) * 100) / 100;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        setZoom(clamped);
        return;
      }
      const ax = anchorClient ? anchorClient.x - rect.left : rect.width / 2;
      const ay = anchorClient ? anchorClient.y - rect.top : rect.height / 2;

      setPan((prevPan) => {
        const worldX = (ax - prevPan.x) / zoom;
        const worldY = (ay - prevPan.y) / zoom;
        return {
          x: Math.round(ax - worldX * clamped),
          y: Math.round(ay - worldY * clamped),
        };
      });
      setZoom(clamped);
    },
    [zoom]
  );

  // Wheel handler: Ctrl/Cmd + wheel zooms, normal wheel pans smoothly
  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      applyZoom(zoom * factor, { x: e.clientX, y: e.clientY });
      return;
    }
    setPan((prev) => ({
      x: Math.round(prev.x - e.deltaX),
      y: Math.round(prev.y - e.deltaY),
    }));
  };

  // Keyboard shortcuts: Escape closes selection, Delete removes selected edge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        setConnecting(null);
        setSelectedEdge(null);
        if (!isEditing) {
          setSelectedCardId(null);
          setConfirmDeleteCardId(null);
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && selectedEdge) {
        e.preventDefault();
        removeConnection(selectedEdge.sourceCardId, selectedEdge.targetCardId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedEdge, removeConnection]);

  // Global window pointer listeners for smooth node drag, staging drag, pan, and edge connect
  useEffect(() => {
    if (!draggingNode && !draggingStaging && !panning && !connecting) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (draggingNode) {
        const dx = (e.clientX - draggingNode.startClientX) / zoom;
        const dy = (e.clientY - draggingNode.startClientY) / zoom;
        const dist = Math.hypot(
          e.clientX - draggingNode.startClientX,
          e.clientY - draggingNode.startClientY
        );
        const stagingRect = stagingRef.current?.getBoundingClientRect();
        const overStaging = Boolean(
          stagingOpen &&
            stagingRect &&
            e.clientX >= stagingRect.left &&
            e.clientX <= stagingRect.right &&
            e.clientY >= stagingRect.top &&
            e.clientY <= stagingRect.bottom
        );

        setDraggingNode((prev) =>
          prev
            ? {
                ...prev,
                currentX: prev.originX + dx,
                currentY: prev.originY + dy,
                hasMoved: prev.hasMoved || dist > 4,
                overStaging,
              }
            : null
        );
      } else if (draggingStaging) {
        const dist = Math.hypot(
          e.clientX - draggingStaging.startClientX,
          e.clientY - draggingStaging.startClientY
        );
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        const overCanvas = Boolean(
          canvasRect &&
            e.clientX >= canvasRect.left &&
            e.clientX <= canvasRect.right &&
            e.clientY >= canvasRect.top &&
            e.clientY <= canvasRect.bottom
        );
        setDraggingStaging((prev) =>
          prev
            ? {
                ...prev,
                clientX: e.clientX,
                clientY: e.clientY,
                hasMoved: prev.hasMoved || dist > 5,
                overCanvas,
              }
            : null
        );
      } else if (panning) {
        const dx = e.clientX - panning.startClientX;
        const dy = e.clientY - panning.startClientY;
        const dist = Math.hypot(dx, dy);
        setPan({
          x: Math.round(panning.originPanX + dx),
          y: Math.round(panning.originPanY + dy),
        });
        if (!panning.hasMoved && dist > 4) {
          setPanning((prev) => (prev ? { ...prev, hasMoved: true } : null));
        }
      } else if (connecting) {
        const world = clientToWorld(e.clientX, e.clientY);
        let hitId: string | null = null;
        for (const c of placedCards) {
          if (c.cardId === connecting.sourceCardId) continue;
          const pos = c.chartPos ?? { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
          if (
            world.x >= pos.x - 14 &&
            world.x <= pos.x + CHART_CARD_WIDTH + 14 &&
            world.y >= pos.y - 14 &&
            world.y <= pos.y + CHART_CARD_HEIGHT + 14
          ) {
            hitId = c.cardId;
            break;
          }
        }
        setConnecting((prev) =>
          prev
            ? {
                ...prev,
                cursorWorldX: world.x,
                cursorWorldY: world.y,
                hoverTargetCardId: hitId,
              }
            : null
        );
      }
    };

    const handlePointerUp = () => {
      if (draggingNode) {
        if (!draggingNode.hasMoved) {
          setSelectedEdge(null);
          setSelectedCardId(draggingNode.cardId);
          setConfirmDeleteCardId(null);
        } else if (draggingNode.overStaging) {
          const card = cardMap.get(draggingNode.cardId);
          if (card) {
            handleToggleStaging(card, true);
          }
        } else {
          const finalX = snapToGrid(draggingNode.currentX, snapEnabled);
          const finalY = snapToGrid(draggingNode.currentY, snapEnabled);
          updateSingleCard(
            draggingNode.cardId,
            { chartPos: { x: finalX, y: finalY } },
            true
          );
        }
        setDraggingNode(null);
      }

      if (draggingStaging) {
        if (!draggingStaging.hasMoved) {
          setSelectedEdge(null);
          setSelectedCardId(draggingStaging.cardId);
          setConfirmDeleteCardId(null);
        } else if (draggingStaging.overCanvas) {
          const world = clientToWorld(draggingStaging.clientX, draggingStaging.clientY);
          const finalX = snapToGrid(world.x - CHART_CARD_WIDTH / 2, snapEnabled);
          const finalY = snapToGrid(world.y - CHART_CARD_HEIGHT / 2, snapEnabled);
          updateSingleCard(
            draggingStaging.cardId,
            {
              inStaging: undefined,
              chartPos: { x: finalX, y: finalY },
            },
            true
          );
          setSelectedEdge(null);
          setSelectedCardId(draggingStaging.cardId);
          showToast('キャンバスへ配置し、番号順を同期しました');
        }
        setDraggingStaging(null);
      }

      if (panning) {
        if (!panning.hasMoved) {
          setSelectedCardId(null);
          setSelectedEdge(null);
          setConfirmDeleteCardId(null);
        }
        setPanning(null);
      }

      if (connecting) {
        if (connecting.hoverTargetCardId) {
          addConnection(connecting.sourceCardId, connecting.hoverTargetCardId);
        }
        setConnecting(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    draggingNode,
    draggingStaging,
    panning,
    connecting,
    zoom,
    stagingOpen,
    placedCards,
    cardMap,
    snapEnabled,
    clientToWorld,
    updateSingleCard,
    handleToggleStaging,
    addConnection,
    showToast,
  ]);

  // Compute all visible edges between placed cards
  const visibleEdges = useMemo(() => {
    const placedIds = new Set(placedCards.map((c) => c.cardId));
    const list: Array<{
      source: PlotCard;
      target: PlotCard;
      label?: string;
      path: string;
      midX: number;
      midY: number;
      isSelected: boolean;
    }> = [];

    for (const source of placedCards) {
      for (const conn of source.connections ?? []) {
        if (!placedIds.has(conn.targetCardId)) continue;
        const target = cardMap.get(conn.targetCardId);
        if (!target) continue;
        const fromPos = getLivePos(source);
        const toPos = getLivePos(target);
        const geom = getEdgeBezierPath(fromPos, toPos);
        const isSelected = Boolean(
          selectedEdge &&
            selectedEdge.sourceCardId === source.cardId &&
            selectedEdge.targetCardId === target.cardId
        );
        list.push({
          source,
          target,
          label: conn.label,
          path: geom.path,
          midX: geom.midX,
          midY: geom.midY,
          isSelected,
        });
      }
    }
    return list;
  }, [placedCards, cardMap, getLivePos, selectedEdge]);

  // Live preview edge path while dragging from an output port
  const liveConnectPath = useMemo(() => {
    if (!connecting) return null;
    const source = cardMap.get(connecting.sourceCardId);
    if (!source) return null;
    const fromPos = getLivePos(source);
    const sx = fromPos.x + CHART_CARD_WIDTH;
    const sy = fromPos.y + CHART_CARD_HEIGHT / 2;

    let tx = connecting.cursorWorldX;
    let ty = connecting.cursorWorldY;
    if (connecting.hoverTargetCardId) {
      const target = cardMap.get(connecting.hoverTargetCardId);
      if (target) {
        const tPos = getLivePos(target);
        tx = tPos.x;
        ty = tPos.y + CHART_CARD_HEIGHT / 2;
      }
    }
    const dx = tx - sx;
    const handle = Math.min(160, Math.max(40, Math.abs(dx) * 0.45));
    return `M ${sx} ${sy} C ${sx + handle} ${sy}, ${tx - handle} ${ty}, ${tx} ${ty}`;
  }, [connecting, cardMap, getLivePos]);

  const selectedEdgeData = useMemo(() => {
    if (!selectedEdge) return null;
    const source = cardMap.get(selectedEdge.sourceCardId);
    const target = cardMap.get(selectedEdge.targetCardId);
    if (!source || !target) return null;
    const conn = source.connections?.find((c) => c.targetCardId === target.cardId);
    if (!conn) return null;
    return { source, target, label: conn.label ?? '' };
  }, [selectedEdge, cardMap]);

  const draggingStagingCard = draggingStaging
    ? cardMap.get(draggingStaging.cardId) ?? null
    : null;

  const gridDotSpacing = Math.max(10, Math.round(20 * zoom));
  const accentBtnBg = isAdult
    ? 'bg-rose-700 hover:bg-rose-800'
    : 'bg-slate-800 hover:bg-slate-900';

  const toggleCharacterOnCard = (card: PlotCard, charId: string) => {
    const current = card.characters ?? [];
    const next = current.includes(charId)
      ? current.filter((id) => id !== charId)
      : [...current, charId];
    updateSingleCard(card.cardId, { characters: next }, false);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-slate-50">
      {/* Chart-Specific Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Staging Tray Toggle */}
          <button
            type="button"
            onClick={() => setStagingOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
              stagingOpen
                ? 'border-slate-300 bg-slate-100 text-slate-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>アイデア置き場</span>
            <span className="font-code text-[10px] text-slate-500 tabular-nums">
              ({stagingCards.length})
            </span>
          </button>

          <span className="h-4 w-px bg-slate-200" aria-hidden="true" />

          {/* Zoom Controls */}
          <div
            role="group"
            aria-label="ズーム倍率"
            className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5"
          >
            <button
              type="button"
              onClick={() => applyZoom(zoom - 0.15)}
              title="縮小"
              className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            {ZOOM_PRESETS.map((preset) => {
              const active = Math.abs(zoom - preset) < 0.04;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyZoom(preset)}
                  className={`rounded px-1.5 py-0.5 font-code text-[11px] tabular-nums transition-colors ${
                    active
                      ? 'bg-white font-semibold text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {Math.round(preset * 100)}%
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => applyZoom(zoom + 0.15)}
              title="拡大"
              className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => fitToView()}
            title="全カードが収まるように表示"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>全体表示</span>
          </button>

          <span className="h-4 w-px bg-slate-200" aria-hidden="true" />

          {/* Layout & Connection Utilities */}
          <button
            type="button"
            onClick={handleTidyLayout}
            title="矢印の分岐・合流や番号順にそって自動整列"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>自動整列</span>
          </button>

          <button
            type="button"
            onClick={handleAutoConnectSequence}
            title="キャンバス上のカードを現在の番号順に矢印で連結"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>順番連結</span>
          </button>

          <button
            type="button"
            onClick={() => setSnapEnabled((v) => !v)}
            title="ドラッグ移動時の20pxグリッド吸着を切り替え"
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
              snapEnabled
                ? 'border-slate-300 bg-slate-100 text-slate-800'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            <span>吸着</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden xl:inline text-[11px] text-slate-400">
            ドラッグ移動 · 右端●から矢印結線 · 背景ダブルクリックで追加
          </span>
          <button
            type="button"
            onClick={() => handleAddCard({ toStaging: true })}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>仮カード</span>
          </button>
        </div>
      </div>

      {/* Main 3-Region Workspace: Staging Tray | 2D Free Canvas | Quick Edit Drawer */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Left Collapsible Staging Tray (アイデア置き場) */}
        {stagingOpen && (
          <aside
            ref={stagingRef}
            className={`flex w-60 shrink-0 flex-col border-r transition-colors ${
              draggingNode?.overStaging
                ? 'border-sky-400 bg-sky-50/70'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Inbox className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate">
                  アイデア置き場
                </span>
                <span className="font-code text-[11px] text-slate-400 tabular-nums">
                  {stagingCards.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAddCard({ toStaging: true })}
                  title="アイデア置き場に仮カードを追加"
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setStagingOpen(false)}
                  title="アイデア置き場を折りたたむ"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {draggingNode?.overStaging && (
              <div className="mx-2.5 mt-2 rounded-md border border-dashed border-sky-400 bg-sky-100/70 px-2.5 py-2 text-center text-[11px] font-medium text-sky-900">
                ここにドロップして未配置へ退避
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {stagingCards.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-3 py-5 text-center space-y-2">
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    本編に組み込む前のアイデアや保留シーンを仮置きできます。キャンバスへドラッグして配置できます。
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddCard({ toStaging: true })}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Plus className="h-3 w-3" />
                    <span>仮カードを追加</span>
                  </button>
                </div>
              ) : (
                stagingCards.map((card) => {
                  const visMeta = VISIBILITY_META[card.visibility] ?? VISIBILITY_META.common;
                  const selected = selectedCardId === card.cardId;
                  const dimmed = isDimmed(card.visibility);
                  const isBeingDragged = draggingStaging?.cardId === card.cardId;
                  return (
                    <div
                      key={card.cardId}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        if ((e.target as HTMLElement).closest('button')) return;
                        e.preventDefault();
                        setDraggingStaging({
                          cardId: card.cardId,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          clientX: e.clientX,
                          clientY: e.clientY,
                          hasMoved: false,
                          overCanvas: false,
                        });
                      }}
                      className={`group cursor-grab active:cursor-grabbing rounded-md border border-l-4 p-2 transition-all select-none ${
                        visMeta.accentBorder
                      } ${
                        selected
                          ? isAdult
                            ? 'border-rose-300 bg-rose-50/40 ring-1 ring-rose-500'
                            : 'border-slate-400 bg-slate-50 ring-1 ring-slate-700'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${dimmed ? 'opacity-55' : ''} ${isBeingDragged ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                          {card.title || '無題の仮カード'}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStaging(card, false);
                          }}
                          title="キャンバスへ配置"
                          className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                          配置
                        </button>
                      </div>
                      {card.memo && (
                        <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-snug">
                          {card.memo}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span className={visMeta.textStyle}>{visMeta.shortLabel}</span>
                        {(card.characters?.length ?? 0) > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>登場 {card.characters?.length}人</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Center 2D Free Canvas */}
        <div
          ref={canvasRef}
          onWheel={handleCanvasWheel}
          onPointerDown={(e) => {
            if (e.button === 1 || (e.button === 0 && e.target === canvasRef.current)) {
              e.preventDefault();
              setPanning({
                startClientX: e.clientX,
                startClientY: e.clientY,
                originPanX: pan.x,
                originPanY: pan.y,
                hasMoved: false,
              });
            }
          }}
          onDoubleClick={(e) => {
            if (e.target !== canvasRef.current) return;
            const world = clientToWorld(e.clientX, e.clientY);
            handleAddCard({ toStaging: false, worldPos: world });
          }}
          style={{
            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: `${gridDotSpacing}px ${gridDotSpacing}px`,
            backgroundPosition: `${pan.x % gridDotSpacing}px ${pan.y % gridDotSpacing}px`,
          }}
          className={`relative flex-1 min-w-0 min-h-0 overflow-hidden bg-slate-50/90 select-none ${
            panning ? 'cursor-grabbing' : 'cursor-grab'
          } ${draggingStaging?.overCanvas ? 'ring-2 ring-inset ring-sky-400/70' : ''}`}
        >
          {/* Floating Notice Toast */}
          {toastNotice && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-900/90 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm">
              {toastNotice}
            </div>
          )}

          {/* World Transform Container */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
            className="pointer-events-none absolute top-0 left-0"
          >
            {/* SVG Edges Layer */}
            <svg
              className="pointer-events-none absolute top-0 left-0 overflow-visible"
              width={1}
              height={1}
            >
              <defs>
                <marker
                  id="plot-arrow-default"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path d="M 0 0.8 L 8.5 4 L 0 7.2 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="plot-arrow-selected"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path
                    d="M 0 0.8 L 8.5 4 L 0 7.2 z"
                    fill={isAdult ? '#be123c' : '#0f172a'}
                  />
                </marker>
                <marker
                  id="plot-arrow-live"
                  markerWidth="10"
                  markerHeight="8"
                  refX="8.5"
                  refY="4"
                  orient="auto"
                >
                  <path d="M 0 0.8 L 8.5 4 L 0 7.2 z" fill="#0284c7" />
                </marker>
              </defs>

              {visibleEdges.map((edge) => {
                const edgeKey = `${edge.source.cardId}->${edge.target.cardId}`;
                const strokeColor = edge.isSelected
                  ? isAdult
                    ? '#be123c'
                    : '#0f172a'
                  : '#94a3b8';
                return (
                  <g key={edgeKey} className="pointer-events-auto cursor-pointer">
                    {/* Invisible wide hit target */}
                    <path
                      d={edge.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCardId(null);
                        setSelectedEdge({
                          sourceCardId: edge.source.cardId,
                          targetCardId: edge.target.cardId,
                        });
                      }}
                    />
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={edge.isSelected ? 2.5 : 1.75}
                      markerEnd={
                        edge.isSelected
                          ? 'url(#plot-arrow-selected)'
                          : 'url(#plot-arrow-default)'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCardId(null);
                        setSelectedEdge({
                          sourceCardId: edge.source.cardId,
                          targetCardId: edge.target.cardId,
                        });
                      }}
                    />
                  </g>
                );
              })}

              {/* Temporary live dashed arrow while dragging connection */}
              {liveConnectPath && (
                <path
                  d={liveConnectPath}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  markerEnd="url(#plot-arrow-live)"
                />
              )}
            </svg>

            {/* Edge Midpoint Labels (HTML overlay in world coordinates for crisp text) */}
            {visibleEdges.map((edge) => {
              const edgeKey = `lbl-${edge.source.cardId}->${edge.target.cardId}`;
              if (!edge.label && !edge.isSelected) return null;
              return (
                <button
                  key={edgeKey}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCardId(null);
                    setSelectedEdge({
                      sourceCardId: edge.source.cardId,
                      targetCardId: edge.target.cardId,
                    });
                  }}
                  style={{
                    left: `${edge.midX}px`,
                    top: `${edge.midY}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  className={`pointer-events-auto absolute z-10 max-w-[160px] truncate rounded border px-1.5 py-0.5 text-[10px] font-medium shadow-2xs transition-colors ${
                    edge.isSelected
                      ? isAdult
                        ? 'border-rose-500 bg-rose-700 text-white'
                        : 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white/95 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {edge.label || '分岐ラベル編集'}
                </button>
              );
            })}

            {/* Placed Plot Cards Layer */}
            {placedCards.map((card) => {
              const pos = getLivePos(card);
              const visMeta = VISIBILITY_META[card.visibility] ?? VISIBILITY_META.common;
              const statusVal: PlotCardStatus = card.status ?? 'todo';
              const statusMeta =
                STATUS_META.find((s) => s.value === statusVal) ?? STATUS_META[0];
              const dimmed = isDimmed(card.visibility);
              const isSelected = selectedCardId === card.cardId;
              const isDragging = draggingNode?.cardId === card.cardId && draggingNode.hasMoved;
              const isConnectTarget = connecting?.hoverTargetCardId === card.cardId;
              const isConnectSource = connecting?.sourceCardId === card.cardId;
              const linkedScene = card.linkedSceneId
                ? scenes.find((s) => s.sceneId === card.linkedSceneId)
                : undefined;
              const outgoingCount = (card.connections ?? []).filter((conn) =>
                placedCards.some((p) => p.cardId === conn.targetCardId)
              ).length;
              const charNames = (card.characters ?? [])
                .map((id) => characters.find((ch) => ch.id === id)?.shortName)
                .filter(Boolean) as string[];
              const summaryLine = card.goal?.trim() || card.memo?.trim() || '';

              return (
                <div
                  key={card.cardId}
                  style={{
                    width: `${CHART_CARD_WIDTH}px`,
                    minHeight: `${CHART_CARD_HEIGHT}px`,
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if ((e.target as HTMLElement).closest('[data-chart-port="true"]')) return;
                    e.stopPropagation();
                    e.preventDefault();
                    const origin = card.chartPos ?? { x: CHART_ORIGIN_X, y: CHART_ORIGIN_Y };
                    setDraggingNode({
                      cardId: card.cardId,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      originX: origin.x,
                      originY: origin.y,
                      currentX: origin.x,
                      currentY: origin.y,
                      hasMoved: false,
                      overStaging: false,
                    });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdge(null);
                    setSelectedCardId(card.cardId);
                    window.setTimeout(() => titleInputRef.current?.focus(), 40);
                  }}
                  className={`group pointer-events-auto absolute top-0 left-0 flex flex-col justify-between rounded-lg border border-l-4 bg-white p-2.5 transition-shadow ${
                    visMeta.accentBorder
                  } ${
                    isConnectTarget
                      ? 'border-sky-500 ring-2 ring-sky-400 shadow-md z-20'
                      : isSelected
                        ? isAdult
                          ? 'border-rose-400 ring-2 ring-rose-600/80 shadow-md z-20'
                          : 'border-slate-500 ring-2 ring-slate-900/80 shadow-md z-20'
                        : 'border-slate-200 hover:border-slate-300 shadow-2xs z-10'
                  } ${isDragging ? 'cursor-grabbing shadow-lg opacity-95 z-30' : 'cursor-grab'} ${
                    dimmed ? 'opacity-50' : ''
                  }`}
                >
                  {/* Left Input Port */}
                  <div
                    data-chart-port="true"
                    title="接続の受け口（入力）"
                    className={`absolute top-1/2 -left-2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 bg-white transition-transform ${
                      isConnectTarget
                        ? 'scale-125 border-sky-500 bg-sky-100'
                        : connecting
                          ? 'border-sky-400 scale-110'
                          : 'border-slate-300 opacity-70 group-hover:opacity-100'
                    }`}
                  />

                  {/* Right Output Port (drag from here to connect) */}
                  <button
                    type="button"
                    data-chart-port="true"
                    title="ドラッグして次のカードへ矢印を接続"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const world = clientToWorld(e.clientX, e.clientY);
                      setSelectedEdge(null);
                      setConnecting({
                        sourceCardId: card.cardId,
                        cursorWorldX: world.x,
                        cursorWorldY: world.y,
                        hoverTargetCardId: null,
                      });
                    }}
                    className={`absolute top-1/2 -right-2.5 flex h-4 w-4 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border-2 bg-white transition-transform hover:scale-125 ${
                      isConnectSource
                        ? 'scale-125 border-sky-500 bg-sky-500'
                        : isAdult
                          ? 'border-rose-400 hover:border-rose-600 hover:bg-rose-50'
                          : 'border-slate-400 hover:border-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current text-slate-500" />
                  </button>

                  {/* Top Metadata Row (Clean Unboxed Typography) */}
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-code font-semibold text-slate-500 tabular-nums">
                        #{String(card.order).padStart(2, '0')}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={`font-medium truncate ${visMeta.textStyle}`}>
                        {visMeta.shortLabel}
                      </span>
                    </div>
                    <span className={`shrink-0 font-medium ${statusMeta.textStyle}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Card Title */}
                  <h4 className="mt-1 text-xs font-semibold text-slate-900 leading-snug line-clamp-2">
                    {card.title || '無題のカード'}
                  </h4>

                  {/* Compact Memo / Goal Preview */}
                  {summaryLine && (
                    <p className="mt-1 text-[10px] leading-snug text-slate-500 line-clamp-2">
                      {summaryLine}
                    </p>
                  )}

                  {/* Bottom Quiet Metadata Row */}
                  <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-500 tabular-nums">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      {charNames.length > 0 && (
                        <span className="truncate">
                          {charNames.slice(0, 2).join('・')}
                          {charNames.length > 2 ? ` +${charNames.length - 2}` : ''}
                        </span>
                      )}
                      {card.branchCondition?.trim() && (
                        <span className="shrink-0 text-amber-700 font-medium">分岐</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {linkedScene && (
                        <span
                          title={`本文連携済み: ${linkedScene.title}`}
                          className="inline-flex items-center text-emerald-700"
                        >
                          <Link2 className="h-3 w-3" />
                        </span>
                      )}
                      {outgoingCount > 0 && (
                        <span
                          title={`${outgoingCount}件のカードへ接続中`}
                          className="font-code text-[10px] text-slate-400"
                        >
                          →{outgoingCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty Canvas State */}
          {placedCards.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-lg border border-dashed border-slate-300 bg-white/95 p-6 text-center shadow-2xs space-y-3">
                <p className="text-sm font-semibold text-slate-800">
                  タイムラインチャートはまだ空です
                </p>
                <p className="text-xs leading-relaxed text-slate-500">
                  カードを自由な位置へドラッグ配置し、右端の丸ポートから矢印で結んで分岐や展開を整理できます。左のアイデア置き場からもドラッグ投入できます。
                </p>
                <button
                  type="button"
                  onClick={() => handleAddCard({ toStaging: false })}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${accentBtnBg}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>最初のカードを配置</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Edge Editor Bar (when an arrow is selected) */}
          {selectedEdgeData && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-4 left-1/2 z-30 flex flex-wrap items-center gap-2 -translate-x-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs shadow-md"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                <span className="font-code text-slate-500">
                  #{String(selectedEdgeData.source.order).padStart(2, '0')}
                </span>
                <span className="max-w-[110px] truncate">
                  {selectedEdgeData.source.title || '無題'}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-code text-slate-500">
                  #{String(selectedEdgeData.target.order).padStart(2, '0')}
                </span>
                <span className="max-w-[110px] truncate">
                  {selectedEdgeData.target.title || '無題'}
                </span>
              </div>
              <input
                type="text"
                value={selectedEdgeData.label}
                onChange={(e) =>
                  updateConnectionLabel(
                    selectedEdgeData.source.cardId,
                    selectedEdgeData.target.cardId,
                    e.target.value
                  )
                }
                placeholder="分岐ラベル（例: 好感度高 / R18分岐）"
                aria-label="矢印の分岐ラベル"
                className="w-48 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  removeConnection(
                    selectedEdgeData.source.cardId,
                    selectedEdgeData.target.cardId
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 whitespace-nowrap"
              >
                <Unlink className="h-3 w-3" />
                <span>接続解除</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedEdge(null)}
                title="閉じる"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Compact Canvas Status Corner */}
          <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-md border border-slate-200/90 bg-white/90 px-2.5 py-1 text-[10px] text-slate-500 tabular-nums">
            <span>配置 {placedCards.length}枚</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span>矢印 {visibleEdges.length}本</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-code">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Right Slide-In Quick Edit Drawer */}
        {selectedCard && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-code text-xs font-semibold text-slate-500 tabular-nums">
                  {selectedCard.inStaging
                    ? '未配置'
                    : `#${String(selectedCard.order).padStart(2, '0')}`}
                </span>
                <span className="text-xs font-semibold text-slate-800 truncate">
                  クイック編集
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleToggleStaging(selectedCard, !selectedCard.inStaging)
                  }
                  title={
                    selectedCard.inStaging
                      ? 'キャンバスへ配置する'
                      : 'アイデア置き場へ退避する'
                  }
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Archive className="h-3 w-3" />
                  <span>{selectedCard.inStaging ? '配置する' : '退避'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCardId(null);
                    setConfirmDeleteCardId(null);
                  }}
                  title="パネルを閉じる"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Title */}
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500">カードタイトル</span>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={selectedCard.title}
                  onChange={(e) =>
                    updateSingleCard(selectedCard.cardId, { title: e.target.value })
                  }
                  placeholder="シーンタイトル"
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-slate-400 focus:outline-none"
                />
              </label>

              {/* Visibility & Status */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-500">公開範囲</span>
                  <select
                    value={selectedCard.visibility}
                    onChange={(e) =>
                      updateSingleCard(selectedCard.cardId, {
                        visibility: e.target.value as VisibilityType,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="common">共通</option>
                    <option value="general_alt">一般差替</option>
                    <option value="adult_only">R18専用</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-500">進捗状態</span>
                  <select
                    value={selectedCard.status ?? 'todo'}
                    onChange={(e) =>
                      updateSingleCard(selectedCard.cardId, {
                        status: e.target.value as PlotCardStatus,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    {STATUS_META.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Memo */}
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-500">あらすじ・展開メモ</span>
                <textarea
                  value={selectedCard.memo}
                  onChange={(e) =>
                    updateSingleCard(selectedCard.cardId, { memo: e.target.value })
                  }
                  rows={3}
                  placeholder="このシーンで起きる出来事・展開の要点"
                  className="w-full resize-y rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none"
                />
              </label>

              {/* Scene Link */}
              <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                <span className="block text-[11px] font-medium text-slate-500">
                  本文シーン連携
                </span>
                <SceneLinkCombobox
                  card={selectedCard}
                  plotId={plot.plotId}
                  scenes={scenes}
                  sceneUsageMap={sceneUsageMap}
                  linkedSceneFolder={plot.linkedSceneFolder}
                  isAdult={isAdult}
                  onSelectScene={(nextId) => onRequestSceneLinkChange(selectedCard, nextId)}
                  onCreateAndLinkScene={
                    onCreateSceneAndLink
                      ? () => onCreateSceneAndLink(plot.plotId, selectedCard.cardId)
                      : undefined
                  }
                />
                <div className="flex items-center gap-1.5">
                  {selectedCard.linkedSceneId ? (
                    <button
                      type="button"
                      onClick={() => onOpenScene(selectedCard.linkedSceneId)}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors ${accentBtnBg}`}
                    >
                      <span>本文を開く</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    onCreateSceneAndLink && (
                      <button
                        type="button"
                        onClick={() =>
                          onCreateSceneAndLink(plot.plotId, selectedCard.cardId)
                        }
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        <span>
                          {plot.linkedSceneFolder
                            ? `「${plot.linkedSceneFolder}/」に新規作成`
                            : '本文シーンを新規作成'}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Outgoing Connections Manager (for placed cards) */}
              {!selectedCard.inStaging && (
                <div className="space-y-2 border-t border-slate-100 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <GitBranch className="h-3 w-3" />
                      <span>矢印の接続先</span>
                    </span>
                    <span className="font-code text-[10px] text-slate-400 tabular-nums">
                      {(selectedCard.connections ?? []).length}件
                    </span>
                  </div>

                  {(selectedCard.connections ?? []).length > 0 && (
                    <div className="space-y-1.5">
                      {(selectedCard.connections ?? []).map((conn) => {
                        const target = cardMap.get(conn.targetCardId);
                        if (!target) return null;
                        return (
                          <div
                            key={conn.targetCardId}
                            className="rounded-md border border-slate-200 bg-slate-50/70 p-2 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setSelectedCardId(target.cardId)}
                                className="flex items-center gap-1 min-w-0 font-medium text-slate-800 hover:underline"
                              >
                                <span className="font-code text-slate-500">
                                  #{String(target.order).padStart(2, '0')}
                                </span>
                                <span className="truncate">{target.title || '無題'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeConnection(selectedCard.cardId, target.cardId)
                                }
                                title="接続解除"
                                className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={conn.label ?? ''}
                              onChange={(e) =>
                                updateConnectionLabel(
                                  selectedCard.cardId,
                                  target.cardId,
                                  e.target.value
                                )
                              }
                              placeholder="分岐ラベル（任意）"
                              className="w-full rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {placedCards.length > 1 && (
                    <select
                      value=""
                      aria-label="接続先カードを追加"
                      onChange={(e) => {
                        if (e.target.value) {
                          addConnection(selectedCard.cardId, e.target.value);
                        }
                      }}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      <option value="">＋ 接続先カードを追加...</option>
                      {placedCards
                        .filter(
                          (c) =>
                            c.cardId !== selectedCard.cardId &&
                            !(selectedCard.connections ?? []).some(
                              (conn) => conn.targetCardId === c.cardId
                            )
                        )
                        .map((c) => (
                          <option key={c.cardId} value={c.cardId}>
                            #{String(c.order).padStart(2, '0')} {c.title || '無題'}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}

              {/* Story Structure & Cast Section */}
              <div className="border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={() => setDrawerDetailsOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-[11px] font-medium text-slate-600 hover:text-slate-900"
                >
                  <span>構成・舞台・登場キャラ</span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      drawerDetailsOpen ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {drawerDetailsOpen && (
                  <div className="mt-2.5 space-y-2.5">
                    <label className="block space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Target className="h-3 w-3" />
                        <span>ゴール / 目的</span>
                      </span>
                      <input
                        type="text"
                        value={selectedCard.goal ?? ''}
                        onChange={(e) =>
                          updateSingleCard(selectedCard.cardId, { goal: e.target.value })
                        }
                        placeholder="このシーンを終えて変化すること"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <GitBranch className="h-3 w-3" />
                        <span>分岐条件・フラグ</span>
                      </span>
                      <input
                        type="text"
                        value={selectedCard.branchCondition ?? ''}
                        onChange={(e) =>
                          updateSingleCard(selectedCard.cardId, {
                            branchCondition: e.target.value,
                          })
                        }
                        placeholder="例: 好感度3以上 / R18差分あり"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-slate-500">場所</span>
                        <input
                          type="text"
                          value={selectedCard.location ?? ''}
                          onChange={(e) =>
                            updateSingleCard(selectedCard.cardId, {
                              location: e.target.value,
                            })
                          }
                          placeholder="例: 旧校舎屋上"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[11px] text-slate-500">時間帯</span>
                        <input
                          type="text"
                          list="plot-timeofday-presets"
                          value={selectedCard.timeOfDay ?? ''}
                          onChange={(e) =>
                            updateSingleCard(selectedCard.cardId, {
                              timeOfDay: e.target.value,
                            })
                          }
                          placeholder="例: 放課後"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-slate-500">視点 (POV)</span>
                        <select
                          value={selectedCard.povCharacterId ?? ''}
                          onChange={(e) =>
                            updateSingleCard(selectedCard.cardId, {
                              povCharacterId: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                        >
                          <option value="">指定なし</option>
                          <option value="third_person">三人称</option>
                          {characters.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.shortName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <Sparkles className="h-3 w-3" />
                          <span>トーン</span>
                        </span>
                        <input
                          type="text"
                          list="plot-mood-presets"
                          value={selectedCard.mood ?? ''}
                          onChange={(e) =>
                            updateSingleCard(selectedCard.cardId, { mood: e.target.value })
                          }
                          placeholder="例: シリアス"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Bookmark className="h-3 w-3" />
                        <span>伏線・回収メモ</span>
                      </span>
                      <input
                        type="text"
                        value={selectedCard.foreshadowing ?? ''}
                        onChange={(e) =>
                          updateSingleCard(selectedCard.cardId, {
                            foreshadowing: e.target.value,
                          })
                        }
                        placeholder="設置・回収する伏線"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <Clapperboard className="h-3 w-3" />
                        <span>演出・素材メモ</span>
                      </span>
                      <input
                        type="text"
                        value={selectedCard.assetNotes ?? ''}
                        onChange={(e) =>
                          updateSingleCard(selectedCard.cardId, {
                            assetNotes: e.target.value,
                          })
                        }
                        placeholder="BGM・スチル・立ち絵メモ"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                      />
                    </label>

                    {characters.length > 0 && (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <Users className="h-3 w-3" />
                          <span>登場キャラクター</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {characters.map((ch) => {
                            const active = (selectedCard.characters ?? []).includes(ch.id);
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                onClick={() => toggleCharacterOnCard(selectedCard, ch.id)}
                                className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                                  active
                                    ? isAdult
                                      ? 'border-rose-600 bg-rose-700 text-white'
                                      : 'border-slate-800 bg-slate-800 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {ch.shortName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-2 flex items-center justify-between gap-2">
              {hasOtherPlots && onRequestMoveCardToOtherPlot ? (
                <button
                  type="button"
                  onClick={() => onRequestMoveCardToOtherPlot(selectedCard)}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Move className="h-3 w-3" />
                  <span>別プロットへ移動</span>
                </button>
              ) : (
                <span />
              )}

              {confirmDeleteCardId === selectedCard.cardId ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteCard(selectedCard.cardId);
                      setSelectedCardId(null);
                      setConfirmDeleteCardId(null);
                    }}
                    className="rounded bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    削除確定
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCardId(null)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                  >
                    戻る
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCardId(selectedCard.cardId)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>削除</span>
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Floating Preview When Dragging a Card From Staging Tray */}
      {draggingStaging && draggingStaging.hasMoved && draggingStagingCard && (
        <div
          style={{
            left: `${draggingStaging.clientX + 12}px`,
            top: `${draggingStaging.clientY + 12}px`,
          }}
          className="pointer-events-none fixed z-50 w-52 rounded-md border border-sky-400 bg-white/95 p-2.5 shadow-lg"
        >
          <p className="text-xs font-semibold text-slate-900 truncate">
            {draggingStagingCard.title || '無題の仮カード'}
          </p>
          <p className="mt-0.5 text-[10px] text-sky-700">
            {draggingStaging.overCanvas
              ? 'ここで離すとキャンバスに配置'
              : 'キャンバス上へドラッグ'}
          </p>
        </div>
      )}
    </div>
  );
};
