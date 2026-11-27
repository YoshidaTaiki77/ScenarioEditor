import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  FilePlus2,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Layers,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import type { ActiveMode } from '../types/scenario';
import type { ProjectTemplateType } from '../data/initialProject';
import { sanitizeProjectFolderName } from '../utils/storageManager';

export type EmptyFolderChoice = 'export-current' | 'new-blank';

export interface ProjectCreationSpec {
  title: string;
  template: ProjectTemplateType;
  activeMode: ActiveMode;
}

const TEMPLATE_OPTIONS: Array<{
  value: ProjectTemplateType;
  label: string;
  description: string;
}> = [
  {
    value: 'minimal',
    label: '最小構成（白紙）',
    description: 'キャラ0名・プロット1カード・空白シーン1本から自由に構築',
  },
  {
    value: 'kishotenketsu',
    label: '起承転結 4シーン構成',
    description: '起承転結の4カードプロットと対応する空白シーン4本を用意',
  },
  {
    value: 'sample',
    label: 'サンプルベース',
    description: '蓮・栞の設定例や分岐サンプルを残した状態で開始',
  },
];

interface TemplateAndModeSelectorProps {
  template: ProjectTemplateType;
  onChangeTemplate: (t: ProjectTemplateType) => void;
  initialMode: ActiveMode;
  onChangeInitialMode: (m: ActiveMode) => void;
  accentAdult: boolean;
}

