// Super Mole Rat – Lab Escape
// A p5.js platformer

// ──────────────────────────────────
//  Constants
// ──────────────────────────────────
const SCROLL_THRESHOLD = 440; // px from left – player locks here, world scrolls beyond
const FLOOR_Y          = 520; // y of the floor surface (canvas height - 80)
const LEVEL_LENGTH     = 5500; // total worldOffset before the level end zone

// ──────────────────────────────────
//  Global State
// ──────────────────────────────────
let player;
let bees      = [];
let ants      = [];
let spiders   = [];
let platforms = [];
let keyItem;
let torchItem;
let flashItem;
let exitDoor;

let gravity      = 0.5;
let jumpStrength = -15;
let scrollSpeed  = 0;
let bgOffsetX    = 0;
let worldOffset  = 0;

let lives     = 3;
let beesEaten = 0;
let startTime;
let finalTime = 0;
let level     = 1;

let hasKey         = false;
let doorShakeTimer = 0;  // frames of locked-door shake feedback
let gameState      = 'playing'; // 'playing' | 'paused' | 'title' | 'gameOver' | 'levelComplete'
let pauseStartTime = 0;
let particles      = [];

let score     = 0;       // cumulative score for the current run
let highScore = 0;       // all-time best score (persisted via localStorage)
let timeLeft  = 120;     // seconds remaining in current level (countdown)
let timeBonus = 0;       // time bonus awarded at last level complete (for display)
let newHighScoreSet = false; // true only when this run beat the stored best
const LEVEL_TIME_LIMIT = 120; // seconds per level

// ── Dynamic level length (= LEVEL_LENGTH for the default level; overridden in test mode) ─
let currentLevelLength = LEVEL_LENGTH;
let currentExitDoorX   = 6600; // matches default exit door x in hardcoded layout

// ── Best levels (loaded from levels/best_levels.js via index.html) ────────
let useBestLevels = false;

// ── Surprise Box ───────────────────────────────────────────────────────────
let surpriseBox         = null;   // SurpriseBox entity (null once collected)
let activeEffect        = '';     // currently active effect key (for HUD / announce)
let effectAnnounceTimer = 0;      // frames remaining for big announcement banner
let lastSurpriseEffect  = '';     // prevents same effect two levels in a row

// Persistent effects — survive level-advance (keepLevel=true); reset on full restart
let mirrorControls    = false;    // effect 1: LEFT ↔ RIGHT swapped, this level only
let bonusHeartsEarned = 0;        // effect 3: permanent extra hearts counter
let babyMoleRat       = false;    // effect 17: companion; absorbs next hit

// Level-scoped effects — reset every resetGame() call
let upsideDown      = false;      // effect 2: canvas flipped this level
let scoreMultiplier = 1;          // effect 7: 2× score this level
let bigPlayerActive = false;      // effect 8b: double size this level
let superJumpActive = false;      // effect 9: higher jumps this level
let darknessActive  = false;      // effect 10: darkness overlay active
let darknessTimer   = 0;          // effect 10: frames remaining (600 = 10 s)
let beeSwarmWaveTimer = 0;        // effect 8 (beeswarm): frames until second wave of 6 bees

// ── Test mode globals ─────────────────────────────────────────────────────
let testMode     = false;  // true while a test session is active
let testLevelId  = -1;     // 0-99 index of the level currently being played
let testOutcome  = '';     // 'complete' | 'gameover' | 'skipped'
let testQueue    = [];     // shuffled 0-99 play order for this session
let testQueueIdx = 0;      // current position in testQueue
let testLevels   = [];     // 100 generated level definitions (loaded on startup)

// ──────────────────────────────────
//  Setup
// ──────────────────────────────────
function setup() {
  createCanvas(800, 600);
  initLevels();         // generate / load the 100 test levels before anything else
  if (typeof BEST_LEVELS !== 'undefined' && BEST_LEVELS.length >= 2) {
    useBestLevels = true;
  }
  resetGame();
  highScore = int(localStorage.getItem('smr_highscore') || '0');
  gameState = 'title'; // show title screen on first launch
}

// ──────────────────────────────────
//  Reset / Level Init
// ──────────────────────────────────
function resetGame(keepLevel, levelDef) {
  if (!keepLevel) level = 1;

  player      = new Player();
  bees        = [];
  ants        = [];
  spiders     = [];
  platforms   = [];
  scrollSpeed = 0;
  bgOffsetX   = 0;
  worldOffset = 0;
  lives       = min(3 + bonusHeartsEarned, 6); // bonus hearts carry between levels
  beesEaten   = 0;
  startTime   = millis();
  finalTime   = 0;
  hasKey      = false;
  torchItem   = null;
  flashItem   = null;
  surpriseBox = null;
  doorShakeTimer    = 0;
  gameState         = 'playing';
  particles         = [];
  timeLeft          = LEVEL_TIME_LIMIT;
  timeBonus         = 0;
  // ── Level-scoped effect resets (always) ────────────────────────────────
  upsideDown        = false;
  scoreMultiplier   = 1;
  bigPlayerActive   = false;
  superJumpActive   = false;
  darknessActive    = false;
  darknessTimer     = 0;
  beeSwarmWaveTimer = 0;
  mirrorControls    = false;
  effectAnnounceTimer = 0;
  activeEffect      = '';
  // ── Persistent effect resets (full restart only) ───────────────────────
  if (!keepLevel) {
    bonusHeartsEarned  = 0;
    babyMoleRat        = false;
    lastSurpriseEffect = '';
  }
  if (!keepLevel) score = 0;
  if (!keepLevel) newHighScoreSet = false;

  // ── Normal mode: auto-select levelDef from BEST_LEVELS when available ────
  if (!levelDef && !testMode && useBestLevels) {
    if (level === 1 && BEST_LEVELS.length >= 1) {
      levelDef = BEST_LEVELS[0];
    } else if (level === 2 && BEST_LEVELS.length >= 2) {
      levelDef = BEST_LEVELS[1];
    } else if (BEST_LEVELS.length >= 3) {
      // Pick randomly from remaining best levels (avoiding index 0 and 1)
      const candidates = BEST_LEVELS.slice(2);
      levelDef = candidates[floor(random(candidates.length))];
    }
  }

  // ── Generated level: build from definition and return early ──────────────
  if (levelDef) {
    currentLevelLength = levelDef.levelLength;
    currentExitDoorX   = levelDef.exitDoorX;

    // Build platform objects
    let spiderPlatforms = [];
    for (let pd of levelDef.platforms) {
      let opts = pd.moving ? {
        moving: true, moveDir: pd.moveDir, moveRange: pd.moveRange,
        moveSpeed: pd.moveSpeed, movePhase: pd.movePhase
      } : undefined;
      let p = new Platform(pd.worldX, pd.y, pd.w, pd.h, opts);
      platforms.push(p);
      if (pd.hasSpider) spiderPlatforms.push(p);
    }

    // Key / torch / flash on eligible static platforms (same shuffle logic as default)
    let eligible = platforms.filter(p =>
      !p.moving && (FLOOR_Y - p.y) <= 222 &&
      p.x > 500 && p.x < levelDef.exitDoorX - 400
    );
    for (let i = eligible.length - 1; i > 0; i--) {
      let j = floor(random(i + 1));
      let tmp = eligible[i]; eligible[i] = eligible[j]; eligible[j] = tmp;
    }
    // Fallback positions in case there are fewer than 3 eligible platforms
    let kp = eligible[0] || platforms[Math.floor(platforms.length * 0.25)] || platforms[0];
    let tp = eligible[1] || platforms[Math.floor(platforms.length * 0.50)] || platforms[0];
    let fp = eligible[2] || platforms[Math.floor(platforms.length * 0.75)] || platforms[0];
    let bp = eligible[3] || eligible[eligible.length - 1]                  || platforms[0];
    keyItem     = new KeyItem  (kp.x + kp.w / 2, kp.y - 26);
    torchItem   = new PowerItem(tp.x + tp.w / 2, tp.y - 26, 'torch');
    flashItem   = new PowerItem(fp.x + fp.w / 2, fp.y - 26, 'flash');
    surpriseBox = new SurpriseBox(bp.x + bp.w / 2, bp.y - 26);

    // Exit door at level-specific position
    exitDoor = new ExitDoor(levelDef.exitDoorX, FLOOR_Y);

    // Spiders — stagger starting phases across platforms
    let spH2       = 12;
    let initStates = ['pause', 'climbing', 'falling', 'pause', 'falling'];
    for (let i = 0; i < spiderPlatforms.length; i++) {
      let sp        = spiderPlatforms[i];
      let maxThread = max(FLOOR_Y - sp.y - sp.h - spH2, 20);
      let st        = initStates[i % initStates.length];
      let il        = st === 'climbing' ? maxThread :
                      st === 'falling'  ? floor(maxThread * 0.3) : 0;
      spiders.push(new Spider(sp, maxThread, st, il));
    }
    return;  // skip the hardcoded layout below
  }

  currentLevelLength = LEVEL_LENGTH;
  currentExitDoorX   = 6600;

  // ── Regular platform layout ────────────────────────────────────────────
  // Absolute screen-x positions; they slide left as the player scrolls.
  // Heights above FLOOR_Y (520) in parentheses.
  platforms.push(new Platform( 260, FLOOR_Y - 170, 130, 15)); //  0 – start       (170 px)
  platforms.push(new Platform( 520, FLOOR_Y - 330, 120, 15)); //  1 – high        (330 px)
  platforms.push(new Platform( 950, FLOOR_Y - 220, 140, 15)); //  2               (220 px) *eligible key
  platforms.push(new Platform(1280, FLOOR_Y - 150, 110, 15)); //  3 – low         (150 px) *eligible key
  platforms.push(new Platform(1650, FLOOR_Y - 310, 150, 15)); //  4 – high        (310 px)
  platforms.push(new Platform(2050, FLOOR_Y - 190, 120, 15)); //  5               (190 px) *eligible key
  platforms.push(new Platform(2400, FLOOR_Y - 280, 130, 15)); //  6 – high        (280 px)
  platforms.push(new Platform(2780, FLOOR_Y - 160, 110, 15)); //  7 – low         (160 px) *eligible key
  platforms.push(new Platform(3120, FLOOR_Y - 330, 140, 15)); //  8 – high        (330 px)
  platforms.push(new Platform(3520, FLOOR_Y - 200, 120, 15)); //  9               (200 px) *eligible key
  platforms.push(new Platform(3900, FLOOR_Y - 270, 130, 15)); // 10 – high        (270 px)
  platforms.push(new Platform(4350, FLOOR_Y - 160, 150, 15)); // 11 – near exit   (160 px)

  // ── Moving platforms (mid-section, indices 12–14) ─────────────────────────
  // Blue-steel tint distinguishes them visually.
  platforms.push(new Platform(2225, FLOOR_Y - 200, 100, 15, { moving: true, moveDir: 'vertical',   moveRange: 45, moveSpeed: 0.022, movePhase: 0.0 }));  // 12
  platforms.push(new Platform(2620, FLOOR_Y - 175, 100, 15, { moving: true, moveDir: 'vertical',   moveRange: 50, moveSpeed: 0.028, movePhase: 1.6 }));  // 13
  platforms.push(new Platform(3310, FLOOR_Y - 185, 100, 15, { moving: true, moveDir: 'horizontal', moveRange: 65, moveSpeed: 0.018, movePhase: 0.8 }));  // 14

  // ── Spider platforms (last section, x 4900-5800) ───────────────────────
  let spPlA = new Platform(4900, FLOOR_Y - 260, 110, 15);
  let spPlB = new Platform(5300, FLOOR_Y - 200, 110, 15);
  let spPlC = new Platform(5800, FLOOR_Y - 280, 110, 15);
  platforms.push(spPlA); // 15
  platforms.push(spPlB); // 16
  platforms.push(spPlC); // 17

  // ── Key: randomly on any platform directly jumpable from the floor ────
  // Reachable directly = height above floor ≤ 222 px (max jump = 225 px).
  // Also skip the starting platform (x ≤ 500) and the exit zone (x > 4500).
  let eligible = platforms.filter(p => !p.moving && (FLOOR_Y - p.y) <= 222 &&
                                        p.x > 500 && p.x < 4500);
  // Shuffle eligible list (Fisher-Yates) and assign first 3 distinct platforms
  // to: key, torch item, flash item.
  for (let i = eligible.length - 1; i > 0; i--) {
    let j   = floor(random(i + 1));
    let tmp = eligible[i]; eligible[i] = eligible[j]; eligible[j] = tmp;
  }
  let kp  = eligible[0];
  let tp  = eligible[1];
  let fp  = eligible[2];
  let bp  = eligible[3] || eligible[eligible.length - 1];
  keyItem     = new KeyItem  (kp.x + kp.w / 2, kp.y - 26);
  torchItem   = new PowerItem(tp.x + tp.w / 2, tp.y - 26, 'torch');
  flashItem   = new PowerItem(fp.x + fp.w / 2, fp.y - 26, 'flash');
  surpriseBox = new SurpriseBox(bp.x + bp.w / 2, bp.y - 26);

  // ── Exit door – far right, on the floor ────────────────────────────────
  exitDoor = new ExitDoor(6600, FLOOR_Y);

  // ── Spiders – one per spider platform, staggered starting phases ───────
  //   maxThread calculated so spider bottom (centre + h/2 = centre + 12)
  //   exactly reaches FLOOR_Y when fully descended.
  let spH2  = 12; // half of spider body height (h = 24)
  let thrdA = FLOOR_Y - spPlA.y - spPlA.h - spH2; // 233 px
  let thrdB = FLOOR_Y - spPlB.y - spPlB.h - spH2; // 173 px
  let thrdC = FLOOR_Y - spPlC.y - spPlC.h - spH2; // 253 px
  //   Spider(platform, maxThreadLen, initState, initThreadLen)
  spiders.push(new Spider(spPlA, thrdA, 'pause',    0));      // at top, drops right away
  spiders.push(new Spider(spPlB, thrdB, 'climbing', thrdB));  // starts at floor, climbing up
  spiders.push(new Spider(spPlC, thrdC, 'falling',  80));     // mid-drop
}

