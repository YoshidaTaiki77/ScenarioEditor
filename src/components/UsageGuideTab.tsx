import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Globe,
  HardDrive,
  Keyboard,
  LayoutPanelTop,
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
        title: 'はじめかた（基本の流れ）',
        shortLabel: 'はじめかた',
        icon: ListChecks,
        entries: [
          {
            title: 'アプリとして追加する（任意・オフライン対応）',
            body: 'ブラウザのままでもそのまま使えますが、PCやスマホにアプリとして追加（インストール）しておくと、専用ウィンドウで素早く開けて、ネットにつながっていない環境でも執筆できます。',
            steps: [
              {
                step: '1',
                title: 'PC（Chrome / Edge）の場合',
                detail:
                  '画面右上の「アプリ化」ボタン（またはブラウザのアドレスバー右端の追加アイコン）を押すと、通常のアプリと同じようにデスクトップ等から開けるようになります。',
              },
              {
                step: '2',
                title: 'iPhone / iPad（Safari）の場合',
                detail:
                  '画面右上の「ホーム画面に追加」を押すか、Safari下部の「共有」メニューから「ホーム画面に追加」を選ぶと、ホーム画面からすぐ起動できます。',
              },
            ],
            keywords: [
              'PWA',
              'インストール',
              'アプリ化',
              'ホーム画面',
              'オフライン',
              'Chrome',
              'Edge',
              'Safari',
              'デスクトップ',
            ],
          },
          {
            title: '作品づくりを始める4ステップ',
            body: '最初に保存先と作品のひな形を選んでおくと、ノベルもマンガ脚本もスムーズに書き進められます。',
            steps: [
              {
                step: '1',
                title: '新しい作品をつくる',
                detail:
                  '画面左上の「フォルダ連携」横の ▼ メニューから「新規プロジェクトを作成」を選び、作品名とひな形（白紙・起承転結・サンプル・マンガ制作）を決めてPC上の保存先フォルダを選びます。フォルダ連携が使えない環境でも、同メニュー下部の「ブラウザ内データを初期化して新規作成」ですぐ始められます。',
              },
              {
                step: '2',
                title: 'キャラクターと世界観を登録する',
                detail:
                  '左のリストから登場人物や舞台・アイテムの設定を追加します。名前や一人称・呼び方を登録しておくと、本文の入力補助や表記ゆれチェックに役立ちます。',
              },
              {
                step: '3',
                title: 'プロットで全体の流れを組み立てる',
                detail:
                  'カードでシーンの流れや想定文字数・マンガの想定ページ数を整理します。カードからそのまま新しいシーンを作って紐付けることもできます。',
              },
              {
                step: '4',
                title: '本文・マンガ脚本を書いて書き出す',
                detail:
                  'シーン画面で「ノベル」または「マンガ脚本」を選び、執筆を進めます。書き終わったら画面右上の「書き出し」から一般用・R18用を切り替えて出力できます。',
              },
            ],
            keywords: [
              '初期',
              'はじめ',
              '手順',
              '新規',
              'テンプレート',
              'ひな形',
              'マンガ制作',
              'フォルダ連携',
              'Chrome',
            ],
          },
          {
            title: '次にもう一度開いたとき（フォルダ再接続）',
            body: 'ブラウザを閉じて再度開いた際、画面上部に「前回の同期フォルダへのアクセス権限が保留中です」と出たら「フォルダに再接続」を押してください。PC上のフォルダへの自動保存が再開されます。',
            keywords: ['再接続', '再開', 'フォルダ', '保存', '権限'],
          },
        ],
      },
      {
        id: 'scene-writing',
        title: 'ノベル執筆・ショートカット・画面表示',
        shortLabel: 'ノベル執筆',
        relatedScreen: 'scene',
        icon: Keyboard,
        entries: [
          {
            title: '入力を速くするキーボード操作',
            body: 'ノベル編集画面では、次のキー操作で話者名やカギ括弧を素早く入力できます。',
            shortcuts: [
              { keys: '行頭で Tab', desc: '登場キャラ一覧を開き「話者名「」」を挿入' },
              { keys: `${modKey} + Enter`, desc: '直前の話者と同じ「話者名「」」を続けて挿入' },
              { keys: '」の直前で Enter', desc: '閉じ括弧を飛び越えて次の行へ改行' },
              { keys: `${modKey} + Shift + M`, desc: '一般用 ⇔ R18 モードを一括切替' },
              { keys: 'Esc', desc: 'フォーカス（集中表示）を解除 / 候補一覧を閉じる' },
            ],
            keywords: ['tab', 'enter', '話者', 'セリフ', 'ショートカット', '改行', 'フォーカス'],
          },
          {
            title: 'シーン上部の2段バーの使い方',
            body: '上段で「シーン名」「ノベル／マンガ脚本の切替」「フォーカス（左右パネルを隠す集中表示）」を操作できます。下段では「公開区分（共通・一般差替・R18専用）」「保存先フォルダ」「登場キャラ」「2分割プロット」「縦書き／横書き」「プレビュー表示」を切り替えられます。',
            keywords: ['縦書き', '横書き', '2分割', 'フォーカス', 'フォルダ', '公開区分', 'R18専用', 'プレビュー'],
          },
        ],
      },
      {
        id: 'manga-script',
        title: 'マンガ脚本・見開き台割・クリスタ書き出し',
        shortLabel: 'マンガ脚本',
        relatedScreen: 'scene',
        icon: LayoutPanelTop,
        entries: [
          {
            title: 'ノベル ⇔ マンガ脚本の切り替え',
            body: 'シーン上段の「ノベル｜マンガ脚本」スイッチで、シーンごとにいつでもマンガ脚本形式へ切り替えられます。新規作成時に「マンガ制作」ひな形を選ぶと、最初からページ・コマ構成のサンプル付きで始められます。',
            keywords: ['マンガ', '漫画', '脚本', 'ページ', 'コマ', '切替', 'テンプレート'],
          },
          {
            title: '4つの編集ビューを使い分ける',
            body: 'マンガ脚本では用途に合わせて4つの画面を行き来でき、どれを編集しても自動で中身が連動します。',
            steps: [
              {
                step: '1',
                title: '構造編集（ページ・コマ）',
                detail:
                  'ページごとに「めくりの狙い」、コマごとに「構図・ト書き」「セリフ（通常・モノローグ・ナレーション・叫び等）」「擬音」を整理して入力できます。',
              },
              {
                step: '2',
                title: '台割（見開き）',
                detail:
                  '右綴じ／左綴じの見開きペアでページ構成を一覧できます。ページのドラッグ並び替えや、4の倍数・8の倍数ページ数の目安確認、各ページへのジャンプが行えます。',
              },
              {
                step: '3',
                title: 'テキスト編集',
                detail:
                  '文章だけで一気に書きたいときに使います。見出し（## P1 / ### コマ1）形式で書いた内容がそのまま構造編集や台割に反映されます。',
              },
              {
                step: '4',
                title: '展開プレビュー',
                detail:
                  '一般用／R18モードやキャラ呼び方の差し替え結果を反映した脚本・写植テキストをその場で確認できます。',
              },
            ],
            keywords: ['構造編集', '台割', '見開き', '右綴じ', '左綴じ', 'めくり', '4の倍数', 'テキスト編集', 'プレビュー'],
          },
          {
            title: 'クリスタ写植コピー・作画共有用の書き出し',
            body: 'マンガ脚本の上部ボタン（または右上の「書き出し」メニュー）から、CLIP STUDIO PAINT のストーリーエディタへそのまま貼り付けられる写植用テキスト（フキダシ間の空行・ページ区切り・モノローグや擬音の有無を選択可）と、作画・ネーム共有用の脚本をコピー・保存できます。',
            keywords: ['クリスタ', '写植', 'ストーリーエディタ', 'CLIP STUDIO', 'ネーム', '作画', 'コピー', '書き出し'],
          },
        ],
      },
      {
        id: 'mode-syntax',
        title: '一般用／R18の出し分け・自動差し替え・校正',
        shortLabel: '出し分けと校正',
        relatedScreen: 'scene',
        icon: Sparkles,
        entries: [
          {
            title: '1つのシーンで一般用とR18用を書き分ける',
            body: '次の記号で囲んだ部分は、書き出しやプレビュー時に現在のモードに合う内容だけが出力されます。右パネル「設定参照」タブの定型文ボタンからもワンクリックで挿入できます。',
            codeLines: [
              '[IF_MODE: general]',
              '一般用だけで出力する文章',
              '[/IF_MODE]',
              '[IF_MODE: adult]',
              'R18用だけで出力する文章',
              '[/IF_MODE]',
              '[R18_BLOCK_START: 導入〜接触]',
              'R18専用シーンの構成区切り',
              '[R18_BLOCK_END]',
            ],
            keywords: ['IF_MODE', 'R18_BLOCK', '分岐', '一般用', 'R18', '出し分け', '記号'],
          },
          {
            title: '名前・呼び方・世界観の自動差し替え',
            body: '本文中に次の記号を入れておくと、キャラ設定やモード変更に合わせて自動で最新の言葉へ置き換わります。記号は覚えなくても、右パネルの「設定参照」タブ（キャラ／世界観）からクリックするだけで挿入できます。',
            codeLines: [
              '{{char_id.callPartner}}',
              '{{char_id.callPartner.target_id}}',
              '{{char_id.firstPerson}}',
              '{{world.old_library.name}}',
            ],
            keywords: ['自動差し替え', '変数', '設定参照', '一人称', '呼び方', '関係性', '世界観'],
          },
          {
            title: '高速校正タブ（自動チェック）',
            body: '「高速校正」タブでは、一人称のゆれ・カギ括弧「」や出し分け記号の閉じ忘れを自動でチェックします。マンガ脚本では「1フキダシ45文字超え」「1ページ8コマ超え」の目安も知らせてくれ、項目をクリックすると該当箇所へ移動できます。',
            keywords: ['校正', 'チェック', '括弧', '一人称', '45文字', '8コマ', 'ジャンプ', 'フキダシ'],
          },
        ],
      },
      {
        id: 'characters',
        title: 'キャラクター設定・項目の一括追加',
        shortLabel: 'キャラ設定',
        relatedScreen: 'character',
        icon: Users,
        entries: [
          {
            title: 'キャラクターの設定画像を登録して執筆中に確認する',
            body: '共通設定の一番上にある「キャラクター設定画像」では、立ち絵や表情差分・衣装メモなどを1キャラにつき最大6枚まで登録できます。クリックでの選択のほか、画像のドラッグ＆ドロップやコピーした画像の貼り付け（Ctrl+V / ⌘+V）にも対応し、自動で軽いサイズに調整してキャラ設定の中にまとめて保存されます。画像ごとに「共通」「一般用のみ」「R18専用」を分けられるほか、クリックで大きく拡大表示でき、執筆中の右パネル「設定参照」タブにも連動して表示されます。',
            keywords: ['設定画像', '立ち絵', '表情差分', '画像', 'ドラッグ', '貼り付け', '拡大', 'R18', '設定参照'],
          },
          {
            title: '共通の基本情報と一般／R18の切替項目',
            body: '名前・性別・年齢・一人称などの基本情報は上部の共通項目に入力します。一般用とR18用で内容が変わる項目（呼び方や口調など）は下部のモード別設定に登録してください。「一般値でロック」を使うと一時的に一般用の内容へ固定できます。',
            keywords: ['性別', '基本情報', '一人称', '呼び方', '相手別', '関係性', 'ロック', 'カテゴリ'],
          },
          {
            title: 'カスタム項目の追加・他キャラへの一括反映',
            body: '作品独自の項目を追加する際、追加先を「同じフォルダ内の全キャラ」や「全キャラクター」にするとまとめて追加できます。「今後の新規キャラにも自動追加」をオンにしておくと、これから作るキャラにも同じ項目が自動で並びます。入力欄の1行／複数行も項目ごとに切り替えられます。',
            keywords: ['一括追加', '新規キャラ', '自動追加', 'カスタム項目', '複数行', 'フォルダ'],
          },
          {
            title: '保存ファイル名の変更と個別保存',
            body: '画面上部でファイル名の変更、所属フォルダの移動、キャラクター1人分の設定ファイルの保存ができます。',
            keywords: ['ファイル名', 'フォルダ', '保存', 'ダウンロード'],
          },
        ],
      },
      {
        id: 'world-settings',
        title: '世界観設定・フォルダ整理・本文への差し込み',
        shortLabel: '世界観設定',
        relatedScreen: 'world',
        icon: Globe,
        entries: [
          {
            title: '舞台・アイテムの設定画像を登録して確認する',
            body: '「基本設定」の上部にある「設定画像」では、背景資料・間取り図・アイテム写真などを1つの設定につき最大6枚まで登録できます。クリックでの選択のほか、ドラッグ＆ドロップやコピーした画像の貼り付け（Ctrl+V / ⌘+V）にも対応し、自動で軽いサイズに調整して設定の中に保存されます。画像ごとの「共通」「一般用のみ」「R18専用」の出し分けや、クリックでの拡大表示も行えます。',
            keywords: ['設定画像', '背景', '間取り図', 'アイテム', '資料', 'ドラッグ', '貼り付け', '拡大', 'R18'],
          },
          {
            title: '舞台設定・アイテム設定の整理と移動',
            body: '左の「世界観」エリアでは、初期フォルダ「舞台設定」「アイテム設定」のほかに自由なフォルダを作って整理できます。左端のつまみ（⋮⋮）をドラッグすると、順番の並び替えや別フォルダへの移動ができます。',
            keywords: ['世界観', '舞台設定', 'アイテム設定', 'フォルダ', 'ドラッグ', '並び替え'],
          },
          {
            title: 'ひな形項目・関連キャラ・R18補足メモ',
            body: '基本情報のほか、「舞台用」「アイテム用」「組織・用語用」の項目セットや自由項目を追加できます。関わるキャラクターを紐付けたり、R18モードのときだけ表示される裏設定・補足メモを残すこともできます。',
            keywords: ['ひな形', 'プリセット', '関連キャラ', 'R18', '裏設定', 'メモ'],
          },
          {
            title: '執筆画面からの設定確認と差し込み',
            body: '右パネル「設定参照」タブを「世界観」に切り替えると、本文を書きながら設定内容や登録した設定画像（サムネイル切替・拡大表示）を確認でき、名称や概要をワンクリックで本文へ差し込めます。',
            keywords: ['設定参照', '差し込み', '名称', '概要', '設定画像', '拡大'],
          },
        ],
      },
      {
        id: 'plots-folders',
        title: 'プロット・ページ配分・フォルダ整理',
        shortLabel: 'プロットと整理',
        relatedScreen: 'plot',
        icon: FolderTree,
        entries: [
          {
            title: '3つの表示切替と想定文字数・想定ページ数',
            body: 'プロットは「箱書きタイムライン」「タイムラインチャート（自由配置＆矢印つなぎ）」「詳細編集カード」の3形式で切り替えられます。カードごとに「想定文字数」やマンガ用の「想定ページ数」を入れると、進捗バーや合計ページ数（4の倍数目安）が自動で表示されます。',
            keywords: ['プロット', 'タイムライン', 'チャート', 'カード', '想定ページ数', '想定文字数', '4の倍数', '台割'],
          },
          {
            title: '連携フォルダとシーン作成',
            body: 'プロット上部で「連携フォルダ」を設定しておくと、カードから紐付けるシーンを絞り込めます。カード上の「新規作成」からシーン作成と紐付けを同時に行え、別プロットへカードを移す際にシーンの保存先フォルダも一緒に移動できます。',
            keywords: ['連携フォルダ', '紐付け', '新規作成', '一括移動'],
          },
          {
            title: '左リストのフォルダ管理とドラッグ並び替え',
            body: '左のリストでは、シーン・キャラクター・世界観それぞれにフォルダを作って整理できます。各行の左端にあるつまみ（⋮⋮）をドラッグすると、表示順の並び替えやフォルダ間の移動が行えます。',
            keywords: ['ドラッグ', 'ドロップ', '並び替え', 'フォルダ', '順番'],
          },
        ],
      },
      {
        id: 'storage-history',
        title: '自動保存・自動バックアップ・書き出し',
        shortLabel: '保存と書き出し',
        icon: HardDrive,
        entries: [
          {
            title: '自動保存とPCフォルダへの同期',
            body: '編集した内容は数秒ごとにブラウザ内へ自動保存されます。Chrome や Edge で左上の「フォルダ連携」を使うと、PC上の選んだフォルダへ作品データ（キャラクター・世界観・プロット・シーン）をそのままファイルとして保存し続けられます。',
            keywords: ['保存', '自動保存', 'フォルダ連携', '同期', 'PC'],
          },
          {
            title: '1時間ごとの自動バックアップ（最大5件）',
            body: '変更があると1時間ごとに自動でバックアップを残します（古いものから最大5件まで自動で入れ替わります）。画面上部の「履歴」ボタンから、今すぐ手動で控えを残したり、過去の状態へ戻したりできます。',
            keywords: ['履歴', 'バックアップ', '復元', '戻す', '自動'],
          },
          {
            title: '用途に合わせた書き出し',
            body: '画面右上の「書き出し」メニューから、現在のモード（一般用／R18）に合わせた本文テキストを保存できます。マンガ脚本が含まれる作品では、同じメニューから「クリスタ写植用テキスト」「作画・ネーム共有用脚本」も開けます。',
            keywords: ['書き出し', '保存', 'テキスト', '一般用', 'R18', 'クリスタ', 'マンガ'],
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
            placeholder="キーワードで絞り込み（例: マンガ・台割・R18・履歴）"
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
