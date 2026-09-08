'use strict';
/* ============================================================
   NEMO DASH — biome palette table
   ------------------------------------------------------------
   The scope expansion: 15 reefs stop being "blue gets darker" and
   become six named biomes you can SEE you have entered. The
   design rule that kept v2.8 honest — the swim band narrows and
   the water darkens as caveK goes 0→1 — stays; the biomes only
   change the WATER'S COLOUR, the decor weights and the rock
   tint, nothing about the spawn math. So this is pure data, and
   pure data cannot cost a frame.

   Each biome's `open` stops are the reef (top→bottom). When the
   run descends into a cave (caveK → 1) waterStops() lerps each
   stop toward that biome's `cave` stops, exactly like v2.8 did —
   the mechanic is unchanged, the palette now belongs to a place.
   Level mapping (see biomeAt):
     1-3   Sunlit Reef        airy turquoise  (the original look, widened)
     4-6   Kelp Forest        green sea, kelp-heavy decor
     7-8   Shipwreck Graveyard steel-teal, rust tones
     9-10  Jellyfish Bloom    magenta-lavender water
     11-12 Volcanic Vents     sulphurous dark blue, dark rock
     13-15 The Abyss          the darkest blue, faint bioluminescence
   ============================================================ */

const BIOMES = {
  sunlit: {
    name: 'Sunlit Reef',
    open: ['#1b6f9e', '#11527e', '#0a3c60', '#052844'],
    cave: ['#02090f', '#01070d', '#010509', '#000304'],
    // open-water palette for the fish body gradient is left to the creature art;
    // these drive only the water, the sand tint and the rock tint.
    floorTop: '#9a7c53',
    floorMid: '#775f3e',
    floorBot: '#322317',
    floorLip: 'rgba(255,235,190,0.25)',
    rock: 0, // ROCK_TINT index — grey granite
    seaweedHue: [140, 170],
    starCols: ['#ff8c42', '#ff6b81', '#c77dff', '#ffd66e'],
    lightAlpha: 0.10, // god-ray strength (open water)
    // the score's melody scale per biome (fed to AudioSys.musicScale): the same
    // 4-bar engine, a different mode — so the music "arrives" somewhere new
    // without a second loop to build.
    scale: [293.66, 349.23, 392.0, 440.0, 523.25, 587.33], // D minor pentatonic
    desc: 'The water is warm and bright here. The big fish stay near the surface.',
  },
  kelp: {
    name: 'Kelp Forest',
    open: ['#166b5e', '#0e5449', '#083d36', '#042521'],
    cave: ['#010c0a', '#010a08', '#000806', '#000402'],
    floorTop: '#6f7a44',
    floorMid: '#526033',
    floorBot: '#241f10',
    floorLip: 'rgba(180,235,150,0.24)',
    rock: 1, // brown sandstone — reads as scoured rock under kelp
    seaweedHue: [100, 140],
    starCols: ['#ff9d5c', '#e8ff8c', '#ffd66e', '#7dffb2'],
    lightAlpha: 0.09,
    scale: [293.66, 349.23, 415.3, 440.0, 523.25, 622.25], // D dorian — warmer, a touch exotic
    desc: 'Kelp curtains the light. Something long moves between the stalks.',
  },
  shipwreck: {
    name: 'Shipwreck Graveyard',
    open: ['#3a5f6b', '#2a4752', '#1b333c', '#0d1d24'],
    cave: ['#030a0c', '#020809', '#010606', '#000303'],
    floorTop: '#5b5f66',
    floorMid: '#43474e',
    floorBot: '#1d2129',
    floorLip: 'rgba(150,190,200,0.22)',
    rock: 2, // wet basalt
    seaweedHue: [180, 210],
    starCols: ['#8c9cff', '#b8c4d8', '#d4a373', '#7dffc4'],
    lightAlpha: 0.06, // the wreck blocks the sun
    scale: [293.66, 311.13, 349.23, 415.3, 466.16, 554.37], // D phrygian-ish, metallic and cold
    desc: 'The bones of a fleet rut on the canyon floor. Rust hangs like moss.',
  },
  jellyfish: {
    name: 'Jellyfish Bloom',
    open: ['#4a3b7c', '#372b60', '#251c46', '#130e29'],
    cave: ['#070514', '#05030f', '#030208', '#010104'],
    floorTop: '#7a5f93',
    floorMid: '#5c4770',
    floorBot: '#281b3d',
    floorLip: 'rgba(200,170,255,0.24)',
    rock: 1,
    seaweedHue: [270, 310],
    starCols: ['#ff9de2', '#c77dff', '#8c9cff', '#ffd66e'],
    lightAlpha: 0.08,
    scale: [293.66, 349.23, 415.3, 440.0, 523.25, 622.25], // D dorian — dreamy, floating
    desc: 'The current drifts with pale bells, pulsing. They sting like nettles.',
  },
  vents: {
    name: 'Volcanic Vents',
    open: ['#0d2b3d', '#0a2233', '#071828', '#040d17'],
    cave: ['#020507', '#010306', '#010205', '#000102'],
    floorTop: '#5a4a3d',
    floorMid: '#3f2f2a',
    floorBot: '#150f0f',
    floorLip: 'rgba(255,170,90,0.24)', // vent glow on the lip
    rock: 0,
    seaweedHue: [0, 20], // red kelp near the vents
    starCols: ['#ff7a3c', '#ffb347', '#ff5e62', '#ffe08c'],
    lightAlpha: 0.04, // deep and dim
    scale: [293.66, 311.13, 349.23, 392.0, 440.0, 523.25], // D phrygian — volcanic, tense
    desc: 'The floor seethes. Heat rises in plumes that will burn your fins.',
  },
  abyss: {
    name: 'The Abyss',
    open: ['#02060a', '#020408', '#010305', '#000102'],
    cave: ['#010204', '#000102', '#000101', '#000000'],
    floorTop: '#232a33',
    floorMid: '#161b22',
    floorBot: '#05070a',
    floorLip: 'rgba(90,220,255,0.22)', // the last bioluminescence
    rock: 2,
    seaweedHue: [190, 220],
    starCols: ['#5adcff', '#7dffc4', '#8c9cff', '#c8f2ff'],
    lightAlpha: 0.02,
    scale: [293.66, 311.13, 349.23, 415.3, 466.16, 523.25], // D phrygian — thin, and (not) sure
    desc: 'No light. No floor. Only a lure glowing, far below.',
  },
};

