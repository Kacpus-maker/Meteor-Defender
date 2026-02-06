// Meteor Defender – v2: echte Charakter-Fähigkeiten, echte Difficulty, HP-Bar (statt instant Death)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// HUD / Menu Elements (müssen in deinem HTML existieren wie zuvor)
const statsEl = document.getElementById("stats");

const menuEl = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");
const difficultyRow = document.getElementById("difficultyRow");
const characterRow = document.getElementById("characterRow");

const iconRapid  = document.getElementById("icon-rapid");
const iconTriple = document.getElementById("icon-triple");
const iconShield = document.getElementById("icon-shield");
const iconSlow   = document.getElementById("icon-slow");
const tRapid  = document.getElementById("t-rapid");
const tTriple = document.getElementById("t-triple");
const tShield = document.getElementById("t-shield");
const tSlow   = document.getElementById("t-slow");

const W = canvas.width;
const H = canvas.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// -------------------- THEMES / BACKGROUNDS
const levels = [
  { name: "Dämmerung", sky1:"#0b1020", sky2:"#14214a", accent:"#a9fffb", enemy:"#ff7aa2" },
  { name: "Nebelwald", sky1:"#061621", sky2:"#0b3a3a", accent:"#72ffb5", enemy:"#ffcc66" },
  { name: "Aurora",    sky1:"#070a14", sky2:"#2a0d4d", accent:"#b48bff", enemy:"#ff6bd6" },
  { name: "Sturmfront",sky1:"#06070d", sky2:"#1a1f3a", accent:"#7aa6ff", enemy:"#ffa3a3" },
  { name: "Supernova", sky1:"#05010a", sky2:"#2b1030", accent:"#ffea7a", enemy:"#ff7aa2" },
];

// -------------------- DIFFICULTY (EASY -> HARDEST)
// Hier werden Gegner sichtbar stärker und häufiger.
const difficultyPresets = {
  easy: {
    spawnBase: 1.10,     // größer = weniger Gegner
    speedMul: 0.90,
    hpMul: 0.90,
    damageMul: 0.75,     // Meteor-Schaden
    carrier: 0.24,       // mehr Powerups
    big: 0.18
  },
  medium: {
    spawnBase: 0.92,
    speedMul: 1.00,
    hpMul: 1.00,
    damageMul: 1.00,
    carrier: 0.20,
    big: 0.26
  },
  hard: {
    spawnBase: 0.80,
    speedMul: 1.12,
    hpMul: 1.10,
    damageMul: 1.25,
    carrier: 0.18,
    big: 0.34
  },
  hardcore: {
    spawnBase: 0.70,
    speedMul: 1.25,
    hpMul: 1.20,
    damageMul: 1.55,
    carrier: 0.16,
    big: 0.40
  }
};

let selectedDifficulty = "easy";
let selectedCharacter = "classic";

// -------------------- CHARACTERS (sehen anders aus + andere Fähigkeiten)
// - Classic: balanced
// - Sniper: langsam, aber 2 dmg + (leicht) piercing
// - Tank: mehr HP, langsamer, dicker Cannon
// - Neon: schnell, schnellere Schüsse, aber weniger dmg
const characters = {
  classic: {
    name: "Classic",
    speed: 520,
    baseFireRate: 0.22,
    bulletDamage: 1,
    pierce: 0,                 // 0 = stoppt am ersten Treffer
    maxHp: 130,
    style: { barrel:"short", baseColor:"rgba(255,255,255,0.12)", stroke:"rgba(255,255,255,0.18)" }
  },
  sniper: {
    name: "Sniper",
    speed: 480,
    baseFireRate: 0.32,
    bulletDamage: 2,
    pierce: 1,                 // trifft max. 2 Gegner wenn perfekt
    maxHp: 110,
    style: { barrel:"long", baseColor:"rgba(255,255,255,0.10)", stroke:"rgba(255,255,255,0.18)" }
  },
  tank: {
    name: "Tank",
    speed: 440,
    baseFireRate: 0.26,
    bulletDamage: 1,
    pierce: 0,
    maxHp: 190,                // viel mehr HP
    style: { barrel:"thick", baseColor:"rgba(255,255,255,0.14)", stroke:"rgba(255,255,255,0.20)" }
  },
  neon: {
    name: "Neon",
    speed: 590,
    baseFireRate: 0.18,
    bulletDamage: 1,
    pierce: 0,
    maxHp: 115,
    style: { barrel:"neon", baseColor:"rgba(255,255,255,0.08)", stroke:"rgba(255,255,255,0.16)" }
  }
};