// ══════════════════════════════════
//  LEVEL GENERATOR
// ══════════════════════════════════

// ── Deterministic seeded RNG (Mulberry32) ─────────────────────────────────
// Returns a closure that yields floats in [0, 1) deterministically.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _rr(rng, lo, hi)  { return lo + rng() * (hi - lo); }             // float in [lo,hi)
function _ri(rng, lo, hi)  { return Math.floor(lo + rng() * (hi - lo)); }  // int  in [lo,hi)

// ── Generate a single level (id 0-99) ─────────────────────────────────────
// All randomness comes from `rng` so the 100 layouts are fully reproducible.
function generateLevel(id, rng) {
  const t = id / 99;  // 0 → 1 difficulty gradient

  const levelLength  = Math.floor(6500 + t * 7500);  // 6500 → 14000 px
  const exitDoorX    = levelLength + 1100;
  const numSpiders   = Math.floor(1  + t * 4);        // 1 → 5
  const numMoving    = Math.floor(t  * 4);             // 0 → 4
  const MAX_JUMP     = 225;   // physics max jump height
  const MIN_GAP      = 120;   // minimum horizontal spacing

  const plats = [];
  let prevRightX   = 250;     // right edge of the last placed object
  let prevSurfaceY = FLOOR_Y; // y-surface the player currently stands on
  let nextRest     = _ri(rng, 3, 6);

  // ── Sequential platform placement (loop until level is covered) ────────
  let platCount = 0;
  while (prevRightX < exitDoorX - 600 && platCount < 50) {
    platCount++;

    // ── Ground rest segment (every 3-5 platforms) ──────────────────────────
    if (platCount > 1 && platCount >= nextRest && rng() < 0.5) {
      prevRightX   += _ri(rng, 300, 500);
      prevSurfaceY  = FLOOR_Y;
      nextRest      = platCount + _ri(rng, 3, 6);
      continue;
    }

    let placed = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      // ── Section-based height arc ──────────────────────────────────────────
      const levelProgress = (prevRightX - 250) / levelLength;
      let targetY;
      if (levelProgress < 0.25) {
        targetY = FLOOR_Y - _ri(rng, 100, 150);         // intro: low
      } else if (levelProgress < 0.60) {
        targetY = FLOOR_Y - _ri(rng, 220, 300);         // climb: high
      } else if (levelProgress < 0.85) {
        targetY = FLOOR_Y - _ri(rng, 140, 220);         // descent: mid
      } else {
        targetY = FLOOR_Y - _ri(rng, 100, 160);         // final: moderate
      }

      // Height bias: nudge toward target, clamped to safety bounds
      const distToTarget = prevSurfaceY - targetY; // positive = below target, need to go up
      let heightLo, heightHi;
      if (distToTarget > 30) {
        heightLo = 20;  heightHi = 160;     // well below target → climb
      } else if (distToTarget < -30) {
        heightLo = -160; heightHi = -20;    // well above target → descend
      } else {
        const shift = Math.round(-distToTarget * 0.5);
        heightLo = -100 + shift;
        heightHi = 100 + shift;
      }

      const heightChange = _ri(rng, heightLo, heightHi);
      const newY = prevSurfaceY - heightChange;

      if (newY < 80 || newY > FLOOR_Y - 100) continue; // out of valid band

      // Physics reachability: max horizontal gap for a jump gaining `heightGain` px
      const heightGain = prevSurfaceY - newY;
      const maxGap     = Math.floor(20 * Math.sqrt(Math.max(0, MAX_JUMP - Math.max(0, heightGain))));
      const maxAllowed = Math.min(maxGap - 10, 280);
      if (maxAllowed < MIN_GAP) continue;

      const gapX = _ri(rng, MIN_GAP, maxAllowed);

      // ── Platform width archetype ──────────────────────────────────────────
      const widthRoll = rng();
      let w;
      if (widthRoll < 0.25) {
        w = _ri(rng, 150, 200);  // wide rest
      } else if (widthRoll < 0.55) {
        w = _ri(rng, 100, 140);  // standard
      } else if (widthRoll < 0.80) {
        w = _ri(rng, 80, 100);   // narrow precision
      } else {
        w = _ri(rng, 90, 170);   // mixed
      }

      const x = prevRightX + gapX;

      if (x > exitDoorX - 300) continue; // too close to exit

      plats.push({ worldX: x, y: newY, w, h: 15,
                   moving: false, moveDir: 'vertical',
                   moveRange: 0, moveSpeed: 0, movePhase: 0,
                   hasSpider: false });
      prevRightX   = x + w;
      prevSurfaceY = newY;
      placed = true;
      break;
    }

    if (!placed) {
      // Fallback: a low platform directly reachable from the floor
      const fallY = FLOOR_Y - _ri(rng, 100, 200);
      const fallW = _ri(rng, 100, 150);
      const fallX = prevRightX + 200;
      plats.push({ worldX: fallX, y: fallY, w: fallW, h: 15,
                   moving: false, moveDir: 'vertical',
                   moveRange: 0, moveSpeed: 0, movePhase: 0,
                   hasSpider: false });
      prevRightX   = fallX + fallW;
      prevSurfaceY = FLOOR_Y; // reset — player back on floor for next jump
    }
  }

  // ── Assign moving platforms (at largest gaps) ────────────────────────────
  if (numMoving > 0 && plats.length > numMoving + 1) {
    const gaps = [];
    for (let i = 1; i < plats.length; i++) {
      const gap = plats[i].worldX - (plats[i - 1].worldX + plats[i - 1].w);
      gaps.push({ idx: i, gap });
    }
    gaps.sort((a, b) => b.gap - a.gap);
    const count = Math.min(numMoving, gaps.length);
    for (let i = 0; i < count; i++) {
      const p = plats[gaps[i].idx];
      p.moving = true;
      if (rng() < 0.5) {
        p.moveDir   = 'vertical';
        const maxR  = Math.max(20, Math.min(40, p.y - 80, FLOOR_Y - p.y - p.h - 30));
        p.moveRange = _ri(rng, 20, maxR + 1);
      } else {
        p.moveDir   = 'horizontal';
        p.moveRange = _ri(rng, 40, 80);
      }
      p.moveSpeed = _rr(rng, 0.015, 0.035);
      p.movePhase = rng() * Math.PI * 2;
    }
  }

  // ── Assign spider platforms (from 20% onwards, spaced ≥ 300 px) ──────────
  const spiderCands = plats
    .map((p, i) => i)
    .filter(i => (FLOOR_Y - plats[i].y - plats[i].h) >= 50 &&
                 (plats[i].worldX > levelLength * 0.2));
  for (let i = spiderCands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spiderCands[i], spiderCands[j]] = [spiderCands[j], spiderCands[i]];
  }
  let spPlaced = 0;
  const spXs   = [];
  for (let i = 0; i < spiderCands.length && spPlaced < numSpiders; i++) {
    const p = plats[spiderCands[i]];
    if (!spXs.some(sx => Math.abs(sx - p.worldX) < 300)) {
      p.hasSpider = true;
      spXs.push(p.worldX);
      spPlaced++;
    }
  }

  // ── Ensure platforms near the exit door ─────────────────────────────────
  let lastPlatX = plats.length > 0
    ? plats[plats.length - 1].worldX + plats[plats.length - 1].w
    : prevRightX;
  let gapToExit = exitDoorX - lastPlatX;
  if (gapToExit > 600) {
    let stairX = lastPlatX + 180;
    let stairEnd = exitDoorX - 400;
    let stairCount = Math.min(4, Math.floor((stairEnd - stairX) / 280));
    for (let s = 0; s < stairCount; s++) {
      let sx = stairX + s * _ri(rng, 220, 300);
      if (sx > stairEnd) break;
      let sy = FLOOR_Y - _ri(rng, 120, 220);
      plats.push({ worldX: sx, y: sy, w: _ri(rng, 90, 140), h: 15,
                   moving: false, moveDir: 'vertical',
                   moveRange: 0, moveSpeed: 0, movePhase: 0,
                   hasSpider: s === stairCount - 1 });
    }
  }

  return { id, levelLength, exitDoorX, platforms: plats };
}

// ── Produce all 100 level definitions using a fixed seed ──────────────────
function generateAllLevels() {
  const rng    = mulberry32(42); // fixed seed → identical layouts every generation
  const levels = [];
  for (let id = 0; id < 100; id++) levels.push(generateLevel(id, rng));
  return levels;
}

// ── Load from localStorage or generate on first visit ─────────────────────
const LEVEL_DATA_VERSION = 6; // bump to force regeneration after algorithm changes

function initLevels() {
  let stored = localStorage.getItem('smr_generated_levels');
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.version === LEVEL_DATA_VERSION &&
          Array.isArray(data.levels) && data.levels.length === 100) {
        testLevels = data.levels;
        return;
      }
    } catch (e) { /* fall through to regeneration */ }
  }
  testLevels = generateAllLevels();
  localStorage.setItem('smr_generated_levels',
    JSON.stringify({ version: LEVEL_DATA_VERSION, levels: testLevels }));
}

// ── Rating storage helpers ────────────────────────────────────────────────
function loadRatings() {
  try { return JSON.parse(localStorage.getItem('smr_level_ratings') || '{}'); }
  catch (e) { return {}; }
}

// ratingKey: 'good' | 'medium' | 'bad' | 'skipped'
function saveRating(levelId, ratingKey) {
  const ratings = loadRatings();
  if (!ratings[levelId]) ratings[levelId] = { good: 0, medium: 0, bad: 0, skipped: 0 };
  ratings[levelId][ratingKey]++;
  localStorage.setItem('smr_level_ratings', JSON.stringify(ratings));
}

