import { useReducer, useEffect, useRef, useCallback } from 'react';
import type { LevelData } from '../engine/Levels';
import {
  createDefaultState,
  editorStateToLevelData,
  levelDataToEditorState,
  validateLevel,
  getSavedLevels,
  saveLevel,
  deleteSavedLevel,
  type EditorState,
  type EditorTool,
  type EntityPlacementType,
  type EditorEntity,
  type SavedLevel,
} from '../lib/level-storage';
import './level-editor.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const CELL = 40;
const MAX_HISTORY = 30;

const BIOMES: { key: string; bg: string; emoji: string; fill: string }[] = [
  { key: 'underwater', bg: '/bg_underwater.png', emoji: '\u{1F30A}', fill: '#0a2a3a' },
  { key: 'cave', bg: '/bg_cave.png', emoji: '\u{1FAA8}', fill: '#1a1a2a' },
  { key: 'volcano', bg: '/bg_volcano.png', emoji: '\u{1F30B}', fill: '#2a0a0a' },
];

function biomeColor(bg: string): string {
  if (bg.includes('cave')) return '#1a1a2a';
  if (bg.includes('volcano')) return '#2a0a0a';
  return '#0a2a3a';
}

// ============================================================================
// REDUCER ACTIONS
// ============================================================================

type EditorAction =
  | { type: 'SET_TOOL'; tool: EditorTool }
  | { type: 'SET_ENTITY_TYPE'; entityType: EntityPlacementType }
  | { type: 'PAINT_TILE'; col: number; row: number }
  | { type: 'PLACE_ENTITY'; col: number; row: number }
  | { type: 'REMOVE_ENTITY'; col: number; row: number }
  | { type: 'SET_START'; col: number; row: number }
  | { type: 'SET_GOAL'; col: number }
  | { type: 'SET_PAINTING'; painting: boolean }
  | { type: 'SET_SCROLL'; scrollX: number; viewportWidth: number }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Pick<EditorState, 'name' | 'subtitle' | 'timeLimit' | 'background' | 'cols'>> }
  | { type: 'TOGGLE_SAVE_DIALOG' }
  | { type: 'TOGGLE_LOAD_DIALOG' }
  | { type: 'LOAD_LEVEL'; level: SavedLevel }
  | { type: 'UNDO' }
  | { type: 'PUSH_HISTORY' };

function cloneTiles(tiles: string[][]): string[][] {
  return tiles.map(row => [...row]);
}

