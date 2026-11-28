import type {
  ActiveMode,
  CharacterData,
  MangaBindingDirection,
  PlotData,
  ProofreadIssue,
  ProjectData,
  ResolvedCharacter,
  SceneData,
  SceneFormat,
  VisibilityType,
  WorldSettingData,
} from '../types/scenario';
import { proofreadMangaScene } from './mangaEngine';

const STANDARD_COMMON_KEYS = new Set([
  'name',
  'shortName',
  'ruby',
  'firstPerson',
  'ageDisplay',
  'gender',
  'relationship',
  'callPartner',
  'secondPerson',
  'speechStyle',
  'costume',
  'costumeId',
  'personality',
  'height',
  'weight',
  'bodyType',
  'hairstyle',
  'facialFeatures',
  'posture',
  'hobbies',
  'skills',
  'specialAbilities',
  'weaknesses',
]);

export function resolveCharacterProfile(
  char: CharacterData,
  mode: ActiveMode
): ResolvedCharacter {
  const locked = new Set(char.lockedFields ?? []);
  const dualDefs = char.dualFields ?? [];
  const activeDualKeys = new Set(dualDefs.map((f) => f.key));
  const generalProfile = char.profiles?.general ?? {};
  const adultProfile = char.profiles?.adult ?? {};
  const hiddenSet = new Set(char.hiddenCommonFields ?? []);

  const pickField = (key: string, commonValue: string): string => {
    if (!activeDualKeys.has(key)) {
      return commonValue;
    }
    if (mode === 'general' || locked.has(key)) {
      return generalProfile[key] ?? commonValue;
    }
    return adultProfile[key] ?? generalProfile[key] ?? commonValue;
  };

  const baseCostume = char.common.costume ?? char.common.costumeId ?? '';
  const resolvedCostume = activeDualKeys.has('costume')
    ? pickField('costume', baseCostume)
    : activeDualKeys.has('costumeId')
      ? pickField('costumeId', baseCostume)
      : baseCostume;

  const baseFields: Record<string, string> = {
    name: pickField('name', char.common.name ?? ''),
    shortName: pickField('shortName', char.shortName ?? ''),
    ruby: pickField('ruby', char.common.ruby ?? ''),
    personality: pickField('personality', char.common.personality ?? ''),
    height: pickField('height', char.common.height ?? ''),
    weight: pickField('weight', char.common.weight ?? ''),
    bodyType: pickField('bodyType', char.common.bodyType ?? ''),
    hairstyle: pickField('hairstyle', char.common.hairstyle ?? ''),
    facialFeatures: pickField('facialFeatures', char.common.facialFeatures ?? ''),
    posture: pickField('posture', char.common.posture ?? ''),
    hobbies: pickField('hobbies', char.common.hobbies ?? ''),
    skills: pickField('skills', char.common.skills ?? ''),
    specialAbilities: pickField('specialAbilities', char.common.specialAbilities ?? ''),
    weaknesses: pickField('weaknesses', char.common.weaknesses ?? ''),
    firstPerson: pickField('firstPerson', char.common.firstPerson ?? ''),
    ageDisplay: pickField('ageDisplay', char.common.ageDisplay ?? ''),
    gender: pickField('gender', char.common.gender ?? ''),
    relationship: pickField('relationship', char.common.relationship ?? ''),
    callPartner: pickField('callPartner', char.common.callPartner ?? ''),
    secondPerson: pickField('secondPerson', char.common.secondPerson ?? ''),
    speechStyle: pickField('speechStyle', char.common.speechStyle ?? ''),
    costume: resolvedCostume,
    costumeId: resolvedCostume,
  };

  const customCommon = char.customCommonFields ?? [];
  const customCommonKeySet = new Set(customCommon.map((f) => f.key));

  const extraCommonFields = customCommon.map((cf) => ({
    key: cf.key,
    label: cf.label,
    value: pickField(cf.key, cf.value ?? ''),
    category: cf.category,
  }));

  const customFields = dualDefs
    .filter((def) => !STANDARD_COMMON_KEYS.has(def.key) && !customCommonKeySet.has(def.key))
    .map((def) => {
      const value =
        mode === 'general' || locked.has(def.key)
          ? (generalProfile[def.key] ?? '')
          : (adultProfile[def.key] ?? generalProfile[def.key] ?? '');
      return {
        key: def.key,
        label: def.label,
        value,
        locked: locked.has(def.key),
      };
    });

  const relations = (char.relations ?? []).map((rel) => ({
    targetCharacterId: rel.targetCharacterId,
    callPartner: rel.callPartner ?? '',
    relationship: rel.relationship ?? '',
  }));

  const allFields: Record<string, string> = { ...baseFields };
  for (const ef of extraCommonFields) {
    allFields[ef.key] = ef.value;
  }
  for (const cf of customFields) {
    allFields[cf.key] = cf.value;
  }
  for (const rel of relations) {
    allFields[`callPartner.${rel.targetCharacterId}`] = rel.callPartner;
    allFields[`relationship.${rel.targetCharacterId}`] = rel.relationship;
  }

  return {
    id: char.id,
    shortName: baseFields.shortName,
    name: baseFields.name,
    ruby: baseFields.ruby,
    personality: baseFields.personality,
    height: baseFields.height,
    weight: baseFields.weight,
    bodyType: baseFields.bodyType,
    hairstyle: baseFields.hairstyle,
    facialFeatures: baseFields.facialFeatures,
    posture: baseFields.posture,
    hobbies: baseFields.hobbies,
    skills: baseFields.skills,
    specialAbilities: baseFields.specialAbilities,
    weaknesses: baseFields.weaknesses,
    firstPerson: baseFields.firstPerson,
    ageDisplay: baseFields.ageDisplay,
    gender: baseFields.gender,
    relationship: baseFields.relationship,
    callPartner: baseFields.callPartner,
    secondPerson: baseFields.secondPerson,
    speechStyle: baseFields.speechStyle,
    costume: resolvedCostume,
    relations,
    hiddenCommonFields: Array.from(hiddenSet),
    extraCommonFields,
    customFields,
    allFields,
    lockedFields: char.lockedFields ?? [],
  };
}

