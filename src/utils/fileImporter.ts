import type {
  CharacterCommon,
  CharacterData,
  CharacterRelation,
  PlotCard,
  PlotCardConnection,
  PlotCardPosition,
  PlotCardStatus,
  PlotData,
  PlotScope,
  SceneData,
  ScenarioWorkspace,
  SelectedItem,
  VisibilityType,
  WorldCustomField,
  WorldSettingData,
} from '../types/scenario';
import {
  MAX_REFERENCE_IMAGES,
  MAX_SCENE_IMAGES,
  normalizeReferenceImages,
} from './imageUtils';
import { parseSceneMarkdown } from './scenarioEngine';
import {
  getCharacterFilename,
  getPlotFilename,
  getSceneFilename,
  getWorldFilename,
  normalizeWorkspace,
  sanitizeCharacterFolderName,
  sanitizeFilename,
  sanitizeSceneFolderName,
  sanitizeWorldFolderName,
} from './storageManager';

export type ImportEntityType = 'character' | 'world' | 'plot' | 'scene';

export interface ImportNotification {
  id: number;
  kind: 'success' | 'partial' | 'error';
  message: string;
  details?: string[];
}

export interface ImportExecutionResult {
  nextWorkspace: ScenarioWorkspace;
  importedCount: number;
  firstSelectedItem?: SelectedItem;
  notification: ImportNotification;
}

const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file safety ceiling
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type DetectedJsonKind =
  | 'project'
  | 'snapshot'
  | 'character'
  | 'world'
  | 'plot'
  | 'scene_images'
  | 'unknown';

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function safeParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stripBom(text), (key, value) => {
      if (DANGEROUS_KEYS.has(key)) return undefined;
      return value;
    });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function safeParseJsonAny(text: string): unknown {
  try {
    return JSON.parse(stripBom(text), (key, value) => {
      if (DANGEROUS_KEYS.has(key)) return undefined;
      return value;
    });
  } catch {
    return null;
  }
}

function detectJsonFileKind(obj: Record<string, unknown>): DetectedJsonKind {
  if (obj.workspace && typeof obj.workspace === 'object') {
    return 'snapshot';
  }
  if (Array.isArray(obj.chapters) && typeof obj.title === 'string') {
    return 'project';
  }
  if (typeof obj.sceneId === 'string' && Array.isArray(obj.images) && !('cards' in obj)) {
    return 'scene_images';
  }
  if (typeof obj.plotId === 'string' || Array.isArray(obj.cards)) {
    return 'plot';
  }
  if (obj.common && typeof obj.common === 'object' && !Array.isArray(obj.common)) {
    return 'character';
  }
  if (
    typeof obj.summary === 'string' ||
    typeof obj.details === 'string' ||
    typeof obj.enableAdultNote === 'boolean' ||
    Array.isArray(obj.relatedCharacterIds) ||
    Array.isArray(obj.customFields)
  ) {
    return 'world';
  }
  return 'unknown';
}

function buildWrongKindMessage(filename: string, detected: DetectedJsonKind, expectedLabel: string): string {
  switch (detected) {
    case 'project':
      return `${filename}: プロジェクト設定（project.json）は個別読み込みできません。`;
    case 'snapshot':
      return `${filename}: バックアップ履歴ファイルです。画面上部の「履歴」から復元してください。`;
    case 'character':
      return `${filename}: キャラクター設定ファイルです。characters/ から読み込んでください。`;
    case 'world':
      return `${filename}: 世界観設定ファイルです。world/ から読み込んでください。`;
    case 'plot':
      return `${filename}: プロットファイルです。plots/ から読み込んでください。`;
    case 'scene_images':
      return `${filename}: シーン画像データです。対応するシーン（.md）と一緒に scenes/ へ読み込んでください。`;
    default:
      return `${filename}: ${expectedLabel}として読み込めない形式のJSONです。`;
  }
}

