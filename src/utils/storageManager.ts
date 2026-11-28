import {
  DEFAULT_WORLD_FOLDERS,
  STANDARD_CHARACTER_CATEGORIES,
  type CharacterData,
  type CharacterRelation,
  type CustomCommonFieldTemplate,
  type DualProfileFieldDef,
  type HistorySnapshot,
  type HistorySnapshotReason,
  type PlotData,
  type ProjectData,
  type ScenarioWorkspace,
  type SceneData,
  type StorageMode,
  type WorldCustomField,
  type WorldSettingData,
} from '../types/scenario';
import { INITIAL_WORKSPACE } from '../data/initialProject';
import { MAX_SCENE_IMAGES, normalizeReferenceImages } from './imageUtils';
import { parseSceneMarkdown, serializeSceneMarkdown } from './scenarioEngine';

const DB_NAME = 'kotonoha-scenario-db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'current_project';
const DIR_HANDLE_KEY = 'connected_directory_handle';
const HISTORY_KEY = 'history_snapshots';
const LS_FALLBACK_KEY = 'kotonoha_scenario_workspace_v1';
const LS_HISTORY_FALLBACK_KEY = 'kotonoha_scenario_history_v1';

export const HISTORY_DIR_NAME = 'history';
export const MAX_HISTORY_SNAPSHOTS = 5;
export const AUTO_SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface FSFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface FSDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FSDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FSFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<FSFileHandle | FSDirectoryHandle>;
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FSDirectoryHandle>;
  }
}

export interface StorageLoadResult {
  workspace: ScenarioWorkspace;
  storageMode: StorageMode;
  directoryName?: string;
  pendingReconnectDirectoryName?: string;
}

export interface DirectoryConnectResult {
  status: 'connected' | 'needs-init-choice' | 'cancelled' | 'fallback';
  handle?: FSDirectoryHandle;
  loadedWorkspace?: ScenarioWorkspace;
  message: string;
}

export interface ParentDirectoryPickResult {
  status: 'picked' | 'cancelled' | 'unsupported' | 'restricted';
  handle?: FSDirectoryHandle;
  message?: string;
}

const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_SAFE_JSON_CHARS = 50 * 1024 * 1024; // 50MB safety ceiling
const DANGEROUS_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizePathSegment(raw?: string): string {
  const cleaned = (raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return '';
  if (WINDOWS_RESERVED_NAME_RE.test(cleaned)) return '';
  return cleaned.slice(0, 120);
}

export function sanitizeFilename(
  raw: string | undefined,
  fallbackStem: string,
  extension: '.json' | '.md'
): string {
  const extLower = extension.toLowerCase();
  const safeFallbackStem = sanitizePathSegment(fallbackStem) || 'untitled';
  const trimmed = (raw ?? '').trim();
  const strippedExt = trimmed.toLowerCase().endsWith(extLower)
    ? trimmed.slice(0, -extension.length)
    : trimmed;
  const stem = sanitizePathSegment(strippedExt) || safeFallbackStem;
  return `${stem}${extension}`;
}

function safeJsonParse<T>(text: string): T | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SAFE_JSON_CHARS) {
    return null;
  }
  try {
    return JSON.parse(text, (key, value) => {
      if (DANGEROUS_JSON_KEYS.has(key)) return undefined;
      return value;
    }) as T;
  } catch {
    return null;
  }
}

export function sanitizeProjectFolderName(name?: string): string {
  return sanitizePathSegment(name);
}

export function sanitizeCharacterFolderName(folder?: string): string {
  return sanitizePathSegment(folder);
}

export function getCharacterFilename(char: CharacterData): string {
  return sanitizeFilename(char.filename, char.id, '.json');
}

export function getCharacterRelativePath(char: CharacterData): string {
  const folder = sanitizeCharacterFolderName(char.folder);
  const fname = getCharacterFilename(char);
  return folder ? `${folder}/${fname}` : fname;
}

export function getPlotFilename(plot: PlotData): string {
  return sanitizeFilename(plot.filename, plot.plotId, '.json');
}

export function sanitizeSceneFolderName(folder?: string): string {
  return sanitizePathSegment(folder);
}

export function getSceneFilename(scene: SceneData): string {
  return sanitizeFilename(scene.filename, scene.sceneId, '.md');
}

export function getSceneImagesSidecarFilename(scene: SceneData): string {
  const mdName = getSceneFilename(scene);
  return mdName.replace(/\.md$/i, '.images.json');
}

export function getSceneRelativePath(scene: SceneData): string {
  const folder = sanitizeSceneFolderName(scene.folder);
  const fname = getSceneFilename(scene);
  return folder ? `${folder}/${fname}` : fname;
}

export function sanitizeWorldFolderName(folder?: string): string {
  return sanitizePathSegment(folder);
}

export function getWorldFilename(item: WorldSettingData): string {
  return sanitizeFilename(item.filename, item.id, '.json');
}

export function getWorldRelativePath(item: WorldSettingData): string {
  const folder = sanitizeWorldFolderName(item.folder);
  const fname = getWorldFilename(item);
  return folder ? `${folder}/${fname}` : fname;
}

