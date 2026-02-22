import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import {
  VISUALS,
  CHARACTERS,
  NEW_LEVELS,
  type Character,
  type Player,
  type Enemy,
  type Coin,
  type Particle,
  type MovingPlatform,
  type MysteryBlock,
  createPlayer,
  createEnemy,
  createCoin,
  createMovingPlatform,
  updateMovingPlatform,
  createMysteryBlock,
  updateMysteryBlock,
  updatePlayer,
  updateEnemy,
  parseLevel,
  getPlayerHitbox
} from './engine/GameEngine';
import { PHYSICS, createParticleBurst, updateParticles, updateCamera, applyScreenShake, decayShake, checkAABB, TILE, type Tilemap } from './engine/Physics';
import { initAudio, sfxJump, sfxLand, sfxCoinPickup, sfxStompKill, sfxPlayerHurt, sfxLevelComplete, sfxGameOver, sfxMysteryBlock, sfxSpikeHit, startMusic, stopMusic } from './engine/Audio';
import { getBiome, type Biome, type LevelData } from './engine/Levels';
import LevelEditor from './components/LevelEditor';

// ============================================================================
// PIXELFORGE DYNAMICS - SUPER AJOLOTES v4.0
// SMB3 REDESIGN: Timer Pressure + Density Over Distance
// ============================================================================

// ============================================================================
// SPRITE CACHE SYSTEM - Fixes "Square Glitch"
// Preload and cache all sprites. Never create new Image() in render loop.
// ============================================================================
const spriteCache: Map<string, HTMLImageElement> = new Map();

function getSprite(src: string): HTMLImageElement | null {
  if (spriteCache.has(src)) {
    const img = spriteCache.get(src)!;
    return img.complete ? img : null;
  }

  const img = new Image();
  // Resolve against Vite's base URL so assets load on GitHub Pages subpath
  const base = import.meta.env.BASE_URL;
  img.src = src.startsWith('/') ? base + src.slice(1) : src;
  spriteCache.set(src, img);
  return null;
}

// Tileset source regions (tileset.png is 1024x1024, tiles ~128px each)
// Coordinates measured from the spritesheet layout
const TILE_SPRITES = {
  // Grass-topped ground block (top-left of tileset, first tile)
  GROUND_TOP: { sx: 0, sy: 0, sw: 128, sh: 128 },
  // Underground/dirt fill (below ground surface)
  GROUND_FILL: { sx: 0, sy: 128, sw: 128, sh: 128 },
  // Stone block (gray, row 2)
  STONE: { sx: 0, sy: 256, sw: 128, sh: 128 },
  // Platform block (wooden plank style, row 3 col 2)
  PLATFORM: { sx: 256, sy: 384, sw: 128, sh: 128 },
  // Question/mystery block (row 4, col 0 area)
  MYSTERY: { sx: 0, sy: 512, sw: 128, sh: 128 },
  // Brick block
  BRICK: { sx: 384, sy: 512, sw: 128, sh: 128 },
} as const;

// ============================================================================
// BIOME TINTING SYSTEM
// Pre-renders tinted copies of the tileset per biome using canvas compositing.
// This preserves tileset detail while shifting colors to match each background.
// ============================================================================
const BIOME_TINTS: Record<Biome, string> = {
  underwater: '#4a90a8', // teal-blue for coral/sand
  cave: '#7a7a8e',       // slate gray for stone
  volcano: '#8b3a3a',    // dark red for volcanic rock
};

const tintedTilesetCache: Map<Biome, HTMLCanvasElement> = new Map();

function getTintedTileset(biome: Biome): HTMLCanvasElement | null {
  if (tintedTilesetCache.has(biome)) return tintedTilesetCache.get(biome)!;

  const original = getSprite('/tileset.png');
  if (!original) return null;

  const offscreen = document.createElement('canvas');
  offscreen.width = original.naturalWidth;
  offscreen.height = original.naturalHeight;
  const octx = offscreen.getContext('2d')!;

  // Draw original tileset
  octx.drawImage(original, 0, 0);

  // Apply tint via multiply blend
  octx.globalCompositeOperation = 'multiply';
  octx.fillStyle = BIOME_TINTS[biome];
  octx.fillRect(0, 0, offscreen.width, offscreen.height);

  // Restore original alpha (multiply can darken transparent areas)
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(original, 0, 0);

  tintedTilesetCache.set(biome, offscreen);
  return offscreen;
}

function preloadAllSprites(): void {
  // Preload character sprites
  CHARACTERS.forEach(char => getSprite(char.sprite));
  // Preload enemy sprites
  ['/enemy_crab.png', '/enemy_jellyfish.png', '/enemy_pufferfish.png'].forEach(getSprite);
  // Preload backgrounds
  NEW_LEVELS.forEach(level => getSprite(level.background));
  // Preload tileset, coin, and goal flag
  getSprite('/tileset.png');
  getSprite('/coin.png');
  getSprite('/goal_flag.png');
}

type GameScreen = 'menu' | 'character-select' | 'intro' | 'playing' | 'paused' | 'game-over' | 'level-complete' | 'victory' | 'time-up' | 'level-editor';

// Goal flag dimensions derived from TILE_SIZE (no magic numbers)
const GOAL = {
  FLAG_W: Math.round(VISUALS.TILE_SIZE * 1.25),   // 80 at 64px tiles
  FLAG_H: Math.round(VISUALS.TILE_SIZE * 1.875),  // 120 at 64px tiles
  // Hitbox: the pole area the player must touch
  HITBOX_INSET_X: Math.round(VISUALS.TILE_SIZE * 0.22),  // 14 at 64px
  HITBOX_W: Math.round(VISUALS.TILE_SIZE * 0.61),        // 39 at 64px
  HITBOX_H: Math.round(VISUALS.TILE_SIZE * 1.58),        // 101 at 64px
  // Vertical offset: flag sits above the ground row
  Y_OFFSET: Math.round(VISUALS.TILE_SIZE * 1.05),        // 67 at 64px
  // Render offset from hitbox origin
  RENDER_OFFSET_Y: Math.round(VISUALS.TILE_SIZE * 0.31), // 20 at 64px
} as const;

// Find the topmost ground (SOLID) tile row at a given column
// Used to place the goal flag on the correct ground surface
function findGroundSurface(tilemap: Tilemap, col: number): number {
  for (let row = 0; row < tilemap.height; row++) {
    if (tilemap.data[row]?.[col] === TILE.SOLID) {
      return row;
    }
  }
  // Fallback: second-to-last row
  return tilemap.height - 2;
}

