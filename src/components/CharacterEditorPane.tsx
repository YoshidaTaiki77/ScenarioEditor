import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  Unlock,
  Users,
  WrapText,
  X,
} from 'lucide-react';
import {
  STANDARD_CHARACTER_CATEGORIES,
  type ActiveMode,
  type BulkFieldAddResult,
  type BulkFieldAddScope,
  type CharacterCommon,
  type CharacterData,
  type CharacterRelation,
  type CustomCommonField,
  type CustomCommonFieldTemplate,
  type DualProfileFieldDef,
  type StandardCharacterCategory,
} from '../types/scenario';
import { getCharacterFilename, triggerDownload } from '../utils/storageManager';

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minRows?: number;
}

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  minRows = 2,
}) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, minRows]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      adjustHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
};

interface CharacterEditorPaneProps {
  character: CharacterData;
  allCharacters: CharacterData[];
  characterFolders: string[];
  defaultCustomCommonFields: CustomCommonFieldTemplate[];
  defaultDualFields: DualProfileFieldDef[];
  characterFieldMultiline: Record<string, boolean>;
  customCharacterCategories: string[];
  activeMode: ActiveMode;
  onUpdateCharacter: (updated: CharacterData) => void;
  onChangeCharacterFieldMultiline: (
    key: string,
    multiline: boolean,
    defaultMultiline: boolean
  ) => void;
  onResetCharacterFieldMultiline: () => void;
  onRegisterCharacterCategory: (category: string) => void;
  onBulkAddCommonField: (params: {
    sourceCharacterId: string;
    field: CustomCommonFieldTemplate;
    scope: BulkFieldAddScope;
    saveAsDefault: boolean;
  }) => BulkFieldAddResult;
  onBulkAddDualField: (params: {
    sourceCharacterId: string;
    field: DualProfileFieldDef;
    scope: BulkFieldAddScope;
    saveAsDefault: boolean;
  }) => BulkFieldAddResult;
  onRemoveDefaultCommonField: (key: string) => void;
  onRemoveDefaultDualField: (key: string) => void;
  onMoveCharacterToFolder: (characterId: string, folder?: string) => void;
}

interface StandardOptionalFieldMeta {
  key: keyof CharacterCommon;
  defaultLabel: string;
  multiline?: boolean;
  placeholder?: string;
}

const STANDARD_OPTIONAL_FIELDS: StandardOptionalFieldMeta[] = [
  { key: 'ageDisplay', defaultLabel: '年齢表記' },
  { key: 'gender', defaultLabel: '性別', placeholder: '例: 女性 / 男性 / 不明' },
  { key: 'secondPerson', defaultLabel: '二人称' },
  { key: 'speechStyle', defaultLabel: '口調', multiline: true },
  { key: 'callPartner', defaultLabel: '相手の呼び方（基本）' },
  { key: 'relationship', defaultLabel: '関係性（基本）' },
  { key: 'height', defaultLabel: '身長', placeholder: '例: 158cm' },
  { key: 'weight', defaultLabel: '体重', placeholder: '例: 45kg' },
  {
    key: 'bodyType',
    defaultLabel: '体型 / 3サイズ',
    multiline: true,
    placeholder: '例: 華奢・B82 / W56 / H83',
  },
  {
    key: 'hairstyle',
    defaultLabel: '髪型・髪色',
    multiline: true,
    placeholder: '例: 黒髪ロング・左耳に青いヘアピン・毛先をゆるく巻いている',
  },
  {
    key: 'facialFeatures',
    defaultLabel: '顔立ち・瞳',
    multiline: true,
    placeholder: '例: 切れ長の翠の瞳・左目尻に泣きぼくろ・柔らかい微笑み',
  },
  { key: 'costume', defaultLabel: '衣装', multiline: true },
  {
    key: 'posture',
    defaultLabel: 'ポーズ / 姿勢・所作',
    multiline: true,
    placeholder: '例: 背筋が伸びた端正な立ち姿・考え事をするとき顎に指を添える',
  },
  { key: 'personality', defaultLabel: '性格・背景', multiline: true },
  {
    key: 'hobbies',
    defaultLabel: '趣味・趣向',
    multiline: true,
    placeholder: '例: 押し花の栞作り・紅茶・雨の日の読書',
  },
  {
    key: 'skills',
    defaultLabel: '特技',
    multiline: true,
    placeholder: '例: 速読・古書の修復・紅茶を淹れること',
  },
  {
    key: 'specialAbilities',
    defaultLabel: '特殊能力',
    multiline: true,
    placeholder: '例: 触れた本の記憶を読み取る（使用後は強い眠気を伴う）',
  },
  {
    key: 'weaknesses',
    defaultLabel: '弱点・苦手',
    multiline: true,
    placeholder: '例: 雷と暗所が苦手・嘘をつくのが下手',
  },
];

const STANDARD_FIELD_BY_KEY = new Map<keyof CharacterCommon, StandardOptionalFieldMeta>(
  STANDARD_OPTIONAL_FIELDS.map((field) => [field.key, field])
);

const CORE_DUAL_ELIGIBLE = [
  { key: 'firstPerson', label: '一人称 (firstPerson)', multiline: false },
  { key: 'name', label: '名前 (name)', multiline: false },
  { key: 'ruby', label: 'ルビ (ruby)', multiline: false },
  { key: 'shortName', label: 'セリフ話者名 (shortName)', multiline: false },
];

function formatBulkAddFeedback(
  label: string,
  scope: BulkFieldAddScope,
  result: BulkFieldAddResult
): string {
  const tplSuffix = result.registeredTemplate
    ? '・今後の新規キャラにも自動追加します'
    : '';

  if (scope === 'current') {
    if (result.addedCount > 0) {
      return result.registeredTemplate
        ? `「${label}」を追加し、今後の新規キャラにも自動追加するよう登録しました。`
        : `「${label}」を追加しました。`;
    }
    if (result.registeredTemplate) {
      return `「${label}」を今後の新規キャラ自動追加に登録しました。`;
    }
    return '';
  }

  if (result.addedCount > 0 && result.skippedCount > 0) {
    return `「${label}」を${result.addedCount}人に追加しました（${result.skippedCount}人は既存キーのためスキップ${tplSuffix}）。`;
  }
  if (result.addedCount > 0) {
    return `「${label}」を${result.addedCount}人に追加しました${tplSuffix}。`;
  }
  return `対象キャラは既存キーのためスキップしました${tplSuffix}。`;
}

