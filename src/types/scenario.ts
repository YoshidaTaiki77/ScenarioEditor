export type ActiveMode = 'general' | 'adult';

export type VisibilityType = 'common' | 'adult_only' | 'general_alt';

export interface CharacterCommon {
  name: string;
  ruby: string;
  firstPerson: string;
  ageDisplay: string;
  gender?: string;
  relationship: string;
  callPartner: string;
  secondPerson: string;
  speechStyle: string;
  costume: string;
  costumeId?: string; // legacy alias compatibility
  personality: string;
  height?: string;
  weight?: string;
  bodyType?: string;
  hairstyle?: string;
  facialFeatures?: string;
  posture?: string;
  hobbies?: string;
  skills?: string;
  specialAbilities?: string;
  weaknesses?: string;
}

export interface CharacterRelation {
  targetCharacterId: string;
  callPartner: string;
  relationship: string;
}

export const STANDARD_CHARACTER_CATEGORIES = [
  '基本情報',
  '話し方・セリフ',
  '対人・呼び方・関係性',
  '外見・体格',
  '性格・パーソナリティ',
  '能力・スキル',
] as const;

export type StandardCharacterCategory = (typeof STANDARD_CHARACTER_CATEGORIES)[number];

export interface CustomCommonField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
  category?: string;
}

export interface CustomCommonFieldTemplate {
  key: string;
  label: string;
  multiline?: boolean;
  category?: string;
}

export interface DualProfileFieldDef {
  key: string;
  label: string;
  multiline?: boolean;
}

export type BulkFieldAddScope = 'current' | 'same_folder' | 'all';

export interface BulkFieldAddResult {
  addedCount: number;
  skippedCount: number;
  registeredTemplate: boolean;
}

export type CharacterProfile = Record<string, string>;

export type LockableCharacterField = string;

export interface CharacterData {
  id: string;
  filename?: string; // JSON filename in characters/, e.g. "ren.json"
  folder?: string; // Subfolder name under characters/, e.g. "メイン"
  shortName: string; // Dialogue prefix name, e.g. "蓮" or "栞"
  common: CharacterCommon;
  relations?: CharacterRelation[];
  customCommonFields?: CustomCommonField[];
  commonFieldLabels?: Record<string, string>;
  hiddenCommonFields?: string[];
  dualFields?: DualProfileFieldDef[];
  profiles: {
    general: CharacterProfile;
    adult: CharacterProfile;
  };
  lockedFields: LockableCharacterField[];
}

export interface ResolvedCharacter {
  id: string;
  shortName: string;
  name: string;
  ruby: string;
  personality: string;
  height: string;
  weight: string;
  bodyType: string;
  hairstyle: string;
  facialFeatures: string;
  posture: string;
  hobbies: string;
  skills: string;
  specialAbilities: string;
  weaknesses: string;
  firstPerson: string;
  ageDisplay: string;
  gender: string;
  relationship: string;
  callPartner: string;
  secondPerson: string;
  speechStyle: string;
  costume: string;
  relations: CharacterRelation[];
  hiddenCommonFields: string[];
  extraCommonFields: Array<{ key: string; label: string; value: string; category?: string }>;
  customFields: Array<{ key: string; label: string; value: string; locked: boolean }>;
  allFields: Record<string, string>;
  lockedFields: LockableCharacterField[];
}

export type PlotCardStatus = 'todo' | 'draft' | 'writing' | 'review' | 'done';

export interface PlotCardPosition {
  x: number;
  y: number;
}

export interface PlotCardConnection {
  targetCardId: string;
  label?: string;
}

export interface PlotCard {
  cardId: string;
  order: number;
  visibility: VisibilityType;
  title: string;
  memo: string;
  linkedSceneId: string;
  // シーン舞台・登場人物
  characters?: string[];
  povCharacterId?: string;
  location?: string;
  timeOfDay?: string;
  // 物語構成・演出の役割
  goal?: string;
  mood?: string;
  foreshadowing?: string;
  branchCondition?: string;
  // 進捗管理・ボリューム感
  status?: PlotCardStatus;
  targetLength?: number;
  assetNotes?: string;
  // タイムラインチャート（フリーキャンバス）用メタデータ
  chartPos?: PlotCardPosition;
  connections?: PlotCardConnection[];
  inStaging?: boolean;
}

export type PlotScope = 'chapter' | 'route' | 'character' | 'subplot';

export interface PlotData {
  plotId: string;
  filename?: string;
  chapterId?: string;
  scope?: PlotScope;
  linkedSceneFolder?: string;
  title: string;
  cards: PlotCard[];
}

export interface SceneData {
  sceneId: string;
  filename: string;
  folder?: string;
  title: string;
  visibility: VisibilityType;
  characters: string[];
  body: string;
}

export interface ChapterConfig {
  chapterId: string;
  title: string;
  plotId: string;
  sceneIds: string[];
}

export const DEFAULT_WORLD_FOLDERS = ['舞台設定', 'アイテム設定'] as const;

export interface WorldCustomField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface WorldSettingData {
  id: string;
  filename?: string; // JSON filename in world/, e.g. "old_library.json"
  folder?: string; // Subfolder name under world/, e.g. "舞台設定"
  name: string;
  ruby?: string;
  summary: string;
  details: string;
  customFields?: WorldCustomField[];
  enableAdultNote?: boolean;
  adultNote?: string;
  relatedCharacterIds?: string[];
}

export interface ProjectData {
  title: string;
  activeMode: ActiveMode;
  chapters: ChapterConfig[];
  characterFolders?: string[];
  worldFolders?: string[];
  sceneFolders?: string[];
  characterOrder?: string[];
  worldOrder?: string[];
  plotOrder?: string[];
  sceneOrder?: string[];
  defaultCustomCommonFields?: CustomCommonFieldTemplate[];
  defaultDualFields?: DualProfileFieldDef[];
  characterFieldMultiline?: Record<string, boolean>;
  customCharacterCategories?: string[];
}

export interface ScenarioWorkspace {
  project: ProjectData;
  characters: CharacterData[];
  worldSettings?: WorldSettingData[];
  plots: PlotData[];
  scenes: SceneData[];
}

export type SelectedItem =
  | { type: 'scene'; id: string }
  | { type: 'character'; id: string }
  | { type: 'world'; id: string }
  | { type: 'plot'; id: string };

export interface ProofreadIssue {
  id: string;
  line: number;
  column: number;
  severity: 'warning' | 'error';
  category: 'firstPerson' | 'brackets' | 'syntax';
  message: string;
  snippet: string;
}

export type StorageMode = 'indexeddb' | 'filesystem' | 'localstorage';

export interface SaveStatus {
  state: 'saved' | 'saving' | 'error';
  storageMode: StorageMode;
  directoryName?: string;
  lastSavedAt?: string;
  nextAutoSaveAt?: number;
  hasPendingChanges?: boolean;
  notice?: string;
}

export type HistorySnapshotReason = 'auto' | 'manual';

export interface HistorySnapshot {
  id: string;
  filename: string;
  createdAt: string;
  reason: HistorySnapshotReason;
  projectTitle: string;
  sceneCount: number;
  characterCount: number;
  plotCount: number;
  byteSize: number;
  workspace: ScenarioWorkspace;
}
