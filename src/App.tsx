import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import {
  STANDARD_CHARACTER_CATEGORIES,
  type ActiveMode,
  type BulkFieldAddResult,
  type BulkFieldAddScope,
  type CharacterCommon,
  type CharacterData,
  type CustomCommonFieldTemplate,
  type DualProfileFieldDef,
  type HistorySnapshot,
  type PlotCard,
  type PlotData,
  type SaveStatus,
  type ScenarioWorkspace,
  type SceneData,
  type SelectedItem,
  type VisibilityType,
} from './types/scenario';
import { INITIAL_WORKSPACE, createWorkspaceFromTemplate } from './data/initialProject';
import { exportScenarioBundle } from './utils/scenarioEngine';
import {
  AUTO_SNAPSHOT_INTERVAL_MS,
  HISTORY_DIR_NAME,
  getCharacterFilename,
  getPlotFilename,
  getSceneFilename,
  normalizeWorkspace,
  sanitizeCharacterFolderName,
  sanitizeSceneFolderName,
  saveWorkspaceToBrowser,
  storageManager,
  triggerDownload,
  type DirectoryConnectResult,
  type FSDirectoryHandle,
} from './utils/storageManager';
import { HeaderBar } from './components/HeaderBar';
import { HistoryModal } from './components/HistoryModal';
import { LeftTreePane } from './components/LeftTreePane';
import {
  SceneEditorPane,
  type SceneEditorHandle,
} from './components/SceneEditorPane';
import { CharacterEditorPane } from './components/CharacterEditorPane';
import { PlotBoard, type MoveCardPosition } from './components/PlotBoard';
import { NewPlotModal, type CreatePlotPayload } from './components/NewPlotModal';
import {
  EmptyFolderModal,
  NewProjectModal,
  ResetBrowserProjectModal,
  type EmptyFolderChoice,
  type ProjectCreationSpec,
} from './components/ProjectSwitchModal';
import { RightInspectorPane } from './components/RightInspectorPane';
import { OfflineIndicator } from './components/OfflineIndicator';

const DEBOUNCE_SAVE_MS = 2500;

type ViewportTier = 'wide' | 'medium' | 'narrow';

function getViewportTier(): ViewportTier {
  if (typeof window === 'undefined') return 'wide';
  if (window.innerWidth >= 1280) return 'wide';
  if (window.innerWidth >= 1024) return 'medium';
  return 'narrow';
}

function getCharacterCommonValueByKey(char: CharacterData, key: string): string {
  if (key === 'shortName') return char.shortName ?? '';
  if (key === 'costume') return char.common.costume ?? char.common.costumeId ?? '';
  const custom = (char.customCommonFields ?? []).find((f) => f.key === key);
  if (custom) return custom.value;
  return (char.common[key as keyof CharacterCommon] as string | undefined) ?? '';
}

