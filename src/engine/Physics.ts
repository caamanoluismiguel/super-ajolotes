// ============================================================================
// PIXELFORGE DYNAMICS - PHYSICS ENGINE v2.0
// Lead Engineer: "Glitch"
// 
// CORE PRINCIPLES:
// 1. Separate Axis Resolution (never move X and Y together)
// 2. Fixed 60fps timestep (no delta time nonsense)
// 3. State Machine architecture (no boolean flags)
// 4. Predictable, reproducible physics
// ============================================================================

export const PHYSICS = {
  GRAVITY: 0.81,          // SCALED: 0.65 × 1.25 = 0.8125 → 0.81
  MAX_FALL_SPEED: 17.5,   // SCALED: 14 × 1.25 = 17.5
  COYOTE_FRAMES: 8,
  JUMP_BUFFER_FRAMES: 6,
  FPS: 60,
  FRAME_TIME: 1000 / 60, // 16.67ms
} as const;

// ============================================================================
// STATE MACHINE - The heart of predictable behavior
// ============================================================================
export type PlayerState = 
  | 'IDLE' 
  | 'RUN' 
  | 'JUMP' 
  | 'FALL' 
  | 'HURT' 
  | 'DEAD';

export interface StateTransition {
  from: PlayerState;
  to: PlayerState;
  condition: () => boolean;
}

// ============================================================================
// AABB - Axis-Aligned Bounding Box
// The ONLY collision primitive we use. No circles, no polygons.
// ============================================================================
export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function checkAABB(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Get the intersection depth (for resolution)
export function getIntersectionDepth(a: AABB, b: AABB): { x: number; y: number } | null {
  if (!checkAABB(a, b)) return null;
  
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  
  return { x: overlapX, y: overlapY };
}

// ============================================================================
// TILE COLLISION - Corner-point sampling (4 points, not grid sweep)
// ============================================================================
export const TILE = {
  EMPTY: 0,
  SOLID: 1,      // Ground - collide all sides
  PLATFORM: 2,   // One-way - collide top only
  SPIKE: 3,      // Hazard - kills on contact (no collision blocking)
  MYSTERY: 4,    // ? block - hit from below to activate, becomes solid
} as const;

export type TileType = typeof TILE[keyof typeof TILE];

export interface Tilemap {
  width: number;
  height: number;
  tileSize: number;
  data: TileType[][];
}

// Sample collision at specific point
export function getTileAt(worldX: number, worldY: number, tilemap: Tilemap): TileType {
  const col = Math.floor(worldX / tilemap.tileSize);
  const row = Math.floor(worldY / tilemap.tileSize);
  
  if (row < 0 || row >= tilemap.height || col < 0 || col >= tilemap.width) {
    return TILE.EMPTY;
  }
  return tilemap.data[row]?.[col] ?? TILE.EMPTY;
}

// Check collision using 4 corner points (optimization)
// FIX: Proportional inset scales with object size to prevent "phantom" collisions
export function checkSolidCollision(
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  tilemap: Tilemap
): boolean {
  // Proportional inset: ~8% of smaller dimension (was hardcoded 2-3px)
  // This ensures the collision box scales correctly with the 140% rule
  const inset = Math.max(4, Math.min(width, height) * 0.08);
  
  const points = [
    { x: x + inset, y: y + inset },                    // Top-left
    { x: x + width - inset, y: y + inset },            // Top-right
    { x: x + inset, y: y + height - inset },           // Bottom-left
    { x: x + width - inset, y: y + height - inset },   // Bottom-right
  ];
  
  for (const p of points) {
    if (getTileAt(p.x, p.y, tilemap) === TILE.SOLID) {
      return true;
    }
  }
  return false;
}

// Check platform collision (one-way, top only)
// FIX: Proportional inset for platform checks
export function checkPlatformCollision(
  x: number,
  y: number,
  width: number,
  height: number,
  vy: number,
  tilemap: Tilemap
): { x: number; y: number } | null {
  // Only check when falling
  if (vy <= 0) return null;
  
  const feetY = y + height;
  const prevFeetY = feetY - vy;
  
  // Only check if we crossed a tile boundary this frame
  const prevRow = Math.floor(prevFeetY / tilemap.tileSize);
  const currRow = Math.floor(feetY / tilemap.tileSize);
  
  if (prevRow === currRow) return null;
  
  // FIX: Proportional inset for platform edge checks (was hardcoded 4-5px)
  const inset = Math.max(4, width * 0.08);
  const leftCol = Math.floor((x + inset) / tilemap.tileSize);
  const rightCol = Math.floor((x + width - inset) / tilemap.tileSize);
  
  for (let col = leftCol; col <= rightCol; col++) {
    if (tilemap.data[currRow]?.[col] === TILE.PLATFORM) {
      return {
        x: col * tilemap.tileSize,
        y: currRow * tilemap.tileSize
      };
    }
  }
  return null;
}

// ============================================================================
// SEPARATE AXIS RESOLUTION - The Golden Rule
// Never move diagonally. X first, resolve, then Y, resolve.
// ============================================================================
export interface CollisionResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
}

