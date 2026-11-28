import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, FilePlus2, FileUp, Folder, GitBranch, Layers, User, X } from 'lucide-react';
import type { ActiveMode, CharacterData, PlotScope } from '../types/scenario';
import { sanitizeSceneFolderName } from '../utils/storage';

export type InitialPlotTemplate = 'single' | 'kishotenketsu';
export type PlotSceneFolderMode = 'none' | 'existing' | 'create_matching';

export interface CreatePlotPayload {
  scope: PlotScope;
  title: string;
  template: InitialPlotTemplate;
  targetCharacterId?: string;
  sceneFolderMode: PlotSceneFolderMode;
  linkedSceneFolder?: string;
}

interface NewPlotModalProps {
  isOpen: boolean;
  activeMode: ActiveMode;
  existingPlotCount: number;
  chapterCount: number;
  characters: CharacterData[];
  sceneFolders: string[];
  onClose: () => void;
  onCreate: (payload: CreatePlotPayload) => void;
  onImportPlotFiles?: (files: FileList | File[]) => void;
}

const SCOPE_OPTIONS: Array<{
  value: PlotScope;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'chapter', label: '章ごと', desc: '本編の章構成', icon: BookOpen },
  { value: 'route', label: 'ルート別', desc: '分岐・個別ルート', icon: GitBranch },
  { value: 'character', label: 'キャラ別', desc: '人物視点・個別軸', icon: User },
  { value: 'subplot', label: '自由単位', desc: '伏線・イベント等', icon: Layers },
];

