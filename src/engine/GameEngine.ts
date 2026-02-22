// ============================================================================
// PIXELFORGE DYNAMICS - GAME ENGINE v2.1 (HOTFIX)
// 
// FIXES APPLIED:
// 1. Jump system - proper onGround detection
// 2. Scale - Player 96px, Enemy 80px (upscaled to match world)
// ============================================================================

import {
  PHYSICS,
  type AABB,
  TILE,
  type Tilemap,
  type TileType,
  type PlayerState,
  checkAABB,
  getTileAt,
  resolveCollision,
  applyMovement,
  updateJump,
  type Particle,
  createParticleBurst,
  updateParticles,
  updateCamera,
  applyScreenShake,
  decayShake
} from './Physics';

// Import level data
import { LEVELS as NEW_LEVELS, type LevelData } from './Levels';

// Re-export for App.tsx
export { createParticleBurst, updateParticles, updateCamera, applyScreenShake, decayShake, checkAABB, TILE };
export { NEW_LEVELS, type LevelData };
export type { Particle };

// ============================================================================
// VISUAL CONSTANTS - VIGNETTE'S 140% RULE
// 
// THE MANDATE: +40% increase on Player and Enemies only.
// Environment (tiles: 64px), Coins (40px) - DO NOT TOUCH.
// 
// MATH:
//   Old Player: 96px × 1.4 = 134.4px → 136px (even number, crisp pixels)
//   Old Enemy:  80px × 1.4 = 112px (even number, crisp pixels)
//
// VISUAL CHECK: All values are integers - no "mixels", no blur.
// ============================================================================
export const VISUALS = {
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  TILE_SIZE: 80,      // SCALED: 64 × 1.25 = 80px (ground feels solid under 170px player)
  PLAYER_SIZE: 170,   // SCALED: 136 × 1.25 = 170px
  ENEMY_SIZE: 140,    // SCALED: 112 × 1.25 = 140px
  COIN_SIZE: 50,      // SCALED: 40 × 1.25 = 50px
  OUTLINE_WIDTH: 4,   // Slightly thicker for bigger sprites
} as const;

// ============================================================================
// CHARACTER DEFINITIONS
// ============================================================================
export interface Character {
  id: string;
  name: string;
  color: string;
  sprite: string;
  maxSpeed: number;
  jumpForce: number;
  acceleration: number;
  friction: number;
  desc: string;
}

// ============================================================================
// CHARACTER DEFINITIONS - GOLDEN RATIO SCALING FOR 140% RULE
// 
// FORMULA: NewValue = OldValue × ScaleFactor
//   JumpForce: ×1.36 (linear scaling for height)
//   MaxSpeed: ×1.18 (square root scaling for feel)
//   Acceleration: ×1.22 (balanced between speed and control)
// ============================================================================
export const CHARACTERS: Character[] = [
  {
    id: 'charlie',
    name: 'Charlie',
    color: '#4ade80',
    sprite: '/charlie_idle.png',
    maxSpeed: 8.1,        // SCALED: 6.5 × 1.25 = 8.125 → 8.1
    jumpForce: -23.75,    // SCALED: -19 × 1.25 = -23.75
    acceleration: 1.375,  // SCALED: 1.1 × 1.25 = 1.375
    friction: 0.84,
    desc: 'Balanced - Perfect for beginners'
  },
  {
    id: 'corrie',
    name: 'Corrie',
    color: '#fca5a5',
    sprite: '/corrie_idle.png',
    maxSpeed: 11.0,       // SCALED: 8.8 × 1.25 = 11.0
    jumpForce: -21.875,   // SCALED: -17.5 × 1.25 = -21.875
    acceleration: 1.6875, // SCALED: 1.35 × 1.25 = 1.6875
    friction: 0.88,
    desc: 'Speedy - Fast but slippery'
  },
  {
    id: 'john',
    name: 'John',
    color: '#60a5fa',
    sprite: '/john_idle.png',
    maxSpeed: 7.5,        // SCALED: 6.0 × 1.25 = 7.5
    jumpForce: -27.5,     // SCALED: -22 × 1.25 = -27.5
    acceleration: 1.125,  // SCALED: 0.9 × 1.25 = 1.125
    friction: 0.80,
    desc: 'Jumper - High jumps, slower'
  }
];

// ============================================================================
// ENEMY DEFINITIONS
// ============================================================================
export interface Enemy {
  x: number;
  y: number;
  type: 'crab' | 'jellyfish' | 'pufferfish';
  vx: number;
  direction: number;
  startX: number;
  startY: number;
  patrol: number;
  dead: boolean;
  deadTimer: number;
  bobOffset: number;
}