// FIX: Hitbox shrink calculation - REDUCED to 5% to prevent "ghost floors"
// The collision box should be SLIGHTLY smaller than visual, not significantly smaller
function getHitboxShrink(width: number, height: number): number {
  // 5% shrink on each side - enough for forgiveness without clipping jumps
  return Math.max(4, Math.min(width, height) * 0.05);
}

export function resolveCollision(
  x: number,
  y: number,
  vx: number,
  vy: number,
  width: number,
  height: number,
  tilemap: Tilemap,
  useHitbox: boolean = true  // NEW: Use forgiveness hitbox for collision
): CollisionResult {
  let newX = x;
  let newY = y;
  let newVx = vx;
  let newVy = vy;
  let onGround = false;
  let hitWall = false;
  let hitCeiling = false;
  
  // Calculate hitbox bounds (for forgiveness collision)
  const shrink = useHitbox ? getHitboxShrink(width, height) : 0;
  const collisionW = width - shrink * 2;
  const collisionH = height - shrink * 2;
  
  // === STEP 1: Move X and resolve (using hitbox) ===
  newX += vx;
  
  if (checkSolidCollision(newX + shrink, y + shrink, collisionW, collisionH, tilemap)) {
    // Hit something on X axis - snap to integer pixel to eliminate sub-pixel floating
    if (vx > 0) {
      // Moving right - snap to left edge of tile
      const tileRight = Math.floor((newX + shrink + collisionW) / tilemap.tileSize) * tilemap.tileSize;
      newX = Math.floor(tileRight - shrink - collisionW);
    } else if (vx < 0) {
      // Moving left - snap to right edge of tile
      const tileLeft = Math.floor((newX + shrink) / tilemap.tileSize) * tilemap.tileSize + tilemap.tileSize;
      newX = Math.floor(tileLeft - shrink);
    }
    newVx = 0;
    hitWall = true;
  }
  
  // === STEP 2: Move Y and resolve (using hitbox) ===
  newY += vy;
  
  // Check solid collision first - snap to integer pixel to eliminate sub-pixel floating
  if (checkSolidCollision(newX + shrink, newY + shrink, collisionW, collisionH, tilemap)) {
    if (vy > 0) {
      // Falling - snap to top of tile
      const tileBottom = Math.floor((newY + shrink + collisionH) / tilemap.tileSize) * tilemap.tileSize;
      newY = Math.floor(tileBottom - shrink - collisionH);
      onGround = true;
      newVy = 0;
    } else if (vy < 0) {
      // Rising - hit head
      const tileTop = Math.floor((newY + shrink) / tilemap.tileSize) * tilemap.tileSize + tilemap.tileSize;
      newY = Math.floor(tileTop - shrink);
      newVy = 0;
      hitCeiling = true;
    }
  }

  // Check platform collision (only if not on solid ground)
  if (!onGround && vy > 0) {
    const platform = checkPlatformCollision(newX + shrink, newY + shrink, collisionW, collisionH, vy, tilemap);
    if (platform) {
      newY = Math.floor(platform.y - shrink - collisionH);
      onGround = true;
      newVy = 0;
    }
  }
  
  return {
    x: newX,
    y: newY,
    vx: newVx,
    vy: newVy,
    onGround,
    hitWall,
    hitCeiling
  };
}

// ============================================================================
// MOVEMENT PHYSICS - Character-specific tuning
// ============================================================================
export interface MovementConfig {
  maxSpeed: number;
  acceleration: number;
  friction: number;
  jumpForce: number;
}

export function applyMovement(
  vx: number,
  inputLeft: boolean,
  inputRight: boolean,
  config: MovementConfig,
  onGround: boolean = true  // NEW: Ground state for slope friction
): number {
  let newVx = vx;
  
  // Apply acceleration
  if (inputLeft && !inputRight) {
    newVx -= config.acceleration;
  } else if (inputRight && !inputLeft) {
    newVx += config.acceleration;
  } else {
    // Apply friction when no input
    if (onGround) {
      // TEST 2 FIX: Aggressive friction on ground (prevents slope sliding)
      // Friction = 0.7 means 30% velocity reduction per frame
      newVx *= 0.7;
      // Hard stop for very small velocities (slope stability)
      if (Math.abs(newVx) < 0.5) {
        newVx = 0;
      }
    } else {
      // Air friction (normal)
      newVx *= config.friction;
    }
  }
  
  // Clamp to max speed
  newVx = Math.max(-config.maxSpeed, Math.min(config.maxSpeed, newVx));
  
  // Stop tiny movements (snap to zero)
  if (Math.abs(newVx) < 0.1) {
    newVx = 0;
  }
  
  return newVx;
}

