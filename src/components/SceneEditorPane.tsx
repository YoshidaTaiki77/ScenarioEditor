import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlignJustify,
  BookOpen,
  ChevronDown,
  Columns2,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Image as ImageIcon,
  ImagePlus,
  LayoutPanelTop,
  Maximize2,
  Minimize2,
  PanelBottom,
  PanelRight,
  Users,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  PlotData,
  ProjectData,
  ReferenceImage,
  SceneData,
  VisibilityType,
  WorldSettingData,
} from '../types/scenario';
import {
  MAX_SCENE_IMAGES,
  compressImageFileToDataUrl,
  deriveImageLabelFromFilename,
  filterReferenceImagesForMode,
  formatSceneImageTag,
} from '../utils/imageUtils';
import {
  compileSceneText,
  findPreviousSpeakerPrefix,
} from '../utils/scenarioEngine';
import {
  parseMangaMarkdown,
  serializeMangaMarkdown,
} from '../utils/mangaEngine';
import { PlotBoard, type MoveCardPosition } from './PlotBoard';
import {
  MangaScriptEditorPane,
  type MangaScriptEditorHandle,
} from './MangaScriptEditorPane';
import {
  RichScenePreview,
  SceneImageTray,
  type SceneImageTrayTab,
} from './SceneImageComponents';

export interface SceneEditorHandle {
  jumpToLine: (line: number) => void;
  insertAtCursor: (text: string, placeCaretBefore?: string) => void;
}

interface SceneEditorPaneProps {
  project: ProjectData;
  scene: SceneData;
  allScenes: SceneData[];
  sceneFolders: string[];
  characters: CharacterData[];
  worldSettings?: WorldSettingData[];
  activePlot?: PlotData;
  allPlots?: PlotData[];
  activeMode: ActiveMode;
  splitView: boolean;
  onToggleSplitView: () => void;
  verticalWriting: boolean;
  onToggleVerticalWriting: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onUpdateScene: (updated: SceneData) => void;
  onMoveSceneToFolder: (sceneId: string, folder?: string) => void;
  onUpdatePlot: (updated: PlotData) => void;
  onAssignSceneToCard: (plotId: string, cardId: string, sceneId: string) => void;
  onCreateSceneAndLink?: (plotId: string, cardId: string) => void;
  onMoveScenesToFolder?: (sceneIds: string[], targetFolder: string) => void;
  onMoveCardToPlot: (
    sourcePlotId: string,
    targetPlotId: string,
    cardId: string,
    options: {
      position: MoveCardPosition;
      openTargetPlot: boolean;
      moveLinkedSceneToTargetFolder?: boolean;
    }
  ) => void;
  onSelectSplitPlot?: (plotId: string) => void;
  onOpenScene: (sceneId: string) => void;
  onCursorChange: (cursorIndex: number) => void;
  onOpenMangaExport: (tab?: 'csp' | 'script') => void;
}

