import type { LevelData } from '../engine/Levels';

// ============================================================================
// LEVEL STORAGE — localStorage CRUD + Editor State Conversion
// ============================================================================

const STORAGE_KEY = 'super-ajolotes-custom-levels';

// --- Types ---

export type EnemyType = 'crab' | 'jellyfish' | 'pufferfish';

export type EntityPlacementType =
  | { kind: 'enemy'; enemyType: EnemyType; patrol: number }
  | { kind: 'coin' }
  | { kind: 'movingPlatform'; range: number };

export interface EditorEntity {
  id: string;
  col: number;
  row: number;
  type: EntityPlacementType;
}

export type EditorTool = 'ground' | 'platform' | 'spike' | 'mystery' | 'eraser' | 'entity' | 'start' | 'goal';

export interface EditorState {
  tiles: string[][];
  entities: EditorEntity[];
  name: string;
  subtitle: string;
  timeLimit: number;
  background: string;
  cols: number;
  rows: number;
  startCol: number;
  startRow: number;
  goalCol: number;
  activeTool: EditorTool;
  activeEntityType: EntityPlacementType | null;
  scrollX: number;
  isPainting: boolean;
  showSaveDialog: boolean;
  showLoadDialog: boolean;
  history: string[][][]; // undo stack — each entry is a string[][] tile grid
}

export interface SavedLevel {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: LevelData;
}

// --- Default State ---

const DEFAULT_COLS = 45;
const DEFAULT_ROWS = 16;

export function createDefaultState(): EditorState {
  const tiles: string[][] = [];
  for (let r = 0; r < DEFAULT_ROWS; r++) {
    const row: string[] = [];
    for (let c = 0; c < DEFAULT_COLS; c++) {
      // Add ground on the bottom 2 rows
      row.push(r >= DEFAULT_ROWS - 2 ? 'G' : ' ');
    }
    tiles.push(row);
  }

  return {
    tiles,
    entities: [],
    name: 'My Level',
    subtitle: 'A custom creation',
    timeLimit: 300,
    background: '/bg_underwater.png',
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    startCol: 2,
    startRow: DEFAULT_ROWS - 3, // Above the ground
    goalCol: DEFAULT_COLS - 3,
    activeTool: 'ground',
    activeEntityType: null,
    scrollX: 0,
    isPainting: false,
    showSaveDialog: false,
    showLoadDialog: false,
    history: [],
  };
}

// --- Conversion: EditorState → LevelData ---

export function editorStateToLevelData(state: EditorState): LevelData {
  return {
    id: 100 + Math.floor(Math.random() * 900),
    name: state.name || 'Custom Level',
    subtitle: state.subtitle || 'A custom creation',
    type: 'ground',
    background: state.background,
    timeLimit: state.timeLimit,
    tiles: state.tiles.map(row => row.join('')),
    enemies: state.entities
      .filter((e): e is EditorEntity & { type: { kind: 'enemy'; enemyType: EnemyType; patrol: number } } => e.type.kind === 'enemy')
      .map(e => ({ col: e.col, row: e.row, type: e.type.enemyType, patrol: e.type.patrol })),
    coins: state.entities
      .filter(e => e.type.kind === 'coin')
      .map(e => ({ col: e.col, row: e.row })),
    movingPlatforms: state.entities
      .filter((e): e is EditorEntity & { type: { kind: 'movingPlatform'; range: number } } => e.type.kind === 'movingPlatform')
      .map(e => ({ col: e.col, row: e.row, range: e.type.range })),
    startCol: state.startCol,
    startRow: state.startRow,
    goalCol: state.goalCol,
  };
}

// --- Conversion: LevelData → EditorState ---

export function levelDataToEditorState(level: LevelData): EditorState {
  const tiles = level.tiles.map(row => row.split(''));
  const rows = tiles.length;
  const cols = tiles[0]?.length || DEFAULT_COLS;

  const entities: EditorEntity[] = [];

  for (const e of level.enemies) {
    entities.push({
      id: crypto.randomUUID(),
      col: e.col,
      row: e.row,
      type: { kind: 'enemy', enemyType: e.type, patrol: e.patrol ?? 2 },
    });
  }

  for (const c of level.coins) {
    entities.push({
      id: crypto.randomUUID(),
      col: c.col,
      row: c.row,
      type: { kind: 'coin' },
    });
  }

  for (const mp of level.movingPlatforms ?? []) {
    entities.push({
      id: crypto.randomUUID(),
      col: mp.col,
      row: mp.row,
      type: { kind: 'movingPlatform', range: mp.range ?? 4 },
    });
  }

  return {
    tiles,
    entities,
    name: level.name,
    subtitle: level.subtitle,
    timeLimit: level.timeLimit,
    background: level.background,
    cols,
    rows,
    startCol: level.startCol,
    startRow: level.startRow,
    goalCol: level.goalCol,
    activeTool: 'ground',
    activeEntityType: null,
    scrollX: 0,
    isPainting: false,
    showSaveDialog: false,
    showLoadDialog: false,
    history: [],
  };
}

// --- Validation ---

export function validateLevel(state: EditorState): string[] {
  const errors: string[] = [];

  if (state.startCol < 0 || state.startCol >= state.cols || state.startRow < 0 || state.startRow >= state.rows) {
    errors.push('Place a start position inside the level');
  }
  if (state.goalCol < 0 || state.goalCol >= state.cols) {
    errors.push('Place a goal flag inside the level');
  }

  const hasGround = state.tiles.some(row => row.some(c => c === 'G'));
  if (!hasGround) {
    errors.push('Place at least one ground tile');
  }

  // Check that start position has ground within 3 tiles below
  let groundBelowStart = false;
  for (let r = state.startRow + 1; r < Math.min(state.startRow + 4, state.rows); r++) {
    if (state.tiles[r]?.[state.startCol] === 'G') {
      groundBelowStart = true;
      break;
    }
  }
  if (!groundBelowStart) {
    errors.push('Start position needs ground below it (within 3 tiles)');
  }

  if (!state.name.trim()) {
    errors.push('Give your level a name');
  }

  return errors;
}

// --- localStorage CRUD ---

export function getSavedLevels(): SavedLevel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLevel(level: SavedLevel): void {
  const levels = getSavedLevels();
  const idx = levels.findIndex(l => l.id === level.id);
  if (idx >= 0) {
    levels[idx] = level;
  } else {
    levels.push(level);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}

export function deleteSavedLevel(id: string): void {
  const levels = getSavedLevels().filter(l => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}
