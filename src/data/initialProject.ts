import { DEFAULT_WORLD_FOLDERS, type ScenarioWorkspace } from '../types/scenario';

export const INITIAL_WORKSPACE: ScenarioWorkspace = {
  project: {
    title: '黄昏の図書室と、ふたりだけの栞',
    activeMode: 'general',
    chapters: [
      {
        chapterId: 'chapter_01',
        title: '第一章：放課後の境界線',
        plotId: 'plot_ch01',
        sceneIds: ['scene_01_library', 'scene_02_rooftop_alt', 'scene_03_bedroom_adult'],
      },
    ],
    worldFolders: [...DEFAULT_WORLD_FOLDERS],
  },
  characters: [
    {
      id: 'ren',
      filename: 'ren.json',
      shortName: '蓮',
      common: {
        name: '結城 蓮',
        ruby: 'ゆうき れん',
        firstPerson: '俺',
        ageDisplay: '高校二年生（17歳）',
        gender: '男性',
        relationship: '同じ図書委員の同級生',
        callPartner: '相沢さん',
        secondPerson: '君',
        speechStyle: '落ち着いた常体。少しぶっきらぼうだが誠実。',
        costume: '濃紺の冬服ブレザー',
        personality: '落ち着いていて観察眼があるが、栞のことになると少し不器用になる。',
        height: '175cm',
        weight: '62kg',
        bodyType: '細身・引き締まった体格',
        hobbies: '古書店巡り・ブラック珈琲を淹れること・深夜の読書',
      },
      dualFields: [],
      profiles: {
        general: {},
        adult: {},
      },
      lockedFields: [],
    },
    {
      id: 'shiori',
      filename: 'shiori.json',
      shortName: '栞',
      common: {
        name: '相沢 栞',
        ruby: 'あいざわ しおり',
        firstPerson: '私',
        ageDisplay: '高校二年生（17歳）',
        gender: '女性',
        relationship: '蓮と放課後の当番を組む図書委員',
        callPartner: '結城くん',
        secondPerson: 'あなた',
        speechStyle: '丁寧・やや控えめ（です・ます調）。照れると語尾が小さくなる。',
        costume: 'ベージュの制服カーディガン',
        personality: '普段は知的で控えめな優等生。信頼した相手の前でだけ感情が零れる。',
        height: '158cm',
        weight: '45kg',
        bodyType: '華奢・B82 / W56 / H83',
        hobbies: '押し花の栞作り・紅茶・雨の日の窓際で長編小説を読むこと',
      },
      dualFields: [],
      profiles: {
        general: {},
        adult: {},
      },
      lockedFields: [],
    },
  ],
  worldSettings: [
    {
      id: 'old_library',
      filename: 'old_library.json',
      folder: '舞台設定',
      name: '旧校舎の図書室',
      ruby: 'きゅうこうしゃのとしょしつ',
      summary: '放課後の西日が差し込む、静かな旧校舎二階の書架スペース。',
      details:
        '新校舎から渡り廊下で繋がる旧校舎二階にある図書室。天井が高く、奥の書架は人目が届きにくい。蓮と栞が図書委員として放課後の当番を務めている。',
      customFields: [
        {
          key: 'location',
          label: '場所・立地',
          value: '旧校舎2階・渡り廊下の突き当たり',
          multiline: false,
        },
        {
          key: 'atmosphere',
          label: '雰囲気・時間帯',
          value: '放課後の夕方。西日と古い紙の匂い、時折遠くから吹奏楽部の音が聞こえる。',
          multiline: true,
        },
      ],
      relatedCharacterIds: ['ren', 'shiori'],
      enableAdultNote: false,
      adultNote: '',
    },
    {
      id: 'pressed_flower_bookmark',
      filename: 'pressed_flower_bookmark.json',
      folder: 'アイテム設定',
      name: '古い押し花の栞',
      ruby: 'ふるいおしばなのしおり',
      summary: '栞が大切にしている、青い小花を閉じ込めた手作りの栞。',
      details:
        '透明なフィルムに青い小花と生成りのリボンを添えた栞。栞が中学の頃から使っており、蓮に貸した本に挟んだままになっていたことが二人の距離を縮めるきっかけになる。',
      customFields: [
        {
          key: 'appearance',
          label: '外観・形状',
          value: '透明フィルムに薄青い小花・生成りの細いリボン付き',
          multiline: false,
        },
        {
          key: 'origin',
          label: '由来・入手経緯',
          value: '栞の手作り。大切な本にだけ挟む習慣がある。',
          multiline: true,
        },
      ],
      relatedCharacterIds: ['shiori', 'ren'],
      enableAdultNote: false,
      adultNote: '',
    },
  ],
  plots: [
    {
      plotId: 'plot_ch01',
      filename: 'plot_ch01.json',
      chapterId: 'chapter_01',
      scope: 'chapter',
      title: '第一章：放課後の境界線（箱書き）',
      cards: [
        {
          cardId: 'card_01',
          order: 1,
          visibility: 'common',
          title: '夕暮れの図書室での蔵書整理',
          memo: '西日の差し込む書架の間で、二人の距離が縮まる導入シーン。モードによって呼び名と空気感が切り替わる。',
          linkedSceneId: 'scene_01_library',
          status: 'writing',
          characters: ['ren', 'shiori'],
          povCharacterId: 'ren',
          location: '図書室・奥の書架',
          timeOfDay: '放課後 / 夕方',
          mood: '穏やか・少し甘い',
          goal: '二人の距離感と図書委員としての日常を提示しつつ、モード別の関係性を描く',
          foreshadowing: '張る: 栞が大切にしている古い押し花の栞',
          branchCondition: '共通ルート',
          targetLength: 1500,
          assetNotes: '背景: 図書室(夕方) / BGM: 静かなピアノ曲',
        },
        {
          cardId: 'card_02',
          order: 2,
          visibility: 'general_alt',
          title: '屋上へ続く階段での会話（一般版ルート）',
          memo: '一般版では帰宅前の清々しい告白前夜の空気。栞が古びた栞紐を蓮に手渡す。',
          linkedSceneId: 'scene_02_rooftop_alt',
          status: 'review',
          characters: ['ren', 'shiori'],
          povCharacterId: 'ren',
          location: '夕焼けの渡り廊下',
          timeOfDay: '夕方',
          mood: '爽やか・切ない',
          goal: '押し花の栞を受け取り、次の再会の約束を取り付ける',
          foreshadowing: '回収: card_01で触れた押し花の栞を蓮へ託す',
          branchCondition: '一般モード限定分岐',
          targetLength: 1200,
          assetNotes: '背景: 渡り廊下(夕景) / SE: 遠景のチャイム・風の音',
        },
        {
          cardId: 'card_03',
          order: 3,
          visibility: 'adult_only',
          title: '鍵を閉めた部屋での密会（R18専用ルート）',
          memo: '一般版ではカットされる成人向け親密シーン。呼び方が「蓮さん」になり、衣装も部屋着へ。',
          linkedSceneId: 'scene_03_bedroom_adult',
          status: 'draft',
          characters: ['ren', 'shiori'],
          povCharacterId: 'ren',
          location: '自室の書斎（間接照明）',
          timeOfDay: '深夜',
          mood: '親密・背徳',
          goal: '二人の親密な関係性を描き、心情の距離を完全に縮める',
          foreshadowing: '翌朝の余韻シーンへ接続',
          branchCondition: 'R18モード専用 / 親密度条件あり',
          targetLength: 2500,
          assetNotes: '背景: 書斎(夜・間接照明) / スチル(CG)差分2枚予定',
        },
        {
          cardId: 'card_04',
          order: 4,
          visibility: 'common',
          title: '翌朝の約束（未執筆メモ）',
          memo: '次の章へ続く伏線。二人が同じ文庫本の続きを借りに行くシーンを追加予定。',
          linkedSceneId: '',
          status: 'todo',
          characters: ['ren', 'shiori'],
          povCharacterId: 'shiori',
          location: '登校路〜昇降口',
          timeOfDay: '朝',
          mood: '日常・期待感',
          goal: '第二章の休日の約束を取り付け、次章への引きを作る',
          foreshadowing: '張る: 同じ文庫本の貸出カードに並んだ二人の名前',
          branchCondition: '共通ルート（次章接続）',
          targetLength: 1800,
          assetNotes: '背景: 通学路(朝) / 立ち絵: 栞(笑顔・照れ)',
        },
      ],
    },
  ],
  scenes: [
    {
      sceneId: 'scene_01_library',
      filename: 'scene_01_library.md',
      title: '放課後の図書室',
      visibility: 'common',
      characters: ['ren', 'shiori'],
      body: `――西日が書架の隙間から長く伸びて、古い紙の匂いを温めていた。

[IF_MODE: general]
放課後の図書室に残っているのは、当番の{{ren.firstPerson}}と{{shiori.name}}だけだ。
[/IF_MODE]
[IF_MODE: adult]
閉館後の資料室に鍵を掛け、ふたりきりになった静寂が甘く肌を撫でる。
[/IF_MODE]

栞「あの、{{shiori.callPartner}}。高い棚の整理、手伝ってくれてありがとうございます」
蓮「気にするな、{{shiori.callPartner}}……いや、{{ren.callPartner}}の背丈じゃ届かないだろ」
栞「むぅ……{{shiori.firstPerson}}だって、踏み台があれば届きます」

[IF_MODE: general]
そう言いながらも、{{shiori.name}}は少しだけ頬を染めて、抱えていたハードカバーを胸に寄せた。
栞「でも、こうして{{shiori.callPartner}}と二人で閉め作業をするの、なんだか落ち着きますね」
[/IF_MODE]
[IF_MODE: adult]
踏み台を降りた{{shiori.name}}の袖口を、{{ren.firstPerson}}は思わず軽く引き寄せていた。
栞「っ……{{shiori.callPartner}}？　だめですよ、まだ窓の外が明るいのに……」
蓮「誰も見てない。お前の声が聞こえる距離にいたいだけだ」
[/IF_MODE]`,
    },
    {
      sceneId: 'scene_02_rooftop_alt',
      filename: 'scene_02_rooftop_alt.md',
      title: '夕焼けの渡り廊下（一般版差し替え）',
      visibility: 'general_alt',
      characters: ['ren', 'shiori'],
      body: `チャイムが鳴り終わり、校舎の隅に澄んだ夜気の前触れが漂い始める。
衣装は{{shiori.costume}}のまま、{{shiori.name}}は鞄から小さな押し花の栞を取り出した。

栞「{{shiori.callPartner}}、これ。さっきの本に挟まってた忘れ物……じゃなくて、{{shiori.firstPerson}}からの御礼です」
蓮「いいのか？　ずいぶん大事にしてたやつだろ」
栞「はい。{{shiori.callPartner}}が続きを読んでくれるなら、その方が嬉しいです」

風の音に紛れて、彼女の言葉はやけに真っ直ぐ{{ren.firstPerson}}の胸に届いた。`,
    },
    {
      sceneId: 'scene_03_bedroom_adult',
      filename: 'scene_03_bedroom_adult.md',
      title: '夜更けの書斎（R18専用）',
      visibility: 'adult_only',
      characters: ['ren', 'shiori'],
      body: `[R18_BLOCK_START: 導入〜接触]
部屋の明かりを間接照明だけに落とすと、{{shiori.costume}}越しの肩のラインが柔らかく浮かび上がる。
年齢も立場も関係ない夜。今のふたりはただの{{shiori.relationship}}だ。

栞「……{{shiori.callPartner}}、こっちに来て。今夜は、どこにも行かないで」
蓮「ああ。{{ren.callPartner}}が望むなら、朝まで離さない」
栞「ん……っ、指先が冷たいのに、触られるとすごく熱い……あたしも、もっと触れたいよ」
[R18_BLOCK_END]

[R18_BLOCK_START: 絶頂〜余韻]
シーツの擦れる音と、途切れがちな吐息だけが暗い部屋を満たしていく。
栞「{{shiori.callPartner}}……{{shiori.firstPerson}}の名前、もう一回呼んで……」
蓮「……{{ren.callPartner}}」
[R18_BLOCK_END]`,
    },
  ],
};

