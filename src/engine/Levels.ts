// ============================================================================
// PIXELFORGE DYNAMICS - SMB3 STYLE LEVELS
// 
// DESIGN PRINCIPLES:
// - 300-second timer (5 minutes max)
// - 40-60 tiles wide (compact, not hallways)
// - 2-Second Rule: Action every 2 seconds
// - Verticality: Multiple height layers
// - Density over Distance
// ============================================================================

import { VISUALS } from './GameEngine';

// Tile types
// G = Ground (solid)
// P = Platform (one-way)
// ^ = Spike (hazard)
// M = Moving platform (horizontal)
// V = Moving platform (vertical)
// ? = Mystery block (coin/powerup)
// B = Brick block (breakable)
// D = Door/Exit area

export interface LevelData {
  id: number;
  name: string;
  subtitle: string;
  type: 'ground' | 'athletic' | 'underground' | 'castle';
  background: string;
  timeLimit: number; // seconds
  tiles: string[];
  enemies: { col: number; row: number; type: 'crab' | 'jellyfish' | 'pufferfish'; patrol?: number }[];
  coins: { col: number; row: number }[];
  movingPlatforms?: { col: number; row: number; range?: number }[];
  startCol: number;
  startRow: number;
  goalCol: number;
  goalRow?: number; // Optional: override default goal Y (bottom of level). Row of the ground tile the goal sits on.
}

// Biome type derived from background image
export type Biome = 'underwater' | 'cave' | 'volcano';

export function getBiome(level: LevelData): Biome {
  if (level.background.includes('cave')) return 'cave';
  if (level.background.includes('volcano')) return 'volcano';
  return 'underwater';
}

// Positioning helpers (used by game engine)
export const colX = (col: number) => col * VISUALS.TILE_SIZE;
export const rowY = (row: number) => row * VISUALS.TILE_SIZE;