function tileCharForTool(tool: EditorTool): string {
  switch (tool) {
    case 'ground': return 'G';
    case 'platform': return 'P';
    case 'spike': return '^';
    case 'mystery': return '?';
    case 'eraser': return ' ';
    default: return ' ';
  }
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, activeTool: action.tool, activeEntityType: action.tool === 'entity' ? state.activeEntityType : null };

    case 'SET_ENTITY_TYPE':
      return { ...state, activeTool: 'entity', activeEntityType: action.entityType };

    case 'PAINT_TILE': {
      const { col, row } = action;
      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return state;
      const tile = tileCharForTool(state.activeTool);
      if (state.tiles[row][col] === tile) return state;
      const newTiles = cloneTiles(state.tiles);
      newTiles[row][col] = tile;
      return { ...state, tiles: newTiles };
    }

    case 'PLACE_ENTITY': {
      const { col, row } = action;
      if (!state.activeEntityType) return state;
      if (col < 0 || col >= state.cols || row < 0 || row >= state.rows) return state;
      // Remove existing entity at this cell
      const filtered = state.entities.filter(e => !(e.col === col && e.row === row));
      const newEntity: EditorEntity = {
        id: crypto.randomUUID(),
        col,
        row,
        type: state.activeEntityType,
      };
      return { ...state, entities: [...filtered, newEntity] };
    }

    case 'REMOVE_ENTITY': {
      const { col, row } = action;
      const filtered = state.entities.filter(e => !(e.col === col && e.row === row));
      if (filtered.length === state.entities.length) return state;
      return { ...state, entities: filtered };
    }

    case 'SET_START':
      return { ...state, startCol: action.col, startRow: action.row };

    case 'SET_GOAL':
      return { ...state, goalCol: action.col };

    case 'SET_PAINTING':
      return { ...state, isPainting: action.painting };

    case 'SET_SCROLL': {
      const maxScroll = Math.max(0, state.cols * CELL - action.viewportWidth);
      return { ...state, scrollX: Math.max(0, Math.min(maxScroll, action.scrollX)) };
    }

    case 'UPDATE_SETTINGS': {
      const next = { ...state, ...action.patch };
      // If cols changed, resize tiles
      if (action.patch.cols !== undefined && action.patch.cols !== state.cols) {
        const newCols = action.patch.cols;
        const newTiles = state.tiles.map(row => {
          if (newCols > row.length) {
            return [...row, ...Array<string>(newCols - row.length).fill(' ')];
          }
          return row.slice(0, newCols);
        });
        next.tiles = newTiles;
        next.cols = newCols;
        // Clamp scroll (use generous viewport estimate)
        const maxScroll = Math.max(0, newCols * CELL - 400);
        if (next.scrollX > maxScroll) next.scrollX = Math.max(0, maxScroll);
        // Clamp goal and start
        if (next.goalCol >= newCols) next.goalCol = newCols - 1;
        if (next.startCol >= newCols) next.startCol = newCols - 1;
        // Remove entities outside new bounds
        next.entities = state.entities.filter(e => e.col < newCols);
      }
      return next;
    }

    case 'TOGGLE_SAVE_DIALOG':
      return { ...state, showSaveDialog: !state.showSaveDialog };

    case 'TOGGLE_LOAD_DIALOG':
      return { ...state, showLoadDialog: !state.showLoadDialog };

    case 'LOAD_LEVEL': {
      const loaded = levelDataToEditorState(action.level.data);
      return { ...loaded };
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const newHistory = [...state.history];
      const prevTiles = newHistory.pop()!;
      return { ...state, tiles: prevTiles, history: newHistory };
    }

    case 'PUSH_HISTORY': {
      const newHistory = [...state.history, cloneTiles(state.tiles)];
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      return { ...state, history: newHistory };
    }

    default:
      return state;
  }
}

// ============================================================================
// SCREEN-TO-CELL CONVERSION
// ============================================================================

function screenToCell(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  scrollX: number,
  cols: number,
  rows: number,
): { col: number; row: number } {
  const rect = canvas.getBoundingClientRect();
  // Canvas size matches DOM size (1:1 mapping), just add scroll offset
  const pixelX = (clientX - rect.left) + scrollX;
  const pixelY = (clientY - rect.top);
  const col = Math.floor(pixelX / CELL);
  const row = Math.floor(pixelY / CELL);
  return {
    col: Math.max(0, Math.min(cols - 1, col)),
    row: Math.max(0, Math.min(rows - 1, row)),
  };
}

// ============================================================================
// CANVAS DRAWING
// ============================================================================