export function canUseFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function normalizeWorkspace(raw: ScenarioWorkspace): ScenarioWorkspace {
  const seedById = new Map(INITIAL_WORKSPACE.characters.map((c) => [c.id, c]));
  const folderSet = new Set<string>();
  const orderedFolders: string[] = [];

  for (const f of raw.project?.characterFolders ?? []) {
    const clean = sanitizeCharacterFolderName(f);
    if (clean && !folderSet.has(clean)) {
      folderSet.add(clean);
      orderedFolders.push(clean);
    }
  }

  const normalizedCharactersRaw = (raw.characters ?? []).map((c) => {
    const seed = seedById.get(c.id);
    const gen = c.profiles?.general ?? {};
    const cleanFolder = sanitizeCharacterFolderName(c.folder);
    if (cleanFolder && !folderSet.has(cleanFolder)) {
      folderSet.add(cleanFolder);
      orderedFolders.push(cleanFolder);
    }

    const normalizedRelations: CharacterRelation[] = [];
    const seenTargetIds = new Set<string>();
    if (Array.isArray(c.relations)) {
      for (const rel of c.relations) {
        const tid = typeof rel?.targetCharacterId === 'string' ? rel.targetCharacterId.trim() : '';
        if (!tid || tid === c.id || seenTargetIds.has(tid)) continue;
        seenTargetIds.add(tid);
        normalizedRelations.push({
          targetCharacterId: tid,
          callPartner: typeof rel.callPartner === 'string' ? rel.callPartner : '',
          relationship: typeof rel.relationship === 'string' ? rel.relationship : '',
          ...(rel.enableAdultOverride ? { enableAdultOverride: true } : {}),
          ...(typeof rel.adultCallPartner === 'string' && rel.adultCallPartner !== ''
            ? { adultCallPartner: rel.adultCallPartner }
            : {}),
          ...(typeof rel.adultRelationship === 'string' && rel.adultRelationship !== ''
            ? { adultRelationship: rel.adultRelationship }
            : {}),
        });
      }
    }

    const normalizedCustomCommonFields = Array.isArray(c.customCommonFields)
      ? c.customCommonFields.map((f) => ({
          key: f.key,
          label: f.label,
          value: typeof f.value === 'string' ? f.value : '',
          multiline: Boolean(f.multiline),
          category:
            typeof f.category === 'string' && f.category.trim() ? f.category.trim() : undefined,
        }))
      : [];

    const normalizedImages = normalizeReferenceImages(c.images);

    return {
      ...c,
      filename: getCharacterFilename(c),
      folder: cleanFolder || undefined,
      images: normalizedImages,
      relations: normalizedRelations,
      customCommonFields: normalizedCustomCommonFields,
      commonFieldLabels: {},
      hiddenCommonFields: [],
      dualFields: Array.isArray(c.dualFields) ? c.dualFields : [],
      profiles: {
        general: c.profiles?.general ?? {},
        adult: c.profiles?.adult ?? {},
      },
      lockedFields: Array.isArray(c.lockedFields) ? c.lockedFields : [],
      common: {
        ...c.common,
        ageDisplay: c.common?.ageDisplay ?? gen.ageDisplay ?? seed?.common.ageDisplay ?? '',
        gender: c.common?.gender ?? gen.gender ?? seed?.common.gender ?? '',
        occupation: c.common?.occupation ?? gen.occupation ?? seed?.common.occupation ?? '',
        affiliation: c.common?.affiliation ?? gen.affiliation ?? seed?.common.affiliation ?? '',
        roleTitle: c.common?.roleTitle ?? gen.roleTitle ?? seed?.common.roleTitle ?? '',
        relationship: c.common?.relationship ?? gen.relationship ?? '',
        callPartner: c.common?.callPartner ?? gen.callPartner ?? '',
        secondPerson:
          c.common?.secondPerson ?? gen.secondPerson ?? seed?.common.secondPerson ?? '',
        speechStyle:
          c.common?.speechStyle ?? gen.speechStyle ?? seed?.common.speechStyle ?? '',
        costume:
          c.common?.costume ??
          c.common?.costumeId ??
          gen.costume ??
          gen.costumeId ??
          seed?.common.costume ??
          '',
        height: c.common?.height ?? seed?.common.height ?? '',
        weight: c.common?.weight ?? seed?.common.weight ?? '',
        bodyType: c.common?.bodyType ?? seed?.common.bodyType ?? '',
        hairstyle: c.common?.hairstyle ?? seed?.common.hairstyle ?? '',
        facialFeatures: c.common?.facialFeatures ?? seed?.common.facialFeatures ?? '',
        posture: c.common?.posture ?? seed?.common.posture ?? '',
        hobbies: c.common?.hobbies ?? seed?.common.hobbies ?? '',
        skills: c.common?.skills ?? seed?.common.skills ?? '',
        specialAbilities: c.common?.specialAbilities ?? seed?.common.specialAbilities ?? '',
        weaknesses: c.common?.weaknesses ?? seed?.common.weaknesses ?? '',
      },
    };
  });

  const rawCharacterOrder = Array.isArray(raw.project?.characterOrder)
    ? raw.project.characterOrder
    : [];
  const characterOrderMap = new Map<string, number>();
  rawCharacterOrder.forEach((id, idx) => {
    if (typeof id === 'string' && id && !characterOrderMap.has(id)) {
      characterOrderMap.set(id, idx);
    }
  });

  const normalizedCharacters = [...normalizedCharactersRaw].sort((a, b) => {
    const idxA = characterOrderMap.get(a.id);
    const idxB = characterOrderMap.get(b.id);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return 0;
  });
  const normalizedCharacterOrder = normalizedCharacters.map((c) => c.id);

  const sceneFolderSet = new Set<string>();
  const orderedSceneFolders: string[] = [];

  for (const f of raw.project?.sceneFolders ?? []) {
    const clean = sanitizeSceneFolderName(f);
    if (clean && !sceneFolderSet.has(clean)) {
      sceneFolderSet.add(clean);
      orderedSceneFolders.push(clean);
    }
  }

  const normalizedScenesRaw = (raw.scenes ?? []).map((s) => {
    const cleanFolder = sanitizeSceneFolderName(s.folder);
    if (cleanFolder && !sceneFolderSet.has(cleanFolder)) {
      sceneFolderSet.add(cleanFolder);
      orderedSceneFolders.push(cleanFolder);
    }
    return {
      ...s,
      filename: getSceneFilename(s),
      folder: cleanFolder || undefined,
      characters: Array.isArray(s.characters) ? s.characters : [],
      images: normalizeReferenceImages(s.images, MAX_SCENE_IMAGES),
      format: s.format === 'manga' ? ('manga' as const) : undefined,
      mangaBinding:
        s.mangaBinding === 'ltr'
          ? ('ltr' as const)
          : s.mangaBinding === 'rtl'
            ? ('rtl' as const)
            : undefined,
      mangaStartPage:
        typeof s.mangaStartPage === 'number' && Number.isFinite(s.mangaStartPage) && s.mangaStartPage >= 1
          ? Math.floor(s.mangaStartPage)
          : undefined,
    };
  });

  const rawSceneOrder = Array.isArray(raw.project?.sceneOrder) ? raw.project.sceneOrder : [];
  const sceneOrderMap = new Map<string, number>();
  rawSceneOrder.forEach((id, idx) => {
    if (typeof id === 'string' && id && !sceneOrderMap.has(id)) {
      sceneOrderMap.set(id, idx);
    }
  });

  const normalizedScenes = [...normalizedScenesRaw].sort((a, b) => {
    const idxA = sceneOrderMap.get(a.sceneId);
    const idxB = sceneOrderMap.get(b.sceneId);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return 0;
  });
  const normalizedSceneOrder = normalizedScenes.map((s) => s.sceneId);

  const normalizedPlotsRaw = (raw.plots ?? []).map((p) => {
    const cleanLinkedFolder = sanitizeSceneFolderName(p.linkedSceneFolder);
    if (cleanLinkedFolder && !sceneFolderSet.has(cleanLinkedFolder)) {
      sceneFolderSet.add(cleanLinkedFolder);
      orderedSceneFolders.push(cleanLinkedFolder);
    }
    return {
      ...p,
      filename: getPlotFilename(p),
      scope: p.scope ?? (p.chapterId ? 'chapter' : 'subplot'),
      linkedSceneFolder: cleanLinkedFolder || undefined,
      cards: Array.isArray(p.cards) ? p.cards : [],
    };
  });

  const rawPlotOrder = Array.isArray(raw.project?.plotOrder) ? raw.project.plotOrder : [];
  const plotOrderMap = new Map<string, number>();
  rawPlotOrder.forEach((id, idx) => {
    if (typeof id === 'string' && id && !plotOrderMap.has(id)) {
      plotOrderMap.set(id, idx);
    }
  });

  const normalizedPlots = [...normalizedPlotsRaw].sort((a, b) => {
    const idxA = plotOrderMap.get(a.plotId);
    const idxB = plotOrderMap.get(b.plotId);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return 0;
  });
  const normalizedPlotOrder = normalizedPlots.map((p) => p.plotId);

  const normalizedDefaultCommonFields: CustomCommonFieldTemplate[] = [];
  const seenDefaultCommonKeys = new Set<string>();
  for (const item of raw.project?.defaultCustomCommonFields ?? []) {
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const category =
      typeof item?.category === 'string' && item.category.trim()
        ? item.category.trim()
        : undefined;
    if (key && label && !seenDefaultCommonKeys.has(key)) {
      seenDefaultCommonKeys.add(key);
      normalizedDefaultCommonFields.push({
        key,
        label,
        multiline: Boolean(item.multiline),
        category,
      });
    }
  }

  const normalizedDefaultDualFields: DualProfileFieldDef[] = [];
  const seenDefaultDualKeys = new Set<string>();
  for (const item of raw.project?.defaultDualFields ?? []) {
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    if (key && label && !seenDefaultDualKeys.has(key)) {
      seenDefaultDualKeys.add(key);
      normalizedDefaultDualFields.push({
        key,
        label,
        multiline: Boolean(item.multiline),
      });
    }
  }

  const normalizedFieldMultiline: Record<string, boolean> = {};
  if (
    raw.project?.characterFieldMultiline &&
    typeof raw.project.characterFieldMultiline === 'object'
  ) {
    for (const [rawKey, rawVal] of Object.entries(raw.project.characterFieldMultiline)) {
      const key = rawKey.trim();
      if (key && typeof rawVal === 'boolean') {
        normalizedFieldMultiline[key] = rawVal;
      }
    }
  }

  const standardCategorySet = new Set<string>(STANDARD_CHARACTER_CATEGORIES);
  const customCategorySet = new Set<string>();
  const normalizedCustomCategories: string[] = [];
  const registerCustomCat = (rawCat?: string) => {
    const clean = typeof rawCat === 'string' ? rawCat.trim() : '';
    if (!clean || standardCategorySet.has(clean) || customCategorySet.has(clean)) return;
    customCategorySet.add(clean);
    normalizedCustomCategories.push(clean);
  };
  for (const cat of raw.project?.customCharacterCategories ?? []) {
    registerCustomCat(cat);
  }
  for (const tpl of normalizedDefaultCommonFields) {
    registerCustomCat(tpl.category);
  }
  for (const char of normalizedCharacters) {
    for (const cf of char.customCommonFields ?? []) {
      registerCustomCat(cf.category);
    }
  }

  // Normalize world settings & folders (default to 舞台設定 / アイテム設定 when project.worldFolders is unset)
  const worldFolderSet = new Set<string>();
  const orderedWorldFolders: string[] = [];
  const rawWorldFolders = Array.isArray(raw.project?.worldFolders)
    ? raw.project.worldFolders
    : [...DEFAULT_WORLD_FOLDERS];

  for (const f of rawWorldFolders) {
    const clean = sanitizeWorldFolderName(f);
    if (clean && !worldFolderSet.has(clean)) {
      worldFolderSet.add(clean);
      orderedWorldFolders.push(clean);
    }
  }

  const normalizedWorldRaw: WorldSettingData[] = (raw.worldSettings ?? []).map((w) => {
    const cleanFolder = sanitizeWorldFolderName(w.folder);
    if (cleanFolder && !worldFolderSet.has(cleanFolder)) {
      worldFolderSet.add(cleanFolder);
      orderedWorldFolders.push(cleanFolder);
    }

    const normalizedCustomFields: WorldCustomField[] = Array.isArray(w.customFields)
      ? w.customFields
          .filter((f) => typeof f?.key === 'string' && f.key.trim())
          .map((f) => ({
            key: f.key.trim(),
            label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : f.key.trim(),
            value: typeof f.value === 'string' ? f.value : '',
            multiline: Boolean(f.multiline),
          }))
      : [];

    const relatedCharacterIds = Array.isArray(w.relatedCharacterIds)
      ? Array.from(
          new Set(
            w.relatedCharacterIds
              .map((id) => (typeof id === 'string' ? id.trim() : ''))
              .filter(Boolean)
          )
        )
      : [];

    const adultNote = typeof w.adultNote === 'string' ? w.adultNote : '';
    const enableAdultNote = Boolean(w.enableAdultNote || adultNote.trim().length > 0);
    const normalizedImages = normalizeReferenceImages(w.images);

    return {
      id: w.id,
      filename: getWorldFilename(w),
      folder: cleanFolder || undefined,
      name: typeof w.name === 'string' ? w.name : w.id,
      ruby: typeof w.ruby === 'string' ? w.ruby : '',
      summary: typeof w.summary === 'string' ? w.summary : '',
      details: typeof w.details === 'string' ? w.details : '',
      images: normalizedImages,
      customFields: normalizedCustomFields,
      enableAdultNote,
      adultNote,
      relatedCharacterIds,
    };
  });

  const rawWorldOrder = Array.isArray(raw.project?.worldOrder) ? raw.project.worldOrder : [];
  const worldOrderMap = new Map<string, number>();
  rawWorldOrder.forEach((id, idx) => {
    if (typeof id === 'string' && id && !worldOrderMap.has(id)) {
      worldOrderMap.set(id, idx);
    }
  });

  const normalizedWorldSettings = [...normalizedWorldRaw].sort((a, b) => {
    const idxA = worldOrderMap.get(a.id);
    const idxB = worldOrderMap.get(b.id);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return 0;
  });
  const normalizedWorldOrder = normalizedWorldSettings.map((w) => w.id);

  return {
    ...raw,
    project: {
      ...raw.project,
      characterFolders: orderedFolders,
      worldFolders: orderedWorldFolders,
      sceneFolders: orderedSceneFolders,
      characterOrder: normalizedCharacterOrder,
      worldOrder: normalizedWorldOrder,
      plotOrder: normalizedPlotOrder,
      sceneOrder: normalizedSceneOrder,
      defaultCustomCommonFields: normalizedDefaultCommonFields,
      defaultDualFields: normalizedDefaultDualFields,
      characterFieldMultiline: normalizedFieldMultiline,
      customCharacterCategories: normalizedCustomCategories,
    },
    characters: normalizedCharacters,
    worldSettings: normalizedWorldSettings,
    plots: normalizedPlots,
    scenes: normalizedScenes,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open error'));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeTextFile(dir: FSDirectoryHandle, filename: string, content: string): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function cleanupStaleFiles(
  dir: FSDirectoryHandle,
  extension: string,
  expectedNames: Set<string>
): Promise<void> {
  if (typeof dir.removeEntry !== 'function') return;
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && entry.name.endsWith(extension) && !expectedNames.has(entry.name)) {
      try {
        await dir.removeEntry(entry.name);
      } catch {
        // Ignore if permission or lock prevents deletion
      }
    }
  }
}