// ── Export all data (levels + ratings) as a downloadable JSON file ────────
function exportCompleteData() {
  const ratings = loadRatings();
  const levels  = (testLevels.length > 0) ? testLevels : generateAllLevels();
  const scores  = {};

  Object.entries(ratings).forEach(([id, r]) => {
    const total = r.good + r.medium + r.bad;
    if (total > 0) {
      scores[id] = +(r.good * 2 + r.medium - r.bad) / total;
      scores[id] = +scores[id].toFixed(4);
    } else {
      scores[id] = 0;
    }
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    version: LEVEL_DATA_VERSION,
    numLevels: levels.length,
    levels: levels,
    ratings: ratings,
    scores: scores
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'smr_complete.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════
//  TEST MODE SESSION FUNCTIONS
// ══════════════════════════════════

function startTestMode() {
  // Build a freshly-shuffled play queue of all 100 levels (p5 random is fine here)
  testQueue = [];
  for (let i = 0; i < 100; i++) testQueue.push(i);
  for (let i = 99; i > 0; i--) {
    const j = floor(random(i + 1));
    [testQueue[i], testQueue[j]] = [testQueue[j], testQueue[i]];
  }
  testQueueIdx = 0;
  testMode     = true;
  _loadNextTestLevel();
}

function _loadNextTestLevel() {
  if (testQueueIdx >= testQueue.length) testQueueIdx = 0; // wrap around
  testLevelId = testQueue[testQueueIdx++];
  resetGame(false, testLevels[testLevelId]);
  startTime = millis(); // accurate countdown start after resetGame overhead
  gameState = 'playing';
}

function rateCurrentLevel(ratingKey) {
  saveRating(testLevelId, ratingKey);
  _loadNextTestLevel();
}

function skipCurrentLevel() {
  saveRating(testLevelId, 'skipped');
  testOutcome = 'skipped';
  gameState   = 'testRating';
}

function restartCurrentLevel() {
  resetGame(false, testLevels[testLevelId]);
  startTime = millis();
  gameState  = 'playing';
}

function stopTesting() {
  testMode    = false;
  testLevelId = -1;
  gameState   = 'title';
}

// ──────────────────────────────────
//  Main Loop
// ──────────────────────────────────
function draw() {
  if (gameState === 'title') {
    drawTitleScreen();
    return;
  }

  if (gameState === 'playing') updateGame();

  // ── Upside-down transform wraps background + game world only ─────────────
  if (upsideDown) { push(); translate(0, height); scale(1, -1); }
  drawBackground();
  renderGame();
  if (upsideDown) pop();

  // ── Darkness overlay (after game, before HUD so HUD remains readable) ────
  if (darknessActive && gameState === 'playing') drawDarknessOverlay();

  drawUI();

  // ── Effect announcement banner ────────────────────────────────────────────
  if (effectAnnounceTimer > 0 && gameState === 'playing') {
    drawEffectAnnouncement();
    effectAnnounceTimer--;
  }

  if (gameState === 'paused')        drawPauseScreen();
  if (gameState === 'gameOver')      drawGameOverScreen();
  if (gameState === 'levelComplete') drawLevelCompleteScreen();
  if (gameState === 'testRating')    drawTestRatingScreen();
}

// ──────────────────────────────────
//  Game Logic
// ──────────────────────────────────
function updateGame() {
  player.update();

  // Accumulate world travel distance (rightward only)
  if (scrollSpeed > 0) worldOffset += scrollSpeed;
  bgOffsetX -= scrollSpeed;

  // ── Platforms ───────────────────────────────────────────────────────────
  for (let p of platforms) p.update();
  // (pre-placed platforms are never culled – they may scroll off left, that's fine)

  // ── Bees ────────────────────────────────────────────────────────────────
  for (let i = bees.length - 1; i >= 0; i--) {
    bees[i].update();

    let hit = player.checkBeeCollision(bees[i]);
    if (hit !== null) {
      if (player.torchTimer > 0) {
        // Torch: burn bee — counts as eaten, fire particles
        spawnParticles(bees[i].x, bees[i].y, 'torch', 12);
        bees.splice(i, 1);
        beesEaten++;
        score += 100 * scoreMultiplier;
        continue;
      }
      if (hit === 'eat') {
        spawnParticles(bees[i].x, bees[i].y, 'bee', 10);
        bees.splice(i, 1);
        beesEaten++;
        score += 100 * scoreMultiplier;
        player.bounce();
        continue;
      }
      // hit === 'damage'
      bees.splice(i, 1);
      player.takeDamage();
      continue;
    }

    if (bees[i].x < -60) bees.splice(i, 1);
  }

  // ── Ants ─────────────────────────────────────────────────────────────────
  for (let i = ants.length - 1; i >= 0; i--) {
    ants[i].update();

    // Direct AABB contact check (used for both torch-kill and normal damage paths)
    let ax1 = ants[i].x - ants[i].w / 2, ax2 = ants[i].x + ants[i].w / 2;
    let ay1 = ants[i].y - ants[i].h / 2, ay2 = ants[i].y + ants[i].h / 2;
    let antContact = player.x + player.w / 2 > ax1 && player.x - player.w / 2 < ax2 &&
                     player.y + player.h / 2 > ay1 && player.y - player.h / 2 < ay2;

    if (antContact && player.torchTimer > 0) {
      // Torch: burn ant
      spawnParticles(ants[i].x, ants[i].y, 'torch', 12);
      ants.splice(i, 1);
      score += 50 * scoreMultiplier;
      continue;
    }

    let antHit = player.checkAntCollision(ants[i]);
    if (antHit === 'stomp') {
      // Big player stomps ant from above
      spawnParticles(ants[i].x, ants[i].y, 'bee', 8);
      ants.splice(i, 1);
      score += 50 * scoreMultiplier;
      player.bounce();
      continue;
    }

    if (antHit === 'damage') {
      player.takeDamage();
      ants.splice(i, 1);
      continue;
    }

    if (ants[i].x < -60) ants.splice(i, 1);
  }

  // ── Spawning (only while inside the level) ───────────────────────────────
  let spawnZone = worldOffset < currentExitDoorX - 800;
  let speedMul  = 1 + (level - 1) * 0.2; // +20% per level

  if (spawnZone) {
    if (random() < 0.008)              bees.push(new Bee(speedMul));
    if (random() < 0.004)              ants.push(new Ant(speedMul));
  }

  // ── Spiders ───────────────────────────────────────────────────────────────
  for (let s of spiders) {
    s.update();
    if (s.dead) continue;

    let spiderDist = dist(player.x, player.y, s.x, s.y);
    let spiderTouching = spiderDist < player.w / 2 + s.w / 2;

    if (spiderTouching && player.torchTimer > 0) {
      // Torch: burn spider permanently
      s.dead = true;
      spawnParticles(s.x, s.y, 'torch', 15);
      score += 200 * scoreMultiplier;
    } else if (player.checkSpiderCollision(s)) {
      player.takeDamage();
    }
  }

  // ── Key ─────────────────────────────────────────────────────────────────
  keyItem.update();
  if (!keyItem.collected) {
    let kd = dist(player.x, player.y, keyItem.x, keyItem.y);
    if (kd < player.w / 2 + 16) {
      keyItem.collected = true;
      hasKey = true;
      spawnParticles(keyItem.x, keyItem.y, 'key', 18);
    }
  }

  // ── Power items ───────────────────────────────────────────────────────────
  torchItem.update();
  if (!torchItem.collected) {
    let td = dist(player.x, player.y, torchItem.x, torchItem.y);
    if (td < player.w / 2 + 16) {
      torchItem.collected  = true;
      player.torchTimer    = 300; // 5 s at 60 fps
      // torchTimer implies full invincibility; sync invincibleTimer so existing
      // immunity checks in checkAntCollision / checkSpiderCollision also fire
      player.invincibleTimer = max(player.invincibleTimer, player.torchTimer);
      spawnParticles(torchItem.x, torchItem.y, 'torch', 22);
    }
  }

  flashItem.update();
  if (!flashItem.collected) {
    let fd = dist(player.x, player.y, flashItem.x, flashItem.y);
    if (fd < player.w / 2 + 16) {
      flashItem.collected = true;
      player.flashTimer   = 600; // 10 s at 60 fps
      spawnParticles(flashItem.x, flashItem.y, 'flash', 22);
    }
  }

  // ── Torch fire trail (continuous particles while active) ──────────────────
  if (player.torchTimer > 0 && frameCount % 3 === 0) {
    spawnParticles(player.x + random(-14, 14), player.y + random(-18, 8), 'torch', 1);
  }

  // ── Surprise Box ──────────────────────────────────────────────────────────
  if (surpriseBox) {
    surpriseBox.update();
    if (!surpriseBox.collected) {
      let sd = dist(player.x, player.y, surpriseBox.x, surpriseBox.y);
      if (sd < player.w / 2 + 18) {
        surpriseBox.collected = true;
        triggerSurpriseEffect();
      }
    }
  }

  // ── Darkness countdown ────────────────────────────────────────────────────
  if (darknessActive && darknessTimer > 0) {
    darknessTimer--;
    if (darknessTimer <= 0) {
      darknessActive = false;
    }
  }

  // ── Bee swarm wave 2 countdown ────────────────────────────────────────────
  if (beeSwarmWaveTimer > 0) {
    beeSwarmWaveTimer--;
    if (beeSwarmWaveTimer <= 0) {
      let speedMul = 1 + (level - 1) * 0.2;
      for (let i = 0; i < 6; i++) bees.push(new Bee(speedMul));
    }
  }

  // ── Exit Door ────────────────────────────────────────────────────────────
  exitDoor.update();
  // Overlap test: player box vs door box
  let doorLeft  = exitDoor.x - exitDoor.w / 2;
  let doorRight = exitDoor.x + exitDoor.w / 2;
  let doorTop   = exitDoor.y - exitDoor.h;
  let pLeft     = player.x - player.w / 2;
  let pRight    = player.x + player.w / 2;
  let pTop      = player.y - player.h / 2;
  let pBot      = player.y + player.h / 2;
  let touchDoor = pRight > doorLeft && pLeft < doorRight &&
                  pBot   > doorTop  && pTop  < exitDoor.y;

  if (touchDoor) {
    if (hasKey) {
      finalTime = int((millis() - startTime) / 1000);
      timeBonus = max(0, int(timeLeft * 10 * scoreMultiplier));
      score    += timeBonus;
      if (testMode) {
        testOutcome = 'complete';
        gameState   = 'testRating';
      } else {
        gameState = 'levelComplete';
      }
    } else {
      doorShakeTimer = 40; // visual feedback – door shakes for 40 frames
      player.x = doorLeft - player.w / 2 - 2; // push player back
    }
  }

  if (doorShakeTimer > 0) doorShakeTimer--;

  // ── Hard boundary: player cannot run past the exit door ───────────────────
  let doorRightEdge = exitDoor.x + exitDoor.w / 2;
  if (player.x > doorRightEdge) {
    player.x = doorRightEdge;
    scrollSpeed = 0;
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].isDead()) particles.splice(i, 1);
  }

  // ── Countdown timer ───────────────────────────────────────────────────────
  timeLeft = max(0, LEVEL_TIME_LIMIT - (millis() - startTime) / 1000);
  if (timeLeft <= 0 && gameState === 'playing') {
    finalTime = LEVEL_TIME_LIMIT;
    if (testMode) {
      testOutcome = 'gameover';
      gameState   = 'testRating';
    } else {
      gameState = 'gameOver';
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('smr_highscore', str(highScore));
        newHighScoreSet = true;
      }
    }
  }

  // ── Game over (lives) ─────────────────────────────────────────────────────
  if (lives <= 0) {
    lives     = 0;
    finalTime = int((millis() - startTime) / 1000);
    if (testMode) {
      testOutcome = 'gameover';
      gameState   = 'testRating';
    } else {
      gameState = 'gameOver';
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('smr_highscore', str(highScore));
        newHighScoreSet = true;
      }
    }
  }
}

// ──────────────────────────────────
//  Render
// ──────────────────────────────────
function renderGame() {
  // Platforms
  for (let p of platforms) p.show();

  // Key
  keyItem.show();

  // Power items
  torchItem.show();
  flashItem.show();
  if (surpriseBox) surpriseBox.show();

  // Exit door (behind player)
  exitDoor.show(hasKey, doorShakeTimer);

  // Ants
  for (let a of ants) a.show();

  // Spiders (thread drawn first, body on top)
  for (let s of spiders) s.show();

  // Bees
  for (let b of bees) b.show();

  // Player (on top of everything)
  player.show();

  // Baby mole rat companion (drawn just behind the player)
  if (babyMoleRat) {
    push();
    let babyOffX = player.facingRight ? -50 : 50;
    let babyAnim = sin(frameCount * 0.28) * 0.6;
    translate(player.x + babyOffX, player.y + 6);
    if (!player.facingRight) scale(-1, 1);
    scale(0.5, 0.5);
    drawMoleRat(babyAnim);
    pop();
  }

  // Particles (on top of player for visual pop)
  for (let p of particles) p.show();
}

// ──────────────────────────────────
//  Input
// ──────────────────────────────────
function keyPressed() {
  // ── Title screen: start game or enter test mode ────────────────────────
  if (gameState === 'title') {
    if (keyCode === ENTER || key === ' ') {
      startTime = millis();
      gameState = 'playing';
    }
    if (key === 't' || key === 'T') startTestMode();
    return;
  }

  // ── Test rating screen ─────────────────────────────────────────────────
  if (gameState === 'testRating') {
    if (key === '1' || key === 'g' || key === 'G') rateCurrentLevel('good');
    if (key === '2' || key === 'm' || key === 'M') rateCurrentLevel('medium');
    if (key === '3' || key === 'b' || key === 'B') rateCurrentLevel('bad');
    if (key === 'r' || key === 'R') restartCurrentLevel();
    if (key === 's' || key === 'S') stopTesting();
    if (key === 'e' || key === 'E') exportCompleteData();
    return;
  }

  // ── Game Over ────────────────────────────────────────────────────────────
  if (gameState === 'gameOver') {
    if (keyCode === ENTER || key === 'r' || key === 'R') resetGame(false);
    return;
  }

  // ── Level Complete ────────────────────────────────────────────────────────
  if (gameState === 'levelComplete') {
    if (keyCode === ENTER || key === 'r' || key === 'R') {
      level++;
      resetGame(true);
    }
    return;
  }

  // ── Pause toggle (playing ↔ paused) ───────────────────────────────────────
  if (key === 'p' || key === 'P') {
    if (gameState === 'playing') {
      pauseStartTime = millis();
      gameState = 'paused';
    } else if (gameState === 'paused') {
      startTime += millis() - pauseStartTime; // shift base so timer is continuous
      gameState = 'playing';
    }
    return;
  }

  // ── In-game controls (arrow keys + WASD) ──────────────────────────────────
  if (gameState !== 'playing') return;

  // Skip current test level with Q
  if (testMode && (key === 'q' || key === 'Q')) { skipCurrentLevel(); return; }

  if (key === ' ' || keyCode === UP_ARROW || key === 'w' || key === 'W') player.jump();
  // Mirror controls swap LEFT and RIGHT arrow keys
  let pressRight = keyCode === RIGHT_ARROW || key === 'd' || key === 'D';
  let pressLeft  = keyCode === LEFT_ARROW  || key === 'a' || key === 'A';
  if (mirrorControls) { let tmp = pressRight; pressRight = pressLeft; pressLeft = tmp; }
  if (pressRight) player.moveRight();
  if (pressLeft)  player.moveLeft();
}