export const SceneEditorPane = forwardRef<SceneEditorHandle, SceneEditorPaneProps>(
  (
    {
      project,
      scene,
      allScenes,
      sceneFolders,
      characters,
      worldSettings = [],
      activePlot,
      allPlots,
      activeMode,
      splitView,
      onToggleSplitView,
      verticalWriting,
      onToggleVerticalWriting,
      focusMode,
      onToggleFocusMode,
      onUpdateScene,
      onMoveSceneToFolder,
      onUpdatePlot,
      onAssignSceneToCard,
      onCreateSceneAndLink,
      onMoveScenesToFolder,
      onMoveCardToPlot,
      onSelectSplitPlot,
      onOpenScene,
      onCursorChange,
      onOpenMangaExport,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mangaEditorRef = useRef<MangaScriptEditorHandle>(null);
    const charDropdownRef = useRef<HTMLDivElement>(null);
    const imageInsertMenuRef = useRef<HTMLDivElement>(null);
    const quickImageInputRef = useRef<HTMLInputElement>(null);
    const [showPreview, setShowPreview] = useState(true);
    const [previewLayout, setPreviewLayout] = useState<'bottom' | 'right'>('bottom');
    const [showImageTray, setShowImageTray] = useState(false);
    const [imageTrayTab, setImageTrayTab] = useState<SceneImageTrayTab>('scene');
    const [showImageInsertMenu, setShowImageInsertMenu] = useState(false);
    const [showCharDropdown, setShowCharDropdown] = useState(false);
    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [imageErrorMsg, setImageErrorMsg] = useState<string | null>(null);

    // Floating Tab Speaker Popup state
    const [speakerPopupOpen, setSpeakerPopupOpen] = useState(false);
    const [speakerPopupIndex, setSpeakerPopupIndex] = useState(0);
    const [speakerInsertPos, setSpeakerInsertPos] = useState(0);

    const isAdult = activeMode === 'adult';
    const isManga = scene.format === 'manga';
    const sceneImages = scene.images ?? [];

    const availableLibraryImageCount = useMemo(() => {
      let count = 0;
      for (const c of characters) {
        count += filterReferenceImagesForMode(c.images, activeMode).length;
      }
      for (const w of worldSettings) {
        count += filterReferenceImagesForMode(w.images, activeMode).length;
      }
      return count;
    }, [characters, worldSettings, activeMode]);

    useEffect(() => {
      setImageErrorMsg(null);
      setIsDraggingImage(false);
      setShowImageInsertMenu(false);
    }, [scene.sceneId]);

    useEffect(() => {
      if (!showImageInsertMenu) return;
      const handleOutside = (e: MouseEvent) => {
        if (
          imageInsertMenuRef.current &&
          !imageInsertMenuRef.current.contains(e.target as Node)
        ) {
          setShowImageInsertMenu(false);
        }
      };
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setShowImageInsertMenu(false);
      };
      document.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleEsc);
      return () => {
        document.removeEventListener('mousedown', handleOutside);
        window.removeEventListener('keydown', handleEsc);
      };
    }, [showImageInsertMenu]);

    // Participating characters ordered first, then others
    const orderedCharacters = useMemo(() => {
      const participating = characters.filter((c) => scene.characters.includes(c.id));
      const others = characters.filter((c) => !scene.characters.includes(c.id));
      return [...participating, ...others];
    }, [characters, scene.characters]);

    const compiledPreview = useMemo(
      () =>
        compileSceneText(
          scene.body,
          characters,
          activeMode,
          {
            stripStructureMarkers: false,
            stripImageTags: false,
          },
          worldSettings
        ),
      [scene.body, characters, activeMode, worldSettings]
    );

    const charCount = useMemo(
      () =>
        compileSceneText(
          scene.body,
          characters,
          activeMode,
          {
            stripStructureMarkers: true,
            stripImageTags: true,
          },
          worldSettings
        ).replace(/\s+/g, '').length,
      [scene.body, characters, activeMode, worldSettings]
    );

    const buildBodyWithInsertedBlock = (
      body: string,
      block: string,
      startPos: number,
      endPos: number
    ): { nextBody: string; nextCaret: number } => {
      const before = body.slice(0, startPos);
      const after = body.slice(endPos);
      const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
      const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
      const insertion = `${needsLeadingNewline ? '\n' : ''}${block}${needsTrailingNewline ? '\n' : ''}`;
      return {
        nextBody: before + insertion + after,
        nextCaret: startPos + insertion.length,
      };
    };

    const insertImageTagAtCursor = (tagBlock: string) => {
      if (isManga) {
        mangaEditorRef.current?.insertAtCursor(tagBlock);
        return;
      }
      const el = textareaRef.current;
      const start = el ? el.selectionStart : scene.body.length;
      const end = el ? el.selectionEnd : scene.body.length;
      const { nextBody, nextCaret } = buildBodyWithInsertedBlock(scene.body, tagBlock, start, end);
      onUpdateScene({ ...scene, body: nextBody });
      if (!showPreview) setShowPreview(true);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
        onCursorChange(nextCaret);
      });
    };

    const handleQuickUploadAndInsert = async (fileList: File[] | FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setImageErrorMsg(null);

      if (sceneImages.length >= MAX_SCENE_IMAGES) {
        setImageErrorMsg(`シーン画像は1シーンにつき最大${MAX_SCENE_IMAGES}枚まで登録できます。`);
        return;
      }

      const slots = MAX_SCENE_IMAGES - sceneImages.length;
      const toProcess = files.slice(0, slots);
      const skippedByLimit = files.length - toProcess.length;

      setIsUploadingImage(true);
      try {
        const created: ReferenceImage[] = [];
        const errors: string[] = [];

        for (let i = 0; i < toProcess.length; i++) {
          const f = toProcess[i];
          try {
            const compressed = await compressImageFileToDataUrl(f);
            created.push({
              id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              dataUrl: compressed.dataUrl,
              label: deriveImageLabelFromFilename(f.name, sceneImages.length + created.length + 1),
              visibility: isAdult ? 'adult_only' : 'common',
              width: compressed.width,
              height: compressed.height,
              createdAt: new Date().toISOString(),
            });
          } catch (err) {
            errors.push(err instanceof Error ? err.message : '画像の読み込みに失敗しました。');
          }
        }

        if (created.length > 0) {
          const nextImages = [...sceneImages, ...created];
          const tagsBlock = created
            .map((img) => formatSceneImageTag(img.id, img.label))
            .join('\n');

          if (isManga) {
            onUpdateScene({ ...scene, images: nextImages });
            // Insert tag on next frame after images state commits
            requestAnimationFrame(() => {
              mangaEditorRef.current?.insertAtCursor(tagsBlock);
            });
          } else {
            const el = textareaRef.current;
            const start = el ? el.selectionStart : scene.body.length;
            const end = el ? el.selectionEnd : scene.body.length;
            const { nextBody, nextCaret } = buildBodyWithInsertedBlock(
              scene.body,
              tagsBlock,
              start,
              end
            );
            onUpdateScene({ ...scene, body: nextBody, images: nextImages });
            if (!showPreview) setShowPreview(true);
            requestAnimationFrame(() => {
              if (!textareaRef.current) return;
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(nextCaret, nextCaret);
              onCursorChange(nextCaret);
            });
          }
        }

        if (errors.length > 0) {
          setImageErrorMsg(errors[0]);
        } else if (skippedByLimit > 0) {
          setImageErrorMsg(
            `上限（最大${MAX_SCENE_IMAGES}枚）に達したため、${skippedByLimit}枚は追加されませんでした。`
          );
        }
      } finally {
        setIsUploadingImage(false);
      }
    };

    useImperativeHandle(ref, () => ({
      jumpToLine: (line: number) => {
        if (isManga) {
          mangaEditorRef.current?.jumpToLine(line);
          return;
        }
        const el = textareaRef.current;
        if (!el) return;
        const lines = scene.body.split('\n');
        const targetIdx = Math.max(0, Math.min(line - 1, lines.length - 1));
        let offset = 0;
        for (let i = 0; i < targetIdx; i++) {
          offset += lines[i].length + 1;
        }
        el.focus();
        el.setSelectionRange(offset, offset + (lines[targetIdx]?.length ?? 0));
        // Scroll approximately to line
        const approxRatio = lines.length > 1 ? targetIdx / lines.length : 0;
        el.scrollTop = Math.max(0, approxRatio * el.scrollHeight - el.clientHeight * 0.3);
        onCursorChange(offset);
      },
      insertAtCursor: (text: string, placeCaretBefore?: string) => {
        if (text.trim().startsWith('[IMG:')) {
          insertImageTagAtCursor(text.trim());
          return;
        }
        if (isManga) {
          mangaEditorRef.current?.insertAtCursor(text, placeCaretBefore);
          return;
        }
        const el = textareaRef.current;
        const start = el ? el.selectionStart : scene.body.length;
        const end = el ? el.selectionEnd : scene.body.length;
        const nextBody = scene.body.slice(0, start) + text + scene.body.slice(end);
        onUpdateScene({ ...scene, body: nextBody });
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.focus();
          let nextPos = start + text.length;
          if (placeCaretBefore) {
            const idx = text.lastIndexOf(placeCaretBefore);
            if (idx !== -1) nextPos = start + idx;
          }
          textareaRef.current.setSelectionRange(nextPos, nextPos);
          onCursorChange(nextPos);
        });
      },
    }));

    const syncCursor = () => {
      const el = textareaRef.current;
      if (!el) return;
      onCursorChange(el.selectionStart);
    };

    const insertSpeakerDialogue = (charPrefix: string, atIndex: number, addNewlineBefore = false) => {
      const prefix = addNewlineBefore ? `\n${charPrefix}「` : `${charPrefix}「`;
      const snippet = `${prefix}」`;
      const nextBody = scene.body.slice(0, atIndex) + snippet + scene.body.slice(atIndex);
      const caretInsideBrackets = atIndex + prefix.length;

      onUpdateScene({ ...scene, body: nextBody });
      setSpeakerPopupOpen(false);

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caretInsideBrackets, caretInsideBrackets);
        onCursorChange(caretInsideBrackets);
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = textareaRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      // Popup keyboard navigation
      if (speakerPopupOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSpeakerPopupIndex((i) => (i + 1) % orderedCharacters.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSpeakerPopupIndex(
            (i) => (i - 1 + orderedCharacters.length) % orderedCharacters.length
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const chosen = orderedCharacters[speakerPopupIndex];
          if (chosen) {
            insertSpeakerDialogue(chosen.shortName, speakerInsertPos, false);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSpeakerPopupOpen(false);
          return;
        }
      }

      // 1. Line-start Tab -> Show speaker picker popup
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const lineStart = scene.body.lastIndexOf('\n', start - 1) + 1;
        const textBeforeCaretOnLine = scene.body.slice(lineStart, start);
        if (textBeforeCaretOnLine.trim() === '' && start === end) {
          e.preventDefault();
          setSpeakerInsertPos(start);
          setSpeakerPopupIndex(0);
          setSpeakerPopupOpen(true);
          return;
        }
      }

      // 2. Ctrl/Cmd + Enter -> Repeat previous speaker's 「」
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const prevSpeaker =
          findPreviousSpeakerPrefix(scene.body, start) ??
          orderedCharacters[0]?.shortName ??
          '';
        if (!prevSpeaker) return;

        const lineStart = scene.body.lastIndexOf('\n', start - 1) + 1;
        const lineEndRaw = scene.body.indexOf('\n', start);
        const lineEnd = lineEndRaw === -1 ? scene.body.length : lineEndRaw;
        const currentLineText = scene.body.slice(lineStart, lineEnd);

        if (currentLineText.trim() === '') {
          insertSpeakerDialogue(prevSpeaker, start, false);
        } else {
          // Jump to end of current line and insert newline + speaker「」
          insertSpeakerDialogue(prevSpeaker, lineEnd, true);
        }
        return;
      }

      // 3. Pressing Enter directly before 」 jumps past 」 and inserts a newline
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        start === end &&
        scene.body[start] === '」'
      ) {
        e.preventDefault();
        const afterBracket = start + 1;
        const nextBody =
          scene.body.slice(0, afterBracket) + '\n' + scene.body.slice(afterBracket);
        onUpdateScene({ ...scene, body: nextBody });
        const nextCaret = afterBracket + 1;
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCaret, nextCaret);
          onCursorChange(nextCaret);
        });
      }
    };

    const toggleCharacterInScene = (charId: string) => {
      const exists = scene.characters.includes(charId);
      const next = exists
        ? scene.characters.filter((id) => id !== charId)
        : [...scene.characters, charId];
      onUpdateScene({ ...scene, characters: next });
    };

    const handleSwitchSceneFormat = (nextFormat: 'prose' | 'manga') => {
      if (nextFormat === 'manga') {
        if (scene.format === 'manga') return;
        const hasMangaStructure = /^##\s+P\d+/m.test(scene.body);
        const nextBody = hasMangaStructure
          ? scene.body
          : serializeMangaMarkdown(parseMangaMarkdown(scene.body));
        onUpdateScene({
          ...scene,
          format: 'manga',
          mangaBinding: scene.mangaBinding ?? 'rtl',
          mangaStartPage: scene.mangaStartPage ?? 1,
          body: nextBody,
        });
      } else {
        if (scene.format !== 'manga') return;
        onUpdateScene({
          ...scene,
          format: undefined,
        });
      }
    };

    // Close popups on scene switch
    useEffect(() => {
      setSpeakerPopupOpen(false);
      setShowCharDropdown(false);
    }, [scene.sceneId]);

    // Close character dropdown on outside click
    useEffect(() => {
      if (!showCharDropdown) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (charDropdownRef.current && !charDropdownRef.current.contains(e.target as Node)) {
          setShowCharDropdown(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCharDropdown]);

    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
        {/* Scene Toolbar (2-Row @container-responsive layout with wrap protection) */}
        <div className="shrink-0 border-b border-slate-200 bg-white">
          {/* Row 1: Scene Title + Format Switch + Focus Mode */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 @xl:px-4 py-1.5">
            <div className="min-w-[140px] flex-1">
              <input
                type="text"
                aria-label="シーンタイトル"
                value={scene.title}
                onChange={(e) => onUpdateScene({ ...scene, title: e.target.value })}
                placeholder="シーンタイトル"
                className="w-full min-w-0 rounded border border-transparent px-1.5 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:bg-slate-50/60 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 max-w-full">
              {/* Format Toggle: Prose <-> Manga Script */}
              <div
                role="group"
                aria-label="シーン形式の切替"
                className="flex items-center rounded border border-slate-200 bg-slate-100 p-0.5 max-w-full"
              >
                <button
                  type="button"
                  onClick={() => handleSwitchSceneFormat('prose')}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    !isManga
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span>ノベル</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchSceneFormat('manga')}
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    isManga
                      ? isAdult
                        ? 'bg-rose-700 text-white shadow-2xs'
                        : 'bg-slate-800 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutPanelTop className="h-3 w-3 shrink-0" />
                  <span>マンガ脚本</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onToggleFocusMode}
                title="左右ペインを隠して執筆に集中 (Escで解除)"
                className={`flex items-center gap-1 rounded border px-2 @lg:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  focusMode
                    ? isAdult
                      ? 'border-rose-700 bg-rose-700 text-white'
                      : 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {focusMode ? (
                  <Minimize2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="hidden @md:inline">
                  {focusMode ? 'フォーカス解除' : 'フォーカス'}
                </span>
                <span className="@md:hidden">{focusMode ? '解除' : '集中'}</span>
              </button>
            </div>
          </div>

          {/* Row 2: Scene Metadata (Left) + Workspace View Toggles (Right) */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-slate-100 bg-slate-50/50 px-3 @xl:px-4 py-1.5">
            {/* Metadata Controls */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
              <select
                value={scene.visibility}
                aria-label="シーンの公開区分"
                onChange={(e) =>
                  onUpdateScene({
                    ...scene,
                    visibility: e.target.value as VisibilityType,
                  })
                }
                className={`max-w-full rounded border px-2 py-1 text-xs font-medium focus:outline-none ${
                  scene.visibility === 'adult_only'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : scene.visibility === 'general_alt'
                      ? 'border-slate-300 bg-slate-100 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <option value="common">共通 (common)</option>
                <option value="general_alt">一般差替 (general_alt)</option>
                <option value="adult_only">R18専用 (adult_only)</option>
              </select>

              <label
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 min-w-0 max-w-full"
                title="保存先フォルダを変更"
              >
                <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <select
                  value={scene.folder ?? ''}
                  aria-label="シーンの保存先フォルダ"
                  onChange={(e) => onMoveSceneToFolder(scene.sceneId, e.target.value || undefined)}
                  className="min-w-0 max-w-[130px] @lg:max-w-[180px] truncate bg-transparent text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">scenes/ (直下)</option>
                  {sceneFolders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}/
                    </option>
                  ))}
                </select>
              </label>

              <div className="relative" ref={charDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCharDropdown((v) => !v)}
                  className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>登場 ({scene.characters.length})</span>
                </button>
                {showCharDropdown && (
                  <div className="absolute left-0 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg z-30">
                    <div className="mb-1.5 text-[11px] font-medium text-slate-500">
                      このシーンの登場キャラクター
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {characters.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={scene.characters.includes(c.id)}
                            onChange={() => toggleCharacterInScene(c.id)}
                          />
                          <span className="truncate">{c.common.name}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCharDropdown(false)}
                      className="mt-2 w-full rounded bg-slate-100 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                    >
                      閉じる
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Workspace View Toggles */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
              <input
                ref={quickImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleQuickUploadAndInsert(e.target.files);
                  }
                  e.target.value = '';
                }}
              />

              {/* Unified Image Insert Dropdown (案①) */}
              <div className="relative" ref={imageInsertMenuRef}>
                <button
                  type="button"
                  disabled={isUploadingImage}
                  onClick={() => setShowImageInsertMenu((v) => !v)}
                  title="PCから画像追加、またはキャラ・世界観の登録済み画像をカーソル行へ引用挿入"
                  className={`flex items-center gap-1 rounded border px-2 @lg:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-45 ${
                    showImageInsertMenu
                      ? isAdult
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-slate-300 bg-slate-100 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <ImagePlus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>{isUploadingImage ? '挿入中...' : '画像挿入'}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                </button>

                {showImageInsertMenu && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg z-30 space-y-0.5">
                    <button
                      type="button"
                      disabled={sceneImages.length >= MAX_SCENE_IMAGES}
                      onClick={() => {
                        setShowImageInsertMenu(false);
                        quickImageInputRef.current?.click();
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50 disabled:opacity-45"
                    >
                      <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-800">
                          PCから画像を追加して挿入
                        </div>
                        <div className="text-[10px] text-slate-400">
                          ファイル選択（残り {Math.max(0, MAX_SCENE_IMAGES - sceneImages.length)}/{MAX_SCENE_IMAGES}枚）
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowImageInsertMenu(false);
                        setImageTrayTab('library');
                        setShowImageTray(true);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-slate-800">
                            キャラ・世界観から引用挿入
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-code text-[10px] text-slate-600 tabular-nums">
                            {availableLibraryImageCount}枚
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          登録済みの設定画像を容量増加なしで挿入
                        </div>
                      </div>
                    </button>

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowImageInsertMenu(false);
                        setImageTrayTab('scene');
                        setShowImageTray(true);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>このシーンの画像を管理</span>
                      </span>
                      <span className="font-code text-[10px] text-slate-400 tabular-nums">
                        {sceneImages.length}/{MAX_SCENE_IMAGES}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!showImageTray && sceneImages.length === 0 && availableLibraryImageCount > 0) {
                    setImageTrayTab('library');
                  }
                  setShowImageTray((v) => !v);
                }}
                title="シーン画像・引用画像トレイを開閉"
                className={`flex items-center gap-1 rounded border px-2 @lg:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  showImageTray
                    ? isAdult
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-slate-300 bg-slate-100 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>
                  画像管理{sceneImages.length > 0 ? ` (${sceneImages.length})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleSplitView}
                title="プロットボードを並べて2分割表示"
                className={`flex items-center gap-1.5 rounded border px-2 @lg:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  splitView
                    ? isAdult
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-slate-300 bg-slate-100 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Columns2 className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden @lg:inline">2分割プロット</span>
                <span className="@lg:hidden">2分割</span>
              </button>

              {!isManga && (
                <>
                  <button
                    type="button"
                    onClick={onToggleVerticalWriting}
                    title={verticalWriting ? '横書きに切替' : '縦書きに切替'}
                    className={`flex items-center gap-1.5 rounded border px-2 @lg:px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      verticalWriting
                        ? isAdult
                          ? 'border-rose-300 bg-rose-50 text-rose-800'
                          : 'border-slate-300 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {verticalWriting ? (
                      <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlignJustify className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{verticalWriting ? '縦書き' : '横書き'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    title={showPreview ? 'プレビューを非表示' : 'プレビューを表示'}
                    className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 @lg:px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {showPreview ? (
                      <Eye className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>プレビュー</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Scene Image Tray */}
        {showImageTray && (
          <SceneImageTray
            scene={scene}
            characters={characters}
            worldSettings={worldSettings}
            activeMode={activeMode}
            activeTab={imageTrayTab}
            onChangeActiveTab={setImageTrayTab}
            onUpdateSceneImages={(nextImages) =>
              onUpdateScene({
                ...scene,
                images: nextImages.length > 0 ? nextImages : undefined,
              })
            }
            onInsertImageTag={insertImageTagAtCursor}
            onClose={() => setShowImageTray(false)}
          />
        )}

        {/* Quick upload error banner */}
        {imageErrorMsg && (
          <div className="flex items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-[11px] text-rose-800">
            <span className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span className="truncate">{imageErrorMsg}</span>
            </span>
            <button
              type="button"
              onClick={() => setImageErrorMsg(null)}
              aria-label="エラーを閉じる"
              className="rounded p-0.5 text-rose-500 hover:bg-rose-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Main Split Container (Optional Plot Left/Top + Script Right/Bottom) */}
        <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row overflow-hidden">
          {splitView && activePlot && (
            <div className="h-[42%] min-h-[200px] w-full shrink-0 border-b border-slate-200 overflow-hidden @3xl:h-auto @3xl:min-h-0 @3xl:w-[38%] @3xl:min-w-[260px] @3xl:max-w-[440px] @3xl:border-b-0 @3xl:border-r">
              <PlotBoard
                plot={activePlot}
                allPlots={allPlots}
                scenes={allScenes}
                sceneFolders={sceneFolders}
                characters={characters}
                activeMode={activeMode}
                compact
                onUpdatePlot={onUpdatePlot}
                onAssignSceneToCard={onAssignSceneToCard}
                onCreateSceneAndLink={onCreateSceneAndLink}
                onMoveScenesToFolder={onMoveScenesToFolder}
                onMoveCardToPlot={onMoveCardToPlot}
                onSelectSplitPlot={onSelectSplitPlot}
                onOpenScene={onOpenScene}
              />
            </div>
          )}

          {isManga ? (
            <MangaScriptEditorPane
              ref={mangaEditorRef}
              project={project}
              scene={scene}
              characters={characters}
              worldSettings={worldSettings}
              activeMode={activeMode}
              onUpdateScene={onUpdateScene}
              onCursorChange={onCursorChange}
              onOpenMangaExport={onOpenMangaExport}
            />
          ) : (
          /* Editor + Live Preview Column */
          <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
            {/* Typing Shortcut Hint Bar */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 @xl:px-4 py-1 text-[11px] text-slate-500">
              <span className="@xl:hidden truncate text-[10px] text-slate-400">
                行頭 Tab で話者「」挿入
              </span>
              <div className="hidden @xl:flex flex-wrap items-center gap-3">
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 font-code text-[10px]">
                    Tab
                  </kbd>{' '}
                  行頭で話者「」挿入
                </span>
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 font-code text-[10px]">
                    ⌘/Ctrl+Enter
                  </kbd>{' '}
                  直前の話者を連続挿入
                </span>
                <span>
                  <kbd className="rounded border border-slate-300 bg-white px-1 font-code text-[10px]">
                    Enter
                  </kbd>{' '}
                  「」内末尾で括弧抜け改行
                </span>
              </div>
              <span className="font-code tabular-nums text-slate-400 shrink-0">
                解決後 {charCount.toLocaleString()} 文字
              </span>
            </div>

            {/* Editor + Live Preview Split (Bottom or Right) */}
            <div
              className={`flex min-h-0 flex-1 overflow-hidden ${
                showPreview && previewLayout === 'right' ? 'flex-col @2xl:flex-row' : 'flex-col'
              }`}
            >
              {/* Textarea Manuscript Area */}
              <div
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  if (!isDraggingImage) setIsDraggingImage(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setIsDraggingImage(false);
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
                  const imageFiles = Array.from(e.dataTransfer.files).filter(
                    (f) => f.type.startsWith('image/') || /\.svg$/i.test(f.name)
                  );
                  if (imageFiles.length === 0) return;
                  e.preventDefault();
                  setIsDraggingImage(false);
                  void handleQuickUploadAndInsert(imageFiles);
                }}
                className={`relative flex-1 min-h-0 min-w-0 overflow-hidden bg-white transition-colors ${
                  isDraggingImage ? 'ring-2 ring-inset ring-slate-500 bg-slate-50/70' : ''
                }`}
              >
                <textarea
                  ref={textareaRef}
                  value={scene.body}
                  onChange={(e) => {
                    onUpdateScene({ ...scene, body: e.target.value });
                    syncCursor();
                  }}
                  onClick={syncCursor}
                  onKeyUp={syncCursor}
                  onSelect={syncCursor}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  placeholder="ここからシナリオを執筆できます。行頭で Tab キーを押すと登場キャラ一覧が表示されます。画像をここへドロップするとカーソル行に挿入できます。"
                  className={`h-full w-full resize-none border-0 bg-transparent p-6 text-[15px] text-slate-900 focus:outline-none ${
                    verticalWriting
                      ? 'writing-vertical font-editorial overflow-x-auto overflow-y-hidden leading-loose'
                      : 'font-editorial leading-[1.9] overflow-y-auto'
                  }`}
                />

                {isDraggingImage && (
                  <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-500 bg-white/85 backdrop-blur-xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <ImagePlus className="h-4 w-4 text-slate-600" />
                      <span>ドロップしてカーソル行へ画像を挿入</span>
                    </div>
                  </div>
                )}

                {/* Floating Character Picker Popup on Line-Start Tab */}
                {speakerPopupOpen && (
                  <div className="absolute left-6 top-6 z-30 w-64 rounded-md border border-slate-300 bg-white shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                      <span>発言キャラクターを選択</span>
                      <span className="font-code">↑↓ / Enter</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {orderedCharacters.map((char, idx) => {
                        const active = idx === speakerPopupIndex;
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onMouseEnter={() => setSpeakerPopupIndex(idx)}
                            onClick={() =>
                              insertSpeakerDialogue(char.shortName, speakerInsertPos, false)
                            }
                            className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                              active
                                ? isAdult
                                  ? 'bg-rose-50 text-rose-900 font-medium'
                                  : 'bg-slate-100 text-slate-900 font-medium'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>
                              {char.shortName}「」
                              <span className="ml-2 text-[11px] text-slate-400">
                                {char.common.name}
                              </span>
                            </span>
                            <span className="font-code text-[10px] text-slate-400">
                              {char.id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Compiled Mode Preview (Bottom or Right Split) */}
              {showPreview && (
                <div
                  className={`flex shrink-0 flex-col overflow-hidden ${
                    previewLayout === 'right'
                      ? 'h-[45%] border-t @2xl:h-auto @2xl:w-1/2 @2xl:border-t-0 @2xl:border-l'
                      : 'h-60 border-t'
                  } ${
                    isAdult
                      ? 'border-rose-200 bg-rose-50/30'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-3 @lg:px-4 py-1.5 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-700 truncate">
                        リアルタイムプレビュー
                      </span>
                      <span aria-hidden="true" className="hidden sm:inline text-slate-300">
                        ·
                      </span>
                      <span
                        className={`hidden sm:inline truncate ${
                          isAdult ? 'font-medium text-rose-700' : 'text-slate-500'
                        }`}
                      >
                        {isAdult ? 'R18モード展開中' : '一般用モード展開中'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-code text-slate-400 tabular-nums">
                        {compiledPreview.trim().length === 0
                          ? 0
                          : compiledPreview.split('\n').length}{' '}
                        行
                      </span>
                      <div
                        role="group"
                        aria-label="プレビュー配置の切替"
                        className="inline-flex items-center rounded border border-slate-200 bg-white p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewLayout('bottom')}
                          title="プレビューを下部に表示"
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            previewLayout === 'bottom'
                              ? isAdult
                                ? 'bg-rose-700 text-white'
                                : 'bg-slate-800 text-white'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <PanelBottom className="h-3 w-3" />
                          <span>下</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewLayout('right')}
                          title="プレビューを右側に並べて表示"
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            previewLayout === 'right'
                              ? isAdult
                                ? 'bg-rose-700 text-white'
                                : 'bg-slate-800 text-white'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <PanelRight className="h-3 w-3" />
                          <span>右</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex-1 p-4 text-sm text-slate-800 ${
                      verticalWriting
                        ? 'writing-vertical font-editorial overflow-x-auto overflow-y-hidden'
                        : 'overflow-y-auto'
                    }`}
                  >
                    <RichScenePreview
                      compiledText={compiledPreview}
                      scene={scene}
                      characters={characters}
                      worldSettings={worldSettings}
                      activeMode={activeMode}
                      verticalWriting={verticalWriting}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }
);