export async function verifyDirectoryPermission(
  handle: FSDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
  requestIfNeeded = false
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const status = await handle.queryPermission({ mode });
      if (status === 'granted') return true;
      if (requestIfNeeded && typeof handle.requestPermission === 'function') {
        return (await handle.requestPermission({ mode })) === 'granted';
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function loadWorkspaceFromBrowser(): Promise<{
  workspace: ScenarioWorkspace;
  storageMode: StorageMode;
}> {
  try {
    const loaded = await idbGet<ScenarioWorkspace>(WORKSPACE_KEY);
    if (loaded && loaded.project && Array.isArray(loaded.scenes)) {
      return { workspace: normalizeWorkspace(loaded), storageMode: 'indexeddb' };
    }

    await saveWorkspaceToBrowser(INITIAL_WORKSPACE);
    return { workspace: INITIAL_WORKSPACE, storageMode: 'indexeddb' };
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        const parsed = safeJsonParse<ScenarioWorkspace>(raw);
        if (parsed?.project && Array.isArray(parsed.scenes)) {
          return { workspace: normalizeWorkspace(parsed), storageMode: 'localstorage' };
        }
      }
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(INITIAL_WORKSPACE));
    } catch {
      // In-memory only if both IDB and localStorage are unavailable
    }
    return { workspace: INITIAL_WORKSPACE, storageMode: 'localstorage' };
  }
}