function keyReleased() {
  if (gameState !== 'playing') return;
  let leftKey  = keyCode === LEFT_ARROW  || key === 'a' || key === 'A';
  let rightKey = keyCode === RIGHT_ARROW || key === 'd' || key === 'D';
  // Mirror: swap which physical key stops the player
  if (mirrorControls) { let tmp = leftKey; leftKey = rightKey; rightKey = tmp; }
  if (leftKey || rightKey) player.stop();
}

function mousePressed() {
  // ── Title screen buttons ──────────────────────────────────────────────────
  if (gameState === 'title') {
    // Play button lives near bottom of the panel (~y 496)
    if (mouseY > 474 && mouseY < 502) {
      startTime = millis();
      gameState = 'playing';
      return;
    }
    // Test Mode button lives just below (~y 530)
    if (mouseY > 512 && mouseY < 548) {
      startTestMode();
      return;
    }
  }

  // ── Test rating screen buttons ────────────────────────────────────────────
  if (gameState === 'testRating') {
    // Panel geometry (must match drawTestRatingScreen exactly)
    const pw = 500, ph = 380;
    const px = width / 2 - pw / 2;  // 150
    const py = height / 2 - ph / 2; // 110

    // ── Rating row: Good / Medium / Bad ──────────────────────────────────
    const btnW   = Math.floor((pw - 80 - 40) / 3); // ≈ 113
    const btnGap = 20;
    const btn1X  = px + 40;
    const btn2X  = btn1X + btnW + btnGap;
    const btn3X  = btn2X + btnW + btnGap;
    const rBtnY  = py + 148;
    const rBtnH  = 52;

    if (mouseY > rBtnY && mouseY < rBtnY + rBtnH) {
      if (mouseX > btn1X && mouseX < btn1X + btnW) { rateCurrentLevel('good');   return; }
      if (mouseX > btn2X && mouseX < btn2X + btnW) { rateCurrentLevel('medium'); return; }
      if (mouseX > btn3X && mouseX < btn3X + btnW) { rateCurrentLevel('bad');    return; }
    }

    // ── Action row: Restart / Stop ────────────────────────────────────────
    const abtnW  = Math.floor((pw - 80 - btnGap) / 2); // ≈ 190
    const abtn1X = px + 40;
    const abtn2X = abtn1X + abtnW + btnGap;
    const aBtnY  = py + 220;
    const aBtnH  = 48;

    if (mouseY > aBtnY && mouseY < aBtnY + aBtnH) {
      if (mouseX > abtn1X && mouseX < abtn1X + abtnW) { restartCurrentLevel(); return; }
      if (mouseX > abtn2X && mouseX < abtn2X + abtnW) { stopTesting();         return; }
    }

    // ── Export button below action row ────────────────────────────────────
    const eBtnY = aBtnY + aBtnH + 14;
    const eBtnW = Math.floor((pw - 80) * 0.7);
    const eBtnX = px + (pw - eBtnW) / 2;
    if (mouseY > eBtnY && mouseY < eBtnY + 36) {
      if (mouseX > eBtnX && mouseX < eBtnX + eBtnW) { exportCompleteData(); return; }
    }
  }
}

// ══════════════════════════════════
//  ENTITIES
// ══════════════════════════════════

// ──────────────────────────────────
//  Player
// ──────────────────────────────────
function Player() {
  this.x    = 100;
  this.y    = FLOOR_Y - 20;
  this.velX = 0;
  this.velY = 0;
  this.w    = 50;
  this.h    = 40;

  this.onGround        = false;
  this.invincibleTimer = 0;
  this.torchTimer      = 0;  // frames remaining for torch power (300 = 5 s)
  this.flashTimer      = 0;  // frames remaining for flash power (600 = 10 s)
  this.facingRight     = true;

  // ─── Physics ───────────────────────────────────────────────────────────
  this.update = function () {
    this.onGround = false;

    // ── Flash speed boost: force velX to ±10 while active and moving ──────
    if (this.flashTimer > 0 && this.velX !== 0) {
      this.velX = (this.velX > 0) ? 10 : -10;
    }

    // ── Horizontal movement with scroll threshold ─────────────────────────
    if (this.velX > 0) {
      if (this.x >= SCROLL_THRESHOLD) {
        // Lock player at threshold; scroll the world instead
        this.x   = SCROLL_THRESHOLD;
        scrollSpeed = this.velX;
      } else {
        // Player hasn't reached threshold yet – move normally
        this.x += this.velX;
        scrollSpeed = 0;
      }
    } else if (this.velX < 0) {
      // Moving left: player moves, world doesn't scroll
      this.x += this.velX;
      this.x  = max(this.x, this.w / 2);
      scrollSpeed = 0;
    } else {
      scrollSpeed = 0;
    }

    if (this.velX > 0) this.facingRight = true;
    if (this.velX < 0) this.facingRight = false;

    // ── Vertical ─────────────────────────────────────────────────────────
    this.velY += gravity;
    this.y    += this.velY;

    // Floor collision
    if (this.y + this.h / 2 >= FLOOR_Y) {
      this.y        = FLOOR_Y - this.h / 2;
      this.velY     = 0;
      this.onGround = true;
    }

    // Platform collision
    for (let pl of platforms) {
      let inX    = this.x + this.w / 2 > pl.x && this.x - this.w / 2 < pl.x + pl.w;
      let bottom = this.y + this.h / 2;
      if (inX && this.velY >= 0 && bottom >= pl.y && bottom <= pl.y + pl.h + 12) {
        this.y        = pl.y - this.h / 2;
        this.velY     = 0;
        this.onGround = true;
      }
    }

    if (this.invincibleTimer > 0) this.invincibleTimer--;
    if (this.torchTimer      > 0) this.torchTimer--;
    if (this.flashTimer      > 0) this.flashTimer--;
  };

  // ─── Rendering ─────────────────────────────────────────────────────────
  this.show = function () {
    // Post-damage flashing only when NOT in torch mode (fire effect replaces it)
    if (this.invincibleTimer > 0 && this.torchTimer === 0 && frameCount % 8 < 4) return;
    push();
    let anim     = (this.velX !== 0) ? sin(frameCount * 0.32) : 0;
    let bodyBob  = (this.onGround && this.velX !== 0) ? -abs(anim) * 2 : 0;
    translate(this.x, this.y + bodyBob);
    if (!this.facingRight) scale(-1, 1);

    // ── Flash speed-lines (drawn behind the mole rat) ────────────────────
    if (this.flashTimer > 0 && this.velX !== 0) {
      noStroke();
      let dir = (this.velX > 0) ? 1 : -1; // always draw behind player
      for (let i = 0; i < 4; i++) {
        let lx  = -dir * (24 + i * 11);
        let ly  = -8 + sin(frameCount * 0.5 + i * 1.3) * 10;
        let len = 18 - i * 3;
        let a   = 110 - i * 22;
        fill(160, 230, 255, a);
        rect(lx - len / 2, ly - 2, len, 4, 2);
      }
    }

    // Double-size scale applied around the sprite only
    if (bigPlayerActive) scale(2, 2);
    drawMoleRat(anim);

    // ── Torch fire aura (drawn on top of mole rat) ───────────────────────
    if (this.torchTimer > 0) {
      let flicker = sin(frameCount * 0.5) * 0.5 + 0.5; // 0–1
      noStroke();
      // Outer glow
      fill(255, 100 + int(flicker * 60), 0, int(55 + flicker * 35));
      ellipse(0, -4, 68 + flicker * 10, 58 + flicker * 8);
      // Inner glow
      fill(255, 180 + int(flicker * 40), 0, int(80 + flicker * 40));
      ellipse(0, -4, 44 + flicker * 8, 38 + flicker * 6);
      // Flame above head
      fill(255, 60 + int(flicker * 80), 0, int(140 + flicker * 60));
      ellipse(0, -24 - flicker * 4, 20 + flicker * 6, 26 + flicker * 8);
      fill(255, 220, 50, int(160 + flicker * 60));
      ellipse(0, -28 - flicker * 5, 10, 14 + flicker * 6);
    }

    pop();
  };

  // ─── Actions ───────────────────────────────────────────────────────────
  this.jump = function () {
    if (this.onGround) {
      this.velY     = superJumpActive ? jumpStrength * 1.7 : jumpStrength;
      this.onGround = false;
    }
  };

  this.bounce = function () {
    this.velY = jumpStrength * 0.55;
  };

  this.moveRight = function () { this.velX = testMode ? 10 : 5; };
  this.moveLeft  = function () { this.velX = testMode ? -10 : -5; };
  this.stop      = function () { this.velX =  0; };

  this.takeDamage = function () {
    if (this.invincibleTimer === 0 && this.torchTimer === 0) {
      if (babyMoleRat) {
        // Baby absorbs the hit — no life lost
        babyMoleRat = false;
        this.invincibleTimer = 90;
        spawnParticles(player.x - (player.facingRight ? 28 : -28) * 0.5,
                       player.y + 6, 'baby', 14);
      } else {
        lives--;
        this.invincibleTimer = 90;
      }
    }
  };

  // ─── Collision helpers ─────────────────────────────────────────────────
  this.checkBeeCollision = function (bee) {
    let d    = dist(this.x, this.y, bee.x, bee.y);
    let minD = this.w / 2 + bee.w / 2;
    if (d >= minD) return null;
    if (this.velY > 0 && this.y <= bee.y) return 'eat';
    return 'damage';
  };

  // Ants always damage; when Big Player is active, landing on top counts as a stomp
  this.checkAntCollision = function (ant) {
    if (this.invincibleTimer > 0) return null;
    let inX = this.x + this.w / 2 > ant.x - ant.w / 2 &&
              this.x - this.w / 2 < ant.x + ant.w / 2;
    let inY = this.y + this.h / 2 > ant.y - ant.h / 2 &&
              this.y - this.h / 2 < ant.y + ant.h / 2;
    if (!inX || !inY) return null;
    // Big Player only: falling onto the ant from above counts as a stomp kill
    if (bigPlayerActive && this.velY > 0 && this.y < ant.y) return 'stomp';
    return 'damage';
  };

  // Spiders always damage – circle-distance check against their hanging body
  this.checkSpiderCollision = function (sp) {
    if (this.invincibleTimer > 0) return false;
    let d = dist(this.x, this.y, sp.x, sp.y);
    return d < this.w / 2 + sp.w / 2;
  };
}

// ──────────────────────────────────
//  Bee
// ──────────────────────────────────
function Bee(speedMul) {
  speedMul = speedMul || 1;
  this.x           = width + 40;
  this.y           = random(60, FLOOR_Y - 100);
  this.speed       = random(1, 4) * speedMul;
  this.w           = 30;
  this.h           = 22;
  this.phaseOffset = random(TWO_PI);

  this.update = function () {
    let effective = scrollSpeed >= 0 ? this.speed + scrollSpeed : this.speed;
    this.x -= effective;
  };

  this.show = function () {
    push();
    translate(this.x, this.y);
    let wf = sin(frameCount * 0.35 + this.phaseOffset) * 4;
    drawBee(this.w, this.h, wf);
    pop();
  };
}

// ──────────────────────────────────
//  Ant  (floor enemy – always damages)
// ──────────────────────────────────
function Ant(speedMul) {
  speedMul  = speedMul || 1;
  this.w    = 32;
  this.h    = 20;
  this.x    = width + 40;
  this.y    = FLOOR_Y - this.h / 2; // sit on the floor
  this.speed = random(0.8, 2.2) * speedMul;
  this.phaseOffset = random(TWO_PI); // leg animation offset

  this.update = function () {
    let effective = scrollSpeed >= 0 ? this.speed + scrollSpeed : this.speed;
    this.x -= effective;
  };

  this.show = function () {
    push();
    translate(this.x, this.y);
    drawAnt(this.w, this.h, this.phaseOffset);
    pop();
  };
}

// ──────────────────────────────────
//  Platform
// ──────────────────────────────────
function Platform(x, y, w, h, opts) {
  this.x          = x;
  this.y          = y;
  this.w          = w;
  this.h          = h;
  this.baseY      = y;      // vertical oscillation anchor
  this.baseWorldX = x;      // world-space x anchor for horizontal platforms

  // Moving platform options (all optional)
  this.moving    = opts && opts.moving    || false;
  this.moveDir   = opts && opts.moveDir   || 'vertical';  // 'vertical' | 'horizontal'
  this.moveRange = opts && opts.moveRange || 50;          // amplitude in px
  this.moveSpeed = opts && opts.moveSpeed || 0.022;       // radians/frame
  this.movePhase = opts && opts.movePhase || 0;           // phase offset

  this.show = function () {
    push();
    noStroke();
    if (this.moving) {
      // Blue-steel tint to signal movement
      fill(58, 78, 118);
      rect(this.x, this.y, this.w, this.h, 3);
      fill(88, 114, 158);
      rect(this.x + 3, this.y + 2, this.w - 6, 4, 2);
      fill(138, 158, 198);
    } else {
      fill(72, 92, 72);
      rect(this.x, this.y, this.w, this.h, 3);
      fill(102, 128, 98);
      rect(this.x + 3, this.y + 2, this.w - 6, 4, 2);
      fill(142, 158, 136);
    }
    ellipse(this.x + 7,          this.y + this.h / 2, 6, 6);
    ellipse(this.x + this.w - 7, this.y + this.h / 2, 6, 6);
    pop();
  };

  this.update = function () {
    if (this.moving && this.moveDir === 'horizontal') {
      // World-space anchor: full x recomputed each frame so it never drifts
      this.x = (this.baseWorldX - worldOffset) +
               sin(frameCount * this.moveSpeed + this.movePhase) * this.moveRange;
    } else {
      this.x -= scrollSpeed;
    }

    if (this.moving && this.moveDir === 'vertical') {
      this.y = this.baseY + sin(frameCount * this.moveSpeed + this.movePhase) * this.moveRange;
    }
  };
}