const TemplateAndModeSelector: React.FC<TemplateAndModeSelectorProps> = ({
  template,
  onChangeTemplate,
  initialMode,
  onChangeInitialMode,
  accentAdult,
}) => {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
          <Layers className="h-3.5 w-3.5 text-slate-500" />
          <span>初期構成テンプレート</span>
        </span>
        <div className="space-y-1.5">
          {TEMPLATE_OPTIONS.map((opt) => {
            const active = template === opt.value;
            return (
              <label
                key={opt.value}
                onClick={(e) => e.stopPropagation()}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
                  active
                    ? accentAdult
                      ? 'border-rose-400 bg-rose-50/70'
                      : 'border-slate-800 bg-slate-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50/60'
                }`}
              >
                <input
                  type="radio"
                  name="project-template"
                  checked={active}
                  onChange={() => onChangeTemplate(opt.value)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-900">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    {opt.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-slate-700 block">
          初期執筆モード
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInitialMode('general');
            }}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              initialMode === 'general'
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            一般用 (Normal)
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeInitialMode('adult');
            }}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              initialMode === 'adult'
                ? 'border-rose-700 bg-rose-700 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-700'
            }`}
          >
            R18 (Adult)
          </button>
        </div>
      </div>
    </div>
  );
};

interface NewProjectModalProps {
  isOpen: boolean;
  activeMode: ActiveMode;
  onClose: () => void;
  onCreateInFolder: (
    spec: ProjectCreationSpec & { folderName: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onSwitchToBrowserFallback: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  activeMode,
  onClose,
  onCreateInFolder,
  onSwitchToBrowserFallback,
}) => {
  const [title, setTitle] = useState('新規プロジェクト');
  const [folderName, setFolderName] = useState('新規プロジェクト');
  const [folderEditedManually, setFolderEditedManually] = useState(false);
  const [template, setTemplate] = useState<ProjectTemplateType>('minimal');
  const [initialMode, setInitialMode] = useState<ActiveMode>('general');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdult = activeMode === 'adult';

  useEffect(() => {
    if (isOpen) {
      setTitle('新規プロジェクト');
      setFolderName('新規プロジェクト');
      setFolderEditedManually(false);
      setTemplate('minimal');
      setInitialMode('general');
      setSubmitting(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setErrorMsg(null);
    if (!folderEditedManually) {
      setFolderName(sanitizeProjectFolderName(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMsg('プロジェクト名を入力してください。');
      return;
    }

    const cleanFolder = sanitizeProjectFolderName(folderName);
    if (!cleanFolder) {
      setErrorMsg('作成する連携フォルダ名を有効な文字で入力してください。');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const result = await onCreateInFolder({
        title: cleanTitle,
        folderName: cleanFolder,
        template,
        activeMode: initialMode,
      });
      if (!result.ok && result.error) {
        setErrorMsg(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                新規プロジェクトを作成
              </h2>
              <p className="text-[11px] text-slate-500">
                選択した保存先フォルダ内に専用フォルダを作成して同期を開始します（Chrome 推奨）
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">プロジェクト名</span>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="例: 真夜中の図書室"
              autoFocus
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                作成する連携フォルダ名
              </span>
              <span className="text-[10px] text-slate-400">
                選択した保存先直下に自動作成されます
              </span>
            </div>
            <input
              type="text"
              value={folderName}
              onChange={(e) => {
                setFolderEditedManually(true);
                setFolderName(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="例: mayonaka_project"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-code text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </label>

          <TemplateAndModeSelector
            template={template}
            onChangeTemplate={setTemplate}
            initialMode={initialMode}
            onChangeInitialMode={setInitialMode}
            accentAdult={isAdult}
          />

          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              <div className="pl-6">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToBrowserFallback();
                  }}
                  className="text-[11px] font-medium text-rose-900 underline hover:no-underline"
                >
                  フォルダ連携を使わずブラウザ内初期化（予備）を使う →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            次にプロジェクトを作成する親フォルダを選択します
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>保存先フォルダを選んで作成</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

interface EmptyFolderModalProps {
  isOpen: boolean;
  folderName: string;
  currentProjectTitle: string;
  activeMode: ActiveMode;
  onClose: () => void;
  onConfirm: (choice: EmptyFolderChoice, spec: ProjectCreationSpec) => void;
}

export const EmptyFolderModal: React.FC<EmptyFolderModalProps> = ({
  isOpen,
  folderName,
  currentProjectTitle,
  activeMode,
  onClose,
  onConfirm,
}) => {
  const [choice, setChoice] = useState<EmptyFolderChoice>('export-current');
  const [newTitle, setNewTitle] = useState('');
  const [template, setTemplate] = useState<ProjectTemplateType>('minimal');
  const [initialMode, setInitialMode] = useState<ActiveMode>('general');
  const [submitting, setSubmitting] = useState(false);

  const isAdult = activeMode === 'adult';

  useEffect(() => {
    if (isOpen) {
      setChoice('export-current');
      setNewTitle(folderName || '新規プロジェクト');
      setTemplate('minimal');
      setInitialMode('general');
      setSubmitting(false);
    }
  }, [isOpen, folderName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    onConfirm(choice, {
      title: newTitle.trim() || folderName || '新規プロジェクト',
      template,
      activeMode: initialMode,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              フォルダの初期化方法を選択
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              「<span className="font-code font-medium text-slate-700">{folderName}</span>」には既存の project.json が見つかりませんでした
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
              choice === 'export-current'
                ? isAdult
                  ? 'border-rose-400 bg-rose-50/60'
                  : 'border-slate-800 bg-slate-50'
                : 'border-slate-200 bg-white hover:bg-slate-50/70'
            }`}
          >
            <input
              type="radio"
              name="empty-folder-choice"
              checked={choice === 'export-current'}
              onChange={() => setChoice('export-current')}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <FolderOutput className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span>現在の作業内容をこのフォルダへ書き出して続ける</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                現在開いている「{currentProjectTitle}」のキャラクター・プロット・シーンを保存し、このままフォルダ同期を開始します。
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
              choice === 'new-blank'
                ? isAdult
                  ? 'border-rose-400 bg-rose-50/60'
                  : 'border-slate-800 bg-slate-50'
                : 'border-slate-200 bg-white hover:bg-slate-50/70'
            }`}
          >
            <input
              type="radio"
              name="empty-folder-choice"
              checked={choice === 'new-blank'}
              onChange={() => setChoice('new-blank')}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span>新しいプロジェクトとして開始する</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                初期構成テンプレートを選び、このフォルダで新しい作品の執筆を開始します。
              </p>

              {choice === 'new-blank' && (
                <div className="mt-3 space-y-3 border-t border-slate-200/80 pt-3" onClick={(e) => e.stopPropagation()}>
                  <label className="block space-y-1">
                    <span className="block text-[11px] font-medium text-slate-700">
                      新規プロジェクト名
                    </span>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="例: 新作シナリオ"
                      autoFocus
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-500 focus:outline-none"
                    />
                  </label>

                  <TemplateAndModeSelector
                    template={template}
                    onChangeTemplate={setTemplate}
                    initialMode={initialMode}
                    onChangeInitialMode={setInitialMode}
                    accentAdult={isAdult}
                  />
                </div>
              )}
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
              isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {choice === 'export-current' ? '書き出して同期開始' : 'この構成で開始'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface ResetBrowserProjectModalProps {
  isOpen: boolean;
  currentProjectTitle: string;
  isFilesystemConnected: boolean;
  activeMode: ActiveMode;
  onClose: () => void;
  onConfirm: (spec: ProjectCreationSpec) => void;
}

export const ResetBrowserProjectModal: React.FC<ResetBrowserProjectModalProps> = ({
  isOpen,
  currentProjectTitle,
  isFilesystemConnected,
  activeMode,
  onClose,
  onConfirm,
}) => {
  const [newTitle, setNewTitle] = useState('新規プロジェクト');
  const [template, setTemplate] = useState<ProjectTemplateType>('minimal');
  const [initialMode, setInitialMode] = useState<ActiveMode>('general');
  const [submitting, setSubmitting] = useState(false);

  const isAdult = activeMode === 'adult';

  useEffect(() => {
    if (isOpen) {
      setNewTitle('新規プロジェクト');
      setTemplate('minimal');
      setInitialMode('general');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    onConfirm({
      title: newTitle.trim() || '新規プロジェクト',
      template,
      activeMode: initialMode,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-slate-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                ブラウザ内データを初期化して新規作成（予備）
              </h2>
              <p className="text-[11px] text-slate-500">
                フォルダ連携に非対応のブラウザ向けの予備機能です（Google Chrome のフォルダ作成を推奨）
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-xs leading-relaxed text-slate-600">
            現在のブラウザ内作業データ（「{currentProjectTitle}」）を初期化し、ローカルフォルダ連携を使わずに新しいプロジェクトを開始します。
          </p>
          {isFilesystemConnected && (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              現在接続中のフォルダとの同期は解除されます（PC上のフォルダ内に保存済みのファイルは削除されません）。
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">新規プロジェクト名</span>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: 新しいシナリオ"
              autoFocus
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </label>

          <TemplateAndModeSelector
            template={template}
            onChangeTemplate={setTemplate}
            initialMode={initialMode}
            onChangeInitialMode={setInitialMode}
            accentAdult={isAdult}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
              isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>初期化して新規作成</span>
          </button>
        </div>
      </form>
    </div>
  );
};