export async function saveWorkspaceToBrowser(
  workspace: ScenarioWorkspace
): Promise<StorageMode> {
  try {
    await idbSet(WORKSPACE_KEY, workspace);
    return 'indexeddb';
  } catch {
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(workspace));
    } catch {
      // Ignore storage quota errors
    }
    return 'localstorage';
  }
}

export async function writeWorkspaceToDirectory(
  rootDir: FSDirectoryHandle,
  workspace: ScenarioWorkspace
): Promise<void> {
  const projectToWrite: ProjectData = {
    ...workspace.project,
    characterOrder: workspace.characters.map((c) => c.id),
    worldOrder: (workspace.worldSettings ?? []).map((w) => w.id),
    plotOrder: workspace.plots.map((p) => p.plotId),
    sceneOrder: workspace.scenes.map((s) => s.sceneId),
    defaultCustomCommonFields: workspace.project.defaultCustomCommonFields ?? [],
    defaultDualFields: workspace.project.defaultDualFields ?? [],
  };
  await writeTextFile(rootDir, 'project.json', JSON.stringify(projectToWrite, null, 2));

  const charDir = await rootDir.getDirectoryHandle('characters', { create: true });
  const expectedRootCharFiles = new Set<string>();
  const expectedSubdirFiles = new Map<string, Set<string>>();

  // Ensure all defined character folders exist as real directories on disk
  for (const rawFolder of workspace.project.characterFolders ?? []) {
    const clean = sanitizeCharacterFolderName(rawFolder);
    if (clean && !expectedSubdirFiles.has(clean)) {
      expectedSubdirFiles.set(clean, new Set<string>());
    }
  }

  for (const char of workspace.characters) {
    const fname = getCharacterFilename(char);
    const folder = sanitizeCharacterFolderName(char.folder);
    const serialized = JSON.stringify(
      { ...char, folder: folder || undefined, filename: fname },
      null,
      2
    );

    if (folder) {
      let set = expectedSubdirFiles.get(folder);
      if (!set) {
        set = new Set<string>();
        expectedSubdirFiles.set(folder, set);
      }
      set.add(fname);
      const subDir = await charDir.getDirectoryHandle(folder, { create: true });
      await writeTextFile(subDir, fname, serialized);
    } else {
      expectedRootCharFiles.add(fname);
      await writeTextFile(charDir, fname, serialized);
    }
  }

  await cleanupStaleFiles(charDir, '.json', expectedRootCharFiles);

  // Clean up stale files inside active subdirectories and remove obsolete subdirectories
  for (const [folderName, expectedFiles] of expectedSubdirFiles.entries()) {
    const subDir = await charDir.getDirectoryHandle(folderName, { create: true });
    await cleanupStaleFiles(subDir, '.json', expectedFiles);
  }

  if (typeof charDir.removeEntry === 'function') {
    for await (const entry of charDir.values()) {
      if (entry.kind === 'directory' && !expectedSubdirFiles.has(entry.name)) {
        try {
          await charDir.removeEntry(entry.name, { recursive: true });
        } catch {
          // Ignore if permission or lock prevents removal
        }
      }
    }
  }

  const worldDir = await rootDir.getDirectoryHandle('world', { create: true });
  const expectedRootWorldFiles = new Set<string>();
  const expectedWorldSubdirFiles = new Map<string, Set<string>>();

  for (const rawFolder of workspace.project.worldFolders ?? []) {
    const clean = sanitizeWorldFolderName(rawFolder);
    if (clean && !expectedWorldSubdirFiles.has(clean)) {
      expectedWorldSubdirFiles.set(clean, new Set<string>());
    }
  }

  for (const worldItem of workspace.worldSettings ?? []) {
    const fname = getWorldFilename(worldItem);
    const folder = sanitizeWorldFolderName(worldItem.folder);
    const serialized = JSON.stringify(
      { ...worldItem, folder: folder || undefined, filename: fname },
      null,
      2
    );

    if (folder) {
      let set = expectedWorldSubdirFiles.get(folder);
      if (!set) {
        set = new Set<string>();
        expectedWorldSubdirFiles.set(folder, set);
      }
      set.add(fname);
      const subDir = await worldDir.getDirectoryHandle(folder, { create: true });
      await writeTextFile(subDir, fname, serialized);
    } else {
      expectedRootWorldFiles.add(fname);
      await writeTextFile(worldDir, fname, serialized);
    }
  }

  await cleanupStaleFiles(worldDir, '.json', expectedRootWorldFiles);

  for (const [folderName, expectedFiles] of expectedWorldSubdirFiles.entries()) {
    const subDir = await worldDir.getDirectoryHandle(folderName, { create: true });
    await cleanupStaleFiles(subDir, '.json', expectedFiles);
  }

  if (typeof worldDir.removeEntry === 'function') {
    for await (const entry of worldDir.values()) {
      if (entry.kind === 'directory' && !expectedWorldSubdirFiles.has(entry.name)) {
        try {
          await worldDir.removeEntry(entry.name, { recursive: true });
        } catch {
          // Ignore if permission or lock prevents removal
        }
      }
    }
  }

  const plotDir = await rootDir.getDirectoryHandle('plots', { create: true });
  const expectedPlotFiles = new Set<string>();
  for (const plot of workspace.plots) {
    const fname = getPlotFilename(plot);
    expectedPlotFiles.add(fname);
    await writeTextFile(plotDir, fname, JSON.stringify({ ...plot, filename: fname }, null, 2));
  }
  await cleanupStaleFiles(plotDir, '.json', expectedPlotFiles);

  const sceneDir = await rootDir.getDirectoryHandle('scenes', { create: true });
  const expectedRootSceneFiles = new Set<string>();
  const expectedRootSceneImageFiles = new Set<string>();
  const expectedSceneSubdirFiles = new Map<string, Set<string>>();
  const expectedSceneSubdirImageFiles = new Map<string, Set<string>>();

  // Ensure all defined scene folders exist as real directories on disk
  for (const rawFolder of workspace.project.sceneFolders ?? []) {
    const clean = sanitizeSceneFolderName(rawFolder);
    if (clean && !expectedSceneSubdirFiles.has(clean)) {
      expectedSceneSubdirFiles.set(clean, new Set<string>());
      expectedSceneSubdirImageFiles.set(clean, new Set<string>());
    }
  }

  for (const scene of workspace.scenes) {
    const fname = getSceneFilename(scene);
    const sidecarName = getSceneImagesSidecarFilename(scene);
    const folder = sanitizeSceneFolderName(scene.folder);
    const serialized = serializeSceneMarkdown(scene);
    const hasImages = Array.isArray(scene.images) && scene.images.length > 0;
    const serializedImages = hasImages
      ? JSON.stringify({ sceneId: scene.sceneId, images: scene.images }, null, 2)
      : null;

    if (folder) {
      let set = expectedSceneSubdirFiles.get(folder);
      if (!set) {
        set = new Set<string>();
        expectedSceneSubdirFiles.set(folder, set);
      }
      let imgSet = expectedSceneSubdirImageFiles.get(folder);
      if (!imgSet) {
        imgSet = new Set<string>();
        expectedSceneSubdirImageFiles.set(folder, imgSet);
      }
      set.add(fname);
      const subDir = await sceneDir.getDirectoryHandle(folder, { create: true });
      await writeTextFile(subDir, fname, serialized);
      if (serializedImages) {
        imgSet.add(sidecarName);
        await writeTextFile(subDir, sidecarName, serializedImages);
      }
    } else {
      expectedRootSceneFiles.add(fname);
      await writeTextFile(sceneDir, fname, serialized);
      if (serializedImages) {
        expectedRootSceneImageFiles.add(sidecarName);
        await writeTextFile(sceneDir, sidecarName, serializedImages);
      }
    }
  }

  await cleanupStaleFiles(sceneDir, '.md', expectedRootSceneFiles);
  await cleanupStaleFiles(sceneDir, '.images.json', expectedRootSceneImageFiles);

  // Clean up stale files inside active scene subdirectories and remove obsolete subdirectories
  for (const [folderName, expectedFiles] of expectedSceneSubdirFiles.entries()) {
    const subDir = await sceneDir.getDirectoryHandle(folderName, { create: true });
    await cleanupStaleFiles(subDir, '.md', expectedFiles);
    await cleanupStaleFiles(
      subDir,
      '.images.json',
      expectedSceneSubdirImageFiles.get(folderName) ?? new Set<string>()
    );
  }

  if (typeof sceneDir.removeEntry === 'function') {
    for await (const entry of sceneDir.values()) {
      if (entry.kind === 'directory' && !expectedSceneSubdirFiles.has(entry.name)) {
        try {
          await sceneDir.removeEntry(entry.name, { recursive: true });
        } catch {
          // Ignore if permission or lock prevents removal
        }
      }
    }
  }
}