// ──────────────────────────────────
//  Key Item
// ──────────────────────────────────
function KeyItem(x, y) {
  this.x         = x;
  this.y         = y;
  this.collected = false;

  this.update = function () {
    this.x -= scrollSpeed;
  };

  this.show = function () {
    if (this.collected) return;
    push();
    // Bobbing animation
    let bob = sin(frameCount * 0.07) * 5;
    translate(this.x, this.y + bob);
    // Golden glow halo
    noStroke();
    fill(255, 215, 0, 60 + sin(frameCount * 0.1) * 40);
    ellipse(0, 0, 44, 44);
    // Draw the key
    drawKeyShape();
    pop();
  };
}

// ──────────────────────────────────
//  Power Item  (torch | flash)
// ──────────────────────────────────
function PowerItem(x, y, type) {
  this.x         = x;
  this.y         = y;
  this.type      = type;   // 'torch' | 'flash'
  this.collected = false;

  this.update = function () {
    this.x -= scrollSpeed;
  };

  this.show = function () {
    if (this.collected) return;
    push();
    let bob = sin(frameCount * 0.07) * 5;
    translate(this.x, this.y + bob);
    noStroke();

    if (this.type === 'torch') {
      // Orange glow rings
      let pulse = sin(frameCount * 0.12) * 0.5 + 0.5;
      fill(255, 110, 0, int(30 + pulse * 30));
      ellipse(0, 4, 46 + pulse * 6, 46 + pulse * 6);
      fill(255, 160, 0, int(50 + pulse * 30));
      ellipse(0, 4, 30, 30);
      drawTorchItem();
    } else {
      // Yellow-cyan glow rings
      let pulse = sin(frameCount * 0.15) * 0.5 + 0.5;
      fill(200, 255, 100, int(30 + pulse * 30));
      ellipse(0, 0, 46 + pulse * 6, 46 + pulse * 6);
      fill(255, 240, 0, int(50 + pulse * 30));
      ellipse(0, 0, 30, 30);
      drawFlashItem();
    }
    pop();
  };
}

// ──────────────────────────────────
//  Exit Door
// ──────────────────────────────────
function ExitDoor(x, y) {
  this.x = x;
  this.y = y;      // bottom of door = floor surface
  this.w = 64;
  this.h = 116;

  this.update = function () {
    this.x -= scrollSpeed;
  };

  this.show = function (hasKey, shakeTimer) {
    push();
    let shakeX = (shakeTimer > 0) ? sin(frameCount * 0.8) * 5 : 0;
    translate(this.x + shakeX, this.y);
    drawExitDoor(this.w, this.h, hasKey, shakeTimer);
    pop();
  };
}

// ──────────────────────────────────
//  Surprise Box
// ──────────────────────────────────
function SurpriseBox(x, y) {
  this.x         = x;
  this.y         = y;
  this.collected = false;

  this.update = function () {
    this.x -= scrollSpeed;
  };

  this.show = function () {
    if (this.collected) return;
    push();
    let bob   = sin(frameCount * 0.07) * 5;
    let pulse = sin(frameCount * 0.1) * 0.5 + 0.5;
    translate(this.x, this.y + bob);

    // Purple glow halo
    noStroke();
    fill(180, 80, 255, int(35 + pulse * 45));
    ellipse(0, 0, 50 + pulse * 8, 50 + pulse * 8);

    // Box body — amber/gold lab crate
    fill(220, 160, 30);
    stroke(110, 60, 0);
    strokeWeight(2);
    rect(-15, -15, 30, 30, 5);

    // Cross straps
    stroke(160, 100, 10);
    strokeWeight(1.5);
    line(-15, 0, 15, 0);
    line(0, -15, 0, 15);

    // Question mark
    noStroke();
    fill(255, 240, 200);
    textSize(18);
    textAlign(CENTER, CENTER);
    text('?', 0, 1);
    pop();
  };
}

// ──────────────────────────────────
//  Trigger Surprise Effect
// ──────────────────────────────────
function triggerSurpriseEffect() {
  let effects = [
    'mirror', 'upsidedown', 'extraheart', 'score2x',
    'bigplayer', 'superjump', 'darkness', 'beeswarm',
    'teleport', 'babymolerat'
  ];
  let chosen  = effects[floor(random(effects.length))];
  // Prevent the same effect appearing two levels in a row
  if (chosen === lastSurpriseEffect) chosen = effects[floor(random(effects.length))];
  lastSurpriseEffect  = chosen;
  activeEffect        = chosen;
  effectAnnounceTimer = 240; // 4 s at 60 fps

  if (chosen === 'mirror') {
    mirrorControls = true;

  } else if (chosen === 'upsidedown') {
    upsideDown = true;

  } else if (chosen === 'extraheart') {
    bonusHeartsEarned = min(bonusHeartsEarned + 1, 3);
    lives = min(lives + 1, 6);

  } else if (chosen === 'score2x') {
    scoreMultiplier = 2;

  } else if (chosen === 'bigplayer') {
    bigPlayerActive = true;
    // Double dimensions and shift centre so player lands correctly on floor
    player.y -= player.h / 2;   // compensate for extra half-height
    player.w  = 100;
    player.h  = 80;

  } else if (chosen === 'superjump') {
    superJumpActive = true;

  } else if (chosen === 'darkness') {
    darknessActive = true;
    darknessTimer  = 600; // 10 s

  } else if (chosen === 'beeswarm') {
    let speedMul = 1 + (level - 1) * 0.2;
    for (let i = 0; i < 6; i++) bees.push(new Bee(speedMul));
    beeSwarmWaveTimer = 240; // second wave of 6 bees in 4 seconds

  } else if (chosen === 'teleport') {
    // Auto-collect key so player is never stranded past it
    if (!hasKey) {
      hasKey             = true;
      keyItem.collected  = true;
      spawnParticles(keyItem.x, keyItem.y, 'key', 18);
    }
    // Forward teleport — cap so we never skip past 2 500 px before the door
    let maxDist = max(0, currentExitDoorX - worldOffset - 2500);
    let td      = min(random(1500, 3000), maxDist);
    if (td > 100) {
      worldOffset += td;
      // Shift all screen-space objects
      for (let p of platforms) {
        if (!p.moving || p.moveDir === 'vertical') p.x -= td;
      }
      for (let b of bees)      b.x -= td;
      for (let a of ants)      a.x -= td;
      for (let par of particles) par.x -= td;
       torchItem.x -= td;
       flashItem.x -= td;
       // keyItem already collected or shift it too
       if (!keyItem.collected) keyItem.x -= td;
       if (surpriseBox && !surpriseBox.collected) surpriseBox.x -= td;
       exitDoor.x -= td;
    }
    spawnParticles(player.x, player.y, 'flash', 30);

  } else if (chosen === 'babymolerat') {
    babyMoleRat = true;
  }

  spawnParticles(surpriseBox.x, surpriseBox.y, 'surprise', 22);
}

// ──────────────────────────────────
//  Spider  (hangs on thread, always damages)
// ──────────────────────────────────
function Spider(platform, maxThreadLen, initState, initThreadLen) {
  this.platform   = platform;
  this.maxThread  = maxThreadLen;
  this.threadLen  = initThreadLen;
  this.state      = initState;      // 'falling' | 'climbing' | 'pause'
  this.pauseTimer = 0;
  this.velY       = (initState === 'falling') ? 0.5 : 0;
  this.w          = 28;
  this.h          = 24;
  this.x          = 0;
  this.y          = 0;
  this.dead       = false;          // true once killed by torch

  this.update = function () {
    if (this.dead) return;
    // x always follows the platform centre (scrolls automatically)
    this.x = this.platform.x + this.platform.w / 2;

    // ── State machine ──────────────────────────────────────────────────
    if (this.state === 'pause') {
      this.pauseTimer--;
      if (this.pauseTimer <= 0) {
        this.state = 'falling';
        this.velY  = 0;           // start slow, accelerate
      }

    } else if (this.state === 'falling') {
      this.velY      += 0.35;               // accelerate downward
      this.velY       = min(this.velY, 5);  // cap fall speed
      this.threadLen += this.velY;
      if (this.threadLen >= this.maxThread) {
        this.threadLen = this.maxThread;
        this.velY      = 0;
        this.state     = 'climbing';
      }

    } else if (this.state === 'climbing') {
      this.threadLen -= 1.2;               // slow upward crawl
      if (this.threadLen <= 0) {
        this.threadLen  = 0;
        this.state      = 'pause';
        this.pauseTimer = 45;              // ~0.75 s pause at top
      }
    }

    // Body centre = platform bottom + thread length
    this.y = this.platform.y + this.platform.h + this.threadLen;
  };

  this.show = function () {
    if (this.dead) return;
    let threadTopY = this.platform.y + this.platform.h;
    let bodyTopY   = this.y - this.h / 2;

    // Silk thread
    if (bodyTopY > threadTopY) {
      stroke(195, 195, 210, 210);
      strokeWeight(1.4);
      line(this.x, threadTopY, this.x, bodyTopY);
      noStroke();
    }

    // Spider body
    push();
    translate(this.x, this.y);
    drawSpider(this.w, this.h);
    pop();
  };
}

// ══════════════════════════════════
//  DRAW HELPERS
// ══════════════════════════════════

// ──────────────────────────────────
//  Mole Rat sprite
// ──────────────────────────────────
function drawMoleRat(anim) {
  anim = anim || 0;
  let la = anim * 5; // leg alternation offset (px)
  noStroke();

  // Tail
  stroke(190, 148, 132);
  strokeWeight(2);
  noFill();
  beginShape();
  vertex(-22, 8);
  quadraticVertex(-40, 24, -26, 32);
  endShape();
  noStroke();

  // Body
  fill(225, 178, 158);
  ellipse(0, 6, 46, 30);

  // Wrinkles
  stroke(198, 152, 134);
  strokeWeight(0.9);
  noFill();
  arc(-2,  6, 26, 16, -0.85, 0.85);
  arc(-13, 7, 17, 12, -0.80, 0.80);
  noStroke();

  // Head
  fill(225, 178, 158);
  ellipse(20, -4, 30, 26);

  // Ear
  fill(208, 148, 140);
  ellipse(16, -16, 9, 11);

  // Eye
  fill(10, 6, 4);
  ellipse(25, -8, 7, 6);
  fill(255, 255, 255, 210);
  ellipse(27, -10, 2.5, 2.5);

  // Nose
  fill(182, 115, 105);
  ellipse(34, -2, 9, 7);
  fill(138, 72, 72);
  ellipse(32, -1.5, 3, 2.5);
  ellipse(36, -1.5, 3, 2.5);

  // Buck teeth
  noStroke();
  fill(255, 250, 210);
  rect(27, 3, 5, 9, 1);
  rect(33, 3, 5, 9, 1);

  // Legs (animated: front/rear alternate)
  fill(215, 168, 148);
  ellipse( 8, 20 + la, 14, 9);  // front leg
  ellipse(-10, 20 - la, 14, 9); // rear leg

  // Claws (follow their respective legs)
  stroke(152, 115, 105);
  strokeWeight(1.1);
  line( 4, 24 + la,  2, 29 + la); line( 8, 25 + la,  7, 30 + la); line(12, 24 + la, 13, 29 + la);
  line(-14, 24 - la, -16, 29 - la); line(-10, 25 - la, -10, 30 - la); line(-6, 24 - la, -4, 29 - la);
  noStroke();
}

// ──────────────────────────────────
//  Bee sprite
// ──────────────────────────────────
function drawBee(w, h, wingFlutter) {
  noStroke();

  // Wings (behind body)
  fill(200, 222, 255, 160);
  ellipse(-8, -14 + wingFlutter, 20, 11);
  ellipse( 8, -14 + wingFlutter, 20, 11);

  // Clipped striped body
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.ellipse(0, 0, w / 2, h / 2, 0, 0, TWO_PI);
  drawingContext.clip();

  fill(255, 196, 0);
  noStroke();
  rect(-w / 2, -h / 2, w, h);

  fill(22, 22, 22);
  rect(-8, -h / 2, 5, h);
  rect( 2, -h / 2, 5, h);
  rect( 9, -h / 2, 4, h);

  drawingContext.restore();

  // Eye
  fill(20);
  noStroke();
  ellipse(-10, -4, 5, 5);

  // Stinger
  fill(138, 88, 0);
  triangle(w / 2 - 1, -3, w / 2 - 1, 3, w / 2 + 9, 0);

  // Antennae
  stroke(20);
  strokeWeight(1);
  noFill();
  line(-4, -h / 2 + 1, -8, -h / 2 - 9);
  line( 4, -h / 2 + 1,  8, -h / 2 - 9);
  noStroke();
  fill(20);
  ellipse(-8, -h / 2 - 10, 4, 4);
  ellipse( 8, -h / 2 - 10, 4, 4);
}

