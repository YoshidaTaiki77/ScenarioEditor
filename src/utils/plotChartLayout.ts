import type { PlotCard, PlotCardConnection, PlotCardPosition } from '../types/scenario';

export const CHART_CARD_WIDTH = 228;
export const CHART_CARD_HEIGHT = 114;
export const CHART_GRID_SNAP = 20;
export const CHART_PITCH_X = 300;
export const CHART_PITCH_Y = 160;
export const CHART_ORIGIN_X = 60;
export const CHART_ORIGIN_Y = 80;
export const SAME_COLUMN_TOLERANCE = 110;

export function snapToGrid(value: number, enabled = true, grid = CHART_GRID_SNAP): number {
  if (!enabled) return Math.round(value);
  return Math.round(value / grid) * grid;
}

/**
 * Remove invalid, duplicate, or self-referencing connections across all cards.
 */
export function cleanupCardConnections(cards: PlotCard[]): PlotCard[] {
  const validIds = new Set(cards.map((c) => c.cardId));
  return cards.map((card) => {
    if (!card.connections || card.connections.length === 0) return card;
    const seen = new Set<string>();
    const cleaned: PlotCardConnection[] = [];
    for (const conn of card.connections) {
      if (
        !conn.targetCardId ||
        conn.targetCardId === card.cardId ||
        !validIds.has(conn.targetCardId) ||
        seen.has(conn.targetCardId)
      ) {
        continue;
      }
      seen.add(conn.targetCardId);
      const trimmedLabel = conn.label?.trim();
      cleaned.push(
        trimmedLabel
          ? { targetCardId: conn.targetCardId, label: trimmedLabel }
          : { targetCardId: conn.targetCardId }
      );
    }
    return {
      ...card,
      connections: cleaned.length > 0 ? cleaned : undefined,
    };
  });
}

/**
 * Default Y offset by visibility so general/adult branches visually separate slightly
 * on first automatic layout while still reading clearly left-to-right.
 */
function visibilityInitialRowOffset(card: PlotCard): number {
  if (card.visibility === 'adult_only') return 60;
  if (card.visibility === 'general_alt') return -20;
  return 20;
}

/**
 * Ensure every non-staging card has a chartPos.
 * Existing coordinates are never overwritten; only missing ones are populated.
 */
export function ensureChartPositions(cards: PlotCard[]): {
  cards: PlotCard[];
  changed: boolean;
} {
  const sorted = [...cards].sort((a, b) => a.order - b.order);
  const placed = sorted.filter((c) => !c.inStaging);
  const hasAnyPos = placed.some((c) => Boolean(c.chartPos));

  let maxRightX = CHART_ORIGIN_X - CHART_PITCH_X;
  let baselineY = CHART_ORIGIN_Y + 20;
  for (const c of placed) {
    if (c.chartPos) {
      if (c.chartPos.x > maxRightX) {
        maxRightX = c.chartPos.x;
        baselineY = c.chartPos.y;
      }
    }
  }

  let changed = false;
  let unplacedIdx = 0;

  const updatedMap = new Map<string, PlotCard>();
  for (const card of sorted) {
    if (card.inStaging || card.chartPos) {
      updatedMap.set(card.cardId, card);
      continue;
    }

    changed = true;
    let nextPos: PlotCardPosition;
    if (!hasAnyPos) {
      nextPos = {
        x: snapToGrid(CHART_ORIGIN_X + unplacedIdx * CHART_PITCH_X),
        y: snapToGrid(Math.max(40, CHART_ORIGIN_Y + visibilityInitialRowOffset(card))),
      };
    } else {
      nextPos = {
        x: snapToGrid(maxRightX + CHART_PITCH_X * (unplacedIdx + 1)),
        y: snapToGrid(Math.max(40, baselineY)),
      };
    }
    unplacedIdx += 1;
    updatedMap.set(card.cardId, { ...card, chartPos: nextPos });
  }

  if (!changed) {
    return { cards, changed: false };
  }

  return {
    cards: cards.map((c) => updatedMap.get(c.cardId) ?? c),
    changed: true,
  };
}

/**
 * Synchronize PlotCard.order from 2D canvas positions:
 * - Placed cards are sorted left-to-right; cards within SAME_COLUMN_TOLERANCE of a column's
 *   leading X are grouped into the same timing column and ordered top-to-bottom.
 * - Staging cards (inStaging === true) follow after placed cards in their relative order.
 */
