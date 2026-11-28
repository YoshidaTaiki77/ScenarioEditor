import type {
  ActiveMode,
  CharacterData,
  MangaBindingDirection,
  MangaExportOptions,
  MangaPage,
  MangaPanel,
  MangaSpeech,
  MangaSpeechType,
  ProjectData,
  ProofreadIssue,
  SceneData,
  WorldSettingData,
} from '../types/scenario';
import { compileSceneText, isSceneVisibleInMode } from './scenarioEngine';

export const MANGA_SPEECH_TYPE_META: Record<
  MangaSpeechType,
  { label: string; tag: string; badgeStyle: string }
> = {
  dialogue: {
    label: '通常セリフ',
    tag: '通常',
    badgeStyle: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  monologue: {
    label: 'モノローグ（心の声）',
    tag: 'モノローグ',
    badgeStyle: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  narration: {
    label: 'ナレーション（枠）',
    tag: 'ナレーション',
    badgeStyle: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  shout: {
    label: '叫び・強調',
    tag: '叫び',
    badgeStyle: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  whisper: {
    label: '欄外・小文字',
    tag: '小文字',
    badgeStyle: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
};

export const MANGA_SPEECH_TYPES: MangaSpeechType[] = [
  'dialogue',
  'monologue',
  'narration',
  'shout',
  'whisper',
];

export const DEFAULT_MANGA_EXPORT_OPTIONS: MangaExportOptions = {
  includeMonologue: true,
  includeNarration: true,
  includeSfx: false,
  includeSpeakerComment: false,
  pageSeparator: 'double_blank',
};

export const MANGA_SPEECH_CHAR_WARNING_LIMIT = 45;
export const MANGA_PAGE_PANEL_WARNING_LIMIT = 8;
export const MANGA_PAGE_CHAR_WARNING_LIMIT = 200;

let idCounter = 0;
function makeLocalId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createEmptyMangaSpeech(speaker = ''): MangaSpeech {
  return {
    id: makeLocalId('sp'),
    speaker,
    type: 'dialogue',
    text: '',
  };
}

export function createEmptyMangaPanel(defaultSpeaker = ''): MangaPanel {
  return {
    id: makeLocalId('pn'),
    visual: '',
    speeches: defaultSpeaker ? [createEmptyMangaSpeech(defaultSpeaker)] : [],
    sfx: '',
  };
}

export function createEmptyMangaPage(panelCount = 1): MangaPage {
  const panels: MangaPanel[] = [];
  for (let i = 0; i < Math.max(1, panelCount); i++) {
    panels.push(createEmptyMangaPanel());
  }
  return {
    id: makeLocalId('pg'),
    note: '',
    panels,
  };
}

function tagToSpeechType(tag: string): MangaSpeechType {
  const clean = tag.trim();
  if (clean === 'モノローグ' || clean === '心の声' || clean === 'monologue') return 'monologue';
  if (clean === 'ナレーション' || clean === 'ナレ' || clean === 'narration') return 'narration';
  if (clean === '叫び' || clean === '強調' || clean === 'shout') return 'shout';
  if (clean === '小文字' || clean === '欄外' || clean === '小声' || clean === 'whisper') {
    return 'whisper';
  }
  return 'dialogue';
}

function encodeInlineMultiline(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, ' /n ');
}

function decodeInlineMultiline(text: string): string {
  return text.replace(/\s*\/n\s*/g, '\n');
}

function stripOuterBracketsForCsp(text: string): string {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('「') && trimmed.endsWith('」')) ||
    (trimmed.startsWith('『') && trimmed.endsWith('』')) ||
    (trimmed.startsWith('（') && trimmed.endsWith('）'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function serializeMangaMarkdown(pages: MangaPage[]): string {
  const safePages = pages.length > 0 ? pages : [createEmptyMangaPage(1)];
  const blocks: string[] = [];

  safePages.forEach((page, pIdx) => {
    const lines: string[] = [`## P${pIdx + 1}`];
    if (page.note.trim()) {
      lines.push(`> 狙い: ${encodeInlineMultiline(page.note.trim())}`);
    }
    lines.push('');

    const safePanels = page.panels.length > 0 ? page.panels : [createEmptyMangaPanel()];
    safePanels.forEach((panel, kIdx) => {
      lines.push(`### コマ${kIdx + 1}`);
      if (panel.visual.trim()) {
        lines.push(`- 構図: ${encodeInlineMultiline(panel.visual.trim())}`);
      }
      for (const sp of panel.speeches) {
        const tag = MANGA_SPEECH_TYPE_META[sp.type]?.tag ?? '通常';
        const speakerPart = sp.speaker.trim() ? ` ${sp.speaker.trim()}` : '';
        const encodedText = encodeInlineMultiline(sp.text);
        lines.push(`- セリフ[${tag}]${speakerPart}: ${encodedText}`);
      }
      if (panel.sfx.trim()) {
        lines.push(`- 擬音: ${encodeInlineMultiline(panel.sfx.trim())}`);
      }
      lines.push('');
    });

    blocks.push(lines.join('\n').trimEnd());
  });

  return blocks.join('\n\n');
}

export function parseMangaMarkdown(body: string): MangaPage[] {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return [createEmptyMangaPage(1)];
  }

  const lines = trimmed.split(/\r?\n/);
  const hasMangaHeadings = lines.some((l) => /^##\s+P\d+/i.test(l.trim()) || /^###\s+コマ\d+/.test(l.trim()));

  if (!hasMangaHeadings) {
    // Convert plain prose gracefully into P1 / コマ1 so no user text is ever lost
    const speeches: MangaSpeech[] = [];
    const visualLines: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const dialogueMatch = line.match(/^([^\s「『（(]{1,20})([「『（(])([\s\S]*?)([」』）)])$/);
      if (dialogueMatch) {
        const [, speaker, openBracket, content] = dialogueMatch;
        speeches.push({
          id: makeLocalId('sp'),
          speaker,
          type: openBracket === '（' || openBracket === '(' ? 'monologue' : 'dialogue',
          text: content,
        });
      } else {
        visualLines.push(line);
      }
    }
    return [
      {
        id: makeLocalId('pg'),
        note: '',
        panels: [
          {
            id: makeLocalId('pn'),
            visual: visualLines.join('\n'),
            speeches,
            sfx: '',
          },
        ],
      },
    ];
  }

  const pages: MangaPage[] = [];
  let currentPage: MangaPage | null = null;
  let currentPanel: MangaPanel | null = null;

  const ensurePage = (): MangaPage => {
    if (!currentPage) {
      currentPage = {
        id: makeLocalId('pg'),
        note: '',
        panels: [],
      };
      pages.push(currentPage);
    }
    return currentPage;
  };

  const ensurePanel = (): MangaPanel => {
    const page = ensurePage();
    if (!currentPanel) {
      currentPanel = {
        id: makeLocalId('pn'),
        visual: '',
        speeches: [],
        sfx: '',
      };
      page.panels.push(currentPanel);
    }
    return currentPanel;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Page heading: ## P1
    if (/^##\s+P\d+/i.test(line)) {
      currentPage = {
        id: makeLocalId('pg'),
        note: '',
        panels: [],
      };
      pages.push(currentPage);
      currentPanel = null;
      continue;
    }

    // Page note/hook: > 狙い: ...
    const noteMatch = line.match(/^>\s*(?:狙い|めくり|メモ|概要)?\s*[:：]\s*(.*)$/);
    if (noteMatch && currentPage && !currentPanel) {
      currentPage.note = currentPage.note
        ? `${currentPage.note}\n${decodeInlineMultiline(noteMatch[1])}`
        : decodeInlineMultiline(noteMatch[1]);
      continue;
    }

    // Panel heading: ### コマ1
    if (/^###\s+コマ\d+/.test(line) || /^###\s+Panel\s*\d+/i.test(line)) {
      const page = ensurePage();
      currentPanel = {
        id: makeLocalId('pn'),
        visual: '',
        speeches: [],
        sfx: '',
      };
      page.panels.push(currentPanel);
      continue;
    }

    // Visual description: - 構図: ...
    const visualMatch = line.match(/^-\s*(?:構図|絵|ト書き)\s*[:：]\s*(.*)$/);
    if (visualMatch) {
      const panel = ensurePanel();
      const val = decodeInlineMultiline(visualMatch[1]);
      panel.visual = panel.visual ? `${panel.visual}\n${val}` : val;
      continue;
    }

    // Speech: - セリフ[種別] 話者: テキスト
    const speechMatch = line.match(/^-\s*セリフ(?:\[([^\]]+)\])?(?:\s+([^:：]+))?\s*[:：]\s*(.*)$/);
    if (speechMatch) {
      const panel = ensurePanel();
      const [, typeTag = '通常', speakerRaw = '', textRaw = ''] = speechMatch;
      panel.speeches.push({
        id: makeLocalId('sp'),
        speaker: speakerRaw.trim(),
        type: tagToSpeechType(typeTag),
        text: decodeInlineMultiline(textRaw),
      });
      continue;
    }

    // SFX: - 擬音: ...
    const sfxMatch = line.match(/^-\s*(?:擬音|描き文字|SFX)\s*[:：]\s*(.*)$/i);
    if (sfxMatch) {
      const panel = ensurePanel();
      const val = decodeInlineMultiline(sfxMatch[1]);
      panel.sfx = panel.sfx ? `${panel.sfx}\n${val}` : val;
      continue;
    }

    // Fallback: attach unrecognized lines to current panel visual so text is never silently dropped
    const panel = ensurePanel();
    panel.visual = panel.visual ? `${panel.visual}\n${line}` : line;
  }

  // Ensure every page has at least one panel
  for (const p of pages) {
    if (p.panels.length === 0) {
      p.panels.push(createEmptyMangaPanel());
    }
  }

  return pages.length > 0 ? pages : [createEmptyMangaPage(1)];
}

export interface MangaPageSideInfo {
  pageNumber: number;
  side: 'left' | 'right';
  isTurnPage: boolean;
  shortLabel: string;
}

export function getMangaPageSideInfo(
  pageNumber: number,
  binding: MangaBindingDirection = 'rtl'
): MangaPageSideInfo {
  const isOdd = pageNumber % 2 !== 0;
  if (binding === 'rtl') {
    // Japanese right-bound manga: odd pages are on the LEFT (turn page / めくり), even pages are on the RIGHT
    return {
      pageNumber,
      side: isOdd ? 'left' : 'right',
      isTurnPage: isOdd,
      shortLabel: isOdd ? '左・めくり' : '右',
    };
  }
  // Left-bound comic: odd pages are on the RIGHT (turn page), even pages are on the LEFT
  return {
    pageNumber,
    side: isOdd ? 'right' : 'left',
    isTurnPage: isOdd,
    shortLabel: isOdd ? '右・めくり' : '左',
  };
}

export interface MangaSpreadRow {
  spreadIndex: number;
  left?: { page: MangaPage; pageIndex: number; info: MangaPageSideInfo };
  right?: { page: MangaPage; pageIndex: number; info: MangaPageSideInfo };
}

export function buildMangaSpreads(
  pages: MangaPage[],
  startPage = 1,
  binding: MangaBindingDirection = 'rtl'
): MangaSpreadRow[] {
  const rows: MangaSpreadRow[] = [];
  const safeStart = Math.max(1, Math.floor(startPage || 1));

  let i = 0;
  while (i < pages.length) {
    const pageNum = safeStart + i;
    const info = getMangaPageSideInfo(pageNum, binding);

    if (binding === 'rtl') {
      if (info.side === 'left') {
        // Standalone left page (e.g. P1 opening page)
        rows.push({
          spreadIndex: rows.length,
          left: { page: pages[i], pageIndex: i, info },
        });
        i += 1;
      } else {
        // Even page (Right) paired with next odd page (Left)
        const rightSlot = { page: pages[i], pageIndex: i, info };
        const nextPage = pages[i + 1];
        const leftSlot = nextPage
          ? {
              page: nextPage,
              pageIndex: i + 1,
              info: getMangaPageSideInfo(pageNum + 1, binding),
            }
          : undefined;
        rows.push({
          spreadIndex: rows.length,
          left: leftSlot,
          right: rightSlot,
        });
        i += nextPage ? 2 : 1;
      }
    } else {
      if (info.side === 'right') {
        // Standalone right page (e.g. P1 in LTR)
        rows.push({
          spreadIndex: rows.length,
          right: { page: pages[i], pageIndex: i, info },
        });
        i += 1;
      } else {
        const leftSlot = { page: pages[i], pageIndex: i, info };
        const nextPage = pages[i + 1];
        const rightSlot = nextPage
          ? {
              page: nextPage,
              pageIndex: i + 1,
              info: getMangaPageSideInfo(pageNum + 1, binding),
            }
          : undefined;
        rows.push({
          spreadIndex: rows.length,
          left: leftSlot,
          right: rightSlot,
        });
        i += nextPage ? 2 : 1;
      }
    }
  }

  return rows;
}

export function getPageCountGuide(pageCount: number): {
  isMultipleOf4: boolean;
  isMultipleOf8: boolean;
  toNext4: number;
  toNext8: number;
  summary: string;
} {
  const mod4 = pageCount % 4;
  const mod8 = pageCount % 8;
  const toNext4 = mod4 === 0 ? 0 : 4 - mod4;
  const toNext8 = mod8 === 0 ? 0 : 8 - mod8;

  let summary = `${pageCount}P`;
  if (pageCount === 0) {
    summary = '0P';
  } else if (mod8 === 0) {
    summary = `${pageCount}P（8の倍数OK）`;
  } else if (mod4 === 0) {
    summary = `${pageCount}P（4の倍数OK・次の8の倍数まで+${toNext8}P）`;
  } else {
    summary = `${pageCount}P（4の倍数まで+${toNext4}P）`;
  }

  return {
    isMultipleOf4: pageCount > 0 && mod4 === 0,
    isMultipleOf8: pageCount > 0 && mod8 === 0,
    toNext4,
    toNext8,
    summary,
  };
}

export function countPageStats(page: MangaPage): {
  panelCount: number;
  speechCount: number;
  totalChars: number;
} {
  let speechCount = 0;
  let totalChars = 0;
  for (const panel of page.panels) {
    for (const sp of panel.speeches) {
      const cleaned = sp.text.replace(/\s+/g, '');
      if (cleaned.length > 0) {
        speechCount += 1;
        totalChars += cleaned.length;
      }
    }
  }
  return {
    panelCount: page.panels.length,
    speechCount,
    totalChars,
  };
}

export function compileMangaSpeechText(
  text: string,
  characters: CharacterData[],
  worldSettings: WorldSettingData[],
  mode: ActiveMode
): string {
  return compileSceneText(
    text,
    characters,
    mode,
    { stripStructureMarkers: true },
    worldSettings
  ).trim();
}

export function exportCspTypesettingText(
  scenes: SceneData[],
  characters: CharacterData[],
  worldSettings: WorldSettingData[],
  mode: ActiveMode,
  options: MangaExportOptions = DEFAULT_MANGA_EXPORT_OPTIONS
): string {
  const pageBlocks: string[] = [];

  for (const scene of scenes) {
    if (!isSceneVisibleInMode(scene.visibility, mode)) continue;
    const pages = parseMangaMarkdown(scene.body);
    const startPage = Math.max(1, scene.mangaStartPage ?? 1);

    pages.forEach((page, pIdx) => {
      const pageNum = startPage + pIdx;
      const balloons: string[] = [];

      for (const panel of page.panels) {
        for (const sp of panel.speeches) {
          if (sp.type === 'monologue' && !options.includeMonologue) continue;
          if (sp.type === 'narration' && !options.includeNarration) continue;

          const compiled = stripOuterBracketsForCsp(
            compileMangaSpeechText(sp.text, characters, worldSettings, mode)
          );
          if (!compiled) continue;

          if (options.includeSpeakerComment && sp.speaker.trim()) {
            const tag = MANGA_SPEECH_TYPE_META[sp.type]?.tag ?? '通常';
            balloons.push(`// ${sp.speaker.trim()} [${tag}]\n${compiled}`);
          } else {
            balloons.push(compiled);
          }
        }

        if (options.includeSfx && panel.sfx.trim()) {
          const compiledSfx = compileMangaSpeechText(
            panel.sfx,
            characters,
            worldSettings,
            mode
          );
          if (compiledSfx) {
            balloons.push(compiledSfx);
          }
        }
      }

      if (balloons.length === 0) return;

      const joinedBalloons = balloons.join('\n\n');
      if (options.pageSeparator === 'page_header') {
        const scenePrefix = scenes.length > 1 ? `${scene.title} ` : '';
        pageBlocks.push(`--- ${scenePrefix}P${pageNum} ---\n${joinedBalloons}`);
      } else {
        pageBlocks.push(joinedBalloons);
      }
    });
  }

  if (options.pageSeparator === 'page_header') {
    return pageBlocks.join('\n\n\n');
  }
  // 2 blank lines between pages (\n\n\n) for Clip Studio Paint Story Editor page split
  return pageBlocks.join('\n\n\n');
}

export function exportMangaScriptDocument(
  project: ProjectData,
  scenes: SceneData[],
  characters: CharacterData[],
  worldSettings: WorldSettingData[],
  mode: ActiveMode,
  singleScene?: SceneData
): { filename: string; content: string } {
  const suffix = mode === 'general' ? '_normal' : '_r18';
  const targetScenes = singleScene
    ? [singleScene]
    : scenes.filter((s) => s.format === 'manga' && isSceneVisibleInMode(s.visibility, mode));

  const headerLines = [
    `============================================================`,
    `作品名: ${project.title}（マンガ脚本・ネームテキスト）`,
    `出力モード: ${mode === 'general' ? '一般向け (normal)' : '成人向け (R18)'}`,
    `出力日時: ${new Date().toLocaleString('ja-JP')}`,
    `============================================================`,
    '',
  ];

  const sceneBlocks = targetScenes.map((scene) => {
    const pages = parseMangaMarkdown(scene.body);
    const binding = scene.mangaBinding ?? 'rtl';
    const startPage = Math.max(1, scene.mangaStartPage ?? 1);
    const lines: string[] = [
      `■ ${scene.title} (${scene.sceneId}) — 全${pages.length}P / ${binding === 'rtl' ? '右綴じ' : '左綴じ'}`,
      `------------------------------------------------------------`,
    ];

    pages.forEach((page, pIdx) => {
      const pageNum = startPage + pIdx;
      const sideInfo = getMangaPageSideInfo(pageNum, binding);
      lines.push(`【P${pageNum}（${sideInfo.shortLabel}）】`);
      if (page.note.trim()) {
        lines.push(`  狙い・めくり: ${page.note.trim()}`);
      }
      page.panels.forEach((panel, kIdx) => {
        lines.push(`  [コマ${kIdx + 1}]`);
        if (panel.visual.trim()) {
          const compiledVisual = compileMangaSpeechText(
            panel.visual,
            characters,
            worldSettings,
            mode
          );
          if (compiledVisual) {
            lines.push(`    構図: ${compiledVisual.replace(/\n/g, '\n          ')}`);
          }
        }
        for (const sp of panel.speeches) {
          const compiledSpeech = compileMangaSpeechText(
            sp.text,
            characters,
            worldSettings,
            mode
          );
          if (!compiledSpeech) continue;
          const tag = MANGA_SPEECH_TYPE_META[sp.type]?.tag ?? '通常';
          const who = sp.speaker.trim() || '（話者未指定）';
          lines.push(`    ${who}［${tag}］「${compiledSpeech.replace(/\n/g, ' / ')}」`);
        }
        if (panel.sfx.trim()) {
          const compiledSfx = compileMangaSpeechText(panel.sfx, characters, worldSettings, mode);
          if (compiledSfx) {
            lines.push(`    描き文字(SFX): ${compiledSfx}`);
          }
        }
      });
      lines.push('');
    });

    return lines.join('\n');
  });

  const safeTitle = (singleScene ? singleScene.sceneId : project.title)
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 40);

  return {
    filename: `${safeTitle}_manga_script${suffix}.txt`,
    content: [...headerLines, ...sceneBlocks].join('\n'),
  };
}

export function proofreadMangaScene(
  scene: SceneData,
  characters: CharacterData[],
  mode: ActiveMode,
  worldSettings: WorldSettingData[] = []
): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  const lines = (scene.body ?? '').split(/\r?\n/);
  const startPage = Math.max(1, scene.mangaStartPage ?? 1);

  let pageIndex = 0;
  let currentPageLine = 1;
  let currentPagePanelCount = 0;
  let currentPanelIndex = 0;

  const flushPagePanelCountCheck = () => {
    if (pageIndex > 0 && currentPagePanelCount > MANGA_PAGE_PANEL_WARNING_LIMIT) {
      const pageNum = startPage + pageIndex - 1;
      issues.push({
        id: `manga-panels-p${pageNum}-l${currentPageLine}`,
        line: currentPageLine,
        column: 1,
        severity: 'warning',
        category: 'manga',
        message: `P${pageNum} のコマ数が多すぎます（${currentPagePanelCount}コマ／目安 ${MANGA_PAGE_PANEL_WARNING_LIMIT}コマ以内）。ページ分割を検討してください。`,
        snippet: `## P${pageIndex} (${currentPagePanelCount}コマ)`,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();

    if (/^##\s+P\d+/i.test(trimmed)) {
      flushPagePanelCountCheck();
      pageIndex += 1;
      currentPageLine = lineNum;
      currentPagePanelCount = 0;
      currentPanelIndex = 0;
      continue;
    }

    if (/^###\s+コマ\d+/.test(trimmed) || /^###\s+Panel\s*\d+/i.test(trimmed)) {
      if (pageIndex === 0) {
        pageIndex = 1;
        currentPageLine = lineNum;
      }
      currentPagePanelCount += 1;
      currentPanelIndex = currentPagePanelCount;
      continue;
    }

    const speechMatch = trimmed.match(/^-\s*セリフ(?:\[([^\]]+)\])?(?:\s+([^:：]+))?\s*[:：]\s*(.*)$/);
    if (speechMatch) {
      const [, , speakerRaw = '', textRaw = ''] = speechMatch;
      const decoded = decodeInlineMultiline(textRaw);
      const compiled = stripOuterBracketsForCsp(
        compileMangaSpeechText(decoded, characters, worldSettings, mode)
      );
      const charCount = compiled.replace(/\s+/g, '').length;
      if (charCount > MANGA_SPEECH_CHAR_WARNING_LIMIT) {
        const pageNum = startPage + Math.max(0, pageIndex - 1);
        const panelLabel = currentPanelIndex > 0 ? `コマ${currentPanelIndex}` : 'コマ1';
        const speakerLabel = speakerRaw.trim() ? `${speakerRaw.trim()}の` : '';
        issues.push({
          id: `manga-speech-len-${lineNum}`,
          line: lineNum,
          column: 1,
          severity: 'warning',
          category: 'manga',
          message: `P${pageNum} ${panelLabel} の${speakerLabel}フキダシが長めです（${charCount}文字／目安 ${MANGA_SPEECH_CHAR_WARNING_LIMIT}文字以内）。`,
          snippet: compiled.slice(0, 60),
        });
      }
    }
  }

  flushPagePanelCountCheck();
  return issues;
}
