import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  CornerDownLeft,
  FileWarning,
  HelpCircle,
  Lock,
  Maximize2,
  User,
  X,
} from 'lucide-react';
import {
  STANDARD_CHARACTER_CATEGORIES,
  type ActiveMode,
  type CharacterData,
  type ProofreadIssue,
  type SceneData,
  type SelectedItem,
  type WorldSettingData,
} from '../types/scenario';
import {
  filterReferenceImagesForMode,
  formatSceneImageTag,
} from '../utils/imageUtils';
import {
  detectSpeakerOnLine,
  proofreadScene,
  resolveCharacterProfile,
} from '../utils/scenarioEngine';
import { ImageLightboxModal } from './CharacterImageGallery';
import { UsageGuideTab } from './UsageGuideTab';

type InspectorTab = 'reference' | 'proofread' | 'guide';

interface RightInspectorPaneProps {
  activeMode: ActiveMode;
  selectedItemType: SelectedItem['type'];
  scene: SceneData | null;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  worldFolders: string[];
  cursorIndex: number;
  onJumpToLine: (line: number) => void;
  onInsertSnippet: (snippet: string, placeCaretBefore?: string) => void;
  isOverlay?: boolean;
  onClose?: () => void;
}

export const RightInspectorPane: React.FC<RightInspectorPaneProps> = ({
  activeMode,
  selectedItemType,
  scene,
  characters,
  worldSettings,
  worldFolders,
  cursorIndex,
  onJumpToLine,
  onInsertSnippet,
  isOverlay = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('reference');
  const [referenceMode, setReferenceMode] = useState<'character' | 'world'>('character');
  const [manualCharId, setManualCharId] = useState<string>('');
  const [selectedWorldFolderFilter, setSelectedWorldFolderFilter] = useState<string>('__all__');
  const [worldSearchQuery, setWorldSearchQuery] = useState<string>('');
  const [selectedWorldId, setSelectedWorldId] = useState<string>('');
  const [copiedVarKey, setCopiedVarKey] = useState<string | null>(null);
  const [insertedImgKey, setInsertedImgKey] = useState<string | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedWorldImageIdx, setSelectedWorldImageIdx] = useState(0);
  const [worldLightboxIndex, setWorldLightboxIndex] = useState<number | null>(null);

  const handleInsertReferenceImage = (key: string, ref: string, caption: string) => {
    const tag = formatSceneImageTag(ref, caption);
    onInsertSnippet(tag);
    setInsertedImgKey(key);
    window.setTimeout(() => {
      setInsertedImgKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  const isAdult = activeMode === 'adult';

  // Detect speaker on cursor line or fallback
  const detectedSpeaker = useMemo(() => {
    if (!scene) return characters[0] ?? null;
    return detectSpeakerOnLine(scene.body, cursorIndex, characters);
  }, [scene, cursorIndex, characters]);

  const activeCharacter = useMemo(() => {
    if (detectedSpeaker) return detectedSpeaker;
    if (manualCharId) {
      return characters.find((c) => c.id === manualCharId) ?? characters[0] ?? null;
    }
    return characters[0] ?? null;
  }, [detectedSpeaker, manualCharId, characters]);

  const resolvedChar = useMemo(() => {
    if (!activeCharacter) return null;
    return resolveCharacterProfile(activeCharacter, activeMode);
  }, [activeCharacter, activeMode]);

  const visibleCharImages = useMemo(
    () => filterReferenceImagesForMode(activeCharacter?.images, activeMode),
    [activeCharacter, activeMode]
  );

  useEffect(() => {
    setSelectedImageIdx(0);
    setLightboxIndex(null);
  }, [activeCharacter?.id, activeMode]);

  useEffect(() => {
    if (visibleCharImages.length === 0) {
      setSelectedImageIdx(0);
      setLightboxIndex(null);
    } else if (selectedImageIdx >= visibleCharImages.length) {
      setSelectedImageIdx(0);
    }
  }, [visibleCharImages.length, selectedImageIdx]);

  const filteredWorldSettings = useMemo(() => {
    const q = worldSearchQuery.trim().toLowerCase();
    return worldSettings.filter((w) => {
      if (selectedWorldFolderFilter === '__root__' && w.folder) return false;
      if (
        selectedWorldFolderFilter !== '__all__' &&
        selectedWorldFolderFilter !== '__root__' &&
        w.folder !== selectedWorldFolderFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        (w.ruby ?? '').toLowerCase().includes(q) ||
        w.summary.toLowerCase().includes(q) ||
        w.details.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q)
      );
    });
  }, [worldSettings, selectedWorldFolderFilter, worldSearchQuery]);

  const activeWorldItem = useMemo(() => {
    if (filteredWorldSettings.length === 0) return null;
    if (selectedWorldId) {
      const found = filteredWorldSettings.find((w) => w.id === selectedWorldId);
      if (found) return found;
    }
    return filteredWorldSettings[0];
  }, [filteredWorldSettings, selectedWorldId]);

  const visibleWorldImages = useMemo(
    () => filterReferenceImagesForMode(activeWorldItem?.images, activeMode),
    [activeWorldItem, activeMode]
  );

  useEffect(() => {
    setSelectedWorldImageIdx(0);
    setWorldLightboxIndex(null);
  }, [activeWorldItem?.id, activeMode]);

  useEffect(() => {
    if (visibleWorldImages.length === 0) {
      setSelectedWorldImageIdx(0);
      setWorldLightboxIndex(null);
    } else if (selectedWorldImageIdx >= visibleWorldImages.length) {
      setSelectedWorldImageIdx(0);
    }
  }, [visibleWorldImages.length, selectedWorldImageIdx]);

  const worldVariableItems = useMemo(() => {
    if (!activeWorldItem) return [];
    const items: Array<{ key: string; label: string; notation: string; value: string }> = [
      {
        key: `world.${activeWorldItem.id}.name`,
        label: '名称',
        notation: `{{world.${activeWorldItem.id}.name}}`,
        value: activeWorldItem.name,
      },
    ];
    if (activeWorldItem.ruby) {
      items.push({
        key: `world.${activeWorldItem.id}.ruby`,
        label: '読み / 別名',
        notation: `{{world.${activeWorldItem.id}.ruby}}`,
        value: activeWorldItem.ruby,
      });
    }
    if (activeWorldItem.summary) {
      items.push({
        key: `world.${activeWorldItem.id}.summary`,
        label: '概要',
        notation: `{{world.${activeWorldItem.id}.summary}}`,
        value: activeWorldItem.summary,
      });
    }
    for (const cf of activeWorldItem.customFields ?? []) {
      items.push({
        key: `world.${activeWorldItem.id}.${cf.key}`,
        label: cf.label,
        notation: `{{world.${activeWorldItem.id}.${cf.key}}}`,
        value: cf.value,
      });
    }
    if (isAdult && activeWorldItem.enableAdultNote && activeWorldItem.adultNote) {
      items.push({
        key: `world.${activeWorldItem.id}.adultNote`,
        label: 'R18補足',
        notation: `{{world.${activeWorldItem.id}.adultNote}}`,
        value: activeWorldItem.adultNote,
      });
    }
    return items;
  }, [activeWorldItem, isAdult]);

  // Real-time zero-AI proofreading
  const issues: ProofreadIssue[] = useMemo(() => {
    if (!scene) return [];
    return proofreadScene(scene.body, characters, activeMode, worldSettings, scene);
  }, [scene, characters, activeMode, worldSettings]);

  const quickTemplates = useMemo(() => {
    const cName = resolvedChar?.shortName ?? '栞';
    if (isAdult) {
      return [
        {
          label: '[R18_BLOCK_START: 導入〜接触]',
          snippet: '[R18_BLOCK_START: 導入〜接触]\n\n[R18_BLOCK_END]\n',
          caretBefore: '[R18_BLOCK_END]',
        },
        {
          label: '[R18_BLOCK_START: 絶頂〜余韻]',
          snippet: '[R18_BLOCK_START: 絶頂〜余韻]\n\n[R18_BLOCK_END]\n',
          caretBefore: '[R18_BLOCK_END]',
        },
        {
          label: '[IF_MODE: adult] 分岐ブロック',
          snippet: '[IF_MODE: adult]\n\n[/IF_MODE]\n',
          caretBefore: '[/IF_MODE]',
        },
        {
          label: `${cName} 吐息セリフ「……っ、」`,
          snippet: `${cName}「……っ、」`,
          caretBefore: '」',
        },
        {
          label: '情景ト書き「――」',
          snippet: '――',
        },
      ];
    }
    return [
      {
        label: '[IF_MODE: general] 分岐ブロック',
        snippet: '[IF_MODE: general]\n\n[/IF_MODE]\n',
        caretBefore: '[/IF_MODE]',
      },
      {
        label: '[IF_MODE: adult] 分岐ブロック',
        snippet: '[IF_MODE: adult]\n\n[/IF_MODE]\n',
        caretBefore: '[/IF_MODE]',
      },
      {
        label: '情景ト書き「――」',
        snippet: '――',
      },
    ];
  }, [isAdult, resolvedChar]);

  const characterVariableItems = useMemo(() => {
    if (!resolvedChar) return [];
    const lockedSet = new Set(resolvedChar.lockedFields);
    const items: Array<{
      key: string;
      label: string;
      notation: string;
      value: string;
      locked: boolean;
    }> = [
      {
        key: 'firstPerson',
        label: '一人称',
        notation: `{{${resolvedChar.id}.firstPerson}}`,
        value: resolvedChar.firstPerson,
        locked: lockedSet.has('firstPerson'),
      },
      {
        key: 'secondPerson',
        label: '二人称',
        notation: `{{${resolvedChar.id}.secondPerson}}`,
        value: resolvedChar.secondPerson,
        locked: lockedSet.has('secondPerson'),
      },
      {
        key: 'costume',
        label: '衣装',
        notation: `{{${resolvedChar.id}.costume}}`,
        value: resolvedChar.costume,
        locked: lockedSet.has('costume'),
      },
      {
        key: 'name',
        label: '名前',
        notation: `{{${resolvedChar.id}.name}}`,
        value: resolvedChar.name,
        locked: lockedSet.has('name'),
      },
      {
        key: 'shortName',
        label: '話者名',
        notation: `{{${resolvedChar.id}.shortName}}`,
        value: resolvedChar.shortName,
        locked: lockedSet.has('shortName'),
      },
    ];

    const optionalStandard: Array<{ key: keyof typeof resolvedChar; label: string }> = [
      { key: 'ruby', label: 'ルビ' },
      { key: 'ageDisplay', label: '年齢表記' },
      { key: 'gender', label: '性別' },
      { key: 'height', label: '身長' },
      { key: 'weight', label: '体重' },
      { key: 'bodyType', label: '体型 / 3サイズ' },
      { key: 'hairstyle', label: '髪型・髪色' },
      { key: 'facialFeatures', label: '顔立ち・瞳' },
      { key: 'posture', label: 'ポーズ / 姿勢・所作' },
      { key: 'skills', label: '特技' },
      { key: 'specialAbilities', label: '特殊能力' },
      { key: 'weaknesses', label: '弱点・苦手' },
    ];
    for (const opt of optionalStandard) {
      const val = String(resolvedChar[opt.key] ?? '');
      if (val || lockedSet.has(opt.key)) {
        items.push({
          key: String(opt.key),
          label: opt.label,
          notation: `{{${resolvedChar.id}.${String(opt.key)}}}`,
          value: val,
          locked: lockedSet.has(String(opt.key)),
        });
      }
    }

    for (const rel of resolvedChar.relations) {
      const target = characters.find((c) => c.id === rel.targetCharacterId);
      const targetLabel = target?.shortName || target?.common.name || rel.targetCharacterId;
      items.push({
        key: `callPartner.${rel.targetCharacterId}`,
        label: `相手の呼び方（→${targetLabel}）`,
        notation: `{{${resolvedChar.id}.callPartner.${rel.targetCharacterId}}}`,
        value: rel.callPartner,
        locked: false,
      });
      if (rel.relationship) {
        items.push({
          key: `relationship.${rel.targetCharacterId}`,
          label: `関係性（→${targetLabel}）`,
          notation: `{{${resolvedChar.id}.relationship.${rel.targetCharacterId}}}`,
          value: rel.relationship,
          locked: false,
        });
      }
    }

    for (const ef of resolvedChar.extraCommonFields) {
      items.push({
        key: ef.key,
        label: ef.label,
        notation: `{{${resolvedChar.id}.${ef.key}}}`,
        value: ef.value,
        locked: lockedSet.has(ef.key),
      });
    }

    for (const cf of resolvedChar.customFields) {
      items.push({
        key: cf.key,
        label: cf.label,
        notation: `{{${resolvedChar.id}.${cf.key}}}`,
        value: cf.value,
        locked: cf.locked,
      });
    }

    return items;
  }, [resolvedChar, characters]);

  const copyVariableNotation = async (key: string, notation: string) => {
    try {
      await navigator.clipboard.writeText(notation);
      setCopiedVarKey(key);
      setTimeout(() => setCopiedVarKey(null), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-l border-slate-200 ${
        isOverlay
          ? 'w-[min(90vw,21rem)] bg-slate-50 shadow-xl'
          : 'w-76 xl:w-80 bg-slate-50/70'
      }`}
    >
      {/* 3-Tab Header */}
      <div className="flex items-center border-b border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setActiveTab('reference')}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'reference'
              ? isAdult
                ? 'border-rose-700 text-rose-800'
                : 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookMarked className="h-3.5 w-3.5 shrink-0" />
          <span>設定参照</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proofread')}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'proofread'
              ? isAdult
                ? 'border-rose-700 text-rose-800'
                : 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileWarning className="h-3.5 w-3.5 shrink-0" />
          <span>高速校正</span>
          {issues.length > 0 && (
            <span className="font-code text-[10px] font-semibold text-amber-700 tabular-nums">
              ({issues.length})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('guide')}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
            activeTab === 'guide'
              ? isAdult
                ? 'border-rose-700 text-rose-800'
                : 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>使い方</span>
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="右パネルを閉じる"
            aria-label="右パネルを閉じる"
            className="mr-1.5 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-3.5 pb-14">
        {/* TAB 1: Reference */}
        {activeTab === 'reference' && (
          <div className="space-y-4">
            {/* Reference Sub-switcher: キャラクター / 世界観 */}
            <div
              role="tablist"
              aria-label="参照対象を切り替え"
              className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-100/80 p-0.5 text-[11px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={referenceMode === 'character'}
                onClick={() => setReferenceMode('character')}
                className={`flex items-center justify-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                  referenceMode === 'character'
                    ? isAdult
                      ? 'bg-white text-rose-800 shadow-2xs'
                      : 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <User className="h-3 w-3 shrink-0" />
                <span>キャラクター</span>
                <span className="font-code text-[10px] text-slate-400 tabular-nums">
                  {characters.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={referenceMode === 'world'}
                onClick={() => setReferenceMode('world')}
                className={`flex items-center justify-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                  referenceMode === 'world'
                    ? isAdult
                      ? 'bg-white text-rose-800 shadow-2xs'
                      : 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                <span>世界観</span>
                <span className="font-code text-[10px] text-slate-400 tabular-nums">
                  {worldSettings.length}
                </span>
              </button>
            </div>

            {referenceMode === 'world' ? (
              <div className="space-y-3">
                {/* Filter & Search */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedWorldFolderFilter}
                      onChange={(e) => setSelectedWorldFolderFilter(e.target.value)}
                      aria-label="世界観フォルダで絞り込み"
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      <option value="__all__">すべてのフォルダ</option>
                      {worldFolders.map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                      <option value="__root__">ルート（未分類）</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={worldSearchQuery}
                    onChange={(e) => setWorldSearchQuery(e.target.value)}
                    placeholder="名称・概要・本文で絞り込み..."
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-slate-400 focus:outline-none"
                  />

                  {filteredWorldSettings.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-0.5 border-t border-slate-100 pt-1.5">
                      {filteredWorldSettings.map((item) => {
                        const isSelected = activeWorldItem?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedWorldId(item.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors ${
                              isSelected
                                ? isAdult
                                  ? 'bg-rose-100/80 font-semibold text-rose-900'
                                  : 'bg-slate-200/80 font-semibold text-slate-900'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span className="truncate">{item.name || item.id}</span>
                            {item.folder && (
                              <span className="shrink-0 text-[10px] font-normal text-slate-400">
                                {item.folder}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selected World Item Details */}
                {activeWorldItem ? (
                  <>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5 text-xs">
                      <div className="border-b border-slate-100 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">
                            {activeWorldItem.name}
                          </div>
                          {activeWorldItem.folder && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 shrink-0">
                              {activeWorldItem.folder}
                            </span>
                          )}
                        </div>
                        {activeWorldItem.ruby && (
                          <div className="text-[11px] text-slate-400">{activeWorldItem.ruby}</div>
                        )}
                      </div>

                      {visibleWorldImages.length > 0 && (() => {
                        const safeIdx = Math.min(selectedWorldImageIdx, visibleWorldImages.length - 1);
                        const activeImg = visibleWorldImages[safeIdx];
                        if (!activeImg) return null;
                        return (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => setWorldLightboxIndex(safeIdx)}
                              className="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:14px_14px] focus:outline-none focus:ring-2 focus:ring-slate-400"
                              title="クリックして設定画像を拡大表示"
                            >
                              <img
                                src={activeImg.dataUrl}
                                alt={activeImg.label || activeWorldItem.name}
                                className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <Maximize2 className="h-2.5 w-2.5" />
                                拡大
                              </span>
                              {(activeImg.label || activeImg.visibility === 'adult_only') && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-slate-950/75 via-slate-950/35 to-transparent px-2 pb-1 pt-4 text-left">
                                  <span className="truncate text-[10px] font-medium text-white">
                                    {activeImg.label || '設定画像'}
                                  </span>
                                  {activeImg.visibility === 'adult_only' && (
                                    <span className="shrink-0 rounded bg-rose-600/90 px-1 py-0.2 text-[9px] font-semibold text-white">
                                      R18
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>

                            {visibleWorldImages.length > 1 && (
                              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                                {visibleWorldImages.map((img, idx) => {
                                  const isSelected = idx === safeIdx;
                                  return (
                                    <button
                                      key={img.id}
                                      type="button"
                                      onClick={() => setSelectedWorldImageIdx(idx)}
                                      className={`relative h-10 w-10 shrink-0 overflow-hidden rounded border transition ${
                                        isSelected
                                          ? 'border-slate-900 ring-1 ring-slate-900/40'
                                          : 'border-slate-200 opacity-75 hover:opacity-100'
                                      } bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:10px_10px]`}
                                      title={img.label || `設定画像 ${idx + 1}`}
                                    >
                                      <img
                                        src={img.dataUrl}
                                        alt={img.label || `設定画像 ${idx + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Direct quote-insert into scene cursor (案②) */}
                            {(() => {
                              const imgRef = `world:${activeWorldItem.id}:${activeImg.id}`;
                              const caption = activeImg.label
                                ? `${activeWorldItem.name}（${activeImg.label}）`
                                : activeWorldItem.name;
                              const tagText = formatSceneImageTag(imgRef, caption);
                              const isInserted = insertedImgKey === imgRef;
                              const isCopied = copiedVarKey === `img:${imgRef}`;
                              return (
                                <div className="flex items-stretch gap-1">
                                  <button
                                    type="button"
                                    disabled={!scene}
                                    onClick={() =>
                                      handleInsertReferenceImage(imgRef, imgRef, caption)
                                    }
                                    title={
                                      scene
                                        ? 'この画像を本文のカーソル行へ引用挿入（容量増加なし）'
                                        : 'シーン編集中に本文のカーソル行へ引用挿入できます'
                                    }
                                    className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                      isInserted
                                        ? 'border-emerald-300 bg-emerald-600 text-white'
                                        : isAdult
                                          ? 'border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-700 hover:text-white'
                                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white'
                                    }`}
                                  >
                                    {isInserted ? (
                                      <>
                                        <Check className="h-3 w-3 shrink-0" />
                                        <span>カーソル行へ挿入しました</span>
                                      </>
                                    ) : (
                                      <>
                                        <CornerDownLeft className="h-3 w-3 shrink-0" />
                                        <span className="truncate">この画像を本文へ挿入</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => copyVariableNotation(`img:${imgRef}`, tagText)}
                                    title={`${tagText} をコピー`}
                                    className="flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                                  >
                                    {isCopied ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {activeWorldItem.summary && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">概要</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">
                            {activeWorldItem.summary}
                          </p>
                        </div>
                      )}

                      {activeWorldItem.details && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">詳細設定</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {activeWorldItem.details}
                          </p>
                        </div>
                      )}

                      {(activeWorldItem.customFields ?? []).length > 0 && (
                        <dl className="space-y-1.5 border-t border-slate-100 pt-2">
                          {(activeWorldItem.customFields ?? []).map((cf) => {
                            const hasNewline = cf.value.includes('\n');
                            return (
                              <div
                                key={cf.key}
                                className={`rounded bg-slate-50 px-2 py-1 ${
                                  hasNewline
                                    ? 'space-y-0.5'
                                    : 'flex items-center justify-between gap-2'
                                }`}
                              >
                                <dt className="text-slate-500 shrink-0">{cf.label}</dt>
                                <dd
                                  className={`font-medium text-slate-900 ${
                                    hasNewline
                                      ? 'whitespace-pre-wrap break-words leading-snug'
                                      : 'truncate'
                                  }`}
                                >
                                  {cf.value || '—'}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}

                      {(activeWorldItem.relatedCharacterIds ?? []).length > 0 && (
                        <div className="border-t border-slate-100 pt-2">
                          <div className="text-[11px] font-medium text-slate-500">
                            関連キャラクター
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(activeWorldItem.relatedCharacterIds ?? []).map((cid) => {
                              const char = characters.find((c) => c.id === cid);
                              return (
                                <span
                                  key={cid}
                                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700"
                                >
                                  {char?.common.name ?? cid}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {isAdult && activeWorldItem.enableAdultNote && activeWorldItem.adultNote && (
                        <div className="rounded-md border border-rose-200/80 bg-rose-50/50 p-2 space-y-0.5">
                          <div className="text-[11px] font-medium text-rose-800">
                            R18モード補足・裏設定
                          </div>
                          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-rose-950">
                            {activeWorldItem.adultNote}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* World Variables Quick Insert */}
                    {worldVariableItems.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-medium text-slate-600">
                            世界観変数記法（{activeWorldItem.name}）
                          </span>
                          <span>挿入 / コピー</span>
                        </div>
                        <div className="space-y-1.5">
                          {worldVariableItems.map((item) => (
                            <div key={item.key} className="flex items-stretch gap-1">
                              <button
                                type="button"
                                disabled={!scene}
                                onClick={() => onInsertSnippet(item.notation)}
                                title={
                                  scene
                                    ? `${item.notation} を本文に挿入`
                                    : 'シーン編集中にクリックで挿入できます'
                                }
                                className={`min-w-0 flex-1 rounded border px-2.5 py-1.5 text-left transition-colors disabled:opacity-55 ${
                                  isAdult
                                    ? 'border-rose-100 bg-rose-50/40 hover:bg-rose-100/60'
                                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-medium text-slate-600 truncate">
                                    {item.label}
                                  </span>
                                  <span
                                    className={`max-w-[55%] truncate text-[11px] font-semibold ${
                                      isAdult ? 'text-rose-700' : 'text-slate-900'
                                    }`}
                                  >
                                    → {item.value || '（未設定）'}
                                  </span>
                                </div>
                                <div className="mt-0.5 truncate font-code text-[10px] text-slate-500">
                                  {item.notation}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => copyVariableNotation(item.key, item.notation)}
                                title={`${item.notation} をコピー`}
                                className="flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                              >
                                {copiedVarKey === item.key ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                    {worldSettings.length === 0
                      ? '世界観設定がまだ登録されていません'
                      : '条件に一致する世界観設定がありません'}
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <span className="text-[11px] font-medium text-slate-500">
                  {detectedSpeaker ? 'カーソル行の発言者（自動検出）' : 'キャラクター参照'}
                </span>
                <select
                  value={resolvedChar?.id ?? ''}
                  onChange={(e) => setManualCharId(e.target.value)}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.common.name}
                    </option>
                  ))}
                </select>
              </div>

              {resolvedChar ? (
                <div className="mt-2.5 space-y-2 text-xs">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {resolvedChar.name}
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                        {resolvedChar.ruby}
                      </span>
                    </div>
                    {(resolvedChar.gender || resolvedChar.ageDisplay) && (
                      <div className="text-[11px] text-slate-500">
                        {[resolvedChar.gender, resolvedChar.ageDisplay]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>

                  {visibleCharImages.length > 0 && (() => {
                    const safeIdx = Math.min(selectedImageIdx, visibleCharImages.length - 1);
                    const activeImg = visibleCharImages[safeIdx];
                    if (!activeImg) return null;
                    return (
                      <div className="space-y-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(safeIdx)}
                          className="group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:14px_14px] focus:outline-none focus:ring-2 focus:ring-slate-400"
                          title="クリックして設定画像を拡大表示"
                        >
                          <img
                            src={activeImg.dataUrl}
                            alt={activeImg.label || resolvedChar.name}
                            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <Maximize2 className="h-2.5 w-2.5" />
                            拡大
                          </span>
                          {(activeImg.label || activeImg.visibility === 'adult_only') && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-slate-950/75 via-slate-950/35 to-transparent px-2 pb-1 pt-4 text-left">
                              <span className="truncate text-[10px] font-medium text-white">
                                {activeImg.label || '設定画像'}
                              </span>
                              {activeImg.visibility === 'adult_only' && (
                                <span className="shrink-0 rounded bg-rose-600/90 px-1 py-0.2 text-[9px] font-semibold text-white">
                                  R18
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        {visibleCharImages.length > 1 && (
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            {visibleCharImages.map((img, idx) => {
                              const isSelected = idx === safeIdx;
                              return (
                                <button
                                  key={img.id}
                                  type="button"
                                  onClick={() => setSelectedImageIdx(idx)}
                                  className={`relative h-10 w-10 shrink-0 overflow-hidden rounded border transition ${
                                    isSelected
                                      ? 'border-slate-900 ring-1 ring-slate-900/40'
                                      : 'border-slate-200 opacity-75 hover:opacity-100'
                                  } bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:10px_10px]`}
                                  title={img.label || `設定画像 ${idx + 1}`}
                                >
                                  <img
                                    src={img.dataUrl}
                                    alt={img.label || `設定画像 ${idx + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Direct quote-insert into scene cursor (案②) */}
                        {(() => {
                          const imgRef = `char:${resolvedChar.id}:${activeImg.id}`;
                          const caption = activeImg.label
                            ? `${resolvedChar.name}（${activeImg.label}）`
                            : resolvedChar.name;
                          const tagText = formatSceneImageTag(imgRef, caption);
                          const isInserted = insertedImgKey === imgRef;
                          const isCopied = copiedVarKey === `img:${imgRef}`;
                          return (
                            <div className="flex items-stretch gap-1">
                              <button
                                type="button"
                                disabled={!scene}
                                onClick={() =>
                                  handleInsertReferenceImage(imgRef, imgRef, caption)
                                }
                                title={
                                  scene
                                    ? 'この画像を本文のカーソル行へ引用挿入（容量増加なし）'
                                    : 'シーン編集中に本文のカーソル行へ引用挿入できます'
                                }
                                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                  isInserted
                                    ? 'border-emerald-300 bg-emerald-600 text-white'
                                    : isAdult
                                      ? 'border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-700 hover:text-white'
                                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-800 hover:text-white'
                                }`}
                              >
                                {isInserted ? (
                                  <>
                                    <Check className="h-3 w-3 shrink-0" />
                                    <span>カーソル行へ挿入しました</span>
                                  </>
                                ) : (
                                  <>
                                    <CornerDownLeft className="h-3 w-3 shrink-0" />
                                    <span className="truncate">この画像を本文へ挿入</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyVariableNotation(`img:${imgRef}`, tagText)}
                                title={`${tagText} をコピー`}
                                className="flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                              >
                                {isCopied ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  <dl className="space-y-1.5 pt-1 text-xs">
                    {(
                      [
                        ['一人称', resolvedChar.firstPerson, 'firstPerson'],
                        ['二人称', resolvedChar.secondPerson, 'secondPerson'],
                        ['衣装', resolvedChar.costume, 'costume'],
                      ] as const
                    ).map(([label, val, fieldKey]) => {
                      const locked = resolvedChar.lockedFields.includes(fieldKey);
                      const hasNewline = val.includes('\n');
                      return (
                        <div
                          key={fieldKey}
                          className={`rounded bg-slate-50 px-2 py-1 ${
                            hasNewline
                              ? 'space-y-0.5'
                              : 'flex items-center justify-between gap-2'
                          }`}
                        >
                          <dt className="flex items-center gap-1 text-slate-500">
                            <span>{label}</span>
                            {locked && (
                              <span title="一般モード値で固定中">
                                <Lock className="h-3 w-3 text-amber-600" />
                              </span>
                            )}
                          </dt>
                          <dd
                            className={`font-medium text-slate-900 ${
                              hasNewline ? 'whitespace-pre-wrap break-words leading-snug' : 'truncate'
                            }`}
                          >
                            {val || '—'}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  {resolvedChar.relations.length > 0 && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-2">
                      <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                        <span>他キャラへの呼び方・関係性</span>
                        <span className="text-[10px] font-normal text-slate-400">挿入 / コピー</span>
                      </div>
                      <div className="space-y-1.5">
                        {resolvedChar.relations.map((rel) => {
                          const target = characters.find((c) => c.id === rel.targetCharacterId);
                          const targetLabel =
                            target?.common.name ?? `未登録 (${rel.targetCharacterId})`;
                          const callNotation = `{{${resolvedChar.id}.callPartner.${rel.targetCharacterId}}}`;
                          const relNotation = `{{${resolvedChar.id}.relationship.${rel.targetCharacterId}}}`;
                          const callCopyKey = `rel-card-call:${resolvedChar.id}:${rel.targetCharacterId}`;
                          const relCopyKey = `rel-card-rel:${resolvedChar.id}:${rel.targetCharacterId}`;

                          return (
                            <div
                              key={rel.targetCharacterId}
                              className="rounded border border-slate-200/70 bg-slate-50 px-2 py-1.5 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex min-w-0 items-center gap-1 text-slate-500 truncate">
                                  <span className="truncate">→ {targetLabel}</span>
                                  {rel.isAdultOverridden && (
                                    <span className="shrink-0 rounded bg-rose-100 px-1 py-0.2 text-[9px] font-semibold text-rose-700">
                                      R18
                                    </span>
                                  )}
                                </span>
                                <span className="font-medium text-slate-900 truncate">
                                  {rel.callPartner || '—'}
                                </span>
                              </div>
                              {rel.relationship && (
                                <p className="text-[11px] leading-snug text-slate-500">
                                  {rel.relationship}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                <div className="flex flex-1 min-w-0 items-stretch gap-0.5">
                                  <button
                                    type="button"
                                    disabled={!scene}
                                    onClick={() => onInsertSnippet(callNotation)}
                                    title={
                                      scene
                                        ? `${callNotation} を本文へ挿入`
                                        : 'シーン編集中に本文へ挿入できます'
                                    }
                                    className={`inline-flex flex-1 min-w-0 items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-45 ${
                                      isAdult
                                        ? 'border-rose-200 bg-white text-rose-800 hover:bg-rose-50'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <CornerDownLeft className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">呼び方を挿入</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => copyVariableNotation(callCopyKey, callNotation)}
                                    title={`${callNotation} をコピー`}
                                    className="inline-flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                  >
                                    {copiedVarKey === callCopyKey ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>

                                {rel.relationship && (
                                  <div className="flex flex-1 min-w-0 items-stretch gap-0.5">
                                    <button
                                      type="button"
                                      disabled={!scene}
                                      onClick={() => onInsertSnippet(relNotation)}
                                      title={
                                        scene
                                          ? `${relNotation} を本文へ挿入`
                                          : 'シーン編集中に本文へ挿入できます'
                                      }
                                      className={`inline-flex flex-1 min-w-0 items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-45 ${
                                        isAdult
                                          ? 'border-rose-200 bg-white text-rose-800 hover:bg-rose-50'
                                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      <CornerDownLeft className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">関係性を挿入</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => copyVariableNotation(relCopyKey, relNotation)}
                                      title={`${relNotation} をコピー`}
                                      className="inline-flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                    >
                                      {copiedVarKey === relCopyKey ? (
                                        <Check className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <div className="text-[11px] font-medium text-slate-500">口調</div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                      {resolvedChar.speechStyle}
                    </p>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-500">性格</div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                      {resolvedChar.personality}
                    </p>
                  </div>

                  {(resolvedChar.hairstyle ||
                    resolvedChar.facialFeatures ||
                    resolvedChar.height ||
                    resolvedChar.weight ||
                    resolvedChar.bodyType ||
                    resolvedChar.posture ||
                    resolvedChar.hobbies) && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-2">
                      {(resolvedChar.height || resolvedChar.weight || resolvedChar.bodyType) && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">
                            体格（身長 / 体重 / 体型・3サイズ）
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-700 tabular-nums">
                            {[resolvedChar.height, resolvedChar.weight, resolvedChar.bodyType]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      )}
                      {resolvedChar.hairstyle && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">髪型・髪色</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.hairstyle}
                          </p>
                        </div>
                      )}
                      {resolvedChar.facialFeatures && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">顔立ち・瞳</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.facialFeatures}
                          </p>
                        </div>
                      )}
                      {resolvedChar.posture && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">
                            ポーズ / 姿勢・所作
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.posture}
                          </p>
                        </div>
                      )}
                      {resolvedChar.hobbies && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">
                            趣味・趣向
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.hobbies}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {(resolvedChar.skills ||
                    resolvedChar.specialAbilities ||
                    resolvedChar.weaknesses) && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-2">
                      <div className="text-[10px] font-semibold tracking-wide text-slate-400">
                        能力・スキル
                      </div>
                      {resolvedChar.skills && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">特技</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.skills}
                          </p>
                        </div>
                      )}
                      {resolvedChar.specialAbilities && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">特殊能力</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.specialAbilities}
                          </p>
                        </div>
                      )}
                      {resolvedChar.weaknesses && (
                        <div>
                          <div className="text-[11px] font-medium text-slate-500">弱点・苦手</div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                            {resolvedChar.weaknesses}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {resolvedChar.extraCommonFields.length > 0 &&
                    (() => {
                      const hasAnyCategory = resolvedChar.extraCommonFields.some(
                        (ef) => Boolean(ef.category)
                      );
                      if (!hasAnyCategory) {
                        return (
                          <dl className="space-y-1.5 border-t border-slate-100 pt-2 text-xs">
                            {resolvedChar.extraCommonFields.map((ef) => {
                              const hasNewline = ef.value.includes('\n');
                              return (
                                <div
                                  key={ef.key}
                                  className={`rounded bg-slate-50 px-2 py-1 ${
                                    hasNewline
                                      ? 'space-y-0.5'
                                      : 'flex items-center justify-between gap-2'
                                  }`}
                                >
                                  <dt className="text-slate-500 truncate">{ef.label}</dt>
                                  <dd
                                    className={`font-medium text-slate-900 ${
                                      hasNewline
                                        ? 'whitespace-pre-wrap break-words leading-snug'
                                        : 'truncate'
                                    }`}
                                  >
                                    {ef.value || '—'}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        );
                      }

                      const grouped = new Map<
                        string,
                        typeof resolvedChar.extraCommonFields
                      >();
                      for (const ef of resolvedChar.extraCommonFields) {
                        const cat = ef.category?.trim() || '追加した共通項目';
                        const list = grouped.get(cat) ?? [];
                        list.push(ef);
                        grouped.set(cat, list);
                      }

                      const orderedCategories: string[] = [];
                      for (const std of STANDARD_CHARACTER_CATEGORIES) {
                        if (grouped.has(std)) orderedCategories.push(std);
                      }
                      for (const cat of grouped.keys()) {
                        if (
                          cat !== '追加した共通項目' &&
                          !orderedCategories.includes(cat)
                        ) {
                          orderedCategories.push(cat);
                        }
                      }
                      if (grouped.has('追加した共通項目')) {
                        orderedCategories.push('追加した共通項目');
                      }

                      return (
                        <div className="space-y-2.5 border-t border-slate-100 pt-2">
                          {orderedCategories.map((cat) => {
                            const list = grouped.get(cat) ?? [];
                            return (
                              <div key={cat} className="space-y-1">
                                <div className="text-[10px] font-semibold tracking-wide text-slate-400">
                                  {cat}
                                </div>
                                <dl className="space-y-1.5 text-xs">
                                  {list.map((ef) => {
                                    const hasNewline = ef.value.includes('\n');
                                    return (
                                      <div
                                        key={ef.key}
                                        className={`rounded bg-slate-50 px-2 py-1 ${
                                          hasNewline
                                            ? 'space-y-0.5'
                                            : 'flex items-center justify-between gap-2'
                                        }`}
                                      >
                                        <dt className="text-slate-500 truncate">{ef.label}</dt>
                                        <dd
                                          className={`font-medium text-slate-900 ${
                                            hasNewline
                                              ? 'whitespace-pre-wrap break-words leading-snug'
                                              : 'truncate'
                                          }`}
                                        >
                                          {ef.value || '—'}
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                  {resolvedChar.customFields.length > 0 && (
                    <dl className="space-y-1.5 border-t border-slate-100 pt-2 text-xs">
                      {resolvedChar.customFields.map((cf) => {
                        const hasNewline = cf.value.includes('\n');
                        return (
                          <div
                            key={cf.key}
                            className={`rounded bg-slate-50 px-2 py-1 ${
                              hasNewline
                                ? 'space-y-0.5'
                                : 'flex items-center justify-between gap-2'
                            }`}
                          >
                            <dt className="flex items-center gap-1 text-slate-500 truncate">
                              <span className="truncate">{cf.label}</span>
                              {cf.locked && (
                                <span title="一般モード値で固定中">
                                  <Lock className="h-3 w-3 text-amber-600" />
                                </span>
                              )}
                            </dt>
                            <dd
                              className={`font-medium text-slate-900 ${
                                hasNewline
                                  ? 'whitespace-pre-wrap break-words leading-snug'
                                  : 'truncate'
                              }`}
                            >
                              {cf.value || '—'}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">
                  キャラクターが登録されていません
                </p>
              )}
            </div>

            {/* Mode-specific Quick Snippets & Character Variables */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  {isAdult ? 'R18 クイック定型文・構成枠' : '一般用 クイック定型文'}
                </span>
                <span className="text-[10px] text-slate-400">クリックで挿入</span>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-slate-400">
                  定型文・分岐ブロック
                </div>
                {quickTemplates.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!scene}
                    onClick={() => onInsertSnippet(item.snippet, item.caretBefore)}
                    className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-40 ${
                      isAdult
                        ? 'border-rose-100 bg-rose-50/50 text-rose-900 hover:bg-rose-100/70'
                        : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate font-code text-[11px]">{item.label}</span>
                  </button>
                ))}
              </div>

              {resolvedChar && characterVariableItems.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-medium">
                      キャラ変数記法（{resolvedChar.name}）
                    </span>
                    <span>挿入 / コピー</span>
                  </div>

                  <div className="space-y-1.5">
                    {characterVariableItems.map((item) => (
                      <div key={item.key} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          disabled={!scene}
                          onClick={() => onInsertSnippet(item.notation)}
                          title={
                            scene
                              ? `${item.notation} を本文に挿入`
                              : 'シーン編集中にクリックで挿入できます'
                          }
                          className={`min-w-0 flex-1 rounded border px-2.5 py-1.5 text-left transition-colors disabled:opacity-55 ${
                            isAdult
                              ? 'border-rose-100 bg-rose-50/40 hover:bg-rose-100/60'
                              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 truncate">
                              <span className="truncate">{item.label}</span>
                              {item.locked && (
                                <Lock className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                              )}
                            </span>
                            <span
                              className={`max-w-[52%] truncate text-[11px] font-semibold ${
                                isAdult ? 'text-rose-700' : 'text-slate-900'
                              }`}
                            >
                              → {item.value || '（未設定）'}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate font-code text-[10px] text-slate-500">
                            {item.notation}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => copyVariableNotation(item.key, item.notation)}
                          title={`${item.notation} をコピー`}
                          className="flex shrink-0 items-center justify-center rounded border border-slate-200 bg-white px-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                        >
                          {copiedVarKey === item.key ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: Fast Proofread (Zero-AI) */}
        {activeTab === 'proofread' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>ルールベース即時校正（AI不使用）</span>
              <span className="font-code tabular-nums text-slate-500">
                {issues.length} 件
              </span>
            </div>

            {!scene ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
                シーンを選択するとリアルタイム校正を実行します。
              </div>
            ) : issues.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="mt-1.5 text-xs font-semibold text-emerald-900">
                  検出された問題はありません
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  {scene.format === 'manga'
                    ? '一人称・括弧の整合性と、コマ数・セリフ文字数のバランスが取れています。'
                    : '一人称の一貫性とカギ括弧「」の整合性が取れています。'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => onJumpToLine(issue.line)}
                    className="w-full rounded-lg border border-amber-200 bg-white p-2.5 text-left hover:bg-amber-50/50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1 font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span>
                          {issue.category === 'firstPerson'
                            ? '一人称の不整合'
                            : issue.category === 'brackets'
                              ? '括弧の閉じ忘れ'
                              : issue.category === 'manga'
                                ? 'コマ・字数バランス'
                                : '記法エラー'}
                        </span>
                      </span>
                      <span className="font-code text-slate-500 tabular-nums">
                        L{issue.line}:{issue.column}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-800">
                      {issue.message}
                    </p>
                    {issue.snippet && (
                      <p className="mt-1 truncate rounded bg-slate-50 px-1.5 py-0.5 font-code text-[11px] text-slate-500">
                        {issue.snippet}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: App Usage Guide */}
        {activeTab === 'guide' && (
          <UsageGuideTab activeMode={activeMode} selectedItemType={selectedItemType} />
        )}
      </div>

      <ImageLightboxModal
        images={visibleCharImages}
        activeIndex={lightboxIndex}
        onChangeIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        altFallback={resolvedChar ? `${resolvedChar.name}の設定画像` : 'キャラクター設定画像'}
      />

      <ImageLightboxModal
        images={visibleWorldImages}
        activeIndex={worldLightboxIndex}
        onChangeIndex={setWorldLightboxIndex}
        onClose={() => setWorldLightboxIndex(null)}
        altFallback={activeWorldItem ? `${activeWorldItem.name}の設定画像` : '世界観設定画像'}
      />
    </aside>
  );
};
