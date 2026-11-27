import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlignJustify,
  BookOpen,
  Columns2,
  Eye,
  EyeOff,
  Folder,
  Maximize2,
  Minimize2,
  Users,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  PlotData,
  SceneData,
  VisibilityType,
  WorldSettingData,
} from '../types/scenario';
import {
  compileSceneText,
  findPreviousSpeakerPrefix,
} from '../utils/scenarioEngine';
import { PlotBoard, type MoveCardPosition } from './PlotBoard';

export interface SceneEditorHandle {
  jumpToLine: (line: number) => void;
  insertAtCursor: (text: string, placeCaretBefore?: string) => void;
}

interface SceneEditorPaneProps {
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
}

export const SceneEditorPane = forwardRef<SceneEditorHandle, SceneEditorPaneProps>(
  (
    {
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
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showPreview, setShowPreview] = useState(true);
    const [showCharDropdown, setShowCharDropdown] = useState(false);

    // Floating Tab Speaker Popup state
    const [speakerPopupOpen, setSpeakerPopupOpen] = useState(false);
    const [speakerPopupIndex, setSpeakerPopupIndex] = useState(0);
    const [speakerInsertPos, setSpeakerInsertPos] = useState(0);

    const isAdult = activeMode === 'adult';

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
          },
          worldSettings
        ),
      [scene.body, characters, activeMode, worldSettings]
    );

    const charCount = useMemo(
      () => compiledPreview.replace(/\s+/g, '').length,
      [compiledPreview]
    );

    useImperativeHandle(ref, () => ({
      jumpToLine: (line: number) => {
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

    // Close speaker popup on scene switch
    useEffect(() => {
      setSpeakerPopupOpen(false);
    }, [scene.sceneId]);

    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
        {/* Scene Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <input
              type="text"
              value={scene.title}
              onChange={(e) => onUpdateScene({ ...scene, title: e.target.value })}
              className="min-w-[140px] max-w-[260px] rounded border border-transparent px-1.5 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
            />

            <select
              value={scene.visibility}
              onChange={(e) =>
                onUpdateScene({
                  ...scene,
                  visibility: e.target.value as VisibilityType,
                })
              }
              className={`rounded border px-2 py-1 text-xs font-medium focus:outline-none ${
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
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              title="保存先フォルダを変更"
            >
              <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={scene.folder ?? ''}
                aria-label="シーンの保存先フォルダ"
                onChange={(e) => onMoveSceneToFolder(scene.sceneId, e.target.value || undefined)}
                className="max-w-[140px] bg-transparent text-xs text-slate-700 focus:outline-none"
              >
                <option value="">scenes/ (直下)</option>
                {sceneFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}/
                  </option>
                ))}
              </select>
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCharDropdown((v) => !v)}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap"
              >
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>登場 ({scene.characters.length})</span>
              </button>
              {showCharDropdown && (
                <div className="absolute left-0 mt-1 w-52 rounded-md border border-slate-200 bg-white p-2 shadow-lg z-30">
                  <div className="mb-1.5 text-[11px] font-medium text-slate-500">
                    このシーンの登場キャラクター
                  </div>
                  <div className="space-y-1">
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
                        <span>{c.common.name}</span>
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
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleSplitView}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                splitView
                  ? isAdult
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-slate-300 bg-slate-100 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>2分割プロット</span>
            </button>

            <button
              type="button"
              onClick={onToggleVerticalWriting}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                verticalWriting
                  ? isAdult
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-slate-300 bg-slate-100 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {verticalWriting ? (
                <BookOpen className="h-3.5 w-3.5" />
              ) : (
                <AlignJustify className="h-3.5 w-3.5" />
              )}
              <span>{verticalWriting ? '縦書き' : '横書き'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {showPreview ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              <span>プレビュー</span>
            </button>

            <button
              type="button"
              onClick={onToggleFocusMode}
              title="左右ペインを隠して執筆に集中 (Escで解除)"
              className={`flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                focusMode
                  ? isAdult
                    ? 'border-rose-700 bg-rose-700 text-white'
                    : 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span>{focusMode ? 'フォーカス解除' : 'フォーカス'}</span>
            </button>
          </div>
        </div>

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

          {/* Editor + Live Preview Column */}
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

            {/* Textarea Manuscript Area */}
            <div className="relative flex-1 min-h-0 overflow-hidden bg-white">
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
                placeholder="ここからシナリオを執筆できます。行頭で Tab キーを押すと登場キャラ一覧が表示されます。"
                className={`h-full w-full resize-none border-0 bg-white p-6 text-[15px] text-slate-900 focus:outline-none ${
                  verticalWriting
                    ? 'writing-vertical font-editorial overflow-x-auto overflow-y-hidden leading-loose'
                    : 'font-editorial leading-[1.9] overflow-y-auto'
                }`}
              />

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

            {/* Real-time Compiled Mode Preview */}
            {showPreview && (
              <div
                className={`flex h-52 shrink-0 flex-col border-t ${
                  isAdult
                    ? 'border-rose-200 bg-rose-50/30'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">
                      リアルタイム・コンパイルプレビュー
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className={isAdult ? 'font-medium text-rose-700' : 'text-slate-500'}>
                      {isAdult
                        ? 'R18モード変数 & [IF_MODE: adult] 展開中'
                        : '一般用モード変数 & [IF_MODE: general] 展開中'}
                    </span>
                  </div>
                  <span className="font-code text-slate-400 tabular-nums">
                    {compiledPreview.split('\n').length} 行
                  </span>
                </div>

                <div
                  className={`flex-1 p-4 text-sm text-slate-800 ${
                    verticalWriting
                      ? 'writing-vertical font-editorial overflow-x-auto overflow-y-hidden whitespace-pre-wrap'
                      : 'font-editorial leading-[1.85] overflow-y-auto whitespace-pre-wrap'
                  }`}
                >
                  {compiledPreview || (
                    <span className="text-slate-400">（本文を入力すると展開結果が表示されます）</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