export const CharacterEditorPane: React.FC<CharacterEditorPaneProps> = ({
  character,
  allCharacters,
  characterFolders,
  defaultCustomCommonFields,
  defaultDualFields,
  characterFieldMultiline,
  customCharacterCategories,
  activeMode,
  onUpdateCharacter,
  onChangeCharacterFieldMultiline,
  onResetCharacterFieldMultiline,
  onRegisterCharacterCategory,
  onBulkAddCommonField,
  onBulkAddDualField,
  onRemoveDefaultCommonField,
  onRemoveDefaultDualField,
  onMoveCharacterToFolder,
}) => {
  const isAdult = activeMode === 'adult';
  const currentFilename = getCharacterFilename(character);
  const dualFields = character.dualFields ?? [];
  const customCommonFields = character.customCommonFields ?? [];
  const relations = character.relations ?? [];

  const [isRowConfigMode, setIsRowConfigMode] = useState(false);
  const hasRowConfigOverrides = Object.keys(characterFieldMultiline).length > 0;

  const resolveFieldMultiline = (key: string, defaultMultiline: boolean): boolean => {
    if (Object.prototype.hasOwnProperty.call(characterFieldMultiline, key)) {
      return Boolean(characterFieldMultiline[key]);
    }
    return defaultMultiline;
  };

  const renderRowToggle = (key: string, defaultMultiline: boolean) => {
    if (!isRowConfigMode) return null;
    const isMulti = resolveFieldMultiline(key, defaultMultiline);
    return (
      <div
        role="group"
        aria-label={`${key} の行表示設定`}
        className="inline-flex items-center rounded border border-slate-200 bg-slate-100 p-0.5 shrink-0"
      >
        <button
          type="button"
          onClick={() => onChangeCharacterFieldMultiline(key, false, defaultMultiline)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
            !isMulti
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          1行
        </button>
        <button
          type="button"
          onClick={() => onChangeCharacterFieldMultiline(key, true, defaultMultiline)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
            isMulti
              ? isAdult
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'bg-slate-800 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          複数行
        </button>
      </div>
    );
  };

  const renderAdaptiveInput = (opts: {
    value: string;
    onChange: (value: string) => void;
    multiline: boolean;
    placeholder?: string;
    disabled?: boolean;
    tone?: 'default' | 'adult';
    size?: 'sm' | 'xs';
  }) => {
    const {
      value,
      onChange,
      multiline,
      placeholder,
      disabled,
      tone = 'default',
      size = 'sm',
    } = opts;
    const borderClasses =
      tone === 'adult'
        ? 'border-rose-200 focus:border-rose-400 disabled:bg-slate-100'
        : 'border-slate-200 focus:border-slate-400 disabled:bg-slate-100';
    const textClasses = size === 'xs' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-sm';

    if (multiline) {
      return (
        <AutoGrowTextarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          minRows={2}
          className={`w-full rounded-md border bg-white text-slate-900 focus:outline-none ${borderClasses} ${
            size === 'xs' ? 'px-2.5 py-1.5 text-xs leading-relaxed' : 'px-3 py-2 text-sm leading-relaxed'
          }`}
        />
      );
    }

    // Preserve newlines safely when a field containing line breaks is viewed in 1-line mode
    if (value.includes('\n')) {
      return (
        <textarea
          rows={1}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          title="改行を含むため1行高さのまま改行を保持しています"
          className={`w-full resize-none overflow-y-auto rounded-md border bg-white text-slate-900 focus:outline-none ${borderClasses} ${textClasses}`}
        />
      );
    }

    return (
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border bg-white text-slate-900 focus:outline-none ${borderClasses} ${textClasses}`}
      />
    );
  };

  const sameFolderCount = useMemo(
    () =>
      character.folder
        ? allCharacters.filter((c) => c.folder === character.folder).length
        : 0,
    [allCharacters, character.folder]
  );

  const otherCharacters = useMemo(
    () => allCharacters.filter((c) => c.id !== character.id),
    [allCharacters, character.id]
  );

  const characterById = useMemo(
    () => new Map(allCharacters.map((c) => [c.id, c])),
    [allCharacters]
  );

  const availableRelationTargets = useMemo(() => {
    const existingIds = new Set(relations.map((r) => r.targetCharacterId));
    return otherCharacters.filter((c) => !existingIds.has(c.id));
  }, [otherCharacters, relations]);

  const [selectedRelationTargetId, setSelectedRelationTargetId] = useState<string>('');

  useEffect(() => {
    if (
      availableRelationTargets.length > 0 &&
      !availableRelationTargets.some((c) => c.id === selectedRelationTargetId)
    ) {
      setSelectedRelationTargetId(availableRelationTargets[0].id);
    } else if (availableRelationTargets.length === 0 && selectedRelationTargetId !== '') {
      setSelectedRelationTargetId('');
    }
  }, [availableRelationTargets, selectedRelationTargetId]);

  const handleAddRelation = () => {
    const targetId = selectedRelationTargetId || availableRelationTargets[0]?.id;
    if (!targetId) return;
    if (relations.some((r) => r.targetCharacterId === targetId)) return;
    const nextRelations: CharacterRelation[] = [
      ...relations,
      {
        targetCharacterId: targetId,
        callPartner: '',
        relationship: '',
      },
    ];
    onUpdateCharacter({
      ...character,
      relations: nextRelations,
    });
  };

  const handleUpdateRelation = (
    targetCharacterId: string,
    patch: Partial<Pick<CharacterRelation, 'callPartner' | 'relationship'>>
  ) => {
    const nextRelations = relations.map((rel) =>
      rel.targetCharacterId === targetCharacterId ? { ...rel, ...patch } : rel
    );
    onUpdateCharacter({
      ...character,
      relations: nextRelations,
    });
  };

  const handleRemoveRelation = (targetCharacterId: string) => {
    const nextRelations = relations.filter((rel) => rel.targetCharacterId !== targetCharacterId);
    onUpdateCharacter({
      ...character,
      relations: nextRelations,
    });
  };

  // JSON filename edit state
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(currentFilename);
  const [filenameError, setFilenameError] = useState<string | null>(null);

  // Custom common field label & category editing state
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [movingCategoryKey, setMovingCategoryKey] = useState<string | null>(null);
  const [moveCategoryDraft, setMoveCategoryDraft] = useState<string>('');
  const [moveNewCategoryName, setMoveNewCategoryName] = useState('');
  const [moveCategoryError, setMoveCategoryError] = useState<string | null>(null);

  // Add common field state
  const [newCommonLabel, setNewCommonLabel] = useState('');
  const [newCommonKey, setNewCommonKey] = useState('');
  const [newCommonMultiline, setNewCommonMultiline] = useState(false);
  const [selectedCommonCategory, setSelectedCommonCategory] = useState<string>('');
  const [newCommonCategoryName, setNewCommonCategoryName] = useState('');
  const [commonAddScope, setCommonAddScope] = useState<BulkFieldAddScope>('current');
  const [saveCommonAsDefault, setSaveCommonAsDefault] = useState(false);
  const [commonAddError, setCommonAddError] = useState<string | null>(null);
  const [commonAddFeedback, setCommonAddFeedback] = useState<string | null>(null);

  const existingCustomCategories = useMemo(() => {
    const standardSet = new Set<string>(STANDARD_CHARACTER_CATEGORIES);
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (raw?: string) => {
      const trimmed = raw?.trim();
      if (!trimmed || standardSet.has(trimmed) || seen.has(trimmed)) return;
      seen.add(trimmed);
      list.push(trimmed);
    };
    customCharacterCategories.forEach(push);
    defaultCustomCommonFields.forEach((tpl) => push(tpl.category));
    allCharacters.forEach((c) => {
      (c.customCommonFields ?? []).forEach((cf) => push(cf.category));
    });
    return list;
  }, [customCharacterCategories, defaultCustomCommonFields, allCharacters]);

  // Add dual-profile field state
  const [selectedDualAddKey, setSelectedDualAddKey] = useState<string>('callPartner');
  const [customDualLabel, setCustomDualLabel] = useState('');
  const [customDualKey, setCustomDualKey] = useState('');
  const [customDualMultiline, setCustomDualMultiline] = useState(false);
  const [dualAddScope, setDualAddScope] = useState<BulkFieldAddScope>('current');
  const [saveDualAsDefault, setSaveDualAsDefault] = useState(false);
  const [dualAddError, setDualAddError] = useState<string | null>(null);
  const [dualAddFeedback, setDualAddFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFilenameDraft(currentFilename);
    setEditingFilename(false);
    setFilenameError(null);
    setEditingLabelKey(null);
    setMovingCategoryKey(null);
    setMoveCategoryError(null);
    setCommonAddError(null);
    setCommonAddFeedback(null);
    setDualAddError(null);
    setDualAddFeedback(null);
  }, [character.id, currentFilename]);

  useEffect(() => {
    if (!character.folder || sameFolderCount <= 1) {
      if (commonAddScope === 'same_folder') setCommonAddScope('current');
      if (dualAddScope === 'same_folder') setDualAddScope('current');
    }
  }, [character.folder, sameFolderCount, commonAddScope, dualAddScope]);

  const getTargetCharactersForScope = (scope: BulkFieldAddScope): CharacterData[] => {
    if (scope === 'all') return allCharacters;
    if (scope === 'same_folder' && character.folder) {
      return allCharacters.filter((c) => c.folder === character.folder);
    }
    return [character];
  };

  const activeDualKeySet = useMemo(
    () => new Set(dualFields.map((f) => f.key)),
    [dualFields]
  );

  const availableDualCatalog = useMemo(() => {
    const items: Array<{ key: string; label: string; multiline?: boolean }> = [
      ...STANDARD_OPTIONAL_FIELDS.map((f) => ({
        key: f.key,
        label: `${f.defaultLabel} (${f.key})`,
        multiline: f.multiline,
      })),
      ...customCommonFields.map((cf) => ({
        key: cf.key,
        label: `${cf.label} (${cf.key})`,
        multiline: cf.multiline,
      })),
      ...CORE_DUAL_ELIGIBLE,
    ];
    return items.filter((item) => !activeDualKeySet.has(item.key));
  }, [customCommonFields, activeDualKeySet]);

  useEffect(() => {
    if (
      selectedDualAddKey !== '__custom__' &&
      !availableDualCatalog.some((f) => f.key === selectedDualAddKey)
    ) {
      setSelectedDualAddKey(availableDualCatalog[0]?.key ?? '__custom__');
    }
  }, [availableDualCatalog, selectedDualAddKey]);

  const commitFilename = () => {
    const cleaned = filenameDraft.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!cleaned || cleaned === '.json') {
      setFilenameError('有効なファイル名を入力してください。');
      return;
    }
    const normalized = cleaned.toLowerCase().endsWith('.json')
      ? cleaned
      : `${cleaned}.json`;

    const currentFolder = character.folder ?? '';
    const conflict = allCharacters.some(
      (c) =>
        c.id !== character.id &&
        (c.folder ?? '') === currentFolder &&
        getCharacterFilename(c).toLowerCase() === normalized.toLowerCase()
    );
    if (conflict) {
      setFilenameError('同じフォルダ内に同じファイル名のキャラクターが既に存在します。');
      return;
    }

    setFilenameError(null);
    setEditingFilename(false);
    if (normalized !== currentFilename) {
      onUpdateCharacter({ ...character, filename: normalized });
    }
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify({ ...character, filename: currentFilename }, null, 2);
    triggerDownload(currentFilename, payload, 'application/json;charset=utf-8');
  };

  const updateCommon = (patch: Partial<CharacterCommon>) => {
    onUpdateCharacter({
      ...character,
      common: { ...character.common, ...patch },
    });
  };

  const getCommonValueByKey = (key: string): string => {
    if (key === 'shortName') return character.shortName ?? '';
    if (key === 'costume') return character.common.costume ?? character.common.costumeId ?? '';
    const custom = customCommonFields.find((f) => f.key === key);
    if (custom) return custom.value;
    return (character.common[key as keyof CharacterCommon] as string | undefined) ?? '';
  };

  // Rename label of a user-added custom common field
  const commitCustomFieldLabel = (key: string) => {
    const trimmed = labelDraft.trim();
    setEditingLabelKey(null);
    if (!trimmed) return;

    onUpdateCharacter({
      ...character,
      customCommonFields: customCommonFields.map((f) =>
        f.key === key ? { ...f, label: trimmed } : f
      ),
      dualFields: dualFields.map((df) =>
        df.key === key ? { ...df, label: `${trimmed} (${key})` } : df
      ),
    });
  };

  const openCategoryMove = (cf: CustomCommonField) => {
    setEditingLabelKey(null);
    if (movingCategoryKey === cf.key) {
      setMovingCategoryKey(null);
      setMoveCategoryError(null);
      return;
    }
    setMovingCategoryKey(cf.key);
    setMoveCategoryDraft(cf.category?.trim() ?? '');
    setMoveNewCategoryName('');
    setMoveCategoryError(null);
  };

  const commitCategoryMove = (key: string) => {
    let nextCategory: string | undefined;
    if (moveCategoryDraft === '__new__') {
      const trimmed = moveNewCategoryName.trim();
      if (!trimmed) {
        setMoveCategoryError('新しいカテゴリ名を入力してください。');
        return;
      }
      nextCategory = trimmed;
    } else {
      const trimmed = moveCategoryDraft.trim();
      nextCategory = trimmed || undefined;
    }

    if (
      nextCategory &&
      !(STANDARD_CHARACTER_CATEGORIES as readonly string[]).includes(nextCategory)
    ) {
      onRegisterCharacterCategory(nextCategory);
    }

    onUpdateCharacter({
      ...character,
      customCommonFields: customCommonFields.map((f) => {
        if (f.key !== key) return f;
        if (nextCategory) {
          return { ...f, category: nextCategory };
        }
        const rest = { ...f };
        delete rest.category;
        return rest;
      }),
    });

    setMovingCategoryKey(null);
    setMoveCategoryError(null);
    setMoveNewCategoryName('');
  };

  const handleAddCommonField = () => {
    setCommonAddError(null);
    setCommonAddFeedback(null);

    const label = newCommonLabel.trim();
    if (!label) {
      setCommonAddError('追加する項目名を入力してください。');
      return;
    }

    let resolvedCategory: string | undefined;
    if (selectedCommonCategory === '__new__') {
      const trimmedCat = newCommonCategoryName.trim();
      if (!trimmedCat) {
        setCommonAddError('新しいカテゴリ名を入力してください。');
        return;
      }
      resolvedCategory = trimmedCat;
    } else {
      const trimmedCat = selectedCommonCategory.trim();
      resolvedCategory = trimmedCat || undefined;
    }

    const effectiveScope: BulkFieldAddScope =
      allCharacters.length <= 1
        ? 'current'
        : commonAddScope === 'same_folder' && (!character.folder || sameFolderCount <= 1)
          ? 'current'
          : commonAddScope;

    const targetChars = getTargetCharactersForScope(effectiveScope);
    const reservedKeys = new Set<string>([
      'name',
      'ruby',
      'shortName',
      'firstPerson',
      'costumeId',
      ...STANDARD_OPTIONAL_FIELDS.map((f) => f.key),
    ]);

    let key = newCommonKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key) {
      const usedAcrossTargets = new Set<string>(reservedKeys);
      for (const tc of targetChars) {
        for (const f of tc.customCommonFields ?? []) {
          usedAcrossTargets.add(f.key);
        }
      }
      if (saveCommonAsDefault) {
        for (const tpl of defaultCustomCommonFields) {
          usedAcrossTargets.add(tpl.key);
        }
      }
      let idx = 1;
      while (usedAcrossTargets.has(`custom_${idx}`)) {
        idx++;
      }
      key = `custom_${idx}`;
    } else {
      if (reservedKeys.has(key)) {
        setCommonAddError(`変数キー "${key}" は標準項目で使用されています。`);
        return;
      }

      if (effectiveScope === 'current') {
        const currentHasKey = customCommonFields.some((f) => f.key === key);
        const alreadyInTemplate = defaultCustomCommonFields.some((t) => t.key === key);
        if (currentHasKey && (!saveCommonAsDefault || alreadyInTemplate)) {
          setCommonAddError(`変数キー "${key}" は既に使用されています。`);
          return;
        }
      } else {
        const allTargetsHaveKey = targetChars.every((tc) =>
          (tc.customCommonFields ?? []).some((f) => f.key === key)
        );
        const alreadyInTemplate = defaultCustomCommonFields.some((t) => t.key === key);
        if (allTargetsHaveKey && (!saveCommonAsDefault || alreadyInTemplate)) {
          setCommonAddError(`対象キャラクター全員に変数キー "${key}" が既に存在します。`);
          return;
        }
      }
    }

    const result = onBulkAddCommonField({
      sourceCharacterId: character.id,
      field: {
        key,
        label,
        multiline: newCommonMultiline,
        ...(resolvedCategory ? { category: resolvedCategory } : {}),
      },
      scope: effectiveScope,
      saveAsDefault: saveCommonAsDefault,
    });

    setCommonAddFeedback(formatBulkAddFeedback(label, effectiveScope, result));
    setNewCommonLabel('');
    setNewCommonKey('');
    setNewCommonMultiline(false);
    if (selectedCommonCategory === '__new__' && resolvedCategory) {
      setSelectedCommonCategory(resolvedCategory);
      setNewCommonCategoryName('');
    }
  };

  const handleUpdateCustomCommonValue = (key: string, value: string) => {
    onUpdateCharacter({
      ...character,
      customCommonFields: customCommonFields.map((f) =>
        f.key === key ? { ...f, value } : f
      ),
    });
  };

  const handleDeleteCustomCommonField = (key: string) => {
    if (movingCategoryKey === key) {
      setMovingCategoryKey(null);
      setMoveCategoryError(null);
    }
    onUpdateCharacter({
      ...character,
      customCommonFields: customCommonFields.filter((f) => f.key !== key),
      dualFields: dualFields.filter((df) => df.key !== key),
      lockedFields: (character.lockedFields ?? []).filter((lf) => lf !== key),
    });
  };

  const handleAddDualField = () => {
    setDualAddError(null);
    setDualAddFeedback(null);

    const effectiveScope: BulkFieldAddScope =
      allCharacters.length <= 1
        ? 'current'
        : dualAddScope === 'same_folder' && (!character.folder || sameFolderCount <= 1)
          ? 'current'
          : dualAddScope;

    const targetChars = getTargetCharactersForScope(effectiveScope);

    if (selectedDualAddKey === '__custom__') {
      const label = customDualLabel.trim();
      const rawKey = customDualKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!label || !rawKey) {
        setDualAddError('カスタム項目名と変数キー（半角英数）の両方を入力してください。');
        return;
      }

      if (effectiveScope === 'current') {
        const currentHasKey = dualFields.some((f) => f.key === rawKey);
        const alreadyInTemplate = defaultDualFields.some((t) => t.key === rawKey);
        if (currentHasKey && (!saveDualAsDefault || alreadyInTemplate)) {
          setDualAddError(`キー "${rawKey}" は既に追加されています。`);
          return;
        }
      } else {
        const allTargetsHaveKey = targetChars.every((tc) =>
          (tc.dualFields ?? []).some((f) => f.key === rawKey)
        );
        const alreadyInTemplate = defaultDualFields.some((t) => t.key === rawKey);
        if (allTargetsHaveKey && (!saveDualAsDefault || alreadyInTemplate)) {
          setDualAddError(`対象キャラクター全員にキー "${rawKey}" が既に追加されています。`);
          return;
        }
      }

      const nextDef: DualProfileFieldDef = {
        key: rawKey,
        label,
        multiline: customDualMultiline,
      };
      const result = onBulkAddDualField({
        sourceCharacterId: character.id,
        field: nextDef,
        scope: effectiveScope,
        saveAsDefault: saveDualAsDefault,
      });
      setDualAddFeedback(formatBulkAddFeedback(label, effectiveScope, result));
      setCustomDualLabel('');
      setCustomDualKey('');
      setCustomDualMultiline(false);
      return;
    }

    const catalogItem = availableDualCatalog.find((f) => f.key === selectedDualAddKey);
    if (!catalogItem) return;

    const nextDef: DualProfileFieldDef = {
      key: catalogItem.key,
      label: catalogItem.label,
      multiline: Boolean(catalogItem.multiline),
    };

    const result = onBulkAddDualField({
      sourceCharacterId: character.id,
      field: nextDef,
      scope: effectiveScope,
      saveAsDefault: saveDualAsDefault,
    });
    setDualAddFeedback(formatBulkAddFeedback(catalogItem.label, effectiveScope, result));
  };

  const handleRemoveDualField = (key: string) => {
    onUpdateCharacter({
      ...character,
      dualFields: dualFields.filter((f) => f.key !== key),
      lockedFields: (character.lockedFields ?? []).filter((f) => f !== key),
    });
  };

  const toggleLock = (key: string) => {
    const locked = character.lockedFields ?? [];
    const exists = locked.includes(key);
    const nextLocked = exists ? locked.filter((f) => f !== key) : [...locked, key];
    onUpdateCharacter({ ...character, lockedFields: nextLocked });
  };

  const updateProfile = (mode: 'general' | 'adult', key: string, value: string) => {
    onUpdateCharacter({
      ...character,
      profiles: {
        general: character.profiles?.general ?? {},
        adult: character.profiles?.adult ?? {},
        [mode]: {
          ...(character.profiles?.[mode] ?? {}),
          [key]: value,
        },
      },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-code text-slate-400">
                characters/{character.folder ? `${character.folder}/` : ''}
              </span>
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
                    aria-label="キャラクターJSONファイル名"
                    className="w-44 rounded border border-slate-300 bg-white px-2 py-0.5 font-code text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitFilename}
                    title="ファイル名を確定して保存"
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
                value={character.folder ?? ''}
                onChange={(e) =>
                  onMoveCharacterToFolder(character.id, e.target.value || undefined)
                }
                aria-label="所属フォルダ"
                title="所属フォルダを変更"
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-slate-400 focus:outline-none"
              >
                <option value="">フォルダ: 直下（未分類）</option>
                {characterFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    フォルダ: {folder}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">·</span>
              <span>
                現在の解決モード: {isAdult ? 'R18 (adult)' : '一般用 (general)'}
              </span>
            </div>

            {filenameError && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">{filenameError}</p>
            )}

            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {character.common.name}
              <span className="ml-2 text-xs font-normal text-slate-500">
                （{character.common.ruby}）
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              title={`${currentFilename} をダウンロード保存`}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON保存</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-8 p-4 @xl:p-6 pb-16 max-w-4xl">
        {/* Common Settings */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">共通設定 (common)</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                初期項目の値編集や、任意項目の追加・項目名編集・削除が可能です
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isRowConfigMode && hasRowConfigOverrides && (
                <button
                  type="button"
                  onClick={onResetCharacterFieldMultiline}
                  title="すべての項目の行設定を初期状態に戻す"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>既定に戻す</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsRowConfigMode((v) => !v)}
                title="固定項目・追加項目の「1行 / 複数行」表示を切り替えるモード"
                className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  isRowConfigMode
                    ? isAdult
                      ? 'border-rose-700 bg-rose-700 text-white'
                      : 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <WrapText className="h-3.5 w-3.5" />
                <span>{isRowConfigMode ? '行設定を完了' : '行設定を編集'}</span>
              </button>
            </div>
          </div>

          {isRowConfigMode && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              固定項目・追加項目・デュアル項目ごとに「1行」と「複数行（自動伸縮）」を切り替えられます。変更はプロジェクト内の全キャラクターに共通適用されます。
            </div>
          )}

          {(() => {
            const renderCoreField = (opts: {
              key: string;
              label: string;
              value: string;
              onChange: (value: string) => void;
            }) => {
              const isMulti = resolveFieldMultiline(opts.key, false);
              return (
                <div
                  key={opts.key}
                  className={`space-y-1 ${isMulti ? '@xl:col-span-2' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {opts.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeDualKeySet.has(opts.key) && (
                        <span className="text-[10px] text-amber-700">モード別上書き中</span>
                      )}
                      {renderRowToggle(opts.key, false)}
                    </div>
                  </div>
                  {renderAdaptiveInput({
                    value: opts.value,
                    onChange: opts.onChange,
                    multiline: isMulti,
                  })}
                </div>
              );
            };

            const renderStandardField = (key: keyof CharacterCommon) => {
              const field = STANDARD_FIELD_BY_KEY.get(key);
              if (!field) return null;
              const val = getCommonValueByKey(field.key);
              const defaultMultiline = Boolean(field.multiline);
              const isMulti = resolveFieldMultiline(field.key, defaultMultiline);

              return (
                <div
                  key={field.key}
                  className={`space-y-1 ${isMulti ? '@xl:col-span-2' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium text-slate-700 truncate">
                        {field.defaultLabel}
                      </span>
                      <span className="font-code text-[10px] text-slate-400">
                        ({field.key})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeDualKeySet.has(field.key) && (
                        <span className="text-[10px] text-amber-700">モード別上書き中</span>
                      )}
                      {renderRowToggle(field.key, defaultMultiline)}
                    </div>
                  </div>

                  {renderAdaptiveInput({
                    value: val,
                    onChange: (nextVal) => updateCommon({ [field.key]: nextVal }),
                    multiline: isMulti,
                    placeholder: field.placeholder,
                  })}
                </div>
              );
            };

            const standardCategorySet = new Set<string>(STANDARD_CHARACTER_CATEGORIES);
            const getStandardCategoryCustomFields = (cat: StandardCharacterCategory) =>
              customCommonFields.filter((cf) => cf.category?.trim() === cat);

            const customCategoryGroups = (() => {
              const grouped = new Map<string, CustomCommonField[]>();
              for (const cf of customCommonFields) {
                const cat = cf.category?.trim();
                if (!cat || standardCategorySet.has(cat)) continue;
                const list = grouped.get(cat) ?? [];
                list.push(cf);
                grouped.set(cat, list);
              }
              const ordered: Array<{ category: string; fields: CustomCommonField[] }> = [];
              const used = new Set<string>();
              for (const cat of existingCustomCategories) {
                const fields = grouped.get(cat);
                if (fields && fields.length > 0) {
                  ordered.push({ category: cat, fields });
                  used.add(cat);
                }
              }
              for (const [cat, fields] of grouped.entries()) {
                if (!used.has(cat) && fields.length > 0) {
                  ordered.push({ category: cat, fields });
                }
              }
              return ordered;
            })();

            const unclassifiedCustomFields = customCommonFields.filter(
              (cf) => !cf.category?.trim()
            );

            const renderCustomCommonField = (cf: CustomCommonField) => {
              const isEditingThisLabel = editingLabelKey === cf.key;
              const isMovingThisCategory = movingCategoryKey === cf.key;
              const defaultMultiline = Boolean(cf.multiline);
              const isMulti = resolveFieldMultiline(cf.key, defaultMultiline);

              return (
                <div
                  key={cf.key}
                  className={`space-y-1.5 ${isMulti ? '@xl:col-span-2' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {isEditingThisLabel ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={labelDraft}
                          onChange={(e) => setLabelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              commitCustomFieldLabel(cf.key);
                            }
                            if (e.key === 'Escape') setEditingLabelKey(null);
                          }}
                          autoFocus
                          className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => commitCustomFieldLabel(cf.key)}
                          className="rounded bg-slate-800 p-0.5 text-white hover:bg-slate-900"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setMovingCategoryKey(null);
                            setMoveCategoryError(null);
                            setEditingLabelKey(cf.key);
                            setLabelDraft(cf.label);
                          }}
                          title="クリックして項目名を編集"
                          className="group flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 truncate"
                        >
                          <span className="truncate">{cf.label}</span>
                          <span className="font-code text-[10px] text-slate-400">
                            ({cf.key})
                          </span>
                          <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-600 shrink-0" />
                        </button>
                        {activeDualKeySet.has(cf.key) && (
                          <span className="text-[10px] text-amber-700 shrink-0">
                            上書き中
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openCategoryMove(cf)}
                        title="カテゴリを変更"
                        aria-label={`${cf.label} のカテゴリを変更`}
                        className={`rounded p-0.5 transition-colors shrink-0 ${
                          isMovingThisCategory
                            ? isAdult
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-200 text-slate-800'
                            : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'
                        }`}
                      >
                        <Tag className="h-3.5 w-3.5" />
                      </button>
                      {renderRowToggle(cf.key, defaultMultiline)}
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomCommonField(cf.key)}
                        title="この追加項目を削除"
                        className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isMovingThisCategory && (
                    <div className="rounded-md border border-slate-200 bg-slate-50/90 p-2 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-medium text-slate-500 shrink-0">
                          移動先:
                        </span>
                        <select
                          value={moveCategoryDraft}
                          onChange={(e) => {
                            setMoveCategoryDraft(e.target.value);
                            setMoveCategoryError(null);
                          }}
                          aria-label={`${cf.label} の移動先カテゴリ`}
                          className="min-w-[150px] flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-slate-400 focus:outline-none"
                        >
                          <option value="">追加した共通項目（未分類）</option>
                          <optgroup label="標準カテゴリ">
                            {STANDARD_CHARACTER_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </optgroup>
                          {existingCustomCategories.length > 0 && (
                            <optgroup label="作成済みカテゴリ">
                              {existingCustomCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__new__">＋ 新しいカテゴリを作成...</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => commitCategoryMove(cf.key)}
                          className={`inline-flex items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium text-white transition-colors shrink-0 ${
                            isAdult
                              ? 'bg-rose-700 hover:bg-rose-800'
                              : 'bg-slate-800 hover:bg-slate-900'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                          <span>移動</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovingCategoryKey(null);
                            setMoveCategoryError(null);
                          }}
                          aria-label="カテゴリ変更をキャンセル"
                          className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>

                      {moveCategoryDraft === '__new__' && (
                        <input
                          type="text"
                          value={moveNewCategoryName}
                          onChange={(e) => {
                            setMoveNewCategoryName(e.target.value);
                            setMoveCategoryError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              commitCategoryMove(cf.key);
                            }
                            if (e.key === 'Escape') {
                              setMovingCategoryKey(null);
                              setMoveCategoryError(null);
                            }
                          }}
                          autoFocus
                          placeholder="新しいカテゴリ名（例: 戦闘・能力）"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none"
                        />
                      )}

                      {moveCategoryError && (
                        <p className="text-[10px] font-medium text-rose-600">{moveCategoryError}</p>
                      )}
                    </div>
                  )}

                  {renderAdaptiveInput({
                    value: cf.value,
                    onChange: (nextVal) => handleUpdateCustomCommonValue(cf.key, nextVal),
                    multiline: isMulti,
                  })}
                </div>
              );
            };

            return (
              <>
                {/* 1. 基本情報 */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    基本情報
                  </h4>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderCoreField({
                      key: 'name',
                      label: '名前 (name)',
                      value: character.common.name,
                      onChange: (val) => updateCommon({ name: val }),
                    })}

                    {renderCoreField({
                      key: 'ruby',
                      label: 'ルビ (ruby)',
                      value: character.common.ruby,
                      onChange: (val) => updateCommon({ ruby: val }),
                    })}

                    {renderCoreField({
                      key: 'shortName',
                      label: 'セリフ話者名（Tab挿入用 shortName）',
                      value: character.shortName,
                      onChange: (val) => onUpdateCharacter({ ...character, shortName: val }),
                    })}

                    {renderStandardField('ageDisplay')}
                    {renderStandardField('gender')}
                    {getStandardCategoryCustomFields('基本情報').map(renderCustomCommonField)}
                  </div>
                </div>

                {/* 2. 話し方・セリフ */}
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    話し方・セリフ
                  </h4>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderCoreField({
                      key: 'firstPerson',
                      label: '一人称 (firstPerson)',
                      value: character.common.firstPerson,
                      onChange: (val) => updateCommon({ firstPerson: val }),
                    })}

                    {renderStandardField('secondPerson')}
                    {renderStandardField('speechStyle')}
                    {getStandardCategoryCustomFields('話し方・セリフ').map(renderCustomCommonField)}
                  </div>
                </div>

                {/* 3. 対人・呼び方・関係性 */}
                <div className="space-y-4 border-t border-slate-100 pt-5">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    対人・呼び方・関係性
                  </h4>

                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderStandardField('callPartner')}
                    {renderStandardField('relationship')}
                    {getStandardCategoryCustomFields('対人・呼び方・関係性').map(
                      renderCustomCommonField
                    )}
                  </div>

                  {/* Per-Character Calling Name & Relationship Settings */}
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-500" />
                          <h5 className="text-xs font-semibold text-slate-900">
                            キャラクター別の呼び方・関係性
                          </h5>
                          <span className="font-code text-[11px] text-slate-400 tabular-nums">
                            ({relations.length}人)
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          登録済みキャラクターごとに個別の呼び方・関係性を設定できます（本文変数{' '}
                          <code className="rounded bg-slate-100 px-1 py-0.5 font-code text-[10px] text-slate-700">
                            {`{{${character.id}.callPartner.相手ID}}`}
                          </code>{' '}
                          /{' '}
                          <code className="rounded bg-slate-100 px-1 py-0.5 font-code text-[10px] text-slate-700">
                            {`{{${character.id}.relationship.相手ID}}`}
                          </code>{' '}
                          で展開）
                        </p>
                      </div>
                    </div>

                    {otherCharacters.length === 0 ? (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-center text-xs text-slate-500">
                        他のキャラクターを追加すると、相手ごとの呼び方・関係性を設定できます。
                      </p>
                    ) : (
                      <>
                        {/* Add Target Character Bar */}
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/70 p-2.5">
                          {availableRelationTargets.length > 0 ? (
                            <>
                              <select
                                value={selectedRelationTargetId}
                                onChange={(e) => setSelectedRelationTargetId(e.target.value)}
                                aria-label="関係性を設定する相手キャラクター"
                                className="min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                              >
                                {availableRelationTargets.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    {target.folder ? `[${target.folder}] ` : ''}
                                    {target.common.name}
                                    {target.shortName && target.shortName !== target.common.name
                                      ? `（${target.shortName}）`
                                      : ''}{' '}
                                    — {target.id}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={handleAddRelation}
                                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                                  isAdult
                                    ? 'bg-rose-700 hover:bg-rose-800'
                                    : 'bg-slate-800 hover:bg-slate-900'
                                }`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>相手を追加</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              登録済みの他キャラクターはすべて設定済みです。
                            </span>
                          )}
                        </div>

                        {/* Configured Relation Rows */}
                        {relations.length === 0 ? (
                          <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                            キャラクター別の設定はまだありません。上から相手を選んで追加してください。
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {relations.map((rel) => {
                              const target = characterById.get(rel.targetCharacterId);
                              const targetName = target?.common.name ?? '未登録のキャラクター';
                              const targetSub = target
                                ? target.folder
                                  ? `${target.folder} · ${target.id}`
                                  : target.id
                                : rel.targetCharacterId;

                              return (
                                <div
                                  key={rel.targetCharacterId}
                                  className="rounded-md border border-slate-200 bg-slate-50/40 p-3 space-y-2.5"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                      <span
                                        className={`text-xs font-semibold ${
                                          target ? 'text-slate-900' : 'text-amber-700'
                                        }`}
                                      >
                                        → {targetName}
                                      </span>
                                      <span className="font-code text-[10px] text-slate-400">
                                        ({targetSub})
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="hidden @xl:inline font-code text-[10px] text-slate-400">
                                        {`{{${character.id}.callPartner.${rel.targetCharacterId}}}`}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveRelation(rel.targetCharacterId)}
                                        title={`${targetName} 向けの設定を削除`}
                                        className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                                    <label className="block space-y-1">
                                      <span className="text-[11px] font-medium text-slate-600">
                                        相手の呼び方 (callPartner.{rel.targetCharacterId})
                                      </span>
                                      <input
                                        type="text"
                                        value={rel.callPartner}
                                        onChange={(e) =>
                                          handleUpdateRelation(rel.targetCharacterId, {
                                            callPartner: e.target.value,
                                          })
                                        }
                                        placeholder="例: 結城くん / 先輩"
                                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                                      />
                                    </label>

                                    <label className="block space-y-1">
                                      <span className="text-[11px] font-medium text-slate-600">
                                        関係性 (relationship.{rel.targetCharacterId})
                                      </span>
                                      <input
                                        type="text"
                                        value={rel.relationship}
                                        onChange={(e) =>
                                          handleUpdateRelation(rel.targetCharacterId, {
                                            relationship: e.target.value,
                                          })
                                        }
                                        placeholder="例: 同じ図書委員の同級生"
                                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                                      />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 4. 外見・体格 */}
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    外見・体格
                  </h4>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderStandardField('height')}
                    {renderStandardField('weight')}
                    {renderStandardField('bodyType')}
                    {renderStandardField('hairstyle')}
                    {renderStandardField('facialFeatures')}
                    {renderStandardField('costume')}
                    {renderStandardField('posture')}
                    {getStandardCategoryCustomFields('外見・体格').map(renderCustomCommonField)}
                  </div>
                </div>

                {/* 5. 性格・パーソナリティ */}
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    性格・パーソナリティ
                  </h4>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderStandardField('personality')}
                    {renderStandardField('hobbies')}
                    {getStandardCategoryCustomFields('性格・パーソナリティ').map(
                      renderCustomCommonField
                    )}
                  </div>
                </div>

                {/* 6. 能力・スキル */}
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                    能力・スキル
                  </h4>
                  <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                    {renderStandardField('skills')}
                    {renderStandardField('specialAbilities')}
                    {renderStandardField('weaknesses')}
                    {getStandardCategoryCustomFields('能力・スキル').map(renderCustomCommonField)}
                  </div>
                </div>

                {/* Custom Categories (user-created groups with >= 1 field on this character) */}
                {customCategoryGroups.map(({ category, fields }) => (
                  <div
                    key={`custom-category-${category}`}
                    className="space-y-3 border-t border-slate-100 pt-5"
                  >
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                        {category}
                      </h4>
                      <span className="font-code text-[11px] text-slate-400 tabular-nums">
                        ({fields.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                      {fields.map(renderCustomCommonField)}
                    </div>
                  </div>
                ))}

                {/* 6. 追加した共通項目 (未分類 + 項目追加バー) */}
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-[11px] font-semibold tracking-wide text-slate-500">
                      追加した共通項目
                    </h4>
                    {unclassifiedCustomFields.length > 0 && (
                      <span className="font-code text-[11px] text-slate-400 tabular-nums">
                        ({unclassifiedCustomFields.length})
                      </span>
                    )}
                  </div>

                  {unclassifiedCustomFields.length > 0 && (
                    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
                      {unclassifiedCustomFields.map(renderCustomCommonField)}
                    </div>
                  )}

                  {/* Add Common Field Bar */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={newCommonLabel}
                        onChange={(e) => {
                          setNewCommonLabel(e.target.value);
                          setCommonAddError(null);
                          setCommonAddFeedback(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddCommonField();
                        }}
                        placeholder="新しい項目名（例: 誕生日・苦手なもの）"
                        className="min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newCommonKey}
                        onChange={(e) => {
                          setNewCommonKey(e.target.value);
                          setCommonAddError(null);
                          setCommonAddFeedback(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddCommonField();
                        }}
                        placeholder="変数キー半角英数（省略可）"
                        className="w-40 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-code text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newCommonMultiline}
                          onChange={(e) => setNewCommonMultiline(e.target.checked)}
                        />
                        <span>複数行</span>
                      </label>

                      <button
                        type="button"
                        onClick={handleAddCommonField}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                          isAdult
                            ? 'bg-rose-700 hover:bg-rose-800'
                            : 'bg-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>共通項目を追加</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/70 pt-2 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-500">カテゴリ:</span>
                          <select
                            value={selectedCommonCategory}
                            onChange={(e) => {
                              setSelectedCommonCategory(e.target.value);
                              setCommonAddError(null);
                              setCommonAddFeedback(null);
                            }}
                            aria-label="追加する共通項目のカテゴリ"
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-slate-400 focus:outline-none"
                          >
                            <option value="">追加した共通項目（未分類）</option>
                            <optgroup label="標準カテゴリ">
                              {STANDARD_CHARACTER_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </optgroup>
                            {existingCustomCategories.length > 0 && (
                              <optgroup label="作成済みカテゴリ">
                                {existingCustomCategories.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <option value="__new__">＋ 新しいカテゴリを作成...</option>
                          </select>
                        </label>

                        {selectedCommonCategory === '__new__' && (
                          <input
                            type="text"
                            value={newCommonCategoryName}
                            onChange={(e) => {
                              setNewCommonCategoryName(e.target.value);
                              setCommonAddError(null);
                              setCommonAddFeedback(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                handleAddCommonField();
                              }
                            }}
                            placeholder="新しいカテゴリ名（例: 戦闘・能力）"
                            className="w-48 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none"
                          />
                        )}
                      </div>

                      {allCharacters.length > 1 && (
                        <label className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-500">追加先:</span>
                          <select
                            value={commonAddScope}
                            onChange={(e) => {
                              setCommonAddScope(e.target.value as BulkFieldAddScope);
                              setCommonAddError(null);
                              setCommonAddFeedback(null);
                            }}
                            aria-label="共通項目の追加先キャラクター"
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-slate-400 focus:outline-none"
                          >
                            <option value="current">このキャラクターのみ</option>
                            {character.folder && sameFolderCount > 1 && (
                              <option value="same_folder">
                                同じフォルダ「{character.folder}」の全キャラ（{sameFolderCount}人）
                              </option>
                            )}
                            <option value="all">全キャラクター（{allCharacters.length}人）</option>
                          </select>
                        </label>
                      )}

                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={saveCommonAsDefault}
                          onChange={(e) => setSaveCommonAsDefault(e.target.checked)}
                        />
                        <span>今後の新規キャラにも自動追加</span>
                      </label>
                    </div>

                    {commonAddError && (
                      <p className="text-[11px] font-medium text-rose-600">{commonAddError}</p>
                    )}

                    {commonAddFeedback && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <Check className="h-3 w-3 shrink-0" />
                        <span>{commonAddFeedback}</span>
                      </p>
                    )}

                    {defaultCustomCommonFields.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500">
                        <span className="shrink-0">新規キャラ自動追加:</span>
                        {defaultCustomCommonFields.map((tpl) => (
                          <span
                            key={tpl.key}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                          >
                            {tpl.category && (
                              <span className="rounded bg-slate-100 px-1 py-0.25 text-[10px] text-slate-500">
                                {tpl.category}
                              </span>
                            )}
                            <span>{tpl.label}</span>
                            <span className="font-code text-[10px] text-slate-400">
                              ({tpl.key})
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemoveDefaultCommonField(tpl.key)}
                              title="新規キャラへの自動追加を解除（既存キャラには影響しません）"
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </section>

        {/* Dynamic Dual Profile Section */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                デュアル・プロファイル設定 (general / adult)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                モード別に切り替えたい項目だけを任意で追加できます（🔒で一般用値にロック可能）
              </p>
            </div>
          </div>

          {/* Add Field Bar */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedDualAddKey}
                onChange={(e) => {
                  setSelectedDualAddKey(e.target.value);
                  setDualAddError(null);
                  setDualAddFeedback(null);
                }}
                aria-label="デュアル・プロファイルに追加する項目を選択"
                className="min-w-[220px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
              >
                {availableDualCatalog.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
                <option value="__custom__">＋ カスタム項目を自由作成...</option>
              </select>

              <button
                type="button"
                onClick={handleAddDualField}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>項目を追加</span>
              </button>
            </div>

            {selectedDualAddKey === '__custom__' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="text"
                  value={customDualLabel}
                  onChange={(e) => {
                    setCustomDualLabel(e.target.value);
                    setDualAddError(null);
                    setDualAddFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddDualField();
                  }}
                  placeholder="表示名（例: 声のトーン）"
                  className="min-w-[160px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                />
                <input
                  type="text"
                  value={customDualKey}
                  onChange={(e) => {
                    setCustomDualKey(e.target.value);
                    setDualAddError(null);
                    setDualAddFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddDualField();
                  }}
                  placeholder="変数キー半角英数（例: voiceTone）"
                  className="min-w-[170px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-code text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customDualMultiline}
                    onChange={(e) => setCustomDualMultiline(e.target.checked)}
                  />
                  <span>複数行</span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/70 pt-2 text-xs text-slate-600">
              {allCharacters.length > 1 && (
                <label className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500">追加先:</span>
                  <select
                    value={dualAddScope}
                    onChange={(e) => {
                      setDualAddScope(e.target.value as BulkFieldAddScope);
                      setDualAddError(null);
                      setDualAddFeedback(null);
                    }}
                    aria-label="デュアル・プロファイル項目の追加先キャラクター"
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    <option value="current">このキャラクターのみ</option>
                    {character.folder && sameFolderCount > 1 && (
                      <option value="same_folder">
                        同じフォルダ「{character.folder}」の全キャラ（{sameFolderCount}人）
                      </option>
                    )}
                    <option value="all">全キャラクター（{allCharacters.length}人）</option>
                  </select>
                </label>
              )}

              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={saveDualAsDefault}
                  onChange={(e) => setSaveDualAsDefault(e.target.checked)}
                />
                <span>今後の新規キャラにも自動追加</span>
              </label>
            </div>

            {dualAddError && (
              <p className="text-[11px] font-medium text-rose-600">{dualAddError}</p>
            )}

            {dualAddFeedback && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <Check className="h-3 w-3 shrink-0" />
                <span>{dualAddFeedback}</span>
              </p>
            )}

            {defaultDualFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-500">
                <span className="shrink-0">新規キャラ自動追加:</span>
                {defaultDualFields.map((tpl) => (
                  <span
                    key={tpl.key}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                  >
                    <span>{tpl.label}</span>
                    {!tpl.label.includes(`(${tpl.key})`) && (
                      <span className="font-code text-[10px] text-slate-400">({tpl.key})</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveDefaultDualField(tpl.key)}
                      title="新規キャラへの自動追加を解除（既存キャラには影響しません）"
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Added Dual Fields List */}
          {dualFields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="text-xs font-medium text-slate-700">
                モード別の差し替え項目はまだ追加されていません
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                現在はすべての項目で「共通設定 (common)」の値が使用されます。上のドロップダウンから項目を選択して追加してください。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {dualFields.map(({ key, label, multiline }) => {
                const isLocked = (character.lockedFields ?? []).includes(key);
                const generalVal =
                  character.profiles?.general?.[key] ?? getCommonValueByKey(key);
                const adultVal =
                  character.profiles?.adult?.[key] ?? generalVal;
                const defaultMultiline = Boolean(multiline);
                const isMulti = resolveFieldMultiline(key, defaultMultiline);

                return (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-200 bg-slate-50/40 p-3.5"
                  >
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800">{label}</span>
                        <span className="font-code text-[11px] text-slate-400">
                          {`{{${character.id}.${key}}}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderRowToggle(key, defaultMultiline)}
                        <button
                          type="button"
                          onClick={() => toggleLock(key)}
                          className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            isLocked
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="h-3 w-3" />
                              <span>一般値でロック中</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" />
                              <span>モード別に切替</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDualField(key)}
                          title="デュアル・プロファイルから削除して共通設定に戻す"
                          className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-[11px] font-medium text-slate-600">
                          一般用 (general)
                        </div>
                        {renderAdaptiveInput({
                          value: generalVal,
                          onChange: (nextVal) => updateProfile('general', key, nextVal),
                          multiline: isMulti,
                          size: 'xs',
                        })}
                      </div>

                      <div className={isLocked ? 'opacity-50' : ''}>
                        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-rose-700">
                          <span>R18用 (adult)</span>
                          {isLocked && <span>※ロック中（一般用を参照）</span>}
                        </div>
                        {renderAdaptiveInput({
                          value: isLocked ? generalVal : adultVal,
                          onChange: (nextVal) => updateProfile('adult', key, nextVal),
                          multiline: isMulti,
                          disabled: isLocked,
                          tone: 'adult',
                          size: 'xs',
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
