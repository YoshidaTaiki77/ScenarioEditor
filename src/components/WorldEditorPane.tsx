import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ExternalLink,
  Folder,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  WorldCustomField,
  WorldSettingData,
} from '../types/scenario';
import { getWorldFilename } from '../utils/storageManager';
import { ReferenceImageGallery } from './CharacterImageGallery';

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}

const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  placeholder,
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
};

interface WorldFieldPresetGroup {
  id: string;
  label: string;
  fields: Array<{ key: string; label: string; multiline: boolean }>;
}

const WORLD_FIELD_PRESETS: WorldFieldPresetGroup[] = [
  {
    id: 'stage',
    label: '舞台用',
    fields: [
      { key: 'location', label: '場所・立地', multiline: false },
      { key: 'atmosphere', label: '雰囲気・時間帯', multiline: true },
      { key: 'features', label: '設備・特徴', multiline: true },
    ],
  },
  {
    id: 'item',
    label: 'アイテム用',
    fields: [
      { key: 'appearance', label: '外観・形状', multiline: true },
      { key: 'origin', label: '由来・入手経緯', multiline: true },
      { key: 'effect', label: '効果・制約', multiline: true },
    ],
  },
  {
    id: 'lore',
    label: '組織・用語用',
    fields: [
      { key: 'scale', label: '構成・規模', multiline: false },
      { key: 'rules', label: 'ルール・歴史', multiline: true },
    ],
  },
];

interface WorldEditorPaneProps {
  worldItem: WorldSettingData;
  allWorldSettings: WorldSettingData[];
  worldFolders: string[];
  characters: CharacterData[];
  activeMode: ActiveMode;
  onUpdateWorldSetting: (updated: WorldSettingData) => void;
  onDeleteWorldSetting: (id: string) => void;
  onMoveWorldToFolder: (worldId: string, folder?: string) => void;
  onOpenCharacter: (characterId: string) => void;
}