// -------------------- INPUT
let keys = new Set();
let paused = false;
let gameOver = false;
let inMenu = true;

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (e.key === " ") e.preventDefault();

  if (k === "p" && !inMenu) paused = !paused;
  if (k === "r") resetAndMenu();
  if (k === "m") showMenu();

  keys.add(k);
  if (e.key === "ArrowLeft") keys.add("arrowleft");
  if (e.key === "ArrowRight") keys.add("arrowright");
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (e.key === "ArrowLeft") keys.delete("arrowleft");
  if (e.key === "ArrowRight") keys.delete("arrowright");
});

// -------------------- GAME STATE
const state = {
  score: 0,
  level: 1,
  spawnTimer: 0,
  slowTime: 0,

  // HP System
  hp: 130,
  maxHp: 130,
  invuln: 0, // Sekunden Unverwundbarkeit nach Treffer

  diff: difficultyPresets.easy,
  char: characters.classic
};

const player = {
  x: W / 2,
  y: H - 92,
  speed: 520,

  cooldown: 0,
  baseFireRate: 0.22,

  // powerups
  shield: 0,
  rapid: 0,
  triple: 0,

  // character properties
  bulletDamage: 1,
  pierce: 0,

  // style
  _barrel: "short",
  _baseColor: "rgba(255,255,255,0.12)",
  _stroke: "rgba(255,255,255,0.18)"
};

const bullets = [];
const meteors = [];
const powerups = [];
const particles = [];
const coins = [];

const stars = Array.from({ length: 120 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: rand(0.6, 2.0),
  v: rand(18, 70),
}));

// -------------------- MENU UI
function setupMenuUI() {
  difficultyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-diff]");
    if (!btn) return;
    selectedDifficulty = btn.dataset.diff;
    for (const b of difficultyRow.querySelectorAll(".chip")) b.classList.remove("selected");
    btn.classList.add("selected");
  });

  characterRow.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-char]");
    if (!btn) return;
    selectedCharacter = btn.dataset.char;
    for (const b of characterRow.querySelectorAll(".chip")) b.classList.remove("selected");
    btn.classList.add("selected");
  });

  startBtn.addEventListener("click", startGameFromMenu);
}

function showMenu() {
  inMenu = true;
  paused = false;
  menuEl.classList.remove("hidden");
}
function hideMenu() {
  inMenu = false;
  menuEl.classList.add("hidden");
}
function startGameFromMenu() {
  applyDifficultyAndCharacter();
  resetGameOnly();
  hideMenu();
}
function resetAndMenu() {
  resetGameOnly();
  showMenu();
}

function applyDifficultyAndCharacter() {
  state.diff = difficultyPresets[selectedDifficulty];
  state.char = characters[selectedCharacter];

  player.speed = state.char.speed;
  player.baseFireRate = state.char.baseFireRate;
  player.bulletDamage = state.char.bulletDamage;
  player.pierce = state.char.pierce;

  player._barrel = state.char.style.barrel;
  player._baseColor = state.char.style.baseColor;
  player._stroke = state.char.style.stroke;

  state.maxHp = state.char.maxHp;
  state.hp = state.maxHp;
}

// -------------------- HELPERS
function currentTheme() {
  return levels[(state.level - 1) % levels.length];
}

function levelUpIfNeeded() {
  const newLevel = 1 + Math.floor(state.score / 25);
  if (newLevel !== state.level) {
    state.level = newLevel;
    for (let i = 0; i < 18; i++) explode(W / 2, H / 2, false);
  }
}

function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by;
  return (dx * dx + dy * dy) <= (ar + br) * (ar + br);
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// -------------------- HP / DAMAGE
function takeDamage(amount) {
  if (state.invuln > 0) return;

  // shield absorbs first
  if (player.shield > 0) {
    player.shield = Math.max(0, player.shield - 1.2); // shield uses “charges” via time
    explode(player.x, player.y - 20, false);
    state.invuln = 0.25;
    return;
  }

  state.hp -= amount;
  state.invuln = 0.65; // little i-frames
  explode(player.x, player.y, true);

  if (state.hp <= 0) {
    state.hp = 0;
    gameOver = true;
  }
}

