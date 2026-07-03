# Super Mole Rat – Lab Escape

A browser-based side-scrolling platformer. Play as a naked mole rat escaping a laboratory: run right, stomp bees, dodge ants and spiders, find the hidden key, and reach the exit door before the 120-second timer runs out.

<!-- Add screenshot here -->

---

## Getting Started

No build step, no npm, no server required.

**Option 1 — Open directly:**
```
index.html   →  open in Firefox, Chrome, or Edge
```

**Option 2 — Local server (needed if your browser blocks local file imports):**
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

**CDN dependency:** p5.js v1.7.0 is loaded from `https://cdn.jsdelivr.net/npm/p5@1.7.0/lib/p5.js`. An internet connection is required unless you download the library to `lib/` and update the `<script>` tag in `index.html`.

---

## Controls

| Key | Action |
|---|---|
| `→` / `D` | Run right |
| `←` / `A` | Run left |
| `Space` / `W` / `↑` | Jump (from ground or platform only) |
| `P` | Pause / resume |
| `Enter` / `R` | Start (title), restart (game over), next level (level complete) |
| `T` / click Test Mode | Enter test mode (title screen) |
| `Q` | Skip current level (test mode) |
| `1` / `G` | Rate level Good (test rating screen) |
| `2` / `M` | Rate level Medium (test rating screen) |
| `3` / `B` | Rate level Bad (test rating screen) |
| `S` | Stop testing, return to title |
| `E` | Export `smr_complete.json` (test rating screen) |

---

## How to Play

1. **Run right.** The camera locks at x = 440 px; the world scrolls once you pass that point.
2. **Deal with enemies.** Stomp bees by landing on them from above. Jump over ants — they are indestructible. Avoid spiders dangling from platforms on their silk threads.
3. **Collect the key.** One golden key is hidden on a platform somewhere in the level. Pick it up to unlock the exit door.
4. **Reach the exit door.** Without the key the door shakes and pushes you back. With the key, walk in to complete the level and earn a time bonus.
5. **Beat the clock.** Each level has a 120-second timer. The countdown turns orange below 20 s and flashes red below 10 s. Time running out means game over.
6. **Advance.** Each level increases enemy speed by 20%. Score accumulates across levels; your high score is saved automatically.

---

## Enemies

### Bee

Bees fly in from the right at a random height. They move left at varying speeds.

| Interaction | Result |
|---|---|
| Land on top (falling from above) | Stomp: +100 score, yellow particle burst, small upward bounce |
| Touch from the side or below | Lose 1 life |
| Torch power-up active | Bee dies on contact (+100 score) |

### Ant

Ants walk along the floor from the right. They are indestructible under normal conditions — the only safe option is to jump over them.

| Interaction | Result |
|---|---|
| Touch from any angle | Lose 1 life |
| Torch power-up active | Ant dies on contact (+50 score) |

### Spider

Spiders hang from silk threads below certain platforms and yo-yo up and down continuously. They cannot be stomped.

| Interaction | Result |
|---|---|
| Touch spider body | Lose 1 life |
| Torch power-up active | Spider dies permanently (+200 score) |

**Spider state machine:** `pause (0.75 s at top) → falling (accelerates, capped at 5 px/frame) → climbing (1.2 px/frame) → pause`

After taking damage, the player has **1.5 seconds of invincibility** (visible as a flashing sprite).

---

## Items & Power-ups

All collectible items bob up and down and have a glowing halo. Picking one up triggers a 4-second announcement banner.

### Torch

A wooden torch with a layered flame. Collecting it activates **fire mode for 5 seconds**:

- The player emits a continuous fire-particle trail.
- All enemies (bees, ants, spiders) are killed on contact for bonus score.
- The player is also invincible for the duration.

### Flash

A lightning-bolt item. Collecting it activates **speed mode for 10 seconds**:

- The player is forced to run at maximum speed (10 px/frame) regardless of input direction.
- Speed-line particles stream behind the player.

### Surprise Box

An amber lab crate with a purple glow and a `?` symbol. **One appears per level**, placed on a platform. Collecting it triggers one of **10 random effects**:

| Effect | What happens |
|---|---|
| **Mirror Controls** | Left and Right inputs are permanently swapped for the rest of the game |
| **Upside Down** | The entire game canvas is flipped upside down for this level |
| **Extra Heart** | Gain +1 life immediately; the bonus heart carries into future levels (max +3 bonus hearts, 6 total lives) |
| **2× Score** | All score gains are doubled for this level |
| **Big Player** | Player dimensions double (100 × 80 px) for this level |
| **Super Jump** | Jump strength increases by ×1.7 for this level |
| **Darkness** | A 10-second radial spotlight effect — only a small area around the player is visible |
| **Bee Swarm** | Six bees spawn immediately at the right edge of the screen |
| **Teleport** | The player is warped 1 500–3 000 px forward; the key is auto-collected if not already held |
| **Baby Mole Rat** | A baby companion follows the player and absorbs the next hit (no life lost) |