function makeUniqueId(
  rawBase: string | undefined,
  existingIds: Set<string>,
  fallbackPrefix: string
): string {
  const cleaned = (rawBase ?? '')
    .trim()
    .replace(/\.(json|md|txt)$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  const base = cleaned || `${fallbackPrefix}_${Date.now().toString(36).slice(-4)}`;
  if (!existingIds.has(base)) {
    existingIds.add(base);
    return base;
  }

  let suffix = 2;
  while (existingIds.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  const unique = `${base}_${suffix}`;
  existingIds.add(unique);
  return unique;
}

function makeUniqueFilename(
  rawFilename: string,
  ext: '.json' | '.md',
  existingLowerNames: Set<string>,
  fallbackStem: string
): string {
  const sanitized = sanitizeFilename(rawFilename, fallbackStem, ext);
  const stem = sanitized.slice(0, sanitized.length - ext.length);

  if (!existingLowerNames.has(sanitized.toLowerCase())) {
    existingLowerNames.add(sanitized.toLowerCase());
    return sanitized;
  }

  let suffix = 2;
  while (existingLowerNames.has(`${stem}_${suffix}${ext}`.toLowerCase())) {
    suffix += 1;
  }
  const unique = `${stem}_${suffix}${ext}`;
  existingLowerNames.add(unique.toLowerCase());
  return unique;
}

function getStringField(obj: Record<string, unknown>, key: string, fallback = ''): string {
  const v = obj[key];
  return typeof v === 'string' ? v : fallback;
}

function buildNotification(
  importedNames: string[],
  errors: string[],
  fallbackEmptyMsg: string
): ImportNotification {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  if (importedNames.length === 0) {
    return {
      id,
      kind: 'error',
      message: errors[0] ?? fallbackEmptyMsg,
      details: errors.length > 1 ? errors.slice(1) : undefined,
    };
  }
  if (errors.length > 0) {
    return {
      id,
      kind: 'partial',
      message: `${importedNames.length}件を読み込みました（${errors.length}件スキップ）`,
      details: errors,
    };
  }
  if (importedNames.length === 1) {
    return {
      id,
      kind: 'success',
      message: `「${importedNames[0]}」を読み込みました`,
    };
  }
  return {
    id,
    kind: 'success',
    message: `「${importedNames[0]}」ほか${importedNames.length - 1}件を読み込みました`,
  };
}

async function importCharacterFiles(
  files: File[],
  workspace: ScenarioWorkspace,
  targetFolder?: string
): Promise<ImportExecutionResult> {
  const existingIds = new Set(workspace.characters.map((c) => c.id));
  const usedFilenamesByFolder = new Map<string, Set<string>>();
  for (const ch of workspace.characters) {
    const fKey = sanitizeCharacterFolderName(ch.folder).toLowerCase();
    const set = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
    set.add(getCharacterFilename(ch).toLowerCase());
    usedFilenamesByFolder.set(fKey, set);
  }

  const parsedEntries: Array<{
    raw: Record<string, unknown>;
    originalId: string;
    newId: string;
    folder?: string;
    filename: string;
  }> = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      errors.push(`${file.name}: キャラクター読み込みは .json ファイルに対応しています。`);
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      errors.push(`${file.name}: ファイルサイズが大きすぎます（上限20MB）。`);
      continue;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      errors.push(`${file.name}: ファイルの読み込みに失敗しました。`);
      continue;
    }
    const obj = safeParseJsonObject(text);
    if (!obj) {
      errors.push(`${file.name}: JSONとして解析できませんでした。`);
      continue;
    }

    const detected = detectJsonFileKind(obj);
    if (detected !== 'character') {
      errors.push(buildWrongKindMessage(file.name, detected, 'キャラクター設定'));
      continue;
    }

    const originalId = getStringField(obj, 'id').trim();
    const newId = makeUniqueId(originalId || file.name, existingIds, 'char');
    const resolvedFolder =
      targetFolder !== undefined
        ? sanitizeCharacterFolderName(targetFolder) || undefined
        : sanitizeCharacterFolderName(getStringField(obj, 'folder')) || undefined;
    const fKey = (resolvedFolder ?? '').toLowerCase();
    const folderFileSet = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
    usedFilenamesByFolder.set(fKey, folderFileSet);

    const filename = makeUniqueFilename(
      getStringField(obj, 'filename') || file.name,
      '.json',
      folderFileSet,
      newId
    );

    parsedEntries.push({
      raw: obj,
      originalId,
      newId,
      folder: resolvedFolder,
      filename,
    });
  }

  if (parsedEntries.length === 0) {
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: buildNotification(
        [],
        errors,
        '読み込めるキャラクター設定ファイル（.json）がありませんでした。'
      ),
    };
  }

  const batchIdRemap = new Map<string, string>();
  for (const entry of parsedEntries) {
    if (entry.originalId) {
      batchIdRemap.set(entry.originalId, entry.newId);
    }
  }
  const allValidCharIds = new Set<string>([
    ...workspace.characters.map((c) => c.id),
    ...parsedEntries.map((e) => e.newId),
  ]);

  const importedChars: CharacterData[] = [];
  const importedNames: string[] = [];

  for (const entry of parsedEntries) {
    const raw = entry.raw;
    const rawCommon = (raw.common as Record<string, unknown>) ?? {};
    const stemName = entry.filename.replace(/\.json$/i, '');
    const displayName = getStringField(rawCommon, 'name').trim() || stemName;
    const shortName =
      getStringField(raw, 'shortName').trim() || displayName.slice(0, 8) || entry.newId;

    const common: CharacterCommon = {
      name: displayName,
      ruby: getStringField(rawCommon, 'ruby'),
      firstPerson: getStringField(rawCommon, 'firstPerson', '私'),
      ageDisplay: getStringField(rawCommon, 'ageDisplay'),
      gender: getStringField(rawCommon, 'gender'),
      relationship: getStringField(rawCommon, 'relationship'),
      callPartner: getStringField(rawCommon, 'callPartner'),
      secondPerson: getStringField(rawCommon, 'secondPerson'),
      speechStyle: getStringField(rawCommon, 'speechStyle'),
      costume: getStringField(rawCommon, 'costume') || getStringField(rawCommon, 'costumeId'),
      personality: getStringField(rawCommon, 'personality'),
      height: getStringField(rawCommon, 'height'),
      weight: getStringField(rawCommon, 'weight'),
      bodyType: getStringField(rawCommon, 'bodyType'),
      hairstyle: getStringField(rawCommon, 'hairstyle'),
      facialFeatures: getStringField(rawCommon, 'facialFeatures'),
      posture: getStringField(rawCommon, 'posture'),
      hobbies: getStringField(rawCommon, 'hobbies'),
      skills: getStringField(rawCommon, 'skills'),
      specialAbilities: getStringField(rawCommon, 'specialAbilities'),
      weaknesses: getStringField(rawCommon, 'weaknesses'),
    };

    const rawProfiles =
      raw.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles)
        ? (raw.profiles as Record<string, unknown>)
        : {};
    const toStringMap = (src: unknown): Record<string, string> => {
      if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    };

    const rawRelations = Array.isArray(raw.relations) ? raw.relations : [];
    const relations: CharacterRelation[] = [];
    for (const rel of rawRelations) {
      if (!rel || typeof rel !== 'object' || Array.isArray(rel)) continue;
      const relObj = rel as Record<string, unknown>;
      const rawTarget = getStringField(relObj, 'targetCharacterId').trim();
      if (!rawTarget) continue;
      const mappedTarget = batchIdRemap.get(rawTarget) ?? rawTarget;
      if (mappedTarget === entry.newId || !allValidCharIds.has(mappedTarget)) continue;
      const enableAdultOverride = Boolean(relObj.enableAdultOverride);
      const adultCallPartner = getStringField(relObj, 'adultCallPartner');
      const adultRelationship = getStringField(relObj, 'adultRelationship');
      relations.push({
        targetCharacterId: mappedTarget,
        callPartner: getStringField(relObj, 'callPartner'),
        relationship: getStringField(relObj, 'relationship'),
        ...(enableAdultOverride ? { enableAdultOverride: true } : {}),
        ...(adultCallPartner ? { adultCallPartner } : {}),
        ...(adultRelationship ? { adultRelationship } : {}),
      });
    }

    const images = normalizeReferenceImages(raw.images, MAX_REFERENCE_IMAGES);

    const nextChar: CharacterData = {
      id: entry.newId,
      filename: entry.filename,
      folder: entry.folder,
      shortName,
      common,
      ...(images ? { images } : {}),
      customCommonFields: Array.isArray(raw.customCommonFields)
        ? (raw.customCommonFields as CharacterData['customCommonFields'])
        : undefined,
      dualFields: Array.isArray(raw.dualFields)
        ? (raw.dualFields as CharacterData['dualFields'])
        : [],
      profiles: {
        general: toStringMap(rawProfiles.general),
        adult: toStringMap(rawProfiles.adult),
      },
      lockedFields: Array.isArray(raw.lockedFields)
        ? raw.lockedFields.filter((v): v is string => typeof v === 'string')
        : [],
      hiddenCommonFields: Array.isArray(raw.hiddenCommonFields)
        ? raw.hiddenCommonFields.filter((v): v is string => typeof v === 'string')
        : undefined,
      ...(relations.length > 0 ? { relations } : {}),
    };

    importedChars.push(nextChar);
    importedNames.push(displayName);
  }

  const nextCharacters = [...workspace.characters, ...importedChars];
  const nextFolders = [...(workspace.project.characterFolders ?? [])];
  for (const ch of importedChars) {
    if (ch.folder && !nextFolders.includes(ch.folder)) {
      nextFolders.push(ch.folder);
    }
  }

  const nextWorkspace = normalizeWorkspace({
    ...workspace,
    characters: nextCharacters,
    project: {
      ...workspace.project,
      characterFolders: nextFolders,
      characterOrder: nextCharacters.map((c) => c.id),
    },
  });

  return {
    nextWorkspace,
    importedCount: importedChars.length,
    firstSelectedItem: { type: 'character', id: importedChars[0].id },
    notification: buildNotification(
      importedNames,
      errors,
      'キャラクターを読み込めませんでした。'
    ),
  };
}