export function resolveCharacterField(
  char: CharacterData,
  field: string,
  mode: ActiveMode
): string {
  const resolved = resolveCharacterProfile(char, mode);
  return resolved.allFields[field] ?? `{{${char.id}.${field}}}`;
}

export function resolveWorldField(
  item: WorldSettingData,
  field: string,
  mode: ActiveMode
): string {
  if (field === 'name') return item.name ?? '';
  if (field === 'ruby') return item.ruby ?? '';
  if (field === 'summary') return item.summary ?? '';
  if (field === 'details') return item.details ?? '';
  if (field === 'adultNote') {
    return mode === 'adult' ? (item.adultNote ?? '') : '';
  }
  const custom = (item.customFields ?? []).find((f) => f.key === field);
  if (custom) return custom.value ?? '';
  return `{{world.${item.id}.${field}}}`;
}

export interface CompileOptions {
  stripStructureMarkers?: boolean;
}

export function compileSceneText(
  rawText: string,
  characters: CharacterData[],
  mode: ActiveMode,
  options: CompileOptions = {},
  worldSettings: WorldSettingData[] = []
): string {
  const { stripStructureMarkers = false } = options;

  // 1. Resolve [IF_MODE: general|adult] ... [/IF_MODE] blocks
  // Support nested or multiline blocks cleanly
  const ifModeRegex = /\[IF_MODE:\s*(general|adult)\s*\]([\s\S]*?)\[\/IF_MODE\]/gi;
  let output = rawText.replace(ifModeRegex, (_match, blockMode: string, inner: string) => {
    const normalized = blockMode.toLowerCase() as ActiveMode;
    if (normalized === mode) {
      // Trim a single leading/trailing newline introduced by block tags
      return inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    }
    return '';
  });

  // 2. Optionally clean [R18_BLOCK_START: ...] / [R18_BLOCK_END] markers for final text export
  if (stripStructureMarkers) {
    output = output
      .replace(/\[R18_BLOCK_START(?::[^\]]*)?\]\r?\n?/gi, '')
      .replace(/\[R18_BLOCK_END\]\r?\n?/gi, '');
  }

  // 3. Resolve {{world.<id>.<field>}}, {{characterId.field}}, and {{characterId.callPartner|relationship.targetId}} variable tags
  const charById = new Map(characters.map((c) => [c.id, c]));
  const worldById = new Map(worldSettings.map((w) => [w.id, w]));
  output = output.replace(
    /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?)\s*\}\}/g,
    (match, firstId, restField) => {
      if (firstId === 'world' && restField.includes('.')) {
        const dotIdx = restField.indexOf('.');
        const worldId = restField.slice(0, dotIdx);
        const worldField = restField.slice(dotIdx + 1);
        const worldItem = worldById.get(worldId);
        if (worldItem) {
          return resolveWorldField(worldItem, worldField, mode);
        }
        return match;
      }
      const char = charById.get(firstId);
      if (!char) return match;
      return resolveCharacterField(char, restField, mode);
    }
  );

  // 4. Collapse excessive blank lines caused by stripped blocks
  output = output.replace(/\n{3,}/g, '\n\n').trim();

  return output;
}

