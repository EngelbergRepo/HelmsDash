// src/config.js  —  ALL tunable variables in one place
export const CONFIG = {

  // ── Rendering ─────────────────────────────────────────────
  FOV: 70,
  NEAR: 0.1,
  FAR: 300,
  FOG_COLOR: 0xc8b89a,
  FOG_NEAR: 40,
  FOG_FAR: 120,

  // ── Pixel Art Rendering ──────────────────────────────────────
  PIXEL_ART_ENABLED:        false,

  // Virtual canvas size — lower = chunkier pixels
  // 320×180  → very chunky (~NES feel)
  // 426×240  → medium (GBA-ish)
  // 640×360  → subtle, just removes AA
  PIXEL_ART_WIDTH:          640*2, // 320
  PIXEL_ART_HEIGHT:         360*2, // 180

  // UV snapping: when true, geometry moves in whole-pixel steps only (authentic retro, can feel choppy)
  PIXEL_ART_SNAP_UVS:       false,

  // Color palette reduction: 0 = off, 4–32 = quantize to N shades per channel
  PIXEL_ART_PALETTE_LEVELS: 0,

  // Outline thickness in virtual pixels: 0 = off, 1–2 = cel-shaded edge
  PIXEL_ART_OUTLINE_PX:     0,

  // ── Pixel Art Color Grading ───────────────────────────────────
  // Exposure lift to compensate for the linear render pass (1.0 = no change)
  PIXEL_ART_EXPOSURE:       1.5,

  // Saturation: 0 = greyscale, 1 = unchanged, 1.4 = punchy
  PIXEL_ART_SATURATION:     1,

  // Warm highlight tint (rgb 0–1): mixed into bright pixels
  PIXEL_ART_HIGHLIGHT_TINT: [1.05, 0.92, 0.72],   // golden-orange

  // Cool shadow tint (rgb 0–1): mixed into dark pixels
  PIXEL_ART_SHADOW_TINT:    [0.62, 0.65, 0.85],   // lavender-blue

  // Strength of the split-tone blend (0 = off, 0.25 = subtle, 0.5 = strong)
  PIXEL_ART_TINT_STRENGTH:  0.22,

  // ── Track ─────────────────────────────────────────────────
  LANE_COUNT: 3,
  LANE_SPACING: 3.0,           // metres between lane centres
  TRACK_CHUNK_LENGTH: 6,       // metres per chunk (6 / 1.5 = 4 sleepers per chunk)
  RAIL_TIE_SPACING: 1.5,       // metres between sleepers
  CHUNK_POOL_SIZE: 80,         // chunks alive at once — 20 × 6 m = 120 m, matches FOG_FAR
  DESPAWN_Z: 200,               // must be well past CAMERA_BEHIND (6) so chunks fully clear the view
  SPAWN_Z: -150,

  // ── Speed ─────────────────────────────────────────────────
  START_SPEED: 10,            // m/s — world scroll speed at session start
  SPEED_RAMP: 0.01,           // m/s gained per second (reaches MAX in ~3 min from START)
  MAX_SPEED: 50,
  SPRINT_MULTIPLIER: 1.6,
  PROCEDURAL_CHUNK_WEIGHT: 0.3, // probability of procedural vs preset chunk
  FORMATION_SPAWN_CHANCE: 0.08, // probability per chunk of triggering a formation

  // ── Player ────────────────────────────────────────────────
  PLAYER_HEIGHT: 1.8,
  PLAYER_WIDTH: 0.6,
  GRAVITY: 80,                 // m/s² — higher = snappier jump, lower = floatier
  JUMP_HEIGHT_FACTOR: 1,     // × tallest obstacle height
  ROLL_DURATION: 1,
  LANE_SWITCH_DURATION: 0.13,  // seconds to slide between lanes
  PLAYER_START_LANE: 1,        // 0=left, 1=centre, 2=right

  // ── Jetpack Altitude ──────────────────────────────────────
  JETPACK_ALTITUDE_FACTOR: 3.0,  // × tallest obstacle height
  JETPACK_TRANSITION_DURATION: 0.8, // seconds to ascend/descend
  JETPACK_COINS_PER_CHUNK: 52,

  // ── Collectibles / Power-ups ──────────────────────────────
  POWERUP_SPAWN_INTERVAL: [8, 20],   // random seconds between spawns
  SPRINT_DURATION: 10,
  MAGNET_DURATION: 10,
  MAGNET_RADIUS: 10.0,
  MAGNET_PULL_SPEED: 30,           // m/s — speed at which magnet pulls coins toward player
  DOUBLER_DURATION: 10,
  JETPACK_DURATION: 10,

  // ── Collectible emission ──────────────────────────────────
  // Each entry: [r, g, b] emissive color + intensity applied to all meshes in the GLB.
  // Set intensity to 0 to disable emission for that collectible.
  COLLECTIBLE_EMISSION: {
    coin:         { color: 0xffa500, intensity: 0.6 },
    magnet:       { color: 0x2244ff, intensity: 0.5 },
    doubler:      { color: 0x2244ff, intensity: 0.7 },
    jetpack:      { color: 0xffcc00, intensity: 0.5 },
    sprint_shoes: { color: 0x2244ff, intensity: 0.5 },
  },

  // ── Coins ─────────────────────────────────────────────────
  COIN_COLLECT_RADIUS: 1.8,        // metres — how close player must be to collect a coin
  COIN_VALUE: 1,
  COIN_SPACING: 1.5,           // metres between coins in a row
  COINS_PER_CLUSTER: 7,
  COIN_FLOAT_HEIGHT: 0.6,
  COIN_FADE_NEAR: 60,           // metres ahead whre coins start fading
  COIN_FADE_FAR: 120,            // metres ahead whre coins are fully invisible

  // ── HP / XP ───────────────────────────────────────────────
  MAX_HP: 10,
  HP_LOST_PER_HIT: 1,
  XP_PER_SECOND: 3,
  INVINCIBILITY_FRAMES: 1.5,  // seconds after a hit

  // ── Carriage / Train ──────────────────────────────────────
  CARRIAGE_SPAWN_CHANCE: 0.1,   // probability per procedural chunk
  CARRIAGE_MIN_WAGONS: 1,
  CARRIAGE_MAX_WAGONS: 3,        // 3 × 12 m = 36 m fits in 72 m chunk
  CARRIAGE_WAGON_HEIGHT: 3,      // metres — top of wagon roof
  CARRIAGE_WAGON_LENGTH: 12.0,    // metres per wagon
  CARRIAGE_COINS_PER_WAGON: 6,   // coins placed on each wagon top
  CARRIAGE_RAMP_CHANCE: 0.6,     // probability the first wagon has a ramp (rest never do)
  CARRIAGE_RAMP_LENGTH: 6.0,     // horizontal run of the ramp (metres)
  CARRIAGE_RAMP_WIDTH_FACTOR: 0.9, // ramp width as a fraction of wagon width
  CARRIAGE_RAMP_THICKNESS: 0.22, // visual thickness of the ramp plank (metres)

  // ── Obstacles ─────────────────────────────────────────────
  OBSTACLE_TYPES: ['cart', 'barrel', 'gate', 'low_beam'],
  OBSTACLE_HEIGHT: {
    cart: 2.2, barrel: 1.2, gate: 2.8, low_beam: 1.25
  },
  OBSTACLE_MIN_GAP: 5,        // metres between obstacles

  // ── Environment ───────────────────────────────────────────
  SIDE_OBJECT_DENSITY: 0.5,   // objects per metre on each side
  BUILDING_TYPES: ['building_a', 'building_b', 'alley'],
  TREE_FREQUENCY: 0.5,
  GROUND_PLANE_WIDTH: 100,     // metres — width of ground.png plane; increase to push side assets further apart
  SIDE_SCENE_GAP: 0,       // metres between the track edge and the nearest side asset (trees, buildings)

  // ── Audio ─────────────────────────────────────────────────
  MUSIC_VOLUME: 0.4,
  SFX_VOLUME: 0.8,

  // ── Camera ────────────────────────────────────────────────
  CAMERA_BEHIND: 6,
  CAMERA_HEIGHT: 4,
  CAMERA_LOOK_AHEAD: 3,

  // ── World curvature ───────────────────────────────────────
  WORLD_CURVE_STRENGTH: 0.000005, // post-projection Y bend; 0 = flat, higher = more sphere

  // ── Track turns (visual shader bend, no gameplay change) ─────
  TURN_STRENGTH:         0.00001, // lateral X bend magnitude (same scale as WORLD_CURVE_STRENGTH)
  TURN_FREQUENCY:        0,      // average seconds between turns
  TURN_HOLD_DURATION:    4,       // seconds to hold full bend before straightening
  TURN_TRANSITION_TIME:  10,     // seconds to ramp bend in or out
};