export function syncOrderFromChart(cards: PlotCard[]): PlotCard[] {
  const placed = cards.filter((c) => !c.inStaging);
  const staging = cards
    .filter((c) => Boolean(c.inStaging))
    .sort((a, b) => a.order - b.order);

  const byX = [...placed].sort((a, b) => {
    const ax = a.chartPos?.x ?? Number.MAX_SAFE_INTEGER;
    const bx = b.chartPos?.x ?? Number.MAX_SAFE_INTEGER;
    if (ax !== bx) return ax - bx;
    const ay = a.chartPos?.y ?? 0;
    const by = b.chartPos?.y ?? 0;
    if (ay !== by) return ay - by;
    return a.order - b.order;
  });

  const orderedPlaced: PlotCard[] = [];
  let i = 0;
  while (i < byX.length) {
    const columnAnchorX = byX[i].chartPos?.x ?? 0;
    const column: PlotCard[] = [byX[i]];
    let j = i + 1;
    while (j < byX.length) {
      const nextX = byX[j].chartPos?.x ?? 0;
      if (Math.abs(nextX - columnAnchorX) <= SAME_COLUMN_TOLERANCE) {
        column.push(byX[j]);
        j += 1;
      } else {
        break;
      }
    }
    column.sort((a, b) => {
      const ay = a.chartPos?.y ?? 0;
      const by = b.chartPos?.y ?? 0;
      if (ay !== by) return ay - by;
      const ax = a.chartPos?.x ?? 0;
      const bx = b.chartPos?.x ?? 0;
      if (ax !== bx) return ax - bx;
      return a.order - b.order;
    });
    orderedPlaced.push(...column);
    i = j;
  }

  return [...orderedPlaced, ...staging].map((card, idx) => ({
    ...card,
    order: idx + 1,
  }));
}

/**
 * Bidirectional sync helper: when cards are reordered from the linear timeline/grid list,
 * redistribute the existing canvas coordinate slots (ordered by previous list order)
 * to the newly ordered placed cards so the chart remains aligned with #01, #02...
 */
export function reassignChartSlotsAfterListReorder(
  prevSorted: PlotCard[],
  nextSorted: PlotCard[]
): PlotCard[] {
  const prevPlaced = prevSorted.filter((c) => !c.inStaging);
  const nextPlaced = nextSorted.filter((c) => !c.inStaging);

  if (prevPlaced.length !== nextPlaced.length) {
    return nextSorted;
  }

  const slots = prevPlaced
    .map((c) => c.chartPos)
    .filter((pos): pos is PlotCardPosition => Boolean(pos));

  // Only swap coordinate slots when every placed card already has chart coordinates
  if (slots.length !== prevPlaced.length || slots.length === 0) {
    return nextSorted;
  }

  const slotMap = new Map<string, PlotCardPosition>();
  nextPlaced.forEach((card, idx) => {
    slotMap.set(card.cardId, { ...slots[idx] });
  });

  return nextSorted.map((card) => {
    const assigned = slotMap.get(card.cardId);
    return assigned ? { ...card, chartPos: assigned } : card;
  });
}

/**
 * Tidy / auto-layout placed cards left-to-right using topological depth from connections.
 * Gracefully handles disconnected cards and cycles, then syncs card.order.
 */
export function computeTidyLayout(cards: PlotCard[]): PlotCard[] {
  const cleaned = cleanupCardConnections(cards);
  const placed = cleaned
    .filter((c) => !c.inStaging)
    .sort((a, b) => a.order - b.order);
  const staging = cleaned
    .filter((c) => Boolean(c.inStaging))
    .sort((a, b) => a.order - b.order);

  if (placed.length === 0) {
    return staging.map((c, idx) => ({ ...c, order: idx + 1 }));
  }

  const placedIds = new Set(placed.map((c) => c.cardId));
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const c of placed) {
    outgoing.set(c.cardId, []);
    inDegree.set(c.cardId, 0);
  }

  let hasAnyEdge = false;
  for (const c of placed) {
    const targets = (c.connections ?? [])
      .map((conn) => conn.targetCardId)
      .filter((tid) => placedIds.has(tid) && tid !== c.cardId);
    if (targets.length > 0) hasAnyEdge = true;
    outgoing.set(c.cardId, targets);
    for (const tid of targets) {
      inDegree.set(tid, (inDegree.get(tid) ?? 0) + 1);
    }
  }

  const depth = new Map<string, number>();

  if (!hasAnyEdge) {
    // Pure timeline layout: neat horizontal flow
    placed.forEach((c, idx) => depth.set(c.cardId, idx));
  } else {
    // Kahn's topological layering with longest-path column assignment
    const queue: PlotCard[] = placed.filter((c) => (inDegree.get(c.cardId) ?? 0) === 0);
    const visited = new Set<string>();
    const orderRank = new Map(placed.map((c, idx) => [c.cardId, idx]));

    queue.sort((a, b) => (orderRank.get(a.cardId) ?? 0) - (orderRank.get(b.cardId) ?? 0));
    for (const root of queue) {
      depth.set(root.cardId, 0);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      visited.add(curr.cardId);
      const currDepth = depth.get(curr.cardId) ?? 0;

      for (const nextId of outgoing.get(curr.cardId) ?? []) {
        const nextDepth = Math.max(depth.get(nextId) ?? 0, currDepth + 1);
        depth.set(nextId, nextDepth);
        const deg = (inDegree.get(nextId) ?? 1) - 1;
        inDegree.set(nextId, deg);
        if (deg === 0) {
          const cardObj = placed.find((c) => c.cardId === nextId);
          if (cardObj) queue.push(cardObj);
        }
      }
    }

    // Any cards involved in cycles: append after max assigned depth in their existing order
    let maxDepth = 0;
    for (const d of depth.values()) {
      if (d > maxDepth) maxDepth = d;
    }
    for (const c of placed) {
      if (!visited.has(c.cardId)) {
        maxDepth += 1;
        depth.set(c.cardId, maxDepth);
      }
    }
  }

  // Group placed cards by column depth
  const columns = new Map<number, PlotCard[]>();
  for (const c of placed) {
    const col = depth.get(c.cardId) ?? 0;
    const list = columns.get(col) ?? [];
    list.push(c);
    columns.set(col, list);
  }

  const maxRows = Math.max(1, ...Array.from(columns.values()).map((col) => col.length));
  const centerY = CHART_ORIGIN_Y + ((maxRows - 1) * CHART_PITCH_Y) / 2;

  const positioned = new Map<string, PlotCardPosition>();
  for (const [colIdx, colCards] of columns.entries()) {
    colCards.sort((a, b) => {
      const ay = a.chartPos?.y ?? a.order * 10;
      const by = b.chartPos?.y ?? b.order * 10;
      if (ay !== by) return ay - by;
      return a.order - b.order;
    });
    const colHeight = (colCards.length - 1) * CHART_PITCH_Y;
    const startY = Math.max(40, centerY - colHeight / 2);
    colCards.forEach((c, rowIdx) => {
      positioned.set(c.cardId, {
        x: snapToGrid(CHART_ORIGIN_X + colIdx * CHART_PITCH_X),
        y: snapToGrid(startY + rowIdx * CHART_PITCH_Y),
      });
    });
  }

  const nextCards = cleaned.map((c) => {
    const pos = positioned.get(c.cardId);
    return pos ? { ...c, chartPos: pos } : c;
  });

  return syncOrderFromChart(nextCards);
}