export function detectSpeakerOnLine(
  body: string,
  cursorIndex: number,
  characters: CharacterData[]
): CharacterData | null {
  const safeIdx = Math.max(0, Math.min(cursorIndex, body.length));
  const upToCursor = body.slice(0, safeIdx);
  const lineStart = upToCursor.lastIndexOf('\n') + 1;
  const lineEndRaw = body.indexOf('\n', safeIdx);
  const lineEnd = lineEndRaw === -1 ? body.length : lineEndRaw;
  const currentLine = body.slice(lineStart, lineEnd);

  const matchSpeaker = (line: string): CharacterData | null => {
    const trimmed = line.trim();
    const m = trimmed.match(/^([^\s「『（\[]+?)\s*「/);
    if (!m) return null;
    const prefix = m[1];
    return (
      characters.find(
        (c) =>
          c.shortName === prefix ||
          c.common.name === prefix ||
          c.common.name.endsWith(prefix) ||
          c.id === prefix
      ) ?? null
    );
  };

  const direct = matchSpeaker(currentLine);
  if (direct) return direct;

  // Walk upwards to find the nearest preceding speaker
  const prevLines = upToCursor.split('\n');
  for (let i = prevLines.length - 1; i >= 0; i--) {
    const found = matchSpeaker(prevLines[i]);
    if (found) return found;
  }

  return null;
}

export function findPreviousSpeakerPrefix(
  body: string,
  cursorIndex: number
): string | null {
  const safeIdx = Math.max(0, Math.min(cursorIndex, body.length));
  const lines = body.slice(0, safeIdx).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^([^\s「『（\[]+?)\s*「/);
    if (m) {
      return m[1];
    }
  }
  return null;
}

const KNOWN_FIRST_PERSONS = [
  'わたし',
  'あたし',
  'あたくし',
  'わたくし',
  'わし',
  'ぼく',
  'おれ',
  'おいら',
  'あたしたち',
  '私',
  '僕',
  '俺',
  '自分',
  'うち',
];