export type ProjectTemplateType = 'minimal' | 'kishotenketsu' | 'sample';

export interface CreateWorkspaceOptions {
  title: string;
  template?: ProjectTemplateType;
  activeMode?: 'general' | 'adult';
}

function cloneWorkspace(ws: ScenarioWorkspace): ScenarioWorkspace {
  if (typeof structuredClone === 'function') {
    return structuredClone(ws);
  }
  return JSON.parse(JSON.stringify(ws)) as ScenarioWorkspace;
}

export function createWorkspaceFromTemplate({
  title,
  template = 'minimal',
  activeMode = 'general',
}: CreateWorkspaceOptions): ScenarioWorkspace {
  const cleanTitle = title.trim() || '無題のプロジェクト';

  if (template === 'sample') {
    const cloned = cloneWorkspace(INITIAL_WORKSPACE);
    return {
      ...cloned,
      project: {
        ...cloned.project,
        title: cleanTitle,
        activeMode,
        characterFolders: cloned.project.characterFolders ?? [],
        worldFolders: cloned.project.worldFolders ?? [...DEFAULT_WORLD_FOLDERS],
        sceneFolders: cloned.project.sceneFolders ?? [],
      },
    };
  }

  if (template === 'kishotenketsu') {
    const plotId = 'plot_01';
    const beats = [
      { id: 'scene_01', cardId: 'card_01', title: '起：導入・日常', memo: '舞台・登場人物・日常の導入を描くシーン。' },
      { id: 'scene_02', cardId: 'card_02', title: '承：展開・変化', memo: '出来事や関係性が動き始める展開シーン。' },
      { id: 'scene_03', cardId: 'card_03', title: '転：山場・転換', memo: '最大の転機・葛藤・クライマックスを迎えるシーン。' },
      { id: 'scene_04', cardId: 'card_04', title: '結：結末・余韻', memo: '決着と余韻を描く締めくくりのシーン。' },
    ];

    return {
      project: {
        title: cleanTitle,
        activeMode,
        chapters: [
          {
            chapterId: 'chapter_01',
            title: '第一章',
            plotId,
            sceneIds: beats.map((b) => b.id),
          },
        ],
        characterFolders: [],
        worldFolders: [...DEFAULT_WORLD_FOLDERS],
        sceneFolders: [],
      },
      characters: [],
      worldSettings: [],
      plots: [
        {
          plotId,
          filename: 'plot_01.json',
          chapterId: 'chapter_01',
          scope: 'chapter',
          title: '第一章（起承転結プロット）',
          cards: beats.map((b, idx) => ({
            cardId: b.cardId,
            order: idx + 1,
            visibility: 'common',
            title: b.title,
            memo: b.memo,
            linkedSceneId: b.id,
            status: 'todo',
            characters: [],
          })),
        },
      ],
      scenes: beats.map((b) => ({
        sceneId: b.id,
        filename: `${b.id}.md`,
        title: b.title,
        visibility: 'common',
        characters: [],
        body: '',
      })),
    };
  }

  const sceneId = 'scene_01';
  const plotId = 'plot_01';
  return {
    project: {
      title: cleanTitle,
      activeMode,
      chapters: [
        {
          chapterId: 'chapter_01',
          title: '第一章',
          plotId,
          sceneIds: [sceneId],
        },
      ],
      characterFolders: [],
      worldFolders: [...DEFAULT_WORLD_FOLDERS],
      sceneFolders: [],
    },
    characters: [],
    worldSettings: [],
    plots: [
      {
        plotId,
        filename: 'plot_01.json',
        chapterId: 'chapter_01',
        scope: 'chapter',
        title: '第一章（プロット）',
        cards: [
          {
            cardId: 'card_01',
            order: 1,
            visibility: 'common',
            title: 'シーン 1',
            memo: '',
            linkedSceneId: sceneId,
            status: 'todo',
            characters: [],
          },
        ],
      },
    ],
    scenes: [
      {
        sceneId,
        filename: 'scene_01.md',
        title: 'シーン 1',
        visibility: 'common',
        characters: [],
        body: '',
      },
    ],
  };
}

export function createBlankWorkspace(title: string): ScenarioWorkspace {
  return createWorkspaceFromTemplate({ title, template: 'minimal', activeMode: 'general' });
}


