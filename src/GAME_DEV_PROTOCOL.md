# SUPER AJOLOTES - GAME DEVELOPMENT PROTOCOL

## 1. SCALE & VISUAL HIERARCHY STANDARDS

### Screen-to-Character Ratio
```
Target: Character = 1/10 to 1/12 of screen height
Canvas: 1280x720
Player Size: 64px (was 44px) = 1/11 of screen ✓
Enemy Size: 56px (was 40px) = 1/13 of screen ✓
Coin Size: 40px (was 32px) = 1/18 of screen ✓
Tile Size: 64px (was 48px) = 1:1 with player
```

### Visual Priority Scale
| Element | Size | Priority |
|---------|------|----------|
| Player | 64px | CRITICAL - Must be instantly visible |
| Enemies | 56px | HIGH - Threat identification |
| Coins | 40px | MEDIUM - Collectible, can be smaller |
| Tiles | 64px | BACKGROUND - Frame the action |

---

## 2. PHYSICS ENGINE ARCHITECTURE

### Movement Formula (DO NOT DEVIATE)
```typescript
// 1. INPUT → ACCELERATION
if (left) vx -= acceleration;
if (right) vx += acceleration;

// 2. FRICTION (when no input)
vx *= friction;  // friction = 0.82 to 0.88

// 3. CLAMP MAX SPEED
vx = clamp(vx, -maxSpeed, maxSpeed);

// 4. APPLY VELOCITY
x += vx;

// 5. COLLISION RESOLUTION (X then Y, NEVER together)
resolveXCollision();
y += vy;
resolveYCollision();
```

### Jump Physics
```typescript
// COYOTE TIME: Allow jump N frames after leaving ground
if (!onGround) coyoteTimer--;
if (jumpPressed && (onGround || coyoteTimer > 0)) {
    vy = jumpForce;
}

// VARIABLE JUMP: Release early for short hop
if (!jumpHeld && vy < jumpForce * 0.4) {
    vy *= 0.8;
}

// JUMP BUFFER: Store jump input before landing
if (jumpPressed) jumpBuffer = 6;
if (jumpBuffer > 0) jumpBuffer--;
if (jumpBuffer > 0 && onGround) executeJump();
```

---

## 3. COLLISION DETECTION PROTOCOL

### The Golden Rule: SEPARATE AXIS RESOLUTION
```
❌ WRONG: Move diagonally, then check collision
✅ RIGHT: Move X, resolve X, then move Y, resolve Y
```

### AABB Collision Function
```typescript
function checkAABB(a: Box, b: Box): boolean {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
}
```

### Tile Collision Strategy
```typescript
// Check CORNERS only (4 points, not entire grid)
const corners = [
    {x: player.x, y: player.y},                    // Top-left
    {x: player.x + player.w - 1, y: player.y},     // Top-right
    {x: player.x, y: player.y + player.h - 1},     // Bottom-left
    {x: player.x + player.w - 1, y: player.h - 1}  // Bottom-right
];

// For each corner, check if tile is solid
```

---

## 4. LEVEL DESIGN WORKFLOW

### Step 1: Define Level Dimensions
```typescript
const LEVEL_WIDTH_TILES = 50;  // ~3200px at 64px tiles
const LEVEL_HEIGHT_TILES = 12; // ~768px
```

### Step 2: Create Tile Grid
```
G = Ground (solid, collide all sides)
P = Platform (solid top only, can jump through)
  = Empty (air)
```

### Step 3: Place Elements Using Grid Coordinates
```typescript
// ALWAYS use helper functions
const colX = (col: number) => col * TILE_SIZE;
const rowY = (row: number) => row * TILE_SIZE;

// Place enemy on ground at column 10
enemies: [{ x: colX(10), y: rowY(10) - ENEMY_SIZE }]

// Place coin above platform at column 5, row 6
coins: [{ x: colX(5), y: rowY(6) - COIN_SIZE }]
```