export function createEnemy(
  col: number,
  row: number,
  type: Enemy['type'],
  patrolTiles: number = 3
): Enemy {
  // Enemy speed scaled: 2.1 × 1.25 = 2.625 → 2.6
  const baseSpeed = type === 'jellyfish' ? 0 : 2.6;
  return {
    x: col * VISUALS.TILE_SIZE,
    y: row * VISUALS.TILE_SIZE - VISUALS.ENEMY_SIZE,
    type,
    vx: baseSpeed,
    direction: 1,
    startX: col * VISUALS.TILE_SIZE,
    startY: row * VISUALS.TILE_SIZE - VISUALS.ENEMY_SIZE,
    patrol: patrolTiles * VISUALS.TILE_SIZE,
    dead: false,
    deadTimer: 0,
    bobOffset: Math.random() * Math.PI * 2
  };
}

export function updateEnemy(enemy: Enemy, tilemap: Tilemap, time: number): void {
  if (enemy.dead) {
    enemy.deadTimer++;
    enemy.y += 4; // SCALED: 3 × 1.25 = 3.75 → 4
    return;
  }

  if (enemy.type === 'jellyfish') {
    // time is a frame counter (60fps). 0.05 per frame ~ same visual speed as Date.now() * 0.003
    enemy.y = enemy.startY + Math.sin(time * 0.05 + enemy.bobOffset) * 38; // SCALED: 30 × 1.25 = 37.5 → 38
  } else {
    const nextX = enemy.x + enemy.vx * enemy.direction;
    const distFromStart = Math.abs(nextX - enemy.startX);
    
    if (distFromStart > enemy.patrol) {
      enemy.direction *= -1;
      return;
    }
    
    const edgeX = nextX + VISUALS.ENEMY_SIZE / 2 + (enemy.direction * VISUALS.ENEMY_SIZE / 2);
    const groundAhead = getTileAt(edgeX, enemy.y + VISUALS.ENEMY_SIZE + 5, tilemap);
    
    if (groundAhead === TILE.EMPTY) {
      enemy.direction *= -1;
      return;
    }
    
    const wallAhead = getTileAt(
      edgeX + (enemy.direction * 5),
      enemy.y + VISUALS.ENEMY_SIZE / 2,
      tilemap
    );
    
    if (wallAhead === TILE.SOLID) {
      enemy.direction *= -1;
      return;
    }
    
    enemy.x = nextX;
  }
}

// ============================================================================
// COIN DEFINITIONS
// ============================================================================
export interface Coin {
  x: number;
  y: number;
  collected: boolean;
  bobOffset: number;
  sparkleTimer: number;
}

export function createCoin(col: number, row: number): Coin {
  return {
    x: col * VISUALS.TILE_SIZE + (VISUALS.TILE_SIZE - VISUALS.COIN_SIZE) / 2,
    y: row * VISUALS.TILE_SIZE - VISUALS.COIN_SIZE,
    collected: false,
    bobOffset: Math.random() * Math.PI * 2,
    sparkleTimer: 0
  };
}

// ============================================================================
// PLAYER - The protagonist (NOW BIGGER)
// ============================================================================
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  state: PlayerState;
  facingRight: boolean;
  character: Character;
  coyoteTimer: number;
  jumpBuffer: number;
  isJumping: boolean;
  invincible: number;
  onGround: boolean;  // TRACK THIS PROPERLY
}

export function createPlayer(x: number, y: number, character: Character): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    width: VISUALS.PLAYER_SIZE,
    height: VISUALS.PLAYER_SIZE,
    state: 'IDLE',
    facingRight: true,
    character,
    coyoteTimer: 0,
    jumpBuffer: 0,
    isJumping: false,
    invincible: 0,
    onGround: false  // Start not on ground
  };
}

export function getPlayerHitbox(player: Player): AABB {
  // Forgiveness hitbox - 5% shrink on each side (REDUCED from 10%)
  // This prevents "ghost floors" while keeping hitbox smaller than visual
  const shrink = Math.max(4, Math.min(player.width, player.height) * 0.05);
  return {
    x: player.x + shrink,
    y: player.y + shrink,
    width: player.width - shrink * 2,
    height: player.height - shrink * 2
  };
}