export const NewPlotModal: React.FC<NewPlotModalProps> = ({
  isOpen,
  activeMode,
  existingPlotCount,
  chapterCount,
  characters,
  sceneFolders,
  onClose,
  onCreate,
  onImportPlotFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdult = activeMode === 'adult';
  const [scope, setScope] = useState<PlotScope>('chapter');
  const [targetCharId, setTargetCharId] = useState<string>(characters[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [template, setTemplate] = useState<InitialPlotTemplate>('single');
  const [sceneFolderMode, setSceneFolderMode] = useState<PlotSceneFolderMode>('none');
  const [selectedExistingFolder, setSelectedExistingFolder] = useState<string>(
    sceneFolders[0] ?? ''
  );
  const [error, setError] = useState<string | null>(null);

  const buildDefaultTitle = (nextScope: PlotScope, charId: string): string => {
    if (nextScope === 'chapter') {
      return `第${chapterCount + 1}章：新規プロット`;
    }
    if (nextScope === 'route') {
      return `新規ルート分岐プロット ${existingPlotCount + 1}`;
    }
    if (nextScope === 'character') {
      const ch = characters.find((c) => c.id === charId);
      return ch ? `${ch.common.name} 個別プロット` : `キャラ別プロット ${existingPlotCount + 1}`;
    }
    return `新規サブプロット ${existingPlotCount + 1}`;
  };

  useEffect(() => {
    if (!isOpen) return;
    const defaultChar = characters[0]?.id ?? '';
    setScope('chapter');
    setTargetCharId(defaultChar);
    setTitle(buildDefaultTitle('chapter', defaultChar));
    setTitleEdited(false);
    setTemplate('single');
    setSceneFolderMode('none');
    setSelectedExistingFolder(sceneFolders[0] ?? '');
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const matchingFolderCandidate = sanitizeSceneFolderName(title);
  const existingMatchingFolder = matchingFolderCandidate
    ? sceneFolders.find((f) => f.toLowerCase() === matchingFolderCandidate.toLowerCase())
    : undefined;

  const handleSelectScope = (nextScope: PlotScope) => {
    setScope(nextScope);
    if (!titleEdited) {
      setTitle(buildDefaultTitle(nextScope, targetCharId));
    }
  };

  const handleSelectCharacter = (nextCharId: string) => {
    setTargetCharId(nextCharId);
    if (!titleEdited && scope === 'character') {
      setTitle(buildDefaultTitle('character', nextCharId));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('プロット名を入力してください。');
      return;
    }

    let linkedSceneFolder: string | undefined;
    if (sceneFolderMode === 'existing') {
      linkedSceneFolder = selectedExistingFolder || undefined;
    } else if (sceneFolderMode === 'create_matching') {
      linkedSceneFolder = existingMatchingFolder ?? (matchingFolderCandidate || undefined);
    }

    onCreate({
      scope,
      title: trimmed,
      template,
      targetCharacterId: scope === 'character' && targetCharId ? targetCharId : undefined,
      sceneFolderMode,
      linkedSceneFolder,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-plot-modal-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FilePlus2 className={`h-4 w-4 ${isAdult ? 'text-rose-700' : 'text-slate-700'}`} />
            <h2 id="new-plot-modal-title" className="text-sm font-semibold text-slate-900">
              新規プロットを作成
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Plot Unit / Scope */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700">
              プロットの単位・種別
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SCOPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectScope(opt.value)}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                      active
                        ? isAdult
                          ? 'border-rose-600 bg-rose-50/70 text-rose-900'
                          : 'border-slate-800 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 mb-1 ${
                        active
                          ? isAdult
                            ? 'text-rose-700'
                            : 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Target Character when scope === 'character' */}
          {scope === 'character' && characters.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                対象キャラクター（初期カードの視点・登場キャラに設定）
              </span>
              <select
                value={targetCharId}
                onChange={(e) => handleSelectCharacter(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-slate-400 focus:outline-none"
              >
                {characters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.common.name} ({ch.shortName})
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Plot Title */}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">プロットタイトル</span>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
              placeholder="例: 第二章：夏合宿 / 栞ルート / 伏線整理"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            />
            {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
          </label>

          {/* Linked Scene Folder (Optional) */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">
                連携シーンフォルダ（任意）
              </span>
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-white">
                <input
                  type="radio"
                  name="plot-scene-folder-mode"
                  checked={sceneFolderMode === 'none'}
                  onChange={() => setSceneFolderMode('none')}
                />
                <span className="text-slate-700">連携しない（後からいつでも設定可能）</span>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 ${
                  sceneFolders.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="plot-scene-folder-mode"
                  disabled={sceneFolders.length === 0}
                  checked={sceneFolderMode === 'existing'}
                  onChange={() => {
                    setSceneFolderMode('existing');
                    if (!selectedExistingFolder && sceneFolders[0]) {
                      setSelectedExistingFolder(sceneFolders[0]);
                    }
                  }}
                />
                <span className="text-slate-700 shrink-0">既存フォルダと連携</span>
                {sceneFolders.length > 0 ? (
                  <select
                    value={selectedExistingFolder}
                    disabled={sceneFolderMode !== 'existing'}
                    onChange={(e) => {
                      setSceneFolderMode('existing');
                      setSelectedExistingFolder(e.target.value);
                    }}
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 disabled:bg-slate-100 focus:outline-none"
                  >
                    {sceneFolders.map((f) => (
                      <option key={f} value={f}>
                        scenes/{f}/
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-slate-400">（作成済みフォルダなし）</span>
                )}
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-white">
                <input
                  type="radio"
                  name="plot-scene-folder-mode"
                  checked={sceneFolderMode === 'create_matching'}
                  onChange={() => setSceneFolderMode('create_matching')}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-slate-700">プロットと同名のシーンフォルダを同時作成して連携</div>
                  <div className="mt-0.5 font-code text-[10px] text-slate-500 truncate">
                    {matchingFolderCandidate
                      ? existingMatchingFolder
                        ? `※ 既存の scenes/${existingMatchingFolder}/ と連携します`
                        : `作成先: scenes/${matchingFolderCandidate}/`
                      : 'タイトルを入力するとフォルダ名が決定されます'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Initial Card Structure */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700">初期カード構成</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTemplate('single')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  template === 'single'
                    ? isAdult
                      ? 'border-rose-600 bg-rose-50/70'
                      : 'border-slate-800 bg-slate-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">白紙カード 1枚</span>
                  <span className="font-code text-[10px] text-slate-500">1 card</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  最小構成で開始し、必要な枚数だけ自由に追加します。
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTemplate('kishotenketsu')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  template === 'kishotenketsu'
                    ? isAdult
                      ? 'border-rose-600 bg-rose-50/70'
                      : 'border-slate-800 bg-slate-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    起承転結 4枚テンプレート
                  </span>
                  <span className="font-code text-[10px] text-slate-500">4 cards</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  「起・承・転・結」の4枚の枠と狙いガイドを自動配置します。
                </p>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {onImportPlotFiles ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      onImportPlotFiles(Array.from(e.target.files));
                      onClose();
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition-colors"
                >
                  <FileUp className="h-3.5 w-3.5 text-slate-500" />
                  <span>既存ファイル(.json)から読み込む</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className={`rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors ${
                  isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                プロットを作成
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