export const WorldEditorPane: React.FC<WorldEditorPaneProps> = ({
  worldItem,
  allWorldSettings,
  worldFolders,
  characters,
  activeMode,
  onUpdateWorldSetting,
  onDeleteWorldSetting,
  onMoveWorldToFolder,
  onOpenCharacter,
}) => {
  const isAdult = activeMode === 'adult';
  const currentFilename = getWorldFilename(worldItem);
  const customFields = worldItem.customFields ?? [];
  const relatedCharacterIds = worldItem.relatedCharacterIds ?? [];

  // JSON filename edit state
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(currentFilename);
  const [filenameError, setFilenameError] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Custom field add / edit states
  const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldMultiline, setNewFieldMultiline] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [fieldFeedback, setFieldFeedback] = useState<string | null>(null);

  // Related characters picker state
  const [selectedCharToAdd, setSelectedCharToAdd] = useState<string>('');

  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters]
  );

  const availableCharacters = useMemo(() => {
    const linked = new Set(relatedCharacterIds);
    return characters.filter((c) => !linked.has(c.id));
  }, [characters, relatedCharacterIds]);

  useEffect(() => {
    setFilenameDraft(currentFilename);
    setEditingFilename(false);
    setFilenameError(null);
    setConfirmingDelete(false);
    setEditingLabelKey(null);
    setFieldError(null);
    setFieldFeedback(null);
  }, [worldItem.id, currentFilename]);

  useEffect(() => {
    if (
      availableCharacters.length > 0 &&
      !availableCharacters.some((c) => c.id === selectedCharToAdd)
    ) {
      setSelectedCharToAdd(availableCharacters[0].id);
    } else if (availableCharacters.length === 0 && selectedCharToAdd !== '') {
      setSelectedCharToAdd('');
    }
  }, [availableCharacters, selectedCharToAdd]);

  const commitFilename = () => {
    const cleaned = filenameDraft.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!cleaned || cleaned === '.json') {
      setFilenameError('有効なファイル名を入力してください。');
      return;
    }
    const normalized = cleaned.toLowerCase().endsWith('.json')
      ? cleaned
      : `${cleaned}.json`;

    const currentFolder = worldItem.folder ?? '';
    const conflict = allWorldSettings.some(
      (w) =>
        w.id !== worldItem.id &&
        (w.folder ?? '') === currentFolder &&
        getWorldFilename(w).toLowerCase() === normalized.toLowerCase()
    );
    if (conflict) {
      setFilenameError('同じフォルダ内に同じファイル名の設定が既に存在します。');
      return;
    }

    setFilenameError(null);
    setEditingFilename(false);
    if (normalized !== currentFilename) {
      onUpdateWorldSetting({ ...worldItem, filename: normalized });
    }
  };

  const handleApplyPreset = (preset: WorldFieldPresetGroup) => {
    setFieldError(null);
    const existingKeys = new Set(customFields.map((f) => f.key));
    const toAdd: WorldCustomField[] = preset.fields
      .filter((pf) => !existingKeys.has(pf.key))
      .map((pf) => ({
        key: pf.key,
        label: pf.label,
        value: '',
        multiline: pf.multiline,
      }));

    if (toAdd.length === 0) {
      setFieldFeedback(`${preset.label}テンプレートの項目はすべて追加済みです。`);
      return;
    }

    onUpdateWorldSetting({
      ...worldItem,
      customFields: [...customFields, ...toAdd],
    });
    setFieldFeedback(`${preset.label}テンプレートから${toAdd.length}項目を追加しました。`);
  };

  const handleAddCustomField = () => {
    setFieldError(null);
    setFieldFeedback(null);

    const label = newFieldLabel.trim();
    if (!label) {
      setFieldError('追加する項目名を入力してください。');
      return;
    }

    const reservedKeys = new Set(['name', 'ruby', 'summary', 'details', 'adultNote']);
    let key = newFieldKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key) {
      const used = new Set([...reservedKeys, ...customFields.map((f) => f.key)]);
      let idx = 1;
      while (used.has(`field_${idx}`)) {
        idx++;
      }
      key = `field_${idx}`;
    } else if (reservedKeys.has(key)) {
      setFieldError(`変数キー "${key}" は基本項目で使用されています。`);
      return;
    } else if (customFields.some((f) => f.key === key)) {
      setFieldError(`変数キー "${key}" は既に使用されています。`);
      return;
    }

    onUpdateWorldSetting({
      ...worldItem,
      customFields: [
        ...customFields,
        {
          key,
          label,
          value: '',
          multiline: newFieldMultiline,
        },
      ],
    });
    setNewFieldLabel('');
    setNewFieldKey('');
    setFieldFeedback(`「${label}」を追加しました。`);
  };

  const commitFieldLabel = (key: string) => {
    const trimmed = labelDraft.trim();
    setEditingLabelKey(null);
    if (!trimmed) return;
    onUpdateWorldSetting({
      ...worldItem,
      customFields: customFields.map((f) => (f.key === key ? { ...f, label: trimmed } : f)),
    });
  };

  const handleUpdateFieldValue = (key: string, value: string) => {
    onUpdateWorldSetting({
      ...worldItem,
      customFields: customFields.map((f) => (f.key === key ? { ...f, value } : f)),
    });
  };

  const handleToggleFieldMultiline = (key: string, multiline: boolean) => {
    onUpdateWorldSetting({
      ...worldItem,
      customFields: customFields.map((f) => (f.key === key ? { ...f, multiline } : f)),
    });
  };

  const handleDeleteCustomField = (key: string) => {
    onUpdateWorldSetting({
      ...worldItem,
      customFields: customFields.filter((f) => f.key !== key),
    });
  };

  const handleAddRelatedCharacter = () => {
    const targetId = selectedCharToAdd || availableCharacters[0]?.id;
    if (!targetId || relatedCharacterIds.includes(targetId)) return;
    onUpdateWorldSetting({
      ...worldItem,
      relatedCharacterIds: [...relatedCharacterIds, targetId],
    });
  };

  const handleRemoveRelatedCharacter = (charId: string) => {
    onUpdateWorldSetting({
      ...worldItem,
      relatedCharacterIds: relatedCharacterIds.filter((id) => id !== charId),
    });
  };

  return (
    <div className="@container flex h-full flex-col bg-white overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 @md:px-6 @lg:px-8 py-5 @lg:py-6 space-y-8">
        {/* Header */}
        <div className="border-b border-slate-200 pb-4 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
                <h2 className="text-lg font-semibold text-slate-900 truncate">
                  {worldItem.name || '名称未設定'}
                </h2>
                <span className="font-code text-xs text-slate-400">
                  ID: {worldItem.id}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                本文中で{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-code text-[11px] text-slate-700">
                  {`{{world.${worldItem.id}.name}}`}
                </code>{' '}
                と記述すると名称や各項目が自動展開されます。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {confirmingDelete ? (
                <div className="flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1">
                  <span className="text-[11px] font-medium text-rose-700">削除しますか？</span>
                  <button
                    type="button"
                    onClick={() => onDeleteWorldSetting(worldItem.id)}
                    className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    削除
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                  >
                    戻す
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  title="この世界観設定を削除"
                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>削除</span>
                </button>
              )}
            </div>
          </div>

          {/* Folder & JSON Filename bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <label className="flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11px] text-slate-500">フォルダ:</span>
              <select
                value={worldItem.folder ?? ''}
                onChange={(e) => onMoveWorldToFolder(worldItem.id, e.target.value || undefined)}
                aria-label="世界観設定の保存フォルダ"
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
              >
                <option value="">world/（ルート）</option>
                {worldFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    world/{folder}/
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">ファイル名:</span>
              {editingFilename ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={filenameDraft}
                    onChange={(e) => {
                      setFilenameDraft(e.target.value);
                      setFilenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitFilename();
                      if (e.key === 'Escape') {
                        setEditingFilename(false);
                        setFilenameDraft(currentFilename);
                        setFilenameError(null);
                      }
                    }}
                    className="w-44 rounded border border-slate-300 bg-white px-2 py-0.5 font-code text-xs text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={commitFilename}
                    className="rounded bg-slate-800 p-1 text-white hover:bg-slate-900"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFilename(false);
                      setFilenameDraft(currentFilename);
                      setFilenameError(null);
                    }}
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
                  className="group inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-code text-[11px] text-slate-700 hover:border-slate-300 hover:bg-white"
                >
                  <span>{currentFilename}</span>
                  <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          {filenameError && (
            <p className="text-[11px] font-medium text-rose-600">{filenameError}</p>
          )}
        </div>

        {/* Section 1: 基本設定 */}
        <section className="space-y-4">
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-sm font-semibold text-slate-900">基本設定</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              舞台・アイテム・用語などの名称と概要、詳細な設定本文を記述します
            </p>
          </div>

          {/* 世界観設定画像 */}
          <ReferenceImageGallery
            entityId={worldItem.id}
            images={worldItem.images ?? []}
            activeMode={activeMode}
            entityUnitLabel="1つの世界観設定"
            labelPlaceholder="ラベル（例: 外観・間取り図・アイテム資料）"
            altFallback={`${worldItem.name || '世界観'}の設定画像`}
            onChangeImages={(nextImages) =>
              onUpdateWorldSetting({
                ...worldItem,
                images: nextImages.length > 0 ? nextImages : undefined,
              })
            }
          />

          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">名称 (name)</span>
              <input
                type="text"
                value={worldItem.name}
                onChange={(e) => onUpdateWorldSetting({ ...worldItem, name: e.target.value })}
                placeholder="例: 旧校舎の図書室 / 古い押し花の栞"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">読み / 別名 (ruby)</span>
              <input
                type="text"
                value={worldItem.ruby ?? ''}
                onChange={(e) => onUpdateWorldSetting({ ...worldItem, ruby: e.target.value })}
                placeholder="例: きゅうこうしゃのとしょしつ / 通称など"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1 @xl:col-span-2">
              <span className="text-xs font-medium text-slate-700">
                概要 (summary)
                <span className="ml-1.5 font-normal text-[11px] text-slate-400">
                  右インスペクターの一覧にも表示されます
                </span>
              </span>
              <AutoGrowTextarea
                value={worldItem.summary}
                onChange={(val) => onUpdateWorldSetting({ ...worldItem, summary: val })}
                minRows={2}
                placeholder="1〜2行で特徴を要約（例: 放課後の西日が差し込む、静かな旧校舎二階の書架スペース。）"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>

            <label className="block space-y-1 @xl:col-span-2">
              <span className="text-xs font-medium text-slate-700">詳細設定 (details)</span>
              <AutoGrowTextarea
                value={worldItem.details}
                onChange={(val) => onUpdateWorldSetting({ ...worldItem, details: val })}
                minRows={4}
                placeholder="背景・歴史・描写のポイント・注意点などを自由に記述..."
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-slate-400 focus:outline-none"
              />
            </label>
          </div>
        </section>

        {/* Section 2: 項目テンプレート & カスタム項目 */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                詳細項目（テンプレート・任意追加）
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                用途に合わせて項目をワンクリック挿入、または自由に追加できます
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <Sparkles className="h-3 w-3 text-slate-400" />
                <span>プリセット挿入:</span>
              </span>
              {WORLD_FIELD_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  ＋ {preset.label}
                </button>
              ))}
            </div>
          </div>

          {customFields.length > 0 && (
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-4">
              {customFields.map((cf) => {
                const isEditingThis = editingLabelKey === cf.key;
                const isMulti = Boolean(cf.multiline);
                return (
                  <div
                    key={cf.key}
                    className={`space-y-1.5 ${isMulti ? '@xl:col-span-2' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isEditingThis ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                commitFieldLabel(cf.key);
                              }
                              if (e.key === 'Escape') setEditingLabelKey(null);
                            }}
                            className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitFieldLabel(cf.key)}
                            className="rounded bg-slate-800 p-0.5 text-white hover:bg-slate-900"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLabelKey(cf.key);
                            setLabelDraft(cf.label);
                          }}
                          title="クリックして項目名を編集"
                          className="group flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 truncate min-w-0"
                        >
                          <span className="truncate">{cf.label}</span>
                          <span className="font-code text-[10px] text-slate-400">({cf.key})</span>
                          <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-600 shrink-0" />
                        </button>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          role="group"
                          aria-label={`${cf.label} の行表示`}
                          className="inline-flex items-center rounded border border-slate-200 bg-slate-100 p-0.5"
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleFieldMultiline(cf.key, false)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              !isMulti
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            1行
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleFieldMultiline(cf.key, true)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
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

                        <button
                          type="button"
                          onClick={() => handleDeleteCustomField(cf.key)}
                          title="この項目を削除"
                          className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isMulti ? (
                      <AutoGrowTextarea
                        value={cf.value}
                        onChange={(val) => handleUpdateFieldValue(cf.key, val)}
                        minRows={2}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-slate-400 focus:outline-none"
                      />
                    ) : cf.value.includes('\n') ? (
                      <textarea
                        rows={1}
                        value={cf.value}
                        onChange={(e) => handleUpdateFieldValue(cf.key, e.target.value)}
                        title="改行を含むため1行高さのまま改行を保持しています"
                        className="w-full resize-none overflow-y-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={cf.value}
                        onChange={(e) => handleUpdateFieldValue(cf.key, e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Custom Field Bar */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => {
                  setNewFieldLabel(e.target.value);
                  setFieldError(null);
                  setFieldFeedback(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddCustomField();
                }}
                placeholder="新しい項目名（例: 禁止事項・入手難易度）"
                className="min-w-[180px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              />
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => {
                  setNewFieldKey(e.target.value);
                  setFieldError(null);
                  setFieldFeedback(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddCustomField();
                }}
                placeholder="変数キー半角英数（省略可）"
                className="w-40 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-code text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFieldMultiline}
                  onChange={(e) => setNewFieldMultiline(e.target.checked)}
                />
                <span>複数行</span>
              </label>

              <button
                type="button"
                onClick={handleAddCustomField}
                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>項目を追加</span>
              </button>
            </div>

            {fieldError && <p className="text-[11px] font-medium text-rose-600">{fieldError}</p>}
            {fieldFeedback && (
              <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <Check className="h-3 w-3 shrink-0" />
                <span>{fieldFeedback}</span>
              </p>
            )}
          </div>
        </section>

        {/* Section 3: 関連キャラクター */}
        <section className="space-y-3">
          <div className="border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">関連キャラクター</h3>
              <span className="font-code text-xs text-slate-400 tabular-nums">
                ({relatedCharacterIds.length})
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              持ち主・関係者・よく訪れるキャラクターなどを紐付けできます
            </p>
          </div>

          {characters.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-center text-xs text-slate-500">
              キャラクターを登録すると、ここに紐付けできます。
            </p>
          ) : (
            <div className="space-y-3">
              {relatedCharacterIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {relatedCharacterIds.map((cid) => {
                    const char = characterById.get(cid);
                    return (
                      <div
                        key={cid}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800"
                      >
                        {char ? (
                          <button
                            type="button"
                            onClick={() => onOpenCharacter(char.id)}
                            title={`${char.common.name} の設定を開く`}
                            className="inline-flex items-center gap-1 font-medium text-slate-800 hover:text-slate-950"
                          >
                            <span>{char.common.name}</span>
                            {char.folder && (
                              <span className="text-[10px] text-slate-400">({char.folder})</span>
                            )}
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </button>
                        ) : (
                          <span className="text-amber-700">未登録 ({cid})</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveRelatedCharacter(cid)}
                          title="紐付けを解除"
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {availableCharacters.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/70 p-2.5">
                  <select
                    value={selectedCharToAdd}
                    onChange={(e) => setSelectedCharToAdd(e.target.value)}
                    aria-label="関連付けるキャラクター"
                    className="min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
                  >
                    {availableCharacters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.folder ? `[${c.folder}] ` : ''}
                        {c.common.name} — {c.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddRelatedCharacter}
                    className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                      isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>キャラを紐付け</span>
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  登録済みの全キャラクターが紐付け済みです。
                </p>
              )}
            </div>
          )}
        </section>

        {/* Section 4: R18モード補足・裏設定（任意） */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                モード別補足（R18 / 裏設定）
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                成人向けモード執筆時のみ参照・展開したい補足設定を任意で記述できます（本文変数{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-code text-[10px] text-slate-700">
                  {`{{world.${worldItem.id}.adultNote}}`}
                </code>
                ）
              </p>
            </div>

            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={Boolean(worldItem.enableAdultNote)}
                onChange={(e) =>
                  onUpdateWorldSetting({
                    ...worldItem,
                    enableAdultNote: e.target.checked,
                  })
                }
              />
              <span>R18モード補足を使用</span>
            </label>
          </div>

          {worldItem.enableAdultNote && (
            <div className="rounded-lg border border-rose-200/80 bg-rose-50/40 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-rose-800">R18モード補足・裏設定 (adultNote)</span>
                <span className="text-rose-600/80">一般モード出力時は自動で空になります</span>
              </div>
              <AutoGrowTextarea
                value={worldItem.adultNote ?? ''}
                onChange={(val) => onUpdateWorldSetting({ ...worldItem, adultNote: val })}
                minRows={3}
                placeholder="例: 施錠ギミック、照明の暗さ、人目のつきにくさ、成人向けシーン専用のアイテム効果など..."
                className="w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-rose-400 focus:outline-none"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
