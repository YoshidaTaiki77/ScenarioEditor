import React, { useState } from 'react';
import { Download, MonitorSmartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ isAdult?: boolean }> = ({ isAdult = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="デスクトップアプリ（PWA）としてインストール"
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
          isAdult
            ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
        }`}
      >
        <Download className="h-3.5 w-3.5" />
        <span>アプリ化</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-colors"
        >
          <MonitorSmartphone className="h-3.5 w-3.5" />
          <span>ホーム画面に追加</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">ホーム画面に追加</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                1. Safari のツールバーにある「共有」ボタンをタップします。
                <br />
                2. 下へスクロールし、「ホーム画面に追加」を選択してください。
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-md bg-slate-900 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
