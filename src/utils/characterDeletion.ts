import type {
  CharacterData,
  CharacterRelation,
  ScenarioWorkspace,
  SelectedItem,
} from '../types/scenario';
import { getCharacterFilename } from './storageManager';

export interface BodyTagSceneRef {
  sceneId: string;
  title: string;
  varCount: number;
  imgCount: number;
}

export interface CharacterDeleteImpact {
  character: CharacterData;
  filename: string;
  folder?: string;
  imageCount: number;
  sceneCastCount: number;
  sceneCastTitles: string[];
  plotCardCount: number;
  worldRefCount: number;
  worldRefNames: string[];
  otherRelationCount: number;
  otherRelationNames: string[];
  bodyVariableTagCount: number;
  bodyImageQuoteCount: number;
  bodyTagScenes: BodyTagSceneRef[];
  totalStructuredRefs: number;
  totalBodyTagRefs: number;
}

export interface CharacterDeleteUndoSnapshot {
  deletedCharacter: CharacterData;
  originalIndex: number;
  hadFolderInProjectList: boolean;
  removedOtherRelations: Array<{
    characterId: string;
    entries: Array<{ index: number; relation: CharacterRelation }>;
  }>;
  removedWorldRefIds: string[];
  removedPlotCardRefs: Array<{
    plotId: string;
    cardId: string;
    hadInCharacters: boolean;
    hadAsPov: boolean;
  }>;
  removedSceneCastIds: string[];
  cleanedStructuredRefCount: number;
  previousSelectedItem: SelectedItem;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeCharacterDeleteImpact(
  workspace: ScenarioWorkspace,
  characterId: string
): CharacterDeleteImpact | null {
  const character = workspace.characters.find((c) => c.id === characterId);
  if (!character) return null;

  const escapedId = escapeRegExp(characterId);
  // Matches {{charId.xxx}} and {{otherId.callPartner.charId}} / {{otherId.relationship.charId}}
  const varTagRegex = new RegExp(
    `\\{\\{\\s*(?:${escapedId}\\.[^}]+|(?!world\\.)[^.}\\s]+\\.(?:callPartner|relationship)\\.${escapedId})\\s*\\}\\}`,
    'g'
  );
  // Matches [IMG: char:charId:imgId | ...]
  const imgQuoteRegex = new RegExp(
    `\\[IMG:\\s*char:${escapedId}:[^\\]|\\n]+(?:\\|[^\\]\\n]*)?\\]`,
    'gi'
  );

  const sceneCastTitles: string[] = [];
  const bodyTagScenes: BodyTagSceneRef[] = [];
  let bodyVariableTagCount = 0;
  let bodyImageQuoteCount = 0;

  for (const scene of workspace.scenes) {
    if ((scene.characters ?? []).includes(characterId)) {
      sceneCastTitles.push(scene.title || scene.sceneId);
    }

    const body = scene.body ?? '';
    const varMatches = body.match(varTagRegex);
    const imgMatches = body.match(imgQuoteRegex);
    const varCount = varMatches ? varMatches.length : 0;
    const imgCount = imgMatches ? imgMatches.length : 0;

    if (varCount > 0 || imgCount > 0) {
      bodyVariableTagCount += varCount;
      bodyImageQuoteCount += imgCount;
      bodyTagScenes.push({
        sceneId: scene.sceneId,
        title: scene.title || scene.sceneId,
        varCount,
        imgCount,
      });
    }
  }

  let plotCardCount = 0;
  for (const plot of workspace.plots) {
    for (const card of plot.cards) {
      const inChars = (card.characters ?? []).includes(characterId);
      const isPov = card.povCharacterId === characterId;
      if (inChars || isPov) {
        plotCardCount += 1;
      }
    }
  }

  const worldRefNames: string[] = [];
  for (const w of workspace.worldSettings ?? []) {
    if ((w.relatedCharacterIds ?? []).includes(characterId)) {
      worldRefNames.push(w.name || w.id);
    }
  }

  const otherRelationNames: string[] = [];
  for (const other of workspace.characters) {
    if (other.id === characterId) continue;
    if ((other.relations ?? []).some((rel) => rel.targetCharacterId === characterId)) {
      otherRelationNames.push(other.common.name || other.id);
    }
  }

  const sceneCastCount = sceneCastTitles.length;
  const worldRefCount = worldRefNames.length;
  const otherRelationCount = otherRelationNames.length;
  const totalStructuredRefs =
    sceneCastCount + plotCardCount + worldRefCount + otherRelationCount;
  const totalBodyTagRefs = bodyVariableTagCount + bodyImageQuoteCount;

  return {
    character,
    filename: getCharacterFilename(character),
    folder: character.folder,
    imageCount: (character.images ?? []).length,
    sceneCastCount,
    sceneCastTitles,
    plotCardCount,
    worldRefCount,
    worldRefNames,
    otherRelationCount,
    otherRelationNames,
    bodyVariableTagCount,
    bodyImageQuoteCount,
    bodyTagScenes,
    totalStructuredRefs,
    totalBodyTagRefs,
  };
}

export function deleteCharacterFromWorkspace(
  workspace: ScenarioWorkspace,
  characterId: string,
  previousSelectedItem: SelectedItem
): {
  nextWorkspace: ScenarioWorkspace;
  undoSnapshot: CharacterDeleteUndoSnapshot;
} | null {
  const originalIndex = workspace.characters.findIndex((c) => c.id === characterId);
  if (originalIndex === -1) return null;

  const deletedCharacter = workspace.characters[originalIndex];
  const hadFolderInProjectList = Boolean(
    deletedCharacter.folder &&
      (workspace.project.characterFolders ?? []).includes(deletedCharacter.folder)
  );

  const removedOtherRelations: CharacterDeleteUndoSnapshot['removedOtherRelations'] = [];
  const nextCharacters: CharacterData[] = [];

  for (const char of workspace.characters) {
    if (char.id === characterId) continue;
    const prevRelations = char.relations ?? [];
    const removedEntries: Array<{ index: number; relation: CharacterRelation }> = [];
    const keptRelations: CharacterRelation[] = [];

    prevRelations.forEach((rel, idx) => {
      if (rel.targetCharacterId === characterId) {
        removedEntries.push({ index: idx, relation: rel });
      } else {
        keptRelations.push(rel);
      }
    });

    if (removedEntries.length > 0) {
      removedOtherRelations.push({ characterId: char.id, entries: removedEntries });
      nextCharacters.push({ ...char, relations: keptRelations });
    } else {
      nextCharacters.push(char);
    }
  }

  const removedWorldRefIds: string[] = [];
  const nextWorldSettings = (workspace.worldSettings ?? []).map((w) => {
    const prevRelated = w.relatedCharacterIds ?? [];
    if (!prevRelated.includes(characterId)) return w;
    removedWorldRefIds.push(w.id);
    return {
      ...w,
      relatedCharacterIds: prevRelated.filter((id) => id !== characterId),
    };
  });

  const removedPlotCardRefs: CharacterDeleteUndoSnapshot['removedPlotCardRefs'] = [];
  const nextPlots = workspace.plots.map((plot) => {
    let plotChanged = false;
    const nextCards = plot.cards.map((card) => {
      const hadInCharacters = (card.characters ?? []).includes(characterId);
      const hadAsPov = card.povCharacterId === characterId;
      if (!hadInCharacters && !hadAsPov) return card;

      plotChanged = true;
      removedPlotCardRefs.push({
        plotId: plot.plotId,
        cardId: card.cardId,
        hadInCharacters,
        hadAsPov,
      });

      return {
        ...card,
        characters: hadInCharacters
          ? (card.characters ?? []).filter((id) => id !== characterId)
          : card.characters,
        povCharacterId: hadAsPov ? undefined : card.povCharacterId,
      };
    });

    return plotChanged ? { ...plot, cards: nextCards } : plot;
  });

  const removedSceneCastIds: string[] = [];
  const nextScenes = workspace.scenes.map((scene) => {
    const prevChars = scene.characters ?? [];
    if (!prevChars.includes(characterId)) return scene;
    removedSceneCastIds.push(scene.sceneId);
    return {
      ...scene,
      characters: prevChars.filter((id) => id !== characterId),
    };
  });

  const cleanedStructuredRefCount =
    removedOtherRelations.length +
    removedWorldRefIds.length +
    removedPlotCardRefs.length +
    removedSceneCastIds.length;

  const nextWorkspace: ScenarioWorkspace = {
    ...workspace,
    project: {
      ...workspace.project,
      characterOrder: nextCharacters.map((c) => c.id),
    },
    characters: nextCharacters,
    worldSettings: nextWorldSettings,
    plots: nextPlots,
    scenes: nextScenes,
  };

  return {
    nextWorkspace,
    undoSnapshot: {
      deletedCharacter,
      originalIndex,
      hadFolderInProjectList,
      removedOtherRelations,
      removedWorldRefIds,
      removedPlotCardRefs,
      removedSceneCastIds,
      cleanedStructuredRefCount,
      previousSelectedItem,
    },
  };
}

export function restoreDeletedCharacterToWorkspace(
  workspace: ScenarioWorkspace,
  snapshot: CharacterDeleteUndoSnapshot
): ScenarioWorkspace {
  const { deletedCharacter } = snapshot;
  const charId = deletedCharacter.id;

  const relationRestoreMap = new Map(
    snapshot.removedOtherRelations.map((item) => [item.characterId, item.entries])
  );
  const worldRestoreSet = new Set(snapshot.removedWorldRefIds);
  const sceneRestoreSet = new Set(snapshot.removedSceneCastIds);
  const plotCardRestoreMap = new Map(
    snapshot.removedPlotCardRefs.map((item) => [`${item.plotId}::${item.cardId}`, item])
  );

  // Restore relations on other characters
  let nextCharacters = workspace.characters.map((char) => {
    const entriesToRestore = relationRestoreMap.get(char.id);
    if (!entriesToRestore || entriesToRestore.length === 0) return char;

    const current = [...(char.relations ?? [])];
    const existingTargets = new Set(current.map((r) => r.targetCharacterId));
    for (const entry of entriesToRestore) {
      if (existingTargets.has(entry.relation.targetCharacterId)) continue;
      const insertAt = Math.max(0, Math.min(entry.index, current.length));
      current.splice(insertAt, 0, entry.relation);
      existingTargets.add(entry.relation.targetCharacterId);
    }
    return { ...char, relations: current };
  });

  // Re-insert the deleted character at its original index if not already present
  if (!nextCharacters.some((c) => c.id === charId)) {
    const insertAt = Math.max(0, Math.min(snapshot.originalIndex, nextCharacters.length));
    nextCharacters = [
      ...nextCharacters.slice(0, insertAt),
      deletedCharacter,
      ...nextCharacters.slice(insertAt),
    ];
  }

  const prevFolders = workspace.project.characterFolders ?? [];
  const nextFolders =
    deletedCharacter.folder &&
    snapshot.hadFolderInProjectList &&
    !prevFolders.includes(deletedCharacter.folder)
      ? [...prevFolders, deletedCharacter.folder]
      : prevFolders;

  const nextWorldSettings = (workspace.worldSettings ?? []).map((w) => {
    if (!worldRestoreSet.has(w.id)) return w;
    const prevRelated = w.relatedCharacterIds ?? [];
    if (prevRelated.includes(charId)) return w;
    return { ...w, relatedCharacterIds: [...prevRelated, charId] };
  });

  const nextPlots = workspace.plots.map((plot) => {
    let changed = false;
    const nextCards = plot.cards.map((card) => {
      const ref = plotCardRestoreMap.get(`${plot.plotId}::${card.cardId}`);
      if (!ref) return card;
      changed = true;
      const prevChars = card.characters ?? [];
      const nextChars =
        ref.hadInCharacters && !prevChars.includes(charId)
          ? [...prevChars, charId]
          : prevChars;
      const nextPov =
        ref.hadAsPov && !card.povCharacterId ? charId : card.povCharacterId;
      return {
        ...card,
        characters: nextChars,
        povCharacterId: nextPov,
      };
    });
    return changed ? { ...plot, cards: nextCards } : plot;
  });

  const nextScenes = workspace.scenes.map((scene) => {
    if (!sceneRestoreSet.has(scene.sceneId)) return scene;
    const prevChars = scene.characters ?? [];
    if (prevChars.includes(charId)) return scene;
    return { ...scene, characters: [...prevChars, charId] };
  });

  return {
    ...workspace,
    project: {
      ...workspace.project,
      characterFolders: nextFolders,
      characterOrder: nextCharacters.map((c) => c.id),
    },
    characters: nextCharacters,
    worldSettings: nextWorldSettings,
    plots: nextPlots,
    scenes: nextScenes,
  };
}