function drawEditor(
  ctx: CanvasRenderingContext2D,
  state: EditorState,
  hoverCol: number,
  hoverRow: number,
): void {
  const { tiles, entities, cols, rows, scrollX, startCol, startRow, goalCol, activeTool } = state;
  const vpW = ctx.canvas.width;
  const vpH = ctx.canvas.height;
  const h = rows * CELL;

  ctx.clearRect(0, 0, vpW, vpH);

  // 1. Background fill
  ctx.fillStyle = biomeColor(state.background);
  ctx.fillRect(0, 0, vpW, vpH);

  ctx.save();
  ctx.translate(-scrollX, 0);

  // 2. Grid lines (draw only visible range)
  const firstVisCol = Math.max(0, Math.floor(scrollX / CELL));
  const lastVisCol = Math.min(cols, Math.ceil((scrollX + vpW) / CELL));
  ctx.strokeStyle = '#ffffff10';
  ctx.lineWidth = 1;
  for (let c = firstVisCol; c <= lastVisCol; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, h);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(firstVisCol * CELL, r * CELL);
    ctx.lineTo(lastVisCol * CELL, r * CELL);
    ctx.stroke();
  }

  // 3. Tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tiles[r]?.[c];
      const x = c * CELL;
      const y = r * CELL;

      if (tile === 'G') {
        // Check if row above is also ground
        const aboveIsGround = r > 0 && tiles[r - 1]?.[c] === 'G';
        if (aboveIsGround) {
          // Full brown fill (underground)
          ctx.fillStyle = '#92400e';
          ctx.fillRect(x, y, CELL, CELL);
        } else {
          // Green top + brown body
          ctx.fillStyle = '#92400e';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(x, y, CELL, 8);
        }
      } else if (tile === 'P') {
        // Platform bar, half height, centered
        ctx.fillStyle = '#a16207';
        ctx.fillRect(x, y + CELL * 0.25, CELL, CELL * 0.5);
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + CELL * 0.25, CELL, CELL * 0.5);
      } else if (tile === '^') {
        // Red triangle pointing up
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(x + CELL / 2, y + 4);
        ctx.lineTo(x + CELL - 4, y + CELL - 4);
        ctx.lineTo(x + 4, y + CELL - 4);
        ctx.closePath();
        ctx.fill();
      } else if (tile === '?') {
        // Yellow square with "?"
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8);
        ctx.fillStyle = '#422006';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + CELL / 2, y + CELL / 2);
      }
    }
  }

  // 4. Entities
  for (const ent of entities) {
    const cx = ent.col * CELL + CELL / 2;
    const cy = ent.row * CELL + CELL / 2;

    if (ent.type.kind === 'enemy') {
      // Patrol range bar (semi-transparent red)
      const patrol = ent.type.patrol;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(
        (ent.col - patrol) * CELL,
        ent.row * CELL,
        (patrol * 2 + 1) * CELL,
        CELL,
      );

      // Red circle with letter
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const letter = ent.type.enemyType[0].toUpperCase();
      ctx.fillText(letter, cx, cy);
    } else if (ent.type.kind === 'coin') {
      // Yellow circle
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#422006';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', cx, cy);
    } else if (ent.type.kind === 'movingPlatform') {
      // Blue bar (3 cells wide)
      const barW = 3 * CELL;
      const barH = CELL * 0.4;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(ent.col * CELL, ent.row * CELL + (CELL - barH) / 2, barW, barH);

      // Range arrow
      const range = ent.type.range;
      const arrowY = ent.row * CELL + CELL / 2;
      const arrowStartX = ent.col * CELL;
      const arrowEndX = (ent.col + range) * CELL;
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(arrowStartX, arrowY);
      ctx.lineTo(arrowEndX, arrowY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arrow head
      ctx.fillStyle = 'rgba(96, 165, 250, 0.5)';
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowY);
      ctx.lineTo(arrowEndX - 8, arrowY - 5);
      ctx.lineTo(arrowEndX - 8, arrowY + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 5. Start marker — green triangle pointing right
  {
    const sx = startCol * CELL;
    const sy = startRow * CELL;
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(sx + 6, sy + 4);
    ctx.lineTo(sx + CELL - 6, sy + CELL / 2);
    ctx.lineTo(sx + 6, sy + CELL - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 6. Goal marker — checkered flag pattern (full height stripe)
  {
    const gx = goalCol * CELL;
    const checkSize = CELL / 4;
    for (let gy = 0; gy < h; gy += checkSize) {
      const colIndex = Math.floor(gy / checkSize);
      for (let cx2 = 0; cx2 < CELL; cx2 += checkSize) {
        const rowIndex = Math.floor(cx2 / checkSize);
        ctx.fillStyle = (colIndex + rowIndex) % 2 === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
        ctx.fillRect(gx + cx2, gy, checkSize, checkSize);
      }
    }
  }

  // 7. Hover highlight
  if (hoverCol >= 0 && hoverRow >= 0) {
    let color = '#ffffff';
    switch (activeTool) {
      case 'ground': color = '#4ade80'; break;
      case 'platform': color = '#a16207'; break;
      case 'spike': color = '#ef4444'; break;
      case 'mystery': color = '#fbbf24'; break;
      case 'eraser': color = '#94a3b8'; break;
      case 'entity': color = '#60a5fa'; break;
      case 'start': color = '#22c55e'; break;
      case 'goal': color = '#f0abfc'; break;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(hoverCol * CELL + 1, hoverRow * CELL + 1, CELL - 2, CELL - 2);
  }

  ctx.restore();
}

// ============================================================================
// COMPONENT
// ============================================================================

interface LevelEditorProps {
  onBack: () => void;
  onPlayLevel: (level: LevelData) => void;
}

export default function LevelEditor({ onBack, onPlayLevel }: LevelEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, undefined, createDefaultState);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCellRef = useRef<{ col: number; row: number }>({ col: -1, row: -1 });
  const rafRef = useRef<number>(0);
  const scrollBarRef = useRef<HTMLDivElement>(null);
  const scrollDragRef = useRef<{ dragging: boolean; startX: number; startScroll: number }>({
    dragging: false,
    startX: 0,
    startScroll: 0,
  });

  // Saved levels list for load dialog (kept in ref to avoid re-renders)
  const [savedLevels, setSavedLevels] = useReducer(
    (_: SavedLevel[], next: SavedLevel[]) => next,
    [],
  );

  // Validation errors dialog (separate from save dialog)
  const [validationErrors, setValidationErrors] = useReducer(
    (_: string[], next: string[]) => next,
    [],
  );
  const [showValidation, setShowValidation] = useReducer(
    (_: boolean, next: boolean) => next,
    false,
  );

  // ---- Canvas Rendering ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas is a VIEWPORT into the level — match the DOM element size
    const rect = canvas.getBoundingClientRect();
    const dpr = 1; // keep 1:1 for pixel art crispness
    const vpW = Math.round(rect.width * dpr);
    const vpH = Math.round(rect.height * dpr);
    if (canvas.width !== vpW || canvas.height !== vpH) {
      canvas.width = vpW;
      canvas.height = vpH;
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      drawEditor(ctx, state, hoverCellRef.current.col, hoverCellRef.current.row);
    });

    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  // ---- Keyboard shortcuts (undo) ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---- Scrollbar drag ----
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!scrollDragRef.current.dragging) return;
      const bar = scrollBarRef.current;
      if (!bar) return;
      const barRect = bar.getBoundingClientRect();
      const barWidth = barRect.width;
      const totalWidth = state.cols * CELL;
      const viewportWidth = canvasRef.current ? canvasRef.current.getBoundingClientRect().width : 800;
      const maxScroll = Math.max(0, totalWidth - viewportWidth);
      const thumbWidth = Math.max(30, (viewportWidth / totalWidth) * barWidth);
      const scrollableBarWidth = barWidth - thumbWidth;
      if (scrollableBarWidth <= 0) return;
      const deltaX = e.clientX - scrollDragRef.current.startX;
      const scrollRatio = deltaX / scrollableBarWidth;
      const newScroll = scrollDragRef.current.startScroll + scrollRatio * maxScroll;
      dispatch({ type: 'SET_SCROLL', scrollX: newScroll, viewportWidth });
    }
    function onMouseUp() {
      scrollDragRef.current.dragging = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [state.cols]);

  // ---- Tool application on cell ----
  const applyToolAtCell = useCallback((col: number, row: number, isRightClick: boolean) => {
    if (isRightClick) {
      dispatch({ type: 'PUSH_HISTORY' });
      dispatch({ type: 'REMOVE_ENTITY', col, row });
      return;
    }

    const tool = state.activeTool;

    if (tool === 'start') {
      dispatch({ type: 'SET_START', col, row });
      return;
    }
    if (tool === 'goal') {
      dispatch({ type: 'SET_GOAL', col });
      return;
    }
    if (tool === 'entity') {
      dispatch({ type: 'PUSH_HISTORY' });
      dispatch({ type: 'PLACE_ENTITY', col, row });
      return;
    }

    // Tile tools
    dispatch({ type: 'PUSH_HISTORY' });
    dispatch({ type: 'PAINT_TILE', col, row });
  }, [state.activeTool]);

  // ---- Mouse handlers ----
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.button === 2) {
      // Right click
      const cell = screenToCell(e.clientX, e.clientY, canvas, state.scrollX, state.cols, state.rows);
      applyToolAtCell(cell.col, cell.row, true);
      return;
    }

    const cell = screenToCell(e.clientX, e.clientY, canvas, state.scrollX, state.cols, state.rows);
    applyToolAtCell(cell.col, cell.row, false);
    dispatch({ type: 'SET_PAINTING', painting: true });
  }, [state.scrollX, state.cols, state.rows, applyToolAtCell]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cell = screenToCell(e.clientX, e.clientY, canvas, state.scrollX, state.cols, state.rows);
    hoverCellRef.current = cell;

    // Redraw for hover highlight
    const ctx = canvas.getContext('2d');
    if (ctx) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        drawEditor(ctx, state, cell.col, cell.row);
      });
    }

    // Drag painting (tile tools only)
    if (state.isPainting) {
      const tool = state.activeTool;
      if (tool === 'ground' || tool === 'platform' || tool === 'spike' || tool === 'mystery' || tool === 'eraser') {
        dispatch({ type: 'PAINT_TILE', col: cell.col, row: cell.row });
      }
    }
  }, [state]);

  const handleCanvasMouseUp = useCallback(() => {
    dispatch({ type: 'SET_PAINTING', painting: false });
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    hoverCellRef.current = { col: -1, row: -1 };
    dispatch({ type: 'SET_PAINTING', painting: false });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ---- Touch handlers ----
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const touch = e.touches[0];
    const cell = screenToCell(touch.clientX, touch.clientY, canvas, state.scrollX, state.cols, state.rows);
    applyToolAtCell(cell.col, cell.row, false);
    dispatch({ type: 'SET_PAINTING', painting: true });
  }, [state.scrollX, state.cols, state.rows, applyToolAtCell]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const touch = e.touches[0];
    const cell = screenToCell(touch.clientX, touch.clientY, canvas, state.scrollX, state.cols, state.rows);
    hoverCellRef.current = cell;

    if (state.isPainting) {
      const tool = state.activeTool;
      if (tool === 'ground' || tool === 'platform' || tool === 'spike' || tool === 'mystery' || tool === 'eraser') {
        dispatch({ type: 'PAINT_TILE', col: cell.col, row: cell.row });
      }
    }
  }, [state]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_PAINTING', painting: false });
  }, []);

  // ---- Wheel scroll ----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const vpW = canvasRef.current?.getBoundingClientRect().width ?? 800;
    // Use deltaX for horizontal scroll, or deltaY if shift is held
    const delta = e.shiftKey ? e.deltaY : e.deltaX;
    if (delta !== 0) {
      dispatch({ type: 'SET_SCROLL', scrollX: state.scrollX + delta, viewportWidth: vpW });
    } else if (e.deltaY !== 0) {
      dispatch({ type: 'SET_SCROLL', scrollX: state.scrollX + e.deltaY, viewportWidth: vpW });
    }
  }, [state.scrollX]);

  // ---- Scrollbar thumb ----
  const totalWidth = state.cols * CELL;
  const canvasEl = canvasRef.current;
  const viewportWidth = canvasEl
    ? canvasEl.getBoundingClientRect().width
    : 800;
  const maxScroll = Math.max(0, totalWidth - viewportWidth);
  const scrollBarWidth = scrollBarRef.current?.getBoundingClientRect().width ?? 600;
  const thumbWidth = Math.max(30, (viewportWidth / Math.max(1, totalWidth)) * scrollBarWidth);
  const thumbLeft = maxScroll > 0 ? (state.scrollX / maxScroll) * (scrollBarWidth - thumbWidth) : 0;

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    scrollDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startScroll: state.scrollX,
    };
  }, [state.scrollX]);

  // ---- Save ----
  const handleSave = useCallback(() => {
    const levelData = editorStateToLevelData(state);
    const now = Date.now();
    const saved: SavedLevel = {
      id: crypto.randomUUID(),
      name: state.name,
      createdAt: now,
      updatedAt: now,
      data: levelData,
    };
    saveLevel(saved);
    dispatch({ type: 'TOGGLE_SAVE_DIALOG' });
  }, [state]);

  // ---- Load ----
  const handleOpenLoad = useCallback(() => {
    setSavedLevels(getSavedLevels());
    dispatch({ type: 'TOGGLE_LOAD_DIALOG' });
  }, []);

  const handleLoadLevel = useCallback((level: SavedLevel) => {
    dispatch({ type: 'LOAD_LEVEL', level });
    dispatch({ type: 'TOGGLE_LOAD_DIALOG' });
  }, []);

  const handleDeleteLevel = useCallback((id: string) => {
    deleteSavedLevel(id);
    setSavedLevels(getSavedLevels());
  }, []);

  // ---- Play ----
  const handlePlay = useCallback(() => {
    const errors = validateLevel(state);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      return;
    }
    setValidationErrors([]);
    const levelData = editorStateToLevelData(state);
    onPlayLevel(levelData);
  }, [state, onPlayLevel]);

  // ---- Entity helpers ----
  function isActiveEntity(entityType: EntityPlacementType): boolean {
    if (!state.activeEntityType) return false;
    if (entityType.kind !== state.activeEntityType.kind) return false;
    if (entityType.kind === 'enemy' && state.activeEntityType.kind === 'enemy') {
      return entityType.enemyType === state.activeEntityType.enemyType;
    }
    return true;
  }

  // ---- Render ----
  return (
    <div className="editor-overlay">
      {/* TOP BAR */}
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          <button className="editor-btn" onClick={onBack}>BACK</button>
        </div>
        <div className="editor-topbar-center">
          {state.name || 'Untitled Level'}
        </div>
        <div className="editor-topbar-right">
          <button className="editor-btn" onClick={() => dispatch({ type: 'TOGGLE_SAVE_DIALOG' })}>SAVE</button>
          <button className="editor-btn" onClick={handleOpenLoad}>LOAD</button>
          <button className="editor-btn primary" onClick={handlePlay}>PLAY</button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="editor-main">
        {/* LEFT PALETTE */}
        <div className="editor-palette">
          <div className="palette-label">TILES</div>
          <button
            className={`palette-btn ${state.activeTool === 'ground' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'ground' })}
            title="Ground"
          >
            <div className="tile-icon tile-icon-ground" />
          </button>
          <button
            className={`palette-btn ${state.activeTool === 'platform' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'platform' })}
            title="Platform"
          >
            <div className="tile-icon tile-icon-platform" />
          </button>
          <button
            className={`palette-btn ${state.activeTool === 'spike' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'spike' })}
            title="Spike"
          >
            <div className="tile-icon tile-icon-spike" />
          </button>
          <button
            className={`palette-btn ${state.activeTool === 'mystery' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'mystery' })}
            title="Mystery Block"
          >
            <div className="tile-icon tile-icon-mystery">?</div>
          </button>
          <button
            className={`palette-btn ${state.activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'eraser' })}
            title="Eraser"
          >
            <div className="tile-icon-eraser">{'\u2715'}</div>
          </button>

          <div className="palette-separator" />
          <div className="palette-label">MARKS</div>
          <button
            className={`palette-btn ${state.activeTool === 'start' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'start' })}
            title="Start Position"
          >
            <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 16 }}>S</span>
          </button>
          <button
            className={`palette-btn ${state.activeTool === 'goal' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: 'goal' })}
            title="Goal Flag"
          >
            <span style={{ fontSize: 14 }}>{'\u{1F3C1}'}</span>
          </button>
        </div>

        {/* CANVAS AREA */}
        <div className="editor-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="editor-canvas"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
          <div className="editor-scroll-bar" ref={scrollBarRef}>
            <div
              className="editor-scroll-thumb"
              style={{
                width: thumbWidth,
                left: thumbLeft,
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        </div>

        {/* RIGHT ENTITY PALETTE */}
        <div className="editor-entities">
          <div className="palette-label">ENEMY</div>
          <button
            className={`entity-btn ${isActiveEntity({ kind: 'enemy', enemyType: 'crab', patrol: 2 }) ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENTITY_TYPE', entityType: { kind: 'enemy', enemyType: 'crab', patrol: 2 } })}
            title="Crab"
          >
            {'\u{1F980}'}
          </button>
          <button
            className={`entity-btn ${isActiveEntity({ kind: 'enemy', enemyType: 'jellyfish', patrol: 2 }) ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENTITY_TYPE', entityType: { kind: 'enemy', enemyType: 'jellyfish', patrol: 2 } })}
            title="Jellyfish"
          >
            {'\u{1FABC}'}
          </button>
          <button
            className={`entity-btn ${isActiveEntity({ kind: 'enemy', enemyType: 'pufferfish', patrol: 2 }) ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENTITY_TYPE', entityType: { kind: 'enemy', enemyType: 'pufferfish', patrol: 2 } })}
            title="Pufferfish"
          >
            {'\u{1F421}'}
          </button>

          <div className="palette-separator" />
          <div className="palette-label">ITEMS</div>
          <button
            className={`entity-btn ${isActiveEntity({ kind: 'coin' }) ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENTITY_TYPE', entityType: { kind: 'coin' } })}
            title="Coin"
          >
            {'\u{1FA99}'}
          </button>

          <div className="palette-separator" />
          <div className="palette-label">PLAT</div>
          <button
            className={`entity-btn ${isActiveEntity({ kind: 'movingPlatform', range: 4 }) ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENTITY_TYPE', entityType: { kind: 'movingPlatform', range: 4 } })}
            title="Moving Platform"
          >
            {'\u{2550}'}
          </button>
        </div>
      </div>

      {/* SETTINGS BAR */}
      <div className="editor-settings">
        <div className="setting-group">
          <label>Name</label>
          <input
            className="setting-input"
            type="text"
            maxLength={24}
            value={state.name}
            onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { name: e.target.value } })}
          />
        </div>

        <div className="setting-group">
          <label>Sub</label>
          <input
            className="setting-input"
            type="text"
            maxLength={40}
            value={state.subtitle}
            onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { subtitle: e.target.value } })}
          />
        </div>

        <div className="setting-group">
          <label>Time</label>
          <div className="stepper">
            <button
              className="stepper-btn"
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { timeLimit: Math.max(60, state.timeLimit - 10) } })}
            >
              -
            </button>
            <span className="stepper-value">{state.timeLimit}s</span>
            <button
              className="stepper-btn"
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { timeLimit: Math.min(600, state.timeLimit + 10) } })}
            >
              +
            </button>
          </div>
        </div>

        <div className="setting-group">
          <label>Biome</label>
          {BIOMES.map((b) => (
            <button
              key={b.key}
              className={`biome-btn ${state.background === b.bg ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { background: b.bg } })}
              title={b.key}
            >
              {b.emoji}
            </button>
          ))}
        </div>

        <div className="setting-group">
          <label>Width</label>
          <div className="stepper">
            <button
              className="stepper-btn"
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { cols: Math.max(20, state.cols - 5) } })}
            >
              -
            </button>
            <span className="stepper-value">{state.cols}</span>
            <button
              className="stepper-btn"
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { cols: Math.min(80, state.cols + 5) } })}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* SAVE DIALOG */}
      {state.showSaveDialog && (
        <div className="editor-dialog-overlay" onClick={() => dispatch({ type: 'TOGGLE_SAVE_DIALOG' })}>
          <div className="editor-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>SAVE LEVEL</h3>
            <div className="setting-group" style={{ marginBottom: 12 }}>
              <label>Level Name</label>
              <input
                className="setting-input"
                type="text"
                maxLength={24}
                value={state.name}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', patch: { name: e.target.value } })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="editor-dialog-actions">
              <button className="editor-btn primary" onClick={handleSave}>Save</button>
              <button className="editor-btn" onClick={() => dispatch({ type: 'TOGGLE_SAVE_DIALOG' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* VALIDATION ERRORS DIALOG (shown when play fails) */}
      {showValidation && validationErrors.length > 0 && (
        <div className="editor-dialog-overlay" onClick={() => { setShowValidation(false); setValidationErrors([]); }}>
          <div className="editor-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>CANNOT PLAY</h3>
            <div className="validation-errors">
              {validationErrors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
            <div className="editor-dialog-actions">
              <button className="editor-btn" onClick={() => { setShowValidation(false); setValidationErrors([]); }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* LOAD DIALOG */}
      {state.showLoadDialog && (
        <div className="editor-dialog-overlay" onClick={() => dispatch({ type: 'TOGGLE_LOAD_DIALOG' })}>
          <div className="editor-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>LOAD LEVEL</h3>
            {savedLevels.length === 0 ? (
              <div className="no-levels-msg">No saved levels yet.</div>
            ) : (
              savedLevels.map((level) => (
                <div key={level.id} className="saved-level-item">
                  <div className="level-info">
                    <div className="level-name">{level.name}</div>
                    <div className="level-date">{new Date(level.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="level-actions">
                    <button className="editor-btn" onClick={() => handleLoadLevel(level)}>Load</button>
                    <button className="editor-btn danger" onClick={() => handleDeleteLevel(level.id)}>Del</button>
                  </div>
                </div>
              ))
            )}
            <div className="editor-dialog-actions">
              <button className="editor-btn" onClick={() => dispatch({ type: 'TOGGLE_LOAD_DIALOG' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
