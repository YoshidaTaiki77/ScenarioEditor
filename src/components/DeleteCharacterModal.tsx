import React, { useEffect } from 'react';
import {
  AlertTriangle,
  BookOpen,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type { ActiveMode } from '../types/scenario';
import type { CharacterDeleteImpact } from '../utils/characterDeletion';

interface DeleteCharacterModalProps {
  impact: CharacterDeleteImpact | null;
  activeMode: ActiveMode;
  onCancel: () => void;
  onConfirm: (characterId: string) => void;
}

export const DeleteCharacterModal: React.FC<DeleteCharacterModalProps> = ({
  impact,
  activeMode,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!impact) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [impact, onCancel]);

  if (!impact) return null;

  const { character } = impact;
  const visibleThumb =
    (character.images ?? []).find((img) =>
      activeMode === 'adult'
        ? img.visibility === 'common' || img.visibility === 'adult_only'
        : img.visibility === 'common' || img.visibility === 'general_alt'
    ) ??
    (activeMode === 'adult' ? (character.images ?? [])[0] : undefined);

  const filePathLabel = `characters/${impact.folder ? `${impact.folder}/` : ''}${impact.filename}`;

  const structuredItems = [
    {
      label: 'シーンの登場キャラ',
      count: impact.sceneCastCount,
      icon: FileText,
    },
    {
      label: 'プロット（登場・視点）',
      count: impact.plotCardCount,
      icon: LayoutGrid,
    },
    {
      label: '世界観の関連キャラ',
      count: impact.worldRefCount,
      icon: BookOpen,
    },
    {
      label: '他キャラの関係性',
      count: impact.otherRelationCount,
      icon: Users,
    },
  ];

  const maxPreviewScenes = 4;
  const previewScenes = impact.bodyTagScenes.slice(0, maxPreviewScenes);
  const extraSceneCount = impact.bodyTagScenes.length - previewScenes.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-character-modal-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <h2
              id="delete-character-modal-title"
              className="text-sm font-semibold text-slate-900"
            >
              キャラクターを削除
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Target character summary card */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {visibleThumb ? (
              <img
                src={visibleThumb.dataUrl}
                alt={character.common.name}
                className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover bg-white"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
                <User className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {character.common.name || character.id}
                </span>
                {character.common.ruby && (
                  <span className="truncate text-[11px] text-slate-500">
                    （{character.common.ruby}）
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-code text-[11px] text-slate-500">
                {filePathLabel}
              </p>
              {impact.imageCount > 0 && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-700">
                  <ImageIcon className="h-3 w-3 shrink-0" />
                  <span>登録画像 {impact.imageCount}枚 も同時に削除されます</span>
                </p>
              )}
            </div>
          </div>

          {/* Structured Reference Summary */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700">
              プロジェクト内での使用状況
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {structuredItems.map((item) => {
                const Icon = item.icon;
                const active = item.count > 0;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-xs ${
                      active
                        ? 'border-slate-300 bg-slate-50 text-slate-900'
                        : 'border-slate-200/80 bg-white text-slate-400'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-[11px]">{item.label}</span>
                    </span>
                    <span
                      className={`ml-2 shrink-0 font-code text-xs tabular-nums ${
                        active ? 'font-semibold text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {item.count}件
                    </span>
                  </div>
                );
              })}
            </div>

            {impact.totalStructuredRefs > 0 ? (
              <p className="text-[11px] leading-relaxed text-slate-600">
                上記の関連設定（計 {impact.totalStructuredRefs}件）は、削除と同時に自動で整理されます。
              </p>
            ) : (
              impact.totalBodyTagRefs === 0 && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  他のシーン・プロット・世界観・キャラクターからの参照はありません。
                </p>
              )
            )}
          </div>

          {/* Scene Body Tag Warning */}
          {impact.totalBodyTagRefs > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-amber-900">
                    シーン本文内にタグ記述が残っています
                  </p>
                  <p className="text-[11px] text-amber-900/90">
                    {impact.bodyVariableTagCount > 0 && (
                      <span>変数タグ {impact.bodyVariableTagCount}件</span>
                    )}
                    {impact.bodyVariableTagCount > 0 && impact.bodyImageQuoteCount > 0 && (
                      <span> ／ </span>
                    )}
                    {impact.bodyImageQuoteCount > 0 && (
                      <span>引用画像タグ {impact.bodyImageQuoteCount}件</span>
                    )}
                  </p>
                  {previewScenes.length > 0 && (
                    <p className="text-[11px] text-amber-800/90">
                      該当シーン：
                      {previewScenes.map((s) => `「${s.title}」`).join('、')}
                      {extraSceneCount > 0 ? ` ほか${extraSceneCount}件` : ''}
                    </p>
                  )}
                  <p className="pt-0.5 text-[11px] leading-relaxed text-amber-900/80">
                    文章が崩れないよう本文は自動で書き換えません。削除後はリアルタイムプレビューの警告表示や高速校正で確認・修正できます。
                  </p>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            削除直後であれば、画面下部の通知から「元に戻す」で関連設定ごと復元できます。
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm(character.id)}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>削除する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
