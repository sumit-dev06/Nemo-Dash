// ---------- game state ----------
let state = 'menu';
let level = 1,
  cfg = levelConfig(1);
let endless = false;
let score = 0,
  pearls = 0,
  nearCount = 0,
  combo = 0,
  comboTimer = 0,
  eaten = 0,
  eatenPts = 0;
let best = parseInt(localStorage.getItem('nemoBest') || '0', 10) || 0;
let distance = 0,
  scrollX = 0,
  elapsed = 0,
  time = 0;
let shake = 0,
  slowmo = 0,
  flashA = 0;
let predators = [],
  jellies = [],
  nets = [],
  hooks = [],
  pearlsArr = [],
  powers = [],
  parts = [],
  bubbles = [],
  floaters = [],
  currents = [],
  fries = [];
let spawnT = { pred: 1, jelly: 2.5, net: 3, hook: 4, pearl: 0.5, power: 7, fry: 1 };
let midMagnet = false, // guaranteed mid-run magnet drop (once per reef / endless tier)
  midHeart = false; // guaranteed mid-run heart drop (harder reefs only, never frequent)
let gate = null;
let seaweeds = [],
  corals = [],
  rocksFar = [],
  caveTeeth = [],
  starfish = [],
  snow = [];
let boatX = 0;

const player = {
  x: 170,
  y: H / 2,
  vy: 0,
  r: 17,
  tilt: 0,
  tail: 0,
  hearts: 3,
  invuln: 0,
  shield: 0,
  magnet: 0,
  slow: 0,
  gillT: 0,
  alive: true,
  dead: false,
  deathT: 0,
  deadReason: '',
  eatenBy: null, // predator currently eating you (bite cinematic only)
  catchX: 0, // where the jaws grabbed you
  catchY: 0,
  feedT: 0, // seconds since the grab (drives dart → snap → swallow)
  snapDone: false, // jaws have shut — victim is gone, blood tells it
  heartT: 0,
  boost: 100, // boost tank 0–100: drains while bursting, refills at rest
  boosting: false,
  boostToggle: false, // phone ⚡ button toggles; keyboard Shift holds
  gulpT: 0, // eating pulse timer (set on devour, counts down in update)
  trappedIn: null, // net cage currently dragging you down (null = free)
};

// boost tuning: ~3.5s of burst per full tank, ~7s to refill from empty
const BOOST = { mul: 1.75, drain: 28, fill: 14 };

const input = {
  up: false,
  down: false,
  fwd: false, // keyboard surge (D / →); touch uses the joystick
  joyTX: 0, // joystick raw targets from the thumb (ui writes these)
  joyTY: 0,
  joyX: 0, // smoothed values the physics actually uses (0 on desktop)
  joyY: 0, // joystick -1..1 (up negative), replaces the old ▲▼ buttons
  boostHeld: false,
  pointerActive: false,
  pointerY: H / 2,
};

// dynamic resolution: frame-time monitor that steps render scale down/up.
// Pixels change, art never does — full quality whenever the device copes.
let perfEMA = 1 / 60;
let perfLastQ = 0;
