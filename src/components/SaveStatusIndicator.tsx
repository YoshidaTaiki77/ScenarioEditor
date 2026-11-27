import React from 'react';
import { AlertCircle, Check, Clock, Loader2, Save } from 'lucide-react';
import type { ActiveMode, SaveStatus } from '../types/scenario';

interface SaveStatusIndicatorProps {
  saveStatus: SaveStatus;
  activeMode: ActiveMode;
  onSaveNow: () => void;
  compact?: boolean;
}

function formatSavedTime(iso?: string, withSeconds = false): string {
  if (!iso) return withSeconds ? '--:--:--' : '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return withSeconds ? '--:--:--' : '--:--';
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  saveStatus,
  activeMode,
  onSaveNow,
  compact = false,
}) => {
  const isAdult = activeMode === 'adult';

  const storageLabel =
    saveStatus.storageMode === 'filesystem'
      ? `フォルダ同期 (${saveStatus.directoryName ?? '接続中'})`
      : saveStatus.storageMode === 'indexeddb'
        ? 'IndexedDB'
        : 'LocalStorage';

  const fullSavedTime = formatSavedTime(saveStatus.lastSavedAt, true);
  const shortSavedTime = formatSavedTime(saveStatus.lastSavedAt, false);
  const statusTooltip = `保存先: ${storageLabel} / 前回保存: ${fullSavedTime}`;

  return (
    <div
      className={`flex items-center rounded-md border bg-white text-xs transition-colors whitespace-nowrap shrink-0 ${
        compact ? 'gap-1.5 px-1.5 py-1' : 'gap-1.5 xl:gap-2 px-2 py-1'
      } ${
        saveStatus.state === 'error'
          ? 'border-rose-300 text-rose-800'
          : isAdult
            ? 'border-rose-200/90 text-slate-700'
            : 'border-slate-200 text-slate-700'
      }`}
      title={statusTooltip}
    >
      {/* Status icon + state */}
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1 whitespace-nowrap shrink-0"
      >
        {saveStatus.state === 'saving' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />
            <span className={compact ? 'text-[11px] font-medium text-slate-800' : 'hidden lg:inline font-medium text-slate-800'}>
              保存中...
            </span>
          </>
        ) : saveStatus.state === 'error' ? (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
            <span className={compact ? 'text-[11px] font-medium text-rose-700' : 'hidden lg:inline font-medium text-rose-700'}>
              エラー
            </span>
          </>
        ) : saveStatus.hasPendingChanges ? (
          <>
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className={compact ? 'text-[11px] font-medium text-amber-800' : 'hidden lg:inline font-medium text-amber-800'}>
              {compact ? '未保存' : '未保存あり'}
            </span>
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span className={compact ? 'text-[11px] font-medium text-slate-800' : 'hidden lg:inline font-medium text-slate-800'}>
              保存済み
            </span>
          </>
        )}
      </div>

      {/* Last successful save time (shown inline on wide screens, always in tooltip) */}
      {!compact && (
        <>
          <span
            className="hidden 2xl:inline text-slate-300 select-none"
            aria-hidden="true"
          >
            ·
          </span>
          <div className="hidden 2xl:flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap shrink-0">
            <span>前回</span>
            <span className="font-code font-medium text-slate-700 tabular-nums">
              {shortSavedTime}
            </span>
          </div>
        </>
      )}

      {/* Manual save now trigger */}
      <button
        type="button"
        onClick={onSaveNow}
        disabled={saveStatus.state === 'saving'}
        title={`${storageLabel} へ今すぐ保存（前回: ${fullSavedTime}）`}
        className={`flex items-center gap-1 rounded border px-1.5 xl:px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
          isAdult
            ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
        }`}
      >
        <Save className="h-3 w-3" />
        <span className={compact ? 'hidden sm:inline' : 'hidden xl:inline'}>今すぐ保存</span>
        <span className={compact ? 'inline sm:hidden' : 'inline xl:hidden'}>保存</span>
      </button>
    </div>
  );
};