export function proofreadScene(
  rawText: string,
  characters: CharacterData[],
  mode: ActiveMode,
  worldSettings: WorldSettingData[] = [],
  sceneMeta?: SceneData
): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  const lines = rawText.split('\n');
  const charById = new Map(characters.map((c) => [c.id, c]));
  const worldById = new Map(worldSettings.map((w) => [w.id, w]));

  let activeIfModeDepth = 0;
  let activeIfModeLine = 1;
  let activeR18BlockDepth = 0;
  let activeR18BlockLine = 1;
  let currentConditionalMode: ActiveMode | null = null;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Track [IF_MODE: ...] blocks
    const ifOpen = trimmed.match(/^\[IF_MODE:\s*(general|adult)\s*\]$/i);
    if (ifOpen) {
      activeIfModeDepth++;
      activeIfModeLine = lineNum;
      currentConditionalMode = ifOpen[1].toLowerCase() as ActiveMode;
    } else if (/^\[\/IF_MODE\]$/i.test(trimmed)) {
      if (activeIfModeDepth <= 0) {
        issues.push({
          id: `syntax-if-extra-${lineNum}`,
          line: lineNum,
          column: 1,
          severity: 'error',
          category: 'syntax',
          message: '対応する開始タグのない [/IF_MODE] があります。',
          snippet: trimmed,
        });
      } else {
        activeIfModeDepth = Math.max(0, activeIfModeDepth - 1);
        if (activeIfModeDepth === 0) currentConditionalMode = null;
      }
    }

    // Track [R18_BLOCK_START: ...] / [R18_BLOCK_END]
    if (/^\[R18_BLOCK_START(?::[^\]]*)?\]$/i.test(trimmed)) {
      activeR18BlockDepth++;
      activeR18BlockLine = lineNum;
    } else if (/^\[R18_BLOCK_END\]$/i.test(trimmed)) {
      if (activeR18BlockDepth <= 0) {
        issues.push({
          id: `syntax-r18-extra-${lineNum}`,
          line: lineNum,
          column: 1,
          severity: 'error',
          category: 'syntax',
          message: '対応する [R18_BLOCK_START] のない [R18_BLOCK_END] があります。',
          snippet: trimmed,
        });
      } else {
        activeR18BlockDepth = Math.max(0, activeR18BlockDepth - 1);
      }
    }

    // Skip inactive branch lines for dialogue checks if inside opposing [IF_MODE]
    const isInactiveBranch = currentConditionalMode !== null && currentConditionalMode !== mode;

    // 1. Check unresolved {{char.field}} and {{char.callPartner|relationship.targetId}} variables
    const varRegex = /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_-]+))?\s*\}\}/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varRegex.exec(line)) !== null) {
      const charId = varMatch[1];
      const field = varMatch[2];
      const targetId = varMatch[3];

      // Handle {{world.<worldId>.<worldField>}} references
      if (charId === 'world' && targetId) {
        const worldItem = worldById.get(field);
        if (!worldItem) {
          issues.push({
            id: `syntax-var-world-${lineNum}-${varMatch.index}`,
            line: lineNum,
            column: varMatch.index + 1,
            severity: 'warning',
            category: 'syntax',
            message: `未登録の世界観設定 "${field}" が参照されています。`,
            snippet: varMatch[0],
          });
        } else {
          const validWorldFields = new Set([
            'name',
            'ruby',
            'summary',
            'details',
            'adultNote',
            ...(worldItem.customFields?.map((f) => f.key) ?? []),
          ]);
          if (!validWorldFields.has(targetId)) {
            issues.push({
              id: `syntax-var-world-field-${lineNum}-${varMatch.index}`,
              line: lineNum,
              column: varMatch.index + 1,
              severity: 'warning',
              category: 'syntax',
              message: `世界観設定「${worldItem.name}」に未定義の項目 "${targetId}" が参照されています。`,
              snippet: varMatch[0],
            });
          }
        }
        continue;
      }

      const char = charById.get(charId);
      const validFields = new Set([
        'name',
        'shortName',
        'ruby',
        'personality',
        'height',
        'weight',
        'bodyType',
        'hairstyle',
        'facialFeatures',
        'posture',
        'hobbies',
        'skills',
        'specialAbilities',
        'weaknesses',
        'firstPerson',
        'ageDisplay',
        'gender',
        'relationship',
        'callPartner',
        'secondPerson',
        'speechStyle',
        'costume',
        'costumeId',
        ...(char?.customCommonFields?.map((f) => f.key) ?? []),
        ...(char?.dualFields?.map((f) => f.key) ?? []),
      ]);
      if (!char) {
        issues.push({
          id: `syntax-var-char-${lineNum}-${varMatch.index}`,
          line: lineNum,
          column: varMatch.index + 1,
          severity: 'warning',
          category: 'syntax',
          message: `未登録のキャラクター変数 "${charId}" が参照されています。`,
          snippet: varMatch[0],
        });
      } else if (targetId) {
        if (field !== 'callPartner' && field !== 'relationship') {
          issues.push({
            id: `syntax-var-rel-field-${lineNum}-${varMatch.index}`,
            line: lineNum,
            column: varMatch.index + 1,
            severity: 'warning',
            category: 'syntax',
            message: `相手キャラ指定は callPartner または relationship のみ対応しています（"${field}"）。`,
            snippet: varMatch[0],
          });
        } else {
          const hasRelation = (char.relations ?? []).some((r) => r.targetCharacterId === targetId);
          const targetChar = charById.get(targetId);
          if (!hasRelation) {
            issues.push({
              id: `syntax-var-rel-target-${lineNum}-${varMatch.index}`,
              line: lineNum,
              column: varMatch.index + 1,
              severity: 'warning',
              category: 'syntax',
              message: targetChar
                ? `${char.common.name} に「${targetChar.common.name}」向けの個別設定が未登録です。`
                : `未登録の相手キャラクター "${targetId}" が参照されています。`,
              snippet: varMatch[0],
            });
          }
        }
      } else if (!validFields.has(field)) {
        issues.push({
          id: `syntax-var-field-${lineNum}-${varMatch.index}`,
          line: lineNum,
          column: varMatch.index + 1,
          severity: 'warning',
          category: 'syntax',
          message: `キャラクター項目 "${field}" は定義されていません。`,
          snippet: varMatch[0],
        });
      }
    }

    // 2. Check Japanese bracket balance on the line (「」, 『』, （）)
    const pairs: Array<[string, string, string]> = [
      ['「', '」', 'カギ括弧「」'],
      ['『', '』', '二重カギ括弧『』'],
      ['（', '）', '丸括弧（）'],
    ];
    for (const [openChar, closeChar, label] of pairs) {
      let depth = 0;
      let firstOpenCol = -1;
      for (let c = 0; c < line.length; c++) {
        if (line[c] === openChar) {
          if (depth === 0) firstOpenCol = c + 1;
          depth++;
        } else if (line[c] === closeChar) {
          if (depth === 0) {
            issues.push({
              id: `bracket-unmatched-${openChar}-${lineNum}-${c}`,
              line: lineNum,
              column: c + 1,
              severity: 'error',
              category: 'brackets',
              message: `${label}の開き括弧がないまま閉じ括弧「${closeChar}」が出現しています。`,
              snippet: trimmed,
            });
          } else {
            depth--;
          }
        }
      }
      if (depth > 0) {
        issues.push({
          id: `bracket-unclosed-${openChar}-${lineNum}`,
          line: lineNum,
          column: firstOpenCol > 0 ? firstOpenCol : 1,
          severity: 'error',
          category: 'brackets',
          message: `${label}が閉じられていません（閉じ忘れ）。`,
          snippet: trimmed,
        });
      }
    }

    // 3. Check speaker's first-person pronoun consistency inside dialogue 「...」
    if (!isInactiveBranch) {
      const dialogueMatch = trimmed.match(/^([^\s「『（\[]+?)\s*「([^」]*)/);
      if (dialogueMatch) {
        const speakerPrefix = dialogueMatch[1];
        const spokenRaw = dialogueMatch[2];
        const char = characters.find(
          (c) =>
            c.shortName === speakerPrefix ||
            c.common.name === speakerPrefix ||
            c.common.name.endsWith(speakerPrefix) ||
            c.id === speakerPrefix
        );

        if (char) {
          const resolved = resolveCharacterProfile(char, mode);
          const expectedFirstPerson = resolved.firstPerson;
          // Resolve variables inside this spoken fragment before pronoun scanning
          const spokenCompiled = compileSceneText(spokenRaw, characters, mode, {}, worldSettings);

          for (const pronoun of KNOWN_FIRST_PERSONS) {
            if (pronoun === expectedFirstPerson) continue;
            // Avoid substring false positives: check boundaries around kanji/kana pronouns
            // e.g., don't match "私" inside "私立" or "私服", "自分" inside "自分勝手" if possible,
            // or "僕" inside "公僕"
            const safeRegex = new RegExp(
              `(^|[\\s、。…！？「『（])${pronoun}(?=[はがのもをにとへで、。…！？\\s]|$)`,
              'g'
            );
            const found = safeRegex.exec(spokenCompiled);
            if (found) {
              issues.push({
                id: `firstperson-${lineNum}-${pronoun}`,
                line: lineNum,
                column: 1,
                severity: 'warning',
                category: 'firstPerson',
                message: `${resolved.shortName}の一人称は「${expectedFirstPerson}」ですが、「${pronoun}」が使用されています。`,
                snippet: trimmed,
              });
              break;
            }
          }
        }
      }
    }
  });

  if (activeIfModeDepth > 0) {
    issues.push({
      id: `syntax-if-unclosed-${activeIfModeLine}`,
      line: activeIfModeLine,
      column: 1,
      severity: 'error',
      category: 'syntax',
      message: `${activeIfModeLine}行目の [IF_MODE] ブロックが [/IF_MODE] で閉じられていません。`,
      snippet: lines[activeIfModeLine - 1]?.trim() ?? '[IF_MODE]',
    });
  }

  if (activeR18BlockDepth > 0) {
    issues.push({
      id: `syntax-r18-unclosed-${activeR18BlockLine}`,
      line: activeR18BlockLine,
      column: 1,
      severity: 'error',
      category: 'syntax',
      message: `${activeR18BlockLine}行目の [R18_BLOCK_START] が [R18_BLOCK_END] で閉じられていません。`,
      snippet: lines[activeR18BlockLine - 1]?.trim() ?? '[R18_BLOCK_START]',
    });
  }

  if (sceneMeta?.format === 'manga') {
    issues.push(...proofreadMangaScene(sceneMeta, characters, mode, worldSettings));
  }

  return issues;
}