// ──────────────────────────────────
//  Ant sprite
// ──────────────────────────────────
function drawAnt(w, h, phaseOffset) {
  let legAnim = sin(frameCount * 0.25 + phaseOffset);

  noStroke();
  fill(28, 14, 5);

  // ── Body segments ──────────────────────────────────────────────────────
  // Abdomen (largest, rear)
  ellipse(-w * 0.30, h * 0.05, w * 0.46, h * 0.80);
  // Waist (narrow connector)
  fill(20, 10, 3);
  ellipse( w * 0.02, 0, w * 0.14, h * 0.28);
  // Thorax
  fill(32, 16, 6);
  ellipse( w * 0.20, -h * 0.05, w * 0.34, h * 0.60);
  // Head
  fill(28, 14, 5);
  ellipse( w * 0.44, -h * 0.12, w * 0.30, h * 0.52);

  // ── Eyes ───────────────────────────────────────────────────────────────
  fill(60, 200, 60);
  ellipse(w * 0.50,  -h * 0.22, 4, 4);

  // ── Antennae ───────────────────────────────────────────────────────────
  stroke(28, 14, 5);
  strokeWeight(1.2);
  // Left antenna (upper)
  line(w * 0.38, -h * 0.38,
       w * 0.20 + legAnim * 4, -h * 0.85);
  // Right antenna (lower)
  line(w * 0.50, -h * 0.32,
       w * 0.60 + legAnim * 4, -h * 0.72);
  noStroke();
  fill(28, 14, 5);
  ellipse(w * 0.20 + legAnim * 4, -h * 0.85, 5, 5);
  ellipse(w * 0.60 + legAnim * 4, -h * 0.72, 5, 5);

  // ── Six legs (3 pairs) ─────────────────────────────────────────────────
  stroke(28, 14, 5);
  strokeWeight(1.4);
  let la = legAnim * 6;

  // Front pair (near thorax)
  line(w * 0.28, -h * 0.05,  w * 0.46,  h * 0.40 - la);
  line(w * 0.28, -h * 0.05, -w * 0.05,  h * 0.42 + la);

  // Mid pair
  line(w * 0.12,  h * 0.02,  w * 0.30,  h * 0.50 + la);
  line(w * 0.12,  h * 0.02, -w * 0.16,  h * 0.50 - la);

  // Rear pair (near abdomen)
  line(-w * 0.15, h * 0.05,  w * 0.08,  h * 0.52 - la);
  line(-w * 0.15, h * 0.05, -w * 0.38,  h * 0.52 + la);

  noStroke();
}

// ──────────────────────────────────
//  Spider sprite  (origin = body centre)
// ──────────────────────────────────
function drawSpider(w, h) {
  let hw = w / 2;
  let hh = h / 2;

  // ── 8 legs drawn behind the body ─────────────────────────────────────
  stroke(35, 12, 45);
  strokeWeight(1.5);
  noFill();

  // Each entry: [shoulder x/y, elbow x/y, tip x/y] – LEFT side only;
  // right side is mirrored automatically.
  let legsL = [
    [ -hw * 0.5, -hh * 0.30,  -hw * 1.35, -hh * 0.65,  -hw * 1.85,  hh * 0.10 ],
    [ -hw * 0.5,  hh * 0.00,  -hw * 1.45, -hh * 0.10,  -hw * 1.95,  hh * 0.50 ],
    [ -hw * 0.4,  hh * 0.20,  -hw * 1.30,  hh * 0.42,  -hw * 1.72,  hh * 0.92 ],
    [ -hw * 0.3,  hh * 0.40,  -hw * 1.00,  hh * 0.92,  -hw * 1.20,  hh * 1.42 ],
  ];
  for (let [sx, sy, mx, my, ex, ey] of legsL) {
    line(sx, sy, mx, my);
    line(mx, my, ex, ey);
    // Mirror for right side
    line(-sx, sy, -mx, my);
    line(-mx, my, -ex, ey);
  }
  noStroke();

  // ── Abdomen (rear, larger) ────────────────────────────────────────────
  fill(32, 12, 42);
  ellipse(-hw * 0.08, hh * 0.36, hw * 1.12, hh * 1.18);

  // Red hourglass marking on abdomen
  fill(175, 18, 18, 210);
  triangle(
    -hw * 0.22,  hh * 0.04,
     hw * 0.22,  hh * 0.04,
     0,           hh * 0.38
  );
  triangle(
    -hw * 0.18,  hh * 0.72,
     hw * 0.18,  hh * 0.72,
     0,           hh * 0.38
  );

  // ── Waist (narrow connector) ──────────────────────────────────────────
  fill(20, 7, 28);
  ellipse(0, -hh * 0.04, hw * 0.28, hh * 0.30);

  // ── Cephalothorax (front, smaller oval) ──────────────────────────────
  fill(44, 16, 56);
  ellipse(hw * 0.06, -hh * 0.36, hw * 0.88, hh * 0.76);

  // ── Eyes – two glowing red dots ───────────────────────────────────────
  noStroke();
  fill(215, 10, 10);
  ellipse(-hw * 0.18, -hh * 0.56, 5.5, 5.5);
  ellipse( hw * 0.18, -hh * 0.56, 5.5, 5.5);
  // Bright inner highlight
  fill(255, 90, 90);
  ellipse(-hw * 0.18, -hh * 0.58, 2.5, 2.5);
  ellipse( hw * 0.18, -hh * 0.58, 2.5, 2.5);

  // ── Fangs ─────────────────────────────────────────────────────────────
  fill(62, 20, 72);
  ellipse(-hw * 0.13, -hh * 0.68, 4, 5);
  ellipse( hw * 0.13, -hh * 0.68, 4, 5);
}

// ──────────────────────────────────
//  Key shape  (drawn at origin)
// ──────────────────────────────────
function drawKeyShape() {
  push();
  rotate(-PI / 5);

  // Shaft
  noStroke();
  fill(218, 170, 0);
  rect(-4, -2, 28, 8, 3);

  // Teeth on shaft
  fill(205, 155, 0);
  rect(10,  6, 5, 7, 1);
  rect(18,  6, 5, 5, 1);

  // Key ring head
  fill(218, 170, 0);
  ellipse(-10, 2, 22, 22);

  // Hole in key ring
  fill(150, 105, 0);
  ellipse(-10, 2, 10, 10);

  // Shine
  fill(255, 240, 120, 180);
  ellipse(-14, -2, 5, 4);

  pop();
}

// ──────────────────────────────────
//  Exit Door  (origin = bottom-centre)
// ──────────────────────────────────
function drawExitDoor(w, h, hasKey, shakeTimer) {
  let hw = w / 2;

  // ── Frame / surround ──────────────────────────────────────────────────
  noStroke();
  fill(55, 70, 55);
  rect(-hw - 6, -h - 8, w + 12, h + 8, 5, 5, 0, 0);

  // ── Door leaf ─────────────────────────────────────────────────────────
  if (!hasKey) {
    fill(78, 90, 78);
  } else {
    // Subtle green tint when unlocked
    fill(70, 105, 70);
  }
  rect(-hw, -h, w, h, 3, 3, 0, 0);

  // Panel lines on door
  stroke(55, 72, 55);
  strokeWeight(1);
  line(-hw + 6, -h + 8, hw - 6, -h + 8);
  line(-hw + 6, -h + 8, -hw + 6, -16);
  line( hw - 6, -h + 8,  hw - 6, -16);
  noStroke();

  // ── Porthole window ───────────────────────────────────────────────────
  let windowY = -h * 0.68;
  fill(hasKey ? 130 : 90, hasKey ? 180 : 130, hasKey ? 130 : 90);
  ellipse(0, windowY, 28, 28);
  stroke(55, 70, 55);
  strokeWeight(2);
  noFill();
  ellipse(0, windowY, 28, 28);
  // Cross-bar on window
  line(-14, windowY, 14, windowY);
  line(0, windowY - 14, 0, windowY + 14);
  noStroke();

  // ── Lock or open indicator ────────────────────────────────────────────
  let lockY = -h * 0.32;

  if (!hasKey) {
    // Padlock body
    fill(shakeTimer > 0 ? color(220, 80, 60) : color(48, 48, 48));
    rect(-9, lockY, 18, 14, 3);
    // Padlock shackle
    noFill();
    stroke(shakeTimer > 0 ? color(220, 80, 60) : color(48, 48, 48));
    strokeWeight(2.5);
    arc(0, lockY, 12, 14, PI, 0);
    noStroke();
    // Keyhole
    fill(22, 22, 22);
    ellipse(0, lockY + 5, 5, 5);
    rect(-1.5, lockY + 7, 3, 5, 1);
  } else {
    // Green "EXIT" badge
    fill(40, 160, 60);
    rect(-22, lockY - 8, 44, 20, 4);
    fill(220, 255, 220);
    noStroke();
    textSize(13);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    text('EXIT', 0, lockY + 2);
    textStyle(NORMAL);

    // Pulsing glow around door when player can open it
    let glow = (sin(frameCount * 0.12) + 1) * 0.5;
    fill(40, 200, 80, 60 + glow * 80);
    noStroke();
    rect(-hw - 14, -h - 14, w + 28, h + 14, 8, 8, 0, 0);
  }

  // ── EXIT sign above door ──────────────────────────────────────────────
  noStroke();
  fill(160, 40, 40);
  rect(-hw - 2, -h - 28, w + 4, 22, 3, 3, 0, 0);
  fill(255, 200, 200);
  textSize(12);
  textAlign(CENTER, CENTER);
  text('EXIT', 0, -h - 17);
}

// ──────────────────────────────────
//  Scrolling lab background
// ──────────────────────────────────
function drawBackground() {
  push();

  // Wall colour
  background(190, 206, 190);

  // Wall tiles
  const tw = 80, th = 50;
  stroke(168, 184, 166);
  strokeWeight(1);
  noFill();
  let ox = ((bgOffsetX % tw) + tw) % tw;
  for (let x = ox - tw; x < width + tw; x += tw) {
    for (let y = 18; y < FLOOR_Y; y += th) {
      rect(x, y, tw, th);
    }
  }
  noStroke();

  // Ceiling strip
  fill(142, 156, 140);
  rect(0, 0, width, 18);

  // Ceiling pipes
  const ps = 180;
  let ox2 = ((bgOffsetX % ps) + ps) % ps;
  for (let x = ox2 - ps; x < width + ps; x += ps) {
    fill(105, 120, 103);
    rect(x, 12, 38, 30, 0, 0, 4, 4);
    fill(125, 140, 122);
    rect(x - 5, 40, 48, 8, 3);
  }

  // Floor
  fill(155, 160, 152);
  rect(0, FLOOR_Y, width, height - FLOOR_Y);

  // Floor tile lines
  stroke(135, 140, 132);
  strokeWeight(1);
  let fx = ((bgOffsetX % 80) + 80) % 80;
  for (let x = fx - 80; x < width + 80; x += 80) {
    line(x, FLOOR_Y, x, height);
  }
  line(0, FLOOR_Y + 40, width, FLOOR_Y + 40);
  noStroke();

  pop();
}

// ──────────────────────────────────
//  Torch item  (origin = centre)
// ──────────────────────────────────
function drawTorchItem() {
  noStroke();
  // Handle
  fill(110, 65, 20);
  rect(-4, 2, 8, 18, 2);
  // Binding wrap
  fill(80, 40, 10);
  rect(-5, 0, 10, 6, 1);
  // Flame base
  fill(255, 100, 0);
  ellipse(0, -6, 16, 20);
  // Flame mid
  fill(255, 190, 0);
  ellipse(0, -9, 10, 14);
  // Flame tip
  fill(255, 245, 200);
  ellipse(0, -14, 5, 8);
}

// ──────────────────────────────────
//  Flash item  (origin = centre)
// ──────────────────────────────────
function drawFlashItem() {
  noStroke();
  // Drop shadow
  fill(60, 60, 0, 80);
  push();
  translate(2, 2);
  beginShape();
  vertex(5, -14); vertex(-2, -1); vertex(3, -1);
  vertex(-5, 14); vertex(2,  1); vertex(-3,  1);
  endShape(CLOSE);
  pop();
  // Main bolt
  fill(255, 230, 0);
  beginShape();
  vertex(5, -14); vertex(-2, -1); vertex(3, -1);
  vertex(-5, 14); vertex(2,  1); vertex(-3,  1);
  endShape(CLOSE);
  // Inner highlight
  fill(255, 255, 200);
  beginShape();
  vertex(3, -10); vertex(0, -2); vertex(2, -2);
  vertex(-1,  6); vertex(1,  0); vertex(-1,  0);
  endShape(CLOSE);
}

