import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  FileUp,
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
  WorldSettingData,
} from '../types/scenario';
import type { ImportEntityType, ImportNotification } from '../utils/fileImporter';
import {
  getCharacterFilename,
  getPlotFilename,
  getSceneFilename,
  getWorldFilename,
} from '../utils/storageManager';

interface LeftTreePaneProps {
  activeMode: ActiveMode;
  characters: CharacterData[];
  characterFolders: string[];
  worldSettings: WorldSettingData[];
  worldFolders: string[];
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
  onRequestDeleteCharacter: (characterId: string) => void;
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
  onAddWorldSetting: (folder?: string) => void;
  onDeleteWorldSetting: (worldId: string) => void;
  onCreateWorldFolder: (name: string) => { ok: boolean; error?: string };
  onRenameWorldFolder: (oldName: string, newName: string) => { ok: boolean; error?: string };
  onDeleteWorldFolder: (name: string) => void;
  onMoveWorldToFolder: (worldId: string, folder?: string) => void;
  onReorderWorld: (
    sourceWorldId: string,
    targetWorldId: string,
    side: 'before' | 'after'
  ) => void;
  onReorderWorldFolder: (
    sourceFolder: string,
    targetFolder: string,
    side: 'before' | 'after'
  ) => void;
  onAddPlot: () => void;
  onDeletePlot: (plotId: string) => void;
  onReorderPlot: (sourcePlotId: string, targetPlotId: string, side: 'before' | 'after') => void;
  onImportFiles: (type: ImportEntityType, files: FileList | File[], targetFolder?: string) => void;
  importNotification: ImportNotification | null;
  onDismissImportNotification: () => void;
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
  worldSettings,
  worldFolders,
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
  onRequestDeleteCharacter,
  onCreateCharacterFolder,
  onRenameCharacterFolder,
  onDeleteCharacterFolder,
  onMoveCharacterToFolder,
  onReorderCharacter,
  onReorderCharacterFolder,
  onAddWorldSetting,
  onDeleteWorldSetting,
  onCreateWorldFolder,
  onRenameWorldFolder,
  onDeleteWorldFolder,
  onMoveWorldToFolder,
  onReorderWorld,
  onReorderWorldFolder,
  onAddPlot,
  onDeletePlot,
  onReorderPlot,
  onImportFiles,
  importNotification,
  onDismissImportNotification,
  isOverlay = false,
  onClose,
}) => {
  const [openFolders, setOpenFolders] = useState({
    characters: true,
    world: true,
    plots: true,
    scenes: true,
  });
  const [closedCharSubfolders, setClosedCharSubfolders] = useState<Record<string, boolean>>({});
  const [closedWorldSubfolders, setClosedWorldSubfolders] = useState<Record<string, boolean>>({});
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

  // Create world folder inline state
  const [isAddingWorldFolder, setIsAddingWorldFolder] = useState(false);
  const [newWorldFolderName, setNewWorldFolderName] = useState('');
  const [worldFolderError, setWorldFolderError] = useState<string | null>(null);

  // Rename world folder inline state
  const [renamingWorldFolder, setRenamingWorldFolder] = useState<string | null>(null);
  const [worldRenameDraft, setWorldRenameDraft] = useState('');
  const [worldRenameError, setWorldRenameError] = useState<string | null>(null);

  // Drag & Drop world item across folders and within folder/root order (grip handle only)
  const [draggingWorldId, setDraggingWorldId] = useState<string | null>(null);
  const [dropTargetWorldFolder, setDropTargetWorldFolder] = useState<string | null>(null);
  const [worldDropTarget, setWorldDropTarget] = useState<{
    worldId: string;
    side: 'before' | 'after';
  } | null>(null);

  // Drag & Drop world folder display order (grip handle only)
  const [draggingWorldFolder, setDraggingWorldFolder] = useState<string | null>(null);
  const [worldFolderDropTarget, setWorldFolderDropTarget] = useState<{
    folder: string;
    side: 'before' | 'after';
  } | null>(null);

  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const sceneFileInputRef = useRef<HTMLInputElement>(null);
  const pendingImportTargetRef = useRef<{ type: ImportEntityType; folder?: string }>({
    type: 'character',
  });
  const [externalFileDropTarget, setExternalFileDropTarget] = useState<{
    type: ImportEntityType;
    folder?: string;
  } | null>(null);

  const isAdult = activeMode === 'adult';

  const openImportPicker = (type: ImportEntityType, folder?: string) => {
    pendingImportTargetRef.current = { type, folder };
    if (type === 'scene') {
      sceneFileInputRef.current?.click();
    } else {
      jsonFileInputRef.current?.click();
    }
  };

  const isExternalFileDrag = (e: React.DragEvent): boolean => {
    if (
      draggingCharId ||
      draggingCharFolder ||
      draggingWorldId ||
      draggingWorldFolder ||
      draggingPlotId ||
      draggingSceneId ||
      draggingSceneFolder
    ) {
      return false;
    }
    return Array.from(e.dataTransfer.types ?? []).includes('Files');
  };

  const isExternalDropActive = (type: ImportEntityType, folder?: string): boolean => {
    if (!externalFileDropTarget) return false;
    return externalFileDropTarget.type === type && externalFileDropTarget.folder === folder;
  };

  const handleExternalDragOver = (
    e: React.DragEvent,
    type: ImportEntityType,
    folder?: string
  ): boolean => {
    if (!isExternalFileDrag(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (
      externalFileDropTarget?.type !== type ||
      externalFileDropTarget?.folder !== folder
    ) {
      setExternalFileDropTarget({ type, folder });
    }
    return true;
  };

  const handleExternalDragLeave = (
    e: React.DragEvent,
    type: ImportEntityType,
    folder?: string
  ) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setExternalFileDropTarget((cur) =>
        cur && cur.type === type && cur.folder === folder ? null : cur
      );
    }
  };

  const handleExternalDrop = (
    e: React.DragEvent,
    type: ImportEntityType,
    folder?: string
  ): boolean => {
    if (!isExternalFileDrag(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    setExternalFileDropTarget(null);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) {
      onImportFiles(type, dropped, folder);
    }
    return true;
  };

  const toggleFolder = (key: keyof typeof openFolders) => {
    setOpenFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCharSubfolder = (folder: string) => {
    setClosedCharSubfolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const toggleWorldSubfolder = (folder: string) => {
    setClosedWorldSubfolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const toggleSceneSubfolder = (folder: string) => {
    setClosedSceneSubfolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const handleCreateWorldFolderSubmit = () => {
    const res = onCreateWorldFolder(newWorldFolderName);
    if (!res.ok) {
      setWorldFolderError(res.error ?? 'フォルダを作成できませんでした。');
      return;
    }
    setNewWorldFolderName('');
    setWorldFolderError(null);
    setIsAddingWorldFolder(false);
    setOpenFolders((prev) => ({ ...prev, world: true }));
  };

  const handleRenameWorldFolderSubmit = (oldName: string) => {
    const res = onRenameWorldFolder(oldName, worldRenameDraft);
    if (!res.ok) {
      setWorldRenameError(res.error ?? 'フォルダ名を変更できませんでした。');
      return;
    }
    setRenamingWorldFolder(null);
    setWorldRenameDraft('');
    setWorldRenameError(null);
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
              {scene.format === 'manga' && (
                <span className="shrink-0 rounded bg-slate-200/80 px-1 py-0 text-[9px] font-semibold text-slate-700">
                  漫画
                </span>
              )}
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
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-1.5 text-left ${
            canDragCharacter ? 'pl-1' : 'pl-2'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{char.common.name}</span>
          </span>
          <span className="font-code text-[10px] text-slate-400 shrink-0 truncate max-w-[74px] group-hover:hidden">
            {getCharacterFilename(char)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onRequestDeleteCharacter(char.id)}
          title="このキャラクターを削除"
          className="mr-1 hidden rounded p-1 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600 group-hover:block shrink-0"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  };

  const rootWorldSettings = worldSettings.filter((w) => !w.folder);
  const canDragWorld = worldSettings.length > 1 || worldFolders.length > 0;

  const renderWorldRow = (item: WorldSettingData) => {
    const active = selectedItem.type === 'world' && selectedItem.id === item.id;
    const isDragging = draggingWorldId === item.id;
    const isWorldDropHere = worldDropTarget?.worldId === item.id && !isDragging;
    const worldDropSide = isWorldDropHere ? worldDropTarget.side : null;

    return (
      <div
        key={item.id}
        data-world-row={item.id}
        onDragOver={(e) => {
          const isWorldDrag =
            Boolean(draggingWorldId) || e.dataTransfer.types.includes('text/world-id');
          if (!isWorldDrag) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropTargetWorldFolder !== null) setDropTargetWorldFolder(null);

          if (draggingWorldId === item.id) {
            if (worldDropTarget?.worldId === item.id) {
              setWorldDropTarget(null);
            }
            return;
          }

          const rect = e.currentTarget.getBoundingClientRect();
          const side: 'before' | 'after' =
            e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

          if (worldDropTarget?.worldId !== item.id || worldDropTarget.side !== side) {
            setWorldDropTarget({ worldId: item.id, side });
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            if (worldDropTarget?.worldId === item.id) {
              setWorldDropTarget(null);
            }
          }
        }}
        onDrop={(e) => {
          const sourceId = draggingWorldId || e.dataTransfer.getData('text/world-id');
          if (!sourceId) return;
          e.preventDefault();
          e.stopPropagation();

          if (sourceId !== item.id) {
            const rect = e.currentTarget.getBoundingClientRect();
            const side: 'before' | 'after' =
              worldDropTarget?.worldId === item.id
                ? worldDropTarget.side
                : e.clientY < rect.top + rect.height / 2
                  ? 'before'
                  : 'after';
            onReorderWorld(sourceId, item.id, side);
          }
          setDraggingWorldId(null);
          setWorldDropTarget(null);
          setDropTargetWorldFolder(null);
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
        {isWorldDropHere && worldDropSide && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full ${
              isAdult ? 'bg-rose-600' : 'bg-slate-800'
            } ${worldDropSide === 'before' ? '-top-0.5' : '-bottom-0.5'}`}
          />
        )}

        {canDragWorld && (
          <span
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              const row = e.currentTarget.closest('[data-world-row]') as HTMLElement | null;
              if (row && e.dataTransfer.setDragImage) {
                e.dataTransfer.setDragImage(row, 16, 14);
              }
              setDraggingWorldId(item.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/world-id', item.id);
            }}
            onDragEnd={() => {
              setDraggingWorldId(null);
              setWorldDropTarget(null);
              setDropTargetWorldFolder(null);
            }}
            title="ドラッグして並び替え・フォルダ移動"
            className="ml-1 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        <button
          type="button"
          onClick={() => onSelect({ type: 'world', id: item.id })}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pr-1.5 text-left ${
            canDragWorld ? 'pl-1' : 'pl-2'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{item.name || item.id}</span>
          </span>
          <span className="font-code text-[10px] text-slate-400 shrink-0 truncate max-w-[74px] group-hover:hidden">
            {getWorldFilename(item)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onDeleteWorldSetting(item.id)}
          title="この世界観設定を削除"
          className="mr-1 hidden rounded p-1 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600 group-hover:block shrink-0"
        >
          <Trash2 className="h-3 w-3" />
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
            {characters.length + worldSettings.length + plots.length + scenes.length} files
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

      {/* Hidden file inputs for existing-file imports */}
      <input
        ref={jsonFileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            const { type, folder } = pendingImportTargetRef.current;
            onImportFiles(type, files, folder);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={sceneFileInputRef}
        type="file"
        accept=".md,.txt,.json,text/markdown,text/plain,application/json"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            const { folder } = pendingImportTargetRef.current;
            onImportFiles('scene', files, folder);
          }
          e.target.value = '';
        }}
      />

      {/* Import Result Notification Banner (Option 3) */}
      {importNotification && (
        <div
          role="status"
          className={`mx-2 mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
            importNotification.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
              : importNotification.kind === 'partial'
                ? 'border-amber-200 bg-amber-50/90 text-amber-900'
                : 'border-rose-200 bg-rose-50/90 text-rose-800'
          }`}
        >
          <div className="flex items-start gap-1.5">
            {importNotification.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  importNotification.kind === 'partial' ? 'text-amber-600' : 'text-rose-600'
                }`}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{importNotification.message}</p>
              {importNotification.details && importNotification.details.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[10px] opacity-90">
                  {importNotification.details.slice(0, 3).map((d, idx) => (
                    <li key={idx} className="break-words">
                      ・{d}
                    </li>
                  ))}
                  {importNotification.details.length > 3 && (
                    <li>ほか {importNotification.details.length - 3} 件</li>
                  )}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={onDismissImportNotification}
              aria-label="通知を閉じる"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3 text-xs">
        {/* characters/ */}
        <div
          onDragOver={(e) => {
            handleExternalDragOver(e, 'character', undefined);
          }}
          onDragLeave={(e) => handleExternalDragLeave(e, 'character', undefined)}
          onDrop={(e) => {
            handleExternalDrop(e, 'character', undefined);
          }}
          className={`rounded-md transition-colors ${
            isExternalDropActive('character', undefined)
              ? isAdult
                ? 'bg-rose-50/80 ring-1 ring-dashed ring-rose-400'
                : 'bg-sky-50/80 ring-1 ring-dashed ring-sky-400'
              : ''
          }`}
        >
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
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, characters: true }));
                  openImportPicker('character', undefined);
                }}
                title="既存ファイル(.json)からキャラクターを読み込み"
                aria-label="既存ファイルからキャラクターを読み込み"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" />
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

          {isExternalDropActive('character', undefined) && (
            <div className="mx-1.5 my-1 rounded border border-dashed border-sky-300 bg-white/90 px-2 py-1 text-center text-[10px] font-medium text-sky-700">
              ここに .json をドロップして読み込み
            </div>
          )}

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

                      if (handleExternalDragOver(e, 'character', folder)) {
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
                      handleExternalDragLeave(e, 'character', folder);
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (dropTargetFolder === folder) setDropTargetFolder(null);
                        if (charFolderDropTarget?.folder === folder) {
                          setCharFolderDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      if (handleExternalDrop(e, 'character', folder)) {
                        return;
                      }

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
                      isDropHere || isExternalDropActive('character', folder)
                        ? isAdult
                          ? 'bg-rose-100/70 ring-1 ring-rose-400'
                          : 'bg-sky-100/70 ring-1 ring-sky-400'
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
                            onClick={() => openImportPicker('character', folder)}
                            title={`${folder} へ既存ファイル(.json)から読み込み`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <FileUp className="h-3 w-3" />
                          </button>
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

        {/* world/ (世界観設定) */}
        <div
          onDragOver={(e) => {
            handleExternalDragOver(e, 'world', undefined);
          }}
          onDragLeave={(e) => handleExternalDragLeave(e, 'world', undefined)}
          onDrop={(e) => {
            handleExternalDrop(e, 'world', undefined);
          }}
          className={`rounded-md transition-colors ${
            isExternalDropActive('world', undefined)
              ? isAdult
                ? 'bg-rose-50/80 ring-1 ring-dashed ring-rose-400'
                : 'bg-sky-50/80 ring-1 ring-dashed ring-sky-400'
              : ''
          }`}
        >
          <div
            onDragOver={(e) => {
              const isWorldDrag =
                Boolean(draggingWorldId) || e.dataTransfer.types.includes('text/world-id');
              if (!isWorldDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (worldDropTarget !== null) setWorldDropTarget(null);
              if (dropTargetWorldFolder !== '__root__') setDropTargetWorldFolder('__root__');
            }}
            onDragLeave={() => {
              if (dropTargetWorldFolder === '__root__') setDropTargetWorldFolder(null);
            }}
            onDrop={(e) => {
              const worldId = draggingWorldId || e.dataTransfer.getData('text/world-id');
              if (!worldId) return;
              e.preventDefault();
              onMoveWorldToFolder(worldId, undefined);
              setDraggingWorldId(null);
              setWorldDropTarget(null);
              setDropTargetWorldFolder(null);
            }}
            className={`flex items-center justify-between rounded px-1.5 py-1 text-slate-600 transition-colors ${
              dropTargetWorldFolder === '__root__'
                ? isAdult
                  ? 'bg-rose-100/70 ring-1 ring-rose-400'
                  : 'bg-slate-200/80 ring-1 ring-slate-400'
                : ''
            }`}
          >
            <button
              type="button"
              onClick={() => toggleFolder('world')}
              className="flex items-center gap-1.5 font-medium hover:text-slate-900"
            >
              {openFolders.world ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              <Folder className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-code text-[11px]">world/</span>
              <span className="text-[10px] font-normal text-slate-400">世界観</span>
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, world: true }));
                  setIsAddingWorldFolder((v) => !v);
                  setWorldFolderError(null);
                  setNewWorldFolderName('');
                }}
                title="世界観フォルダを追加（例: 組織・用語）"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, world: true }));
                  openImportPicker('world', undefined);
                }}
                title="既存ファイル(.json)から世界観設定を読み込み"
                aria-label="既存ファイルから世界観設定を読み込み"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAddWorldSetting(undefined)}
                title="世界観設定を追加"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {isExternalDropActive('world', undefined) && (
            <div className="mx-1.5 my-1 rounded border border-dashed border-sky-300 bg-white/90 px-2 py-1 text-center text-[10px] font-medium text-sky-700">
              ここに .json をドロップして読み込み
            </div>
          )}

          {openFolders.world && (
            <div className="mt-0.5 space-y-1 pl-3">
              {isAddingWorldFolder && (
                <div className="mb-1.5 rounded border border-slate-200 bg-white p-1.5 space-y-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={newWorldFolderName}
                      onChange={(e) => {
                        setNewWorldFolderName(e.target.value);
                        setWorldFolderError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          handleCreateWorldFolderSubmit();
                        }
                        if (e.key === 'Escape') {
                          setIsAddingWorldFolder(false);
                          setWorldFolderError(null);
                        }
                      }}
                      placeholder="フォルダ名（例: 組織・用語）"
                      className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateWorldFolderSubmit}
                      title="作成"
                      className="rounded bg-slate-800 p-1 text-white hover:bg-slate-900 shrink-0"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingWorldFolder(false);
                        setWorldFolderError(null);
                      }}
                      title="キャンセル"
                      className="rounded border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {worldFolderError && (
                    <p className="text-[10px] font-medium text-rose-600">{worldFolderError}</p>
                  )}
                </div>
              )}

              {/* World Subfolders (舞台設定 / アイテム設定 / custom) */}
              {worldFolders.map((folder) => {
                const itemsInFolder = worldSettings.filter((w) => w.folder === folder);
                const isSubOpen = !closedWorldSubfolders[folder];
                const isRenaming = renamingWorldFolder === folder;
                const isDropHere = dropTargetWorldFolder === folder;
                const isFolderDragging = draggingWorldFolder === folder;
                const isFolderDropHere =
                  worldFolderDropTarget?.folder === folder && !isFolderDragging;
                const folderDropSide = isFolderDropHere ? worldFolderDropTarget.side : null;

                return (
                  <div
                    key={folder}
                    onDragOver={(e) => {
                      const isFolderDrag =
                        Boolean(draggingWorldFolder) ||
                        e.dataTransfer.types.includes('text/world-folder');
                      if (isFolderDrag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (draggingWorldFolder === folder) {
                          if (worldFolderDropTarget?.folder === folder) {
                            setWorldFolderDropTarget(null);
                          }
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const side: 'before' | 'after' =
                          e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                        if (
                          worldFolderDropTarget?.folder !== folder ||
                          worldFolderDropTarget.side !== side
                        ) {
                          setWorldFolderDropTarget({ folder, side });
                        }
                        return;
                      }

                      if (handleExternalDragOver(e, 'world', folder)) {
                        return;
                      }

                      const isWorldDrag =
                        Boolean(draggingWorldId) ||
                        e.dataTransfer.types.includes('text/world-id');
                      if (!isWorldDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (worldDropTarget !== null) setWorldDropTarget(null);
                      if (dropTargetWorldFolder !== folder) setDropTargetWorldFolder(folder);
                    }}
                    onDragLeave={(e) => {
                      handleExternalDragLeave(e, 'world', folder);
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (dropTargetWorldFolder === folder) setDropTargetWorldFolder(null);
                        if (worldFolderDropTarget?.folder === folder) {
                          setWorldFolderDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      if (handleExternalDrop(e, 'world', folder)) {
                        return;
                      }

                      const sourceFolder =
                        draggingWorldFolder || e.dataTransfer.getData('text/world-folder');
                      if (sourceFolder) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (sourceFolder !== folder) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const side: 'before' | 'after' =
                            worldFolderDropTarget?.folder === folder
                              ? worldFolderDropTarget.side
                              : e.clientY < rect.top + rect.height / 2
                                ? 'before'
                                : 'after';
                          onReorderWorldFolder(sourceFolder, folder, side);
                        }
                        setDraggingWorldFolder(null);
                        setWorldFolderDropTarget(null);
                        return;
                      }

                      const worldId =
                        draggingWorldId || e.dataTransfer.getData('text/world-id');
                      if (!worldId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveWorldToFolder(worldId, folder);
                      setDraggingWorldId(null);
                      setWorldDropTarget(null);
                      setDropTargetWorldFolder(null);
                    }}
                    className={`relative rounded transition-colors ${
                      isFolderDragging ? 'opacity-45' : ''
                    } ${
                      isDropHere || isExternalDropActive('world', folder)
                        ? isAdult
                          ? 'bg-rose-100/70 ring-1 ring-rose-400'
                          : 'bg-sky-100/70 ring-1 ring-sky-400'
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
                            value={worldRenameDraft}
                            onChange={(e) => {
                              setWorldRenameDraft(e.target.value);
                              setWorldRenameError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                handleRenameWorldFolderSubmit(folder);
                              }
                              if (e.key === 'Escape') {
                                setRenamingWorldFolder(null);
                                setWorldRenameError(null);
                              }
                            }}
                            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameWorldFolderSubmit(folder)}
                            className="rounded bg-slate-800 p-0.5 text-white hover:bg-slate-900"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingWorldFolder(null);
                              setWorldRenameError(null);
                            }}
                            className="rounded border border-slate-200 bg-white p-0.5 text-slate-400 hover:bg-slate-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {worldRenameError && (
                          <p className="text-[10px] font-medium text-rose-600">
                            {worldRenameError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        data-world-folder-header={folder}
                        className="group flex items-center justify-between rounded py-1 pr-1.5 pl-0.5 text-slate-600 hover:bg-slate-200/50"
                      >
                        {worldFolders.length > 1 && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              const headerRow = e.currentTarget.closest(
                                '[data-world-folder-header]'
                              ) as HTMLElement | null;
                              if (headerRow && e.dataTransfer.setDragImage) {
                                e.dataTransfer.setDragImage(headerRow, 16, 12);
                              }
                              setDraggingWorldFolder(folder);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/world-folder', folder);
                            }}
                            onDragEnd={() => {
                              setDraggingWorldFolder(null);
                              setWorldFolderDropTarget(null);
                            }}
                            title="ドラッグしてフォルダの表示順を並び替え"
                            className="mr-0.5 flex shrink-0 cursor-grab items-center justify-center rounded p-0.5 text-slate-300 hover:text-slate-600 active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleWorldSubfolder(folder)}
                          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium hover:text-slate-900 ${
                            worldFolders.length > 1 ? '' : 'pl-1'
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
                            {itemsInFolder.length}
                          </span>
                        </button>

                        <div className="hidden items-center gap-0.5 group-hover:flex shrink-0">
                          <button
                            type="button"
                            onClick={() => openImportPicker('world', folder)}
                            title={`${folder} へ既存ファイル(.json)から読み込み`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <FileUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddWorldSetting(folder)}
                            title={`${folder} に設定を追加`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingWorldFolder(folder);
                              setWorldRenameDraft(folder);
                              setWorldRenameError(null);
                            }}
                            title="フォルダ名を変更"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteWorldFolder(folder)}
                            title="フォルダを削除（中の設定は直下へ移動）"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {isSubOpen && (
                      <div className="mt-0.5 space-y-0.5 pl-4">
                        {itemsInFolder.length > 0 ? (
                          itemsInFolder.map(renderWorldRow)
                        ) : (
                          <div className="px-2 py-1 text-[10px] text-slate-400">
                            空のフォルダ（＋またはドラッグで追加）
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root / Uncategorized World Settings */}
              <div
                onDragOver={(e) => {
                  const isWorldDrag =
                    Boolean(draggingWorldId) || e.dataTransfer.types.includes('text/world-id');
                  if (!isWorldDrag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (worldDropTarget !== null) setWorldDropTarget(null);
                  if (dropTargetWorldFolder !== '__root__') setDropTargetWorldFolder('__root__');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    if (dropTargetWorldFolder === '__root__') setDropTargetWorldFolder(null);
                  }
                }}
                onDrop={(e) => {
                  const worldId = draggingWorldId || e.dataTransfer.getData('text/world-id');
                  if (!worldId) return;
                  e.preventDefault();
                  onMoveWorldToFolder(worldId, undefined);
                  setDraggingWorldId(null);
                  setWorldDropTarget(null);
                  setDropTargetWorldFolder(null);
                }}
                className="space-y-0.5 pl-1"
              >
                {rootWorldSettings.map(renderWorldRow)}
              </div>
            </div>
          )}
        </div>

        {/* plots/ */}
        <div
          onDragOver={(e) => {
            handleExternalDragOver(e, 'plot', undefined);
          }}
          onDragLeave={(e) => handleExternalDragLeave(e, 'plot', undefined)}
          onDrop={(e) => {
            handleExternalDrop(e, 'plot', undefined);
          }}
          className={`rounded-md transition-colors ${
            isExternalDropActive('plot', undefined)
              ? isAdult
                ? 'bg-rose-50/80 ring-1 ring-dashed ring-rose-400'
                : 'bg-sky-50/80 ring-1 ring-dashed ring-sky-400'
              : ''
          }`}
        >
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
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, plots: true }));
                  openImportPicker('plot', undefined);
                }}
                title="既存ファイル(.json)からプロットを読み込み"
                aria-label="既存ファイルからプロットを読み込み"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" />
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
          </div>

          {isExternalDropActive('plot', undefined) && (
            <div className="mx-1.5 my-1 rounded border border-dashed border-sky-300 bg-white/90 px-2 py-1 text-center text-[10px] font-medium text-sky-700">
              ここに .json をドロップして読み込み
            </div>
          )}

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
        <div
          onDragOver={(e) => {
            handleExternalDragOver(e, 'scene', undefined);
          }}
          onDragLeave={(e) => handleExternalDragLeave(e, 'scene', undefined)}
          onDrop={(e) => {
            handleExternalDrop(e, 'scene', undefined);
          }}
          className={`rounded-md transition-colors ${
            isExternalDropActive('scene', undefined)
              ? isAdult
                ? 'bg-rose-50/80 ring-1 ring-dashed ring-rose-400'
                : 'bg-sky-50/80 ring-1 ring-dashed ring-sky-400'
              : ''
          }`}
        >
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
                onClick={() => {
                  setOpenFolders((prev) => ({ ...prev, scenes: true }));
                  openImportPicker('scene', undefined);
                }}
                title="既存ファイル(.md / .txt)からシーンを読み込み"
                aria-label="既存ファイルからシーンを読み込み"
                className="rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <FileUp className="h-3.5 w-3.5" />
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

          {isExternalDropActive('scene', undefined) && (
            <div className="mx-1.5 my-1 rounded border border-dashed border-sky-300 bg-white/90 px-2 py-1 text-center text-[10px] font-medium text-sky-700">
              ここに .md / .txt をドロップして読み込み
            </div>
          )}

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

                      if (handleExternalDragOver(e, 'scene', folder)) {
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
                      handleExternalDragLeave(e, 'scene', folder);
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        if (dropTargetSceneFolder === folder) setDropTargetSceneFolder(null);
                        if (sceneFolderDropTarget?.folder === folder) {
                          setSceneFolderDropTarget(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      if (handleExternalDrop(e, 'scene', folder)) {
                        return;
                      }

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
                      isDropHere || isExternalDropActive('scene', folder)
                        ? isAdult
                          ? 'bg-rose-100/70 ring-1 ring-rose-400'
                          : 'bg-sky-100/70 ring-1 ring-sky-400'
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
                            onClick={() => openImportPicker('scene', folder)}
                            title={`${folder} へ既存ファイル(.md / .txt)から読み込み`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-800"
                          >
                            <FileUp className="h-3 w-3" />
                          </button>
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