// ============================================================================
// LEVEL 1: SHALLOW WATERS - Tutorial (Ground Type)
// Length: 45 tiles | Time: 300s
// Teaching: Jump, stomp enemies, collect coins
// 2-Second Rule: Pits, platforms, enemies every 2-3 tiles
// ============================================================================
const LEVEL_1: LevelData = {
  id: 1,
  name: "Shallow Waters",
  subtitle: "The journey begins...",
  type: 'ground',
  background: '/bg_underwater.png',
  timeLimit: 300,
  tiles: [
    "                                             ",
    "                                             ",
    "                                             ",
    "          PPP                                ",
    "                                             ",
    "     PPP        PPP                          ",
    "                                             ",
    "              GGG                            ",
    "                                             ",
    "   GGG              GGG                      ",
    "                                             ",
    "        GGG              PPP                 ",
    "                                             ",
    "GGGG         GGGGG              GGGGGGGGGGGGG",
    "GGGG         GGGGG              GGGGGGGGGGGGG",
    "GGGG         GGGGG              GGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 12, row: 13, type: 'crab', patrol: 2 },
    { col: 22, row: 13, type: 'crab', patrol: 2 },
    { col: 32, row: 13, type: 'crab', patrol: 2 },
  ],
  coins: [
    { col: 5, row: 9 }, { col: 7, row: 9 },
    { col: 10, row: 5 }, { col: 12, row: 5 },
    { col: 16, row: 7 }, { col: 18, row: 7 },
    { col: 25, row: 11 }, { col: 27, row: 11 },
    { col: 35, row: 13 }, { col: 37, row: 13 }, { col: 39, row: 13 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 43
};

// ============================================================================
// LEVEL 2: LEAP OF FAITH - Jump Training (Athletic Type)
// Length: 50 tiles | Time: 300s
// Teaching: Precision jumps, verticality
// 2-Second Rule: Constant jumping required
// ============================================================================
const LEVEL_2: LevelData = {
  id: 2,
  name: "Leap of Faith",
  subtitle: "Trust your instincts",
  type: 'athletic',
  background: '/bg_underwater.png',
  timeLimit: 300,
  tiles: [
    "                                                  ",
    "                                                  ",
    "                                                  ",
    "        PPP                                       ",
    "                                                  ",
    "             PPP                                  ",
    "                                                  ",
    "                  PPP                             ",
    "                                                  ",
    "                       PPP                        ",
    "                                                  ",
    "                            PPP                   ",
    "                                                  ",
    "GGGG      GGG      GGG      GGG      GGGGGGGGGGGGG",
    "GGGG      GGG      GGG      GGG      GGGGGGGGGGGGG",
    "GGGG      GGG      GGG      GGG      GGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 15, row: 11, type: 'jellyfish' },
    { col: 28, row: 9, type: 'jellyfish' },
    { col: 40, row: 13, type: 'crab', patrol: 2 },
  ],
  coins: [
    { col: 6, row: 3 }, { col: 8, row: 3 },
    { col: 13, row: 5 }, { col: 15, row: 5 },
    { col: 20, row: 7 }, { col: 22, row: 7 },
    { col: 27, row: 9 }, { col: 29, row: 9 },
    { col: 34, row: 11 }, { col: 36, row: 11 },
    { col: 44, row: 13 }, { col: 46, row: 13 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 48
};

// ============================================================================
// LEVEL 3: UP AND OVER - Vertical Challenge (Athletic Type)
// Length: 45 tiles | Time: 280s (shorter, harder)
// Teaching: Upward progression, enemy avoidance
// 2-Second Rule: Platforms stacked vertically
// ============================================================================
const LEVEL_3: LevelData = {
  id: 3,
  name: "Up and Over",
  subtitle: "The depths call",
  type: 'athletic',
  background: '/bg_cave.png',
  timeLimit: 280,
  tiles: [
    "                                             ",
    "                                             ",
    "                    PPP                      ",
    "                                             ",
    "     PPP              GGG                    ",
    "                                             ",
    "          GGG              PPP               ",
    "                                             ",
    "               PPP              GGG          ",
    "                                             ",
  "GGG              GGG              PPP        ",
    "                                             ",
    "     PPP              GGG              GGG   ",
    "                                             ",
    "GGGG         GGGGG         GGGGGGGGGGGGGGGGGG",
    "GGGG         GGGGG         GGGGGGGGGGGGGGGGGG",
    "GGGG         GGGGG         GGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 10, row: 10, type: 'jellyfish' },
    { col: 22, row: 6, type: 'jellyfish' },
    { col: 34, row: 8, type: 'jellyfish' },
    { col: 18, row: 14, type: 'crab', patrol: 2 },
  ],
  coins: [
    { col: 6, row: 4 }, { col: 8, row: 4 },
    { col: 14, row: 10 }, { col: 16, row: 10 },
    { col: 24, row: 2 }, { col: 26, row: 2 },
    { col: 28, row: 6 }, { col: 30, row: 6 },
    { col: 38, row: 11 }, { col: 40, row: 11 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 43
};

// ============================================================================
// LEVEL 4: CRAB CROSSING - Enemy Gauntlet (Ground Type)
// Length: 50 tiles | Time: 280s
// Teaching: Enemy patterns, timing
// 2-Second Rule: Enemies every 3-4 tiles, no safe zones
// ============================================================================
const LEVEL_4: LevelData = {
  id: 4,
  name: "Crab Crossing",
  subtitle: "Beware the guardians",
  type: 'ground',
  background: '/bg_cave.png',
  timeLimit: 280,
  tiles: [
    "                                                  ",
    "                                                  ",
    "                                                  ",
    "          PPP                                     ",
    "                                                  ",
    "               PPP          ?                     ",
    "                                                  ",
    "     GGG        ?      GGG                        ",
    "                                                  ",
    "          GGG     ?         PPP                   ",
    "                                                  ",
    "GGGG               GGG               GGGGGGGGGGGG",
    "                                                  ",
    "     GGG      GGG      GGG      GGG     GGGGGGGGG",
    "                                                  ",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 8, row: 15, type: 'crab', patrol: 2 },
    { col: 15, row: 13, type: 'crab', patrol: 2 },
    { col: 22, row: 15, type: 'crab', patrol: 2 },
    { col: 29, row: 13, type: 'crab', patrol: 2 },
    { col: 36, row: 15, type: 'crab', patrol: 2 },
    { col: 44, row: 11, type: 'jellyfish' },
  ],
  coins: [
    { col: 6, row: 7 }, { col: 8, row: 7 },
    { col: 13, row: 5 }, { col: 15, row: 5 },
    { col: 20, row: 11 }, { col: 22, row: 11 },
    { col: 27, row: 9 }, { col: 29, row: 9 },
    { col: 34, row: 13 }, { col: 36, row: 13 },
    { col: 42, row: 15 }, { col: 44, row: 15 }, { col: 46, row: 15 },
  ],
  startCol: 2, startRow: 14,
  goalCol: 48
};

// ============================================================================
// LEVEL 5: LAVA RUN - Precision & Speed (Ground Type)
// Length: 55 tiles | Time: 260s (tight timer)
// Teaching: Fast movement, precise jumps
// 2-Second Rule: Gaps and enemies force constant action
// ============================================================================
const LEVEL_5: LevelData = {
  id: 5,
  name: "Lava Run",
  subtitle: "The volcano awakens",
  type: 'ground',
  background: '/bg_volcano.png',
  timeLimit: 260,
  tiles: [
    "                                                       ",
    "                                                       ",
    "                                                       ",
    "     PPP        PPP                                    ",
    "                                                       ",
    "          PPP        PPP                               ",
    "                                                       ",
    "     GGG        GGG        GGG                         ",
    "                                                       ",
    "          GGG        PPP        GGG                    ",
    "                                                       ",
    "GGGG        GGG        GGG        GGGGGGGGGGGGGGGGGGGGG",
    "                                                       ",
    "     GGG  ^^    GGG  ^^    GGG  ^^    GGGGGGGGGGGGGGGGG",
    "    ^^^^  ^^   ^^^^  ^^   ^^^^  ^^    GGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 10, row: 15, type: 'pufferfish', patrol: 2 },
    { col: 18, row: 10, type: 'jellyfish' },
    { col: 26, row: 15, type: 'pufferfish', patrol: 2 },
    { col: 34, row: 10, type: 'jellyfish' },
    { col: 42, row: 15, type: 'pufferfish', patrol: 2 },
    { col: 50, row: 15, type: 'crab', patrol: 2 },
  ],
  coins: [
    { col: 5, row: 3 }, { col: 7, row: 3 }, { col: 9, row: 3 },
    { col: 14, row: 5 }, { col: 16, row: 5 },
    { col: 22, row: 7 }, { col: 24, row: 7 },
    { col: 30, row: 9 }, { col: 32, row: 9 },
    { col: 38, row: 11 }, { col: 40, row: 11 },
    { col: 46, row: 13 }, { col: 48, row: 13 },
  ],
  startCol: 2, startRow: 10,
  goalCol: 53
};

// ============================================================================
// LEVEL 6: THE GAUNTLET - Maximum Density (Athletic Type)
// Length: 50 tiles | Time: 260s
// Teaching: Everything combined
// 2-Second Rule: No flat ground longer than 2 tiles
// ============================================================================
const LEVEL_6: LevelData = {
  id: 6,
  name: "The Gauntlet",
  subtitle: "Prove your skill",
  type: 'athletic',
  background: '/bg_volcano.png',
  timeLimit: 260,
  tiles: [
    "                                                  ",
    "                                                  ",
    "                    PPP                           ",
    "                                                  ",
    "     PPP              GGG                         ",
    "                                                  ",
    "          GGG              PPP                    ",
    "                                                  ",
    "               PPP              GGG               ",
    "                                                  ",
    "GGGG               GGG              PPP          ",
    "                                                  ",
    "     GGG      PPP      GGG      PPP      GGG     ",
    "                                                  ",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 8, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 16, row: 10, type: 'jellyfish' },
    { col: 24, row: 14, type: 'crab', patrol: 2 },
    { col: 32, row: 6, type: 'jellyfish' },
    { col: 40, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 46, row: 12, type: 'jellyfish' },
  ],
  coins: [
    { col: 5, row: 4 }, { col: 7, row: 4 },
    { col: 12, row: 10 }, { col: 14, row: 10 },
    { col: 20, row: 6 }, { col: 22, row: 6 },
    { col: 28, row: 2 }, { col: 30, row: 2 },
    { col: 36, row: 10 }, { col: 38, row: 10 },
    { col: 44, row: 14 }, { col: 46, row: 14 },
  ],
  movingPlatforms: [
    { col: 14, row: 8, range: 4 },
    { col: 34, row: 4, range: 3 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 48
};

// ============================================================================
// LEVEL 7: SKY HIGH - Vertical Mastery (Athletic Type)
// Length: 45 tiles | Time: 240s (very tight)
// Teaching: Pure vertical platforming
// 2-Second Rule: Must climb constantly
// ============================================================================
const LEVEL_7: LevelData = {
  id: 7,
  name: "Sky High",
  subtitle: "Ascend to safety",
  type: 'athletic',
  background: '/bg_cave.png',
  timeLimit: 240,
  tiles: [
    "                                              ",
    "                                     GGGGGGG  ",
    "                                              ",
    "                              PPP             ",
    "                                              ",
    "                       GGG                    ",
    "                                              ",
    "                PPP          PPP              ",
    "                                              ",
    "          GGG                                 ",
    "                                              ",
    "     PPP       GGG                            ",
    "                                              ",
    "GGG                                           ",
    "GGGG       GGG       GGG                      ",
    "GGGG       GGG       GGG                      ",
  ],
  enemies: [
    { col: 12, row: 14, type: 'crab', patrol: 1 },
    { col: 18, row: 9, type: 'jellyfish' },
    { col: 28, row: 5, type: 'jellyfish' },
    { col: 36, row: 3, type: 'jellyfish' },
  ],
  coins: [
    { col: 5, row: 11 }, { col: 7, row: 11 },
    { col: 11, row: 9 }, { col: 13, row: 9 },
    { col: 19, row: 7 }, { col: 21, row: 7 },
    { col: 26, row: 5 }, { col: 28, row: 3 },
    { col: 33, row: 3 }, { col: 39, row: 1 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 43
};

// ============================================================================
// LEVEL 8: ENEMY HORDE - Combat Challenge (Ground Type)
// Length: 55 tiles | Time: 240s
// Teaching: Combat mastery
// 2-Second Rule: Enemies everywhere, no safe spots
// ============================================================================
const LEVEL_8: LevelData = {
  id: 8,
  name: "Enemy Horde",
  subtitle: "The final resistance",
  type: 'ground',
  background: '/bg_underwater.png',
  timeLimit: 240,
  tiles: [
    "                                                       ",
    "                                                       ",
    "          PPP                                          ",
    "                                                       ",
    "               PPP                                     ",
    "                                                       ",
    "     GGG               GGG                             ",
    "                                                       ",
    "          GGG               PPP                        ",
    "                                                       ",
    "GGGG               GGG               GGGGGGGGGGGGGGGGGG",
    "                                                       ",
    "     GGG      GGG      GGG      GGG      GGGGGGGGGGGGGG",
    "                                                       ",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 8, row: 14, type: 'crab', patrol: 1 },
    { col: 14, row: 12, type: 'crab', patrol: 1 },
    { col: 20, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 26, row: 10, type: 'jellyfish' },
    { col: 32, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 38, row: 12, type: 'crab', patrol: 1 },
    { col: 44, row: 14, type: 'crab', patrol: 1 },
    { col: 50, row: 10, type: 'jellyfish' },
  ],
  coins: [
    { col: 5, row: 5 }, { col: 7, row: 5 },
    { col: 12, row: 9 }, { col: 14, row: 9 },
    { col: 20, row: 11 }, { col: 22, row: 11 },
    { col: 28, row: 7 }, { col: 30, row: 7 },
    { col: 36, row: 13 }, { col: 38, row: 13 },
    { col: 46, row: 14 }, { col: 48, row: 14 },
  ],
  movingPlatforms: [
    { col: 16, row: 6, range: 5 },
    { col: 36, row: 8, range: 4 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 53
};

// ============================================================================
// LEVEL 9: NARROW PATH - Precision Hell (Athletic Type)
// Length: 50 tiles | Time: 220s (extreme)
// Teaching: Perfect platforming
// 2-Second Rule: One mistake = death
// ============================================================================
const LEVEL_9: LevelData = {
  id: 9,
  name: "Narrow Path",
  subtitle: "Precision is key",
  type: 'athletic',
  background: '/bg_cave.png',
  timeLimit: 220,
  tiles: [
    "                                                  ",
    "                                                  ",
    "                                                  ",
    "                                           GGG   ",
    "                                                  ",
    "                                    PPP           ",
    "                                                  ",
    "                             PPP                  ",
    "                                                  ",
    "                      PPP                         ",
    "                                                  ",
    "               PPP                  PPP           ",
    "                                                  ",
    "GGG      PPP        PPP       PPP        GGGGGGGG",
    "GGG                                      GGGGGGGG",
    "GGG                                      GGGGGGGG",
  ],
  enemies: [
    { col: 10, row: 13, type: 'jellyfish' },
    { col: 20, row: 11, type: 'jellyfish' },
    { col: 30, row: 7, type: 'jellyfish' },
    { col: 38, row: 5, type: 'jellyfish' },
    { col: 44, row: 13, type: 'pufferfish', patrol: 1 },
  ],
  coins: [
    { col: 9, row: 13 }, { col: 10, row: 13 },
    { col: 15, row: 11 }, { col: 16, row: 11 },
    { col: 23, row: 9 }, { col: 24, row: 9 },
    { col: 30, row: 7 }, { col: 31, row: 7 },
    { col: 37, row: 5 }, { col: 42, row: 3 },
  ],
  startCol: 1, startRow: 12,
  goalCol: 48
};

// ============================================================================
// LEVEL 10: FINAL CHALLENGE - The Ultimate Test (Castle Type)
// Length: 60 tiles | Time: 200s (hardest timer)
// Teaching: Everything you've learned
// 2-Second Rule: Maximum density, zero forgiveness
// ============================================================================
const LEVEL_10: LevelData = {
  id: 10,
  name: "Final Challenge",
  subtitle: "Escape to the surface!",
  type: 'castle',
  background: '/bg_volcano.png',
  timeLimit: 200,
  tiles: [
    "                                                            ",
    "                                                            ",
    "                    PPP                                     ",
    "                                                            ",
    "     PPP              GGG        PPP                        ",
    "                                                            ",
    "          GGG              GGG        GGG                   ",
    "                                                            ",
    "               PPP              PPP        PPP              ",
    "                                                            ",
    "GGGG               GGG              GGG        GGGGGGGGGGGGG",
    "                                                            ",
    "     GGG      PPP      GGG      PPP      GGG      GGGGGGGGGG",
    "                                                            ",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  enemies: [
    { col: 10, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 18, row: 10, type: 'jellyfish' },
    { col: 26, row: 14, type: 'crab', patrol: 1 },
    { col: 34, row: 6, type: 'jellyfish' },
    { col: 42, row: 14, type: 'pufferfish', patrol: 1 },
    { col: 50, row: 10, type: 'jellyfish' },
    { col: 56, row: 14, type: 'crab', patrol: 1 },
  ],
  coins: [
    { col: 6, row: 4 }, { col: 8, row: 4 },
    { col: 14, row: 8 }, { col: 16, row: 8 },
    { col: 22, row: 2 }, { col: 24, row: 2 },
    { col: 30, row: 6 }, { col: 32, row: 6 },
    { col: 38, row: 10 }, { col: 40, row: 10 },
    { col: 48, row: 12 }, { col: 50, row: 12 },
  ],
  startCol: 2, startRow: 12,
  goalCol: 58
};

// Export all levels
export const LEVELS: LevelData[] = [
  LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5,
  LEVEL_6, LEVEL_7, LEVEL_8, LEVEL_9, LEVEL_10
];