// -------------------- RESET
function resetGameOnly() {
  state.score = 0;
  state.level = 1;
  state.spawnTimer = 0;
  state.slowTime = 0;
  state.invuln = 0;

  state.hp = state.maxHp;

  player.x = W / 2;
  player.cooldown = 0;
  player.shield = 0;
  player.rapid = 0;
  player.triple = 0;

  bullets.length = 0;
  meteors.length = 0;
  powerups.length = 0;
  particles.length = 0;

  paused = false;
  gameOver = false;
  updatePowerHUD();
}

// -------------------- DIFFICULTY SCALING PER LEVEL
function getDifficultyForLevel() {
  // Level scaling: je höher, desto mehr/weniger Zeit zwischen Spawns & höhere Geschwindigkeit
  const d = state.diff;
  const L = state.level;

  // spawn interval goes down with level (harder), but never below a floor
  const spawnEvery = Math.max(0.38, d.spawnBase - (L - 1) * 0.045);

  // speed increases with level
  const speedMul = d.speedMul * (1 + (L - 1) * 0.10);

  // big meteor chance increases slowly
  const bigChance = clamp(d.big + (L - 1) * 0.02, 0.16, 0.58);

  // carrier chance decreases slightly with level (harder)
  const carrierChance = clamp(d.carrier - (L - 1) * 0.006, 0.10, 0.30);

  // meteor hp multiplier
  const hpMul = d.hpMul * (1 + (L - 1) * 0.04);

  // meteor damage multiplier
  const damageMul = d.damageMul * (1 + (L - 1) * 0.03);

  return { spawnEvery, speedMul, bigChance, carrierChance, hpMul, damageMul };
}

// -------------------- SPAWNS
function spawnMeteor() {
  const theme = currentTheme();
  const p = getDifficultyForLevel();

  const big = Math.random() < p.bigChance;
  const r = big ? rand(28, 46) : rand(20, 32);

  // polygon points for rock look
  const spikes = Math.floor(rand(9, 13));
  const pts = [];
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * Math.PI * 2;
    const rad = r * rand(0.78, 1.18);
    pts.push({ ang, rad });
  }

  const baseHp = big ? 2 : 1;
  const hp = Math.max(1, Math.round(baseHp * p.hpMul));

  meteors.push({
    x: rand(r + 22, W - r - 22),
    y: -90,
    r,
    vy: rand(140, 250) * p.speedMul,
    vx: rand(-70, 70) * p.speedMul,
    hp,
    isCarrier: Math.random() < p.carrierChance,
    a: rand(0, Math.PI * 2),
    spin: rand(-2.4, 2.4),
    pts,
    glow: theme.enemy,
    damage: big ? 18 : 12, // base
  });
}

function spawnPowerup(x, y) {
  const types = ["rapid", "triple", "shield", "slow"];
  const type = types[Math.floor(Math.random() * types.length)];
  powerups.push({ x, y, r: 15, vy: rand(100, 140), type });
}

// -------------------- POWERUPS
function applyPower(type) {
  if (type === "rapid")  player.rapid = 8;
  if (type === "triple") player.triple = 8;
  if (type === "shield") player.shield = 10;
  if (type === "slow")   state.slowTime = 6;
}
function symbolForPower(type) {
  if (type === "rapid") return "⚡";
  if (type === "triple") return "≋";
  if (type === "shield") return "🛡";
  if (type === "slow") return "⏳";
  return "?";
}

// -------------------- SHOOTING
function fireRate() {
  // Neon / rapid feels different via baseFireRate already
  return (player.rapid > 0) ? Math.min(0.10, player.baseFireRate * 0.55) : player.baseFireRate;
}

function shoot() {
  if (player.cooldown > 0) return;
  player.cooldown = fireRate();

  const theme = currentTheme();
  const base = {
    x: player.x,
    y: player.y - 64,
    r: 4.5,
    vy: -900,
    damage: player.bulletDamage,
    pierceLeft: player.pierce
  };

  if (player.triple > 0) {
    bullets.push({ ...base, vx: -220 });
    bullets.push({ ...base, vx: 0 });
    bullets.push({ ...base, vx: 220 });
  } else {
    bullets.push({ ...base, vx: 0 });
  }

  for (let i = 0; i < 10; i++) {
    particles.push({
      x: player.x + rand(-9, 9),
      y: player.y - 52,
      vx: rand(-190, 190),
      vy: rand(-320, -120),
      life: rand(0.12, 0.30),
      age: 0,
      r: rand(1.4, 3.2),
      c: theme.accent
    });
  }
}