Effects that are limited to one level (Upside Down, 2× Score, Big Player, Super Jump, Darkness) reset when the level ends. Persistent effects (Mirror Controls, Extra Heart, Baby Mole Rat) carry forward until a full game restart.

Active effects are shown as badges in the top-right corner of the HUD.

---

## Scoring

| Event | Points |
|---|---|
| Stomp or torch-kill a bee | +100 (×2 with Score Multiplier) |
| Torch-kill an ant | +50 (×2 with Score Multiplier) |
| Torch-kill a spider | +200 (×2 with Score Multiplier) |
| Complete a level | `max(0, timeLeft × 10)` time bonus |

Score is cumulative across levels. The all-time high score is saved to `localStorage` under the key `smr_highscore` and displayed on the title screen and game over screen.

---

## Level System

### Normal mode

The game draws from a curated pool of **20 hand-rated levels** stored in `levels/best_levels.js`:

- Levels 1 and 2 are always the same (shortest/easiest) for a consistent on-ramp.
- Level 3 onward selects randomly from the remaining pool.

### Procedural generator

The game contains a deterministic procedural level generator (seed 42) that produces **100 distinct layouts** on startup and caches them in `localStorage`. The generator uses a 4-section height arc (intro → climb → descent → final), platform-width archetypes, moving platforms placed at the largest gaps, and stair-step segments before the exit door.

### Difficulty scaling

| Parameter | Scales with level |
|---|---|
| Enemy speed | `× (1 + (level − 1) × 0.2)` — level 1 = ×1.0, level 6 = ×2.0 |
| Level length | Longer levels in the procedural pool have more platforms and spiders |
| Spider count | 1 spider on shortest levels, up to 5 on the longest |

Lives reset to 3 (plus any bonus hearts) at the start of each level.

---

## Architecture

### Technology stack

| Layer | Technology |
|---|---|
| Engine | p5.js v1.7.0 (global / instance-less mode) |
| Language | Vanilla JavaScript (ES5 constructor functions) |
| HTML / CSS | Minimal shell; CSS reset with black background and centred 800 × 600 canvas |
| Persistence | `localStorage` (high score, level ratings, generated level cache) |
| Level curation | Python 3 (`select_best_levels.py`) |

### File structure

```
smr_game/
├── index.html              HTML shell — loads p5.js CDN, best_levels.js, super_mole_rat.js
├── style.css               CSS reset
├── super_mole_rat.js       All game logic (~2 800 lines)
├── select_best_levels.py   CLI tool: smr_complete.json → levels/best_levels.js
├── smr_complete.json       Exported level data + playtester ratings (100 levels)
├── smr_handoff.md          Living developer reference (architecture, gotchas, next steps)
├── smr_dev_notes.md        Physics constants, entity reference, original roadmap
└── levels/
    └── best_levels.js      20 curated levels (auto-generated by select_best_levels.py)
```

All game logic lives in a single JavaScript file (`super_mole_rat.js`). It contains entity constructors (`Player`, `Bee`, `Ant`, `Spider`, `Platform`, `KeyItem`, `PowerItem`, `SurpriseBox`, `ExitDoor`, `Particle`), the procedural level generator, the p5.js `setup()`/`draw()` lifecycle, all draw helpers (every sprite is rendered procedurally — no external image assets), and all UI screens.

---

## Level Curation Pipeline

The game ships with a built-in test mode for rating procedurally generated levels:

1. **Test Mode** — press `T` on the title screen. The game cycles through all 100 generated levels in a random order.
2. **Play and rate** — for each level, press `1` (Good), `2` (Medium), or `3` (Bad). Press `Q` to skip, `R` to restart.
3. **Export** — press `E` on the rating screen to download `smr_complete.json`, which contains all 100 level definitions plus ratings and weighted scores.
4. **Select the best** — run the Python script to produce a new `best_levels.js`:

```bash
python3 select_best_levels.py smr_complete.json --top 20 --extend-runway 800
```

Key options for `select_best_levels.py`:

| Option | Default | Description |
|---|---|---|
| `--top N` | 8 | Number of levels to keep |
| `--min-ratings N` | 3 | Minimum ratings required to qualify |
| `--fill-unrated` | on | Fill remaining slots with the longest unrated levels |
| `--extend-runway N` | 800 | Pixels to clear before the exit door for an unobstructed final run |
| `--output PATH` | `levels/best_levels.js` | Output path |

The script ranks rated levels by weighted score `(good × 2 + medium − bad) / total`, sorts the final selection by level length ascending (shortest first = easiest first), and writes a `const BEST_LEVELS = [...]` file ready to be loaded by `index.html`.

---

## Developer Notes

For architecture details, physics constants, entity API, gotchas, and prioritised next steps, see:

- **`smr_handoff.md`** — the authoritative living reference; updated after every development session.
- **`smr_dev_notes.md`** — original developer notes; physics constants and draw-helper descriptions remain accurate; other sections superseded by the handoff doc.