export default function App() {
  const [workspace, setWorkspace] = useState<ScenarioWorkspace>(INITIAL_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);

  const [selectedItem, setSelectedItem] = useState<SelectedItem>({
    type: 'scene',
    id: INITIAL_WORKSPACE.scenes[0].sceneId,
  });

  const [splitView, setSplitView] = useState(false);
  const [splitPlotId, setSplitPlotId] = useState<string | null>(null);
  const [isNewPlotModalOpen, setIsNewPlotModalOpen] = useState(false);
  const [verticalWriting, setVerticalWriting] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const [viewportTier, setViewportTier] = useState<ViewportTier>(getViewportTier);
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(() => getViewportTier() !== 'narrow');
  const [rightPaneOpen, setRightPaneOpen] = useState<boolean>(() => getViewportTier() === 'wide');

  const [cursorIndex, setCursorIndex] = useState(0);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    state: 'saved',
    storageMode: 'indexeddb',
    hasPendingChanges: false,
  });
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [pendingReconnectDir, setPendingReconnectDir] = useState<string | null>(null);
  const [pendingEmptyDir, setPendingEmptyDir] = useState<FSDirectoryHandle | null>(null);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isResetBrowserModalOpen, setIsResetBrowserModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<HistorySnapshot[]>([]);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  const sceneEditorRef = useRef<SceneEditorHandle>(null);
  const latestWorkspaceRef = useRef<ScenarioWorkspace>(workspace);
  latestWorkspaceRef.current = workspace;
  const historySnapshotsRef = useRef<HistorySnapshot[]>(historySnapshots);
  historySnapshotsRef.current = historySnapshots;
  const saveStatusRef = useRef<SaveStatus>(saveStatus);
  saveStatusRef.current = saveStatus;
  const skipNextSaveEffectRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const autoSnapshotInFlightRef = useRef(false);
  const sessionStartedAtRef = useRef<number>(Date.now());
  const baselineFingerprintRef = useRef<string>('');

  const performSave = useCallback(async () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    setSaveStatus((prev) => ({ ...prev, state: 'saving' }));
    try {
      const target = latestWorkspaceRef.current;
      const { storageMode, directoryName } = await storageManager.save(target);
      const savedAt = new Date().toISOString();

      setSaveStatus({
        state: 'saved',
        storageMode,
        directoryName,
        lastSavedAt: savedAt,
        hasPendingChanges: false,
        nextAutoSaveAt: undefined,
      });
    } catch {
      setSaveStatus((prev) => ({
        ...prev,
        state: 'error',
        nextAutoSaveAt: undefined,
      }));
    }
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (debounceTimerRef.current !== null || saveStatusRef.current.hasPendingChanges) {
      await performSave();
    }
  }, [performSave]);

  const applyLoadedWorkspace = useCallback((loaded: ScenarioWorkspace) => {
    skipNextSaveEffectRef.current = true;
    setWorkspace(loaded);
    setSplitPlotId(null);
    setCursorIndex(0);
    if (loaded.scenes.length > 0) {
      setSelectedItem({ type: 'scene', id: loaded.scenes[0].sceneId });
    } else if (loaded.plots.length > 0) {
      setSelectedItem({ type: 'plot', id: loaded.plots[0].plotId });
    } else if (loaded.characters.length > 0) {
      setSelectedItem({ type: 'character', id: loaded.characters[0].id });
    } else {
      setSelectedItem({ type: 'scene', id: '' });
    }
  }, []);

  const refreshHistory = useCallback(async (resetSessionBaseline = false) => {
    try {
      const list = await storageManager.listHistory();
      setHistorySnapshots(list);
      if (resetSessionBaseline) {
        sessionStartedAtRef.current = Date.now();
      }
    } catch {
      // Ignore history read errors so editing is never blocked
    }
  }, []);

  // Initial load from connected folder / IndexedDB / localStorage
  useEffect(() => {
    let active = true;
    storageManager
      .load()
      .then(({ workspace: loaded, storageMode, directoryName, pendingReconnectDirectoryName }) => {
        if (!active) return;
        applyLoadedWorkspace(loaded);
        baselineFingerprintRef.current = JSON.stringify(loaded);
        sessionStartedAtRef.current = Date.now();
        setSaveStatus({
          state: 'saved',
          storageMode,
          directoryName,
          lastSavedAt: new Date().toISOString(),
          hasPendingChanges: false,
        });
        setPendingReconnectDir(pendingReconnectDirectoryName ?? null);
        setHydrated(true);
        void refreshHistory(true);
      });
    return () => {
      active = false;
      if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    };
  }, [applyLoadedWorkspace, refreshHistory]);

  // Periodic automatic snapshot to history/ every 1 hour (only when workspace changed; max 5 rotation)
  useEffect(() => {
    if (!hydrated) return;

    const checkAndSaveAutoSnapshot = async () => {
      if (autoSnapshotInFlightRef.current) return;

      const latestSnap = historySnapshotsRef.current[0];
      const lastTimestamp = latestSnap
        ? Date.parse(latestSnap.createdAt)
        : sessionStartedAtRef.current;
      if (Number.isNaN(lastTimestamp)) return;
      if (Date.now() - lastTimestamp < AUTO_SNAPSHOT_INTERVAL_MS) return;

      const currentWorkspace = latestWorkspaceRef.current;
      const currentFingerprint = JSON.stringify(currentWorkspace);
      const referenceFingerprint = latestSnap
        ? JSON.stringify(latestSnap.workspace)
        : baselineFingerprintRef.current;

      // Skip saving duplicate snapshots if nothing has changed since last snapshot / load
      if (currentFingerprint === referenceFingerprint) return;

      autoSnapshotInFlightRef.current = true;
      try {
        const { snapshots } = await storageManager.saveHistorySnapshot(
          currentWorkspace,
          'auto'
        );
        setHistorySnapshots(snapshots);
        baselineFingerprintRef.current = currentFingerprint;
      } catch {
        // Never interrupt editing on background snapshot failure
      } finally {
        autoSnapshotInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void checkAndSaveAutoSnapshot();
    }, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkAndSaveAutoSnapshot();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hydrated]);

  const handleCreateManualSnapshot = useCallback(async () => {
    if (isSavingSnapshot) return;
    setIsSavingSnapshot(true);
    try {
      await flushPendingSave();
      const target = latestWorkspaceRef.current;
      const { snapshot, snapshots, savedToDirectory } = await storageManager.saveHistorySnapshot(
        target,
        'manual'
      );
      setHistorySnapshots(snapshots);
      baselineFingerprintRef.current = JSON.stringify(target);
      setNoticeBanner(
        savedToDirectory
          ? `スナップショット ${HISTORY_DIR_NAME}/${snapshot.filename} をローカルフォルダとブラウザへ保存しました。`
          : `スナップショット ${HISTORY_DIR_NAME}/${snapshot.filename} をブラウザへ保存しました。`
      );
    } catch {
      setNoticeBanner('スナップショットの保存に失敗しました。');
    } finally {
      setIsSavingSnapshot(false);
    }
  }, [flushPendingSave, isSavingSnapshot]);

  const handleRestoreSnapshot = useCallback(
    async (snapshot: HistorySnapshot) => {
      try {
        await flushPendingSave();
        const restored = normalizeWorkspace(
          JSON.parse(JSON.stringify(snapshot.workspace)) as ScenarioWorkspace
        );
        applyLoadedWorkspace(restored);
        const { storageMode, directoryName } = await storageManager.save(restored);
        baselineFingerprintRef.current = JSON.stringify(restored);
        setSaveStatus({
          state: 'saved',
          storageMode,
          directoryName,
          lastSavedAt: new Date().toISOString(),
          hasPendingChanges: false,
        });
        setIsHistoryModalOpen(false);
        setNoticeBanner(
          `${HISTORY_DIR_NAME}/${snapshot.filename} からワークスペースを復元しました。`
        );
      } catch {
        setNoticeBanner('スナップショットの復元に失敗しました。');
      }
    },
    [applyLoadedWorkspace, flushPendingSave]
  );

  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    try {
      const next = await storageManager.deleteHistorySnapshot(snapshotId);
      setHistorySnapshots(next);
    } catch {
      setNoticeBanner('スナップショットの削除に失敗しました。');
    }
  }, []);

  // Debounced auto-save countdown on workspace changes
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSaveEffectRef.current) {
      skipNextSaveEffectRef.current = false;
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    const targetTime = Date.now() + DEBOUNCE_SAVE_MS;
    setSaveStatus((prev) => ({
      ...prev,
      state: 'saved',
      hasPendingChanges: true,
      nextAutoSaveAt: targetTime,
    }));

    debounceTimerRef.current = window.setTimeout(() => {
      void performSave();
    }, DEBOUNCE_SAVE_MS);
  }, [workspace, hydrated, performSave]);

  const activeMode = workspace.project.activeMode;

  // Sync theme-color meta tag with active mode
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', activeMode === 'adult' ? '#be123c' : '#334155');
    }
  }, [activeMode]);

  const handleToggleMode = useCallback((nextMode: ActiveMode) => {
    setWorkspace((prev) => {
      if (prev.project.activeMode === nextMode) return prev;
      return {
        ...prev,
        project: {
          ...prev.project,
          activeMode: nextMode,
        },
      };
    });
  }, []);

  // Adaptive 3-stage viewport tier sync (wide >= 1280, medium 1024-1279, narrow < 1024)
  useEffect(() => {
    const handleResize = () => {
      const next = getViewportTier();
      setViewportTier((prev) => {
        if (prev === next) return prev;
        if (next === 'wide') {
          setLeftPaneOpen(true);
          setRightPaneOpen(true);
        } else if (next === 'medium') {
          setLeftPaneOpen(true);
          setRightPaneOpen(false);
        } else {
          setLeftPaneOpen(false);
          setRightPaneOpen(false);
        }
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isLeftOverlay = viewportTier === 'narrow';
  const isRightOverlay = viewportTier !== 'wide';
  const showLeftPane = !focusMode && leftPaneOpen;
  const showRightPane = !focusMode && rightPaneOpen;

  const handleToggleLeftPane = useCallback(() => {
    if (focusMode) {
      setFocusMode(false);
      setLeftPaneOpen(true);
      if (isLeftOverlay) {
        setRightPaneOpen(false);
      }
      return;
    }
    setLeftPaneOpen((prev) => {
      const next = !prev;
      if (next && isLeftOverlay) {
        setRightPaneOpen(false);
      }
      return next;
    });
  }, [focusMode, isLeftOverlay]);

  const handleToggleRightPane = useCallback(() => {
    if (focusMode) {
      setFocusMode(false);
      setRightPaneOpen(true);
      if (isLeftOverlay) {
        setLeftPaneOpen(false);
      }
      return;
    }
    setRightPaneOpen((prev) => {
      const next = !prev;
      if (next && isLeftOverlay) {
        setLeftPaneOpen(false);
      }
      return next;
    });
  }, [focusMode, isLeftOverlay]);

  // Global keyboard shortcuts: Ctrl/Cmd + Shift + M for mode switch, Esc to close overlays or exit Focus Mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleMode(activeMode === 'general' ? 'adult' : 'general');
      } else if (e.key === 'Escape') {
        if (isLeftOverlay && showLeftPane) {
          setLeftPaneOpen(false);
        } else if (isRightOverlay && showRightPane) {
          setRightPaneOpen(false);
        } else if (focusMode) {
          setFocusMode(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeMode,
    focusMode,
    handleToggleMode,
    isLeftOverlay,
    isRightOverlay,
    showLeftPane,
    showRightPane,
  ]);

  const activeScene = useMemo(() => {
    if (selectedItem.type !== 'scene') return null;
    return workspace.scenes.find((s) => s.sceneId === selectedItem.id) ?? null;
  }, [workspace.scenes, selectedItem]);

  const activeCharacter = useMemo(() => {
    if (selectedItem.type !== 'character') return null;
    return workspace.characters.find((c) => c.id === selectedItem.id) ?? null;
  }, [workspace.characters, selectedItem]);

  const activePlot = useMemo(() => {
    if (selectedItem.type === 'plot') {
      return workspace.plots.find((p) => p.plotId === selectedItem.id) ?? workspace.plots[0];
    }
    if (splitPlotId) {
      const manual = workspace.plots.find((p) => p.plotId === splitPlotId);
      if (manual) return manual;
    }
    if (activeScene) {
      const linked = workspace.plots.find((p) =>
        p.cards.some((c) => c.linkedSceneId === activeScene.sceneId)
      );
      if (linked) return linked;
    }
    return workspace.plots[0];
  }, [workspace.plots, selectedItem, splitPlotId, activeScene]);

  const handleDirectoryConnectResult = (result: DirectoryConnectResult) => {
    if (result.status === 'connected' && result.handle) {
      if (result.loadedWorkspace) {
        applyLoadedWorkspace(result.loadedWorkspace);
        baselineFingerprintRef.current = JSON.stringify(result.loadedWorkspace);
      }
      setPendingReconnectDir(null);
      setSaveStatus({
        state: 'saved',
        storageMode: 'filesystem',
        directoryName: result.handle.name,
        lastSavedAt: new Date().toISOString(),
        hasPendingChanges: false,
      });
      setNoticeBanner(result.message);
      void refreshHistory(true);
      return;
    }

    if (result.status === 'needs-init-choice' && result.handle) {
      setPendingEmptyDir(result.handle);
      return;
    }

    if (result.status !== 'cancelled') {
      setNoticeBanner(result.message);
    }
  };

  const handleConnectFolder = async () => {
    await flushPendingSave();
    const result = await storageManager.connectDirectory(latestWorkspaceRef.current);
    handleDirectoryConnectResult(result);
  };

  const handleReconnectFolder = async () => {
    await flushPendingSave();
    const result = await storageManager.reconnectStoredDirectory();
    handleDirectoryConnectResult(result);
  };

  const handleDisconnectFolder = async () => {
    await flushPendingSave();
    await storageManager.disconnectDirectory();
    const mode = await saveWorkspaceToBrowser(latestWorkspaceRef.current);
    setPendingReconnectDir(null);
    setSaveStatus({
      state: 'saved',
      storageMode: mode,
      lastSavedAt: new Date().toISOString(),
      hasPendingChanges: false,
    });
    setNoticeBanner('フォルダ連携を解除し、ブラウザ内保存へ切り替えました。');
    void refreshHistory(true);
  };

  const handleCreateProjectInFolder = async (
    spec: ProjectCreationSpec & { folderName: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    const pick = await storageManager.pickParentDirectoryForNewProject();
    if (pick.status === 'cancelled') {
      return { ok: false };
    }
    if (pick.status !== 'picked' || !pick.handle) {
      return { ok: false, error: pick.message };
    }

    const exists = await storageManager.checkSubdirectoryExists(pick.handle, spec.folderName);
    if (exists) {
      return {
        ok: false,
        error: `保存先「${pick.handle.name}」内にフォルダ「${spec.folderName}」が既に存在します。別のフォルダ名に変更するか、「フォルダ変更」から既存フォルダを開いてください。`,
      };
    }

    await flushPendingSave();

    const nextWorkspace = createWorkspaceFromTemplate({
      title: spec.title,
      template: spec.template,
      activeMode: spec.activeMode,
    });

    try {
      const subDir = await storageManager.createProjectInNewSubdirectory(
        pick.handle,
        spec.folderName,
        nextWorkspace
      );
      applyLoadedWorkspace(nextWorkspace);
      baselineFingerprintRef.current = JSON.stringify(nextWorkspace);
      setPendingReconnectDir(null);
      setSaveStatus({
        state: 'saved',
        storageMode: 'filesystem',
        directoryName: subDir.name,
        lastSavedAt: new Date().toISOString(),
        hasPendingChanges: false,
      });
      setIsNewProjectModalOpen(false);
      setNoticeBanner(
        `保存先「${pick.handle.name}/${subDir.name}」に新規プロジェクト「${nextWorkspace.project.title}」を作成し、同期を開始しました。`
      );
      void refreshHistory(true);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'フォルダの作成・書き出しに失敗しました。書き込み権限をご確認ください。',
      };
    }
  };

  const handleConfirmEmptyFolderChoice = async (
    choice: EmptyFolderChoice,
    spec: ProjectCreationSpec
  ) => {
    if (!pendingEmptyDir) return;
    const handle = pendingEmptyDir;
    const targetWorkspace =
      choice === 'export-current'
        ? latestWorkspaceRef.current
        : createWorkspaceFromTemplate({
            title: spec.title,
            template: spec.template,
            activeMode: spec.activeMode,
          });

    try {
      await storageManager.initializeDirectory(handle, targetWorkspace);
      if (choice === 'new-blank') {
        applyLoadedWorkspace(targetWorkspace);
      } else {
        skipNextSaveEffectRef.current = true;
      }
      baselineFingerprintRef.current = JSON.stringify(targetWorkspace);
      setPendingReconnectDir(null);
      setSaveStatus({
        state: 'saved',
        storageMode: 'filesystem',
        directoryName: handle.name,
        lastSavedAt: new Date().toISOString(),
        hasPendingChanges: false,
      });
      setNoticeBanner(
        choice === 'new-blank'
          ? `フォルダ「${handle.name}」で新規プロジェクト「${targetWorkspace.project.title}」を開始しました。`
          : `フォルダ「${handle.name}」へ現在の作業内容を書き出し、同期を開始しました。`
      );
      void refreshHistory(true);
    } catch {
      setNoticeBanner(`フォルダ「${handle.name}」への書き込みに失敗しました。`);
    } finally {
      setPendingEmptyDir(null);
    }
  };

  const handleConfirmResetBrowserProject = async (spec: ProjectCreationSpec) => {
    await flushPendingSave();
    const nextWorkspace = createWorkspaceFromTemplate({
      title: spec.title,
      template: spec.template,
      activeMode: spec.activeMode,
    });
    const mode = await storageManager.resetToBrowserWorkspace(nextWorkspace);
    applyLoadedWorkspace(nextWorkspace);
    baselineFingerprintRef.current = JSON.stringify(nextWorkspace);
    setPendingReconnectDir(null);
    void refreshHistory(true);
    setSaveStatus({
      state: 'saved',
      storageMode: mode,
      lastSavedAt: new Date().toISOString(),
      hasPendingChanges: false,
    });
    setIsResetBrowserModalOpen(false);
    setNoticeBanner(
      `新規プロジェクト「${nextWorkspace.project.title}」を作成しました（ブラウザ内保存）。`
    );
  };

  const handleUpdateScene = (updated: SceneData) => {
    setWorkspace((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => (s.sceneId === updated.sceneId ? updated : s)),
    }));
  };

  const handleUpdateCharacter = (updated: CharacterData) => {
    setWorkspace((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === updated.id ? updated : c)),
    }));
  };

  const handleBulkAddCommonField = useCallback(
    ({
      sourceCharacterId,
      field,
      scope,
      saveAsDefault,
    }: {
      sourceCharacterId: string;
      field: CustomCommonFieldTemplate;
      scope: BulkFieldAddScope;
      saveAsDefault: boolean;
    }): BulkFieldAddResult => {
      const sourceChar = workspace.characters.find((c) => c.id === sourceCharacterId);
      const sourceFolder = sourceChar?.folder;
      const isTarget = (c: CharacterData) => {
        if (scope === 'all') return true;
        if (scope === 'same_folder' && sourceFolder) {
          return c.folder === sourceFolder;
        }
        return c.id === sourceCharacterId;
      };

      let addedCount = 0;
      let skippedCount = 0;
      for (const c of workspace.characters) {
        if (!isTarget(c)) continue;
        if ((c.customCommonFields ?? []).some((f) => f.key === field.key)) {
          skippedCount++;
        } else {
          addedCount++;
        }
      }

      const alreadyInTemplate = (workspace.project.defaultCustomCommonFields ?? []).some(
        (t) => t.key === field.key
      );
      const registeredTemplate = saveAsDefault && !alreadyInTemplate;

      setWorkspace((prev) => {
        const prevSource = prev.characters.find((c) => c.id === sourceCharacterId);
        const prevFolder = prevSource?.folder;
        const matches = (c: CharacterData) => {
          if (scope === 'all') return true;
          if (scope === 'same_folder' && prevFolder) {
            return c.folder === prevFolder;
          }
          return c.id === sourceCharacterId;
        };

        const cleanCategory =
          typeof field.category === 'string' && field.category.trim()
            ? field.category.trim()
            : undefined;
        const standardCatSet = new Set<string>(STANDARD_CHARACTER_CATEGORIES);

        const nextCharacters = prev.characters.map((c) => {
          if (!matches(c)) return c;
          const existing = c.customCommonFields ?? [];
          if (existing.some((f) => f.key === field.key)) return c;
          return {
            ...c,
            customCommonFields: [
              ...existing,
              {
                key: field.key,
                label: field.label,
                value: '',
                multiline: Boolean(field.multiline),
                category: cleanCategory,
              },
            ],
          };
        });

        const prevDefaults = prev.project.defaultCustomCommonFields ?? [];
        const nextDefaults =
          saveAsDefault && !prevDefaults.some((t) => t.key === field.key)
            ? [
                ...prevDefaults,
                {
                  key: field.key,
                  label: field.label,
                  multiline: Boolean(field.multiline),
                  category: cleanCategory,
                },
              ]
            : prevDefaults;

        const prevCustomCategories = prev.project.customCharacterCategories ?? [];
        const nextCustomCategories =
          cleanCategory &&
          !standardCatSet.has(cleanCategory) &&
          !prevCustomCategories.includes(cleanCategory)
            ? [...prevCustomCategories, cleanCategory]
            : prevCustomCategories;

        return {
          ...prev,
          characters: nextCharacters,
          project: {
            ...prev.project,
            defaultCustomCommonFields: nextDefaults,
            customCharacterCategories: nextCustomCategories,
          },
        };
      });

      return { addedCount, skippedCount, registeredTemplate };
    },
    [workspace.characters, workspace.project.defaultCustomCommonFields]
  );

  const handleBulkAddDualField = useCallback(
    ({
      sourceCharacterId,
      field,
      scope,
      saveAsDefault,
    }: {
      sourceCharacterId: string;
      field: DualProfileFieldDef;
      scope: BulkFieldAddScope;
      saveAsDefault: boolean;
    }): BulkFieldAddResult => {
      const sourceChar = workspace.characters.find((c) => c.id === sourceCharacterId);
      const sourceFolder = sourceChar?.folder;
      const isTarget = (c: CharacterData) => {
        if (scope === 'all') return true;
        if (scope === 'same_folder' && sourceFolder) {
          return c.folder === sourceFolder;
        }
        return c.id === sourceCharacterId;
      };

      let addedCount = 0;
      let skippedCount = 0;
      for (const c of workspace.characters) {
        if (!isTarget(c)) continue;
        if ((c.dualFields ?? []).some((f) => f.key === field.key)) {
          skippedCount++;
        } else {
          addedCount++;
        }
      }

      const alreadyInTemplate = (workspace.project.defaultDualFields ?? []).some(
        (t) => t.key === field.key
      );
      const registeredTemplate = saveAsDefault && !alreadyInTemplate;

      setWorkspace((prev) => {
        const prevSource = prev.characters.find((c) => c.id === sourceCharacterId);
        const prevFolder = prevSource?.folder;
        const matches = (c: CharacterData) => {
          if (scope === 'all') return true;
          if (scope === 'same_folder' && prevFolder) {
            return c.folder === prevFolder;
          }
          return c.id === sourceCharacterId;
        };

        const nextCharacters = prev.characters.map((c) => {
          if (!matches(c)) return c;
          const existingDual = c.dualFields ?? [];
          if (existingDual.some((f) => f.key === field.key)) return c;

          const baseVal = getCharacterCommonValueByKey(c, field.key);
          const prevGeneral = c.profiles?.general?.[field.key];
          const prevAdult = c.profiles?.adult?.[field.key];

          return {
            ...c,
            dualFields: [
              ...existingDual,
              {
                key: field.key,
                label: field.label,
                multiline: Boolean(field.multiline),
              },
            ],
            profiles: {
              general: {
                ...(c.profiles?.general ?? {}),
                [field.key]: prevGeneral ?? baseVal,
              },
              adult: {
                ...(c.profiles?.adult ?? {}),
                [field.key]: prevAdult ?? baseVal,
              },
            },
          };
        });

        const prevDefaults = prev.project.defaultDualFields ?? [];
        const nextDefaults =
          saveAsDefault && !prevDefaults.some((t) => t.key === field.key)
            ? [
                ...prevDefaults,
                {
                  key: field.key,
                  label: field.label,
                  multiline: Boolean(field.multiline),
                },
              ]
            : prevDefaults;

        return {
          ...prev,
          characters: nextCharacters,
          project: {
            ...prev.project,
            defaultDualFields: nextDefaults,
          },
        };
      });

      return { addedCount, skippedCount, registeredTemplate };
    },
    [workspace.characters, workspace.project.defaultDualFields]
  );

  const handleRemoveDefaultCommonField = useCallback((key: string) => {
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        defaultCustomCommonFields: (prev.project.defaultCustomCommonFields ?? []).filter(
          (f) => f.key !== key
        ),
      },
    }));
  }, []);

  const handleRemoveDefaultDualField = useCallback((key: string) => {
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        defaultDualFields: (prev.project.defaultDualFields ?? []).filter(
          (f) => f.key !== key
        ),
      },
    }));
  }, []);

  const handleUpdatePlot = (updated: PlotData) => {
    setWorkspace((prev) => ({
      ...prev,
      plots: prev.plots.map((p) => (p.plotId === updated.plotId ? updated : p)),
      project: {
        ...prev.project,
        chapters: prev.project.chapters.map((ch) =>
          ch.plotId === updated.plotId ? { ...ch, title: updated.title } : ch
        ),
      },
    }));
  };

  const handleAssignSceneToCard = useCallback(
    (targetPlotId: string, targetCardId: string, sceneId: string) => {
      setWorkspace((prev) => ({
        ...prev,
        plots: prev.plots.map((p) => ({
          ...p,
          cards: p.cards.map((c) => {
            if (p.plotId === targetPlotId && c.cardId === targetCardId) {
              return { ...c, linkedSceneId: sceneId };
            }
            if (sceneId && c.linkedSceneId === sceneId) {
              return { ...c, linkedSceneId: '' };
            }
            return c;
          }),
        })),
      }));
    },
    []
  );

  const moveScenesToFolderInList = (
    scenes: SceneData[],
    sceneIds: string[],
    targetFolder?: string
  ): { scenes: SceneData[]; movedCount: number; renamedCount: number } => {
    const cleanFolder = sanitizeSceneFolderName(targetFolder) || undefined;
    const idSet = new Set(sceneIds);
    if (idSet.size === 0) return { scenes, movedCount: 0, renamedCount: 0 };

    const siblingsInDest = new Set(
      scenes
        .filter(
          (s) =>
            (s.folder ?? undefined) === cleanFolder &&
            (!idSet.has(s.sceneId) || (s.folder ?? undefined) === cleanFolder)
        )
        .map((s) => getSceneFilename(s).toLowerCase())
    );

    let movedCount = 0;
    let renamedCount = 0;

    const nextScenes = scenes.map((s) => {
      if (!idSet.has(s.sceneId)) return s;
      if ((s.folder ?? undefined) === cleanFolder) return s;

      const origFilename = getSceneFilename(s);
      let nextFilename = origFilename;
      if (siblingsInDest.has(nextFilename.toLowerCase())) {
        const base = nextFilename.replace(/\.md$/i, '');
        let n = 2;
        while (siblingsInDest.has(`${base}_${n}.md`.toLowerCase())) n++;
        nextFilename = `${base}_${n}.md`;
        renamedCount += 1;
      }
      siblingsInDest.add(nextFilename.toLowerCase());
      movedCount += 1;
      return { ...s, folder: cleanFolder, filename: nextFilename };
    });

    return { scenes: nextScenes, movedCount, renamedCount };
  };

  const handleMoveCardToPlot = useCallback(
    (
      sourcePlotId: string,
      targetPlotId: string,
      cardId: string,
      options: {
        position: MoveCardPosition;
        openTargetPlot: boolean;
        moveLinkedSceneToTargetFolder?: boolean;
      }
    ) => {
      if (sourcePlotId === targetPlotId) return;

      const currentWorkspace = latestWorkspaceRef.current;
      const sourcePlot = currentWorkspace.plots.find((p) => p.plotId === sourcePlotId);
      const targetPlot = currentWorkspace.plots.find((p) => p.plotId === targetPlotId);
      const movingCard = sourcePlot?.cards.find((c) => c.cardId === cardId);
      if (!sourcePlot || !targetPlot || !movingCard) return;

      const linkedSceneId = movingCard.linkedSceneId;
      const linkedSceneObj = linkedSceneId
        ? currentWorkspace.scenes.find((s) => s.sceneId === linkedSceneId)
        : undefined;
      const willMoveSceneFolder = Boolean(
        options.moveLinkedSceneToTargetFolder &&
          linkedSceneObj &&
          targetPlot.linkedSceneFolder &&
          (linkedSceneObj.folder ?? undefined) !== targetPlot.linkedSceneFolder
      );

      setWorkspace((prev) => {
        const prevSource = prev.plots.find((p) => p.plotId === sourcePlotId);
        const prevTarget = prev.plots.find((p) => p.plotId === targetPlotId);
        if (!prevSource || !prevTarget) return prev;

        const cardToMove = prevSource.cards.find((c) => c.cardId === cardId);
        if (!cardToMove) return prev;

        const targetExistingIds = new Set(prevTarget.cards.map((c) => c.cardId));
        let nextCardId = cardToMove.cardId;
        if (targetExistingIds.has(nextCardId)) {
          do {
            nextCardId = `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
          } while (targetExistingIds.has(nextCardId));
        }

        const normalizedCard: PlotCard = {
          ...cardToMove,
          cardId: nextCardId,
          connections: undefined,
          chartPos: undefined,
          inStaging: undefined,
        };

        const nextSourceCards = [...prevSource.cards]
          .sort((a, b) => a.order - b.order)
          .filter((c) => c.cardId !== cardId)
          .map((c, idx) => {
            const nextConnections = c.connections?.filter(
              (conn) => conn.targetCardId !== cardId
            );
            return {
              ...c,
              order: idx + 1,
              connections:
                nextConnections && nextConnections.length > 0 ? nextConnections : undefined,
            };
          });

        const targetSorted = [...prevTarget.cards].sort((a, b) => a.order - b.order);
        const combinedTarget =
          options.position === 'start'
            ? [normalizedCard, ...targetSorted]
            : [...targetSorted, normalizedCard];
        const nextTargetCards = combinedTarget.map((c, idx) => ({ ...c, order: idx + 1 }));

        let nextChapters = prev.project.chapters;
        if (cardToMove.linkedSceneId) {
          const sid = cardToMove.linkedSceneId;
          const hasTargetChapter = prev.project.chapters.some(
            (ch) => ch.plotId === targetPlotId
          );
          const hasSourceChapter = prev.project.chapters.some(
            (ch) => ch.plotId === sourcePlotId
          );

          if (hasTargetChapter) {
            nextChapters = prev.project.chapters.map((ch) => {
              const filtered = ch.sceneIds.filter((id) => id !== sid);
              if (ch.plotId === targetPlotId) {
                return {
                  ...ch,
                  sceneIds:
                    options.position === 'start'
                      ? [sid, ...filtered]
                      : [...filtered, sid],
                };
              }
              return filtered.length !== ch.sceneIds.length
                ? { ...ch, sceneIds: filtered }
                : ch;
            });
          } else if (hasSourceChapter) {
            nextChapters = prev.project.chapters.map((ch) =>
              ch.plotId === sourcePlotId
                ? { ...ch, sceneIds: ch.sceneIds.filter((id) => id !== sid) }
                : ch
            );
          }
        }

        let nextScenes = prev.scenes;
        let nextSceneFolders = prev.project.sceneFolders ?? [];
        if (
          options.moveLinkedSceneToTargetFolder &&
          cardToMove.linkedSceneId &&
          prevTarget.linkedSceneFolder
        ) {
          const movedRes = moveScenesToFolderInList(
            prev.scenes,
            [cardToMove.linkedSceneId],
            prevTarget.linkedSceneFolder
          );
          nextScenes = movedRes.scenes;
          if (!nextSceneFolders.includes(prevTarget.linkedSceneFolder)) {
            nextSceneFolders = [...nextSceneFolders, prevTarget.linkedSceneFolder];
          }
        }

        return {
          ...prev,
          scenes: nextScenes,
          plots: prev.plots.map((p) => {
            if (p.plotId === sourcePlotId) return { ...p, cards: nextSourceCards };
            if (p.plotId === targetPlotId) return { ...p, cards: nextTargetCards };
            return p;
          }),
          project: {
            ...prev.project,
            sceneFolders: nextSceneFolders,
            chapters: nextChapters,
          },
        };
      });

      if (options.openTargetPlot) {
        setSplitPlotId(targetPlotId);
        if (selectedItem.type === 'plot') {
          setSelectedItem({ type: 'plot', id: targetPlotId });
        }
      }

      const cardLabel =
        movingCard.title?.trim() || `#${String(movingCard.order).padStart(2, '0')}`;
      const targetName = `${targetPlot.title || '無題プロット'} (${getPlotFilename(targetPlot)})`;
      if (willMoveSceneFolder && targetPlot.linkedSceneFolder) {
        setNoticeBanner(
          `カード「${cardLabel}」を「${targetName}」へ移動し、紐付けシーンも「${targetPlot.linkedSceneFolder}/」へ移動しました。`
        );
      } else {
        setNoticeBanner(
          linkedSceneId
            ? `カード「${cardLabel}」を「${targetName}」へ移動しました（章シーンリストも連動）。`
            : `カード「${cardLabel}」を「${targetName}」へ移動しました。`
        );
      }
    },
    [selectedItem.type]
  );

  const handleCreateSceneAndLink = useCallback((plotId: string, cardId: string) => {
    const current = latestWorkspaceRef.current;
    const targetPlot = current.plots.find((p) => p.plotId === plotId);
    const targetCard = targetPlot?.cards.find((c) => c.cardId === cardId);
    if (!targetPlot || !targetCard) return;

    const cleanFolder = sanitizeSceneFolderName(targetPlot.linkedSceneFolder) || undefined;
    const num = current.scenes.length + 1;
    const id = `scene_${String(num).padStart(2, '0')}_${Date.now().toString(36).slice(-4)}`;
    const sceneTitle = targetCard.title?.trim() || `新規シーン ${num}`;

    setWorkspace((prev) => {
      const prevPlot = prev.plots.find((p) => p.plotId === plotId);
      const prevCard = prevPlot?.cards.find((c) => c.cardId === cardId);
      if (!prevPlot || !prevCard) return prev;

      const folderName = sanitizeSceneFolderName(prevPlot.linkedSceneFolder) || undefined;
      const siblingsInDest = new Set(
        prev.scenes
          .filter((s) => (s.folder ?? undefined) === folderName)
          .map((s) => getSceneFilename(s).toLowerCase())
      );
      let filename = `${id}.md`;
      if (siblingsInDest.has(filename.toLowerCase())) {
        let n = 2;
        while (siblingsInDest.has(`${id}_${n}.md`.toLowerCase())) n++;
        filename = `${id}_${n}.md`;
      }

      const newScene: SceneData = {
        sceneId: id,
        filename,
        folder: folderName,
        title: sceneTitle,
        visibility: prevCard.visibility,
        characters:
          prevCard.characters && prevCard.characters.length > 0
            ? [...prevCard.characters]
            : prev.characters.map((c) => c.id),
        body: '',
      };

      const prevFolders = prev.project.sceneFolders ?? [];
      const nextFolders =
        folderName && !prevFolders.includes(folderName)
          ? [...prevFolders, folderName]
          : prevFolders;

      const nextChapters = prev.project.chapters.map((ch) =>
        ch.plotId === plotId && !ch.sceneIds.includes(id)
          ? { ...ch, sceneIds: [...ch.sceneIds, id] }
          : ch
      );

      const nextScenes = [...prev.scenes, newScene];
      return {
        ...prev,
        scenes: nextScenes,
        plots: prev.plots.map((p) =>
          p.plotId === plotId
            ? {
                ...p,
                cards: p.cards.map((c) =>
                  c.cardId === cardId ? { ...c, linkedSceneId: id } : c
                ),
              }
            : p
        ),
        project: {
          ...prev.project,
          sceneFolders: nextFolders,
          sceneOrder: nextScenes.map((s) => s.sceneId),
          chapters: nextChapters,
        },
      };
    });

    setNoticeBanner(
      cleanFolder
        ? `シーン「${sceneTitle}」を「${cleanFolder}/」に作成して紐付けました。`
        : `シーン「${sceneTitle}」を作成して紐付けました。`
    );
  }, []);

  const handleMoveScenesToFolder = useCallback((sceneIds: string[], targetFolder: string) => {
    const cleanFolder = sanitizeSceneFolderName(targetFolder) || undefined;
    if (!cleanFolder || sceneIds.length === 0) return;

    const current = latestWorkspaceRef.current;
    const preview = moveScenesToFolderInList(current.scenes, sceneIds, cleanFolder);
    if (preview.movedCount === 0) return;

    setWorkspace((prev) => {
      const moved = moveScenesToFolderInList(prev.scenes, sceneIds, cleanFolder);
      const prevFolders = prev.project.sceneFolders ?? [];
      const nextFolders = prevFolders.includes(cleanFolder)
        ? prevFolders
        : [...prevFolders, cleanFolder];
      return {
        ...prev,
        project: {
          ...prev.project,
          sceneFolders: nextFolders,
        },
        scenes: moved.scenes,
      };
    });

    setNoticeBanner(
      preview.renamedCount > 0
        ? `${preview.movedCount}件のシーンを「${cleanFolder}/」へ移動しました（重複ファイル名 ${preview.renamedCount}件に連番付与）。`
        : `${preview.movedCount}件のシーンを「${cleanFolder}/」へ移動しました。`
    );
  }, []);

  const handleAddScene = (folder?: string) => {
    const cleanFolder = sanitizeSceneFolderName(folder) || undefined;
    const num = workspace.scenes.length + 1;
    const id = `scene_${String(num).padStart(2, '0')}_${Date.now().toString(36).slice(-4)}`;
    const newScene: SceneData = {
      sceneId: id,
      filename: `${id}.md`,
      folder: cleanFolder,
      title: `新規シーン ${num}`,
      visibility: activeMode === 'adult' ? 'adult_only' : 'common',
      characters: workspace.characters.map((c) => c.id),
      body: '',
    };
    setWorkspace((prev) => {
      const nextScenes = [...prev.scenes, newScene];
      return {
        ...prev,
        scenes: nextScenes,
        project: {
          ...prev.project,
          sceneOrder: nextScenes.map((s) => s.sceneId),
          chapters: prev.project.chapters.map((ch, idx) =>
            idx === 0 ? { ...ch, sceneIds: [...ch.sceneIds, id] } : ch
          ),
        },
      };
    });
    setSelectedItem({ type: 'scene', id });
  };

  const handleDeleteScene = (sceneId: string) => {
    setWorkspace((prev) => {
      const remaining = prev.scenes.filter((s) => s.sceneId !== sceneId);
      if (selectedItem.type === 'scene' && selectedItem.id === sceneId && remaining[0]) {
        setSelectedItem({ type: 'scene', id: remaining[0].sceneId });
      }
      return {
        ...prev,
        scenes: remaining,
        plots: prev.plots.map((p) => ({
          ...p,
          cards: p.cards.map((c) =>
            c.linkedSceneId === sceneId ? { ...c, linkedSceneId: '' } : c
          ),
        })),
        project: {
          ...prev.project,
          sceneOrder: remaining.map((s) => s.sceneId),
          chapters: prev.project.chapters.map((ch) => ({
            ...ch,
            sceneIds: ch.sceneIds.filter((id) => id !== sceneId),
          })),
        },
      };
    });
  };

  const handleCreateSceneFolder = (
    rawName: string
  ): { ok: boolean; error?: string } => {
    const clean = sanitizeSceneFolderName(rawName);
    if (!clean) {
      return { ok: false, error: '有効なフォルダ名を入力してください。' };
    }
    const existing = workspace.project.sceneFolders ?? [];
    if (existing.some((f) => f.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: '同名のフォルダが既に存在します。' };
    }
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        sceneFolders: [...(prev.project.sceneFolders ?? []), clean],
      },
    }));
    return { ok: true };
  };

  const handleRenameSceneFolder = (
    oldName: string,
    rawNewName: string
  ): { ok: boolean; error?: string } => {
    const clean = sanitizeSceneFolderName(rawNewName);
    if (!clean) {
      return { ok: false, error: '有効なフォルダ名を入力してください。' };
    }
    if (clean === oldName) return { ok: true };
    const existing = workspace.project.sceneFolders ?? [];
    if (
      existing.some(
        (f) => f !== oldName && f.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return { ok: false, error: '同名のフォルダが既に存在します。' };
    }
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        sceneFolders: (prev.project.sceneFolders ?? []).map((f) =>
          f === oldName ? clean : f
        ),
      },
      scenes: prev.scenes.map((s) =>
        s.folder === oldName ? { ...s, folder: clean } : s
      ),
      plots: prev.plots.map((p) =>
        p.linkedSceneFolder === oldName ? { ...p, linkedSceneFolder: clean } : p
      ),
    }));
    return { ok: true };
  };

  const handleDeleteSceneFolder = (folderName: string) => {
    setWorkspace((prev) => {
      const targetRootFiles = new Set(
        prev.scenes
          .filter((s) => !s.folder)
          .map((s) => getSceneFilename(s).toLowerCase())
      );

      const updatedScenes = prev.scenes.map((s) => {
        if (s.folder !== folderName) return s;
        let nextFilename = getSceneFilename(s);
        if (targetRootFiles.has(nextFilename.toLowerCase())) {
          const base = nextFilename.replace(/\.md$/i, '');
          let n = 2;
          while (targetRootFiles.has(`${base}_${n}.md`.toLowerCase())) n++;
          nextFilename = `${base}_${n}.md`;
        }
        targetRootFiles.add(nextFilename.toLowerCase());
        return { ...s, folder: undefined, filename: nextFilename };
      });

      return {
        ...prev,
        project: {
          ...prev.project,
          sceneFolders: (prev.project.sceneFolders ?? []).filter(
            (f) => f !== folderName
          ),
        },
        scenes: updatedScenes,
        plots: prev.plots.map((p) =>
          p.linkedSceneFolder === folderName ? { ...p, linkedSceneFolder: undefined } : p
        ),
      };
    });
  };

  const handleMoveSceneToFolder = (sceneId: string, folder?: string) => {
    const cleanFolder = sanitizeSceneFolderName(folder) || undefined;
    setWorkspace((prev) => {
      const targetScene = prev.scenes.find((s) => s.sceneId === sceneId);
      if (!targetScene) return prev;
      if ((targetScene.folder ?? undefined) === cleanFolder) return prev;

      const siblingsInDest = new Set(
        prev.scenes
          .filter(
            (s) =>
              s.sceneId !== sceneId &&
              (s.folder ?? undefined) === cleanFolder
          )
          .map((s) => getSceneFilename(s).toLowerCase())
      );

      let nextFilename = getSceneFilename(targetScene);
      if (siblingsInDest.has(nextFilename.toLowerCase())) {
        const base = nextFilename.replace(/\.md$/i, '');
        let n = 2;
        while (siblingsInDest.has(`${base}_${n}.md`.toLowerCase())) n++;
        nextFilename = `${base}_${n}.md`;
      }

      const prevFolders = prev.project.sceneFolders ?? [];
      const nextFolders =
        cleanFolder && !prevFolders.includes(cleanFolder)
          ? [...prevFolders, cleanFolder]
          : prevFolders;

      return {
        ...prev,
        project: {
          ...prev.project,
          sceneFolders: nextFolders,
        },
        scenes: prev.scenes.map((s) =>
          s.sceneId === sceneId
            ? { ...s, folder: cleanFolder, filename: nextFilename }
            : s
        ),
      };
    });
  };

  const handleReorderScene = useCallback(
    (sourceSceneId: string, targetSceneId: string, side: 'before' | 'after') => {
      if (sourceSceneId === targetSceneId) return;
      setWorkspace((prev) => {
        const fromIndex = prev.scenes.findIndex((s) => s.sceneId === sourceSceneId);
        const hoverIndex = prev.scenes.findIndex((s) => s.sceneId === targetSceneId);
        if (fromIndex === -1 || hoverIndex === -1) return prev;

        const sourceScene = prev.scenes[fromIndex];
        const targetScene = prev.scenes[hoverIndex];
        const sourceFolder = sourceScene.folder ?? undefined;
        const targetFolder = targetScene.folder ?? undefined;

        const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
        const insertAt = Math.max(
          0,
          Math.min(prev.scenes.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
        );
        if (insertAt === fromIndex && sourceFolder === targetFolder) return prev;

        let nextFilename = getSceneFilename(sourceScene);
        if (sourceFolder !== targetFolder) {
          const siblingsInDest = new Set(
            prev.scenes
              .filter(
                (s) =>
                  s.sceneId !== sourceSceneId && (s.folder ?? undefined) === targetFolder
              )
              .map((s) => getSceneFilename(s).toLowerCase())
          );
          if (siblingsInDest.has(nextFilename.toLowerCase())) {
            const base = nextFilename.replace(/\.md$/i, '');
            let n = 2;
            while (siblingsInDest.has(`${base}_${n}.md`.toLowerCase())) n++;
            nextFilename = `${base}_${n}.md`;
          }
        }

        const movedScene: SceneData =
          sourceFolder === targetFolder
            ? sourceScene
            : { ...sourceScene, folder: targetFolder, filename: nextFilename };

        const nextScenes = [...prev.scenes];
        nextScenes.splice(fromIndex, 1);
        nextScenes.splice(insertAt, 0, movedScene);

        const prevFolders = prev.project.sceneFolders ?? [];
        const nextFolders =
          targetFolder && !prevFolders.includes(targetFolder)
            ? [...prevFolders, targetFolder]
            : prevFolders;

        return {
          ...prev,
          scenes: nextScenes,
          project: {
            ...prev.project,
            sceneFolders: nextFolders,
            sceneOrder: nextScenes.map((s) => s.sceneId),
          },
        };
      });
    },
    []
  );

  const handleReorderSceneFolder = useCallback(
    (sourceFolder: string, targetFolder: string, side: 'before' | 'after') => {
      if (sourceFolder === targetFolder) return;
      setWorkspace((prev) => {
        const current = prev.project.sceneFolders ?? [];
        const fromIndex = current.indexOf(sourceFolder);
        const hoverIndex = current.indexOf(targetFolder);
        if (fromIndex === -1 || hoverIndex === -1) return prev;

        const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
        const insertAt = Math.max(
          0,
          Math.min(current.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
        );
        if (insertAt === fromIndex) return prev;

        const nextFolders = [...current];
        const [moved] = nextFolders.splice(fromIndex, 1);
        nextFolders.splice(insertAt, 0, moved);

        return {
          ...prev,
          project: {
            ...prev.project,
            sceneFolders: nextFolders,
          },
        };
      });
    },
    []
  );

  const handleAddCharacter = (folder?: string) => {
    const cleanFolder = sanitizeCharacterFolderName(folder) || undefined;
    const num = workspace.characters.length + 1;
    const id = `char_${num}_${Date.now().toString(36).slice(-3)}`;

    setWorkspace((prev) => {
      const defaultCommonTemplates = prev.project.defaultCustomCommonFields ?? [];
      const defaultDualTemplates = prev.project.defaultDualFields ?? [];

      const baseChar: CharacterData = {
        id,
        filename: `${id}.json`,
        folder: cleanFolder,
        shortName: `キャラ${num}`,
        common: {
          name: `新規キャラクター ${num}`,
          ruby: 'しんきキャラクター',
          firstPerson: '私',
          ageDisplay: '17歳',
          relationship: 'クラスメイト',
          callPartner: '結城くん',
          secondPerson: 'あなた',
          speechStyle: '丁寧語',
          costume: '制服',
          personality: '',
          height: '',
          weight: '',
          bodyType: '',
          hairstyle: '',
          facialFeatures: '',
          posture: '',
          hobbies: '',
          skills: '',
          specialAbilities: '',
          weaknesses: '',
        },
        customCommonFields: defaultCommonTemplates.map((tpl) => ({
          key: tpl.key,
          label: tpl.label,
          value: '',
          multiline: Boolean(tpl.multiline),
          category: tpl.category,
        })),
        dualFields: defaultDualTemplates.map((tpl) => ({
          key: tpl.key,
          label: tpl.label,
          multiline: Boolean(tpl.multiline),
        })),
        profiles: {
          general: {},
          adult: {},
        },
        lockedFields: [],
      };

      for (const tpl of defaultDualTemplates) {
        const baseVal = getCharacterCommonValueByKey(baseChar, tpl.key);
        baseChar.profiles.general[tpl.key] = baseVal;
        baseChar.profiles.adult[tpl.key] = baseVal;
      }

      const nextCharacters = [...prev.characters, baseChar];
      return {
        ...prev,
        characters: nextCharacters,
        project: {
          ...prev.project,
          characterOrder: nextCharacters.map((c) => c.id),
        },
      };
    });
    setSelectedItem({ type: 'character', id });
  };

  const handleCreateCharacterFolder = (
    rawName: string
  ): { ok: boolean; error?: string } => {
    const clean = sanitizeCharacterFolderName(rawName);
    if (!clean) {
      return { ok: false, error: '有効なフォルダ名を入力してください。' };
    }
    const existing = workspace.project.characterFolders ?? [];
    if (existing.some((f) => f.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: '同名のフォルダが既に存在します。' };
    }
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        characterFolders: [...(prev.project.characterFolders ?? []), clean],
      },
    }));
    return { ok: true };
  };

  const handleRenameCharacterFolder = (
    oldName: string,
    rawNewName: string
  ): { ok: boolean; error?: string } => {
    const clean = sanitizeCharacterFolderName(rawNewName);
    if (!clean) {
      return { ok: false, error: '有効なフォルダ名を入力してください。' };
    }
    if (clean === oldName) return { ok: true };
    const existing = workspace.project.characterFolders ?? [];
    if (
      existing.some(
        (f) => f !== oldName && f.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return { ok: false, error: '同名のフォルダが既に存在します。' };
    }
    setWorkspace((prev) => ({
      ...prev,
      project: {
        ...prev.project,
        characterFolders: (prev.project.characterFolders ?? []).map((f) =>
          f === oldName ? clean : f
        ),
      },
      characters: prev.characters.map((c) =>
        c.folder === oldName ? { ...c, folder: clean } : c
      ),
    }));
    return { ok: true };
  };

  const handleDeleteCharacterFolder = (folderName: string) => {
    setWorkspace((prev) => {
      const targetRootFiles = new Set(
        prev.characters
          .filter((c) => !c.folder)
          .map((c) => getCharacterFilename(c).toLowerCase())
      );

      const updatedChars = prev.characters.map((c) => {
        if (c.folder !== folderName) return c;
        let nextFilename = getCharacterFilename(c);
        if (targetRootFiles.has(nextFilename.toLowerCase())) {
          const base = nextFilename.replace(/\.json$/i, '');
          let n = 2;
          while (targetRootFiles.has(`${base}_${n}.json`.toLowerCase())) n++;
          nextFilename = `${base}_${n}.json`;
        }
        targetRootFiles.add(nextFilename.toLowerCase());
        return { ...c, folder: undefined, filename: nextFilename };
      });

      return {
        ...prev,
        project: {
          ...prev.project,
          characterFolders: (prev.project.characterFolders ?? []).filter(
            (f) => f !== folderName
          ),
        },
        characters: updatedChars,
      };
    });
  };

  const handleMoveCharacterToFolder = (characterId: string, folder?: string) => {
    const cleanFolder = sanitizeCharacterFolderName(folder) || undefined;
    setWorkspace((prev) => {
      const targetChar = prev.characters.find((c) => c.id === characterId);
      if (!targetChar) return prev;
      if ((targetChar.folder ?? undefined) === cleanFolder) return prev;

      const siblingsInDest = new Set(
        prev.characters
          .filter(
            (c) =>
              c.id !== characterId &&
              (c.folder ?? undefined) === cleanFolder
          )
          .map((c) => getCharacterFilename(c).toLowerCase())
      );

      let nextFilename = getCharacterFilename(targetChar);
      if (siblingsInDest.has(nextFilename.toLowerCase())) {
        const base = nextFilename.replace(/\.json$/i, '');
        let n = 2;
        while (siblingsInDest.has(`${base}_${n}.json`.toLowerCase())) n++;
        nextFilename = `${base}_${n}.json`;
      }

      const prevFolders = prev.project.characterFolders ?? [];
      const nextFolders =
        cleanFolder && !prevFolders.includes(cleanFolder)
          ? [...prevFolders, cleanFolder]
          : prevFolders;

      return {
        ...prev,
        project: {
          ...prev.project,
          characterFolders: nextFolders,
        },
        characters: prev.characters.map((c) =>
          c.id === characterId
            ? { ...c, folder: cleanFolder, filename: nextFilename }
            : c
        ),
      };
    });
  };

  const handleReorderCharacter = useCallback(
    (sourceCharId: string, targetCharId: string, side: 'before' | 'after') => {
      if (sourceCharId === targetCharId) return;
      setWorkspace((prev) => {
        const fromIndex = prev.characters.findIndex((c) => c.id === sourceCharId);
        const hoverIndex = prev.characters.findIndex((c) => c.id === targetCharId);
        if (fromIndex === -1 || hoverIndex === -1) return prev;

        const sourceChar = prev.characters[fromIndex];
        const targetChar = prev.characters[hoverIndex];
        const sourceFolder = sourceChar.folder ?? undefined;
        const targetFolder = targetChar.folder ?? undefined;

        const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
        const insertAt = Math.max(
          0,
          Math.min(prev.characters.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
        );
        if (insertAt === fromIndex && sourceFolder === targetFolder) return prev;

        let nextFilename = getCharacterFilename(sourceChar);
        if (sourceFolder !== targetFolder) {
          const siblingsInDest = new Set(
            prev.characters
              .filter(
                (c) => c.id !== sourceCharId && (c.folder ?? undefined) === targetFolder
              )
              .map((c) => getCharacterFilename(c).toLowerCase())
          );
          if (siblingsInDest.has(nextFilename.toLowerCase())) {
            const base = nextFilename.replace(/\.json$/i, '');
            let n = 2;
            while (siblingsInDest.has(`${base}_${n}.json`.toLowerCase())) n++;
            nextFilename = `${base}_${n}.json`;
          }
        }

        const movedChar: CharacterData =
          sourceFolder === targetFolder
            ? sourceChar
            : { ...sourceChar, folder: targetFolder, filename: nextFilename };

        const nextCharacters = [...prev.characters];
        nextCharacters.splice(fromIndex, 1);
        nextCharacters.splice(insertAt, 0, movedChar);

        const prevFolders = prev.project.characterFolders ?? [];
        const nextFolders =
          targetFolder && !prevFolders.includes(targetFolder)
            ? [...prevFolders, targetFolder]
            : prevFolders;

        return {
          ...prev,
          characters: nextCharacters,
          project: {
            ...prev.project,
            characterFolders: nextFolders,
            characterOrder: nextCharacters.map((c) => c.id),
          },
        };
      });
    },
    []
  );

  const handleReorderCharacterFolder = useCallback(
    (sourceFolder: string, targetFolder: string, side: 'before' | 'after') => {
      if (sourceFolder === targetFolder) return;
      setWorkspace((prev) => {
        const current = prev.project.characterFolders ?? [];
        const fromIndex = current.indexOf(sourceFolder);
        const hoverIndex = current.indexOf(targetFolder);
        if (fromIndex === -1 || hoverIndex === -1) return prev;

        const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
        const insertAt = Math.max(
          0,
          Math.min(current.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
        );
        if (insertAt === fromIndex) return prev;

        const nextFolders = [...current];
        const [moved] = nextFolders.splice(fromIndex, 1);
        nextFolders.splice(insertAt, 0, moved);

        return {
          ...prev,
          project: {
            ...prev.project,
            characterFolders: nextFolders,
          },
        };
      });
    },
    []
  );

  const handleAddPlot = (payload: CreatePlotPayload) => {
    const suffix = Date.now().toString(36).slice(-4);
    const num = workspace.plots.length + 1;
    const prefix =
      payload.scope === 'chapter'
        ? `plot_ch${String(num).padStart(2, '0')}`
        : `plot_${payload.scope}`;
    const plotId = `${prefix}_${suffix}`;
    const filename = `${plotId}.json`;
    const chapterId =
      payload.scope === 'chapter'
        ? `chapter_${String(workspace.project.chapters.length + 1).padStart(2, '0')}_${suffix}`
        : undefined;

    const baseChars = payload.targetCharacterId ? [payload.targetCharacterId] : [];
    const basePov = payload.targetCharacterId ?? '';
    const defaultVisibility: VisibilityType = activeMode === 'adult' ? 'adult_only' : 'common';

    const initialCards =
      payload.template === 'kishotenketsu'
        ? [
            {
              cardId: `card_${suffix}_1`,
              order: 1,
              visibility: defaultVisibility,
              status: 'todo' as const,
              title: '起：導入・日常の提示',
              memo: '舞台設定や登場人物の関係性、このエピソードの発端となる出来事を描く。',
              linkedSceneId: '',
              characters: baseChars,
              povCharacterId: basePov,
              mood: '日常',
              goal: '状況と初期の動機を明確にする',
            },
            {
              cardId: `card_${suffix}_2`,
              order: 2,
              visibility: defaultVisibility,
              status: 'todo' as const,
              title: '承：展開・距離の変化',
              memo: '出来事を受けて関係性や状況が動き出す中盤の展開。',
              linkedSceneId: '',
              characters: baseChars,
              povCharacterId: basePov,
              mood: '穏やか・少し甘い',
              goal: '山場に向けた葛藤や親密さを積み上げる',
            },
            {
              cardId: `card_${suffix}_3`,
              order: 3,
              visibility: defaultVisibility,
              status: 'todo' as const,
              title: '転：山場・転換点',
              memo: '感情の衝突、告白、秘密の発覚、あるいは決定的なターニングポイント。',
              linkedSceneId: '',
              characters: baseChars,
              povCharacterId: basePov,
              mood: '緊迫',
              goal: '物語や二人の関係に不可逆な変化を起こす',
            },
            {
              cardId: `card_${suffix}_4`,
              order: 4,
              visibility: defaultVisibility,
              status: 'todo' as const,
              title: '結：決着・余韻と次への引き',
              memo: '山場を経た二人の変化を描き、次の展開・章への余韻を残す。',
              linkedSceneId: '',
              characters: baseChars,
              povCharacterId: basePov,
              mood: '切ない',
              goal: 'このプロットの着地点を示し、次へ繋ぐ',
            },
          ]
        : [
            {
              cardId: `card_${suffix}_1`,
              order: 1,
              visibility: defaultVisibility,
              status: 'todo' as const,
              title: '新規プロットカード 1',
              memo: '',
              linkedSceneId: '',
              characters: baseChars,
              povCharacterId: basePov,
            },
          ];

    const requestedFolder = sanitizeSceneFolderName(payload.linkedSceneFolder);
    const existingFolders = workspace.project.sceneFolders ?? [];
    const matchedExistingFolder = requestedFolder
      ? existingFolders.find((f) => f.toLowerCase() === requestedFolder.toLowerCase())
      : undefined;
    const resolvedLinkedFolder =
      payload.sceneFolderMode === 'none'
        ? undefined
        : matchedExistingFolder ?? (requestedFolder || undefined);

    const newPlot: PlotData = {
      plotId,
      filename,
      chapterId,
      scope: payload.scope,
      linkedSceneFolder: resolvedLinkedFolder,
      title: payload.title,
      cards: initialCards,
    };

    setWorkspace((prev) => {
      const nextPlots = [...prev.plots, newPlot];
      const prevFolders = prev.project.sceneFolders ?? [];
      const nextSceneFolders =
        resolvedLinkedFolder &&
        !prevFolders.some((f) => f.toLowerCase() === resolvedLinkedFolder.toLowerCase())
          ? [...prevFolders, resolvedLinkedFolder]
          : prevFolders;

      return {
        ...prev,
        plots: nextPlots,
        project: {
          ...prev.project,
          plotOrder: nextPlots.map((p) => p.plotId),
          sceneFolders: nextSceneFolders,
          chapters: chapterId
            ? [
                ...prev.project.chapters,
                {
                  chapterId,
                  title: payload.title,
                  plotId,
                  sceneIds: [],
                },
              ]
            : prev.project.chapters,
        },
      };
    });

    setIsNewPlotModalOpen(false);
    setSplitPlotId(plotId);
    setSelectedItem({ type: 'plot', id: plotId });
  };

  const handleDeletePlot = (plotId: string) => {
    setWorkspace((prev) => {
      if (prev.plots.length <= 1) return prev;
      const remainingPlots = prev.plots.filter((p) => p.plotId !== plotId);
      if (selectedItem.type === 'plot' && selectedItem.id === plotId && remainingPlots[0]) {
        setSelectedItem({ type: 'plot', id: remainingPlots[0].plotId });
      }
      if (splitPlotId === plotId) {
        setSplitPlotId(null);
      }
      return {
        ...prev,
        plots: remainingPlots,
        project: {
          ...prev.project,
          plotOrder: remainingPlots.map((p) => p.plotId),
          chapters: prev.project.chapters.filter(
            (ch) => ch.plotId !== plotId || ch.sceneIds.length > 0
          ),
        },
      };
    });
  };

  const handleReorderPlot = useCallback(
    (sourcePlotId: string, targetPlotId: string, side: 'before' | 'after') => {
      if (sourcePlotId === targetPlotId) return;

      setWorkspace((prev) => {
        const fromIndex = prev.plots.findIndex((p) => p.plotId === sourcePlotId);
        const hoverIndex = prev.plots.findIndex((p) => p.plotId === targetPlotId);
        if (fromIndex === -1 || hoverIndex === -1) return prev;

        const rawTarget = side === 'before' ? hoverIndex : hoverIndex + 1;
        const insertAt = Math.max(
          0,
          Math.min(prev.plots.length - 1, fromIndex < rawTarget ? rawTarget - 1 : rawTarget)
        );
        if (insertAt === fromIndex) return prev;

        const nextPlots = [...prev.plots];
        const [moved] = nextPlots.splice(fromIndex, 1);
        nextPlots.splice(insertAt, 0, moved);

        const nextPlotOrder = nextPlots.map((p) => p.plotId);
        const orderIndex = new Map(nextPlotOrder.map((id, idx) => [id, idx]));

        const nextChapters = [...prev.project.chapters].sort((a, b) => {
          const idxA = orderIndex.get(a.plotId);
          const idxB = orderIndex.get(b.plotId);
          if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
          if (idxA !== undefined) return -1;
          if (idxB !== undefined) return 1;
          return 0;
        });

        return {
          ...prev,
          plots: nextPlots,
          project: {
            ...prev.project,
            plotOrder: nextPlotOrder,
            chapters: nextChapters,
          },
        };
      });
    },
    []
  );

  const handleExportCurrentScene = () => {
    if (!activeScene) return;
    const { filename, content } = exportScenarioBundle(
      workspace.project,
      workspace.scenes,
      workspace.characters,
      workspace.plots,
      activeMode,
      activeScene
    );
    triggerDownload(filename, content);
  };

  const handleExportAllScenes = () => {
    const { filename, content } = exportScenarioBundle(
      workspace.project,
      workspace.scenes,
      workspace.characters,
      workspace.plots,
      activeMode
    );
    triggerDownload(filename, content);
  };

  const leftTreeElement = (
    <LeftTreePane
      activeMode={activeMode}
      characters={workspace.characters}
      characterFolders={workspace.project.characterFolders ?? []}
      plots={workspace.plots}
      scenes={workspace.scenes}
      sceneFolders={workspace.project.sceneFolders ?? []}
      selectedItem={selectedItem}
      onSelect={(item) => {
        setSelectedItem(item);
        if (isLeftOverlay) {
          setLeftPaneOpen(false);
        }
      }}
      onAddScene={handleAddScene}
      onDeleteScene={handleDeleteScene}
      onCreateSceneFolder={handleCreateSceneFolder}
      onRenameSceneFolder={handleRenameSceneFolder}
      onDeleteSceneFolder={handleDeleteSceneFolder}
      onMoveSceneToFolder={handleMoveSceneToFolder}
      onReorderScene={handleReorderScene}
      onReorderSceneFolder={handleReorderSceneFolder}
      onAddCharacter={handleAddCharacter}
      onCreateCharacterFolder={handleCreateCharacterFolder}
      onRenameCharacterFolder={handleRenameCharacterFolder}
      onDeleteCharacterFolder={handleDeleteCharacterFolder}
      onMoveCharacterToFolder={handleMoveCharacterToFolder}
      onReorderCharacter={handleReorderCharacter}
      onReorderCharacterFolder={handleReorderCharacterFolder}
      onAddPlot={() => setIsNewPlotModalOpen(true)}
      onDeletePlot={handleDeletePlot}
      onReorderPlot={handleReorderPlot}
      isOverlay={isLeftOverlay}
      onClose={isLeftOverlay ? () => setLeftPaneOpen(false) : undefined}
    />
  );

  const rightInspectorElement = (
    <RightInspectorPane
      activeMode={activeMode}
      selectedItemType={selectedItem.type}
      scene={activeScene}
      characters={workspace.characters}
      cursorIndex={cursorIndex}
      onJumpToLine={(line) => sceneEditorRef.current?.jumpToLine(line)}
      onInsertSnippet={(snippet, caretBefore) =>
        sceneEditorRef.current?.insertAtCursor(snippet, caretBefore)
      }
      isOverlay={isRightOverlay}
      onClose={isRightOverlay ? () => setRightPaneOpen(false) : undefined}
    />
  );

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
      <HeaderBar
        projectTitle={workspace.project.title}
        onChangeProjectTitle={(title) =>
          setWorkspace((prev) => ({
            ...prev,
            project: { ...prev.project, title },
          }))
        }
        activeMode={activeMode}
        onToggleMode={handleToggleMode}
        saveStatus={saveStatus}
        onSaveNow={() => void performSave()}
        pendingReconnectDirectoryName={pendingReconnectDir}
        onConnectFolder={() => void handleConnectFolder()}
        onReconnectFolder={() => void handleReconnectFolder()}
        onDisconnectFolder={() => void handleDisconnectFolder()}
        onRequestNewProject={() => setIsNewProjectModalOpen(true)}
        onRequestResetBrowserProject={() => setIsResetBrowserModalOpen(true)}
        onExportCurrentScene={handleExportCurrentScene}
        onExportAllScenes={handleExportAllScenes}
        hasActiveScene={!!activeScene}
        historyCount={historySnapshots.length}
        onOpenHistory={() => {
          setIsHistoryModalOpen(true);
          void refreshHistory();
        }}
        leftPaneOpen={showLeftPane}
        rightPaneOpen={showRightPane}
        onToggleLeftPane={handleToggleLeftPane}
        onToggleRightPane={handleToggleRightPane}
      />

      {pendingReconnectDir && saveStatus.storageMode !== 'filesystem' && !noticeBanner && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50/80 px-4 py-1.5 text-xs text-amber-900">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <span className="truncate">
              前回の同期フォルダ「{pendingReconnectDir}」へのアクセス権限が保留中です。再接続するとディスク同期を再開できます。
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleReconnectFolder()}
              className="rounded border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              フォルダに再接続
            </button>
            <button
              type="button"
              onClick={() => setPendingReconnectDir(null)}
              className="rounded p-0.5 text-amber-700 hover:bg-amber-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {noticeBanner && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-1.5 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>{noticeBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeBanner(null)}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main 3-Pane Workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left Pane: Docked Inline (wide / medium) */}
        {showLeftPane && !isLeftOverlay && leftTreeElement}

        {/* Left Pane: Slide-over Overlay Drawer (narrow < 1024px) */}
        {showLeftPane && isLeftOverlay && (
          <div className="fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
              onClick={() => setLeftPaneOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 flex h-full">{leftTreeElement}</div>
          </div>
        )}

        {/* Center Pane: Scene Editor / Character Editor / Plot Board (@container for pane-aware responsiveness) */}
        <main className="@container flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedItem.type === 'scene' && activeScene && (
            <SceneEditorPane
              ref={sceneEditorRef}
              scene={activeScene}
              allScenes={workspace.scenes}
              sceneFolders={workspace.project.sceneFolders ?? []}
              characters={workspace.characters}
              activePlot={activePlot}
              allPlots={workspace.plots}
              activeMode={activeMode}
              splitView={splitView}
              onToggleSplitView={() => setSplitView((v) => !v)}
              verticalWriting={verticalWriting}
              onToggleVerticalWriting={() => setVerticalWriting((v) => !v)}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((v) => !v)}
              onUpdateScene={handleUpdateScene}
              onMoveSceneToFolder={handleMoveSceneToFolder}
              onUpdatePlot={handleUpdatePlot}
              onAssignSceneToCard={handleAssignSceneToCard}
              onCreateSceneAndLink={handleCreateSceneAndLink}
              onMoveScenesToFolder={handleMoveScenesToFolder}
              onMoveCardToPlot={handleMoveCardToPlot}
              onSelectSplitPlot={(pid) => setSplitPlotId(pid)}
              onOpenScene={(id) => setSelectedItem({ type: 'scene', id })}
              onCursorChange={(idx) => setCursorIndex(idx)}
            />
          )}

          {selectedItem.type === 'character' && activeCharacter && (
            <CharacterEditorPane
              character={activeCharacter}
              allCharacters={workspace.characters}
              characterFolders={workspace.project.characterFolders ?? []}
              defaultCustomCommonFields={workspace.project.defaultCustomCommonFields ?? []}
              defaultDualFields={workspace.project.defaultDualFields ?? []}
              characterFieldMultiline={workspace.project.characterFieldMultiline ?? {}}
              customCharacterCategories={workspace.project.customCharacterCategories ?? []}
              activeMode={activeMode}
              onUpdateCharacter={handleUpdateCharacter}
              onRegisterCharacterCategory={(rawCategory) => {
                const clean = rawCategory.trim();
                if (!clean) return;
                if ((STANDARD_CHARACTER_CATEGORIES as readonly string[]).includes(clean)) return;
                setWorkspace((prev) => {
                  const prevCats = prev.project.customCharacterCategories ?? [];
                  if (prevCats.includes(clean)) return prev;
                  return {
                    ...prev,
                    project: {
                      ...prev.project,
                      customCharacterCategories: [...prevCats, clean],
                    },
                  };
                });
              }}
              onChangeCharacterFieldMultiline={(key, multiline, defaultMultiline) => {
                setWorkspace((prev) => {
                  const nextMap = { ...(prev.project.characterFieldMultiline ?? {}) };
                  if (multiline === defaultMultiline) {
                    delete nextMap[key];
                  } else {
                    nextMap[key] = multiline;
                  }
                  return {
                    ...prev,
                    project: {
                      ...prev.project,
                      characterFieldMultiline: nextMap,
                    },
                  };
                });
              }}
              onResetCharacterFieldMultiline={() => {
                setWorkspace((prev) => ({
                  ...prev,
                  project: {
                    ...prev.project,
                    characterFieldMultiline: {},
                  },
                }));
              }}
              onBulkAddCommonField={handleBulkAddCommonField}
              onBulkAddDualField={handleBulkAddDualField}
              onRemoveDefaultCommonField={handleRemoveDefaultCommonField}
              onRemoveDefaultDualField={handleRemoveDefaultDualField}
              onMoveCharacterToFolder={handleMoveCharacterToFolder}
            />
          )}

          {selectedItem.type === 'plot' && activePlot && (
            <PlotBoard
              plot={activePlot}
              allPlots={workspace.plots}
              scenes={workspace.scenes}
              sceneFolders={workspace.project.sceneFolders ?? []}
              characters={workspace.characters}
              activeMode={activeMode}
              onUpdatePlot={handleUpdatePlot}
              onAssignSceneToCard={handleAssignSceneToCard}
              onCreateSceneAndLink={handleCreateSceneAndLink}
              onMoveScenesToFolder={handleMoveScenesToFolder}
              onMoveCardToPlot={handleMoveCardToPlot}
              onOpenScene={(id) => setSelectedItem({ type: 'scene', id })}
            />
          )}

          {!(
            (selectedItem.type === 'scene' && activeScene) ||
            (selectedItem.type === 'character' && activeCharacter) ||
            (selectedItem.type === 'plot' && activePlot)
          ) && (
            <div className="flex h-full flex-col items-center justify-center bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-800">
                選択中の項目がありません
              </p>
              <p className="mt-1 text-xs text-slate-500">
                左側のプロジェクトツリーから項目を選ぶか、新しいシーン・キャラクターを追加してください。
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddScene()}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  シーンを追加
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCharacter()}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  キャラクターを追加
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Pane: Docked Inline (wide >= 1280px) */}
        {showRightPane && !isRightOverlay && rightInspectorElement}

        {/* Right Pane: Slide-over Overlay Drawer (medium / narrow < 1280px) */}
        {showRightPane && isRightOverlay && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <div
              className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
              onClick={() => setRightPaneOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 flex h-full">{rightInspectorElement}</div>
          </div>
        )}
      </div>

      <OfflineIndicator />

      <NewPlotModal
        isOpen={isNewPlotModalOpen}
        activeMode={activeMode}
        existingPlotCount={workspace.plots.length}
        chapterCount={workspace.project.chapters.length}
        characters={workspace.characters}
        sceneFolders={workspace.project.sceneFolders ?? []}
        onClose={() => setIsNewPlotModalOpen(false)}
        onCreate={handleAddPlot}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        activeMode={activeMode}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreateInFolder={handleCreateProjectInFolder}
        onSwitchToBrowserFallback={() => setIsResetBrowserModalOpen(true)}
      />

      <EmptyFolderModal
        isOpen={!!pendingEmptyDir}
        folderName={pendingEmptyDir?.name ?? ''}
        currentProjectTitle={workspace.project.title}
        activeMode={activeMode}
        onClose={() => setPendingEmptyDir(null)}
        onConfirm={(choice, spec) => void handleConfirmEmptyFolderChoice(choice, spec)}
      />

      <ResetBrowserProjectModal
        isOpen={isResetBrowserModalOpen}
        currentProjectTitle={workspace.project.title}
        isFilesystemConnected={saveStatus.storageMode === 'filesystem'}
        activeMode={activeMode}
        onClose={() => setIsResetBrowserModalOpen(false)}
        onConfirm={(spec) => void handleConfirmResetBrowserProject(spec)}
      />

      <HistoryModal
        isOpen={isHistoryModalOpen}
        activeMode={activeMode}
        storageMode={saveStatus.storageMode}
        directoryName={saveStatus.directoryName}
        snapshots={historySnapshots}
        isSavingSnapshot={isSavingSnapshot}
        onClose={() => setIsHistoryModalOpen(false)}
        onCreateSnapshot={() => void handleCreateManualSnapshot()}
        onRestoreSnapshot={(snap) => void handleRestoreSnapshot(snap)}
        onDeleteSnapshot={(id) => void handleDeleteSnapshot(id)}
      />
    </div>
  );
}
