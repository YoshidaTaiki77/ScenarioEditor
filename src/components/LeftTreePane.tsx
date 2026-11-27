import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  Link2,
  Pencil,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type {
  ActiveMode,
  CharacterData,
  PlotData,
  PlotScope,
  SceneData,
  SelectedItem,
  VisibilityType,
} from '../types/scenario';
import {
  getCharacterFilename,
  getPlotFilename,
  getSceneFilename,
} from '../utils/storageManager';

interface LeftTreePaneProps {
  activeMode: ActiveMode;
  characters: CharacterData[];
  characterFolders: string[];
  plots: PlotData[];
  scenes: SceneData[];
  sceneFolders: string[];
  selectedItem: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onAddScene: (folder?: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onCreateSceneFolder: (name: string) => { ok: boolean; error?: string };
  onRenameSceneFolder: (oldName: string, newName: string) => { ok: boolean; error?: string };
  onDeleteSceneFolder: (name: string) => void;
  onMoveSceneToFolder: (sceneId: string, folder?: string) => void;
  onReorderScene: (
    sourceSceneId: string,
    targetSceneId: string,
    side: 'before' | 'after'
  ) => void;
  onReorderSceneFolder: (
    sourceFolder: string,
    targetFolder: string,
    side: 'before' | 'after'
  ) => void;
  onAddCharacter: (folder?: string) => void;
  onCreateCharacterFolder: (name: string) => { ok: boolean; error?: string };
  onRenameCharacterFolder: (oldName: string, newName: string) => { ok: boolean; error?: string };
  onDeleteCharacterFolder: (name: string) => void;
  onMoveCharacterToFolder: (characterId: string, folder?: string) => void;
  onReorderCharacter: (
    sourceCharId: string,
    targetCharId: string,
    side: 'before' | 'after'
  ) => void;
  onReorderCharacterFolder: (
    sourceFolder: string,
    targetFolder: string,
    side: 'before' | 'after'
  ) => void;
  onAddPlot: () => void;
  onDeletePlot: (plotId: string) => void;
  onReorderPlot: (sourcePlotId: string, targetPlotId: string, side: 'before' | 'after') => void;
  isOverlay?: boolean;
  onClose?: () => void;
}

function getVisibilityTag(visibility: VisibilityType): string {
  if (visibility === 'adult_only') return 'R18専用';
  if (visibility === 'general_alt') return '一般差替';
  return '共通';
}

function getPlotScopeTag(scope?: PlotScope): string {
  if (scope === 'route') return 'ルート';
  if (scope === 'character') return 'キャラ別';
  if (scope === 'subplot') return '自由';
  return '章';
}

export const LeftTreePane: React.FC<LeftTreePaneProps> = ({
  activeMode,
  characters,
  characterFolders,
  plots,
  scenes,
  sceneFolders,
  selectedItem,
  onSelect,
  onAddScene,
  onDeleteScene,
  onCreateSceneFolder,
  onRenameSceneFolder,
  onDeleteSceneFolder,
  onMoveSceneToFolder,
  onReorderScene,
  onReorderSceneFolder,
  onAddCharacter,
  onCreateCharacterFolder,
  onRenameCharacterFolder,
  onDeleteCharacterFolder,
  onMoveCharacterToFolder,
  onReorderCharacter,
  onReorderCharacterFolder,
  onAddPlot,
  onDeletePlot,
  onReorderPlot,
  isOverlay = false,
  onClose,
}) => {
  const [openFolders, setOpenFolders] = useState({
    characters: true,
    plots: true,
    scenes: true,
  });
  const [closedCharSubfolders, setClosedCharSubfolders] = useState<Record<string, boolean>>({});
  const [closedSceneSubfolders, setClosedSceneSubfolders] = useState<Record<string, boolean>>({});

  // Create character folder inline state
  const [isAddingCharFolder, setIsAddingCharFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  // Rename character folder inline state
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Drag & Drop character across folders and within folder/root order (grip handle only)
  const [draggingCharId, setDraggingCharId] = useState<string | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);
  const [charDropTarget, setCharDropTarget] = useState<{
    charId: string;
    side: 'before' | 'after';
  } | null>(null);

  // Drag & Drop character folder display order (grip handle only)
  const [draggingCharFolder, setDraggingCharFolder] = useState<string | null>(null);
  const [charFolderDropTarget, setCharFolderDropTarget] = useState<{
    folder: string;
    side: 'before' | 'after';
  } | null>(null);

  // Create scene folder inline state
  const [isAddingSceneFolder, setIsAddingSceneFolder] = useState(false);
  const [newSceneFolderName, setNewSceneFolderName] = useState('');
  const [sceneFolderError, setSceneFolderError] = useState<string | null>(null);

  // Rename scene folder inline state
  const [renamingSceneFolder, setRenamingSceneFolder] = useState<string | null>(null);
  const [sceneRenameDraft, setSceneRenameDraft] = useState('');
  const [sceneRenameError, setSceneRenameError] = useState<string | null>(null);

  // Drag & Drop scene across folders and within folder/root order (grip handle only)
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [dropTargetSceneFolder, setDropTargetSceneFolder] = useState<string | null>(null);
  const [sceneDropTarget, setSceneDropTarget] = useState<{
    sceneId: string;
    side: 'before' | 'after';
  } | null>(null);

  // Drag & Drop scene folder display order (grip handle only)
  const [draggingSceneFolder, setDraggingSceneFolder] = useState<string | null>(null);
  const [sceneFolderDropTarget, setSceneFolderDropTarget] = useState<{
    folder: string;
    side: 'before' | 'after';
  } | null>(null);

  // Drag & Drop plot display order (grip handle only)
  const [draggingPlotId, setDraggingPlotId] = useState<string | null>(null);
  const [plotDropTarget, setPlotDropTarget] = useState<{
    plotId: string;
    side: 'before' | 'after';
  } | null>(null);

  const isAdult = activeMode === 'adult';

  const toggleFolder = (key: keyof typeof openFolders) => {
    setOpenFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCharSubfolder = (folder: string) => {
    setClosedCharSubfolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const toggleSceneSubfolder = (folder: string) => {
    setClosedSceneSubfolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const isDimmedInMode = (visibility: VisibilityType) => {
    if (!isAdult && visibility === 'adult_only') return true;
    if (isAdult && visibility === 'general_alt') return true;
    return false;
  };

  const handleCreateFolderSubmit = () => {
    const res = onCreateCharacterFolder(newFolderName);
    if (!res.ok) {
      setFolderError(res.error ?? 'フォルダを作成できませんでした。');
      return;
    }
    setNewFolderName('');
    setFolderError(null);
    setIsAddingCharFolder(false);
    setOpenFolders((prev) => ({ ...prev, characters: true }));
  };

  const handleRenameFolderSubmit = (oldName: string) => {
    const res = onRenameCharacterFolder(oldName, renameDraft);
    if (!res.ok) {
      setRenameError(res.error ?? 'フォルダ名を変更できませんでした。');
      return;
    }
    setRenamingFolder(null);
    setRenameDraft('');
    setRenameError(null);
  };

  const handleCreateSceneFolderSubmit = () => {
    const res = onCreateSceneFolder(newSceneFolderName);
    if (!res.ok) {
      setSceneFolderError(res.error ?? 'フォルダを作成できませんでした。');
      return;
    }
    setNewSceneFolderName('');
    setSceneFolderError(null);
    setIsAddingSceneFolder(false);
    setOpenFolders((prev) => ({ ...prev, scenes: true }));
  };

  const handleRenameSceneFolderSubmit = (oldName: string) => {
    const res = onRenameSceneFolder(oldName, sceneRenameDraft);
    if (!res.ok) {
      setSceneRenameError(res.error ?? 'フォルダ名を変更できませんでした。');
      return;
    }
    setRenamingSceneFolder(null);
    setSceneRenameDraft('');
    setSceneRenameError(null);
  };

  const rootScenes = scenes.filter((s) => !s.folder);
  const linkedPlotsBySceneFolder = useMemo(() => {
    const map = new Map<string, PlotData[]>();
    for (const p of plots) {
      if (!p.linkedSceneFolder) continue;
      const list = map.get(p.linkedSceneFolder) ?? [];
      list.push(p);
      map.set(p.linkedSceneFolder, list);
    }
    return map;
  }, [plots]);

  const canDragScene = scenes.length > 1 || sceneFolders.length > 0;

  const renderSceneRow = (scene: SceneData) => {
    const active = selectedItem.type === 'scene' && selectedItem.id === scene.sceneId;
    const dimmed = isDimmedInMode(scene.visibility);
    const isDragging = draggingSceneId === scene.sceneId;
    const isSceneDropHere = sceneDropTarget?.sceneId === scene.sceneId && !isDragging;
    const sceneDropSide = isSceneDropHere ? sceneDropTarget.side : null;

    return (
      <div
        key={scene.sceneId}
        data-scene-row={scene.sceneId}
        onDragOver={(e) => {
          const isSceneDrag =
            Boolean(draggingSceneId) || e.dataTransfer.types.includes('text/scene-id');
          if (!isSceneDrag) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropTargetSceneFolder !== null) setDropTargetSceneFolder(null);

          if (draggingSceneId === scene.sceneId) {
            if (sceneDropTarget?.sceneId === scene.sceneId) {
              setSceneDropTarget(null);
            }
            return;
          }

          const rect = e.currentTarget.getBoundingClientRect();
          const side: 'before' | 'after' =
            e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

          if (
            sceneDropTarget?.sceneId !== scene.sceneId ||
            sceneDropTarget.side !== side
          ) {
            setSceneDropTarget({ sceneId: scene.sceneId, side });
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            if (sceneDropTarget?.sceneId === scene.sceneId) {
              setSceneDropTarget(null);
            }
          }
        }}
        onDrop={(e) => {
          const sourceId = draggingSceneId || e.dataTransfer.getData('text/scene-id');
          if (!sourceId) return;
          e.preventDefault();
          e.stopPropagation();

          if (sourceId !== scene.sceneId) {
            const rect = e.currentTarget.getBoundingClientRect();
            const side: 'before' | 'after' =
              sceneDropTarget?.sceneId === scene.sceneId
                ? sceneDropTarget.side
                : e.clientY < rect.top + rect.height / 2
                  ? 'before'
                  : 'after';
            onReorderScene(sourceId, scene.sceneId, side);
          }
          setDraggingSceneId(null);
          setSceneDropTarget(null);
          setDropTargetSceneFolder(null);
        }}
        className={`relative group flex items-center justify-between rounded transition-opacity duration-150 ${
          isDragging ? 'opacity-45' : dimmed ? 'opacity-45' : 'opacity-100'
        } ${
          active
            ? isAdult
              ? 'bg-rose-100/80 text-rose-900 font-medium'
              : 'bg-slate-200/80 text-slate-900 font-medium'
            : 'text-slate-700 hover:bg-slate-200/50'
        }`}
      >
        {isSceneDropHere && sceneDropSide && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
              isAdult ? 'bg-rose-600' : 'bg-slate-800'
            } ${sceneDropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
          />
        )}

        {canDragScene && (
          <span
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              const row = e.currentTarget.closest('[data-scene-row]') as HTMLElement | null;
              if (row && e.dataTransfer.setDragImage) {
                e.dataTransfer.setDragImage(row, 16, 16);
              }
              setDraggingSceneId(scene.sceneId);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/scene-id', scene.sceneId);
            }}
            onDragEnd={() => {
              setDraggingSceneId(null);
              setSceneDropTarget(null);
              setDropTargetSceneFolder(null);
            }}
            title="ドラッグして並び替え・フォルダ移動"
            className="ml-1 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        <button
          type="button"
          onClick={() => onSelect({ type: 'scene', id: scene.sceneId })}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left ${
            canDragScene ? 'pl-1' : 'pl-2'
          }`}
        >
          <FileText
            className={`h-3.5 w-3.5 shrink-0 ${
              scene.visibility === 'adult_only'
                ? 'text-rose-500'
                : scene.visibility === 'general_alt'
                  ? 'text-slate-500'
                  : 'text-slate-400'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate leading-snug">{scene.title}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="font-code truncate">{getSceneFilename(scene)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`shrink-0 ${
                  scene.visibility === 'adult_only'
                    ? 'text-rose-600'
                    : scene.visibility === 'general_alt'
                      ? 'text-slate-500'
                      : ''
                }`}
              >
                {getVisibilityTag(scene.visibility)}
              </span>
            </div>
          </div>
        </button>

        {scenes.length > 1 && (
          <button
            type="button"
            onClick={() => onDeleteScene(scene.sceneId)}
            title="このシーンを削除"
            className="mr-1 hidden rounded p-1 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600 group-hover:block"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const rootCharacters = characters.filter((c) => !c.folder);
  const canDragCharacter = characters.length > 1 || characterFolders.length > 0;

  const renderCharacterRow = (char: CharacterData) => {
    const active = selectedItem.type === 'character' && selectedItem.id === char.id;
    const isDragging = draggingCharId === char.id;
    const isCharDropHere = charDropTarget?.charId === char.id && !isDragging;
    const charDropSide = isCharDropHere ? charDropTarget.side : null;

    return (
      <div
        key={char.id}
        data-character-row={char.id}
        onDragOver={(e) => {
          const isCharDrag =
            Boolean(draggingCharId) || e.dataTransfer.types.includes('text/character-id');
          if (!isCharDrag) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropTargetFolder !== null) setDropTargetFolder(null);

          if (draggingCharId === char.id) {
            if (charDropTarget?.charId === char.id) {
              setCharDropTarget(null);
            }
            return;
          }

          const rect = e.currentTarget.getBoundingClientRect();
          const side: 'before' | 'after' =
            e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

          if (charDropTarget?.charId !== char.id || charDropTarget.side !== side) {
            setCharDropTarget({ charId: char.id, side });
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            if (charDropTarget?.charId === char.id) {
              setCharDropTarget(null);
            }
          }
        }}
        onDrop={(e) => {
          const sourceId = draggingCharId || e.dataTransfer.getData('text/character-id');
          if (!sourceId) return;
          e.preventDefault();
          e.stopPropagation();

          if (sourceId !== char.id) {
            const rect = e.currentTarget.getBoundingClientRect();
            const side: 'before' | 'after' =
              charDropTarget?.charId === char.id
                ? charDropTarget.side
                : e.clientY < rect.top + rect.height / 2
                  ? 'before'
                  : 'after';
            onReorderCharacter(sourceId, char.id, side);
          }
          setDraggingCharId(null);
          setCharDropTarget(null);
          setDropTargetFolder(null);
        }}
        className={`relative group flex items-center justify-between rounded transition-colors ${
          isDragging ? 'opacity-45' : ''
        } ${
          active
            ? isAdult
              ? 'bg-rose-100/80 text-rose-900 font-medium'
              : 'bg-slate-200/80 text-slate-900 font-medium'
            : 'text-slate-700 hover:bg-slate-200/50'
        }`}
      >
        {isCharDropHere && charDropSide && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
              isAdult ? 'bg-rose-600' : 'bg-slate-800'
            } ${charDropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
          />
        )}

        {canDragCharacter && (
          <span
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              const row = e.currentTarget.closest('[data-character-row]') as HTMLElement | null;
              if (row && e.dataTransfer.setDragImage) {
                e.dataTransfer.setDragImage(row, 16, 14);
              }
              setDraggingCharId(char.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/character-id', char.id);
            }}
            onDragEnd={() => {
              setDraggingCharId(null);
              setCharDropTarget(null);
              setDropTargetFolder(null);
            }}
            title="ドラッグして並び替え・フォルダ移動"
            className="ml-1 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        <button
          type="button"
          onClick={() => onSelect({ type: 'character', id: char.id })}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-2 text-left ${
            canDragCharacter ? 'pl-1' : 'pl-2'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{char.common.name}</span>
          </span>
          <span className="font-code text-[10px] text-slate-400 shrink-0 truncate max-w-[84px]">
            {getCharacterFilename(char)}
          </span>
        </button>
      </div>
    );
  };

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-slate-200 select-none ${
        isOverlay
          ? 'w-[min(85vw,18rem)] bg-slate-50 shadow-xl'
          : 'w-60 xl:w-64 bg-slate-50/70'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <span className="text-xs font-semibold text-slate-700">プロジェクト構成</span>
        <div className="flex items-center gap-1.5">
          <span className="font-code text-[11px] text-slate-400 tabular-nums">
            {characters.length + plots.length + scenes.length} files
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="左パネルを閉じる"
              aria-label="左パネルを閉じる"
              className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3 text-xs">
        {/* characters/ */}
        <div>
          <div
            onDragOver={(e) => {
              const isCharDrag =
                Boolean(draggingCharId) || e.dataTransfer.types.includes('text/character-id');
              if (!isCharDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (charDropTarget !== null) setCharDropTarget(null);
              if (dropTargetFolder !== '__root__') setDropTargetFolder('__root__');
            }}
            onDragLeave={() => {
              if (dropTargetFolder === '__root__') setDropTargetFolder(null);
            }}
            onDrop={(e) => {
              const charId = draggingCharId || e.dataTransfer.getData('text/character-id');
              if (!charId) return;
              e.preventDefault();
              onMoveCharacterToFolder(charId, undefined);
              setDraggingCharId(null);
              setCharDropTarget(null);
              setDropTargetFolder(null);
            }}
            className={`flex items-center justify-between rounded px-1.5 py-1 text-slate-600 transition-colors ${
              dropTargetFolder === '__root__'
                ? isAdult
                  ? 'bg-rose-100/70 ring-1 ring-rose-400'
                  : 'bg-slate-200/80 ring-1 ring-slate-400'
                : ''
            }`}
          >
            <button
              type="button"
              onClick={() => toggleFolder('characters')}
              className="flex items-center gap-1.5 font-medium hover:text-slate-900"
            >
              {openFolders.characters ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-code text-[11px]">characters/</span>
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, characters: true }));
                  setIsAddingCharFolder((v) => !v);
                  setFolderError(null);
                  setNewFolderName('');
                }}
                title="キャラクターフォルダを追加"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAddCharacter(undefined)}
                title="キャラクターを追加"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {openFolders.characters && (
            <div className="mt-0.5 space-y-1 pl-3">
              {isAddingCharFolder && (
                <div className="mb-1.5 rounded border border-slate-200 bg-white p-1.5 space-y-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => {
                        setNewFolderName(e.target.value);
                        setFolderError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          handleCreateFolderSubmit();
                        }
                        if (e.key === 'Escape') {
                          setIsAddingCharFolder(false);
                          setFolderError(null);
                        }
                      }}
                      placeholder="フォルダ名（例: メイン）"
                      className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateFolderSubmit}
                      title="作成"
                      className="rounded bg-slate-800 p-1 text-white hover:bg-slate-900 shrink-0"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCharFolder(false);
                        setFolderError(null);
                      }}
                      title="キャンセル"
                      className="rounded border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {folderError && (
                    <p className="text-[10px] font-medium text-rose-600">{folderError}</p>
                  )}
                </div>
              )}

              {/* User-created Character Subfolders */}
              {characterFolders.map((folder) => {
                const charsInFolder = characters.filter((c) => c.folder === folder);
                const isSubOpen = !closedCharSubfolders[folder];
                const isRenaming = renamingFolder === folder;
                const isDropHere = dropTargetFolder === folder;
                const isFolderDragging = draggingCharFolder === folder;
                const isFolderDropHere =
                  charFolderDropTarget?.folder === folder && !isFolderDragging;
                const folderDropSide = isFolderDropHere ? charFolderDropTarget.side : null;

                return (
                  <div
                    key={folder}
                    onDragOver={(e) => {
                      const isFolderDrag =
                        Boolean(draggingCharFolder) ||
                        e.dataTransfer.types.includes('text/character-folder');
                      if (isFolderDrag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (draggingCharFolder === folder) {
                          if (charFolderDropTarget?.folder === folder) {
                            setCharFolderDropTarget(null);
                          }
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const side: 'before' | 'after' =
                          e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        if (
                          charFolderDropTarget?.folder !== folder ||
                          charFolderDropTarget.side !== side
                        ) {
                          setCharFolderDropTarget({ folder, side });
                        }
                        return;
                      }

                      const isCharDrag =
                        Boolean(draggingCharId) ||
                        e.dataTransfer.types.includes('text/character-id');
                      if (!isCharDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (charDropTarget !== null) setCharDropTarget(null);
                      if (dropTargetFolder !== folder) setDropTargetFolder(folder);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (dropTargetFolder === folder) setDropTargetFolder(null);
                        if (charFolderDropTarget?.folder === folder) {
                          setCharFolderDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      const sourceFolder =
                        draggingCharFolder || e.dataTransfer.getData('text/character-folder');
                      if (sourceFolder) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (sourceFolder !== folder) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const side: 'before' | 'after' =
                            charFolderDropTarget?.folder === folder
                              ? charFolderDropTarget.side
                              : e.clientY < rect.top + rect.height / 2
                                ? 'before'
                                : 'after';
                          onReorderCharacterFolder(sourceFolder, folder, side);
                        }
                        setDraggingCharFolder(null);
                        setCharFolderDropTarget(null);
                        return;
                      }

                      const charId =
                        draggingCharId || e.dataTransfer.getData('text/character-id');
                      if (!charId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveCharacterToFolder(charId, folder);
                      setDraggingCharId(null);
                      setCharDropTarget(null);
                      setDropTargetFolder(null);
                    }}
                    className={`relative rounded transition-colors ${
                      isFolderDragging ? 'opacity-45' : ''
                    } ${
                      isDropHere
                        ? isAdult
                          ? 'bg-rose-100/70 ring-1 ring-rose-400'
                          : 'bg-slate-200/80 ring-1 ring-slate-400'
                        : ''
                    }`}
                  >
                    {isFolderDropHere && folderDropSide && (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
                          isAdult ? 'bg-rose-600' : 'bg-slate-800'
                        } ${folderDropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
                      />
                    )}

                    {isRenaming ? (
                      <div className="p-1 space-y-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => {
                              setRenameDraft(e.target.value);
                              setRenameError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                handleRenameFolderSubmit(folder);
                              }
                              if (e.key === 'Escape') {
                                setRenamingFolder(null);
                                setRenameError(null);
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameFolderSubmit(folder)}
                            className="rounded bg-slate-800 p-0.5 text-white hover:bg-slate-900"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolder(null);
                              setRenameError(null);
                            }}
                            className="rounded border border-slate-200 bg-white p-0.5 text-slate-400 hover:bg-slate-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {renameError && (
                          <p className="text-[10px] font-medium text-rose-600">{renameError}</p>
                        )}
                      </div>
                    ) : (
                      <div
                        data-char-folder-header={folder}
                        className="group flex items-center justify-between rounded py-1 pr-1.5 pl-0.5 text-slate-600 hover:bg-slate-200/50"
                      >
                        {characterFolders.length > 1 && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              const headerRow = e.currentTarget.closest(
                                '[data-char-folder-header]'
                              ) as HTMLElement | null;
                              if (headerRow && e.dataTransfer.setDragImage) {
                                e.dataTransfer.setDragImage(headerRow, 16, 12);
                              }
                              setDraggingCharFolder(folder);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/character-folder', folder);
                            }}
                            onDragEnd={() => {
                              setDraggingCharFolder(null);
                              setCharFolderDropTarget(null);
                            }}
                            title="ドラッグしてフォルダの表示順を並び替え"
                            className="mr-0.5 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleCharSubfolder(folder)}
                          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:text-slate-900 ${
                            characterFolders.length > 1 ? '' : 'pl-1'
                          }`}
                        >
                          {isSubOpen ? (
                            <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                          )}
                          <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate text-[11px] text-slate-700">{folder}</span>
                          <span className="font-code text-[10px] text-slate-400 tabular-nums shrink-0">
                            {charsInFolder.length}
                          </span>
                        </button>

                        <div className="hidden items-center gap-0.5 group-hover:flex shrink-0">
                          <button
                            type="button"
                            onClick={() => onAddCharacter(folder)}
                            title={`${folder} にキャラクターを追加`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolder(folder);
                              setRenameDraft(folder);
                              setRenameError(null);
                            }}
                            title="フォルダ名を変更"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCharacterFolder(folder)}
                            title="フォルダを削除（中のキャラは直下へ移動）"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {isSubOpen && (
                      <div className="mt-0.5 space-y-0.5 pl-4">
                        {charsInFolder.length > 0 ? (
                          charsInFolder.map(renderCharacterRow)
                        ) : (
                          <div className="px-2 py-1 text-[10px] text-slate-400">
                            空のフォルダ（ドラッグして移動）
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root / Uncategorized Characters */}
              <div
                onDragOver={(e) => {
                  const isCharDrag =
                    Boolean(draggingCharId) || e.dataTransfer.types.includes('text/character-id');
                  if (!isCharDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (charDropTarget !== null) setCharDropTarget(null);
                  if (dropTargetFolder !== '__root__') setDropTargetFolder('__root__');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    if (dropTargetFolder === '__root__') setDropTargetFolder(null);
                  }
                }}
                onDrop={(e) => {
                  const charId = draggingCharId || e.dataTransfer.getData('text/character-id');
                  if (!charId) return;
                  e.preventDefault();
                  onMoveCharacterToFolder(charId, undefined);
                  setDraggingCharId(null);
                  setCharDropTarget(null);
                  setDropTargetFolder(null);
                }}
                className="space-y-0.5 pl-1"
              >
                {rootCharacters.map(renderCharacterRow)}
              </div>
            </div>
          )}
        </div>

        {/* plots/ */}
        <div>
          <div className="flex items-center justify-between px-1.5 py-1 text-slate-600">
            <button
              type="button"
              onClick={() => toggleFolder('plots')}
              className="flex items-center gap-1.5 font-medium hover:text-slate-900"
            >
              {openFolders.plots ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-code text-[11px]">plots/</span>
            </button>
            <button
              type="button"
              onClick={onAddPlot}
              title="新規プロットを追加"
              className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {openFolders.plots && (
            <div className="mt-0.5 space-y-1 pl-3">
              {plots.map((plot) => {
                const active = selectedItem.type === 'plot' && selectedItem.id === plot.plotId;
                const isDragging = draggingPlotId === plot.plotId;
                const isDropHere = plotDropTarget?.plotId === plot.plotId && !isDragging;
                const dropSide = isDropHere ? plotDropTarget.side : null;

                return (
                  <div
                    key={plot.plotId}
                    data-plot-row={plot.plotId}
                    onDragOver={(e) => {
                      const isPlotDrag =
                        Boolean(draggingPlotId) || e.dataTransfer.types.includes('text/plot-id');
                      if (!isPlotDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';

                      if (draggingPlotId === plot.plotId) {
                        if (plotDropTarget?.plotId === plot.plotId) {
                          setPlotDropTarget(null);
                        }
                        return;
                      }

                      const rect = e.currentTarget.getBoundingClientRect();
                      const side: 'before' | 'after' =
                        e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

                      if (
                        plotDropTarget?.plotId !== plot.plotId ||
                        plotDropTarget.side !== side
                      ) {
                        setPlotDropTarget({ plotId: plot.plotId, side });
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (plotDropTarget?.plotId === plot.plotId) {
                          setPlotDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      const sourceId =
                        draggingPlotId || e.dataTransfer.getData('text/plot-id');
                      if (!sourceId) return;
                      e.preventDefault();
                      e.stopPropagation();

                      if (sourceId !== plot.plotId) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const side: 'before' | 'after' =
                          plotDropTarget?.plotId === plot.plotId
                            ? plotDropTarget.side
                            : e.clientY < rect.top + rect.height / 2
                              ? 'before'
                              : 'after';
                        onReorderPlot(sourceId, plot.plotId, side);
                      }
                      setDraggingPlotId(null);
                      setPlotDropTarget(null);
                    }}
                    className={`relative group flex items-center justify-between rounded transition-colors ${
                      isDragging ? 'opacity-45' : ''
                    } ${
                      active
                        ? isAdult
                          ? 'bg-rose-100/80 text-rose-900 font-medium'
                          : 'bg-slate-200/80 text-slate-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    {isDropHere && dropSide && (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
                          isAdult ? 'bg-rose-600' : 'bg-slate-800'
                        } ${dropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
                      />
                    )}

                    {plots.length > 1 && (
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          const row = e.currentTarget.closest(
                            '[data-plot-row]'
                          ) as HTMLElement | null;
                          if (row && e.dataTransfer.setDragImage) {
                            e.dataTransfer.setDragImage(row, 16, 16);
                          }
                          setDraggingPlotId(plot.plotId);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plot-id', plot.plotId);
                        }}
                        onDragEnd={() => {
                          setDraggingPlotId(null);
                          setPlotDropTarget(null);
                        }}
                        title="ドラッグして表示順を並び替え"
                        className="ml-1 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onSelect({ type: 'plot', id: plot.plotId })}
                      className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left ${
                        plots.length > 1 ? 'pl-1' : 'pl-2'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate leading-snug">{plot.title}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="shrink-0">{getPlotScopeTag(plot.scope)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-code truncate">{getPlotFilename(plot)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-code tabular-nums shrink-0">
                            {plot.cards.length}枚
                          </span>
                        </div>
                        {plot.linkedSceneFolder && (
                          <div className="mt-0.5 flex items-center">
                            <span
                              title={`連携シーンフォルダ: scenes/${plot.linkedSceneFolder}/`}
                              className="inline-flex max-w-full items-center gap-1 rounded bg-slate-200/70 px-1.5 py-0 text-[9px] font-medium text-slate-600"
                            >
                              <Folder className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                              <span className="truncate">{plot.linkedSceneFolder}/</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </button>

                    {plots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeletePlot(plot.plotId)}
                        title="このプロットを削除"
                        className="mr-1 hidden rounded p-1 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* scenes/ */}
        <div>
          <div
            onDragOver={(e) => {
              const isSceneDrag =
                Boolean(draggingSceneId) || e.dataTransfer.types.includes('text/scene-id');
              if (!isSceneDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (sceneDropTarget !== null) setSceneDropTarget(null);
              if (dropTargetSceneFolder !== '__root__') {
                setDropTargetSceneFolder('__root__');
              }
            }}
            onDragLeave={() => {
              if (dropTargetSceneFolder === '__root__') setDropTargetSceneFolder(null);
            }}
            onDrop={(e) => {
              const sceneId = draggingSceneId || e.dataTransfer.getData('text/scene-id');
              if (!sceneId) return;
              e.preventDefault();
              onMoveSceneToFolder(sceneId, undefined);
              setDraggingSceneId(null);
              setSceneDropTarget(null);
              setDropTargetSceneFolder(null);
            }}
            className={`flex items-center justify-between rounded px-1.5 py-1 text-slate-600 transition-colors ${
              dropTargetSceneFolder === '__root__'
                ? isAdult
                  ? 'bg-rose-100/70 ring-1 ring-rose-400'
                  : 'bg-slate-200/80 ring-1 ring-slate-400'
                : ''
            }`}
          >
            <button
              type="button"
              onClick={() => toggleFolder('scenes')}
              className="flex items-center gap-1.5 font-medium hover:text-slate-900"
            >
              {openFolders.scenes ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-code text-[11px]">scenes/</span>
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, scenes: true }));
                  setIsAddingSceneFolder((v) => !v);
                  setSceneFolderError(null);
                  setNewSceneFolderName('');
                }}
                title="シーンフォルダを追加"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAddScene(undefined)}
                title="新規シーンを作成"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {openFolders.scenes && (
            <div className="mt-0.5 space-y-1 pl-3">
              {isAddingSceneFolder && (
                <div className="mb-1.5 rounded border border-slate-200 bg-white p-1.5 space-y-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={newSceneFolderName}
                      onChange={(e) => {
                        setNewSceneFolderName(e.target.value);
                        setSceneFolderError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          handleCreateSceneFolderSubmit();
                        }
                        if (e.key === 'Escape') {
                          setIsAddingSceneFolder(false);
                          setSceneFolderError(null);
                        }
                      }}
                      placeholder="フォルダ名（例: 第1章）"
                      className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateSceneFolderSubmit}
                      title="作成"
                      className="rounded bg-slate-800 p-1 text-white hover:bg-slate-900 shrink-0"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSceneFolder(false);
                        setSceneFolderError(null);
                      }}
                      title="キャンセル"
                      className="rounded border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {sceneFolderError && (
                    <p className="text-[10px] font-medium text-rose-600">{sceneFolderError}</p>
                  )}
                </div>
              )}

              {/* User-created Scene Subfolders */}
              {sceneFolders.map((folder) => {
                const scenesInFolder = scenes.filter((s) => s.folder === folder);
                const isSubOpen = !closedSceneSubfolders[folder];
                const isRenaming = renamingSceneFolder === folder;
                const isDropHere = dropTargetSceneFolder === folder;
                const isFolderDragging = draggingSceneFolder === folder;
                const isFolderDropHere =
                  sceneFolderDropTarget?.folder === folder && !isFolderDragging;
                const folderDropSide = isFolderDropHere ? sceneFolderDropTarget.side : null;

                return (
                  <div
                    key={folder}
                    onDragOver={(e) => {
                      const isFolderDrag =
                        Boolean(draggingSceneFolder) ||
                        e.dataTransfer.types.includes('text/scene-folder');
                      if (isFolderDrag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (draggingSceneFolder === folder) {
                          if (sceneFolderDropTarget?.folder === folder) {
                            setSceneFolderDropTarget(null);
                          }
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const side: 'before' | 'after' =
                          e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        if (
                          sceneFolderDropTarget?.folder !== folder ||
                          sceneFolderDropTarget.side !== side
                        ) {
                          setSceneFolderDropTarget({ folder, side });
                        }
                        return;
                      }

                      const isSceneDrag =
                        Boolean(draggingSceneId) ||
                        e.dataTransfer.types.includes('text/scene-id');
                      if (!isSceneDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (sceneDropTarget !== null) setSceneDropTarget(null);
                      if (dropTargetSceneFolder !== folder) setDropTargetSceneFolder(folder);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (dropTargetSceneFolder === folder) setDropTargetSceneFolder(null);
                        if (sceneFolderDropTarget?.folder === folder) {
                          setSceneFolderDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      const sourceFolder =
                        draggingSceneFolder || e.dataTransfer.getData('text/scene-folder');
                      if (sourceFolder) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (sourceFolder !== folder) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const side: 'before' | 'after' =
                            sceneFolderDropTarget?.folder === folder
                              ? sceneFolderDropTarget.side
                              : e.clientY < rect.top + rect.height / 2
                                ? 'before'
                                : 'after';
                          onReorderSceneFolder(sourceFolder, folder, side);
                        }
                        setDraggingSceneFolder(null);
                        setSceneFolderDropTarget(null);
                        return;
                      }

                      const sceneId =
                        draggingSceneId || e.dataTransfer.getData('text/scene-id');
                      if (!sceneId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveSceneToFolder(sceneId, folder);
                      setDraggingSceneId(null);
                      setSceneDropTarget(null);
                      setDropTargetSceneFolder(null);
                    }}
                    className={`relative rounded transition-colors ${
                      isFolderDragging ? 'opacity-45' : ''
                    } ${
                      isDropHere
                        ? isAdult
                          ? 'bg-rose-100/70 ring-1 ring-rose-400'
                          : 'bg-slate-200/80 ring-1 ring-slate-400'
                        : ''
                    }`}
                  >
                    {isFolderDropHere && folderDropSide && (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
                          isAdult ? 'bg-rose-600' : 'bg-slate-800'
                        } ${folderDropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
                      />
                    )}

                    {isRenaming ? (
                      <div className="p-1 space-y-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={sceneRenameDraft}
                            onChange={(e) => {
                              setSceneRenameDraft(e.target.value);
                              setSceneRenameError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                handleRenameSceneFolderSubmit(folder);
                              }
                              if (e.key === 'Escape') {
                                setRenamingSceneFolder(null);
                                setSceneRenameError(null);
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameSceneFolderSubmit(folder)}
                            className="rounded bg-slate-800 p-0.5 text-white hover:bg-slate-900"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSceneFolder(null);
                              setSceneRenameError(null);
                            }}
                            className="rounded border border-slate-200 bg-white p-0.5 text-slate-400 hover:bg-slate-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {sceneRenameError && (
                          <p className="text-[10px] font-medium text-rose-600">
                            {sceneRenameError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        data-scene-folder-header={folder}
                        className="group flex items-center justify-between rounded py-1 pr-1.5 pl-0.5 text-slate-600 hover:bg-slate-200/50"
                      >
                        {sceneFolders.length > 1 && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              const headerRow = e.currentTarget.closest(
                                '[data-scene-folder-header]'
                              ) as HTMLElement | null;
                              if (headerRow && e.dataTransfer.setDragImage) {
                                e.dataTransfer.setDragImage(headerRow, 16, 12);
                              }
                              setDraggingSceneFolder(folder);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/scene-folder', folder);
                            }}
                            onDragEnd={() => {
                              setDraggingSceneFolder(null);
                              setSceneFolderDropTarget(null);
                            }}
                            title="ドラッグしてフォルダの表示順を並び替え"
                            className="mr-0.5 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                        )}

                        {(() => {
                          const linkedPlots = linkedPlotsBySceneFolder.get(folder) ?? [];
                          const linkSummary =
                            linkedPlots.length === 1
                              ? linkedPlots[0].title
                              : linkedPlots.length > 1
                                ? `${linkedPlots[0].title} 他${linkedPlots.length - 1}`
                                : '';
                          return (
                            <button
                              type="button"
                              onClick={() => toggleSceneSubfolder(folder)}
                              className={`flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:text-slate-900 ${
                                sceneFolders.length > 1 ? '' : 'pl-1'
                              }`}
                            >
                              {isSubOpen ? (
                                <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                              )}
                              <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate text-[11px] text-slate-700">{folder}</span>
                              <span className="font-code text-[10px] text-slate-400 tabular-nums shrink-0">
                                {scenesInFolder.length}
                              </span>
                              {linkedPlots.length > 0 && (
                                <span
                                  title={`連携プロット: ${linkedPlots.map((p) => p.title).join('、')}`}
                                  className="inline-flex max-w-[78px] shrink items-center gap-0.5 rounded bg-slate-200/70 px-1 py-0 text-[9px] font-medium text-slate-600"
                                >
                                  <Link2 className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                                  <span className="truncate">{linkSummary}</span>
                                </span>
                              )}
                            </button>
                          );
                        })()}

                        <div className="hidden items-center gap-0.5 group-hover:flex shrink-0">
                          <button
                            type="button"
                            onClick={() => onAddScene(folder)}
                            title={`${folder} にシーンを追加`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingSceneFolder(folder);
                              setSceneRenameDraft(folder);
                              setSceneRenameError(null);
                            }}
                            title="フォルダ名を変更"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSceneFolder(folder)}
                            title="フォルダを削除（中のシーンは直下へ移動）"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {isSubOpen && (
                      <div className="mt-0.5 space-y-0.5 pl-4">
                        {scenesInFolder.length > 0 ? (
                          scenesInFolder.map(renderSceneRow)
                        ) : (
                          <div className="px-2 py-1 text-[10px] text-slate-400">
                            空のフォルダ（ドラッグして移動）
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root / Uncategorized Scenes */}
              <div
                onDragOver={(e) => {
                  const isSceneDrag =
                    Boolean(draggingSceneId) || e.dataTransfer.types.includes('text/scene-id');
                  if (!isSceneDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetSceneFolder !== '__root__') {
                    setDropTargetSceneFolder('__root__');
                  }
                }}
                onDrop={(e) => {
                  const sceneId = draggingSceneId || e.dataTransfer.getData('text/scene-id');
                  if (!sceneId) return;
                  e.preventDefault();
                  onMoveSceneToFolder(sceneId, undefined);
                  setDraggingSceneId(null);
                  setSceneDropTarget(null);
                  setDropTargetSceneFolder(null);
                }}
                className="space-y-0.5 pl-1"
              >
                {rootScenes.map(renderSceneRow)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mode legend at bottom of left tree */}
      <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        {isAdult ? (
          <span>R18モード: 「一般差替」シーンを半透明表示</span>
        ) : (
          <span>一般用モード: 「R18専用」シーンを半透明表示</span>
        )}
      </div>
    </aside>
  );
};

