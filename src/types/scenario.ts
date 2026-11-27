export type ActiveMode = 'general' | 'adult';

export type VisibilityType = 'common' | 'adult_only' | 'general_alt';

export interface CharacterCommon {
  name: string;
  ruby: string;
  firstPerson: string;
  ageDisplay: string;
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
  hobbies?: string;
}

export interface CustomCommonField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface CustomCommonFieldTemplate {
  key: string;
  label: string;
  multiline?: boolean;
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
  hobbies: string;
  firstPerson: string;
  ageDisplay: string;
  relationship: string;
  callPartner: string;
  secondPerson: string;
  speechStyle: string;
  costume: string;
  hiddenCommonFields: string[];
  extraCommonFields: Array<{ key: string; label: string; value: string }>;
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

export interface ProjectData {
  title: string;
  activeMode: ActiveMode;
  chapters: ChapterConfig[];
  characterFolders?: string[];
  sceneFolders?: string[];
  characterOrder?: string[];
  plotOrder?: string[];
  sceneOrder?: string[];
  defaultCustomCommonFields?: CustomCommonFieldTemplate[];
  defaultDualFields?: DualProfileFieldDef[];
}

export interface ScenarioWorkspace {
  project: ProjectData;
  characters: CharacterData[];
  plots: PlotData[];
  scenes: SceneData[];
}

export type SelectedItem =
  | { type: 'scene'; id: string }
  | { type: 'character'; id: string }
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
