/* Đảo Đèn Lồng — 3D Third-Person WebGL Game (Phase 2: Ba Hòn Đảo · Contract v1.1)
 * Loads tuning dynamically from /game.contract.json (Single Source of Truth).
 */
(() => {
  const DT = 1 / 60;
  const JUMP_VEL = 7.0;
  const GRAVITY = 20.0;
  const CHARM_SPEED = 7.2;
  const CHARM_DURATION_TICKS = 600;
  const CHARM_RESPAWN_TICKS = 2700;
  const INITIAL_MOTES = 20;
  const MAX_MOTES = 30;
  const MOTE_SPAWN_TICKS = 240;
  const DROPPED_TTL_TICKS = 480;
  const SHADE_SPAWN_TICKS = 15;
  const SHADE_RECOIL_TICKS = 60;
  const PULSE_PUSH_TICKS = 15;
  const DRIFTER_SPAWN_TICKS = 1200;
  const DRIFTER_FLEE_TICKS = 240;
  const DRIFTER_DROP_FLEE_TICKS = 120;
  const FALL_Y = -10.0;
  const FALL_WAIT_TICKS = 60;
  const WIND_PERIOD_TICKS = 1800; // 30s
  const WIND_WARN_TICKS = 120;    // 2s warning before gust
  const WIND_DUR_TICKS = 300;     // 5s gust
  const WIND_PUSH_MPS = 2.0;

  // Standardized Palette (Ticket-02 Part 3.8)
  const PALETTE = {
    skyNight: 0x0e1430,
    fogNight: 0x1b2350,
    islandGrass: 0x2f5d50,
    islandSand: 0xc9b48a,
    woodBridge: 0x6b4a2f,
    cloudSea: 0x12384a,
    lanternLit: 0xffb347,
    safeZone: 0xffe9b0,
    lanternUnlit: 0x5b5f6e,
    moteLight: 0xfff6c2,
    pulseLight: 0xffe58a,
    shadeBody: 0x120a1a,
    shadeEye: 0x7a3cff,
    shadeStun: 0x3a3450,
    mayCloth: 0xe8e2d0,
    charmRed: 0xc8102e,
    gold: 0xf2c14e,
    drifter: 0x8fa3b8,
    danger: 0xff5a5f,
    text: 0xf5f1e6,
  };

  const NIGHT_INFO = {
    1: {
      name: "Đêm 1 · Đảo Bến",
      title: "Đêm 1 — Đảo Bến",
      quote: "“Mây ơi, sương mực vừa nuốt mất 5 ngọn đèn của Đảo Bến. Hãy gom đom đóm quanh bến gỗ và thắp sáng chúng trước khi trời rạng nhé!” — Ông Đăng",
      desc: "Hòn đảo tròn bán kính 40m giữa biển mây. Gom 10 đom đóm cho mỗi Đèn Lồng Lớn (5 đèn · 300 giây).",
    },
    2: {
      name: "Đêm 2 · Đảo Cau",
      title: "Đêm 2 — Đảo Cau",
      quote: "“Cây cầu tre nối hai bờ Đảo Cau đã hiện ra trong sương. Coi chừng lũ Gió Lạc thích cướp đom đóm, và hãy tận dụng Bệ Nhảy cùng Bùa Gió ở giữa cầu!” — Ông Đăng",
      desc: "Hai hòn đảo nối bằng cầu tre và 2 Bệ Nhảy Gió. Xuất hiện Gió Lạc cướp đom đóm và Bùa Gió tăng tốc (6 đèn · 330 giây).",
    },
    3: {
      name: "Đêm 3 · Đảo Chuông",
      title: "Đêm 3 — Đảo Chuông",
      quote: "“Đỉnh Tháp Chuông ở tầng cao nhất đang chờ ngọn lửa cuối cùng. Cẩn thận những cơn gió mạnh mỗi 30 giây trên vách đá 3 tầng!” — Ông Đăng",
      desc: "Đảo 3 tầng cao (0m · 3m · 6m) với 2 dốc đá, Bệ Nhảy lên Tháp Chuông và Gió Mạnh định kỳ (7 đèn · 360 giây).",
    },
  };

  // Persistent Settings in localStorage
  const SETTINGS_KEY = "dao_den_long_settings_v11";
  const settings = { volume: 0.8, mouseSens: 1.0 };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof saved.volume === "number") settings.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved.mouseSens === "number") settings.mouseSens = Math.max(0.3, Math.min(2.5, saved.mouseSens));
  } catch (_) {}

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  // Deterministic Mulberry32 matching src/core/rng.py
  class SeededRNG {
    constructor(seed) { this.s = seed >>> 0; }
    nextU32() {
      this.s = (this.s + 0x6d2b79f5) >>> 0;
      let t = this.s;
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
      return (t ^ (t >>> 14)) >>> 0;
    }
    random() { return this.nextU32() / 4294967296; }
    uniform(a, b) { return a + (b - a) * this.random(); }
  }

  // Procedural WebAudio sound effects
  class SoundFX {
    constructor() { this.ctx = null; this.muted = false; }
    ensure() {
      if (this.muted || settings.volume <= 0.001) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    tone(freq, dur, type = "sine", vol = 0.08, delay = 0) {
      const ctx = this.ensure();
      if (!ctx) return;
      const effVol = Math.max(0.0002, vol * settings.volume);
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(effVol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    pickup() { this.tone(660, 0.12, "sine", 0.07); this.tone(880, 0.16, "triangle", 0.06, 0.04); }
    charm() { [587, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.08, i * 0.05)); }
    dash() { this.tone(280, 0.12, "sine", 0.07); this.tone(420, 0.14, "triangle", 0.06, 0.03); }
    jumpPad() { this.tone(320, 0.18, "sine", 0.09); this.tone(640, 0.28, "triangle", 0.08, 0.06); }
    deposit() { this.tone(440, 0.14, "triangle", 0.08); this.tone(554, 0.18, "sine", 0.07, 0.05); }
    lanternLit() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.42, "sine", 0.09, i * 0.08)); }
    pulse() { this.tone(330, 0.32, "triangle", 0.11); this.tone(660, 0.38, "sine", 0.08, 0.04); }
    steal() { this.tone(480, 0.14, "sawtooth", 0.07); this.tone(320, 0.18, "sawtooth", 0.07, 0.06); }
    wind() { this.tone(190, 0.45, "sine", 0.05); this.tone(240, 0.45, "triangle", 0.04, 0.12); }
    countdownTick() { this.tone(920, 0.07, "sine", 0.06); }
    hit() { this.tone(170, 0.25, "sawtooth", 0.08); this.tone(125, 0.3, "triangle", 0.08, 0.07); }
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.55, "sine", 0.09, i * 0.1)); }
    lose() { [311, 277, 233, 185].forEach((f, i) => this.tone(f, 0.45, "triangle", 0.08, i * 0.13)); }
  }
  const sfx = new SoundFX();

  // DOM References
  const hudNightName = document.getElementById("hud-night-name");
  const hudFlames = document.getElementById("hud-flames");
  const hudCharmBadge = document.getElementById("hud-charm-badge");
  const hudCharmTime = document.getElementById("hud-charm-time");
  const hudWindBadge = document.getElementById("hud-wind-badge");
  const hudWindText = document.getElementById("hud-wind-text");
  const hudTime = document.getElementById("hud-time");
  const hudLanterns = document.getElementById("hud-lanterns");
  const hudScore = document.getElementById("hud-score");
  const hudCarried = document.getElementById("hud-carried");
  const hudMoteSlots = document.getElementById("hud-mote-slots");
  const hudDashBar = document.getElementById("hud-dash-bar");
  const hudDashText = document.getElementById("hud-dash-text");
  const hudPulseBar = document.getElementById("hud-pulse-bar");
  const hudPulseText = document.getElementById("hud-pulse-text");
  const promptBanner = document.getElementById("prompt-banner");
  const toastEl = document.getElementById("toast");
  const offscreenArrow = document.getElementById("offscreen-arrow");
  const offscreenLabel = document.getElementById("offscreen-label");

  const overlay = document.getElementById("overlay");
  const modalIcon = document.getElementById("modal-icon");
  const modalTitle = document.getElementById("modal-title");
  const modalQuote = document.getElementById("modal-quote");
  const modalDesc = document.getElementById("modal-desc");
  const nightSelector = document.getElementById("night-selector");
  const modalStats = document.getElementById("modal-stats");
  const btnPlay = document.getElementById("btn-play");
  const btnOpenSettingsMenu = document.getElementById("btn-open-settings-menu");
  const btnBackMenu = document.getElementById("btn-back-menu");

  const pauseOverlay = document.getElementById("pause-overlay");
  const pauseSubtitle = document.getElementById("pause-subtitle");
  const btnResume = document.getElementById("btn-resume");
  const btnRestartPause = document.getElementById("btn-restart-pause");
  const btnOpenSettingsPause = document.getElementById("btn-open-settings-pause");
  const btnPauseToMenu = document.getElementById("btn-pause-to-menu");

  const settingsOverlay = document.getElementById("settings-overlay");
  const sliderVolume = document.getElementById("slider-volume");
  const lblVolume = document.getElementById("lbl-volume");
  const sliderSens = document.getElementById("slider-sens");
  const lblSens = document.getElementById("lbl-sens");
  const btnCloseSettings = document.getElementById("btn-close-settings");

  const btnPauseHud = document.getElementById("btn-pause-hud");
  const btnMute = document.getElementById("btn-mute");

  // Initialize 10-slot mote bar
  const moteSlotEls = [];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement("div");
    d.className = "mote-slot";
    hudMoteSlots.appendChild(d);
    moteSlotEls.push(d);
  }

  let toastTimer = 0;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    toastTimer = 2.4;
  }

  // Three.js Scene Setup
  const wrap = document.getElementById("canvas-wrap");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyNight);
  scene.fog = new THREE.FogExp2(PALETTE.fogNight, 0.015);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 280);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0x8fa3b8, PALETTE.skyNight, 0.15);
  scene.add(hemiLight);

  const moonLight = new THREE.DirectionalLight(0xc8d8f0, 0.42);
  moonLight.position.set(-28, 48, -22);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = -65;
  moonLight.shadow.camera.right = 95;
  moonLight.shadow.camera.top = 65;
  moonLight.shadow.camera.bottom = -65;
  scene.add(moonLight);

  // Starfield sky dome
  const starPos = [];
  const starRng = new SeededRNG(1212);
  for (let i = 0; i < 420; i++) {
    const u = starRng.uniform(-1, 1);
    const phi = starRng.uniform(0, Math.PI * 2);
    const r = 155;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.abs(u) * r + 10;
    starPos.push(r * s * Math.cos(phi), y, r * s * Math.sin(phi));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: PALETTE.moteLight, size: 0.8, transparent: true, opacity: 0.85 })
  );
  scene.add(stars);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const entitiesGroup = new THREE.Group();
  scene.add(entitiesGroup);

  // Wind leaf particles for Night 3
  const windLeavesGroup = new THREE.Group();
  const leafMeshes = [];
  const leafGeo = new THREE.PlaneGeometry(0.28, 0.14);
  const leafMat = new THREE.MeshBasicMaterial({ color: PALETTE.safeZone, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 36; i++) {
    const lf = new THREE.Mesh(leafGeo, leafMat);
    lf.position.set((i % 6 - 2.5) * 4, 1.2 + (i % 4) * 0.7, (Math.floor(i / 6) - 2.5) * 4);
    windLeavesGroup.add(lf);
    leafMeshes.push(lf);
  }
  windLeavesGroup.visible = false;
  scene.add(windLeavesGroup);

  // Helper to build circular points matching src/core/engine.py
  function circlePoints(cx, cz, y, radius, anglesDeg) {
    return anglesDeg.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return [
        Math.round((cx + radius * Math.cos(rad)) * 1000) / 1000,
        Math.round(y * 1000) / 1000,
        Math.round((cz + radius * Math.sin(rad)) * 1000) / 1000,
      ];
    });
  }

  // Build Mây (cloak & nón lá in #E8E2D0 + mini lantern)
  function buildPlayerMesh() {
    const g = new THREE.Group();
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 1.25, 14),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayCloth, roughness: 0.78 })
    );
    cloak.position.y = 0.65;
    cloak.castShadow = true;
    g.add(cloak);

    const sash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.42, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.charmRed, roughness: 0.6 })
    );
    sash.position.y = 0.72;
    g.add(sash);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 14, 14),
      new THREE.MeshStandardMaterial({ color: PALETTE.safeZone, roughness: 0.65 })
    );
    head.position.y = 1.45;
    head.castShadow = true;
    g.add(head);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.74, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayCloth, roughness: 0.82 })
    );
    hat.position.y = 1.78;
    hat.castShadow = true;
    g.add(hat);

    const miniPivot = new THREE.Group();
    miniPivot.position.set(0.56, 1.56, 0.18);
    const miniOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.moteLight,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 2.0,
      })
    );
    miniOrb.position.y = -0.22;
    miniPivot.add(miniOrb);

    const playerLight = new THREE.PointLight(PALETTE.lanternLit, 1.7, 13);
    playerLight.position.y = -0.22;
    miniPivot.add(playerLight);

    g.add(miniPivot);
    g.userData.miniPivot = miniPivot;
    g.userData.playerLight = playerLight;
    return g;
  }

  function buildLanternMesh(safeRadius) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 3.0, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.woodBridge, roughness: 0.88 })
    );
    post.position.y = 1.5;
    post.castShadow = true;
    g.add(post);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: PALETTE.charmRed, roughness: 0.7 })
    );
    cap.position.y = 3.75;
    g.add(cap);

    const coreMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternUnlit,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.08,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 1.05, 8), coreMat);
    core.position.y = 3.05;
    g.add(core);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0.0, 26);
    light.position.y = 3.3;
    g.add(light);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(safeRadius - 0.16, safeRadius, 48),
      new THREE.MeshBasicMaterial({
        color: PALETTE.safeZone,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.9, 24, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: PALETTE.safeZone,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.y = 14.5;
    g.add(beam);

    g.userData = { coreMat, light, ring, beam };
    return g;
  }

  function buildShadeMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeBody,
      emissive: 0x1a0e2e,
      emissiveIntensity: 0.8,
      roughness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 12), bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    g.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeEye });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), eyeMat);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), eyeMat);
    eyeL.position.set(-0.16, 1.05, 0.42);
    eyeR.position.set(0.16, 1.05, 0.42);
    g.add(eyeL, eyeR);

    g.userData = { bodyMat, eyeMat };
    return g;
  }

  function buildDrifterMesh() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 1),
      new THREE.MeshStandardMaterial({
        color: PALETTE.drifter,
        emissive: PALETTE.drifter,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.86,
      })
    );
    core.position.y = 0.9;
    g.add(core);

    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteLight })
    );
    swirl.rotation.x = Math.PI / 2;
    swirl.position.y = 0.9;
    g.add(swirl);
    g.userData = { swirl };
    return g;
  }

  function buildCharmMesh() {
    const g = new THREE.Group();
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.75, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.charmRed,
        emissive: PALETTE.charmRed,
        emissiveIntensity: 0.85,
      })
    );
    card.position.y = 1.0;
    g.add(card);

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold })
    );
    trim.position.y = 1.0;
    g.add(trim);
    return g;
  }

  function buildMoteMesh(kind) {
    const isDropped = kind === "dropped";
    return new THREE.Mesh(
      new THREE.SphereGeometry(isDropped ? 0.22 : 0.25, 10, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.moteLight,
        emissive: isDropped ? PALETTE.lanternLit : PALETTE.pulseLight,
        emissiveIntensity: 1.9,
      })
    );
  }

  function buildJumpPadMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.22, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.woodBridge, roughness: 0.8 })
    );
    base.position.y = 0.11;
    g.add(base);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.92, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.23;
    g.add(glow);
    return g;
  }

  // Build 3D island environment for Night 1, 2, or 3
  function buildIslandEnvironment(night) {
    while (worldGroup.children.length > 0) {
      worldGroup.remove(worldGroup.children[0]);
    }

    const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.islandGrass, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.islandSand, roughness: 0.92 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodBridge, roughness: 0.85 });
    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      emissive: 0x091d28,
      roughness: 1.0,
      transparent: true,
      opacity: 0.76,
    });

    if (night === 1) {
      const grass = new THREE.Mesh(new THREE.CylinderGeometry(38.8, 39.5, 1.8, 48), grassMat);
      grass.position.y = -0.9;
      grass.receiveShadow = true;
      worldGroup.add(grass);

      const sand = new THREE.Mesh(new THREE.CylinderGeometry(40.0, 42.0, 2.2, 48), sandMat);
      sand.position.y = -1.15;
      sand.receiveShadow = true;
      worldGroup.add(sand);

      const pier = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.35, 9.0), woodMat);
      pier.position.set(0, 0.1, 36.5);
      pier.receiveShadow = true;
      worldGroup.add(pier);
    } else if (night === 2) {
      for (const cx of [0, 70]) {
        const grass = new THREE.Mesh(new THREE.CylinderGeometry(26.8, 27.4, 1.8, 44), grassMat);
        grass.position.set(cx, -0.9, 0);
        grass.receiveShadow = true;
        worldGroup.add(grass);

        const sand = new THREE.Mesh(new THREE.CylinderGeometry(28.0, 29.8, 2.2, 44), sandMat);
        sand.position.set(cx, -1.15, 0);
        sand.receiveShadow = true;
        worldGroup.add(sand);
      }
      // Bamboo bridge x in [26, 44], z in [-2, 2]
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.32, 4.0), woodMat);
      bridge.position.set(35.0, -0.14, 0);
      bridge.receiveShadow = true;
      worldGroup.add(bridge);

      // 2 Jump pads at (20,0,18) and (50,0,-18)
      const jp1 = buildJumpPadMesh();
      jp1.position.set(20, 0, 18);
      const jp2 = buildJumpPadMesh();
      jp2.position.set(50, 0, -18);
      worldGroup.add(jp1, jp2);
    } else {
      // Night 3: Đảo Chuông (r=45m, 3 tiers + 2 ramps + Jump pad + Bell Tower)
      const t0 = new THREE.Mesh(new THREE.CylinderGeometry(43.8, 44.5, 1.8, 56), grassMat);
      t0.position.y = -0.9;
      t0.receiveShadow = true;
      worldGroup.add(t0);

      const sand = new THREE.Mesh(new THREE.CylinderGeometry(45.0, 47.0, 2.2, 56), sandMat);
      sand.position.y = -1.15;
      worldGroup.add(sand);

      // Tier 1: half-annulus 12 <= r <= 24, z > 0 at Y=3
      const shape1 = new THREE.Shape();
      shape1.absarc(0, 0, 24.0, 0, Math.PI, false);
      shape1.lineTo(-12.0, 0);
      shape1.absarc(0, 0, 12.0, Math.PI, 0, true);
      shape1.closePath();
      const extrude1 = new THREE.ExtrudeGeometry(shape1, { depth: 3.0, bevelEnabled: false, curveSegments: 32 });
      const tier1Mesh = new THREE.Mesh(extrude1, grassMat);
      tier1Mesh.rotation.x = Math.PI / 2;
      tier1Mesh.position.y = 3.0;
      tier1Mesh.receiveShadow = true;
      tier1Mesh.castShadow = true;
      worldGroup.add(tier1Mesh);

      // 2 Ramps at 30° and 150° from r=30 (Y=0) to r=24 (Y=3), width 3m
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uz = Math.sin(rad);
        const rampLen = Math.hypot(6.0, 3.0);
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.35, 3.0), woodMat);
        ramp.position.set(ux * 27.0, 1.45, uz * 27.0);
        ramp.rotation.y = -rad;
        ramp.rotation.z = -Math.atan2(3.0, 6.0);
        ramp.receiveShadow = true;
        worldGroup.add(ramp);
      }

      // Tier 2: disc r <= 8m at Y=6
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8.0, 8.2, 6.0, 32), grassMat);
      t2.position.y = 3.0;
      t2.receiveShadow = true;
      t2.castShadow = true;
      worldGroup.add(t2);

      // Jump Pad on Tier 1 at (0, 3, 13)
      const jp3 = buildJumpPadMesh();
      jp3.position.set(0, 3.0, 13.0);
      worldGroup.add(jp3);

      // Bell Tower at (0, 6, 0) (r=2m, h=8m)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.0, 8.0, 16), woodMat);
      tower.position.set(0, 10.0, 0);
      tower.castShadow = true;
      worldGroup.add(tower);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(3.1, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.charmRed, roughness: 0.7 })
      );
      roof.position.set(0, 15.0, 0);
      worldGroup.add(roof);

      const bell = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 1.3, 14),
        new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.65, roughness: 0.3 })
      );
      bell.position.set(0, 12.6, 0);
      worldGroup.add(bell);
    }

    // Cloud sea ring around island(s)
    const cxCenter = night === 2 ? 35 : 0;
    const cloudRadius = night === 2 ? 78 : 54;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = cloudRadius + (i % 3) * 6;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(3.8 + (i % 4), 1), cloudMat);
      puff.position.set(cxCenter + Math.cos(a) * r, -3.2 - (i % 2) * 1.4, Math.sin(a) * r);
      puff.scale.set(1.7, 0.55, 1.35);
      worldGroup.add(puff);
    }
  }

  const playerMesh = buildPlayerMesh();
  scene.add(playerMesh);

  // Pulse wave visual ring
  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.55, 36),
    new THREE.MeshBasicMaterial({
      color: PALETTE.pulseLight,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    })
  );
  pulseRing.rotation.x = -Math.PI / 2;
  scene.add(pulseRing);
  let pulseAnim = 0;

  // Input Handling (WASD, Space Jump, Shift Dash, E/F Interact, Q/RightClick Pulse, Esc/P Pause)
  const keys = {};
  const edge = { jump: false, dash: false, interact: false, pulse: false };
  let camYawDeg = 0;
  let camPitch = 0.44;
  let dragging = false;
  let lastMouseX = 0;

  window.addEventListener("keydown", (e) => {
    const code = e.code;
    if (!keys[code]) {
      if (code === "Space") edge.jump = true;
      if (code === "ShiftLeft" || code === "ShiftRight") edge.dash = true;
      if (code === "KeyE" || code === "KeyF") edge.interact = true;
      if (code === "KeyQ" || code === "KeyX") edge.pulse = true;
      if (code === "Escape" || code === "KeyP") togglePause();
      if (code === "KeyM") toggleMute();
    }
    keys[code] = true;
  });

  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  renderer.domElement.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    edge.pulse = true;
  });
  renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      dragging = true;
      lastMouseX = e.clientX;
    } else if (e.button === 2) {
      edge.pulse = true;
    }
  });
  window.addEventListener("mouseup", () => { dragging = false; });
  window.addEventListener("mousemove", (e) => {
    if (dragging) {
      const dx = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      camYawDeg = (camYawDeg + dx * 0.35 * settings.mouseSens) % 360;
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Game & Campaign State
  let contract = null;
  let game = null;
  let selectedNight = 1;
  let campaignScores = { 1: 0, 2: 0, 3: 0 };
  let modalMode = "menu"; // "menu" | "intro" | "playing" | "paused" | "won" | "lost" | "dawn"
  let lastCountdownSec = -1;

  function clearEntities() {
    while (entitiesGroup.children.length > 0) {
      entitiesGroup.remove(entitiesGroup.children[0]);
    }
  }

  function defaultLanternCoords(night) {
    if (night === 1) {
      return [
        ["L1", 0.0, 0.0, 25.0],
        ["L2", 23.8, 0.0, 7.7],
        ["L3", 14.7, 0.0, -20.2],
        ["L4", -14.7, 0.0, -20.2],
        ["L5", -23.8, 0.0, 7.7],
      ];
    }
    if (night === 2) {
      return [
        ["L1", 0.0, 0.0, 20.0],
        ["L2", 17.0, 0.0, -10.0],
        ["L3", -17.0, 0.0, -10.0],
        ["L4", 70.0, 0.0, 20.0],
        ["L5", 87.0, 0.0, -10.0],
        ["L6", 53.0, 0.0, -10.0],
      ];
    }
    return [
      ["L1", 0.0, 6.0, 6.0],
      ["L2", 18.0, 3.0, 10.0],
      ["L3", -18.0, 3.0, 10.0],
      ["L4", 35.0, 0.0, -10.0],
      ["L5", -35.0, 0.0, -10.0],
      ["L6", 20.0, 0.0, -35.0],
      ["L7", -20.0, 0.0, -35.0],
    ];
  }

  function buildMoteSpawnPoints(night) {
    if (night === 1) {
      return [
        ...circlePoints(0, 0, 0, 12.0, Array.from({ length: 8 }, (_, i) => i * 45)),
        ...circlePoints(0, 0, 0, 33.0, Array.from({ length: 16 }, (_, i) => i * 22.5)),
      ];
    }
    if (night === 2) {
      const pts = [];
      for (const cx of [0, 70]) {
        pts.push(...circlePoints(cx, 0, 0, 10.0, [0, 90, 180, 270]));
        pts.push(...circlePoints(cx, 0, 0, 22.0, Array.from({ length: 8 }, (_, i) => i * 45)));
      }
      return pts;
    }
    return [
      ...circlePoints(0, 0, 0, 34.0, Array.from({ length: 18 }, (_, i) => i * 20)),
      ...circlePoints(0, 0, 3, 18.0, Array.from({ length: 8 }, (_, i) => (i + 1) * 20)),
      ...circlePoints(0, 0, 6, 5.0, [45, 135, 225, 315]),
    ];
  }

  function buildShadeSpawnPoints(night) {
    if (night === 1) {
      return circlePoints(0, 0, 0, 37.0, Array.from({ length: 12 }, (_, i) => 15 + i * 30));
    }
    if (night === 2) {
      const pts = [];
      for (const cx of [0, 70]) {
        pts.push(...circlePoints(cx, 0, 0, 26.0, Array.from({ length: 8 }, (_, i) => 22.5 + i * 45)));
      }
      return pts;
    }
    return circlePoints(0, 0, 0, 43.0, Array.from({ length: 16 }, (_, i) => i * 22.5));
  }

  function initNight(night, seed = 42 + night) {
    selectedNight = night;
    clearEntities();
    buildIslandEnvironment(night);

    const t = contract.tuning;
    const rng = new SeededRNG(seed);
    const durS = t[`night${night}_duration_s`] || t.night1_duration_s;

    const lanterns = defaultLanternCoords(night).map(([id, x, y, z]) => {
      const mesh = buildLanternMesh(t.safe_radius);
      mesh.position.set(x, y, z);
      entitiesGroup.add(mesh);
      return { id, x, y, z, deposited: 0, lit: false, mesh };
    });

    const moteSpawnPoints = buildMoteSpawnPoints(night);
    const shadeSpawnPoints = buildShadeSpawnPoints(night);

    const charms = [];
    if (night === 2) {
      const m = buildCharmMesh();
      m.position.set(35, 0, 0);
      entitiesGroup.add(m);
      charms.push({ id: "C1", x: 35, y: 0, z: 0, available: true, respawnTicks: 0, mesh: m });
    } else if (night === 3) {
      for (const [id, x, y, z] of [["C1", 30, 0, 25], ["C2", -30, 0, 25]]) {
        const m = buildCharmMesh();
        m.position.set(x, y, z);
        entitiesGroup.add(m);
        charms.push({ id, x, y, z, available: true, respawnTicks: 0, mesh: m });
      }
    }

    game = {
      night,
      rng,
      tick: 0,
      simTick: 0,
      state: "playing",
      initialTimeS: durS,
      timeLeftS: durS,
      score: 0,
      windActive: false,
      windWarn: false,
      windDirDeg: 0,
      player: {
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        facingX: 0, facingZ: 1,
        grounded: true,
        flames: t.flames,
        carried: 0,
        invulnTicks: 0,
        dashCdTicks: 0,
        dashTicksLeft: 0,
        dashDirX: 0,
        dashDirZ: 1,
        pulseCdTicks: 0,
        charmTicks: 0,
        fallWaitTicks: 0,
        launchActive: false,
        launchVx: 0,
        launchVz: 0,
      },
      lanterns,
      moteSpawnPoints,
      shadeSpawnPoints,
      motes: [],
      shades: [],
      drifters: [],
      charms,
      nextMoteSeq: 1,
      nextShadeSeq: 1,
      nextDrifterSeq: 1,
    };

    // Spawn 20 initial motes at distinct spawn points
    const indices = moteSpawnPoints.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }
    for (let k = 0; k < Math.min(INITIAL_MOTES, indices.length); k++) {
      const [x, y, z] = moteSpawnPoints[indices[k]];
      spawnMoteAt(x, y, z, "random", null);
    }

    hudNightName.textContent = NIGHT_INFO[night].name;
    lastCountdownSec = -1;
    updateHUD();
  }

  function spawnMoteAt(x, y, z, kind = "random", ttlTicks = null) {
    const id = `M${game.nextMoteSeq++}`;
    const mesh = buildMoteMesh(kind);
    mesh.position.set(x, y + 0.55, z);
    entitiesGroup.add(mesh);
    game.motes.push({ id, x, y, z, kind, ttlTicks, active: true, mesh });
  }

  function spawnScheduledMote() {
    const activeCount = game.motes.filter((m) => m.active).length;
    if (activeCount >= MAX_MOTES) return;
    const occupied = new Set(game.motes.filter((m) => m.active).map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)},${m.z.toFixed(2)}`));
    const empty = game.moteSpawnPoints.filter((pt) => !occupied.has(`${pt[0].toFixed(2)},${pt[1].toFixed(2)},${pt[2].toFixed(2)}`));
    if (!empty.length) return;
    const pt = empty[Math.floor(game.rng.random() * empty.length)];
    spawnMoteAt(pt[0], pt[1], pt[2], "random", null);
  }

  function maxShadesForNight(n) { return n === 1 ? 6 : (n === 2 ? 8 : 10); }
  function shadeIntervalForNight(n) { return n === 1 ? 480 : (n === 2 ? 420 : 360); }

  function spawnScheduledShade() {
    if (game.shades.length >= maxShadesForNight(game.night)) return;
    const safeR = contract.tuning.safe_radius;
    const pl = game.player;
    const valid = game.shadeSpawnPoints.filter((pt) => {
      if (Math.hypot(pt[0] - pl.x, pt[2] - pl.z) < 15.0) return false;
      if (game.lanterns.some((l) => l.lit && Math.hypot(pt[0] - l.x, pt[2] - l.z) < safeR)) return false;
      if (game.shades.some((s) => Math.hypot(pt[0] - s.x, pt[2] - s.z) < 1.0)) return false;
      return true;
    });
    if (!valid.length) return;
    const pt = valid[Math.floor(game.rng.random() * valid.length)];
    const id = `S${game.nextShadeSeq++}`;
    const mesh = buildShadeMesh();
    mesh.position.set(pt[0], pt[1], pt[2]);
    entitiesGroup.add(mesh);
    game.shades.push({
      id, x: pt[0], y: pt[1], z: pt[2],
      state: "spawning",
      stateTicksLeft: SHADE_SPAWN_TICKS,
      pushTicksLeft: 0,
      pushDirX: 1, pushDirZ: 0,
      recoilDirX: 1, recoilDirZ: 0,
      inSafeZone: false,
      wanderAngle: game.rng.uniform(0, Math.PI * 2),
      mesh,
    });
  }

  function spawnScheduledDrifter() {
    const active = game.drifters.filter((d) => d.state !== "removed");
    if (active.length >= 2) return;
    const pt = game.shadeSpawnPoints[Math.floor(game.rng.random() * game.shadeSpawnPoints.length)];
    const id = `D${game.nextDrifterSeq++}`;
    const mesh = buildDrifterMesh();
    mesh.position.set(pt[0], pt[1], pt[2]);
    entitiesGroup.add(mesh);
    game.drifters.push({
      id, x: pt[0], y: pt[1], z: pt[2],
      state: "idle",
      stolen: 0,
      hasStolen: false,
      stateTicksLeft: 0,
      fleeDirX: 1, fleeDirZ: 0,
      idleAngle: game.rng.uniform(0, Math.PI * 2),
      mesh,
    });
  }

  // Night 1, 2, 3 Terrain & Cliff helpers (matching src/core/engine.py)
  function rampHeightNight3(x, z) {
    for (const deg of [30, 150]) {
      const rad = (deg * Math.PI) / 180;
      const ux = Math.cos(rad), uz = Math.sin(rad);
      const proj = x * ux + z * uz;
      const perp = Math.abs(-x * uz + z * ux);
      if (proj >= 24.0 && proj <= 30.0 && perp <= 1.5) {
        return (3.0 * (30.0 - proj)) / 6.0;
      }
    }
    return null;
  }

  function surfaceHeightAt(night, x, z, curY) {
    if (night === 1) {
      return Math.hypot(x, z) <= 40.0 ? 0.0 : null;
    }
    if (night === 2) {
      if (Math.hypot(x, z) <= 28.0) return 0.0;
      if (Math.hypot(x - 70.0, z) <= 28.0) return 0.0;
      if (x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0) return 0.0;
      return null;
    }
    const r = Math.hypot(x, z);
    if (r > 45.0) return null;
    if (r <= 8.0 && curY >= 5.55) return 6.0;
    const rh = rampHeightNight3(x, z);
    if (rh !== null && curY >= rh - 0.65) return rh;
    if (r >= 12.0 && r <= 24.0 && z >= 0 && curY >= 2.45) return 3.0;
    return 0.0;
  }

  function isBlockedByCliffOrTower(night, oldX, oldZ, newX, newZ, y) {
    if (night !== 3) return false;
    const rNew = Math.hypot(newX, newZ);
    if (y >= 5.5 && rNew < 2.0) return true; // Bell Tower
    if (y < 5.6 && rNew < 8.0 && Math.hypot(oldX, oldZ) >= 8.0) return true;
    if (y < 2.6 && rNew > 12.0 && rNew < 24.0 && newZ > 0) {
      if (rampHeightNight3(newX, newZ) === null && rampHeightNight3(oldX, oldZ) === null) {
        const rOld = Math.hypot(oldX, oldZ);
        if (!(rOld >= 12.0 && rOld <= 24.0 && oldZ > 0)) return true;
      }
    }
    return false;
  }

  function scatterDroppedMotes(cx, cy, cz, count, radius = 2.0) {
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / Math.max(1, count);
      const r = count === 1 ? radius : (1.5 + (i % 2) * 0.8);
      spawnMoteAt(cx + r * Math.cos(a), Math.max(0, cy), cz + r * Math.sin(a), "dropped", DROPPED_TTL_TICKS);
    }
  }

  // Mandatory 12-Step Simulation Tick (Contract v1.1)
  function stepSimulation() {
    if (!game || game.state !== "playing") return;
    const t = contract.tuning;
    const pl = game.player;

    game.tick += 1;
    game.simTick += 1;

    // Step 2: Decrement counters
    game.timeLeftS = Math.max(0, game.initialTimeS - game.simTick / 60);
    if (pl.dashCdTicks > 0) pl.dashCdTicks -= 1;
    if (pl.pulseCdTicks > 0) pl.pulseCdTicks -= 1;
    if (pl.invulnTicks > 0) pl.invulnTicks -= 1;
    if (pl.charmTicks > 0) {
      pl.charmTicks -= 1;
      pl.dashCdTicks = 0;
    }

    for (const sh of game.shades) {
      if (sh.stateTicksLeft > 0) sh.stateTicksLeft -= 1;
    }
    for (const dr of game.drifters) {
      if (dr.stateTicksLeft > 0) dr.stateTicksLeft -= 1;
    }
    for (const m of game.motes) {
      if (m.active && m.ttlTicks !== null) {
        m.ttlTicks -= 1;
        if (m.ttlTicks <= 0) {
          m.active = false;
          m.mesh.visible = false;
        }
      }
    }
    for (const c of game.charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks <= 0) {
          c.available = true;
          c.mesh.visible = true;
        }
      }
    }

    if (pl.fallWaitTicks > 0) {
      pl.fallWaitTicks -= 1;
      if (pl.fallWaitTicks === 0 && pl.flames > 0) {
        pl.x = 0; pl.y = 0; pl.z = 0;
        pl.vx = 0; pl.vy = 0; pl.vz = 0;
        pl.facingX = 0; pl.facingZ = 1;
        pl.grounded = true;
        pl.invulnTicks = Math.round(t.invuln_s * 60);
        showToast("Mây đã hồi sinh tại tâm đảo!");
      }
    }

    // Night 3 Strong Wind (every 30s lasts 5s, with 2s warning)
    if (game.night === 3) {
      const mod = game.simTick % WIND_PERIOD_TICKS;
      if (game.simTick >= WIND_PERIOD_TICKS - WIND_WARN_TICKS && mod === WIND_PERIOD_TICKS - WIND_WARN_TICKS) {
        game.windDirDeg = Math.round(game.rng.uniform(0, 360));
        showToast("🍃 Gió mạnh sắp thổi qua Đảo Chuông!");
      }
      game.windWarn = game.simTick >= WIND_PERIOD_TICKS - WIND_WARN_TICKS && mod >= WIND_PERIOD_TICKS - WIND_WARN_TICKS;
      const wasWind = game.windActive;
      game.windActive = game.simTick >= WIND_PERIOD_TICKS && mod < WIND_DUR_TICKS;
      if (game.windActive && !wasWind) sfx.wind();
    } else {
      game.windActive = false;
      game.windWarn = false;
    }

    // Countdown tick sound in last 10s
    const secCeil = Math.ceil(game.timeLeftS);
    if (secCeil <= 10 && secCeil > 0 && secCeil !== lastCountdownSec) {
      lastCountdownSec = secCeil;
      sfx.countdownTick();
    }

    // Step 1/3: Input & Player Movement
    if ( keys["KeyQ"] && !edge.pulse && false ) {} // Q is Pulse; camera rotates with mouse or ArrowLeft/Right
    if (keys["BracketLeft"]) camYawDeg = (camYawDeg - 95 * DT) % 360;
    if (keys["BracketRight"]) camYawDeg = (camYawDeg + 95 * DT) % 360;

    // In Three.js right-handed coordinates with camera looking along +Z at yaw=0,
    // screen-left is +X (mx = +1) and screen-right is -X (mx = -1)
    let mx = 0, mz = 0;
    if (keys["KeyA"] || keys["ArrowLeft"]) mx += 1;
    if (keys["KeyD"] || keys["ArrowRight"]) mx -= 1;
    if (keys["KeyW"] || keys["ArrowUp"]) mz += 1;
    if (keys["KeyS"] || keys["ArrowDown"]) mz -= 1;

    const justJump = edge.jump; edge.jump = false;
    const justDash = edge.dash; edge.dash = false;
    const justInteract = edge.interact; edge.interact = false;
    const justPulse = edge.pulse; edge.pulse = false;

    if (pl.fallWaitTicks === 0) {
      const theta = (camYawDeg * Math.PI) / 180;
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      let wx = mx * cosT + mz * sinT;
      let wz = -mx * sinT + mz * cosT;
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
      if (len > 1e-6) { pl.facingX = wx / len; pl.facingZ = wz / len; }

      const dashDurTicks = Math.round((t.dash_duration_s || 0.2) * 60);
      const dashCdCfg = Math.round((t.dash_cooldown_s || 1.5) * 60);
      if (justDash && pl.dashTicksLeft === 0 && (pl.dashCdTicks === 0 || pl.charmTicks > 0)) {
        pl.dashTicksLeft = dashDurTicks;
        pl.dashCdTicks = pl.charmTicks > 0 ? 0 : dashCdCfg;
        pl.dashDirX = len > 1e-6 ? wx / len : pl.facingX;
        pl.dashDirZ = len > 1e-6 ? wz / len : pl.facingZ;
        pl.vy = 0;
        pl.launchActive = false;
        sfx.dash();
      }

      const dashing = pl.dashTicksLeft > 0;
      let vx = 0, vz = 0;
      if (dashing) {
        const dSpeed = t.dash_speed || 14.0;
        vx = pl.dashDirX * dSpeed;
        vz = pl.dashDirZ * dSpeed;
        pl.dashTicksLeft -= 1;
        pl.vy = 0;
      } else if (pl.launchActive) {
        vx = pl.launchVx;
        vz = pl.launchVz;
      } else {
        const spd = pl.charmTicks > 0 ? CHARM_SPEED : t.player_speed;
        vx = wx * spd;
        vz = wz * spd;
      }

      if (game.windActive && !dashing && !pl.launchActive) {
        const wrad = (game.windDirDeg * Math.PI) / 180;
        vx += WIND_PUSH_MPS * Math.cos(wrad);
        vz += WIND_PUSH_MPS * Math.sin(wrad);
      }

      const oldX = pl.x, oldZ = pl.z;
      let newX = oldX + vx * DT;
      let newZ = oldZ + vz * DT;
      if (isBlockedByCliffOrTower(game.night, oldX, oldZ, newX, newZ, pl.y)) {
        newX = oldX; newZ = oldZ; vx = 0; vz = 0;
      }
      pl.x = newX; pl.z = newZ; pl.vx = vx; pl.vz = vz;

      if (!dashing) {
        if (justJump && pl.grounded) {
          pl.vy = JUMP_VEL;
          pl.grounded = false;
        }
        const surf = surfaceHeightAt(game.night, pl.x, pl.z, pl.y);
        if (pl.grounded && surf !== null && Math.abs(pl.y - surf) <= 0.65) {
          pl.y = surf;
          pl.vy = 0;
        } else {
          pl.grounded = false;
          const prevY = pl.y;
          pl.y += pl.vy * DT;
          pl.vy -= GRAVITY * DT;
          const surfAfter = surfaceHeightAt(game.night, pl.x, pl.z, Math.max(prevY, pl.y));
          if (surfAfter !== null && pl.vy <= 0 && prevY >= surfAfter - 0.15 && pl.y <= surfAfter) {
            pl.y = surfAfter;
            pl.vy = 0;
            pl.grounded = true;
            pl.launchActive = false;
          }
        }
      }

      // Check Jump Pads
      if (!pl.launchActive) {
        if (game.night === 2 && Math.abs(pl.y) <= 0.35) {
          for (const [px, pz, tx, tz] of [[20, 18, 70, 0], [50, -18, 0, 0]]) {
            if (Math.hypot(pl.x - px, pl.z - pz) <= 1.0) {
              const dx = tx - pl.x, dz = tz - pl.z;
              const d = Math.hypot(dx, dz) || 1;
              pl.launchVx = (dx / d) * 24.0;
              pl.launchVz = (dz / d) * 24.0;
              pl.vy = 14.0;
              pl.grounded = false;
              pl.launchActive = true;
              pl.dashTicksLeft = 0;
              sfx.jumpPad();
              showToast("🌀 Bệ Nhảy Gió phóng Mây sang đảo đối diện!");
              break;
            }
          }
        } else if (game.night === 3 && Math.abs(pl.y - 3.0) <= 0.35) {
          if (Math.hypot(pl.x - 0, pl.z - 13) <= 1.0) {
            pl.launchVx = 0;
            pl.launchVz = -8.0;
            pl.vy = 12.0;
            pl.grounded = false;
            pl.launchActive = true;
            pl.dashTicksLeft = 0;
            sfx.jumpPad();
            showToast("🌀 Bệ Nhảy đưa Mây lên Tầng 2 — Tháp Chuông!");
          }
        }
      }

      // Check Fall off island (Y < -10)
      if (pl.y < FALL_Y) {
        pl.carried = 0;
        pl.flames = Math.max(0, pl.flames - 1);
        pl.vx = pl.vy = pl.vz = 0;
        pl.launchActive = false;
        pl.dashTicksLeft = 0;
        sfx.hit();
        if (pl.flames > 0) {
          pl.fallWaitTicks = FALL_WAIT_TICKS;
          showToast("⚠ Mây rơi khỏi đảo! Mất 1 Ngọn lửa & toàn bộ đom đóm mang theo.");
        }
      }
    }

    // Step 4: Pick up motes and charms
    if (pl.fallWaitTicks === 0) {
      for (const m of game.motes) {
        if (pl.carried >= t.carry_capacity) break;
        if (!m.active) continue;
        if (Math.hypot(pl.x - m.x, pl.z - m.z) <= t.pickup_radius && Math.abs(pl.y - m.y) <= 1.5) {
          m.active = false;
          m.mesh.visible = false;
          pl.carried += 1;
          sfx.pickup();
        }
      }
      for (const c of game.charms) {
        if (!c.available) continue;
        if (Math.hypot(pl.x - c.x, pl.z - c.z) <= t.pickup_radius && Math.abs(pl.y - c.y) <= 1.5) {
          c.available = false;
          c.mesh.visible = false;
          c.respawnTicks = CHARM_RESPAWN_TICKS;
          pl.charmTicks = CHARM_DURATION_TICKS;
          pl.dashCdTicks = 0;
          sfx.charm();
          showToast("🎐 Nhặt Bùa Gió! Tốc độ 7.2 m/s & Lướt không tốn hồi chiêu trong 10s!");
        }
      }
    }

    // Step 5: Interact with lantern
    if (justInteract && pl.fallWaitTicks === 0 && pl.carried > 0) {
      const candidates = game.lanterns
        .filter((l) => !l.lit && Math.hypot(pl.x - l.x, pl.z - l.z) <= t.interact_radius && Math.abs(pl.y - l.y) <= 2.5)
        .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z) || a.id.localeCompare(b.id));
      if (candidates.length > 0) {
        const target = candidates[0];
        const needed = Math.max(0, t.lantern_cost - target.deposited);
        const amount = Math.min(pl.carried, needed);
        if (amount > 0) {
          pl.carried -= amount;
          target.deposited += amount;
          game.score += amount * t.score.per_mote;
          if (target.deposited >= t.lantern_cost) {
            target.lit = true;
            game.score += t.score.per_lantern;
            sfx.lanternLit();
            showToast(`🏮 Đèn Lồng ${target.id} đã bừng sáng! (+${t.score.per_lantern} điểm)`);
          } else {
            sfx.deposit();
            showToast(`Đã nạp ${amount} đom đóm vào ${target.id} (${target.deposited}/${t.lantern_cost})`);
          }
        }
      }
    }

    // Step 6: Update safe zones
    const safeR = t.safe_radius;
    const litLanterns = game.lanterns.filter((l) => l.lit);
    const pushPerTick = Math.max(t.shade_speed * DT, safeR / 30.0);
    for (const sh of game.shades) {
      sh.inSafeZone = false;
      for (const lan of litLanterns) {
        const dx = sh.x - lan.x, dz = sh.z - lan.z;
        const d = Math.hypot(dx, dz);
        if (d < safeR) {
          sh.inSafeZone = true;
          const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
          const nd = Math.min(safeR, d + pushPerTick);
          sh.x = lan.x + ux * nd;
          sh.z = lan.z + uz * nd;
        }
      }
    }

    // Step 7: Light Pulse
    if (justPulse && pl.fallWaitTicks === 0) {
      if (pl.carried >= t.pulse_cost && pl.pulseCdTicks === 0) {
        pl.carried -= t.pulse_cost;
        pl.pulseCdTicks = Math.round(t.pulse_cooldown_s * 60);
        const stunTicks = Math.round(t.pulse_stun_s * 60);
        const cx = pl.x, cy = pl.y + 0.8, cz = pl.z;
        let count = 0;

        for (const sh of game.shades) {
          const d3 = Math.hypot(cx - sh.x, cy - sh.y, cz - sh.z);
          if (d3 <= t.pulse_radius) {
            sh.state = "stunned";
            sh.stateTicksLeft = stunTicks;
            sh.pushTicksLeft = PULSE_PUSH_TICKS;
            const dx = sh.x - pl.x, dz = sh.z - pl.z;
            const dh = Math.hypot(dx, dz);
            sh.pushDirX = dh > 1e-6 ? dx / dh : 1;
            sh.pushDirZ = dh > 1e-6 ? dz / dh : 0;
            game.score += t.score.per_stun;
            count += 1;
          }
        }

        for (const dr of game.drifters) {
          if (dr.state === "removed") continue;
          const d3 = Math.hypot(cx - dr.x, cy - dr.y, cz - dr.z);
          if (d3 <= t.pulse_radius) {
            if (dr.state === "chase") {
              dr.state = "flee";
              dr.stateTicksLeft = DRIFTER_FLEE_TICKS;
              const dx = dr.x - pl.x, dz = dr.z - pl.z;
              const dh = Math.hypot(dx, dz) || 1;
              dr.fleeDirX = dx / dh; dr.fleeDirZ = dz / dh;
              showToast("✨ Tỏa sáng xua đuổi Gió Lạc!");
            } else if (dr.state === "flee" && dr.stolen > 0) {
              const amt = dr.stolen;
              dr.stolen = 0;
              dr.stateTicksLeft = Math.min(dr.stateTicksLeft || DRIFTER_DROP_FLEE_TICKS, DRIFTER_DROP_FLEE_TICKS);
              scatterDroppedMotes(dr.x, dr.y, dr.z, amt, 0.8);
              showToast(`✨ Gió Lạc đánh rơi lại ${amt} đom đóm!`);
            }
          }
        }

        pulseRing.position.set(pl.x, pl.y + 0.18, pl.z);
        pulseAnim = 1.0;
        sfx.pulse();
        if (count > 0) showToast(`✨ Tỏa sáng làm choáng ${count} Bóng Mực! (+${count * t.score.per_stun} điểm)`);
      } else if (pl.carried < t.pulse_cost) {
        showToast(`Cần ít nhất ${t.pulse_cost} đom đóm để Tỏa sáng!`);
      }
    }

    // Step 8: Move Shades and Drifters
    const shadeSpeed = game.night === 3 ? 4.5 : t.shade_speed;
    const pushStep = t.pulse_push_m / PULSE_PUSH_TICKS;
    const recoilStep = 2.0 / SHADE_RECOIL_TICKS;

    for (const sh of game.shades) {
      if (sh.state === "spawning") {
        if (sh.stateTicksLeft <= 0) {
          const d = Math.hypot(pl.x - sh.x, pl.z - sh.z);
          sh.state = d <= 12.0 && pl.fallWaitTicks === 0 ? "chase" : "wander";
        }
        continue;
      }
      if (sh.state === "stunned") {
        if (sh.pushTicksLeft > 0) {
          const nx = sh.x + sh.pushDirX * pushStep;
          const nz = sh.z + sh.pushDirZ * pushStep;
          if (!isBlockedByCliffOrTower(game.night, sh.x, sh.z, nx, nz, sh.y)) {
            sh.x = nx; sh.z = nz;
          }
          sh.pushTicksLeft -= 1;
        }
        if (sh.stateTicksLeft <= 0) {
          const d = Math.hypot(pl.x - sh.x, pl.z - sh.z);
          sh.state = d <= 12.0 && pl.fallWaitTicks === 0 ? "chase" : "wander";
        }
        continue;
      }
      if (sh.state === "recoil") {
        const nx = sh.x + sh.recoilDirX * recoilStep;
        const nz = sh.z + sh.recoilDirZ * recoilStep;
        if (!isBlockedByCliffOrTower(game.night, sh.x, sh.z, nx, nz, sh.y)) {
          sh.x = nx; sh.z = nz;
        }
        if (sh.stateTicksLeft <= 0) {
          const d = Math.hypot(pl.x - sh.x, pl.z - sh.z);
          sh.state = d <= 12.0 && pl.fallWaitTicks === 0 ? "chase" : "wander";
        }
        continue;
      }

      const dPl = Math.hypot(pl.x - sh.x, pl.z - sh.z);
      if (pl.fallWaitTicks > 0) sh.state = "wander";
      else if (sh.state === "wander" && dPl <= 12.0) sh.state = "chase";
      else if (sh.state === "chase" && dPl > 18.0) sh.state = "wander";

      if (sh.inSafeZone) continue;

      let nx = sh.x, nz = sh.z;
      if (sh.state === "chase" && dPl > 1e-6) {
        const stepD = Math.min(shadeSpeed * DT, dPl);
        nx += ((pl.x - sh.x) / dPl) * stepD;
        nz += ((pl.z - sh.z) / dPl) * stepD;
      } else {
        sh.wanderAngle += 0.6 * DT;
        nx += Math.cos(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
        nz += Math.sin(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
      }

      for (const lan of litLanterns) {
        const ldx = nx - lan.x, ldz = nz - lan.z;
        const ld = Math.hypot(ldx, ldz);
        if (ld < safeR) {
          const ux = ld > 1e-6 ? ldx / ld : 1, uz = ld > 1e-6 ? ldz / ld : 0;
          nx = lan.x + ux * safeR;
          nz = lan.z + uz * safeR;
        }
      }
      if (!isBlockedByCliffOrTower(game.night, sh.x, sh.z, nx, nz, sh.y)) {
        sh.x = nx; sh.z = nz;
      }
    }

    for (const dr of game.drifters) {
      if (dr.state === "removed") continue;
      if (dr.state === "idle" || dr.state === "chase") {
        const dPl = Math.hypot(pl.x - dr.x, pl.z - dr.z);
        dr.state = (pl.fallWaitTicks === 0 && pl.carried >= 5 && dPl <= 15.0) ? "chase" : "idle";
      }
      if (dr.state === "idle") {
        dr.idleAngle += 0.9 * DT;
        dr.x += Math.cos(dr.idleAngle) * 2.0 * DT;
        dr.z += Math.sin(dr.idleAngle) * 2.0 * DT;
      } else if (dr.state === "chase") {
        const dx = pl.x - dr.x, dz = pl.z - dr.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepD = Math.min(7.0 * DT, d);
          dr.x += (dx / d) * stepD;
          dr.z += (dz / d) * stepD;
        }
      } else if (dr.state === "flee") {
        dr.x += dr.fleeDirX * 7.0 * DT;
        dr.z += dr.fleeDirZ * 7.0 * DT;
        if (dr.stateTicksLeft <= 0) {
          dr.state = "removed";
          dr.mesh.visible = false;
        }
      }
    }

    // Step 9: Collisions — Drifters steal first, then Shades hit
    if (pl.fallWaitTicks === 0) {
      for (const dr of game.drifters) {
        if (dr.state !== "chase" || dr.hasStolen) continue;
        if (Math.hypot(pl.x - dr.x, pl.z - dr.z) <= 1.2) {
          const amt = Math.min(3, pl.carried);
          pl.carried -= amt;
          dr.stolen = amt;
          dr.hasStolen = true;
          dr.state = "flee";
          dr.stateTicksLeft = DRIFTER_FLEE_TICKS;
          const dx = dr.x - pl.x, dz = dr.z - pl.z;
          const d = Math.hypot(dx, dz) || 1;
          dr.fleeDirX = dx / d; dr.fleeDirZ = dz / d;
          sfx.steal();
          showToast(`💨 Gió Lạc ${dr.id} vừa cướp ${amt} đom đóm! Mau Tỏa sáng để lấy lại!`);
        }
      }

      for (const sh of game.shades) {
        if (sh.state === "spawning" || sh.state === "stunned" || sh.state === "recoil" || sh.inSafeZone) continue;
        if (Math.hypot(pl.x - sh.x, pl.z - sh.z) <= t.shade_hit_radius && Math.abs(pl.y - sh.y) <= 1.5) {
          if (pl.invulnTicks > 0) continue;
          const dropped = Math.floor(pl.carried * t.hit_drop_ratio);
          pl.carried = Math.max(0, pl.carried - dropped);
          scatterDroppedMotes(pl.x, pl.y, pl.z, dropped);
          pl.flames = Math.max(0, pl.flames - 1);
          pl.invulnTicks = Math.round(t.invuln_s * 60);

          const dx = sh.x - pl.x, dz = sh.z - pl.z;
          const d = Math.hypot(dx, dz) || 1;
          sh.recoilDirX = dx / d; sh.recoilDirZ = dz / d;
          sh.state = "recoil";
          sh.stateTicksLeft = SHADE_RECOIL_TICKS;

          sfx.hit();
          showToast(`💔 Bóng Mực chạm phải! Mất 1 Ngọn lửa, rơi ${dropped} đom đóm.`);
          break;
        }
      }
    }

    // Step 10: Scheduled Spawns
    if (game.simTick > 0 && game.simTick % MOTE_SPAWN_TICKS === 0) {
      spawnScheduledMote();
    }
    const sInterval = shadeIntervalForNight(game.night);
    if (game.simTick === 300) {
      spawnScheduledShade();
      spawnScheduledShade();
    } else if (game.simTick > 300 && (game.simTick - 300) % sInterval === 0) {
      spawnScheduledShade();
    }
    if ((game.night === 2 || game.night === 3) && game.simTick > 0 && game.simTick % DRIFTER_SPAWN_TICKS === 0) {
      spawnScheduledDrifter();
    }

    // Step 11: Win / Loss check (no_flames > all_lit > dawn)
    if (pl.flames <= 0) {
      game.state = "lost";
      sfx.lose();
      showEndModal("lost", "no_flames");
      return;
    }
    if (game.lanterns.every((l) => l.lit)) {
      game.state = "won";
      game.score += Math.floor(game.timeLeftS) * t.score.per_second_left;
      game.score += pl.flames * t.score.per_flame_left;
      campaignScores[game.night] = game.score;
      sfx.win();
      showEndModal("won", "all_lit");
      return;
    }
    if (game.timeLeftS <= 0) {
      game.state = "lost";
      sfx.lose();
      showEndModal("lost", "dawn");
    }
  }

  // Update Standardized HUD & Off-screen Indicator
  function updateHUD() {
    if (!game) return;
    const t = contract.tuning;
    const pl = game.player;

    hudFlames.textContent = "🔥".repeat(pl.flames) + "🖤".repeat(Math.max(0, t.flames - pl.flames));
    const litCount = game.lanterns.filter((l) => l.lit).length;
    hudLanterns.textContent = `${litCount} / ${game.lanterns.length}`;
    hudScore.textContent = String(game.score);

    const mins = Math.floor(game.timeLeftS / 60);
    const secs = Math.floor(game.timeLeftS % 60);
    hudTime.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if (game.timeLeftS <= 30) hudTime.classList.add("danger-blink");
    else hudTime.classList.remove("danger-blink");

    // 10-slot Mote bar
    hudCarried.textContent = `${pl.carried} / ${t.carry_capacity}`;
    for (let i = 0; i < moteSlotEls.length; i++) {
      if (i < pl.carried) moteSlotEls[i].classList.add("filled");
      else moteSlotEls[i].classList.remove("filled");
    }

    // Charm & Wind status badges
    if (pl.charmTicks > 0) {
      hudCharmBadge.classList.remove("hidden");
      hudCharmTime.textContent = `${(pl.charmTicks / 60).toFixed(1)}s`;
    } else {
      hudCharmBadge.classList.add("hidden");
    }

    if (game.windActive) {
      hudWindBadge.classList.remove("hidden");
      hudWindText.textContent = `💨 Gió mạnh đang đẩy (${game.windDirDeg}°)`;
    } else if (game.windWarn) {
      hudWindBadge.classList.remove("hidden");
      hudWindText.textContent = "🍃 Gió mạnh sắp thổi (2s)!";
    } else {
      hudWindBadge.classList.add("hidden");
    }

    // Dash Cooldown card
    const maxDashCd = Math.round((t.dash_cooldown_s || 1.5) * 60);
    if (pl.charmTicks > 0) {
      hudDashBar.style.width = "100%";
      hudDashText.textContent = "Bùa Gió: 0s hồi!";
    } else if (pl.dashCdTicks > 0) {
      const ratio = 1 - pl.dashCdTicks / maxDashCd;
      hudDashBar.style.width = `${Math.round(ratio * 100)}%`;
      hudDashText.textContent = `Hồi: ${(pl.dashCdTicks / 60).toFixed(1)}s`;
    } else {
      hudDashBar.style.width = "100%";
      hudDashText.textContent = "Sẵn sàng (14 m/s)";
    }

    // Light Pulse Cooldown card
    const maxPulseCd = Math.round(t.pulse_cooldown_s * 60);
    if (pl.pulseCdTicks > 0) {
      const ratio = 1 - pl.pulseCdTicks / maxPulseCd;
      hudPulseBar.style.width = `${Math.round(ratio * 100)}%`;
      hudPulseText.textContent = `Hồi: ${(pl.pulseCdTicks / 60).toFixed(1)}s`;
    } else if (pl.carried < t.pulse_cost) {
      hudPulseBar.style.width = "100%";
      hudPulseText.textContent = `Cần ${t.pulse_cost} đom đóm`;
    } else {
      hudPulseBar.style.width = "100%";
      hudPulseText.textContent = `Sẵn sàng (tốn ${t.pulse_cost})`;
    }

    // Interaction prompt: "E — Nạp ánh sáng (x/10)"
    const nearLantern = game.lanterns
      .filter((l) => !l.lit && Math.hypot(pl.x - l.x, pl.z - l.z) <= t.interact_radius && Math.abs(pl.y - l.y) <= 2.5)
      .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z) || a.id.localeCompare(b.id))[0];
    if (nearLantern) {
      promptBanner.textContent = `E — Nạp ánh sáng vào ${nearLantern.id} (${nearLantern.deposited}/${t.lantern_cost})`;
      promptBanner.classList.remove("hidden");
    } else {
      promptBanner.classList.add("hidden");
    }
  }

  function updateOffscreenIndicator() {
    if (!game || game.state !== "playing") {
      offscreenArrow.classList.add("hidden");
      return;
    }
    const pl = game.player;
    const unlit = game.lanterns
      .filter((l) => !l.lit)
      .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z));
    if (!unlit.length) {
      offscreenArrow.classList.add("hidden");
      return;
    }
    const target = unlit[0];
    const v = new THREE.Vector3(target.x, target.y + 3.0, target.z);
    v.project(camera);

    const isBehind = v.z > 1.0;
    const isOffScreen = isBehind || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.88;
    if (!isOffScreen) {
      offscreenArrow.classList.add("hidden");
      return;
    }

    let nx = v.x, ny = -v.y;
    if (isBehind) { nx = -nx; ny = -ny; }
    const angle = Math.atan2(ny, nx);
    const pad = 54;
    const hw = window.innerWidth / 2 - pad;
    const hh = window.innerHeight / 2 - pad;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const scale = Math.min(
      Math.abs(cosA) > 1e-4 ? hw / Math.abs(cosA) : hw,
      Math.abs(sinA) > 1e-4 ? hh / Math.abs(sinA) : hh
    );
    const sx = window.innerWidth / 2 + cosA * scale;
    const sy = window.innerHeight / 2 + sinA * scale;

    offscreenArrow.style.left = `${Math.round(sx - 28)}px`;
    offscreenArrow.style.top = `${Math.round(sy - 16)}px`;
    offscreenArrow.querySelector(".arrow-glyph").style.transform = `rotate(${Math.round((angle * 180) / Math.PI)}deg)`;
    const distM = Math.round(Math.hypot(pl.x - target.x, pl.z - target.z));
    offscreenLabel.textContent = `${target.id} · ${distM}m`;
    offscreenArrow.classList.remove("hidden");
  }

  function sync3DVisuals(timeSec) {
    if (!game) return;
    const pl = game.player;

    // Ambient intensity formula from Ticket-02 Part 3.8: 0.15 + 0.55 * (lit / total)
    const litCount = game.lanterns.filter((l) => l.lit).length;
    hemiLight.intensity = 0.15 + 0.55 * (litCount / Math.max(1, game.lanterns.length));

    playerMesh.visible = pl.fallWaitTicks === 0 && (pl.invulnTicks === 0 || Math.floor(pl.invulnTicks / 4) % 2 === 0);
    playerMesh.position.set(pl.x, pl.y, pl.z);
    if (Math.hypot(pl.vx, pl.vz) > 0.1) {
      playerMesh.rotation.y = Math.atan2(pl.vx, pl.vz);
    }

    // Lanterns
    for (const lan of game.lanterns) {
      const ud = lan.mesh.userData;
      const ratio = lan.deposited / contract.tuning.lantern_cost;
      if (lan.lit) {
        ud.coreMat.color.setHex(PALETTE.lanternLit);
        ud.coreMat.emissiveIntensity = 1.9 + 0.25 * Math.sin(timeSec * 3.5);
        ud.light.intensity = 2.6 + 0.3 * Math.sin(timeSec * 4.0);
        ud.ring.material.opacity = 0.42 + 0.1 * Math.sin(timeSec * 2.5);
        ud.beam.material.opacity = 0.14;
      } else {
        ud.coreMat.color.setHex(PALETTE.lanternUnlit);
        ud.coreMat.emissiveIntensity = 0.08 + ratio * 0.65;
        ud.light.intensity = ratio * 0.9;
        ud.ring.material.opacity = 0.0;
        ud.beam.material.opacity = 0.0;
      }
    }

    // Motes
    for (let i = 0; i < game.motes.length; i++) {
      const m = game.motes[i];
      if (!m.active) continue;
      m.mesh.position.y = m.y + 0.55 + 0.18 * Math.sin(timeSec * 3.2 + i);
    }

    // Charms
    for (const c of game.charms) {
      if (!c.available) continue;
      c.mesh.rotation.y = timeSec * 2.2;
      c.mesh.position.y = c.y + 0.15 * Math.sin(timeSec * 3.0);
    }

    // Shades
    for (let i = 0; i < game.shades.length; i++) {
      const sh = game.shades[i];
      sh.mesh.position.set(sh.x, sh.y + 0.08 * Math.sin(timeSec * 4 + i), sh.z);
      const dx = pl.x - sh.x, dz = pl.z - sh.z;
      if (Math.hypot(dx, dz) > 0.1) sh.mesh.rotation.y = Math.atan2(dx, dz);
      const ud = sh.mesh.userData;
      if (sh.state === "stunned") {
        ud.bodyMat.color.setHex(PALETTE.shadeStun);
        ud.eyeMat.color.setHex(PALETTE.gold);
      } else {
        ud.bodyMat.color.setHex(PALETTE.shadeBody);
        ud.eyeMat.color.setHex(PALETTE.shadeEye);
      }
    }

    // Drifters
    for (const dr of game.drifters) {
      if (dr.state === "removed") continue;
      dr.mesh.position.set(dr.x, dr.y + 0.15 * Math.sin(timeSec * 5), dr.z);
      dr.mesh.userData.swirl.rotation.z = timeSec * 6.0;
    }

    // Wind leaves on Night 3
    if (game.windActive || game.windWarn) {
      windLeavesGroup.visible = true;
      windLeavesGroup.position.set(pl.x, pl.y, pl.z);
      const wrad = (game.windDirDeg * Math.PI) / 180;
      const spd = game.windActive ? 14 : 5;
      for (let i = 0; i < leafMeshes.length; i++) {
        const lf = leafMeshes[i];
        lf.position.x = ((lf.position.x + Math.cos(wrad) * spd * DT + 12) % 24) - 12;
        lf.position.z = ((lf.position.z + Math.sin(wrad) * spd * DT + 12) % 24) - 12;
        lf.rotation.x += 3 * DT;
        lf.rotation.y += 4 * DT;
      }
    } else {
      windLeavesGroup.visible = false;
    }

    // Pulse Ring
    if (pulseAnim > 0) {
      pulseAnim = Math.max(0, pulseAnim - DT * 2.4);
      const scale = 1 + (1 - pulseAnim) * contract.tuning.pulse_radius * 2.0;
      pulseRing.scale.set(scale, scale, 1);
      pulseRing.material.opacity = pulseAnim * 0.75;
    } else {
      pulseRing.material.opacity = 0;
    }

    // Third-person camera follow
    const camDist = 11.8;
    const camHeight = 6.2;
    const rad = (camYawDeg * Math.PI) / 180;
    const targetCamX = pl.x - Math.sin(rad) * camDist;
    const targetCamZ = pl.z - Math.cos(rad) * camDist;
    const targetCamY = pl.y + camHeight * (0.7 + camPitch * 0.6);
    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.16);
    camera.lookAt(pl.x, pl.y + 1.25, pl.z);
  }

  // Menus, Intro Card, Pause, Settings, and Campaign Transitions
  function selectNightPill(night) {
    selectedNight = night;
    document.querySelectorAll(".night-pill").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.night) === night);
    });
    const info = NIGHT_INFO[night];
    modalTitle.textContent = info.title;
    modalQuote.textContent = info.quote;
    modalDesc.textContent = info.desc;
    btnPlay.textContent = `Bắt đầu Đêm ${night}`;
  }

  document.querySelectorAll(".night-pill").forEach((el) => {
    el.addEventListener("click", () => selectNightPill(Number(el.dataset.night)));
  });

  function showMainMenu() {
    modalMode = "menu";
    pauseOverlay.classList.add("hidden");
    settingsOverlay.classList.add("hidden");
    modalIcon.textContent = "🏮";
    nightSelector.classList.remove("hidden");
    modalStats.classList.add("hidden");
    btnBackMenu.classList.add("hidden");
    btnOpenSettingsMenu.classList.remove("hidden");
    selectNightPill(selectedNight);
    overlay.classList.remove("hidden");
  }

  function showIntroCard(night) {
    modalMode = "intro";
    selectedNight = night;
    initNight(night);
    game.state = "paused";
    const info = NIGHT_INFO[night];
    modalIcon.textContent = night === 1 ? "🏮" : (night === 2 ? "🌉" : "🔔");
    modalTitle.textContent = info.title;
    modalQuote.textContent = info.quote;
    modalDesc.textContent = info.desc;
    nightSelector.classList.add("hidden");
    modalStats.classList.add("hidden");
    btnOpenSettingsMenu.classList.add("hidden");
    btnBackMenu.classList.remove("hidden");
    btnPlay.textContent = `Vào ${info.name}`;
    overlay.classList.remove("hidden");
  }

  function showEndModal(result, reason) {
    const litCount = game.lanterns.filter((l) => l.lit).length;
    nightSelector.classList.add("hidden");
    btnOpenSettingsMenu.classList.add("hidden");
    btnBackMenu.classList.remove("hidden");
    modalStats.classList.remove("hidden");

    if (result === "won" && game.night === 3) {
      // Dawn Finale Screen (Màn Bình Minh)
      modalMode = "dawn";
      const totalCampaign = (campaignScores[1] || 0) + (campaignScores[2] || 0) + (campaignScores[3] || 0);
      modalIcon.textContent = "🌅";
      modalTitle.textContent = "Bình Minh Trên Ba Hòn Đảo!";
      modalQuote.textContent = "“Cảm ơn cháu, Mây! Từ Đảo Bến, Đảo Cau tới đỉnh Tháp Chuông Đảo Chuông, cả vùng biển mây đã rực sáng đón bình minh!” — Ông Đăng";
      modalDesc.textContent = `Chiến dịch 3 đêm hoàn tất! Điểm Đêm 3: ${game.score} · Tổng điểm chiến dịch: ${totalCampaign}.`;
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Đêm 1 · Đảo Bến</div><div class="v">${campaignScores[1] || "—"}</div></div>
        <div class="modal-stat"><div class="k">Đêm 2 · Đảo Cau</div><div class="v">${campaignScores[2] || "—"}</div></div>
        <div class="modal-stat"><div class="k">Tổng 3 Đêm</div><div class="v">${totalCampaign}</div></div>
      `;
      btnPlay.textContent = "Chơi lại Chiến dịch (Đêm 1)";
    } else if (result === "won") {
      modalMode = "won";
      modalIcon.textContent = "✨";
      modalTitle.textContent = `Hoàn thành ${NIGHT_INFO[game.night].name}!`;
      modalQuote.textContent = "“Giỏi lắm Mây! Ngọn đèn trên đảo này đã vững vàng, hãy chuẩn bị sang hòn đảo tiếp theo nhé!” — Ông Đăng";
      modalDesc.textContent = `Toàn bộ ${game.lanterns.length} Đèn Lồng Lớn đã được thắp sáng trước bình minh.`;
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Điểm Đêm ${game.night}</div><div class="v">${game.score}</div></div>
        <div class="modal-stat"><div class="k">Đèn đã thắp</div><div class="v">${litCount}/${game.lanterns.length}</div></div>
        <div class="modal-stat"><div class="k">Thời gian dư</div><div class="v">${Math.floor(game.timeLeftS)}s</div></div>
      `;
      btnPlay.textContent = `Sang Đêm ${game.night + 1} →`;
    } else {
      modalMode = "lost";
      modalIcon.textContent = "🌑";
      modalTitle.textContent = "Sương Mực Bao Phủ...";
      modalQuote.textContent = "“Đừng nản lòng Mây ơi, hãy hít một hơi thật sâu rồi thắp lại từ đầu nhé!” — Ông Đăng";
      modalDesc.textContent = reason === "no_flames"
        ? "Mây đã tắt hết cả 3 Ngọn lửa hộ mệnh trước khi kịp thắp sáng toàn bộ đảo."
        : "Bình minh đã tới khi các Đèn Lồng Lớn trên đảo vẫn chưa được thắp đủ.";
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Điểm đạt được</div><div class="v">${game.score}</div></div>
        <div class="modal-stat"><div class="k">Đèn đã thắp</div><div class="v">${litCount}/${game.lanterns.length}</div></div>
        <div class="modal-stat"><div class="k">Ngọn lửa còn</div><div class="v">${game.player.flames}</div></div>
      `;
      btnPlay.textContent = `Thử lại Đêm ${game.night}`;
    }
    overlay.classList.remove("hidden");
  }

  function togglePause() {
    if (!game) return;
    if (!overlay.classList.contains("hidden") || !settingsOverlay.classList.contains("hidden")) return;
    if (game.state === "playing") {
      game.state = "paused";
      pauseSubtitle.textContent = `${NIGHT_INFO[game.night].name} — Toàn bộ nhịp mô phỏng đang dừng.`;
      pauseOverlay.classList.remove("hidden");
    } else if (game.state === "paused") {
      game.state = "playing";
      pauseOverlay.classList.add("hidden");
    }
  }

  function toggleMute() {
    sfx.muted = !sfx.muted;
    btnMute.textContent = sfx.muted ? "🔇" : "🔊";
  }

  function openSettings() {
    sliderVolume.value = String(Math.round(settings.volume * 100));
    lblVolume.textContent = `${Math.round(settings.volume * 100)}%`;
    sliderSens.value = String(settings.mouseSens.toFixed(1));
    lblSens.textContent = `${settings.mouseSens.toFixed(1)}x`;
    settingsOverlay.classList.remove("hidden");
  }

  sliderVolume.addEventListener("input", () => {
    settings.volume = Number(sliderVolume.value) / 100;
    lblVolume.textContent = `${sliderVolume.value}%`;
    saveSettings();
  });
  sliderSens.addEventListener("input", () => {
    settings.mouseSens = Number(sliderSens.value);
    lblSens.textContent = `${settings.mouseSens.toFixed(1)}x`;
    saveSettings();
  });
  btnCloseSettings.addEventListener("click", () => {
    saveSettings();
    settingsOverlay.classList.add("hidden");
  });

  btnPlay.addEventListener("click", () => {
    sfx.ensure();
    if (modalMode === "menu") {
      showIntroCard(selectedNight);
    } else if (modalMode === "intro") {
      overlay.classList.add("hidden");
      game.state = "playing";
      modalMode = "playing";
    } else if (modalMode === "won") {
      showIntroCard(Math.min(3, game.night + 1));
    } else if (modalMode === "dawn") {
      campaignScores = { 1: 0, 2: 0, 3: 0 };
      showIntroCard(1);
    } else if (modalMode === "lost") {
      showIntroCard(game.night);
    }
  });

  btnBackMenu.addEventListener("click", showMainMenu);
  btnOpenSettingsMenu.addEventListener("click", openSettings);
  btnPauseHud.addEventListener("click", togglePause);
  btnMute.addEventListener("click", toggleMute);

  btnResume.addEventListener("click", togglePause);
  btnRestartPause.addEventListener("click", () => {
    pauseOverlay.classList.add("hidden");
    showIntroCard(game.night);
  });
  btnOpenSettingsPause.addEventListener("click", openSettings);
  btnPauseToMenu.addEventListener("click", showMainMenu);

  // Main Fixed-Timestep Loop (60 ticks/s)
  let lastTime = performance.now();
  let accumulator = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    const frameDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (toastTimer > 0) {
      toastTimer -= frameDt;
      if (toastTimer <= 0) toastEl.classList.add("hidden");
    }

    if (game && game.state === "playing") {
      accumulator += frameDt;
      while (accumulator >= DT) {
        stepSimulation();
        accumulator -= DT;
      }
      updateHUD();
      updateOffscreenIndicator();
    } else {
      offscreenArrow.classList.add("hidden");
    }

    sync3DVisuals(now / 1000);
    renderer.render(scene, camera);
  }

  fetch("/game.contract.json")
    .then((r) => r.json())
    .then((c) => {
      contract = c;
      initNight(1);
      game.state = "paused";
      showMainMenu();
      requestAnimationFrame(animate);
    });
})();
