import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Download,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  BulkFieldAddResult,
  BulkFieldAddScope,
  CharacterCommon,
  CharacterData,
  CustomCommonFieldTemplate,
  DualProfileFieldDef,
} from '../types/scenario';
import { getCharacterFilename, triggerDownload } from '../utils/storageManager';

interface CharacterEditorPaneProps {
  character: CharacterData;
  allCharacters: CharacterData[];
  characterFolders: string[];
  defaultCustomCommonFields: CustomCommonFieldTemplate[];
  defaultDualFields: DualProfileFieldDef[];
  activeMode: ActiveMode;
  onUpdateCharacter: (updated: CharacterData) => void;
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
  { key: 'relationship', defaultLabel: '関係性' },
  { key: 'callPartner', defaultLabel: '相手の呼び方' },
  { key: 'secondPerson', defaultLabel: '二人称' },
  { key: 'costume', defaultLabel: '衣装' },
  { key: 'height', defaultLabel: '身長', placeholder: '例: 158cm' },
  { key: 'weight', defaultLabel: '体重', placeholder: '例: 45kg' },
  {
    key: 'bodyType',
    defaultLabel: '体型 / 3サイズ',
    placeholder: '例: 華奢・B82 / W56 / H83',
  },
  { key: 'speechStyle', defaultLabel: '口調', multiline: true },
  { key: 'personality', defaultLabel: '性格・背景', multiline: true },
  {
    key: 'hobbies',
    defaultLabel: '趣味・趣向',
    multiline: true,
    placeholder: '例: 押し花の栞作り・紅茶・雨の日の読書',
  },
];

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
  activeMode,
  onUpdateCharacter,
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

  const sameFolderCount = useMemo(
    () =>
      character.folder
        ? allCharacters.filter((c) => c.folder === character.folder).length
        : 0,
    [allCharacters, character.folder]
  );

  // JSON filename edit state
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(currentFilename);
  const [filenameError, setFilenameError] = useState<string | null>(null);

  // Custom common field label editing state
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  // Add common field state
  const [newCommonLabel, setNewCommonLabel] = useState('');
  const [newCommonKey, setNewCommonKey] = useState('');
  const [newCommonMultiline, setNewCommonMultiline] = useState(false);
  const [commonAddScope, setCommonAddScope] = useState<BulkFieldAddScope>('current');
  const [saveCommonAsDefault, setSaveCommonAsDefault] = useState(false);
  const [commonAddError, setCommonAddError] = useState<string | null>(null);
  const [commonAddFeedback, setCommonAddFeedback] = useState<string | null>(null);

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

  const handleAddCommonField = () => {
    setCommonAddError(null);
    setCommonAddFeedback(null);

    const label = newCommonLabel.trim();
    if (!label) {
      setCommonAddError('追加する項目名を入力してください。');
      return;
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
      },
      scope: effectiveScope,
      saveAsDefault: saveCommonAsDefault,
    });

    setCommonAddFeedback(formatBulkAddFeedback(label, effectiveScope, result));
    setNewCommonLabel('');
    setNewCommonKey('');
    setNewCommonMultiline(false);
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

      <div className="flex-1 space-y-8 p-6 pb-16 max-w-4xl">
        {/* Common Settings */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <h3 className="text-sm font-semibold text-slate-900">共通設定 (common)</h3>
            <span className="text-xs text-slate-500">
              初期項目の値編集や、任意項目の追加・項目名編集・削除が可能です
            </span>
          </div>

          {/* Core Identification (Fixed) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">名前 (name)</span>
                {activeDualKeySet.has('name') && (
                  <span className="text-[10px] text-amber-700">モード別上書き中</span>
                )}
              </div>
              <input
                type="text"
                value={character.common.name}
                onChange={(e) => updateCommon({ name: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">ルビ (ruby)</span>
                {activeDualKeySet.has('ruby') && (
                  <span className="text-[10px] text-amber-700">モード別上書き中</span>
                )}
              </div>
              <input
                type="text"
                value={character.common.ruby}
                onChange={(e) => updateCommon({ ruby: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  セリフ話者名（Tab挿入用 shortName）
                </span>
                {activeDualKeySet.has('shortName') && (
                  <span className="text-[10px] text-amber-700">モード別上書き中</span>
                )}
              </div>
              <input
                type="text"
                value={character.shortName}
                onChange={(e) =>
                  onUpdateCharacter({ ...character, shortName: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  一人称 (firstPerson)
                </span>
                {activeDualKeySet.has('firstPerson') && (
                  <span className="text-[10px] text-amber-700">モード別上書き中</span>
                )}
              </div>
              <input
                type="text"
                value={character.common.firstPerson}
                onChange={(e) => updateCommon({ firstPerson: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>
          </div>

          {/* Initial Common Fields (Values Editable Only; Label & Field Locked) + Custom Common Fields (Editable & Deletable) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {STANDARD_OPTIONAL_FIELDS.map((field) => {
              const val = getCommonValueByKey(field.key);

              return (
                <div
                  key={field.key}
                  className={`space-y-1 ${field.multiline ? 'md:col-span-2' : ''}`}
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
                    {activeDualKeySet.has(field.key) && (
                      <span className="text-[10px] text-amber-700 shrink-0">
                        モード別上書き中
                      </span>
                    )}
                  </div>

                  {field.multiline ? (
                    <textarea
                      value={val}
                      onChange={(e) => updateCommon({ [field.key]: e.target.value })}
                      rows={2}
                      placeholder={field.placeholder}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateCommon({ [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}

            {customCommonFields.map((cf) => {
              const isEditingThisLabel = editingLabelKey === cf.key;
              return (
                <div
                  key={cf.key}
                  className={`space-y-1 ${cf.multiline ? 'md:col-span-2' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    {isEditingThisLabel ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={labelDraft}
                          onChange={(e) => setLabelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCustomFieldLabel(cf.key);
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

                    <button
                      type="button"
                      onClick={() => handleDeleteCustomCommonField(cf.key)}
                      title="この追加項目を削除"
                      className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {cf.multiline ? (
                    <textarea
                      value={cf.value}
                      onChange={(e) => handleUpdateCustomCommonValue(cf.key, e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={cf.value}
                      onChange={(e) => handleUpdateCustomCommonValue(cf.key, e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>

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
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>共通項目を追加</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/70 pt-2 text-xs text-slate-600">
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
                    <span>{tpl.label}</span>
                    <span className="font-code text-[10px] text-slate-400">({tpl.key})</span>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-[11px] font-medium text-slate-600">
                          一般用 (general)
                        </div>
                        {multiline ? (
                          <textarea
                            rows={2}
                            value={generalVal}
                            onChange={(e) => updateProfile('general', key, e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={generalVal}
                            onChange={(e) => updateProfile('general', key, e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                          />
                        )}
                      </div>

                      <div className={isLocked ? 'opacity-50' : ''}>
                        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-rose-700">
                          <span>R18用 (adult)</span>
                          {isLocked && <span>※ロック中（一般用を参照）</span>}
                        </div>
                        {multiline ? (
                          <textarea
                            rows={2}
                            disabled={isLocked}
                            value={isLocked ? generalVal : adultVal}
                            onChange={(e) => updateProfile('adult', key, e.target.value)}
                            className="w-full rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-rose-400 focus:outline-none disabled:bg-slate-100"
                          />
                        ) : (
                          <input
                            type="text"
                            disabled={isLocked}
                            value={isLocked ? generalVal : adultVal}
                            onChange={(e) => updateProfile('adult', key, e.target.value)}
                            className="w-full rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-rose-400 focus:outline-none disabled:bg-slate-100"
                          />
                        )}
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