// ──────────────────────────────────
//  HUD
// ──────────────────────────────────
function drawUI() {
  push();
  noStroke();

  // Header bar (two-row layout)
  fill(0, 0, 0, 118);
  rect(0, 0, width, 66);

  // ── Row 1: lives | bees | level | countdown ──────────────────────────────
  // Hearts
  for (let i = 0; i < lives; i++) {
    fill(218, 38, 58);
    heart(16 + i * 36, 20, 12);
  }

  // Bees eaten
  fill(255);
  textSize(16);
  textAlign(LEFT, TOP);
  text('Bees: ' + beesEaten, 136, 10);

  // Level indicator (or test mode badge)
  textAlign(CENTER, TOP);
  if (testMode) {
    fill(255, 215, 60);
    textSize(14);
    text('TEST  #' + (testLevelId + 1) + ' / 100', width / 2, 8);
    fill(210, 170, 50);
    textSize(11);
    text('[Q] Skip   [P] Pause', width / 2, 28);
  } else {
    fill(200, 240, 200);
    textSize(16);
    text('Level ' + level, width / 2, 10);
  }

  // Countdown timer (right)
  let tDisplay = ceil(timeLeft);
  textAlign(RIGHT, TOP);
  if (tDisplay <= 20 && frameCount % 20 < 10) {
    fill(255, 60, 60);
  } else if (tDisplay <= 20) {
    fill(255, 160, 60);
  } else {
    fill(255);
  }
  text(tDisplay + 's', width - 14, 10);

  // ── Row 2: score | key status | high score ───────────────────────────────
  textSize(16);

  // Score
  textAlign(LEFT, TOP);
  fill(255, 220, 70);
  text('Score: ' + score, 14, 38);

  // Key collected indicator (centre)
  if (hasKey) {
    textAlign(CENTER, TOP);
    fill(255, 210, 0);
    textSize(13);
    text('KEY', width / 2 - 14, 38);
    push();
    translate(width / 2 + 10, 51);
    scale(0.48);
    drawKeyShape();
    pop();
  }

  // High score
  textAlign(RIGHT, TOP);
  fill(170, 170, 255);
  text('Best: ' + highScore, width - 14, 38);

  // World progress bar
  noStroke();
  fill(255, 255, 255, 30);
  rect(0, height - 6, width, 6, 0);
  fill(80, 200, 100, 180);
  let prog = constrain(worldOffset / (currentLevelLength + 1200), 0, 1);
  rect(0, height - 6, width * prog, 6, 0);

  // ── Power-up countdown bars (under hearts row) ───────────────────────────
  let barW   = 88;  // max bar width
  let barH   = 7;
  let barY   = 55;  // just below the header bar
  let barX   = 10;  // left-aligned under hearts

  if (player.torchTimer > 0) {
    let t = player.torchTimer / 300; // 1 → 0
    // Background track
    fill(60, 20, 0, 180);
    rect(barX, barY, barW, barH, 3);
    // Filled portion
    fill(255, int(80 + t * 80), 0, 220);
    rect(barX, barY, barW * t, barH, 3);
    // Icon hint
    fill(255, 140, 0);
    textSize(11);
    textAlign(LEFT, TOP);
    text('FIRE', barX + barW + 5, barY - 1);
  }

  if (player.flashTimer > 0) {
    let f  = player.flashTimer / 600; // 1 → 0
    let bx = (player.torchTimer > 0) ? barX + barW + 46 : barX;
    // Background track
    fill(20, 40, 60, 180);
    rect(bx, barY, barW, barH, 3);
    // Filled portion
    fill(int(160 + f * 95), 240, 255, 220);
    rect(bx, barY, barW * f, barH, 3);
    // Icon hint
    fill(200, 255, 100);
    textSize(11);
    textAlign(LEFT, TOP);
    text('SPD', bx + barW + 5, barY - 1);
  }

  // ── Darkness countdown bar ────────────────────────────────────────────────
  if (darknessActive && darknessTimer > 0) {
    let dFrac  = darknessTimer / 600;
    let torchOff = player.torchTimer > 0 ? barW + 46 : 0;
    let flashOff = player.flashTimer > 0 ? barW + 46 : 0;
    let dbx = barX + torchOff + flashOff;
    fill(10, 10, 30, 180);
    rect(dbx, barY, barW, barH, 3);
    fill(80, 60, int(160 + dFrac * 60), 220);
    rect(dbx, barY, barW * dFrac, barH, 3);
    fill(180, 160, 255);
    textSize(11);
    textAlign(LEFT, TOP);
    text('DARK', dbx + barW + 5, barY - 1);
  }

  // ── Bee swarm wave 2 countdown bar ───────────────────────────────────────
  if (beeSwarmWaveTimer > 0) {
    let sFrac    = beeSwarmWaveTimer / 240;
    let torchOff = player.torchTimer > 0 ? barW + 46 : 0;
    let flashOff = player.flashTimer > 0 ? barW + 46 : 0;
    let darkOff  = (darknessActive && darknessTimer > 0) ? barW + 46 : 0;
    let sbx = barX + torchOff + flashOff + darkOff;
    fill(40, 30, 0, 180);
    rect(sbx, barY, barW, barH, 3);
    fill(255, int(150 + sFrac * 50), 0, 220);
    rect(sbx, barY, barW * sFrac, barH, 3);
    fill(255, 200, 40);
    textSize(11);
    textAlign(LEFT, TOP);
    text('SWARM', sbx + barW + 5, barY - 1);
  }

  // ── Active-effect badges (bottom-right corner of HUD bar) ─────────────────
  let badgeX = width - 14;
  let badgeY = 55;
  textSize(11);
  textAlign(RIGHT, TOP);
  noStroke();
  if (mirrorControls) {
    fill(255, 80, 80);
    text('\u21D4 MIRROR', badgeX, badgeY);
    badgeY += 14;
  }
  if (upsideDown) {
    fill(255, 140, 40);
    text('\u21D5 FLIPPED', badgeX, badgeY);
    badgeY += 14;
  }
  if (scoreMultiplier > 1) {
    fill(255, 230, 60);
    text('\u00D72 SCORE', badgeX, badgeY);
    badgeY += 14;
  }
  if (superJumpActive) {
    fill(100, 220, 255);
    text('\u2191\u2191 JUMP', badgeX, badgeY);
    badgeY += 14;
  }
  if (bigPlayerActive) {
    fill(120, 255, 140);
    text('\u25A0 BIG', badgeX, badgeY);
    badgeY += 14;
  }
  if (babyMoleRat) {
    fill(255, 180, 210);
    text('\u25BA BABY', badgeX, badgeY);
  }

  pop();
}

// ──────────────────────────────────
//  Darkness overlay
// ──────────────────────────────────
function drawDarknessOverlay() {
  // Use native Canvas 2D radial gradient for a "spotlight" around the player
  let ctx  = drawingContext;
  let px   = player.x;
  let py   = player.y;
  // Radius pulses slightly for a flickering-torch feel
  let rad  = 210 + sin(frameCount * 0.15) * 15;
  let grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.7)');
  grad.addColorStop(1,    'rgba(0,0,0,0.97)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ──────────────────────────────────
//  Effect announcement banner
// ──────────────────────────────────
function drawEffectAnnouncement() {
  // Map effect key → display text and colour
  const cfg = {
    mirror:      { title: 'CONTROLS REVERSED!',   sub: 'Left \u21D4 Right for this level only',             col: [255, 80,  80]  },
    upsidedown:  { title: 'WORLD FLIPPED!',        sub: 'Everything is upside down this level',       col: [255, 140, 40]  },
    extraheart:  { title: '+1 HEART FOREVER!',     sub: 'Bonus heart added \u2014 and it carries on!', col: [255, 80, 120]  },
    score2x:     { title: '2\u00D7 SCORE!',        sub: 'All points doubled for this level',          col: [255, 230, 60]  },
    bigplayer:   { title: 'YOU GREW!',             sub: 'Double size for the rest of this level',     col: [120, 255, 140] },
    superjump:   { title: 'SUPER JUMP!',           sub: 'Huge jump height for the rest of this level',col: [100, 220, 255] },
    darkness:    { title: 'LIGHTS OUT! (10s)',     sub: 'You can barely see \u2014 stay calm',        col: [160, 100, 255] },
    beeswarm:    { title: 'BEE SWARM!',            sub: '6 bees now, 6 more in 4 seconds \u2014 good luck', col: [255, 200, 40]  },
    teleport:    { title: 'TELEPORTED!',           sub: 'Key collected \u2014 you jumped forward',    col: [60,  200, 255] },
    babymolerat: { title: 'BABY COMPANION!',       sub: 'Little buddy will absorb your next hit',     col: [255, 180, 210] },
  };
  let c = cfg[activeEffect] || { title: '?', sub: '', col: [200, 200, 200] };

  // Fade in first 20 frames, fade out last 60 frames
  let alpha = 255;
  if      (effectAnnounceTimer > 220)       alpha = map(effectAnnounceTimer, 240, 220, 0, 255);
  else if (effectAnnounceTimer < 60)        alpha = map(effectAnnounceTimer, 60,  0,  255, 0);

  push();
  noStroke();
  // Dark backdrop
  fill(0, 0, 0, alpha * 0.65);
  rect(0, height / 2 - 52, width, 100, 8);

  // Coloured accent bar
  fill(c.col[0], c.col[1], c.col[2], alpha * 0.9);
  rect(0, height / 2 - 52, width, 5, 8);
  rect(0, height / 2 + 45, width, 5, 8);

  // Main title
  textAlign(CENTER, CENTER);
  fill(c.col[0], c.col[1], c.col[2], alpha);
  textSize(32);
  text(c.title, width / 2, height / 2 - 18);

  // Subtitle
  fill(220, 220, 220, alpha * 0.85);
  textSize(15);
  text(c.sub, width / 2, height / 2 + 18);
  pop();
}

// ──────────────────────────────────
//  Heart shape helper
// ──────────────────────────────────
function heart(x, y, size) {
  beginShape();
  vertex(x, y);
  bezierVertex(x - size / 2, y - size / 2, x - size, y + size / 3, x, y + size);
  bezierVertex(x + size, y + size / 3, x + size / 2, y - size / 2, x, y);
  endShape(CLOSE);
}

// ──────────────────────────────────
//  Game Over Screen
// ──────────────────────────────────
function drawGameOverScreen() {
  push();
  fill(0, 0, 0, 170);
  noStroke();
  rect(0, 0, width, height);

  fill(28, 42, 28, 238);
  rect(width / 2 - 225, height / 2 - 155, 450, 326, 14);
  stroke(75, 178, 75);
  strokeWeight(2);
  noFill();
  rect(width / 2 - 225, height / 2 - 155, 450, 326, 14);
  noStroke();

  fill(218, 50, 50);
  textSize(62);
  textAlign(CENTER, CENTER);
  text('GAME OVER', width / 2, height / 2 - 100);

  fill(222, 220, 198);
  textSize(22);
  text('Survived:      ' + finalTime + ' s', width / 2, height / 2 - 40);
  text('Bees eaten:  ' + beesEaten,          width / 2, height / 2 - 4);
  text('Level reached: ' + level,            width / 2, height / 2 + 32);

  // Score block
  fill(255, 220, 70);
  textSize(24);
  text('Score:  ' + score, width / 2, height / 2 + 76);

  if (newHighScoreSet) {
    fill(100, 220, 255);
    textSize(17);
    text('NEW BEST!  ' + highScore + ' pts', width / 2, height / 2 + 108);
  } else if (highScore > 0) {
    fill(170, 170, 255);
    textSize(17);
    text('Best:  ' + highScore + ' pts', width / 2, height / 2 + 108);
  }

  fill(118, 218, 118);
  textSize(18);
  text('Press  ENTER  or  R  to try again', width / 2, height / 2 + 146);
  pop();
}

// ──────────────────────────────────
//  Level Complete Screen
// ──────────────────────────────────
function drawLevelCompleteScreen() {
  push();
  fill(0, 0, 0, 160);
  noStroke();
  rect(0, 0, width, height);

  // Panel
  fill(20, 45, 25, 240);
  rect(width / 2 - 240, height / 2 - 160, 480, 346, 14);
  stroke(60, 210, 90);
  strokeWeight(2.5);
  noFill();
  rect(width / 2 - 240, height / 2 - 160, 480, 346, 14);
  noStroke();

  // Title
  fill(60, 220, 90);
  textSize(52);
  textAlign(CENTER, CENTER);
  text('LEVEL ' + level + ' COMPLETE!', width / 2, height / 2 - 100);

  // Stats
  fill(222, 255, 222);
  textSize(22);
  text('Time:         ' + finalTime + ' s', width / 2, height / 2 - 36);
  text('Bees eaten: ' + beesEaten,          width / 2, height / 2 + 0);

  // Time bonus
  fill(255, 215, 60);
  textSize(20);
  text('+ ' + timeBonus + ' time bonus', width / 2, height / 2 + 38);

  // Cumulative score
  fill(255, 230, 80);
  textSize(26);
  text('Score:  ' + score, width / 2, height / 2 + 76);

  // Next level teaser
  let nextSpeedPct = int((1 + level * 0.2) * 100);
  fill(255, 210, 100);
  textSize(17);
  text('Next level – enemy speed: ' + nextSpeedPct + '%', width / 2, height / 2 + 112);

  fill(118, 218, 118);
  textSize(18);
  text('Press  ENTER  or  R  to continue', width / 2, height / 2 + 150);
  pop();
}

// ══════════════════════════════════
//  PARTICLES
// ══════════════════════════════════

// ──────────────────────────────────
//  Particle
// ──────────────────────────────────
function Particle(x, y, type) {
  this.x       = x;
  this.y       = y;
  this.velX    = random(-4, 4);
  this.velY    = random(-6, -0.5);
  this.life    = 45;
  this.maxLife = 45;

  if (type === 'bee') {
    // Yellow-orange burst
    this.r = 255; this.g = int(random(185, 215)); this.b = 0;
    this.size = random(5, 10);
  } else if (type === 'damage') {
    // Red burst
    this.r = int(random(210, 255)); this.g = int(random(15, 55)); this.b = int(random(15, 55));
    this.size = random(5, 13);
  } else if (type === 'torch') {
    // Fire burst: orange-red, fast upward
    this.r    = int(random(220, 255));
    this.g    = int(random(60, 160));
    this.b    = 0;
    this.size = random(4, 10);
    this.velY = random(-5, -1);
    this.life    = int(random(20, 36));
    this.maxLife = this.life;
  } else if (type === 'flash') {
    // Electric burst: yellow-cyan
    this.r    = int(random(180, 255));
    this.g    = int(random(220, 255));
    this.b    = int(random(100, 200));
    this.size = random(3, 9);
    this.life    = 30;
    this.maxLife = 30;
  } else if (type === 'surprise') {
    // Purple/pink burst for surprise box pickup
    this.r    = int(random(180, 255));
    this.g    = int(random(40,  120));
    this.b    = int(random(200, 255));
    this.size = random(5, 13);
    this.velX = random(-5, 5);
    this.velY = random(-7, -1);
    this.life    = 50;
    this.maxLife = 50;
  } else if (type === 'baby') {
    // Soft pink puff when baby absorbs a hit
    this.r    = 255;
    this.g    = int(random(160, 210));
    this.b    = int(random(160, 220));
    this.size = random(4, 10);
    this.velX = random(-3, 3);
    this.velY = random(-5, -1);
    this.life    = 40;
    this.maxLife = 40;
  } else { // 'key'
    // Gold sparkle
    this.r = 255; this.g = int(random(195, 225)); this.b = int(random(0, 60));
    this.size = random(4, 9);
    this.life = 60; this.maxLife = 60;
  }

  this.update = function () {
    this.x    += this.velX - scrollSpeed; // follow world scroll
    this.y    += this.velY;
    this.velY += 0.18;  // gravity
    this.velX *= 0.96;  // horizontal drag
    this.life--;
  };

  this.show = function () {
    let a = map(this.life, 0, this.maxLife, 0, 220);
    let s = max(map(this.life, this.maxLife * 0.3, this.maxLife, 0, this.size), 0);
    fill(this.r, this.g, this.b, a);
    noStroke();
    ellipse(this.x, this.y, s, s);
  };

  this.isDead = function () { return this.life <= 0; };
}

function spawnParticles(x, y, type, count) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, type));
  }
}