async function importWorldFiles(
  files: File[],
  workspace: ScenarioWorkspace,
  targetFolder?: string
): Promise<ImportExecutionResult> {
  const existingWorld = workspace.worldSettings ?? [];
  const existingIds = new Set(existingWorld.map((w) => w.id));
  const validCharIds = new Set(workspace.characters.map((c) => c.id));
  const usedFilenamesByFolder = new Map<string, Set<string>>();

  for (const w of existingWorld) {
    const fKey = sanitizeWorldFolderName(w.folder).toLowerCase();
    const set = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
    set.add(getWorldFilename(w).toLowerCase());
    usedFilenamesByFolder.set(fKey, set);
  }

  const importedItems: WorldSettingData[] = [];
  const importedNames: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      errors.push(`${file.name}: 世界観設定の読み込みは .json ファイルに対応しています。`);
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      errors.push(`${file.name}: ファイルサイズが大きすぎます（上限20MB）。`);
      continue;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      errors.push(`${file.name}: ファイルの読み込みに失敗しました。`);
      continue;
    }
    const obj = safeParseJsonObject(text);
    if (!obj) {
      errors.push(`${file.name}: JSONとして解析できませんでした。`);
      continue;
    }

    const detected = detectJsonFileKind(obj);
    if (detected !== 'world') {
      errors.push(buildWrongKindMessage(file.name, detected, '世界観設定'));
      continue;
    }

    const newId = makeUniqueId(getStringField(obj, 'id') || file.name, existingIds, 'world');
    const resolvedFolder =
      targetFolder !== undefined
        ? sanitizeWorldFolderName(targetFolder) || undefined
        : sanitizeWorldFolderName(getStringField(obj, 'folder')) || undefined;
    const fKey = (resolvedFolder ?? '').toLowerCase();
    const folderFileSet = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
    usedFilenamesByFolder.set(fKey, folderFileSet);

    const filename = makeUniqueFilename(
      getStringField(obj, 'filename') || file.name,
      '.json',
      folderFileSet,
      newId
    );

    const stemName = filename.replace(/\.json$/i, '');
    const name = getStringField(obj, 'name').trim() || stemName;
    const customFields: WorldCustomField[] = Array.isArray(obj.customFields)
      ? obj.customFields
          .filter(
            (f): f is Record<string, unknown> =>
              Boolean(f) && typeof f === 'object' && !Array.isArray(f) && typeof (f as Record<string, unknown>).key === 'string'
          )
          .map((f) => ({
            key: String(f.key).trim(),
            label:
              typeof f.label === 'string' && f.label.trim()
                ? f.label.trim()
                : String(f.key).trim(),
            value: typeof f.value === 'string' ? f.value : '',
            multiline: Boolean(f.multiline),
          }))
          .filter((f) => f.key.length > 0)
      : [];

    const relatedCharacterIds = Array.isArray(obj.relatedCharacterIds)
      ? Array.from(
          new Set(
            obj.relatedCharacterIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.trim())
              .filter((id) => validCharIds.has(id))
          )
        )
      : [];

    const adultNote = getStringField(obj, 'adultNote');
    const enableAdultNote = Boolean(obj.enableAdultNote || adultNote.trim().length > 0);
    const images = normalizeReferenceImages(obj.images, MAX_REFERENCE_IMAGES);

    importedItems.push({
      id: newId,
      filename,
      folder: resolvedFolder,
      name,
      ruby: getStringField(obj, 'ruby'),
      summary: getStringField(obj, 'summary'),
      details: getStringField(obj, 'details'),
      ...(images ? { images } : {}),
      customFields,
      enableAdultNote,
      adultNote,
      relatedCharacterIds,
    });
    importedNames.push(name);
  }

  if (importedItems.length === 0) {
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: buildNotification(
        [],
        errors,
        '読み込める世界観設定ファイル（.json）がありませんでした。'
      ),
    };
  }

  const nextWorld = [...existingWorld, ...importedItems];
  const nextFolders = [...(workspace.project.worldFolders ?? [])];
  for (const item of importedItems) {
    if (item.folder && !nextFolders.includes(item.folder)) {
      nextFolders.push(item.folder);
    }
  }

  const nextWorkspace = normalizeWorkspace({
    ...workspace,
    worldSettings: nextWorld,
    project: {
      ...workspace.project,
      worldFolders: nextFolders,
      worldOrder: nextWorld.map((w) => w.id),
    },
  });

  return {
    nextWorkspace,
    importedCount: importedItems.length,
    firstSelectedItem: { type: 'world', id: importedItems[0].id },
    notification: buildNotification(
      importedNames,
      errors,
      '世界観設定を読み込めませんでした。'
    ),
  };
}