### Step 4: Test Jump Distances
```
Max Jump Distance = (jumpForce²) / (2 * gravity) * 1.5
For jumpForce = -15, gravity = 0.7:
Max gap = ~240px = 3.75 tiles

Design Rule: Never exceed 3-tile gaps for normal jumps
```

---

## 5. ENEMY AI PATTERNS

### Patrol Enemy (Crab, Pufferfish)
```typescript
enemy: {
    x, y,                    // Current position
    startX,                  // Spawn position
    patrol: 150,            // Max distance from spawn
    direction: 1,           // 1 = right, -1 = left
    speed: 1.5
}

// Update
x += speed * direction;
if (abs(x - startX) > patrol) direction *= -1;

// Edge detection (don't walk off cliffs)
if (tileAt(x + width/2, y + height + 5) === EMPTY) {
    direction *= -1;
}
```

### Flying Enemy (Jellyfish)
```typescript
enemy: {
    x, y,
    startY,                 // Base height
    floatOffset: 0
}

// Update
floatOffset = sin(time * 0.003) * 30;  // 30px up/down
y = startY + floatOffset;
```

---

## 6. CAMERA SYSTEM

### Smooth Follow with Lookahead
```typescript
// Target position (look ahead in facing direction)
targetX = player.x - canvasWidth/3 + (facingRight ? 100 : -50);
targetY = player.y - canvasHeight/2;

// Smooth interpolation (lerp)
camera.x += (targetX - camera.x) * 0.08;
camera.y += (targetY - camera.y) * 0.05;

// Clamp to level bounds
camera.x = clamp(camera.x, 0, levelWidth - canvasWidth);
camera.y = clamp(camera.y, -100, 100);
```

---

## 7. GAME FEEL ("JUICE")

### Required Effects
| Event | Effect | Intensity |
|-------|--------|-----------|
| Jump | Dust particles | 4-5 particles |
| Land | Dust particles | 4-5 particles |
| Collect Coin | Sparkle particles + bob | 8-10 particles |
| Kill Enemy | Explosion particles | 12-15 particles |
| Take Damage | Screen shake + red flash | 10px shake |
| Level Complete | Celebration particles | 20+ particles |

### Screen Shake Formula
```typescript
shakeAmount *= 0.9;  // Decay
if (shakeAmount < 0.5) shakeAmount = 0;

renderX = camera.x + (random() - 0.5) * shakeAmount;
renderY = camera.y + (random() - 0.5) * shakeAmount;
```

---

## 8. DEBUGGING CHECKLIST

### Before Release, Verify:
- [ ] Character is visible against background
- [ ] Can always see player (camera never loses them)
- [ ] Jump height feels consistent
- [ ] Can jump through platforms from below
- [ ] Enemies don't walk off edges
- [ ] Coins are collectible (hitbox large enough)
- [ ] Goal is reachable
- [ ] No soft-locks (can always progress)
- [ ] Frame rate stays at 60fps

---

## 9. COMMON ERRORS & PREVENTION

| Error | Cause | Prevention |
|-------|-------|------------|
| Character gets stuck | X and Y moved together | Separate axis resolution |
| Can jump infinitely | No ground check | Set onGround = false after jump |
| Enemies walk off edges | No edge detection | Check tile below before moving |
| Coins too small | Wrong size constant | Use visual hierarchy table |
| Level too cramped | Poor tile layout | Use grid, plan paths first |
| Jump feels floaty | Wrong gravity value | Test: jump up should take ~0.5s |
| Slide on slopes | No friction | Apply friction every frame |

---

## 10. PERFORMANCE RULES

### Do:
- Use requestAnimationFrame
- Separate physics (60fps) from render
- Pool particles (reuse objects)
- Use integer math for collision
- Cache images

### Don't:
- Create new objects in update loop
- Check collision against every tile
- Use setState in animation loop
- Draw off-screen elements