export async function readWorkspaceFromDirectory(
  rootDir: FSDirectoryHandle
): Promise<ScenarioWorkspace | null> {
  try {
    const projectHandle = await rootDir.getFileHandle('project.json');
    const projectFile = await projectHandle.getFile();
    const project = safeJsonParse<ProjectData>(await projectFile.text());
    if (!project || typeof project !== 'object') return null;

    const characters: CharacterData[] = [];
    const discoveredFolders: string[] = [];
    try {
      const charDir = await rootDir.getDirectoryHandle('characters');
      for await (const entry of charDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const f = await entry.getFile();
            const parsed = safeJsonParse<CharacterData>(await f.text());
            if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
              characters.push({ ...parsed, folder: undefined, filename: entry.name });
            }
          } catch {
            // Skip unreadable or malformed character file
          }
        } else if (entry.kind === 'directory') {
          const folderName = sanitizeCharacterFolderName(entry.name);
          if (folderName) {
            discoveredFolders.push(folderName);
            for await (const subEntry of entry.values()) {
              if (subEntry.kind === 'file' && subEntry.name.endsWith('.json')) {
                try {
                  const f = await subEntry.getFile();
                  const parsed = safeJsonParse<CharacterData>(await f.text());
                  if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
                    characters.push({
                      ...parsed,
                      folder: folderName,
                      filename: subEntry.name,
                    });
                  }
                } catch {
                  // Skip unreadable or malformed character file
                }
              }
            }
          }
        }
      }
      characters.sort((a, b) =>
        getCharacterRelativePath(a).localeCompare(getCharacterRelativePath(b), 'ja')
      );
    } catch {
      // Optional folder
    }

    const mergedFolders = Array.from(
      new Set([
        ...(project.characterFolders ?? []).map(sanitizeCharacterFolderName).filter(Boolean),
        ...discoveredFolders,
      ])
    );

    const worldSettings: WorldSettingData[] = [];
    const discoveredWorldFolders: string[] = [];
    try {
      const worldDir = await rootDir.getDirectoryHandle('world');
      for await (const entry of worldDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const f = await entry.getFile();
            const parsed = safeJsonParse<WorldSettingData>(await f.text());
            if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
              worldSettings.push({ ...parsed, folder: undefined, filename: entry.name });
            }
          } catch {
            // Skip unreadable or malformed world file
          }
        } else if (entry.kind === 'directory') {
          const folderName = sanitizeWorldFolderName(entry.name);
          if (folderName) {
            discoveredWorldFolders.push(folderName);
            for await (const subEntry of entry.values()) {
              if (subEntry.kind === 'file' && subEntry.name.endsWith('.json')) {
                try {
                  const f = await subEntry.getFile();
                  const parsed = safeJsonParse<WorldSettingData>(await f.text());
                  if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
                    worldSettings.push({
                      ...parsed,
                      folder: folderName,
                      filename: subEntry.name,
                    });
                  }
                } catch {
                  // Skip unreadable or malformed world file
                }
              }
            }
          }
        }
      }
      worldSettings.sort((a, b) =>
        getWorldRelativePath(a).localeCompare(getWorldRelativePath(b), 'ja')
      );
    } catch {
      // Optional folder
    }

    const mergedWorldFolders =
      Array.isArray(project.worldFolders) || discoveredWorldFolders.length > 0
        ? Array.from(
            new Set([
              ...(project.worldFolders ?? []).map(sanitizeWorldFolderName).filter(Boolean),
              ...discoveredWorldFolders,
            ])
          )
        : undefined;

    const plots: PlotData[] = [];
    try {
      const plotDir = await rootDir.getDirectoryHandle('plots');
      for await (const entry of plotDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const f = await entry.getFile();
            const parsed = safeJsonParse<PlotData>(await f.text());
            if (parsed && typeof parsed === 'object' && typeof parsed.plotId === 'string') {
              plots.push({ ...parsed, filename: entry.name });
            }
          } catch {
            // Skip unreadable or malformed plot file
          }
        }
      }
      plots.sort((a, b) => getPlotFilename(a).localeCompare(getPlotFilename(b), 'ja'));
    } catch {
      // Optional folder
    }

    const scenes: SceneData[] = [];
    const discoveredSceneFolders: string[] = [];
    const readSceneFolderEntries = async (dir: FSDirectoryHandle, folderName?: string) => {
      const mdScenes: SceneData[] = [];
      const sidecarByMdName = new Map<string, unknown>();

      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          try {
            const f = await entry.getFile();
            mdScenes.push({
              ...parseSceneMarkdown(entry.name, await f.text()),
              folder: folderName,
            });
          } catch {
            // Skip unreadable scene markdown
          }
        } else if (entry.kind === 'file' && entry.name.endsWith('.images.json')) {
          try {
            const f = await entry.getFile();
            const parsed = safeJsonParse<{ sceneId?: string; images?: unknown } | unknown[]>(
              await f.text()
            );
            const rawImages = Array.isArray(parsed)
              ? parsed
              : parsed && typeof parsed === 'object'
                ? parsed.images
                : undefined;
            if (Array.isArray(rawImages)) {
              const expectedMdName = entry.name.replace(/\.images\.json$/i, '.md').toLowerCase();
              sidecarByMdName.set(expectedMdName, rawImages);
            }
          } catch {
            // Skip malformed scene images sidecar
          }
        } else if (entry.kind === 'directory' && folderName === undefined) {
          const subFolderName = sanitizeSceneFolderName(entry.name);
          if (subFolderName) {
            discoveredSceneFolders.push(subFolderName);
            await readSceneFolderEntries(entry, subFolderName);
          }
        }
      }

      for (const sc of mdScenes) {
        const key = sc.filename.toLowerCase();
        const rawImgs = sidecarByMdName.get(key);
        const normalizedImgs = normalizeReferenceImages(rawImgs, MAX_SCENE_IMAGES);
        scenes.push(normalizedImgs ? { ...sc, images: normalizedImgs } : sc);
      }
    };

    try {
      const sceneDir = await rootDir.getDirectoryHandle('scenes');
      await readSceneFolderEntries(sceneDir, undefined);
      scenes.sort((a, b) => getSceneRelativePath(a).localeCompare(getSceneRelativePath(b), 'ja'));
    } catch {
      // Optional folder
    }

    const mergedSceneFolders = Array.from(
      new Set([
        ...(project.sceneFolders ?? []).map(sanitizeSceneFolderName).filter(Boolean),
        ...discoveredSceneFolders,
      ])
    );

    if (!project || !project.title) return null;
    return normalizeWorkspace({
      project: {
        ...project,
        characterFolders: mergedFolders,
        ...(mergedWorldFolders !== undefined ? { worldFolders: mergedWorldFolders } : {}),
        sceneFolders: mergedSceneFolders,
      },
      characters,
      worldSettings,
      plots,
      scenes,
    });
  } catch {
    return null;
  }
}