// The 15 reefs, mapped. [start, end, biomeKey].
const BIOME_ZONES = [
  [1, 3, 'sunlit'],
  [4, 6, 'kelp'],
  [7, 8, 'shipwreck'],
  [9, 10, 'jellyfish'],
  [11, 12, 'vents'],
  [13, 15, 'abyss'],
];

// Which biome owns this level? Endless runs get a biome from distance so the
// descent *feels* like a descent: the deeper you swim, the further down the
// table you go (the last biome, the abyss, is where a long run ends up).
function biomeAt(n) {
  if (n === '∞') return 'abyss'; // long endless runs end in the abyss
  const v = Number(n) || 1;
  if (v > MAX_LEVEL) {
    // endless distance in px — walk the biomes as you swim further
    const order = ['sunlit', 'kelp', 'shipwreck', 'jellyfish', 'vents', 'abyss'];
    return order[Math.min(order.length - 1, Math.floor(v / 2500))];
  }
  const L = clamp(Math.round(v) || 1, 1, MAX_LEVEL);
  for (const [a, b, key] of BIOME_ZONES) if (L >= a && L <= b) return key;
  return 'sunlit';
}
function biomeName(n) {
  return BIOMES[biomeAt(n)].name;
}

// The biome-driver: `waterStops()` reads this. Set once per level in
// createLevel / startWave so bakeBackground() and the render fallback both
// paint the right water without recomputing it.
let activeBiome = 'sunlit';
function setActiveBiome(n) {
  activeBiome = biomeAt(n);
  // the score changes mode with the water (see BIOMES[x].scale). Audio may not be
  // initialised yet; the guard is on the AudioSys side, so call it unconditionally.
  try {
    if (typeof AudioSys !== 'undefined' && AudioSys.musicScale) {
      AudioSys.musicScale(BIOMES[activeBiome] && BIOMES[activeBiome].scale);
    }
  } catch (e) {}
}

// waterStops() in render.js currently builds the open/cave spread from fixed
// constants. This is the biome-aware replacement: the open stops come from the
// biome, the cave stops are the biome's own cave blend, and `k` still lerps
// between them exactly as before — so the descent mechanic is untouched.
function biomeWaterStops(k) {
  const b = BIOMES[activeBiome] || BIOMES.sunlit;
  return {
    stops: b.open.map((c, i) => hexLerp(c, b.cave[i], k)),
    k,
  };
}