async function importPlotFiles(
  files: File[],
  workspace: ScenarioWorkspace
): Promise<ImportExecutionResult> {
  const existingPlotIds = new Set(workspace.plots.map((p) => p.plotId));
  const existingChapterIds = new Set(workspace.project.chapters.map((ch) => ch.chapterId));
  const usedFilenames = new Set(workspace.plots.map((p) => getPlotFilename(p).toLowerCase()));
  const validCharIds = new Set(workspace.characters.map((c) => c.id));
  const validSceneIds = new Set(workspace.scenes.map((s) => s.sceneId));
  const existingSceneFolders = workspace.project.sceneFolders ?? [];

  const importedPlots: PlotData[] = [];
  const addedChapters: ScenarioWorkspace['project']['chapters'] = [];
  const importedNames: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) {
      errors.push(`${file.name}: プロット読み込みは .json ファイルに対応しています。`);
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      errors.push(`${file.name}: ファイルサイズが大きすぎます（上限20MB）。`);
      continue;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      errors.push(`${file.name}: ファイルの読み込みに失敗しました。`);
      continue;
    }
    const obj = safeParseJsonObject(text);
    if (!obj) {
      errors.push(`${file.name}: JSONとして解析できませんでした。`);
      continue;
    }

    const detected = detectJsonFileKind(obj);
    if (detected !== 'plot') {
      errors.push(buildWrongKindMessage(file.name, detected, 'プロット'));
      continue;
    }

    const newPlotId = makeUniqueId(getStringField(obj, 'plotId') || file.name, existingPlotIds, 'plot');
    const filename = makeUniqueFilename(
      getStringField(obj, 'filename') || file.name,
      '.json',
      usedFilenames,
      newPlotId
    );
    const stemTitle = filename.replace(/\.json$/i, '');
    const title = getStringField(obj, 'title').trim() || stemTitle;

    const rawScope = getStringField(obj, 'scope');
    const scope: PlotScope =
      rawScope === 'route' || rawScope === 'character' || rawScope === 'subplot' || rawScope === 'chapter'
        ? rawScope
        : 'chapter';

    let chapterId: string | undefined;
    if (scope === 'chapter') {
      chapterId = makeUniqueId(getStringField(obj, 'chapterId') || `chapter_${newPlotId}`, existingChapterIds, 'chapter');
      addedChapters.push({
        chapterId,
        title,
        plotId: newPlotId,
        sceneIds: [],
      });
    }

    const requestedLinkedFolder = sanitizeSceneFolderName(getStringField(obj, 'linkedSceneFolder'));
    const matchedSceneFolder = requestedLinkedFolder
      ? existingSceneFolders.find((f) => f.toLowerCase() === requestedLinkedFolder.toLowerCase())
      : undefined;

    const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
    const usedCardIds = new Set<string>();
    const cardIdRemap = new Map<string, string>();
    const cards: PlotCard[] = rawCards
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object' && !Array.isArray(c))
      .map((c, idx) => {
        const rawCardId = getStringField(c, 'cardId').trim();
        const cardId = makeUniqueId(rawCardId || `card_${idx + 1}`, usedCardIds, 'card');
        if (rawCardId) {
          cardIdRemap.set(rawCardId, cardId);
        }
        const rawVis = getStringField(c, 'visibility');
        const visibility: VisibilityType =
          rawVis === 'adult_only' || rawVis === 'general_alt' ? rawVis : 'common';
        const rawStatus = getStringField(c, 'status');
        const status: PlotCardStatus | undefined =
          rawStatus === 'todo' ||
          rawStatus === 'draft' ||
          rawStatus === 'writing' ||
          rawStatus === 'review' ||
          rawStatus === 'done'
            ? rawStatus
            : undefined;
        const rawLinkedScene = getStringField(c, 'linkedSceneId').trim();
        const linkedSceneId = validSceneIds.has(rawLinkedScene) ? rawLinkedScene : '';
        const cardChars = Array.isArray(c.characters)
          ? Array.from(
              new Set(
                c.characters
                  .filter((id): id is string => typeof id === 'string')
                  .map((id) => id.trim())
                  .filter((id) => validCharIds.has(id))
              )
            )
          : [];
        const rawPov = getStringField(c, 'povCharacterId').trim();
        const povCharacterId = rawPov && validCharIds.has(rawPov) ? rawPov : undefined;

        let chartPos: PlotCardPosition | undefined;
        if (c.chartPos && typeof c.chartPos === 'object' && !Array.isArray(c.chartPos)) {
          const posObj = c.chartPos as Record<string, unknown>;
          if (
            typeof posObj.x === 'number' &&
            Number.isFinite(posObj.x) &&
            typeof posObj.y === 'number' &&
            Number.isFinite(posObj.y)
          ) {
            chartPos = { x: posObj.x, y: posObj.y };
          }
        }

        const rawConnections: PlotCardConnection[] = Array.isArray(c.connections)
          ? c.connections
              .filter(
                (conn): conn is Record<string, unknown> =>
                  Boolean(conn) &&
                  typeof conn === 'object' &&
                  !Array.isArray(conn) &&
                  typeof (conn as Record<string, unknown>).targetCardId === 'string'
              )
              .map((conn) => {
                const label = typeof conn.label === 'string' ? conn.label : undefined;
                return {
                  targetCardId: String(conn.targetCardId).trim(),
                  ...(label ? { label } : {}),
                };
              })
              .filter((conn) => conn.targetCardId.length > 0)
          : [];

        return {
          cardId,
          order: typeof c.order === 'number' && Number.isFinite(c.order) ? c.order : idx + 1,
          visibility,
          title: getStringField(c, 'title').trim() || `カード ${idx + 1}`,
          memo: getStringField(c, 'memo'),
          linkedSceneId,
          ...(status ? { status } : {}),
          characters: cardChars,
          ...(povCharacterId ? { povCharacterId } : {}),
          ...(getStringField(c, 'location') ? { location: getStringField(c, 'location') } : {}),
          ...(getStringField(c, 'timeOfDay') ? { timeOfDay: getStringField(c, 'timeOfDay') } : {}),
          ...(getStringField(c, 'mood') ? { mood: getStringField(c, 'mood') } : {}),
          ...(getStringField(c, 'goal') ? { goal: getStringField(c, 'goal') } : {}),
          ...(getStringField(c, 'foreshadowing')
            ? { foreshadowing: getStringField(c, 'foreshadowing') }
            : {}),
          ...(getStringField(c, 'branchCondition')
            ? { branchCondition: getStringField(c, 'branchCondition') }
            : {}),
          ...(typeof c.targetLength === 'number' && Number.isFinite(c.targetLength)
            ? { targetLength: c.targetLength }
            : {}),
          ...(typeof c.targetPages === 'number' && Number.isFinite(c.targetPages)
            ? { targetPages: c.targetPages }
            : {}),
          ...(getStringField(c, 'assetNotes') ? { assetNotes: getStringField(c, 'assetNotes') } : {}),
          ...(chartPos ? { chartPos } : {}),
          ...(rawConnections.length > 0 ? { connections: rawConnections } : {}),
          ...(typeof c.inStaging === 'boolean' ? { inStaging: c.inStaging } : {}),
        };
      });

    // Ensure chart connections only reference valid cardIds within this imported plot
    const cardIdSet = new Set(cards.map((c) => c.cardId));
    for (const card of cards) {
      if (card.connections && card.connections.length > 0) {
        const cleanedConns = card.connections
          .map((conn) => ({
            ...conn,
            targetCardId: cardIdRemap.get(conn.targetCardId) ?? conn.targetCardId,
          }))
          .filter((conn) => conn.targetCardId !== card.cardId && cardIdSet.has(conn.targetCardId));
        card.connections = cleanedConns.length > 0 ? cleanedConns : undefined;
      }
    }

    importedPlots.push({
      plotId: newPlotId,
      filename,
      ...(chapterId ? { chapterId } : {}),
      scope,
      ...(matchedSceneFolder ? { linkedSceneFolder: matchedSceneFolder } : {}),
      title,
      cards,
    });
    importedNames.push(title);
  }

  if (importedPlots.length === 0) {
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: buildNotification(
        [],
        errors,
        '読み込めるプロットファイル（.json）がありませんでした。'
      ),
    };
  }

  const nextPlots = [...workspace.plots, ...importedPlots];
  const nextWorkspace = normalizeWorkspace({
    ...workspace,
    plots: nextPlots,
    project: {
      ...workspace.project,
      plotOrder: nextPlots.map((p) => p.plotId),
      chapters: [...workspace.project.chapters, ...addedChapters],
    },
  });

  return {
    nextWorkspace,
    importedCount: importedPlots.length,
    firstSelectedItem: { type: 'plot', id: importedPlots[0].plotId },
    notification: buildNotification(importedNames, errors, 'プロットを読み込めませんでした。'),
  };
}