// ============================================================================
// UPDATE PLAYER - GLITCH'S FIXED VERSION
// 
// CRITICAL FIX: Proper onGround detection for jump system
// ============================================================================
export function updatePlayer(
  player: Player,
  inputLeft: boolean,
  inputRight: boolean,
  inputJumpPressed: boolean,  // TRUE ONLY ON FIRST FRAME OF PRESS
  inputJumpHeld: boolean,     // TRUE WHILE KEY IS HELD
  tilemap: Tilemap
): { player: Player; didJump: boolean; landed: boolean } {
  let didJump = false;
  let landed = false;
  
  // Apply horizontal movement (with ground friction for slope stability)
  player.vx = applyMovement(player.vx, inputLeft, inputRight, player.character, player.onGround);
  
  // Update facing direction
  if (player.vx > 0.1) player.facingRight = true;
  if (player.vx < -0.1) player.facingRight = false;
  
  // === CRITICAL FIX: Pass ACTUAL onGround state to jump system ===
  const jumpResult = updateJump(
    { 
      coyoteTimer: player.coyoteTimer, 
      jumpBuffer: player.jumpBuffer, 
      isJumping: player.isJumping 
    },
    player.onGround,  // <-- USE ACTUAL onGround STATE!
    inputJumpPressed, // <-- Only true on first press
    inputJumpHeld,    // <-- True while held
    player.vy,
    player.character.jumpForce
  );
  
  player.vy = jumpResult.newVy;
  player.coyoteTimer = jumpResult.newState.coyoteTimer;
  player.jumpBuffer = jumpResult.newState.jumpBuffer;
  player.isJumping = jumpResult.newState.isJumping;
  didJump = jumpResult.didJump;
  
  // Apply gravity (ONLY if not on ground - prevents jitter)
  if (!player.onGround) {
    player.vy += PHYSICS.GRAVITY;
    player.vy = Math.min(player.vy, PHYSICS.MAX_FALL_SPEED);
  } else {
    player.vy = 0; // Explicitly zero velocity when grounded
  }
  
  // Resolve collision (SEPARATE AXIS)
  const collision = resolveCollision(
    player.x,
    player.y,
    player.vx,
    player.vy,
    player.width,
    player.height,
    tilemap
  );
  
  // === CRITICAL FIX: Track onGround state properly ===
  const wasOnGround = player.onGround;
  player.onGround = collision.onGround;  // <-- UPDATE onGround!
  
  player.x = collision.x;
  player.y = collision.y;
  player.vx = collision.vx;
  player.vy = collision.vy;
  
  // Detect landing
  if (collision.onGround && !wasOnGround) {
    landed = true;
    player.isJumping = false;
  }
  
  // Update state machine
  if (player.invincible > 0) {
    player.state = 'HURT';
    player.invincible--;
  } else if (collision.onGround) {
    player.state = Math.abs(player.vx) > 0.5 ? 'RUN' : 'IDLE';
  } else {
    player.state = player.vy < 0 ? 'JUMP' : 'FALL';
  }
  
  return { player, didJump, landed };
}

// ============================================================================
// GAME STATE
// ============================================================================
export interface GameState {
  player: Player;
  enemies: Enemy[];
  coins: Coin[];
  particles: Particle[];
  camera: { x: number; y: number };
  screenShake: number;
  score: number;
  coinCount: number;
  lives: number;
}

// ============================================================================
// LEVEL CONVERSION
// ============================================================================
export function parseLevel(tiles: string[]): Tilemap {
  const height = tiles.length;
  const width = tiles[0]?.length || 0;

  const data: TileType[][] = tiles.map(row =>
    row.split('').map(char => {
      if (char === 'G') return TILE.SOLID;
      if (char === 'P') return TILE.PLATFORM;
      if (char === '^') return TILE.SPIKE;
      if (char === '?') return TILE.MYSTERY;
      // 'M' tiles are parsed as EMPTY; MovingPlatform entities track position separately
      return TILE.EMPTY;
    })
  );

  return {
    width,
    height,
    tileSize: VISUALS.TILE_SIZE,
    data
  };
}

// ============================================================================
// MOVING PLATFORM - Horizontal back-and-forth entity
// ============================================================================
export interface MovingPlatform {
  x: number;
  y: number;
  width: number;
  startX: number;
  direction: number;
  range: number; // pixels to travel each way
  speed: number;
}

export function createMovingPlatform(col: number, row: number, rangeTiles: number = 4): MovingPlatform {
  const width = VISUALS.TILE_SIZE * 3; // 3-tile wide platform
  return {
    x: col * VISUALS.TILE_SIZE,
    y: row * VISUALS.TILE_SIZE,
    width,
    startX: col * VISUALS.TILE_SIZE,
    direction: 1,
    range: rangeTiles * VISUALS.TILE_SIZE,
    speed: 1.9, // SCALED: 1.5 × 1.25 = 1.875 → 1.9
  };
}

export function updateMovingPlatform(mp: MovingPlatform): void {
  mp.x += mp.speed * mp.direction;
  const dist = mp.x - mp.startX;
  if (Math.abs(dist) >= mp.range) {
    mp.direction *= -1;
    mp.x = mp.startX + mp.range * mp.direction;
  }
}

// ============================================================================
// MYSTERY BLOCK - Hit from below to spawn a coin, then becomes solid
// ============================================================================
export interface MysteryBlock {
  col: number;
  row: number;
  x: number;
  y: number;
  active: boolean;     // true = can be hit, false = already used
  bounceTimer: number; // animation timer when hit
}

export function createMysteryBlock(col: number, row: number): MysteryBlock {
  return {
    col,
    row,
    x: col * VISUALS.TILE_SIZE,
    y: row * VISUALS.TILE_SIZE,
    active: true,
    bounceTimer: 0,
  };
}

export function updateMysteryBlock(block: MysteryBlock): void {
  if (block.bounceTimer > 0) {
    block.bounceTimer--;
  }
}