// Resolve asset path against Vite base URL (for GitHub Pages subpath)
const assetUrl = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');

// Format time as M:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  // UI State
  const [gameScreen, setGameScreen] = useState<GameScreen>('menu');
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(CHARACTERS[0]);
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [coinCount, setCoinCount] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(300);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // Game State (refs for performance)
  const playerRef = useRef<Player | null>(null);
  const enemiesRef = useRef<Enemy[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const movingPlatformsRef = useRef<MovingPlatform[]>([]);
  const mysteryBlocksRef = useRef<MysteryBlock[]>([]);
  const tilemapRef = useRef(parseLevel(NEW_LEVELS[0].tiles));
  const cameraRef = useRef({ x: 0, y: 0 });
  const screenShakeRef = useRef(0);
  const landTimerRef = useRef(0);   // Frames since last landing (for squash animation)
  const frameCountRef = useRef(0);  // Global frame counter for animation cycles
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const prevJumpRef = useRef(false);
  const timeRef = useRef(300);
  const timerTicksRef = useRef(0);  // Frame-based timer (counts physics ticks, 60 = 1 second)
  const customLevelRef = useRef<LevelData | null>(null);

  // Helper: get the current active level (custom or campaign)
  const getActiveLevel = useCallback(() => {
    return customLevelRef.current ?? NEW_LEVELS[currentLevelIdx];
  }, [currentLevelIdx]);

  // Initialize level from LevelData object
  const initLevelFromData = useCallback((level: LevelData) => {
    tilemapRef.current = parseLevel(level.tiles);

    playerRef.current = createPlayer(
      level.startCol * VISUALS.TILE_SIZE,
      level.startRow * VISUALS.TILE_SIZE - VISUALS.PLAYER_SIZE,
      selectedCharacter
    );

    enemiesRef.current = level.enemies.map(e =>
      createEnemy(e.col, e.row, e.type, e.patrol)
    );

    coinsRef.current = level.coins.map(c => createCoin(c.col, c.row));

    movingPlatformsRef.current = (level.movingPlatforms ?? []).map(mp =>
      createMovingPlatform(mp.col, mp.row, mp.range)
    );

    mysteryBlocksRef.current = [];
    tilemapRef.current.data.forEach((row, rowIdx) => {
      row.forEach((tile, colIdx) => {
        if (tile === TILE.MYSTERY) {
          mysteryBlocksRef.current.push(createMysteryBlock(colIdx, rowIdx));
        }
      });
    });

    particlesRef.current = [];
    const playerX = level.startCol * VISUALS.TILE_SIZE;
    const playerY = level.startRow * VISUALS.TILE_SIZE - VISUALS.PLAYER_SIZE;
    const levelWidth = level.tiles[0].length * VISUALS.TILE_SIZE;
    const levelHeight = level.tiles.length * VISUALS.TILE_SIZE;
    cameraRef.current = {
      x: Math.max(0, Math.min(playerX - VISUALS.CANVAS_WIDTH / 2 + VISUALS.PLAYER_SIZE / 2, levelWidth - VISUALS.CANVAS_WIDTH)),
      y: Math.max(0, Math.min(playerY - VISUALS.CANVAS_HEIGHT / 2 + VISUALS.PLAYER_SIZE / 2, levelHeight - VISUALS.CANVAS_HEIGHT)),
    };
    screenShakeRef.current = 0;

    timeRef.current = level.timeLimit;
    setTimeLeft(level.timeLimit);
    timerTicksRef.current = 0;
  }, [selectedCharacter]);

  // Initialize level by campaign index
  const initLevel = useCallback((levelIdx: number) => {
    initLevelFromData(NEW_LEVELS[levelIdx]);
  }, [initLevelFromData]);
  
  // Start game
  const startGame = useCallback(() => {
    customLevelRef.current = null;
    setScore(0);
    setCoinCount(0);
    setLives(3);
    setCurrentLevelIdx(0);
    keysRef.current = {};
    prevJumpRef.current = false;
    initLevel(0);
    setGameScreen('intro');
    
    setTimeout(() => setGameScreen('playing'), 2000);
  }, [initLevel]);

  // Play a custom level from the editor
  const playCustomLevel = useCallback((levelData: LevelData) => {
    customLevelRef.current = levelData;
    setScore(0);
    setCoinCount(0);
    setLives(3);
    keysRef.current = {};
    prevJumpRef.current = false;
    initLevelFromData(levelData);
    setGameScreen('intro');
    setTimeout(() => setGameScreen('playing'), 2000);
  }, [initLevelFromData]);

  // Next level
  const nextLevel = useCallback(() => {
    const next = currentLevelIdx + 1;
    if (next < NEW_LEVELS.length) {
      setCurrentLevelIdx(next);
      keysRef.current = {};
      prevJumpRef.current = false;
      initLevel(next);
      setGameScreen('intro');
      setTimeout(() => setGameScreen('playing'), 2000);
    } else {
      setGameScreen('victory');
    }
  }, [currentLevelIdx, initLevel]);
  
  // Continue after game over
  const continueGame = useCallback(() => {
    setLives(3);
    keysRef.current = {};
    prevJumpRef.current = false;
    if (customLevelRef.current) {
      initLevelFromData(customLevelRef.current);
    } else {
      initLevel(currentLevelIdx);
    }
    setGameScreen('playing');
  }, [currentLevelIdx, initLevel, initLevelFromData]);
  
  // Game update loop
  const update = useCallback(() => {
    if (gameScreen !== 'playing') return;
    
    const player = playerRef.current;
    if (!player) return;
    
    const tilemap = tilemapRef.current;
    const keys = keysRef.current;
    
    // Update timer using frame ticks (60 ticks = 1 second at fixed timestep)
    timerTicksRef.current++;
    if (timerTicksRef.current >= PHYSICS.FPS) {
      timerTicksRef.current = 0;
      timeRef.current -= 1;
      setTimeLeft(timeRef.current);

      // Time's up!
      if (timeRef.current <= 0) {
        setLives(prev => {
          const newLives = prev - 1;
          if (newLives <= 0) {
            setGameScreen('game-over');
          } else {
            setGameScreen('time-up');
          }
          return newLives;
        });
        return;
      }
    }
    
    // Tick animation counters (before player update so frame count is current)
    frameCountRef.current++;
    if (landTimerRef.current > 0) landTimerRef.current--;

    // === MOVING PLATFORMS: Update BEFORE player to eliminate 1-frame jitter ===
    movingPlatformsRef.current.forEach(mp => {
      const prevX = mp.x;
      updateMovingPlatform(mp);
      const deltaX = mp.x - prevX;

      // Check if player is standing on this platform
      const platTop = mp.y;
      const playerBottom = player.y + player.height;
      const onPlatformY = Math.abs(playerBottom - platTop) < 4 && player.vy >= 0;
      const overlapX = player.x + player.width > mp.x && player.x < mp.x + mp.width;

      if (onPlatformY && overlapX) {
        player.x += deltaX; // Carry player with platform
        player.onGround = true;
        player.vy = 0;
      }
    });

    // === MYSTERY BLOCKS: Tick animations BEFORE player update ===
    mysteryBlocksRef.current.forEach(block => {
      updateMysteryBlock(block);
    });

    // Get inputs
    const inputLeft = keys['ArrowLeft'] || keys['a'] || keys['A'];
    const inputRight = keys['ArrowRight'] || keys['d'] || keys['D'];

    // Edge detection for jump
    const jumpKey = keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '];
    const inputJumpPressed = jumpKey && !prevJumpRef.current;
    const inputJumpHeld = jumpKey;
    prevJumpRef.current = jumpKey;

    // Update player (after environment so platforms/blocks are in correct positions)
    const playerResult = updatePlayer(
      player,
      inputLeft,
      inputRight,
      inputJumpPressed,
      inputJumpHeld,
      tilemap
    );

    playerRef.current = playerResult.player;

    // Spawn particles + sfx on jump
    if (playerResult.didJump) {
      sfxJump();
      particlesRef.current.push(...createParticleBurst(
        player.x + player.width / 2,
        player.y + player.height,
        '#87ceeb',
        8,
        4
      ));
    }

    // Spawn particles + sfx on land + trigger squash
    if (playerResult.landed) {
      sfxLand();
      landTimerRef.current = 12; // 12-frame land squash animation
      particlesRef.current.push(...createParticleBurst(
        player.x + player.width / 2,
        player.y + player.height,
        '#888888',
        7,
        3
      ));
    }

    // === SPIKE COLLISION: Check if player overlaps any spike tile ===
    if (player.invincible === 0) {
      const playerBox = getPlayerHitbox(player);
      const tileSize = VISUALS.TILE_SIZE;
      const startCol = Math.floor(playerBox.x / tileSize);
      const endCol = Math.floor((playerBox.x + playerBox.width) / tileSize);
      const startRow = Math.floor(playerBox.y / tileSize);
      const endRow = Math.floor((playerBox.y + playerBox.height) / tileSize);

      let hitSpike = false;
      for (let r = startRow; r <= endRow && !hitSpike; r++) {
        for (let c = startCol; c <= endCol && !hitSpike; c++) {
          if (tilemap.data[r]?.[c] === TILE.SPIKE) {
            hitSpike = true;
          }
        }
      }

      if (hitSpike) {
        sfxSpikeHit();
        player.invincible = 60;
        player.vy = -19;  // SCALED: -15 × 1.25 = -18.75 → -19
        player.vx = player.facingRight ? -13 : 13; // SCALED: 10 × 1.25 = 12.5 → 13
        screenShakeRef.current = 15; // SCALED: 12 × 1.25 = 15
        particlesRef.current.push(...createParticleBurst(
          player.x + player.width / 2,
          player.y + player.height,
          '#ff4444',
          14,
          5
        ));
        setLives(prev => {
          const newLives = prev - 1;
          if (newLives <= 0) setGameScreen('game-over');
          return newLives;
        });
      }
    }

    // === MYSTERY BLOCK HIT: Check if player hits from below ===
    mysteryBlocksRef.current.forEach(block => {
      if (block.bounceTimer > 0) return; // Already updating via updateMysteryBlock above

      if (!block.active) return;

      // Player must be moving upward and hitting the bottom of the block
      if (player.vy >= 0) return;

      const blockBox = {
        x: block.x,
        y: block.y,
        width: VISUALS.TILE_SIZE,
        height: VISUALS.TILE_SIZE,
      };
      const playerBox = getPlayerHitbox(player);

      if (checkAABB(playerBox, blockBox)) {
        const playerTop = player.y;
        const blockBottom = block.y + VISUALS.TILE_SIZE;
        // Must be hitting from below (player top near block bottom)
        if (playerTop < blockBottom && playerTop > block.y) {
          block.active = false;
          block.bounceTimer = 10;
          sfxMysteryBlock();

          // Turn into solid in tilemap
          tilemap.data[block.row][block.col] = TILE.SOLID;

          // Spawn a coin reward above the block
          coinsRef.current.push({
            x: block.x + (VISUALS.TILE_SIZE - VISUALS.COIN_SIZE) / 2,
            y: block.y - VISUALS.TILE_SIZE,
            collected: false,
            bobOffset: Math.random() * Math.PI * 2,
            sparkleTimer: 0,
          });

          // Bounce particles
          particlesRef.current.push(...createParticleBurst(
            block.x + VISUALS.TILE_SIZE / 2,
            block.y,
            '#fbbf24',
            8,
            3
          ));

          // Stop upward motion
          player.vy = 1;
        }
      }
    });

    // Check fall death
    if (player.y > VISUALS.CANVAS_HEIGHT + 200) {
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setGameScreen('game-over');
        } else {
          initLevel(currentLevelIdx);
        }
        return newLives;
      });
      return;
    }
    
    // Update enemies (use frame counter instead of Date.now for deterministic behavior)
    const gameTime = frameCountRef.current;
    enemiesRef.current.forEach(enemy => {
      updateEnemy(enemy, tilemap, gameTime);
      
      if (enemy.dead) return;
      
      // Check collision with player (scaled for 140% rule)
      // Enemy shrink: 5% of 112px = ~6px (was hardcoded 11px for 80px)
      const enemyShrink = Math.max(4, VISUALS.ENEMY_SIZE * 0.05);
      const enemyBox = {
        x: enemy.x + enemyShrink,
        y: enemy.y + enemyShrink,
        width: VISUALS.ENEMY_SIZE - enemyShrink * 2,
        height: VISUALS.ENEMY_SIZE - enemyShrink * 2
      };
      
      const playerBox = getPlayerHitbox(player);
      
      if (checkAABB(playerBox, enemyBox) && player.invincible === 0) {
        // Check for stomp - scaled for 140% rule
        // Stomp window: player must be falling AND within top 30% of enemy
        const playerBottom = player.y + player.height;
        const enemyTop = enemy.y + enemyShrink;
        const stompWindow = VISUALS.ENEMY_SIZE * 0.30; // 30% of enemy height
        const isStomp = player.vy > 0 && playerBottom < enemyTop + stompWindow;
        
        if (isStomp) {
          enemy.dead = true;
          sfxStompKill();
          // Stomp bounce scaled: -19 × 1.25 = -23.75 → -24
          player.vy = -24;
          setScore(prev => prev + 100);
          particlesRef.current.push(...createParticleBurst(
            enemy.x + VISUALS.ENEMY_SIZE / 2,
            enemy.y + VISUALS.ENEMY_SIZE / 2,
            '#ff6b6b',
            21,
            7
          ));
          screenShakeRef.current = 9; // SCALED: 7 × 1.25 = 8.75 → 9
        } else {
          sfxPlayerHurt();
          player.invincible = 60;
          // Knockback scaled: 15 × 1.25 = 18.75 → 19, 11 × 1.25 = 13.75 → 14
          player.vx = player.x < enemy.x ? -19 : 19;
          player.vy = -14;
          
          setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) setGameScreen('game-over');
            return newLives;
          });
          
          particlesRef.current.push(...createParticleBurst(
            player.x + player.width / 2,
            player.y + player.height / 2,
            '#ff0000',
            17,
            6
          ));
          screenShakeRef.current = 21; // SCALED: 17 × 1.25 = 21.25 → 21
        }
      }
    });
    
    // Update coins (frame-based bob for deterministic physics)
    const bobTime = frameCountRef.current * 0.05;
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;

      const bobY = Math.sin(bobTime + coin.bobOffset) * 10; // SCALED: 8 × 1.25 = 10
      const coinCenterY = coin.y + VISUALS.COIN_SIZE / 2 + bobY;
      
      const coinBox = {
        x: coin.x,
        y: coinCenterY - VISUALS.COIN_SIZE / 2,
        width: VISUALS.COIN_SIZE,
        height: VISUALS.COIN_SIZE
      };
      
      const playerBox = getPlayerHitbox(player);
      
      if (checkAABB(playerBox, coinBox)) {
        coin.collected = true;
        sfxCoinPickup();
        setCoinCount(prev => prev + 1);
        setScore(prev => prev + 50);
        particlesRef.current.push(...createParticleBurst(
          coin.x + VISUALS.COIN_SIZE / 2,
          coin.y + VISUALS.COIN_SIZE / 2,
          '#ffd700',
          10,
          4
        ));
      }
    });
    
    // Check goal (dynamic math from TILE_SIZE, no magic numbers)
    const level = getActiveLevel();
    const goalX = level.goalCol * VISUALS.TILE_SIZE;
    // Find the topmost ground row at the goal column for proper flag placement
    const goalGroundRow = level.goalRow ?? findGroundSurface(tilemap, level.goalCol);
    const goalY = goalGroundRow * VISUALS.TILE_SIZE - GOAL.Y_OFFSET;

    const goalBox = { x: goalX + GOAL.HITBOX_INSET_X, y: goalY, width: GOAL.HITBOX_W, height: GOAL.HITBOX_H };
    const playerBox = getPlayerHitbox(player);
    
    if (checkAABB(playerBox, goalBox)) {
      sfxLevelComplete();
      stopMusic();
      // Time bonus: 10 points per second remaining
      const timeBonus = timeRef.current * 10;
      setScore(prev => prev + 500 + coinCount * 10 + timeBonus);
      setGameScreen('level-complete');
    }
    
    // Update particles
    particlesRef.current = updateParticles(particlesRef.current);
    
    // Update camera (pulled back for bigger hero)
    const levelWidth = level.tiles[0].length * VISUALS.TILE_SIZE;
    const levelHeight = level.tiles.length * VISUALS.TILE_SIZE;
    
    cameraRef.current = updateCamera(
      cameraRef.current,
      player.x,
      player.y,
      player.width,        // Player dimensions
      player.height,
      player.facingRight,
      player.vx,           // TEST 5: Pass velocity for dynamic lookahead
      levelWidth,
      levelHeight,
      VISUALS.CANVAS_WIDTH,
      VISUALS.CANVAS_HEIGHT
    );
    
    // Decay screen shake
    screenShakeRef.current = decayShake(screenShakeRef.current);
  }, [gameScreen, currentLevelIdx, coinCount, initLevel]);
  
  // Render function - alpha is the interpolation factor from the accumulator
  // (0..1 representing progress between physics frames for smooth visuals)
  const render = useCallback((alpha: number = 0) => {
    void alpha; // Available for future position interpolation between physics frames
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Screen shake
    const shake = applyScreenShake(screenShakeRef.current);
    const cameraX = cameraRef.current.x + shake.x;
    const cameraY = cameraRef.current.y + shake.y;
    
    // Clear
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, VISUALS.CANVAS_WIDTH, VISUALS.CANVAS_HEIGHT);
    
    // Draw background (using sprite cache)
    const level = getActiveLevel();
    const bgImage = getSprite(level.background);
    
    if (bgImage) {
      const parallaxX = cameraX * 0.15;
      // Background is a fixed full-screen backdrop — no vertical shifting.
      // Parallax only applies horizontally for depth illusion.
      ctx.drawImage(bgImage, -parallaxX % VISUALS.CANVAS_WIDTH, 0, VISUALS.CANVAS_WIDTH, VISUALS.CANVAS_HEIGHT);
      ctx.drawImage(bgImage, -parallaxX % VISUALS.CANVAS_WIDTH + VISUALS.CANVAS_WIDTH, 0, VISUALS.CANVAS_WIDTH, VISUALS.CANVAS_HEIGHT);
    }
    
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    
    // Draw tiles (using biome-tinted tileset sprites with fillRect fallback)
    const tilemap = tilemapRef.current;
    const biome = getBiome(level);
    const tilesetImg = getTintedTileset(biome) ?? getSprite('/tileset.png');

    // === GROUND FILL: Paint solid earth below each ground column ===
    // For every column that has SOLID tiles, fill from the topmost SOLID tile
    // down to the bottom of the level. This creates visual mass under the tiles.
    const groundFillColors: Record<Biome, { top: string; bottom: string }> = {
      underwater: { top: '#1a3a4a', bottom: '#0d1f2a' },
      cave:      { top: '#2a2a3e', bottom: '#15152a' },
      volcano:   { top: '#3a1a1a', bottom: '#1f0d0d' },
    };
    const gfc = groundFillColors[biome];
    const levelBottomY = tilemap.height * VISUALS.TILE_SIZE;

    for (let col = 0; col < tilemap.width; col++) {
      // Find topmost SOLID tile in this column
      let topSolidRow = -1;
      for (let row = 0; row < tilemap.height; row++) {
        if (tilemap.data[row]?.[col] === TILE.SOLID) {
          topSolidRow = row;
          break;
        }
      }
      if (topSolidRow >= 0) {
        const fillX = col * VISUALS.TILE_SIZE;
        const fillY = topSolidRow * VISUALS.TILE_SIZE;
        const fillH = levelBottomY - fillY;
        // Gradient fill from top color to bottom color
        const grad = ctx.createLinearGradient(0, fillY, 0, levelBottomY);
        grad.addColorStop(0, gfc.top);
        grad.addColorStop(1, gfc.bottom);
        ctx.fillStyle = grad;
        ctx.fillRect(fillX, fillY, VISUALS.TILE_SIZE, fillH);
      }
    }

    tilemap.data.forEach((row, rowIdx) => {
      row.forEach((tile, colIdx) => {
        if (tile === TILE.EMPTY) return;

        const x = colIdx * VISUALS.TILE_SIZE;
        const y = rowIdx * VISUALS.TILE_SIZE;

        if (tile === TILE.SOLID) {
          if (tilesetImg) {
            // Check if tile above is empty (surface) or solid (underground fill)
            const tileAbove = rowIdx > 0 ? tilemap.data[rowIdx - 1]?.[colIdx] : TILE.EMPTY;
            const src = tileAbove === TILE.SOLID ? TILE_SPRITES.GROUND_FILL : TILE_SPRITES.GROUND_TOP;
            ctx.drawImage(
              tilesetImg,
              src.sx, src.sy, src.sw, src.sh,
              x, y, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE
            );
          } else {
            ctx.fillStyle = '#475569';
            ctx.fillRect(x, y, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE);
            ctx.fillStyle = '#64748b';
            ctx.fillRect(x, y, VISUALS.TILE_SIZE, 6);
          }
        } else if (tile === TILE.PLATFORM) {
          // Draw support/bracket shadow below platform for visual mass
          const supportH = Math.round(VISUALS.TILE_SIZE * 0.5);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.fillRect(x + 4, y + VISUALS.TILE_SIZE, VISUALS.TILE_SIZE - 8, supportH);
          // Bracket lines on sides
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.fillRect(x + 8, y + VISUALS.TILE_SIZE, 3, supportH - 4);
          ctx.fillRect(x + VISUALS.TILE_SIZE - 11, y + VISUALS.TILE_SIZE, 3, supportH - 4);

          if (tilesetImg) {
            const src = TILE_SPRITES.PLATFORM;
            ctx.drawImage(
              tilesetImg,
              src.sx, src.sy, src.sw, src.sh,
              x, y, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE
            );
          } else {
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(x, y, VISUALS.TILE_SIZE, 14);
            ctx.fillStyle = '#15803d';
            ctx.fillRect(x, y + 14, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE - 14);
          }
        } else if (tile === TILE.SPIKE) {
          // Spikes: biome-tinted hazard
          const spikeColors: Record<Biome, { tip: string; base: string }> = {
            underwater: { tip: '#e05858', base: '#7a3333' },
            cave:      { tip: '#b0b0c0', base: '#5a5a6e' },
            volcano:   { tip: '#ff6622', base: '#991b1b' },
          };
          const sc = spikeColors[biome];
          ctx.fillStyle = sc.tip;
          const spikeW = VISUALS.TILE_SIZE / 4;
          for (let s = 0; s < 4; s++) {
            const sx = x + s * spikeW;
            ctx.beginPath();
            ctx.moveTo(sx, y + VISUALS.TILE_SIZE);
            ctx.lineTo(sx + spikeW / 2, y + VISUALS.TILE_SIZE * 0.3);
            ctx.lineTo(sx + spikeW, y + VISUALS.TILE_SIZE);
            ctx.fill();
          }
          // Metallic base
          ctx.fillStyle = sc.base;
          ctx.fillRect(x, y + VISUALS.TILE_SIZE - 8, VISUALS.TILE_SIZE, 8);
        } else if (tile === TILE.MYSTERY) {
          // Mystery block: golden ? block (or used-up solid)
          const block = mysteryBlocksRef.current.find(b => b.col === colIdx && b.row === rowIdx);
          if (block && block.active) {
            // Bounce offset
            const bounceY = block.bounceTimer > 0 ? -Math.sin(block.bounceTimer / 10 * Math.PI) * 6 : 0;
            if (tilesetImg) {
              const src = TILE_SPRITES.MYSTERY;
              ctx.drawImage(tilesetImg, src.sx, src.sy, src.sw, src.sh, x, y + bounceY, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE);
            } else {
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(x, y + bounceY, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 28px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('?', x + VISUALS.TILE_SIZE / 2, y + bounceY + VISUALS.TILE_SIZE * 0.7);
              ctx.textAlign = 'start';
            }
          }
          // If inactive, it renders as SOLID (tilemap was updated)
        }
      });
    });

    // Draw moving platforms
    movingPlatformsRef.current.forEach(mp => {
      // Draw support shadow below moving platform for visual mass
      const mpSupportH = Math.round(VISUALS.TILE_SIZE * 0.5);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(mp.x + 4, mp.y + VISUALS.TILE_SIZE, mp.width - 8, mpSupportH);
      // Bracket lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(mp.x + 8, mp.y + VISUALS.TILE_SIZE, 3, mpSupportH - 4);
      ctx.fillRect(mp.x + mp.width - 11, mp.y + VISUALS.TILE_SIZE, 3, mpSupportH - 4);

      if (tilesetImg) {
        const src = TILE_SPRITES.PLATFORM;
        // Draw 3-tile-wide platform
        for (let i = 0; i < 3; i++) {
          ctx.drawImage(tilesetImg, src.sx, src.sy, src.sw, src.sh, mp.x + i * VISUALS.TILE_SIZE, mp.y, VISUALS.TILE_SIZE, VISUALS.TILE_SIZE);
        }
      } else {
        const mpColors: Record<Biome, { fill: string; top: string }> = {
          underwater: { fill: '#2a7a8a', top: '#4abaca' },
          cave:      { fill: '#5a5a6e', top: '#8888a0' },
          volcano:   { fill: '#6b2a1a', top: '#cc5533' },
        };
        const mpc = mpColors[biome];
        ctx.fillStyle = mpc.fill;
        ctx.fillRect(mp.x, mp.y, mp.width, VISUALS.TILE_SIZE);
        ctx.fillStyle = mpc.top;
        ctx.fillRect(mp.x, mp.y, mp.width, 8);
      }
    });

    // Draw coins (using coin.png sprite with fallback)
    const renderBobTime = frameCountRef.current * 0.05;
    const coinImg = getSprite('/coin.png');
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      const bob = Math.sin(renderBobTime + coin.bobOffset) * 10; // SCALED: 8 × 1.25 = 10

      ctx.save();
      ctx.translate(coin.x + VISUALS.COIN_SIZE / 2, coin.y + VISUALS.COIN_SIZE / 2 + bob);

      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 15;

      if (coinImg) {
        ctx.drawImage(
          coinImg,
          -VISUALS.COIN_SIZE / 2,
          -VISUALS.COIN_SIZE / 2,
          VISUALS.COIN_SIZE,
          VISUALS.COIN_SIZE
        );
      } else {
        // Fallback while sprite loads
        ctx.beginPath();
        ctx.arc(0, 0, VISUALS.COIN_SIZE / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    });
    
    // Draw enemies (using sprite cache)
    enemiesRef.current.forEach(enemy => {
      if (enemy.dead && enemy.deadTimer > 30) return;
      
      const enemySpritePath = enemy.type === 'crab' ? '/enemy_crab.png' : 
                              enemy.type === 'jellyfish' ? '/enemy_jellyfish.png' : '/enemy_pufferfish.png';
      const enemyImage = getSprite(enemySpritePath);
      
      ctx.save();
      ctx.translate(enemy.x + VISUALS.ENEMY_SIZE / 2, enemy.y + VISUALS.ENEMY_SIZE / 2);
      
      if (enemy.dead) {
        ctx.rotate(Math.PI);
        ctx.globalAlpha = Math.max(0, 1 - enemy.deadTimer / 30);
      }
      
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      
      if (enemyImage) {
        if (enemy.direction < 0 && enemy.type !== 'jellyfish' && !enemy.dead) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          enemyImage,
          -VISUALS.ENEMY_SIZE / 2,
          -VISUALS.ENEMY_SIZE / 2,
          VISUALS.ENEMY_SIZE,
          VISUALS.ENEMY_SIZE
        );
      } else {
        // Fallback while sprite loads
        ctx.fillStyle = enemy.type === 'crab' ? '#ef4444' : 
                       enemy.type === 'jellyfish' ? '#a855f7' : '#eab308';
        ctx.fillRect(-VISUALS.ENEMY_SIZE / 2, -VISUALS.ENEMY_SIZE / 2, VISUALS.ENEMY_SIZE, VISUALS.ENEMY_SIZE);
      }
      
      ctx.shadowBlur = 0;
      ctx.restore();
    });
    
    // Draw goal (using goal_flag.png sprite with fallback, dynamic math from TILE_SIZE)
    const renderGoalX = level.goalCol * VISUALS.TILE_SIZE;
    const renderGoalGroundRow = level.goalRow ?? findGroundSurface(tilemap, level.goalCol);
    const renderGoalY = renderGoalGroundRow * VISUALS.TILE_SIZE - GOAL.Y_OFFSET;
    const flagImg = getSprite('/goal_flag.png');

    ctx.save();
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 28;

    if (flagImg) {
      ctx.drawImage(
        flagImg,
        renderGoalX + GOAL.HITBOX_INSET_X,
        renderGoalY - GOAL.RENDER_OFFSET_Y,
        GOAL.FLAG_W,
        GOAL.FLAG_H
      );
    } else {
      // Fallback while sprite loads (pole + flag triangle)
      const poleX = renderGoalX + Math.round(VISUALS.TILE_SIZE * 0.44);
      const poleW = Math.round(VISUALS.TILE_SIZE * 0.17);
      const poleTopY = renderGoalY - Math.round(VISUALS.TILE_SIZE * 0.53);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(poleX, poleTopY, poleW, GOAL.HITBOX_H);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(poleX + poleW, poleTopY);
      ctx.lineTo(renderGoalX + Math.round(VISUALS.TILE_SIZE * 1.42), poleTopY + Math.round(VISUALS.TILE_SIZE * 0.36));
      ctx.lineTo(poleX + poleW, poleTopY + Math.round(VISUALS.TILE_SIZE * 0.70));
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Draw player with squash-stretch animations per state
    const player = playerRef.current;
    if (player) {
      const playerImage = getSprite(player.character.sprite);
      const frame = frameCountRef.current;
      const landT = landTimerRef.current;

      // Calculate squash-stretch scale based on player state
      let scaleX = 1;
      let scaleY = 1;
      let offsetY = 0; // Vertical offset to keep feet anchored

      switch (player.state) {
        case 'IDLE': {
          // Gentle breathing bob
          const breathe = Math.sin(frame * 0.06) * 0.02;
          scaleX = 1 + breathe;
          scaleY = 1 - breathe;
          break;
        }
        case 'RUN': {
          // Run squash cycle synced to footsteps
          const runCycle = Math.sin(frame * 0.3) * 0.05;
          scaleX = 1 - runCycle;
          scaleY = 1 + runCycle;
          break;
        }
        case 'JUMP': {
          // Vertical stretch when rising
          const jumpStretch = Math.min(0.15, Math.abs(player.vy) * 0.008);
          scaleX = 1 - jumpStretch * 0.5;
          scaleY = 1 + jumpStretch;
          break;
        }
        case 'FALL': {
          // Horizontal squash when falling fast
          const fallSquash = Math.min(0.12, Math.abs(player.vy) * 0.006);
          scaleX = 1 + fallSquash * 0.5;
          scaleY = 1 - fallSquash;
          break;
        }
        case 'HURT': {
          // Shake/wobble when hurt
          const wobble = Math.sin(frame * 0.8) * 0.1;
          scaleX = 1 + wobble;
          scaleY = 1 - wobble * 0.5;
          break;
        }
      }

      // Land impact squash (overrides state, decays over 12 frames)
      if (landT > 0) {
        const t = landT / 12; // 1.0 -> 0.0
        const impact = t * 0.2;
        scaleX = 1 + impact;
        scaleY = 1 - impact;
      }

      // Offset to keep feet anchored at bottom during squash/stretch
      offsetY = (1 - scaleY) * player.height * 0.5;

      ctx.save();
      ctx.translate(player.x + player.width / 2, player.y + player.height / 2 + offsetY);

      if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }

      // Apply facing direction
      const dirX = player.facingRight ? 1 : -1;
      ctx.scale(dirX * scaleX, scaleY);

      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;

      if (playerImage) {
        ctx.drawImage(
          playerImage,
          -player.width / 2,
          -player.height / 2,
          player.width,
          player.height
        );
      } else {
        ctx.fillStyle = player.character.color;
        ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }
    
    // Draw particles
    particlesRef.current.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    ctx.restore();
    
    // === HUD ===
    // Main panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(15, 15, 360, 140);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, 360, 140);
    
    // Score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`SCORE: ${score}`, 30, 45);
    
    // Coins
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`COINS: ${coinCount}`, 30, 75);
    
    // Lives
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`LIVES: ${lives}`, 30, 105);
    
    // Level
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(customLevelRef.current ? getActiveLevel().name : `LEVEL ${currentLevelIdx + 1}/10`, 200, 45);
    
    // === TIMER (SMB3 Style) ===
    const timerColor = timeLeft <= 30 ? '#ef4444' : timeLeft <= 60 ? '#fbbf24' : '#ffffff';
    ctx.fillStyle = timerColor;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`TIME: ${formatTime(timeLeft)}`, 200, 78);
    
    // Timer warning flash (blink every 30 frames = ~0.5s at 60fps)
    if (timeLeft <= 30 && Math.floor(frameCountRef.current / 30) % 2 === 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(195, 55, 155, 30);
    }
    
    // Level name panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(VISUALS.CANVAS_WIDTH - 350, 15, 335, 50);
    ctx.strokeStyle = '#60a5fa';
    ctx.strokeRect(VISUALS.CANVAS_WIDTH - 350, 15, 335, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(level.name, VISUALS.CANVAS_WIDTH - 335, 38);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(level.subtitle, VISUALS.CANVAS_WIDTH - 335, 55);
  }, [currentLevelIdx, score, coinCount, lives, timeLeft]);
  
  // Preload sprites and init audio on mount
  useEffect(() => {
    preloadAllSprites();
    // Audio context requires user gesture; init lazily on first interaction
    const onInteraction = () => {
      initAudio();
      window.removeEventListener('click', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
    window.addEventListener('click', onInteraction);
    window.addEventListener('keydown', onInteraction);
    return () => {
      window.removeEventListener('click', onInteraction);
      window.removeEventListener('keydown', onInteraction);
      stopMusic();
    };
  }, []);

  // Audio reactions to screen transitions
  useEffect(() => {
    if (gameScreen === 'game-over') {
      stopMusic();
      sfxGameOver();
    } else if (gameScreen === 'playing') {
      // Determine biome from level background for music
      const bg = getActiveLevel().background;
      const biome = bg.includes('cave') ? 'cave' as const
                  : bg.includes('volcano') ? 'volcano' as const
                  : 'underwater' as const;
      startMusic(biome);
    } else if (gameScreen === 'menu' || gameScreen === 'victory') {
      stopMusic();
    }
  }, [gameScreen, currentLevelIdx]);

  // Game loop with fixed timestep accumulator for frame-rate independence.
  // Physics always steps at 60fps regardless of monitor refresh rate.
  // Rendering happens every rAF for smooth visuals.
  useEffect(() => {
    lastFrameTimeRef.current = performance.now();
    accumulatorRef.current = 0;

    const gameLoop = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      // Clamp elapsed to prevent spiral of death after tab switch
      const clamped = Math.min(elapsed, PHYSICS.FRAME_TIME * 5);
      accumulatorRef.current += clamped;

      // Run physics in fixed steps
      while (accumulatorRef.current >= PHYSICS.FRAME_TIME) {
        update();
        accumulatorRef.current -= PHYSICS.FRAME_TIME;
      }

      // Alpha = how far we are between physics frames (0..1) for visual interpolation
      const alpha = accumulatorRef.current / PHYSICS.FRAME_TIME;
      render(alpha);
      animationRef.current = requestAnimationFrame(gameLoop);
    };
    animationRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [update, render]);
  
  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current[e.key] = true;
      if (e.key === 'Escape' && gameScreen === 'playing') {
        setGameScreen('paused');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameScreen]);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Touch helpers — write directly to keysRef (same as keyboard)
  const touchStart = (key: string) => (e: React.TouchEvent) => {
    e.preventDefault();
    keysRef.current[key] = true;
  };
  const touchEnd = (key: string) => (e: React.TouchEvent) => {
    e.preventDefault();
    keysRef.current[key] = false;
  };

  // Render UI
  return (
    <div className="game-container">
      <canvas ref={canvasRef} width={VISUALS.CANVAS_WIDTH} height={VISUALS.CANVAS_HEIGHT} className="game-canvas" tabIndex={0} />
      
      {/* MAIN MENU */}
      {gameScreen === 'menu' && (
        <div className="menu-overlay">
          <div className="menu-content">
            <h1 className="game-title">SUPER AJOLOTES</h1>
            <p className="game-subtitle">A Retro Platformer Adventure</p>
            <div className="character-preview">
              <img src={assetUrl('/charlie_idle.png')} alt="Charlie" className="preview-char" />
              <img src={assetUrl('/corrie_idle.png')} alt="Corrie" className="preview-char" />
              <img src={assetUrl('/john_idle.png')} alt="John" className="preview-char" />
            </div>
            <button className="menu-btn primary" onClick={() => setGameScreen('character-select')}>START GAME</button>
            <button className="menu-btn secondary" onClick={() => { customLevelRef.current = null; setGameScreen('level-editor'); }}>LEVEL EDITOR</button>
            <div className="instructions">
              <p><span className="key">ARROWS / WASD</span> Move</p>
              <p><span className="key">SPACE / W / ↑</span> Jump</p>
              <p><span className="key">ESC</span> Pause</p>
              <p className="tip">Jump on enemies to defeat them!</p>
              <p className="tip">Beat the timer for bonus points!</p>
            </div>
          </div>
        </div>
      )}
      
      {/* CHARACTER SELECT */}
      {gameScreen === 'character-select' && (
        <div className="menu-overlay">
          <div className="menu-content">
            <h2 className="menu-title">CHOOSE YOUR AJOLOTE</h2>
            <div className="character-grid">
              {CHARACTERS.map(char => (
                <button key={char.id} className={`character-card ${selectedCharacter.id === char.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCharacter(char)} style={{ borderColor: char.color }}>
                  <img src={assetUrl(char.sprite)} alt={char.name} className="character-img" />
                  <h3 style={{ color: char.color }}>{char.name}</h3>
                  <p className="char-desc">{char.desc}</p>
                  <div className="stats">
                    <div className="stat">
                      <span>Speed</span>
                      <div className="stat-bar">
                        <div className="stat-fill" style={{ width: `${(char.maxSpeed / 7.5) * 100}%`, background: char.color }} />
                      </div>
                    </div>
                    <div className="stat">
                      <span>Jump</span>
                      <div className="stat-bar">
                        <div className="stat-fill" style={{ width: `${(Math.abs(char.jumpForce) / 15.5) * 100}%`, background: char.color }} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button className="menu-btn primary" onClick={startGame}>PLAY</button>
            <button className="menu-btn secondary" onClick={() => setGameScreen('menu')}>BACK</button>
          </div>
        </div>
      )}
      
      {/* LEVEL INTRO */}
      {gameScreen === 'intro' && (
        <div className="menu-overlay intro">
          <div className="intro-content">
            <h2 className="level-name">{getActiveLevel().name}</h2>
            <p className="level-subtitle">{getActiveLevel().subtitle}</p>
            <div className="level-number">{customLevelRef.current ? 'CUSTOM LEVEL' : `LEVEL ${currentLevelIdx + 1}`}</div>
            <div className="timer-preview">TIME: {formatTime(getActiveLevel().timeLimit)}</div>
          </div>
        </div>
      )}
      
      {/* PAUSED */}
      {gameScreen === 'paused' && (
        <div className="menu-overlay">
          <div className="menu-content small">
            <h2 className="menu-title">PAUSED</h2>
            <button className="menu-btn primary" onClick={() => setGameScreen('playing')}>RESUME</button>
            <button className="menu-btn secondary" onClick={() => setGameScreen('menu')}>MAIN MENU</button>
          </div>
        </div>
      )}
      
      {/* TIME UP */}
      {gameScreen === 'time-up' && (
        <div className="menu-overlay">
          <div className="menu-content small">
            <h2 className="menu-title" style={{ color: '#ef4444' }}>TIME'S UP!</h2>
            <p className="final-score">You ran out of time!</p>
            <button className="menu-btn primary" onClick={continueGame}>TRY AGAIN</button>
            {customLevelRef.current && (
              <button className="menu-btn secondary" onClick={() => setGameScreen('level-editor')}>BACK TO EDITOR</button>
            )}
            <button className="menu-btn secondary" onClick={() => { customLevelRef.current = null; setGameScreen('menu'); }}>MAIN MENU</button>
          </div>
        </div>
      )}
      
      {/* GAME OVER */}
      {gameScreen === 'game-over' && (
        <div className="menu-overlay">
          <div className="menu-content small">
            <h2 className="menu-title" style={{ color: '#ef4444' }}>GAME OVER</h2>
            <p className="final-score">Final Score: {score}</p>
            <p className="final-coins">Coins: {coinCount}</p>
            <button className="menu-btn primary" onClick={continueGame}>CONTINUE</button>
            {customLevelRef.current && (
              <button className="menu-btn secondary" onClick={() => setGameScreen('level-editor')}>BACK TO EDITOR</button>
            )}
            <button className="menu-btn secondary" onClick={() => { customLevelRef.current = null; setGameScreen('menu'); }}>MAIN MENU</button>
          </div>
        </div>
      )}
      
      {/* LEVEL COMPLETE */}
      {gameScreen === 'level-complete' && (
        <div className="menu-overlay">
          <div className="menu-content small">
            <h2 className="menu-title" style={{ color: '#22c55e' }}>LEVEL COMPLETE!</h2>
            <p className="level-score">Score: {score}</p>
            <p className="level-coins">Coins: {coinCount}</p>
            <p className="time-bonus" style={{ color: '#fbbf24' }}>Time Bonus: +{timeLeft * 10}</p>
            {customLevelRef.current ? (
              <button className="menu-btn primary" onClick={() => setGameScreen('level-editor')}>BACK TO EDITOR</button>
            ) : (
              <button className="menu-btn primary" onClick={nextLevel}>NEXT LEVEL</button>
            )}
            <button className="menu-btn secondary" onClick={() => { customLevelRef.current = null; setGameScreen('menu'); }}>MAIN MENU</button>
          </div>
        </div>
      )}
      
      {/* VICTORY */}
      {gameScreen === 'victory' && (
        <div className="menu-overlay">
          <div className="menu-content">
            <h2 className="menu-title victory">VICTORY!</h2>
            <p className="victory-text">You escaped the depths!</p>
            <div className="victory-stats">
              <p>Final Score: {score}</p>
              <p>Total Coins: {coinCount}</p>
            </div>
            <div className="victory-characters">
              <img src={assetUrl('/charlie_idle.png')} alt="Charlie" />
              <img src={assetUrl('/corrie_idle.png')} alt="Corrie" />
              <img src={assetUrl('/john_idle.png')} alt="John" />
            </div>
            <button className="menu-btn primary" onClick={() => { customLevelRef.current = null; setGameScreen('menu'); }}>PLAY AGAIN</button>
          </div>
        </div>
      )}

      {/* LEVEL EDITOR */}
      {gameScreen === 'level-editor' && (
        <LevelEditor
          onBack={() => { customLevelRef.current = null; setGameScreen('menu'); }}
          onPlayLevel={playCustomLevel}
        />
      )}

      {/* Touch controls — visible on touch devices during gameplay */}
      {isTouchDevice && gameScreen === 'playing' && (
        <div className="touch-controls">
          <div className="touch-dpad">
            <button className="touch-btn touch-left" onTouchStart={touchStart('ArrowLeft')} onTouchEnd={touchEnd('ArrowLeft')}>◀</button>
            <button className="touch-btn touch-right" onTouchStart={touchStart('ArrowRight')} onTouchEnd={touchEnd('ArrowRight')}>▶</button>
          </div>
          <button className="touch-btn touch-jump" onTouchStart={touchStart('ArrowUp')} onTouchEnd={touchEnd('ArrowUp')}>▲</button>
        </div>
      )}

      {/* Touch pause button */}
      {isTouchDevice && gameScreen === 'playing' && (
        <button className="touch-btn touch-pause" onTouchStart={() => setGameScreen('paused')}>⏸</button>
      )}
    </div>
  );
}

export default App;