export async function connectLocalDirectory(
  _currentWorkspace?: ScenarioWorkspace
): Promise<DirectoryConnectResult> {
  if (!canUseFileSystemAccess()) {
    return {
      status: 'fallback',
      message:
        '現在のブラウザは File System Access API に非対応のため、IndexedDB への自動保存を継続します。',
    };
  }

  try {
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
    const existing = await readWorkspaceFromDirectory(handle);
    if (existing) {
      return {
        status: 'connected',
        handle,
        loadedWorkspace: existing,
        message: `ローカルフォルダ「${handle.name}」からプロジェクトを読み込みました。`,
      };
    }

    return {
      status: 'needs-init-choice',
      handle,
      message: `ローカルフォルダ「${handle.name}」の開始方法を選択してください。`,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'cancelled',
        message: 'フォルダ選択がキャンセルされました。',
      };
    }
    return {
      status: 'fallback',
      message:
        'プレビュー（iframe）環境によりローカルフォルダ直接参照が制限されています。IndexedDB 自動保存で全機能がそのまま動作します。',
    };
  }
}

export function triggerDownload(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatSnapshotTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function computeUtf8ByteSize(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

function parseSnapshotObject(
  raw: unknown,
  fallbackFilename?: string,
  rawByteSize?: number
): HistorySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<HistorySnapshot> & { workspace?: ScenarioWorkspace };
  if (!obj.workspace || !obj.workspace.project || !Array.isArray(obj.workspace.scenes)) {
    return null;
  }
  const normalizedWs = normalizeWorkspace(obj.workspace);
  const createdAt =
    typeof obj.createdAt === 'string' && !Number.isNaN(Date.parse(obj.createdAt))
      ? obj.createdAt
      : new Date().toISOString();
  const filename =
    typeof obj.filename === 'string' && obj.filename.trim()
      ? obj.filename.trim()
      : fallbackFilename || `snapshot_${formatSnapshotTimestamp(new Date(createdAt))}.json`;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : filename;
  const reason: HistorySnapshotReason = obj.reason === 'manual' ? 'manual' : 'auto';
  const byteSize =
    typeof obj.byteSize === 'number' && obj.byteSize > 0
      ? obj.byteSize
      : rawByteSize ?? computeUtf8ByteSize(JSON.stringify(normalizedWs));

  return {
    id,
    filename,
    createdAt,
    reason,
    projectTitle:
      typeof obj.projectTitle === 'string' && obj.projectTitle.trim()
        ? obj.projectTitle
        : normalizedWs.project.title,
    sceneCount: normalizedWs.scenes.length,
    characterCount: normalizedWs.characters.length,
    plotCount: normalizedWs.plots.length,
    byteSize,
    workspace: normalizedWs,
  };
}

function rotateHistorySnapshots(
  snapshots: HistorySnapshot[],
  maxCount = MAX_HISTORY_SNAPSHOTS
): HistorySnapshot[] {
  const sorted = [...snapshots].sort((a, b) => {
    const timeDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return b.filename.localeCompare(a.filename);
  });

  const seen = new Set<string>();
  const deduped: HistorySnapshot[] = [];
  for (const snap of sorted) {
    const key = snap.filename || snap.id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(snap);
    }
    if (deduped.length >= maxCount) break;
  }
  return deduped;
}

