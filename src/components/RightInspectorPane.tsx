import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  Check,
  CheckCircle2,
  Copy,
  FileWarning,
  HelpCircle,
  Lock,
  X,
} from 'lucide-react';
import {
  STANDARD_CHARACTER_CATEGORIES,
  type ActiveMode,
  type CharacterData,
  type ProofreadIssue,
  type SceneData,
  type SelectedItem,
} from '../types/scenario';
import {
  detectSpeakerOnLine,
  proofreadScene,
  resolveCharacterProfile,
} from '../utils/scenarioEngine';
import { UsageGuideTab } from './UsageGuideTab';

type InspectorTab = 'reference' | 'proofread' | 'guide';

interface RightInspectorPaneProps {
  activeMode: ActiveMode;
  selectedItemType: SelectedItem['type'];
  scene: SceneData | null;
  characters: CharacterData[];
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
  cursorIndex,
  onJumpToLine,
  onInsertSnippet,
  isOverlay = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('reference');
  const [manualCharId, setManualCharId] = useState<string>('');
  const [copiedVarKey, setCopiedVarKey] = useState<string | null>(null);

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

  // Real-time zero-AI proofreading
  const issues: ProofreadIssue[] = useMemo(() => {
    if (!scene) return [];
    return proofreadScene(scene.body, characters, activeMode);
  }, [scene, characters, activeMode]);

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
        key: 'callPartner',
        label: '相手の呼び方',
        notation: `{{${resolvedChar.id}.callPartner}}`,
        value: resolvedChar.callPartner,
        locked: lockedSet.has('callPartner'),
      },
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
      { key: 'relationship', label: '関係性' },
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
                    <div className="text-[11px] text-slate-500">
                      {resolvedChar.ageDisplay} · {resolvedChar.relationship}
                    </div>
                  </div>

                  <dl className="space-y-1.5 pt-1 text-xs">
                    {(
                      [
                        ['一人称', resolvedChar.firstPerson, 'firstPerson'],
                        ['相手の呼び方', resolvedChar.callPartner, 'callPartner'],
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
                      <div className="text-[11px] font-medium text-slate-500">
                        他キャラへの呼び方・関係性
                      </div>
                      <div className="space-y-1.5">
                        {resolvedChar.relations.map((rel) => {
                          const target = characters.find((c) => c.id === rel.targetCharacterId);
                          const targetLabel =
                            target?.common.name ?? `未登録 (${rel.targetCharacterId})`;
                          return (
                            <div
                              key={rel.targetCharacterId}
                              className="rounded bg-slate-50 px-2 py-1.5 space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-500 truncate">→ {targetLabel}</span>
                                <span className="font-medium text-slate-900 truncate">
                                  {rel.callPartner || '—'}
                                </span>
                              </div>
                              {rel.relationship && (
                                <p className="text-[11px] leading-snug text-slate-500">
                                  {rel.relationship}
                                </p>
                              )}
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
                  一人称の一貫性とカギ括弧「」の整合性が取れています。
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
    </aside>
  );
};