export function serializeSceneMarkdown(scene: SceneData): string {
  const charsList = scene.characters.join(', ');
  const extraLines: string[] = [];
  if (scene.format === 'manga') {
    extraLines.push(`format: manga`);
    if (scene.mangaBinding && scene.mangaBinding !== 'rtl') {
      extraLines.push(`mangaBinding: ${scene.mangaBinding}`);
    }
    if (scene.mangaStartPage && scene.mangaStartPage > 1) {
      extraLines.push(`mangaStartPage: ${scene.mangaStartPage}`);
    }
  }
  const extraBlock = extraLines.length > 0 ? `\n${extraLines.join('\n')}` : '';
  return `---
sceneId: ${scene.sceneId}
title: ${scene.title}
visibility: ${scene.visibility}
characters: [${charsList}]${extraBlock}
---

${scene.body}
`;
}

export function parseSceneMarkdown(filename: string, content: string): SceneData {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const baseId = filename.replace(/\.md$/i, '');

  if (!fmMatch) {
    return {
      sceneId: baseId,
      filename,
      title: baseId,
      visibility: 'common',
      characters: [],
      body: content.trimStart(),
    };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');

  const getField = (key: string): string => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const sceneId = getField('sceneId') || baseId;
  const title = getField('title') || sceneId;
  const visRaw = getField('visibility');
  const visibility: VisibilityType =
    visRaw === 'adult_only' || visRaw === 'general_alt' ? visRaw : 'common';

  const charsRaw = getField('characters');
  const charsClean = charsRaw.replace(/^\[|\]$/g, '');
  const characters = charsClean
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const formatRaw = getField('format');
  const format: SceneFormat | undefined = formatRaw === 'manga' ? 'manga' : undefined;
  const bindingRaw = getField('mangaBinding');
  const mangaBinding: MangaBindingDirection | undefined =
    bindingRaw === 'ltr' || bindingRaw === 'rtl' ? bindingRaw : undefined;
  const startPageRaw = Number(getField('mangaStartPage'));
  const mangaStartPage =
    Number.isFinite(startPageRaw) && startPageRaw >= 1 ? Math.floor(startPageRaw) : undefined;

  return {
    sceneId,
    filename,
    title,
    visibility,
    characters,
    body,
    ...(format ? { format } : {}),
    ...(mangaBinding ? { mangaBinding } : {}),
    ...(mangaStartPage ? { mangaStartPage } : {}),
  };
}

export function isSceneVisibleInMode(visibility: VisibilityType, mode: ActiveMode): boolean {
  if (visibility === 'common') return true;
  if (mode === 'general') return visibility !== 'adult_only';
  return visibility !== 'general_alt';
}

export function exportScenarioBundle(
  project: ProjectData,
  scenes: SceneData[],
  characters: CharacterData[],
  _plots: PlotData[],
  mode: ActiveMode,
  singleScene?: SceneData,
  worldSettings: WorldSettingData[] = []
): { filename: string; content: string } {
  const suffix = mode === 'general' ? '_normal' : '_r18';
  const targetScenes = singleScene
    ? [singleScene]
    : scenes.filter((s) => isSceneVisibleInMode(s.visibility, mode));

  const headerLines = [
    `============================================================`,
    `作品名: ${project.title}`,
    `出力モード: ${mode === 'general' ? '一般向け (normal)' : '成人向け (R18)'}`,
    `出力日時: ${new Date().toLocaleString('ja-JP')}`,
    `============================================================`,
    '',
  ];

  const sceneChunks = targetScenes.map((scene, i) => {
    const compiled = compileSceneText(
      scene.body,
      characters,
      mode,
      {
        stripStructureMarkers: true,
      },
      worldSettings
    );
    return [
      `■ シーン ${i + 1}: ${scene.title} (${scene.sceneId})`,
      `------------------------------------------------------------`,
      compiled,
      '',
    ].join('\n');
  });

  const safeTitle = (singleScene ? singleScene.sceneId : project.title)
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 40);

  return {
    filename: `${safeTitle}${suffix}.txt`,
    content: [...headerLines, ...sceneChunks].join('\n'),
  };
}