function createHistorySnapshotRecord(
  workspace: ScenarioWorkspace,
  reason: HistorySnapshotReason,
  existingFilenames: Set<string>
): HistorySnapshot {
  const now = new Date();
  const createdAt = now.toISOString();
  const stamp = formatSnapshotTimestamp(now);
  let filename = `snapshot_${stamp}.json`;
  let suffix = 2;
  while (existingFilenames.has(filename)) {
    filename = `snapshot_${stamp}_${suffix}.json`;
    suffix++;
  }

  const clonedWorkspace = normalizeWorkspace(
    JSON.parse(JSON.stringify(workspace)) as ScenarioWorkspace
  );
  const baseRecord: HistorySnapshot = {
    id: `${stamp}_${Math.random().toString(36).slice(2, 7)}`,
    filename,
    createdAt,
    reason,
    projectTitle: clonedWorkspace.project.title,
    sceneCount: clonedWorkspace.scenes.length,
    characterCount: clonedWorkspace.characters.length,
    plotCount: clonedWorkspace.plots.length,
    byteSize: 0,
    workspace: clonedWorkspace,
  };
  baseRecord.byteSize = computeUtf8ByteSize(JSON.stringify(baseRecord));
  return baseRecord;
}

async function loadHistoryFromBrowser(): Promise<HistorySnapshot[]> {
  try {
    const stored = await idbGet<unknown[]>(HISTORY_KEY);
    if (Array.isArray(stored)) {
      const parsed = stored
        .map((item) => parseSnapshotObject(item))
        .filter((item): item is HistorySnapshot => item !== null);
      return rotateHistorySnapshots(parsed);
    }
    return [];
  } catch {
    try {
      const raw = localStorage.getItem(LS_HISTORY_FALLBACK_KEY);
      if (!raw) return [];
      const parsedArr = safeJsonParse<unknown[]>(raw);
      if (!Array.isArray(parsedArr)) return [];
      const parsed = parsedArr
        .map((item) => parseSnapshotObject(item))
        .filter((item): item is HistorySnapshot => item !== null);
      return rotateHistorySnapshots(parsed);
    } catch {
      return [];
    }
  }
}

async function saveHistoryToBrowser(snapshots: HistorySnapshot[]): Promise<HistorySnapshot[]> {
  const rotated = rotateHistorySnapshots(snapshots);
  try {
    await idbSet(HISTORY_KEY, rotated);
    return rotated;
  } catch {
    // Respect localStorage quota by trimming oldest snapshots if needed
    let trimmed = [...rotated];
    while (trimmed.length > 0) {
      try {
        localStorage.setItem(LS_HISTORY_FALLBACK_KEY, JSON.stringify(trimmed));
        return trimmed;
      } catch {
        trimmed = trimmed.slice(0, -1);
      }
    }
    try {
      localStorage.removeItem(LS_HISTORY_FALLBACK_KEY);
    } catch {
      // Ignore storage cleanup error
    }
    return [];
  }
}

async function readHistoryFromDirectory(
  rootDir: FSDirectoryHandle
): Promise<HistorySnapshot[]> {
  try {
    const historyDir = await rootDir.getDirectoryHandle(HISTORY_DIR_NAME, { create: false });
    const loaded: HistorySnapshot[] = [];
    for await (const entry of historyDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json')) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const parsed = parseSnapshotObject(
            safeJsonParse<unknown>(text),
            entry.name,
            computeUtf8ByteSize(text)
          );
          if (parsed) loaded.push(parsed);
        } catch {
          // Skip unreadable or non-snapshot JSON files
        }
      }
    }
    return rotateHistorySnapshots(loaded);
  } catch {
    return [];
  }
}

async function writeAndRotateHistoryInDirectory(
  rootDir: FSDirectoryHandle,
  snapshot: HistorySnapshot
): Promise<HistorySnapshot[]> {
  const historyDir = await rootDir.getDirectoryHandle(HISTORY_DIR_NAME, { create: true });
  const serialized = JSON.stringify(snapshot, null, 2);
  await writeTextFile(historyDir, snapshot.filename, serialized);

  // Scan all snapshot files in history/ and rotate down to MAX_HISTORY_SNAPSHOTS
  const allEntries: Array<{ filename: string; snapshot: HistorySnapshot }> = [];
  for await (const entry of historyDir.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
      try {
        const file = await entry.getFile();
        const text = await file.text();
        const parsed = parseSnapshotObject(
          safeJsonParse<unknown>(text),
          entry.name,
          computeUtf8ByteSize(text)
        );
        if (parsed) {
          allEntries.push({ filename: entry.name, snapshot: parsed });
        }
      } catch {
        // Leave unrelated non-snapshot JSON files untouched
      }
    }
  }

  const kept = rotateHistorySnapshots(
    allEntries.map((e) => e.snapshot),
    MAX_HISTORY_SNAPSHOTS
  );
  const keptFilenames = new Set(kept.map((s) => s.filename));

  if (typeof historyDir.removeEntry === 'function') {
    for (const entry of allEntries) {
      if (!keptFilenames.has(entry.filename)) {
        try {
          await historyDir.removeEntry(entry.filename);
        } catch {
          // Ignore file removal lock errors
        }
      }
    }
  }

  return kept;
}

async function deleteHistoryFileFromDirectory(
  rootDir: FSDirectoryHandle,
  filename: string
): Promise<void> {
  try {
    const historyDir = await rootDir.getDirectoryHandle(HISTORY_DIR_NAME, { create: false });
    if (typeof historyDir.removeEntry === 'function') {
      await historyDir.removeEntry(filename);
    }
  } catch {
    // Ignore if history/ folder or file does not exist
  }
}

/**
 * Hybrid persistence manager orchestrating File System Access API,
 * IndexedDB, and localStorage fallback seamlessly.
 */
export class StorageManager {
  private directoryHandle: FSDirectoryHandle | null = null;

  getConnectedDirectory(): FSDirectoryHandle | null {
    return this.directoryHandle;
  }

  setConnectedDirectory(handle: FSDirectoryHandle | null): void {
    this.directoryHandle = handle;
  }

  async load(): Promise<StorageLoadResult> {
    let pendingReconnectDirectoryName: string | undefined;

    if (canUseFileSystemAccess()) {
      try {
        const storedHandle = await idbGet<FSDirectoryHandle>(DIR_HANDLE_KEY);
        if (storedHandle) {
          if (await verifyDirectoryPermission(storedHandle, 'readwrite', false)) {
            const fromDisk = await readWorkspaceFromDirectory(storedHandle);
            if (fromDisk) {
              this.directoryHandle = storedHandle;
              await saveWorkspaceToBrowser(fromDisk);
              return {
                workspace: fromDisk,
                storageMode: 'filesystem',
                directoryName: storedHandle.name,
              };
            }
          } else {
            pendingReconnectDirectoryName = storedHandle.name;
          }
        }
      } catch {
        // Fallback smoothly to browser storage
      }
    }

    const browser = await loadWorkspaceFromBrowser();
    return {
      workspace: browser.workspace,
      storageMode: browser.storageMode,
      pendingReconnectDirectoryName,
    };
  }

