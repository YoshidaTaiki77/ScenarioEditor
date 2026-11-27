import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Globe,
  HardDrive,
  Keyboard,
  ListChecks,
  Search,
  Sliders,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { ActiveMode, SelectedItem } from '../types/scenario';

interface UsageGuideTabProps {
  activeMode: ActiveMode;
  selectedItemType: SelectedItem['type'];
}

interface GuideEntry {
  title: string;
  body: string;
  steps?: Array<{ step: string; title: string; detail: string }>;
  shortcuts?: Array<{ keys: string; desc: string }>;
  codeLines?: string[];
  keywords?: string[];
}

interface GuideSection {
  id: string;
  title: string;
  shortLabel: string;
  relatedScreen?: SelectedItem['type'];
  icon: React.ComponentType<{ className?: string }>;
  entries: GuideEntry[];
}

const SCREEN_LABEL: Record<SelectedItem['type'], string> = {
  scene: 'シーン編集中',
  character: 'キャラ編集中',
  world: '世界観編集中',
  plot: 'プロット編集中',
};

export const UsageGuideTab: React.FC<UsageGuideTabProps> = ({
  activeMode,
  selectedItemType,
}) => {
  const isAdult = activeMode === 'adult';
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const sections: GuideSection[] = useMemo(
    () => [
      {
        id: 'initial-setup',
        title: '初期セットアップ（はじめに）',
        shortLabel: '初期設定',
        icon: ListChecks,
        entries: [
          {
            title: '新規プロジェクトを始める4ステップ',
            body: '最初に保存先フォルダと基本構成を整えておくと、安全に執筆を続けられます。',
            steps: [
              {
                step: '1',
                title: '推奨ブラウザで開く（必要に応じて PWA 導入）',
                detail:
                  'ローカルフォルダ同期を使う場合は Google Chrome / Edge の通常タブまたは PWA ウィンドウを推奨します。右上の「インストール」からアプリ化するとオフラインでも起動できます。',
              },
              {
                step: '2',
                title: '新規プロジェクト作成・フォルダ連携',
                detail:
                  'ヘッダー左「フォルダ連携」横の ▼ メニューから「新規プロジェクトを作成（フォルダ作成）...」を選び、作品名・テンプレート・初期モードを指定して保存先フォルダを選択します。非対応ブラウザでは同メニュー下部の「ブラウザ内データを初期化して新規作成」で開始できます。',
              },
              {
                step: '3',
                title: '登場キャラクターと共通項目の用意',
                detail:
                  '左バーの characters/ からキャラを作成します。作品共通の追加項目は「追加先：全キャラクター」と「今後の新規キャラにも自動追加」を使うと一括で揃えられます。',
              },
              {
                step: '4',
                title: 'プロットとシーンフォルダを連携して執筆開始',
                detail:
                  'plots/ でプロットを作成（同名シーンフォルダの同時作成も可能）し、カードからシーンを作成＆紐付けして本文を執筆します。',
              },
            ],
            keywords: [
              '初期',
              'セットアップ',
              'はじめに',
              '手順',
              '導入',
              'PWA',
              'インストール',
              'Chrome',
              '新規プロジェクト',
              'フォルダ連携',
            ],
          },
          {
            title: '2回目以降の起動時（フォルダ再接続）',
            body: 'ブラウザを閉じて再起動した際、上部に「前回の同期フォルダへのアクセス権限が保留中です」と表示されたら「フォルダに再接続」をクリックしてください。書き込み権限が復帰し、ローカルフォルダとの同期が再開されます。',
            keywords: ['再接続', '権限', '起動', 'ブラウザ', '再開', '同期'],
          },
        ],
      },
      {
        id: 'scene-writing',
        title: 'シナリオ執筆・ショートカット',
        shortLabel: '執筆操作',
        relatedScreen: 'scene',
        icon: Keyboard,
        entries: [
          {
            title: '執筆を加速するキーボード操作',
            body: '本文エディタ内では以下のショートカットで話者入力や改行を素早く行えます。',
            shortcuts: [
              { keys: '行頭で Tab', desc: '登場キャラ一覧を開き「話者名「」」を挿入' },
              { keys: `${modKey} + Enter`, desc: '直前の話者と同じ「話者名「」」を連続挿入' },
              { keys: '」の直前で Enter', desc: '閉じ括弧を飛び越えて次の行へ改行' },
              { keys: `${modKey} + Shift + M`, desc: '一般用 ⇔ R18 モードを一括切替' },
              { keys: 'Esc', desc: 'フォーカスモード解除 / ポップアップを閉じる' },
            ],
            keywords: ['tab', 'enter', 'shortcut', '話者', 'セリフ', 'ショートカット', '改行'],
          },
          {
            title: '表示切替とシーン分類',
            body: 'シーン上部のバーから「2分割プロット」「縦書き／横書き」「フォーカスモード」を切り替えられます。所属フォルダの変更や可視性（共通 / R18専用 / 一般差替）も上部から設定できます。',
            keywords: ['縦書き', '横書き', '2分割', 'フォーカス', 'フォルダ', '可視性', 'R18専用'],
          },
        ],
      },
      {
        id: 'mode-syntax',
        title: 'モード分岐・変数記法・高速校正',
        shortLabel: '記法と校正',
        relatedScreen: 'scene',
        icon: Sparkles,
        entries: [
          {
            title: '一般用 / R18 の本文分岐ブロック',
            body: '1つのシーン内でモード別の文章を書き分けられます。書き出し時に現在のモードに合うブロックだけが出力されます。',
            codeLines: [
              '[IF_MODE: general]',
              '一般版だけで出力する文章',
              '[/IF_MODE]',
              '[IF_MODE: adult]',
              'R18版だけで出力する文章',
              '[/IF_MODE]',
              '[R18_BLOCK_START: 導入〜接触]',
              'R18専用シーンの構成ブロック',
              '[R18_BLOCK_END]',
            ],
            keywords: ['IF_MODE', 'R18_BLOCK', '分岐', '一般用', 'adult', 'general', '記法'],
          },
          {
            title: 'キャラ変数記法と「設定参照」タブ',
            body: '本文に変数記法を書いておくと、モード切替やキャラ設定の変更に合わせて書き出し時に自動展開されます。キャラクター別の呼び方・関係性は末尾に相手IDを付けて参照でき、「設定参照」タブからクリックで挿入できます。',
            codeLines: [
              '{{char_id.callPartner}}',
              '{{char_id.callPartner.target_id}}',
              '{{char_id.relationship.target_id}}',
              '{{char_id.firstPerson}}',
              '{{char_id.costume}}',
            ],
            keywords: ['変数', '設定参照', '定型文', '展開', '一人称', '呼び方', '関係性', '衣装'],
          },
          {
            title: '高速校正タブ（AI不使用）',
            body: '「高速校正」タブでは一人称の不整合・カギ括弧「」の閉じ忘れ・分岐タグの閉じ忘れをリアルタイム検出します。指摘カードをクリックすると該当行へジャンプします。',
            keywords: ['校正', 'チェック', '括弧', 'ジャンプ', '一人称'],
          },
        ],
      },
      {
        id: 'characters',
        title: 'キャラクター設定・一括項目追加',
        shortLabel: 'キャラ設定',
        relatedScreen: 'character',
        icon: Users,
        entries: [
          {
            title: '共通設定とデュアル・プロファイル',
            body: '基本情報は「共通設定 (common)」に入力します。一般用とR18用で値が変わる項目だけ「デュアル・プロファイル設定」へ追加してください。🔒「一般値でロック」を使うと一時的に一般用の値へ固定できます。',
            keywords: ['共通設定', 'デュアル', 'ロック', 'general', 'adult', 'JSON'],
          },
          {
            title: '他キャラへの一括追加・新規キャラ自動追加',
            body: '共通項目・デュアル項目を追加する際、「追加先」プルダウンから「同じフォルダ内の全キャラ」「全キャラクター」を選ぶと一括追加できます（既に同じ変数キーがあるキャラは上書きせずスキップ）。「今後の新規キャラにも自動追加」にチェックすると、以降作成するキャラにも自動で反映されます。',
            keywords: ['一括追加', 'テンプレート', '新規キャラ', '自動追加', '変数キー'],
          },
          {
            title: 'ファイル名とフォルダ整理',
            body: 'キャラ画面上部で `.json` ファイル名の変更や所属フォルダの切替、単体 JSON ダウンロードが行えます。',
            keywords: ['ファイル名', 'フォルダ', 'json', 'ダウンロード'],
          },
        ],
      },
      {
        id: 'world-settings',
        title: '世界観設定・フォルダ整理・変数参照',
        shortLabel: '世界観設定',
        relatedScreen: 'world',
        icon: Globe,
        entries: [
          {
            title: '舞台設定・アイテム設定の整理とドラッグ移動',
            body: '左バーの world/ では初期フォルダ「舞台設定」「アイテム設定」のほか、任意のフォルダを作成して設定を分類できます。グリップアイコン（⋮⋮）のドラッグ＆ドロップでフォルダ間の移動や表示順の並び替えが可能です。',
            keywords: ['世界観', '舞台設定', 'アイテム設定', 'world', 'フォルダ', 'ドラッグ'],
          },
          {
            title: 'プリセット項目・関連キャラ・R18裏設定',
            body: '世界観エディタでは基本項目のほか「舞台用」「アイテム用」「組織・用語用」プリセットや任意のカスタム項目を追加できます。登録済みキャラクターの関連付けや、R18モード時のみ表示される補足・裏設定も記録できます。',
            keywords: ['プリセット', 'カスタム項目', '関連キャラ', 'R18', '裏設定', 'JSON'],
          },
          {
            title: '世界観変数の参照と本文展開',
            body: '右パネルの「設定参照」タブで「世界観」に切り替えると、詳細を確認しながら {{world.<id>.<field>}} 記法をワンクリック挿入できます。書き出しやプレビュー時に自動で展開されます。',
            codeLines: [
              '{{world.old_library.name}}',
              '{{world.old_library.summary}}',
              '{{world.old_library.adultNote}}',
            ],
            keywords: ['world', '変数', '設定参照', '展開'],
          },
        ],
      },
      {
        id: 'plots-folders',
        title: 'プロット・フォルダ連携・並び替え',
        shortLabel: 'プロットと整理',
        relatedScreen: 'plot',
        icon: FolderTree,
        entries: [
          {
            title: 'プロットとシーンフォルダの連携',
            body: 'プロット上部の「連携フォルダ」を設定すると、カードからのシーン検索で該当フォルダのシーンを絞り込めます。カード上の「＋連携フォルダに新規作成」ボタンでシーン作成と紐付けを同時に行え、別プロットへカード移動する際にシーンフォルダも連動移動できます。',
            keywords: ['プロット', '連携フォルダ', 'カード', '紐付け', '一括移動', '多対1'],
          },
          {
            title: 'フォルダ管理とドラッグ＆ドロップ並び替え',
            body: '左バーの `characters/` と `scenes/` では1階層までのサブフォルダを作成できます。各フォルダ行・シーン行・キャラ行・プロット行の左端にあるグリップアイコン（⋮⋮）をドラッグすると、表示順の並び替えや別フォルダの指定位置への移動ができます。',
            keywords: ['ドラッグ', 'ドロップ', '並び替え', 'グリップ', 'フォルダ', '順番'],
          },
        ],
      },
      {
        id: 'storage-history',
        title: '保存・history/ 自動履歴・書き出し',
        shortLabel: '保存と書き出し',
        icon: HardDrive,
        entries: [
          {
            title: '自動保存とローカルフォルダ同期',
            body: '編集内容は自動でブラウザ（IndexedDB）へ保存されます。Chrome 等でヘッダーの「フォルダ連携」を使うと、PC 上のローカルフォルダへ `project.json`・`characters/`・`plots/`・`scenes/` を実ファイルとして直接同期できます。',
            keywords: ['保存', '自動保存', 'IndexedDB', 'ローカルフォルダ', '同期', 'PWA'],
          },
          {
            title: 'history/ 定期スナップショット（最大5件）',
            body: 'ワークスペースに変更があると、1時間ごとに `history/` へスナップショットを自動保存します。容量を抑えるため古いものから最大5件で自動ローテーションされます。ヘッダーの「履歴」ボタンから手動保存・過去時点への復元・JSON保存が行えます。',
            keywords: ['history', '履歴', 'スナップショット', '復元', 'ローテーション', 'バックアップ'],
          },
          {
            title: 'モード別テキスト書き出し',
            body: '右上の「書き出し」メニューから、現在のモード（一般用 `_normal.txt` / R18 `_r18.txt`）に合わせて変数を展開した本文をダウンロードできます。',
            keywords: ['書き出し', 'エクスポート', '_normal', '_r18', 'txt'],
          },
        ],
      },
    ],
    [modKey]
  );

  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => ({
    'scene-writing': selectedItemType === 'scene',
    characters: selectedItemType === 'character',
    'world-settings': selectedItemType === 'world',
    'plots-folders': selectedItemType === 'plot',
  }));

  // Auto-expand the primary section matching the currently active editor screen
  useEffect(() => {
    const primaryId =
      selectedItemType === 'scene'
        ? 'scene-writing'
        : selectedItemType === 'character'
          ? 'characters'
          : selectedItemType === 'world'
            ? 'world-settings'
            : 'plots-folders';
    setOpenIds((prev) => ({ ...prev, [primaryId]: true }));
  }, [selectedItemType]);

  const orderedSections = useMemo(() => {
    const initialSetup = sections.filter((s) => s.id === 'initial-setup');
    const related = sections.filter(
      (s) => s.id !== 'initial-setup' && s.relatedScreen === selectedItemType
    );
    const others = sections.filter(
      (s) => s.id !== 'initial-setup' && s.relatedScreen !== selectedItemType
    );
    return [...initialSetup, ...related, ...others];
  }, [sections, selectedItemType]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return orderedSections;
    return orderedSections
      .map((sec) => {
        const sectionMatches = sec.title.toLowerCase().includes(normalizedQuery);
        if (sectionMatches) return sec;
        const matchedEntries = sec.entries.filter((entry) => {
          const haystack = [
            entry.title,
            entry.body,
            ...(entry.keywords ?? []),
            ...(entry.codeLines ?? []),
            ...(entry.steps ?? []).flatMap((st) => [st.title, st.detail]),
            ...(entry.shortcuts ?? []).flatMap((s) => [s.keys, s.desc]),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        });
        if (matchedEntries.length === 0) return null;
        return { ...sec, entries: matchedEntries };
      })
      .filter((sec): sec is GuideSection => sec !== null);
  }, [orderedSections, normalizedQuery]);

  const toggleSection = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-3">
      {/* Context Header & Quick Search */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1 font-medium text-slate-700">
            <Sliders className="h-3 w-3 text-slate-400" />
            <span>操作ガイド</span>
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
              isAdult
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {SCREEN_LABEL[selectedItemType]}
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キーワードで絞り込み（例: Tab・R18・履歴）"
            aria-label="使い方をキーワード検索"
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="検索をクリア"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Accordion Sections */}
      {filteredSections.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
          「{query}」に一致する項目が見つかりませんでした。
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const isRelated = section.relatedScreen === selectedItemType;
            const isOpen = normalizedQuery ? true : Boolean(openIds[section.id]);

            return (
              <div
                key={section.id}
                className={`overflow-hidden rounded-lg border bg-white transition-colors ${
                  isRelated
                    ? isAdult
                      ? 'border-rose-200'
                      : 'border-slate-300'
                    : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isRelated
                          ? isAdult
                            ? 'text-rose-600'
                            : 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate text-xs font-semibold text-slate-800">
                      {section.title}
                    </span>
                  </span>
                  {isRelated && (
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium ${
                        isAdult
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      現在の画面
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 px-3 py-2 space-y-3">
                    {section.entries.map((entry, idx) => (
                      <div key={entry.title} className={idx > 0 ? 'pt-3 space-y-1.5' : 'space-y-1.5'}>
                        <h4 className="text-[11px] font-semibold text-slate-800">
                          {entry.title}
                        </h4>
                        <p className="text-[11px] leading-relaxed text-slate-600">
                          {entry.body}
                        </p>

                        {entry.steps && entry.steps.length > 0 && (
                          <ol className="mt-1.5 space-y-2">
                            {entry.steps.map((st) => (
                              <li
                                key={st.step}
                                className="flex items-start gap-2 rounded border border-slate-100 bg-slate-50/70 p-2"
                              >
                                <span
                                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded font-code text-[10px] font-semibold ${
                                    isAdult
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-slate-200 text-slate-800'
                                  }`}
                                >
                                  {st.step}
                                </span>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="text-[11px] font-semibold text-slate-800">
                                    {st.title}
                                  </div>
                                  <p className="text-[11px] leading-relaxed text-slate-600">
                                    {st.detail}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}

                        {entry.shortcuts && entry.shortcuts.length > 0 && (
                          <dl className="mt-1.5 space-y-1.5">
                            {entry.shortcuts.map((sc) => (
                              <div
                                key={sc.keys}
                                className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                              >
                                <dt>
                                  <kbd className="inline-block rounded border border-slate-200 bg-white px-1.5 py-0.5 font-code text-[10px] font-semibold text-slate-800 shadow-2xs">
                                    {sc.keys}
                                  </kbd>
                                </dt>
                                <dd className="mt-1 text-[11px] leading-snug text-slate-600">
                                  {sc.desc}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        {entry.codeLines && entry.codeLines.length > 0 && (
                          <pre className="mt-1.5 overflow-x-auto rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-code text-[10px] leading-relaxed text-slate-700 select-text">
                            {entry.codeLines.join('\n')}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
