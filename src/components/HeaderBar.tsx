import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Download,
  FolderOpen,
  FolderPlus,
  FolderSync,
  HardDrive,
  History,
  PanelLeft,
  PanelRight,
  RotateCcw,
  ShieldAlert,
  Unlink,
} from 'lucide-react';
import type { ActiveMode, SaveStatus } from '../types/scenario';
import { MAX_HISTORY_SNAPSHOTS } from '../utils/storageManager';
import { PWAInstallButton } from './PWAInstallButton';
import { SaveStatusIndicator } from './SaveStatusIndicator';

interface HeaderBarProps {
  projectTitle: string;
  onChangeProjectTitle: (title: string) => void;
  activeMode: ActiveMode;
  onToggleMode: (mode: ActiveMode) => void;
  saveStatus: SaveStatus;
  onSaveNow: () => void;
  pendingReconnectDirectoryName?: string | null;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onRequestNewProject: () => void;
  onRequestResetBrowserProject: () => void;
  onExportCurrentScene: () => void;
  onExportAllScenes: () => void;
  hasActiveScene: boolean;
  hasMangaScenes: boolean;
  isActiveMangaScene: boolean;
  onOpenMangaExport: (tab: 'csp' | 'script', scope: 'current' | 'all') => void;
  historyCount: number;
  onOpenHistory: () => void;
  leftPaneOpen: boolean;
  rightPaneOpen: boolean;
  onToggleLeftPane: () => void;
  onToggleRightPane: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  projectTitle,
  onChangeProjectTitle,
  activeMode,
  onToggleMode,
  saveStatus,
  onSaveNow,
  pendingReconnectDirectoryName,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onRequestNewProject,
  onRequestResetBrowserProject,
  onExportCurrentScene,
  onExportAllScenes,
  hasActiveScene,
  hasMangaScenes,
  isActiveMangaScene,
  onOpenMangaExport,
  historyCount,
  onOpenHistory,
  leftPaneOpen,
  rightPaneOpen,
  onToggleLeftPane,
  onToggleRightPane,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectTitle);
  const [isCompactHeader, setIsCompactHeader] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const exportRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitleDraft(projectTitle);
  }, [projectTitle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsCompactHeader(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdult = activeMode === 'adult';
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
  const shortcutLabel = isMac ? '⌘⇧M' : 'Ctrl+Shift+M';

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== projectTitle) {
      onChangeProjectTitle(trimmed);
    } else {
      setTitleDraft(projectTitle);
    }
    setEditingTitle(false);
  };

  const renderLeftPaneToggle = () => (
    <button
      type="button"
      onClick={onToggleLeftPane}
      aria-pressed={leftPaneOpen}
      aria-label="左パネル（プロジェクト構成）を開閉"
      title={leftPaneOpen ? '左パネルを閉じる' : '左パネル（プロジェクト構成）を開く'}
      className={`flex items-center justify-center rounded-md border p-1.5 transition-colors shrink-0 ${
        leftPaneOpen
          ? isAdult
            ? 'border-rose-300 bg-rose-100/80 text-rose-800'
            : 'border-slate-300 bg-slate-100 text-slate-900'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <PanelLeft className="h-3.5 w-3.5" />
    </button>
  );

  const renderRightPaneToggle = () => (
    <button
      type="button"
      onClick={onToggleRightPane}
      aria-pressed={rightPaneOpen}
      aria-label="右パネル（設定参照・校正・使い方）を開閉"
      title={rightPaneOpen ? '右パネルを閉じる' : '右パネル（設定参照・校正・使い方）を開く'}
      className={`flex items-center justify-center rounded-md border p-1.5 transition-colors shrink-0 ${
        rightPaneOpen
          ? isAdult
            ? 'border-rose-300 bg-rose-100/80 text-rose-800'
            : 'border-slate-300 bg-slate-100 text-slate-900'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <PanelRight className="h-3.5 w-3.5" />
    </button>
  );

  const renderTitleBlock = () => (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`hidden sm:inline text-xs font-semibold tracking-tight whitespace-nowrap shrink-0 ${
          isAdult ? 'text-rose-700' : 'text-slate-600'
        }`}
      >
        Kotonoha
      </span>
      <span className="hidden sm:inline text-slate-300 select-none" aria-hidden="true">
        /
      </span>
      {editingTitle ? (
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitle();
            if (e.key === 'Escape') {
              setTitleDraft(projectTitle);
              setEditingTitle(false);
            }
          }}
          autoFocus
          className="w-36 sm:w-44 xl:w-56 rounded border border-slate-300 bg-white px-2 py-0.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          title="クリックしてプロジェクト名を編集"
          className="truncate max-w-[140px] sm:max-w-[180px] lg:max-w-[200px] xl:max-w-[260px] text-sm font-semibold text-slate-900 hover:underline text-left"
        >
          {projectTitle}
        </button>
      )}
    </div>
  );

  const renderProjectMenu = (alignRight = false) => (
    <div className="relative flex items-center shrink-0" ref={projectMenuRef}>
      <button
        type="button"
        onClick={onConnectFolder}
        title="ローカルフォルダを選択して編集プロジェクトを変更・連携"
        className="flex items-center gap-1 rounded-l border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
      >
        {saveStatus.storageMode === 'filesystem' ? (
          <HardDrive className="h-3.5 w-3.5 text-slate-600" />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 text-slate-600" />
        )}
        <span className={isCompactHeader ? 'inline text-[11px]' : 'hidden lg:inline'}>
          {saveStatus.storageMode === 'filesystem' ? 'フォルダ変更' : 'フォルダ連携'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => setProjectMenuOpen((v) => !v)}
        aria-label="プロジェクト操作メニュー"
        title="プロジェクト切替・新規初期化メニュー"
        className="flex items-center justify-center rounded-r border border-l-0 border-slate-200 bg-white px-1.5 py-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {projectMenuOpen && (
        <div
          className={`absolute ${
            alignRight ? 'right-0' : 'left-0'
          } top-full mt-1.5 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-slate-200 bg-white py-1 shadow-lg z-50`}
        >
          <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
            編集プロジェクト・保存先の管理（PC Chrome 推奨）
          </div>

          <button
            type="button"
            onClick={() => {
              setProjectMenuOpen(false);
              onRequestNewProject();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            <FolderPlus className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <span>新規プロジェクトを作成（フォルダ作成）...</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setProjectMenuOpen(false);
              onConnectFolder();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            <FolderOpen className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>フォルダを選択して変更 / 連携...</span>
          </button>

          {pendingReconnectDirectoryName && saveStatus.storageMode !== 'filesystem' && (
            <button
              type="button"
              onClick={() => {
                setProjectMenuOpen(false);
                onReconnectFolder();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-800 bg-amber-50/50 hover:bg-amber-50"
            >
              <FolderSync className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="truncate">「{pendingReconnectDirectoryName}」に再接続</span>
            </button>
          )}

          {saveStatus.storageMode === 'filesystem' && (
            <button
              type="button"
              onClick={() => {
                setProjectMenuOpen(false);
                onDisconnectFolder();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <Unlink className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>フォルダ連携を解除（ブラウザ保存のみ）</span>
            </button>
          )}

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              setProjectMenuOpen(false);
              onOpenHistory();
            }}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            <span className="flex items-center gap-2 min-w-0">
              <History className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span className="truncate">history/ スナップショット履歴...</span>
            </span>
            <span className="font-code text-[10px] text-slate-400 tabular-nums shrink-0">
              {historyCount}/{MAX_HISTORY_SNAPSHOTS}
            </span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => {
              setProjectMenuOpen(false);
              onRequestResetBrowserProject();
            }}
            className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <div>ブラウザ内データを初期化して新規作成（予備）...</div>
              <div className="text-[10px] text-slate-400">
                フォルダ連携に非対応のブラウザ向け
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );

  const renderModeSwitch = () => (
    <div className="flex items-center gap-1.5 xl:gap-2 shrink-0">
      <div
        role="group"
        aria-label="執筆モード一括切替"
        className={`flex items-center rounded-md border p-0.5 ${
          isAdult
            ? 'border-rose-200 bg-rose-100/70'
            : 'border-slate-200 bg-slate-100'
        }`}
      >
        <button
          type="button"
          onClick={() => onToggleMode('general')}
          className={`rounded px-2 xl:px-3 py-1 text-[11px] xl:text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            !isAdult
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="hidden xl:inline">一般用 (Normal)</span>
          <span className="xl:hidden">一般</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleMode('adult')}
          className={`rounded px-2 xl:px-3 py-1 text-[11px] xl:text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            isAdult
              ? 'bg-rose-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-rose-700'
          }`}
        >
          <span className="hidden xl:inline">R18 (Adult)</span>
          <span className="xl:hidden">R18</span>
        </button>
      </div>

      {isAdult && (
        <span className="flex items-center gap-1 rounded border border-rose-300 bg-rose-700 px-1.5 xl:px-2 py-0.5 text-[10px] xl:text-[11px] font-semibold tracking-wider text-white whitespace-nowrap shrink-0">
          <ShieldAlert className="h-3 w-3" />
          <span className="hidden xl:inline">R18 EDIT</span>
          <span className="xl:hidden">R18</span>
        </span>
      )}

      {!isCompactHeader && (
        <span
          className="hidden 2xl:inline font-code text-[11px] text-slate-400 whitespace-nowrap shrink-0"
          title="モード一括切替ショートカット"
        >
          {shortcutLabel}
        </span>
      )}
    </div>
  );

  const renderHistoryButton = () => (
    <button
      type="button"
      onClick={onOpenHistory}
      title={`history/ スナップショット履歴（1時間ごと自動保存・最大${MAX_HISTORY_SNAPSHOTS}件）`}
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
    >
      <History className="h-3.5 w-3.5 text-slate-500" />
      <span className={isCompactHeader ? 'hidden sm:inline' : 'hidden xl:inline'}>履歴</span>
      <span className="font-code text-[10px] text-slate-400 tabular-nums">
        {historyCount}/{MAX_HISTORY_SNAPSHOTS}
      </span>
    </button>
  );

  const renderExportMenu = () => (
    <div className="relative" ref={exportRef}>
      <button
        type="button"
        onClick={() => setExportOpen((v) => !v)}
        className={`flex items-center gap-1 xl:gap-1.5 rounded-md px-2.5 xl:px-3 py-1.5 text-[11px] xl:text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
          isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
        }`}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">書き出し ({isAdult ? '_r18' : '_normal'})</span>
        <span className="xl:hidden">書き出し</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {exportOpen && (
        <div className="absolute right-0 mt-1.5 w-64 max-w-[calc(100vw-1rem)] rounded-md border border-slate-200 bg-white py-1 shadow-lg z-50">
          <div className="px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100">
            現在のモード（{isAdult ? 'R18 / _r18' : '一般用 / _normal'}）で出力
          </div>
          <button
            type="button"
            disabled={!hasActiveScene}
            onClick={() => {
              onExportCurrentScene();
              setExportOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <span>現在のシーンを書き出し</span>
            <span className="font-code text-[11px] text-slate-400">
              {isAdult ? '_r18.txt' : '_normal.txt'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onExportAllScenes();
              setExportOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            <span>全シーン一括書き出し</span>
            <span className="font-code text-[11px] text-slate-400">
              {isAdult ? '_r18.txt' : '_normal.txt'}
            </span>
          </button>

          {hasMangaScenes && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <div className="px-3 py-1 text-[10px] font-medium text-slate-400">
                マンガ脚本・写植書き出し
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenMangaExport('csp', isActiveMangaScene ? 'current' : 'all');
                  setExportOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                <span>クリスタ写植用テキスト</span>
                <span className="font-code text-[11px] text-slate-400">
                  {isAdult ? '_csp_r18.txt' : '_csp_normal.txt'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenMangaExport('script', isActiveMangaScene ? 'current' : 'all');
                  setExportOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                <span>作画・ネーム共有用脚本</span>
                <span className="font-code text-[11px] text-slate-400">.txt / .md</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  // Compact 2-Row Header (< 768px: Mobile / Narrow Half-Screen PC)
  if (isCompactHeader) {
    return (
      <header
        className={`shrink-0 border-b transition-colors duration-150 ${
          isAdult
            ? 'border-rose-200 bg-rose-50/70 text-slate-900'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        {/* Row 1: Left Toggle + Title | Save + History + Right Toggle */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {renderLeftPaneToggle()}
            {renderTitleBlock()}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <SaveStatusIndicator
              saveStatus={saveStatus}
              activeMode={activeMode}
              onSaveNow={onSaveNow}
              compact
            />
            {renderHistoryButton()}
            {renderRightPaneToggle()}
          </div>
        </div>

        {/* Row 2: General/R18 Switch | Folder + PWA + Export */}
        <div
          className={`flex items-center justify-between gap-2 border-t px-2.5 py-1.5 ${
            isAdult ? 'border-rose-200/70' : 'border-slate-100'
          }`}
        >
          {renderModeSwitch()}
          <div className="flex items-center gap-1.5 shrink-0">
            {renderProjectMenu(true)}
            <PWAInstallButton isAdult={isAdult} />
            {renderExportMenu()}
          </div>
        </div>
      </header>
    );
  }

  // Standard 1-Row Header (>= 768px: Tablet Landscape / Laptop / Desktop)
  return (
    <header
      className={`flex h-13 shrink-0 items-center justify-between gap-2 lg:gap-3 border-b px-3 lg:px-4 transition-colors duration-150 ${
        isAdult
          ? 'border-rose-200 bg-rose-50/60 text-slate-900'
          : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      {/* Left Zone: Left Panel Toggle, Project Title & Folder Menu */}
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-2.5">
        {renderLeftPaneToggle()}
        {renderTitleBlock()}
        {renderProjectMenu(false)}
      </div>

      {/* Center Zone: General <-> R18 Master Mode Switch */}
      {renderModeSwitch()}

      {/* Right Zone: Save Status, History, PWA Install, Export & Right Panel Toggle */}
      <div className="flex flex-1 items-center justify-end gap-1.5 lg:gap-2 shrink-0">
        <SaveStatusIndicator
          saveStatus={saveStatus}
          activeMode={activeMode}
          onSaveNow={onSaveNow}
        />
        {renderHistoryButton()}
        <PWAInstallButton isAdult={isAdult} />
        {renderExportMenu()}
        {renderRightPaneToggle()}
      </div>
    </header>
  );
};