async function importSceneFiles(
  files: File[],
  workspace: ScenarioWorkspace,
  targetFolder?: string
): Promise<ImportExecutionResult> {
  const existingSceneIds = new Set(workspace.scenes.map((s) => s.sceneId));
  const validCharIds = new Set(workspace.characters.map((c) => c.id));
  const usedFilenamesByFolder = new Map<string, Set<string>>();

  for (const sc of workspace.scenes) {
    const fKey = sanitizeSceneFolderName(sc.folder).toLowerCase();
    const set = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
    set.add(getSceneFilename(sc).toLowerCase());
    usedFilenamesByFolder.set(fKey, set);
  }

  const sceneTextFiles: File[] = [];
  const sidecarFiles: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.images.json')) {
      sidecarFiles.push(file);
    } else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      sceneTextFiles.push(file);
    } else if (lower.endsWith('.json')) {
      errors.push(
        `${file.name}: シーンの読み込みは .md / .txt（または付属 .images.json）に対応しています。`
      );
    } else {
      errors.push(`${file.name}: 未対応のファイル形式です（.md / .txt に対応）。`);
    }
  }

  if (sceneTextFiles.length === 0) {
    if (sidecarFiles.length > 0) {
      errors.unshift(
        'シーン画像ファイル（.images.json）単体では読み込めません。対応するシーン（.md）と一緒に選択してください。'
      );
    }
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: buildNotification(
        [],
        errors,
        '読み込めるシーンファイル（.md / .txt）がありませんでした。'
      ),
    };
  }

  // Parse optional .images.json sidecar files keyed by lowercase filename stem
  const sidecarByStem = new Map<string, unknown>();
  for (const sf of sidecarFiles) {
    if (sf.size > MAX_IMPORT_FILE_BYTES) continue;
    try {
      const parsed = safeParseJsonAny(await sf.text());
      const rawImgs = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>).images
          : undefined;
      if (Array.isArray(rawImgs)) {
        const stem = sf.name.replace(/\.images\.json$/i, '').toLowerCase();
        sidecarByStem.set(stem, rawImgs);
      }
    } catch {
      // Ignore unreadable sidecar
    }
  }

  const resolvedFolder =
    targetFolder !== undefined ? sanitizeSceneFolderName(targetFolder) || undefined : undefined;
  const fKey = (resolvedFolder ?? '').toLowerCase();
  const folderFileSet = usedFilenamesByFolder.get(fKey) ?? new Set<string>();
  usedFilenamesByFolder.set(fKey, folderFileSet);

  const importedScenes: SceneData[] = [];
  const importedNames: string[] = [];

  for (const file of sceneTextFiles) {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      errors.push(`${file.name}: ファイルサイズが大きすぎます（上限20MB）。`);
      continue;
    }

    let rawContent = '';
    try {
      rawContent = stripBom(await file.text()).replace(/\r\n/g, '\n');
    } catch {
      errors.push(`${file.name}: ファイルの読み込みに失敗しました。`);
      continue;
    }

    const originalStem = file.name.replace(/\.(md|txt)$/i, '');
    const mdCandidateName = `${originalStem}.md`;
    const hasFrontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/.test(rawContent);

    let parsed: SceneData;
    if (hasFrontmatter) {
      parsed = parseSceneMarkdown(mdCandidateName, rawContent);
    } else {
      const body = rawContent.replace(/^\n+|\n+$/g, '');
      const looksLikeManga = /^##\s+P\d+/im.test(body) && /^###\s+コマ\d+/m.test(body);
      parsed = {
        sceneId: originalStem,
        filename: mdCandidateName,
        title: originalStem || '読み込みシーン',
        visibility: 'common',
        characters: [],
        body,
        ...(looksLikeManga
          ? { format: 'manga' as const, mangaBinding: 'rtl' as const, mangaStartPage: 1 }
          : {}),
      };
    }

    const newSceneId = makeUniqueId(parsed.sceneId || originalStem, existingSceneIds, 'scene');
    const filename = makeUniqueFilename(
      parsed.filename || mdCandidateName,
      '.md',
      folderFileSet,
      newSceneId
    );

    const matchedSidecar = sidecarByStem.get(originalStem.toLowerCase());
    const normalizedImgs = normalizeReferenceImages(matchedSidecar, MAX_SCENE_IMAGES);
    const filteredChars = (parsed.characters ?? []).filter((id) => validCharIds.has(id));

    const nextScene: SceneData = {
      ...parsed,
      sceneId: newSceneId,
      filename,
      folder: resolvedFolder,
      title: parsed.title?.trim() || originalStem || newSceneId,
      characters: filteredChars,
      ...(normalizedImgs ? { images: normalizedImgs } : {}),
    };

    importedScenes.push(nextScene);
    importedNames.push(nextScene.title);
  }

  if (importedScenes.length === 0) {
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: buildNotification([], errors, 'シーンを読み込めませんでした。'),
    };
  }

  const nextScenes = [...workspace.scenes, ...importedScenes];
  const nextFolders = [...(workspace.project.sceneFolders ?? [])];
  if (resolvedFolder && !nextFolders.includes(resolvedFolder)) {
    nextFolders.push(resolvedFolder);
  }
  const importedIds = importedScenes.map((s) => s.sceneId);

  const nextWorkspace = normalizeWorkspace({
    ...workspace,
    scenes: nextScenes,
    project: {
      ...workspace.project,
      sceneFolders: nextFolders,
      sceneOrder: nextScenes.map((s) => s.sceneId),
      chapters: workspace.project.chapters.map((ch, idx) =>
        idx === 0 ? { ...ch, sceneIds: [...ch.sceneIds, ...importedIds] } : ch
      ),
    },
  });

  return {
    nextWorkspace,
    importedCount: importedScenes.length,
    firstSelectedItem: { type: 'scene', id: importedScenes[0].sceneId },
    notification: buildNotification(importedNames, errors, 'シーンを読み込めませんでした。'),
  };
}

export async function importFilesIntoWorkspace(
  type: ImportEntityType,
  files: File[],
  workspace: ScenarioWorkspace,
  targetFolder?: string
): Promise<ImportExecutionResult> {
  if (!files || files.length === 0) {
    return {
      nextWorkspace: workspace,
      importedCount: 0,
      notification: {
        id: Date.now(),
        kind: 'error',
        message: 'ファイルが選択されていません。',
      },
    };
  }

  switch (type) {
    case 'character':
      return importCharacterFiles(files, workspace, targetFolder);
    case 'world':
      return importWorldFiles(files, workspace, targetFolder);
    case 'plot':
      return importPlotFiles(files, workspace);
    case 'scene':
      return importSceneFiles(files, workspace, targetFolder);
  }
}