/**
 * Connect placed cards sequentially (#01 -> #02 -> #03 ...) while keeping existing labels
 * on edges that already exist.
 */
export function buildSequentialConnections(cards: PlotCard[]): PlotCard[] {
  const placed = cards
    .filter((c) => !c.inStaging)
    .sort((a, b) => a.order - b.order);

  const nextMap = new Map<string, PlotCardConnection[]>();
  for (let i = 0; i < placed.length; i += 1) {
    const curr = placed[i];
    const next = placed[i + 1];
    if (!next) {
      nextMap.set(curr.cardId, curr.connections ?? []);
      continue;
    }
    const existing = curr.connections ?? [];
    const alreadyLinked = existing.some((conn) => conn.targetCardId === next.cardId);
    nextMap.set(
      curr.cardId,
      alreadyLinked ? existing : [...existing, { targetCardId: next.cardId }]
    );
  }

  return cleanupCardConnections(
    cards.map((c) => {
      if (c.inStaging) return c;
      const nextConns = nextMap.get(c.cardId);
      return {
        ...c,
        connections: nextConns && nextConns.length > 0 ? nextConns : undefined,
      };
    })
  );
}

/**
 * Compute a smooth cubic Bezier curve from the right output port of `from`
 * to the left input port of `to`, along with its exact midpoint (t = 0.5) for labels.
 */
export function getEdgeBezierPath(
  from: PlotCardPosition,
  to: PlotCardPosition
): { path: string; midX: number; midY: number; isBackward: boolean } {
  const sx = from.x + CHART_CARD_WIDTH;
  const sy = from.y + CHART_CARD_HEIGHT / 2;
  const tx = to.x;
  const ty = to.y + CHART_CARD_HEIGHT / 2;

  const dx = tx - sx;
  const isBackward = dx < 24;

  let cx1: number;
  let cy1: number;
  let cx2: number;
  let cy2: number;

  if (!isBackward) {
    const handle = Math.min(180, Math.max(48, dx * 0.45));
    cx1 = sx + handle;
    cy1 = sy;
    cx2 = tx - handle;
    cy2 = ty;
  } else {
    // Arc gracefully above or below when connecting right-to-left / loopback
    const arcY = Math.min(sy, ty) - Math.min(150, 75 + Math.abs(dx) * 0.12);
    cx1 = sx + 80;
    cy1 = arcY;
    cx2 = tx - 80;
    cy2 = arcY;
  }

  // Exact cubic Bezier point at t = 0.5
  const midX = 0.125 * sx + 0.375 * cx1 + 0.375 * cx2 + 0.125 * tx;
  const midY = 0.125 * sy + 0.375 * cy1 + 0.375 * cy2 + 0.125 * ty;

  const path = `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
  return { path, midX, midY, isBackward };
}

/**
 * Compute bounding box of placed cards in world coordinates.
 */
export function getChartBounds(cards: PlotCard[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  const placed = cards.filter((c) => !c.inStaging && c.chartPos);
  if (placed.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of placed) {
    const pos = c.chartPos!;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + CHART_CARD_WIDTH > maxX) maxX = pos.x + CHART_CARD_WIDTH;
    if (pos.y + CHART_CARD_HEIGHT > maxY) maxY = pos.y + CHART_CARD_HEIGHT;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
