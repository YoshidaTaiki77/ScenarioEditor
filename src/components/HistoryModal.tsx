import React, { useEffect, useState } from 'react';
import {
  Archive,
  Clock,
  Download,
  HardDrive,
  History,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { ActiveMode, HistorySnapshot, StorageMode } from '../types/scenario';
import {
  HISTORY_DIR_NAME,
  MAX_HISTORY_SNAPSHOTS,
  triggerDownload,
} from '../utils/storageManager';

interface HistoryModalProps {
  isOpen: boolean;
  activeMode: ActiveMode;
  storageMode: StorageMode;
  directoryName?: string;
  snapshots: HistorySnapshot[];
  isSavingSnapshot: boolean;
  onClose: () => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapshot: HistorySnapshot) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  activeMode,
  storageMode,
  directoryName,
  snapshots,
  isSavingSnapshot,
  onClose,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const isAdult = activeMode === 'adult';

  useEffect(() => {
    if (!isOpen) {
      setConfirmRestoreId(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalBytes = snapshots.reduce((sum, s) => sum + (s.byteSize || 0), 0);

  const handleDownloadSnapshot = (snap: HistorySnapshot) => {
    triggerDownload(
      snap.filename,
      JSON.stringify(snap, null, 2),
      'application/json;charset=utf-8'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <History className={`h-4 w-4 ${isAdult ? 'text-rose-700' : 'text-slate-700'}`} />
            <h2 id="history-modal-title" className="text-sm font-semibold text-slate-900">
              {HISTORY_DIR_NAME}/ スナップショット履歴
            </h2>
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

        {/* Summary & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-xs">
          <div className="space-y-1 text-slate-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>変更時に1時間ごと自動保存（最大{MAX_HISTORY_SNAPSHOTS}件ローテーション）</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-slate-400" />
                <span>
                  保存先:{' '}
                  {storageMode === 'filesystem'
                    ? `${directoryName ?? 'ローカルフォルダ'}/${HISTORY_DIR_NAME}/（＋ブラウザ）`
                    : storageMode === 'indexeddb'
                      ? `ブラウザ内 IndexedDB (${HISTORY_DIR_NAME}/)`
                      : `ブラウザ内 LocalStorage (${HISTORY_DIR_NAME}/)`}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-code tabular-nums">
                {snapshots.length}/{MAX_HISTORY_SNAPSHOTS}件 · 合計 {formatBytes(totalBytes)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isSavingSnapshot}
            onClick={onCreateSnapshot}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
              isAdult ? 'bg-rose-700 hover:bg-rose-800' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {isSavingSnapshot ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            <span>今すぐスナップショット保存</span>
          </button>
        </div>

        {/* Snapshot List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/40 px-6 py-10 text-center">
              <p className="text-xs font-medium text-slate-700">
                保存されたスナップショットはまだありません
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                ワークスペースに変更があると1時間ごとに自動で保存され、古い履歴から順に最大
                {MAX_HISTORY_SNAPSHOTS}件までローテーション管理されます。
                <br />
                右上のボタンから手動でスナップショットを作成することもできます。
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {snapshots.map((snap, index) => {
                const isConfirming = confirmRestoreId === snap.id;
                return (
                  <div
                    key={snap.id}
                    className="rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-code text-xs font-semibold text-slate-900 tabular-nums">
                            {formatDateTime(snap.createdAt)}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                              snap.reason === 'auto'
                                ? 'border-slate-200 bg-slate-100 text-slate-600'
                                : isAdult
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {snap.reason === 'auto' ? '定期自動' : '手動保存'}
                          </span>
                          {index === 0 && (
                            <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                              最新
                            </span>
                          )}
                        </div>

                        <div className="font-code text-[11px] text-slate-400 truncate">
                          {HISTORY_DIR_NAME}/{snap.filename}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                          <span className="font-medium text-slate-800 truncate max-w-[220px]">
                            {snap.projectTitle}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="tabular-nums">シーン {snap.sceneCount}</span>
                          <span className="tabular-nums">キャラ {snap.characterCount}</span>
                          <span className="tabular-nums">プロット {snap.plotCount}</span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-code text-slate-500 tabular-nums">
                            {formatBytes(snap.byteSize)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmRestoreId(isConfirming ? null : snap.id)
                          }
                          className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>復元</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSnapshot(snap)}
                          title={`${snap.filename} をダウンロード`}
                          className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmRestoreId === snap.id) setConfirmRestoreId(null);
                            onDeleteSnapshot(snap.id);
                          }}
                          title="このスナップショットを削除"
                          className="rounded border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isConfirming && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
                        <span>
                          現在の作業内容をこの時点のスナップショットで上書き復元しますか？
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreId(null)}
                            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmRestoreId(null);
                              onRestoreSnapshot(snap);
                            }}
                            className={`rounded px-2.5 py-1 text-[11px] font-medium text-white ${
                              isAdult
                                ? 'bg-rose-700 hover:bg-rose-800'
                                : 'bg-slate-800 hover:bg-slate-900'
                            }`}
                          >
                            復元を実行
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-5 py-2.5 text-[11px] text-slate-500">
          <span>※ PWA ストレージ容量保護のため、古い履歴から自動で削除されます</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