// ============================================================================
// JUMP PHYSICS - Coyote time, jump buffering, variable height
// ============================================================================
export interface JumpState {
  coyoteTimer: number;
  jumpBuffer: number;
  isJumping: boolean;
}

export function updateJump(
  state: JumpState,
  onGround: boolean,
  jumpPressed: boolean,
  jumpHeld: boolean,
  vy: number,
  jumpForce: number
): { newVy: number; newState: JumpState; didJump: boolean } {
  let newVy = vy;
  let didJump = false;
  let newState = { ...state };
  
  // Update timers
  if (onGround) {
    newState.coyoteTimer = PHYSICS.COYOTE_FRAMES;
  } else if (newState.coyoteTimer > 0) {
    newState.coyoteTimer--;
  }
  
  // Buffer jump input
  if (jumpPressed) {
    newState.jumpBuffer = PHYSICS.JUMP_BUFFER_FRAMES;
  } else if (newState.jumpBuffer > 0) {
    newState.jumpBuffer--;
  }
  
  // Execute jump if buffered and can jump
  if (newState.jumpBuffer > 0 && (onGround || newState.coyoteTimer > 0)) {
    newVy = jumpForce;
    newState.jumpBuffer = 0;
    newState.coyoteTimer = 0;
    newState.isJumping = true;
    didJump = true;
  }
  
  // Variable jump height - gentler cut for better feel
  if (newState.isJumping && !jumpHeld && newVy < jumpForce * 0.5) {
    newVy *= 0.85;  // Was 0.7 - too aggressive. Now 0.85 - smoother.
  }
  
  // Reset jump state when falling
  if (newVy > 0) {
    newState.isJumping = false;
  }
  
  return { newVy, newState, didJump };
}

// ============================================================================
// CAMERA - Smooth follow with lookahead
// FIX: Scaled for 140% sprite size, shifted forward for visibility
// ============================================================================
export interface Camera {
  x: number;
  y: number;
}

export function updateCamera(
  camera: Camera,
  targetX: number,        // Top-left X (player.x)
  targetY: number,        // Top-left Y (player.y)
  targetWidth: number,    // Player width for center calculation
  targetHeight: number,   // Player height for center calculation
  facingRight: boolean,
  vx: number,             // Player velocity for dynamic lookahead
  levelWidth: number,
  levelHeight: number,
  screenWidth: number,
  screenHeight: number
): Camera {
  // Track visual center of player
  const centerX = targetX + targetWidth / 2;
  const centerY = targetY + targetHeight / 2;

  // Horizontal lookahead: player at 30% from left, 70% view ahead
  const baseLookahead = facingRight ? 250 : -120;
  const velocityBonus = Math.abs(vx) * 8;
  const direction = facingRight ? 1 : -1;
  const lookahead = baseLookahead + (velocityBonus * direction);
  const desiredX = centerX - (screenWidth * 0.30) + lookahead;

  // Vertical: player at 40% from top, 60% below for landing visibility
  const desiredY = centerY - (screenHeight * 0.40);

  // Smooth interpolation
  const newX = camera.x + (desiredX - camera.x) * 0.08;
  const newY = camera.y + (desiredY - camera.y) * 0.05;

  // Clamp to level bounds (both axes)
  const maxCamX = levelWidth - screenWidth;
  const maxCamY = Math.max(0, levelHeight - screenHeight);
  const clampedX = Math.max(0, Math.min(maxCamX, newX));
  const clampedY = Math.max(0, Math.min(maxCamY, newY));

  return { x: clampedX, y: clampedY };
}

// ============================================================================
// PARTICLE SYSTEM - Simple but effective
// ============================================================================
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

export function createParticleBurst(
  x: number,
  y: number,
  color: string,
  count: number,
  speed: number = 4,
  size: number = 4
): Particle[] {
  const particles: Particle[] = [];
  
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const vel = speed * (0.5 + Math.random() * 0.5);
    
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel - 2,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
      size: size * (0.8 + Math.random() * 0.4),
      gravity: 0.15
    });
  }
  
  return particles;
}

export function updateParticles(particles: Particle[]): Particle[] {
  return particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.life--;
    return p.life > 0;
  });
}

// ============================================================================
// SCREEN SHAKE - Impact feedback
// ============================================================================
export function applyScreenShake(shakeAmount: number): { x: number; y: number } {
  if (shakeAmount <= 0) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * shakeAmount,
    y: (Math.random() - 0.5) * shakeAmount
  };
}

export function decayShake(shake: number): number {
  return shake * 0.9;
}
