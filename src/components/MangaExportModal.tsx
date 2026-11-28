import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, FileText, X } from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  MangaExportOptions,
  ProjectData,
  SceneData,
  WorldSettingData,
} from '../types/scenario';
import {
  DEFAULT_MANGA_EXPORT_OPTIONS,
  exportCspTypesettingText,
  exportMangaScriptDocument,
} from '../utils/mangaEngine';
import { isSceneVisibleInMode } from '../utils/scenarioEngine';
import { triggerDownload } from '../utils/storageManager';

interface MangaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectData;
  scenes: SceneData[];
  activeScene?: SceneData;
  characters: CharacterData[];
  worldSettings: WorldSettingData[];
  activeMode: ActiveMode;
  initialTab?: 'csp' | 'script';
  initialScope?: 'current' | 'all';
}

export const MangaExportModal: React.FC<MangaExportModalProps> = ({
  isOpen,
  onClose,
  project,
  scenes,
  activeScene,
  characters,
  worldSettings,
  activeMode,
  initialTab = 'csp',
  initialScope = 'current',
}) => {
  const [tab, setTab] = useState<'csp' | 'script'>(initialTab);
  const [scope, setScope] = useState<'current' | 'all'>(initialScope);
  const [options, setOptions] = useState<MangaExportOptions>(DEFAULT_MANGA_EXPORT_OPTIONS);
  const [copied, setCopied] = useState(false);

  const isAdult = activeMode === 'adult';
  const suffix = isAdult ? '_r18' : '_normal';

  const mangaScenes = useMemo(
    () => scenes.filter((s) => s.format === 'manga' && isSceneVisibleInMode(s.visibility, activeMode)),
    [scenes, activeMode]
  );

  const canExportCurrent = Boolean(activeScene && activeScene.format === 'manga');

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setScope(initialScope === 'current' && canExportCurrent ? 'current' : 'all');
      setCopied(false);
    }
  }, [isOpen, initialTab, initialScope, canExportCurrent]);

  const targetScenes = useMemo(() => {
    if (scope === 'current' && activeScene && activeScene.format === 'manga') {
      return [activeScene];
    }
    return mangaScenes;
  }, [scope, activeScene, mangaScenes]);

  const cspContent = useMemo(
    () => exportCspTypesettingText(targetScenes, characters, worldSettings, activeMode, options),
    [targetScenes, characters, worldSettings, activeMode, options]
  );

  const scriptDoc = useMemo(
    () =>
      exportMangaScriptDocument(
        project,
        scenes,
        characters,
        worldSettings,
        activeMode,
        scope === 'current' && activeScene?.format === 'manga' ? activeScene : undefined
      ),
    [project, scenes, characters, worldSettings, activeMode, scope, activeScene]
  );

  const previewText = tab === 'csp' ? cspContent : scriptDoc.content;

  if (!isOpen) return null;

  const safeBase = (
    scope === 'current' && activeScene ? activeScene.sceneId : project.title
  )
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 40);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  const handleDownloadTxt = () => {
    if (tab === 'csp') {
      triggerDownload(`${safeBase}_csp${suffix}.txt`, cspContent);
    } else {
      triggerDownload(scriptDoc.filename, scriptDoc.content);
    }
  };

  const handleDownloadMd = () => {
    const mdFilename = scriptDoc.filename.replace(/\.txt$/i, '.md');
    triggerDownload(mdFilename, scriptDoc.content, 'text/markdown;charset=utf-8');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              マンガ書き出し（クリスタ写植用 / 作画用脚本）
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              現在のモード（{isAdult ? 'R18 / _r18' : '一般用 / _normal'}）の分岐とキャラ・世界観変数を自動展開して出力します
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode & Scope Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
          <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setTab('csp')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                tab === 'csp'
                  ? isAdult
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>クリスタ写植用テキスト</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('script')}
              className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
                tab === 'script'
                  ? isAdult
                    ? 'bg-rose-700 text-white'
                    : 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>作画・ネーム共有用脚本</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-500">対象:</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'current' | 'all')}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              {canExportCurrent && activeScene && (
                <option value="current">現在のシーン（{activeScene.title}）</option>
              )}
              <option value="all">全マンガシーン一括（{mangaScenes.length}件）</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {tab === 'csp' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
              <div className="text-[11px] font-medium text-slate-700">
                CLIP STUDIO PAINT ストーリーエディタ取り込みオプション
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.includeMonologue}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, includeMonologue: e.target.checked }))
                    }
                  />
                  <span>モノローグを含める</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.includeNarration}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, includeNarration: e.target.checked }))
                    }
                  />
                  <span>ナレーションを含める</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.includeSfx}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, includeSfx: e.target.checked }))
                    }
                  />
                  <span>描き文字（SFX）を含める</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.includeSpeakerComment}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, includeSpeakerComment: e.target.checked }))
                    }
                  />
                  <span>話者コメントを残す</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/70 pt-2 text-xs">
                <span className="text-[11px] font-medium text-slate-600">ページ区切り:</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-700">
                  <input
                    type="radio"
                    name="csp-page-sep"
                    checked={options.pageSeparator === 'double_blank'}
                    onChange={() =>
                      setOptions((prev) => ({ ...prev, pageSeparator: 'double_blank' }))
                    }
                  />
                  <span>空行2行（ストーリーエディタ標準）</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-700">
                  <input
                    type="radio"
                    name="csp-page-sep"
                    checked={options.pageSeparator === 'page_header'}
                    onChange={() =>
                      setOptions((prev) => ({ ...prev, pageSeparator: 'page_header' }))
                    }
                  />
                  <span>区切り見出しあり（--- P2 ---）</span>
                </label>
              </div>
              <p className="text-[10px] text-slate-500">
                ※ 構図ト書き・話者名・外側のカギ括弧は自動除去され、フキダシ間は空行1行で分割されます。
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>出力プレビュー（{previewText.length.toLocaleString()}文字）</span>
              <span className="font-code text-[10px]">
                {tab === 'csp' ? `${safeBase}_csp${suffix}.txt` : scriptDoc.filename}
              </span>
            </div>
            <textarea
              readOnly
              value={previewText || '（出力対象のセリフ・データがありません）'}
              rows={13}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-code text-xs leading-relaxed text-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            disabled={!previewText}
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700">コピーしました</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>クリップボードにコピー</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            {tab === 'script' && (
              <button
                type="button"
                disabled={!previewText}
                onClick={handleDownloadMd}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>.md 保存</span>
              </button>
            )}
            <button
              type="button"
              disabled={!previewText}
              onClick={handleDownloadTxt}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-40 ${
                isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>.txt ダウンロード</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