// ══════════════════════════════════
//  OVERLAY SCREENS
// ══════════════════════════════════

// ──────────────────────────────────
//  Title Screen
// ──────────────────────────────────
function drawTitleScreen() {
  drawBackground(); // show static lab background behind the overlay

  // Dark overlay
  noStroke();
  fill(0, 0, 0, 155);
  rect(0, 0, width, height);

  // Main panel (taller to accommodate the Test Mode button)
  let px = width / 2 - 270, py = 58, pw = 540, ph = 510;
  fill(14, 32, 18, 248);
  rect(px, py, pw, ph, 18);
  stroke(55, 195, 75);
  strokeWeight(2.5);
  noFill();
  rect(px, py, pw, ph, 18);
  noStroke();

  // Game title
  fill(70, 228, 95);
  textSize(50);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  text('SUPER MOLE RAT', width / 2, py + 22);
  textStyle(NORMAL);

  // Subtitle
  fill(185, 245, 195);
  textSize(20);
  text('Lab Escape', width / 2, py + 82);

  // Mole rat sprite (large, gently animated)
  push();
  translate(width / 2, py + 188);
  scale(2.2);
  drawMoleRat(sin(frameCount * 0.06) * 0.8);
  pop();

  // Divider
  stroke(55, 195, 75, 100);
  strokeWeight(1);
  line(px + 40, py + 264, px + pw - 40, py + 264);
  noStroke();

  // Controls table
  textSize(15);
  let col1 = px + 88, col2 = px + 235, rowY = py + 282, rowH = 26;
  fill(130, 195, 145);
  textAlign(LEFT, TOP);
  text('Arrow Keys / WASD', col1, rowY);
  text('Space / W / Up', col1, rowY + rowH);
  text('P', col1, rowY + rowH * 2);
  fill(220, 255, 222);
  text('Move left / right', col2, rowY);
  text('Jump', col2, rowY + rowH);
  text('Pause', col2, rowY + rowH * 2);

  // Goal hint
  fill(185, 225, 190);
  textSize(13);
  textAlign(CENTER, TOP);
  text('Find the key \u2192 reach the EXIT door to escape!', width / 2, rowY + rowH * 3 + 10);

  // High score (only shown once a score has been set)
  if (highScore > 0) {
    fill(170, 170, 255, 210);
    textSize(15);
    text('Best run: ' + highScore + ' pts', width / 2, py + ph - 116);
  }

  // ── Play button (pulsing) ───────────────────────────────────────────────
  let pulse = (sin(frameCount * 0.07) + 1) * 0.5;
  fill(int(95 + pulse * 145), 225, int(85 + pulse * 80), int(195 + pulse * 60));
  textSize(19);
  text('Press  ENTER  or  SPACE  to start', width / 2, py + ph - 86);

  // ── Test Mode button ────────────────────────────────────────────────────
  // Draw a subtle button background so the player knows it is clickable
  let tbX = width / 2 - 130, tbY = py + ph - 56, tbW = 260, tbH = 36;
  fill(20, 55, 28, 200);
  rect(tbX, tbY, tbW, tbH, 8);
  stroke(55, 155, 75, 160);
  strokeWeight(1.5);
  noFill();
  rect(tbX, tbY, tbW, tbH, 8);
  noStroke();
  fill(100, 210, 120);
  textSize(16);
  text('[ T ]  Test Mode  –  Rate Levels', width / 2, tbY + tbH / 2);
}

// ──────────────────────────────────
//  Test Rating Screen
// ──────────────────────────────────
function drawTestRatingScreen() {
  push();
  // Dark backdrop over frozen game
  fill(0, 0, 0, 175);
  noStroke();
  rect(0, 0, width, height);

  // Panel
  const pw = 500, ph = 380;
  const px = width / 2 - pw / 2;   // 150
  const py = height / 2 - ph / 2;  // 110
  fill(14, 32, 18, 252);
  rect(px, py, pw, ph, 14);
  stroke(55, 195, 75);
  strokeWeight(2.5);
  noFill();
  rect(px, py, pw, ph, 14);
  noStroke();

  // Level counter
  fill(120, 190, 135);
  textSize(14);
  textAlign(CENTER, TOP);
  text('Test Level  #' + (testLevelId + 1) + '  of  100', width / 2, py + 16);

  // Outcome heading
  let headCol, headTxt;
  if      (testOutcome === 'complete') { headCol = [60,  220, 90];  headTxt = 'Level Complete!'; }
  else if (testOutcome === 'gameover') { headCol = [218, 50,  50];  headTxt = 'Game Over';       }
  else                                 { headCol = [220, 175, 50];  headTxt = 'Level Skipped';   }
  fill(headCol[0], headCol[1], headCol[2]);
  textSize(44);
  textAlign(CENTER, CENTER);
  text(headTxt, width / 2, py + 74);

  // Rating prompt
  fill(210, 245, 215);
  textSize(17);
  text('How was this level?', width / 2, py + 120);

  // ── Rating buttons: Good / Medium / Bad ────────────────────────────────
  const btnW   = Math.floor((pw - 80 - 40) / 3);
  const btnGap = 20;
  const btn1X  = px + 40;
  const btn2X  = btn1X + btnW + btnGap;
  const btn3X  = btn2X + btnW + btnGap;
  const rBtnY  = py + 148;
  const rBtnH  = 52;

  // Good
  fill(25, 115, 45, 230);
  rect(btn1X, rBtnY, btnW, rBtnH, 10);
  stroke(60, 200, 90); strokeWeight(1.5); noFill();
  rect(btn1X, rBtnY, btnW, rBtnH, 10); noStroke();
  fill(110, 240, 135);
  textSize(17);
  textAlign(CENTER, CENTER);
  text('[1]  Good', btn1X + btnW / 2, rBtnY + rBtnH / 2);

  // Medium
  fill(105, 95, 15, 230);
  rect(btn2X, rBtnY, btnW, rBtnH, 10);
  stroke(210, 190, 60); strokeWeight(1.5); noFill();
  rect(btn2X, rBtnY, btnW, rBtnH, 10); noStroke();
  fill(245, 220, 80);
  text('[2]  Medium', btn2X + btnW / 2, rBtnY + rBtnH / 2);

  // Bad
  fill(115, 22, 22, 230);
  rect(btn3X, rBtnY, btnW, rBtnH, 10);
  stroke(210, 70, 70); strokeWeight(1.5); noFill();
  rect(btn3X, rBtnY, btnW, rBtnH, 10); noStroke();
  fill(245, 105, 105);
  text('[3]  Bad', btn3X + btnW / 2, rBtnY + rBtnH / 2);

  // Divider
  stroke(55, 195, 75, 55);
  strokeWeight(1);
  line(px + 30, py + 215, px + pw - 30, py + 215);
  noStroke();

  // ── Action buttons: Restart / Stop Testing ─────────────────────────────
  const abtnW  = Math.floor((pw - 80 - btnGap) / 2);
  const abtn1X = px + 40;
  const abtn2X = abtn1X + abtnW + btnGap;
  const aBtnY  = py + 220;
  const aBtnH  = 48;

  fill(22, 55, 32, 210);
  rect(abtn1X, aBtnY, abtnW, aBtnH, 10);
  stroke(60, 175, 80); strokeWeight(1.5); noFill();
  rect(abtn1X, aBtnY, abtnW, aBtnH, 10); noStroke();
  fill(140, 235, 160);
  textSize(15);
  text('[R]  Restart Level', abtn1X + abtnW / 2, aBtnY + aBtnH / 2);

  fill(55, 22, 22, 210);
  rect(abtn2X, aBtnY, abtnW, aBtnH, 10);
  stroke(185, 60, 60); strokeWeight(1.5); noFill();
  rect(abtn2X, aBtnY, abtnW, aBtnH, 10); noStroke();
  fill(235, 130, 130);
  text('[S]  Stop Testing', abtn2X + abtnW / 2, aBtnY + aBtnH / 2);

  // ── Export All Data button ──────────────────────────────────────────────
  const eBtnY = aBtnY + aBtnH + 14;
  const eBtnW = Math.floor((pw - 80) * 0.7);
  const eBtnX = px + (pw - eBtnW) / 2;
  fill(22, 45, 65, 210);
  rect(eBtnX, eBtnY, eBtnW, 36, 8);
  stroke(70, 140, 200); strokeWeight(1.2); noFill();
  rect(eBtnX, eBtnY, eBtnW, 36, 8); noStroke();
  fill(140, 200, 250);
  textSize(13);
  text('[E]  Export All Data  \u2193 smr_complete.json', eBtnX + eBtnW / 2, eBtnY + 18);

  // ── Existing rating tally for this level ───────────────────────────────
  const ratings = loadRatings();
  const r       = ratings[testLevelId];
  if (r) {
    const total = r.good + r.medium + r.bad;
    if (total > 0) {
      fill(130, 185, 145);
      textSize(13);
      text(r.good + ' good  /  ' + r.medium + ' medium  /  ' + r.bad + ' bad  (' + total + ' rated)',
           width / 2, py + ph - 18);
    }
  }

  pop();
}

// ──────────────────────────────────
//  Pause Screen
// ──────────────────────────────────
function drawPauseScreen() {
  // Semi-transparent overlay (game still visible beneath)
  fill(0, 0, 0, 130);
  noStroke();
  rect(0, 0, width, height);

  // Panel
  let pw = 360, ph = 200;
  let px = width / 2 - pw / 2, py = height / 2 - ph / 2;
  fill(14, 32, 18, 245);
  rect(px, py, pw, ph, 14);
  stroke(55, 195, 75);
  strokeWeight(2);
  noFill();
  rect(px, py, pw, ph, 14);
  noStroke();

  // PAUSED text
  fill(90, 235, 110);
  textSize(56);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  text('PAUSED', width / 2, height / 2 - 26);
  textStyle(NORMAL);

  // Resume hint
  fill(185, 245, 195);
  textSize(18);
  text('Press  P  to resume', width / 2, height / 2 + 36);
}