// -------------------- FX
function explode(x, y, big = false) {
  const theme = currentTheme();
  const n = big ? 32 : 16;
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: rand(-280, 280) * (big ? 1.1 : 1),
      vy: rand(-320, 140) * (big ? 1.1 : 1),
      life: rand(0.25, 0.72),
      age: 0,
      r: rand(1.7, 4.4),
      c: (Math.random() < 0.62) ? theme.enemy : theme.accent
    });
  }
}

// -------------------- UPDATE
function update(dtRaw) {
  if (inMenu) return;
  if (paused || gameOver) return;

  // slow time
  let dt = dtRaw;
  if (state.slowTime > 0) {
    dt = dtRaw * 0.55;
    state.slowTime -= dtRaw;
  }

  // invuln timer
  state.invuln = Math.max(0, state.invuln - dtRaw);

  levelUpIfNeeded();

  // stars
  for (const s of stars) {
    s.y += s.v * dt;
    if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
  }

  // movement
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  if (left) player.x -= player.speed * dt;
  if (right) player.x += player.speed * dt;
  player.x = clamp(player.x, 90, W - 90);

  // shoot
  if (keys.has(" ")) shoot();

  // timers
  player.cooldown -= dtRaw;
  player.shield = Math.max(0, player.shield - dtRaw);
  player.rapid  = Math.max(0, player.rapid - dtRaw);
  player.triple = Math.max(0, player.triple - dtRaw);

  // spawn
  const diffNow = getDifficultyForLevel();
  state.spawnTimer -= dtRaw;
  if (state.spawnTimer <= 0) {
    spawnMeteor();
    state.spawnTimer = diffNow.spawnEvery * rand(0.72, 1.22);
  }

  // bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y += b.vy * dt;
    b.x += (b.vx || 0) * dt;
    if (b.y < -100 || b.x < -120 || b.x > W + 120) bullets.splice(i, 1);
  }

  // meteors
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.y += m.vy * dt;
    m.x += m.vx * dt;
    m.a += m.spin * dt;

    if (m.x < m.r + 18) { m.x = m.r + 18; m.vx *= -0.8; }
    if (m.x > W - m.r - 18) { m.x = W - m.r - 18; m.vx *= -0.8; }

    // CONTACT DAMAGE (Meteor trifft Turret direkt)
    if (circleCircle(m.x, m.y, m.r, player.x, player.y - 10, 52)) {
      const dmg = Math.round(m.damage * diffNow.damageMul);
      takeDamage(dmg);
      meteors.splice(i, 1);
      continue;
    }

    // reaches ground -> damage (aber nicht instant death, sondern HP Damage)
    if (m.y > H + 110) {
      meteors.splice(i, 1);
      const dmg = Math.round(m.damage * diffNow.damageMul * 0.85); // ground hit slightly less
      takeDamage(dmg);
    }
  }

  // powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.y += pu.vy * dt;
    if (pu.y > H + 70) powerups.splice(i, 1);
  }

  // bullets -> meteors
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    let consumed = false;

    for (let mi = meteors.length - 1; mi >= 0; mi--) {
      const m = meteors[mi];
      if (circleCircle(b.x, b.y, b.r, m.x, m.y, m.r)) {
        m.hp -= b.damage;
        explode(b.x, b.y, false);

        if (m.hp <= 0) {
          meteors.splice(mi, 1);
          state.score += 1;
          if (m.isCarrier) spawnPowerup(m.x, m.y);
          explode(m.x, m.y, true);
        }

        // piercing logic
        if (b.pierceLeft > 0) {
          b.pierceLeft -= 1; // continue flying
        } else {
          consumed = true;
        }
        break;
      }
    }

    if (consumed) bullets.splice(bi, 1);
  }

  // pickup powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    if (circleCircle(pu.x, pu.y, pu.r, player.x, player.y - 10, 52)) {
      applyPower(pu.type);
      powerups.splice(i, 1);
      explode(player.x, player.y - 46, false);
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dtRaw;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 580 * dt;
    if (p.age >= p.life) particles.splice(i, 1);
  }

  // HUD text
  const theme = currentTheme();
  statsEl.textContent =
    `Score: ${state.score} · Level: ${state.level} (${theme.name}) · HP: ${Math.ceil(state.hp)}/${state.maxHp} · Char: ${state.char.name}`;

  updatePowerHUD();
}