  async save(workspace: ScenarioWorkspace): Promise<{
    storageMode: StorageMode;
    directoryName?: string;
  }> {
    const browserMode = await saveWorkspaceToBrowser(workspace);

    if (this.directoryHandle) {
      await writeWorkspaceToDirectory(this.directoryHandle, workspace);
      return {
        storageMode: 'filesystem',
        directoryName: this.directoryHandle.name,
      };
    }

    return { storageMode: browserMode };
  }

  async connectDirectory(currentWorkspace?: ScenarioWorkspace): Promise<DirectoryConnectResult> {
    const result = await connectLocalDirectory(currentWorkspace);
    if (result.status === 'connected' && result.handle) {
      this.directoryHandle = result.handle;
      if (result.loadedWorkspace) {
        await saveWorkspaceToBrowser(result.loadedWorkspace);
      }
      try {
        await idbSet(DIR_HANDLE_KEY, result.handle);
      } catch {
        // Ignore if handle serialization in IndexedDB is unsupported
      }
    }
    return result;
  }

  async initializeDirectory(
    handle: FSDirectoryHandle,
    workspace: ScenarioWorkspace
  ): Promise<void> {
    await writeWorkspaceToDirectory(handle, workspace);
    this.directoryHandle = handle;
    await saveWorkspaceToBrowser(workspace);
    try {
      await idbSet(DIR_HANDLE_KEY, handle);
    } catch {
      // Ignore if handle serialization in IndexedDB is unsupported
    }
  }

  async reconnectStoredDirectory(): Promise<DirectoryConnectResult> {
    if (!canUseFileSystemAccess()) {
      return {
        status: 'fallback',
        message: '現在のブラウザは File System Access API に非対応です。',
      };
    }

    try {
      const storedHandle = await idbGet<FSDirectoryHandle>(DIR_HANDLE_KEY);
      if (!storedHandle) {
        return {
          status: 'cancelled',
          message: '再接続できる前回のフォルダ記録が見つかりませんでした。',
        };
      }

      const granted = await verifyDirectoryPermission(storedHandle, 'readwrite', true);
      if (!granted) {
        return {
          status: 'cancelled',
          message: `フォルダ「${storedHandle.name}」へのアクセス許可が得られませんでした。`,
        };
      }

      const existing = await readWorkspaceFromDirectory(storedHandle);
      if (existing) {
        this.directoryHandle = storedHandle;
        await saveWorkspaceToBrowser(existing);
        return {
          status: 'connected',
          handle: storedHandle,
          loadedWorkspace: existing,
          message: `フォルダ「${storedHandle.name}」へ再接続しました。`,
        };
      }

      return {
        status: 'needs-init-choice',
        handle: storedHandle,
        message: `フォルダ「${storedHandle.name}」の開始方法を選択してください。`,
      };
    } catch {
      return {
        status: 'fallback',
        message: 'フォルダの再接続に失敗しました。「フォルダ連携」から再選択してください。',
      };
    }
  }

  async disconnectDirectory(): Promise<void> {
    this.directoryHandle = null;
    try {
      await idbDelete(DIR_HANDLE_KEY);
    } catch {
      // Ignore cleanup errors
    }
  }

  async resetToBrowserWorkspace(newWorkspace: ScenarioWorkspace): Promise<StorageMode> {
    await this.disconnectDirectory();
    return saveWorkspaceToBrowser(newWorkspace);
  }

  async pickParentDirectoryForNewProject(): Promise<ParentDirectoryPickResult> {
    if (!canUseFileSystemAccess()) {
      return {
        status: 'unsupported',
        message:
          '現在のブラウザはローカルフォルダ作成（File System Access API）に非対応です。Google Chrome のご利用を推奨します。非対応環境ではメニュー内の「ブラウザ内データを初期化して新規作成（予備）」をご利用ください。',
      };
    }

    try {
      const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      return { status: 'picked', handle };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      return {
        status: 'restricted',
        message:
          '現在の表示環境（プレビュー iframe 等）ではローカルフォルダへの直接アクセスが制限されています。Google Chrome の通常タブまたは PWA ウィンドウから実行してください。',
      };
    }
  }

  async checkSubdirectoryExists(
    parentDir: FSDirectoryHandle,
    folderName: string
  ): Promise<boolean> {
    try {
      await parentDir.getDirectoryHandle(folderName, { create: false });
      return true;
    } catch {
      return false;
    }
  }

  async createProjectInNewSubdirectory(
    parentDir: FSDirectoryHandle,
    folderName: string,
    workspace: ScenarioWorkspace
  ): Promise<FSDirectoryHandle> {
    const subDir = await parentDir.getDirectoryHandle(folderName, { create: true });
    await this.initializeDirectory(subDir, workspace);
    return subDir;
  }

  async listHistory(): Promise<HistorySnapshot[]> {
    if (this.directoryHandle) {
      const fromDisk = await readHistoryFromDirectory(this.directoryHandle);
      await saveHistoryToBrowser(fromDisk);
      return fromDisk;
    }
    return loadHistoryFromBrowser();
  }

  async saveHistorySnapshot(
    workspace: ScenarioWorkspace,
    reason: HistorySnapshotReason
  ): Promise<{
    snapshot: HistorySnapshot;
    snapshots: HistorySnapshot[];
    savedToDirectory: boolean;
  }> {
    const currentList = await this.listHistory();
    const existingNames = new Set(currentList.map((s) => s.filename));
    const snapshot = createHistorySnapshotRecord(workspace, reason, existingNames);

    if (this.directoryHandle) {
      const rotatedFromDisk = await writeAndRotateHistoryInDirectory(
        this.directoryHandle,
        snapshot
      );
      await saveHistoryToBrowser(rotatedFromDisk);
      return {
        snapshot,
        snapshots: rotatedFromDisk,
        savedToDirectory: true,
      };
    }

    const rotatedInBrowser = await saveHistoryToBrowser([snapshot, ...currentList]);
    return {
      snapshot,
      snapshots: rotatedInBrowser,
      savedToDirectory: false,
    };
  }

  async deleteHistorySnapshot(snapshotId: string): Promise<HistorySnapshot[]> {
    const currentList = await this.listHistory();
    const target = currentList.find((s) => s.id === snapshotId || s.filename === snapshotId);
    if (target && this.directoryHandle) {
      await deleteHistoryFileFromDirectory(this.directoryHandle, target.filename);
    }
    const nextList = currentList.filter(
      (s) => s.id !== snapshotId && s.filename !== snapshotId
    );
    return saveHistoryToBrowser(nextList);
  }
}

export const storageManager = new StorageManager();