function updatePowerHUD() {
  const onRapid = player.rapid > 0;
  const onTriple = player.triple > 0;
  const onShield = player.shield > 0;
  const onSlow = state.slowTime > 0;

  iconRapid.classList.toggle("active", onRapid);
  iconTriple.classList.toggle("active", onTriple);
  iconShield.classList.toggle("active", onShield);
  iconSlow.classList.toggle("active", onSlow);

  tRapid.textContent  = onRapid  ? `${player.rapid.toFixed(0)}s` : "—";
  tTriple.textContent = onTriple ? `${player.triple.toFixed(0)}s` : "—";
  tShield.textContent = onShield ? `${player.shield.toFixed(0)}s` : "—";
  tSlow.textContent   = onSlow   ? `${state.slowTime.toFixed(0)}s` : "—";
}

// -------------------- DRAW
function drawBackground() {
  const t = currentTheme();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.sky1);
  g.addColorStop(1, t.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  const gg = ctx.createRadialGradient(W / 2, H + 50, 70, W / 2, H + 50, 780);
  gg.addColorStop(0, hexToRgba(t.accent, 0.18));
  gg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function roundRect(x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawTurret() {
  const theme = currentTheme();
  const x = player.x, y = player.y;

  ctx.save();
  ctx.translate(x, y);

  // Flicker bei Invulnerability
  if (state.invuln > 0) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 50);
  }

  // ================= SCHATTEN =================
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 38, 70, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // ================= BASE (je Charakter anders) =================
  let bodyColor = player._baseColor;
  let strokeColor = player._stroke;

  if (state.char.name === "Tank") {
    ctx.fillStyle = "rgba(160,180,200,0.25)";
    ctx.strokeStyle = "rgba(220,240,255,0.35)";
    roundRect(-72, -18, 144, 64, 16, true, true);
  } 
  else if (state.char.name === "Sniper") {
    ctx.fillStyle = "rgba(180,255,220,0.20)";
    ctx.strokeStyle = "rgba(200,255,230,0.35)";
    roundRect(-56, -14, 112, 54, 24, true, true);
  } 
  else if (state.char.name === "Neon") {
    ctx.fillStyle = "rgba(140,120,255,0.18)";
    ctx.strokeStyle = hexToRgba(theme.accent, 0.9);
    roundRect(-60, -14, 120, 52, 26, true, true);
  } 
  else {
    // Classic
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = strokeColor;
    roundRect(-64, -16, 128, 60, 20, true, true);
  }

  // ================= ROHR =================
  ctx.fillStyle = hexToRgba(theme.accent, 0.35);
  ctx.strokeStyle = hexToRgba(theme.accent, 0.75);

  if (player._barrel === "long") {
    roundRect(-8, -92, 16, 78, 12, true, true);
  } 
  else if (player._barrel === "thick") {
    roundRect(-18, -72, 36, 56, 14, true, true);
  } 
  else if (player._barrel === "neon") {
    roundRect(-8, -86, 16, 70, 12, true, true);
    ctx.strokeStyle = hexToRgba(theme.accent, 1);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -78); ctx.lineTo(-8, -28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 8, -78); ctx.lineTo( 8, -28); ctx.stroke();
  } 
  else {
    roundRect(-8, -76, 16, 60, 12, true, true);
  }

  // ================= CORE =================
  ctx.beginPath();
  ctx.arc(0, 16, state.char.name === "Tank" ? 12 : 10, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(theme.accent, 0.95);
  ctx.fill();

  // ================= SHIELD =================
  if (player.shield > 0) {
    const pulse = 0.4 + 0.25 * Math.sin(performance.now() / 120);
    ctx.beginPath();
    ctx.arc(0, 12, 78 + pulse * 10, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(theme.accent, 0.4);
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.restore();
}

function drawBullets() {
  const t = currentTheme();
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(t.accent, 0.95);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 10, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(t.accent, 0.10);
    ctx.fill();
  }
}

function drawMeteor(m) {
  const t = currentTheme();
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.a);

  // glow
  ctx.beginPath();
  ctx.arc(0, 0, m.r * 1.7, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(m.glow || t.enemy, 0.10);
  ctx.fill();

  const rg = ctx.createRadialGradient(-m.r * 0.2, -m.r * 0.2, m.r * 0.2, 0, 0, m.r * 1.25);
  rg.addColorStop(0, "rgba(255,255,255,0.22)");
  rg.addColorStop(1, "rgba(255,255,255,0.08)");

  // rock polygon
  ctx.beginPath();
  for (let i = 0; i < m.pts.length; i++) {
    const p = m.pts[i];
    const x = Math.cos(p.ang) * p.rad;
    const y = Math.sin(p.ang) * p.rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // craters
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(rand(-m.r * 0.25, m.r * 0.25), rand(-m.r * 0.25, m.r * 0.25), m.r * rand(0.18, 0.42), 0, Math.PI * 2);
    ctx.stroke();
  }

  // carrier marker
  if (m.isCarrier) {
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(t.accent, 0.9);
    ctx.fill();
  }

  // HP indicator if >1
  if (m.hp > 1) {
    ctx.font = "900 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,234,122,0.92)";
    ctx.fillText(String(m.hp), 0, 5);
  }

  ctx.restore();
}

function drawMeteors() {
  for (const m of meteors) drawMeteor(m);
}

function drawPowerups() {
  for (const pu of powerups) {
    ctx.save();
    ctx.translate(pu.x, pu.y);

    ctx.beginPath();
    ctx.arc(0, 0, pu.r * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, pu.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "900 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(symbolForPower(pu.type), 0, 5);

    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    const t = 1 - (p.age / p.life);
    ctx.globalAlpha = Math.max(0, t);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.7 + 0.9 * t), 0, Math.PI * 2);
    ctx.fillStyle = p.c;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// -------------------- HP BAR (im Canvas)
function hpColor(t) {
  // t = 0..1
  if (t > 0.55) return "rgba(110,255,140,0.95)"; // grün
  if (t > 0.35) return "rgba(255,235,110,0.95)"; // gelb
  if (t > 0.18) return "rgba(255,170,70,0.95)";  // orange
  return "rgba(255,80,80,0.95)";                 // rot
}

function drawHpBar() {
  // kleiner Balken direkt über dem Charakter
  const barW = 150;
  const barH = 10;

  // Position über dem Turret (wenn zu hoch/tief: gap anpassen)
  const gap = 110;

  // X/Y so, dass er zentriert über dem Charakter ist
  let x = player.x - barW / 2;
  let y = player.y - gap;

  // damit der Balken nie "aus dem Bild" rausgeht
  x = clamp(x, 12, W - barW - 12);
  y = clamp(y, 12, H - 12);

  const t = clamp(state.hp / state.maxHp, 0, 1);

  ctx.save();

  // Hintergrund-Box
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRectCanvas(x - 4, y - 4, barW + 8, barH + 8, 8, true, false);

  // Track
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  roundRectCanvas(x, y, barW, barH, 7, true, false);

  // Fill mit Farbstufen
  ctx.fillStyle = hpColor(t);
  roundRectCanvas(x, y, Math.max(6, barW * t), barH, 7, true, false);

  // Optional: Zahl, nur wenn wenig HP
  if (t <= 0.35) {
    ctx.font = "800 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(`${Math.ceil(state.hp)}`, x + barW / 2, y + 9);
  }

  // blinkender Rahmen wenn invuln
  if (state.invuln > 0) {
    const blink = 0.35 + 0.35 * Math.sin(performance.now() / 55);
    ctx.globalAlpha = 0.65 + blink;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    roundRectCanvas(x - 4, y - 4, barW + 8, barH + 8, 8, false, true);
  }

  ctx.restore();
}

function roundRectCanvas(x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawOverlay() {
  if (inMenu) return;
  if (!paused && !gameOver) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.font = "900 64px system-ui";

  if (paused) {
    ctx.fillText("PAUSE", W / 2, H / 2 - 10);
    ctx.font = "400 18px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillText("Drücke P zum Fortsetzen", W / 2, H / 2 + 32);
  } else {
    ctx.fillText("GAME OVER", W / 2, H / 2 - 10);
    ctx.font = "400 18px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillText("Drücke R für Neustart (oder M fürs Menü)", W / 2, H / 2 + 32);
  }
  ctx.restore();
}

function draw() {
  drawBackground();
  if (!inMenu) {
    drawHpBar();
    drawTurret();
    drawBullets();
    drawMeteors();
    drawPowerups();
    drawParticles();
    drawOverlay();
  }
}

// -------------------- LOOP
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// -------------------- INIT
setupMenuUI();
showMenu();
applyDifficultyAndCharacter();
resetGameOnly();
requestAnimationFrame(loop);
