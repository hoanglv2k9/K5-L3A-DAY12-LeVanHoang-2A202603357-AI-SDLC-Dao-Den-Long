/* Đảo Đèn Lồng v1.0.0 — 3D Third-Person WebGL Game (Phase 4: Bình Minh · Contract v1.3)
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
    shadeEyeCB: 0x00b3ff,
    shadeStun: 0x3a3450,
    mayCloth: 0xe8e2d0,
    charmRed: 0xc8102e,
    gold: 0xf2c14e,
    drifter: 0x8fa3b8,
    danger: 0xff5a5f,
    dangerCB: 0xffffff,
    text: 0xf5f1e6,
  };

  const NIGHT_INFO = {
    1: {
      name: "Đêm 1 · Đảo Bến",
      title: "Đêm 1 — Đảo Bến",
      quote: "“Mây ơi, gió đêm nay làm dầu trong đèn hao dần (1 dầu/s), lại thêm lũ Bóng Mực rình hút dầu những đèn yếu (< 30). Hãy châm dầu và giữ ít nhất 3/5 đèn sáng tới tận bình minh nhé!” — Ông Đăng",
      desc: "Hòn đảo tròn bán kính 40m. Giữ tối thiểu 3/5 Đèn Lồng Lớn đang cháy sáng khi hết 240 giây (Thắp đầu: 10 đom đóm · Thắp lại: 5 · Châm dầu: +10 dầu/đom đóm).",
    },
    2: {
      name: "Đêm 2 · Đảo Cau",
      title: "Đêm 2 — Đảo Cau",
      quote: "“Hai bờ Đảo Cau đều phải giữ lửa! Mỗi lần thắp đèn thành công sức chứa của cháu tăng thêm +2 (tối đa 20). Hãy dùng Bệ Nhảy và Bùa Gió để kịp châm dầu cả hai đảo!” — Ông Đăng",
      desc: "Hai hòn đảo nối bằng cầu tre và 2 Bệ Nhảy Gió. Giữ tối thiểu 4/6 Đèn Lồng Lớn còn cháy sáng khi hết 270 giây.",
    },
    3: {
      name: "Đêm 3 · Đảo Chuông",
      title: "Đêm 3 — Đảo Chuông",
      quote: "“Đỉnh Tháp Chuông và 3 tầng đá đang đón thử thách cuối cùng. Đừng để Bóng Mực hút cạn dầu khi Gió Mạnh thổi qua! Giữ ít nhất 5/7 đèn sáng tới bình minh nhé!” — Ông Đăng",
      desc: "Đảo 3 tầng cao (0m · 3m · 6m) với 2 dốc đá, Bệ Nhảy lên Tháp Chuông và Gió Mạnh định kỳ. Giữ tối thiểu 5/7 Đèn Lồng Lớn còn sáng khi hết 300 giây.",
    },
  };

  // Default Keybindings (Ticket-04 Section 4: all 9 actions customizable)
  const DEFAULT_KEYBINDS = {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    jump: "Space",
    dash: "ShiftLeft",
    interact: "KeyE",
    pulse: "KeyQ",
    pause: "Escape",
  };

  const KEYBIND_LABELS = {
    forward: "Tiến lên",
    back: "Lùi lại",
    left: "Sang trái",
    right: "Sang phải",
    jump: "Nhảy",
    dash: "Lướt (Dash)",
    interact: "Thắp / Châm dầu",
    pulse: "Tỏa sáng",
    pause: "Tạm dừng",
  };

  const SETTINGS_KEY = "dao_den_long_settings_v13";
  const LB_LOCAL_KEY = "dao_den_long_leaderboard_v13";
  const settings = {
    volume: 0.8,
    mouseSens: 1.0,
    colorblind: false,
    subtitles: true,
    reducedMotion: false,
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS },
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ||
      localStorage.getItem("dao_den_long_settings_v12") ||
      "{}"
    );
    if (typeof saved.volume === "number") settings.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved.mouseSens === "number") settings.mouseSens = Math.max(0.3, Math.min(2.5, saved.mouseSens));
    if (typeof saved.colorblind === "boolean") settings.colorblind = saved.colorblind;
    if (typeof saved.subtitles === "boolean") settings.subtitles = saved.subtitles;
    if (typeof saved.reducedMotion === "boolean") settings.reducedMotion = saved.reducedMotion;
    if (typeof saved.largeText === "boolean") settings.largeText = saved.largeText;
    if (saved.keybinds && typeof saved.keybinds === "object") {
      settings.keybinds = { ...DEFAULT_KEYBINDS, ...saved.keybinds };
    }
  } catch (_) {}

  function formatKeyCode(code) {
    if (!code) return "—";
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
    if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
    if (code === "ArrowUp") return "↑";
    if (code === "ArrowDown") return "↓";
    if (code === "ArrowLeft") return "←";
    if (code === "ArrowRight") return "→";
    if (code === "Escape") return "Esc";
    return code;
  }

  function applyAccessibilityClasses() {
    document.body.classList.toggle("colorblind-mode", !!settings.colorblind);
    document.body.classList.toggle("large-text-mode", !!settings.largeText);
    const kb = settings.keybinds;
    const hintEl = document.getElementById("controls-hint");
    if (hintEl) {
      hintEl.innerHTML =
        `<b>${formatKeyCode(kb.forward)}/${formatKeyCode(kb.left)}/${formatKeyCode(kb.back)}/${formatKeyCode(kb.right)}</b> Di chuyển · ` +
        `<b>${formatKeyCode(kb.jump)}</b> Nhảy · <b>${formatKeyCode(kb.dash)}</b> Lướt · ` +
        `<b>${formatKeyCode(kb.interact)}</b> Thắp/Châm dầu · <b>${formatKeyCode(kb.pulse)}/RMB</b> Tỏa sáng · ` +
        `<b>${formatKeyCode(kb.pause)}</b> Tạm dừng`;
    }
    const lblDash = document.getElementById("lbl-key-dash");
    const lblPulse = document.getElementById("lbl-key-pulse");
    if (lblDash) lblDash.textContent = formatKeyCode(kb.dash);
    if (lblPulse) lblPulse.textContent = `${formatKeyCode(kb.pulse)} / RMB`;
  }
  applyAccessibilityClasses();

  function saveSettings() {
    applyAccessibilityClasses();
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
    refuel() { this.tone(520, 0.14, "sine", 0.08); this.tone(690, 0.2, "triangle", 0.07, 0.05); }
    lanternLit() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.42, "sine", 0.09, i * 0.08)); }
    lanternOut() { [392, 311, 233].forEach((f, i) => this.tone(f, 0.28, "sawtooth", 0.07, i * 0.08)); }
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
  const screenFlashEl = document.getElementById("screen-flash");
  const hudNightName = document.getElementById("hud-night-name");
  const hudFlames = document.getElementById("hud-flames");
  const hudCharmBadge = document.getElementById("hud-charm-badge");
  const hudCharmTime = document.getElementById("hud-charm-time");
  const hudWindBadge = document.getElementById("hud-wind-badge");
  const hudWindText = document.getElementById("hud-wind-text");
  const hudFuelAlert = document.getElementById("hud-fuel-alert");
  const hudFuelAlertText = document.getElementById("hud-fuel-alert-text");
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
  const subtitleBanner = document.getElementById("subtitle-banner");
  const toastEl = document.getElementById("toast");
  const offscreenArrow = document.getElementById("offscreen-arrow");
  const offscreenLabel = document.getElementById("offscreen-label");
  const shadeSpawnArrow = document.getElementById("shade-spawn-arrow");
  const shadeArrowLabel = document.getElementById("shade-arrow-label");

  const overlay = document.getElementById("overlay");
  const modalIcon = document.getElementById("modal-icon");
  const modalTitle = document.getElementById("modal-title");
  const modalQuote = document.getElementById("modal-quote");
  const modalDesc = document.getElementById("modal-desc");
  const nightSelector = document.getElementById("night-selector");
  const modalStats = document.getElementById("modal-stats");
  const scoreSubmitBox = document.getElementById("score-submit-box");
  const inpPlayerName = document.getElementById("inp-player-name");
  const btnSaveScore = document.getElementById("btn-save-score");
  const lblSaveMsg = document.getElementById("lbl-save-msg");
  const btnPlay = document.getElementById("btn-play");
  const btnOpenLeaderboard = document.getElementById("btn-open-leaderboard");
  const btnOpenSettingsMenu = document.getElementById("btn-open-settings-menu");
  const btnRunBenchUi = document.getElementById("btn-run-bench-ui");
  const btnBackMenu = document.getElementById("btn-back-menu");

  const leaderboardOverlay = document.getElementById("leaderboard-overlay");
  const lbTbody = document.getElementById("lb-tbody");
  const btnCloseLeaderboard = document.getElementById("btn-close-leaderboard");

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
  const chkColorblind = document.getElementById("chk-colorblind");
  const chkSubtitles = document.getElementById("chk-subtitles");
  const chkReducedMotion = document.getElementById("chk-reduced-motion");
  const chkLargeText = document.getElementById("chk-large-text");
  const keybindListEl = document.getElementById("keybind-list");
  const kbConflictMsg = document.getElementById("kb-conflict-msg");
  const btnResetKeys = document.getElementById("btn-reset-keys");
  const btnCloseSettings = document.getElementById("btn-close-settings");

  const btnPauseHud = document.getElementById("btn-pause-hud");
  const btnMute = document.getElementById("btn-mute");

  const moteSlotEls = [];
  for (let i = 0; i < 20; i++) {
    const d = document.createElement("div");
    d.className = "mote-slot";
    hudMoteSlots.appendChild(d);
    moteSlotEls.push(d);
  }

  let toastTimer = 0;
  let subtitleTimer = 0;
  let shadeArrowTimer = 0;
  let lastSpawnedShadePos = null;
  let camShakeTimer = 0;
  let flashTimer = 0;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    toastTimer = 2.5;
  }

  function showSubtitle(msg, dur = 3.2) {
    if (!settings.subtitles) return;
    subtitleBanner.textContent = msg;
    subtitleBanner.classList.remove("hidden");
    subtitleTimer = dur;
  }

  function triggerHitFeedback() {
    if (settings.reducedMotion) return;
    camShakeTimer = 0.35;
    flashTimer = 0.22;
    screenFlashEl.classList.remove("hidden");
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

  // Articulated 3D Princess Riding a Majestic Golden Lion
  function buildPlayerMesh() {
    const g = new THREE.Group();
    const mountRoot = new THREE.Group();
    g.add(mountRoot);

    const lionFurMat = new THREE.MeshStandardMaterial({
      color: 0xe6a129,
      emissive: 0x3b2204,
      emissiveIntensity: 0.35,
      roughness: 0.62,
      metalness: 0.12,
    });
    const lionBellyMat = new THREE.MeshStandardMaterial({
      color: 0xf7d07a,
      roughness: 0.68,
    });
    const maneMat = new THREE.MeshStandardMaterial({
      color: 0x8a3e0d,
      emissive: 0x2a1002,
      emissiveIntensity: 0.3,
      roughness: 0.78,
    });
    const maneInnerMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.72,
    });
    const goldArmorMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0x78350f,
      emissiveIntensity: 0.45,
      metalness: 0.75,
      roughness: 0.22,
    });
    const saddleMat = new THREE.MeshStandardMaterial({
      color: 0xbe123c,
      roughness: 0.55,
    });

    // 1. Lion Muscular Torso, Chest & Haunches (oriented along +Z forward)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 1.35, 16), lionFurMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.78, -0.05);
    torso.castShadow = true;
    mountRoot.add(torso);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.47, 16, 16), lionFurMat);
    chest.scale.set(0.96, 1.05, 1.12);
    chest.position.set(0, 0.84, 0.52);
    chest.castShadow = true;
    mountRoot.add(chest);

    const haunches = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 16), lionFurMat);
    haunches.scale.set(0.95, 1.02, 1.08);
    haunches.position.set(0, 0.82, -0.62);
    haunches.castShadow = true;
    mountRoot.add(haunches);

    // Royal Saddle & Golden Trim
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 0.78), saddleMat);
    saddle.position.set(0, 1.16, -0.04);
    saddle.castShadow = true;
    mountRoot.add(saddle);

    const saddleTrim = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.84), goldArmorMat);
    saddleTrim.position.set(0, 1.13, -0.04);
    mountRoot.add(saddleTrim);

    // 2. Multi-layered Royal Lion Mane & Sculpted Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.16, 0.78);
    mountRoot.add(headGroup);

    const maneOuter = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), maneMat);
    maneOuter.scale.set(1.08, 1.15, 0.82);
    maneOuter.position.set(0, 0.02, -0.08);
    maneOuter.castShadow = true;
    headGroup.add(maneOuter);

    const maneFront = new THREE.Mesh(new THREE.DodecahedronGeometry(0.54, 1), maneInnerMat);
    maneFront.scale.set(1.0, 1.06, 0.75);
    maneFront.position.set(0, 0.04, 0.04);
    headGroup.add(maneFront);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), lionFurMat);
    skull.scale.set(0.95, 0.92, 1.05);
    skull.position.set(0, 0.08, 0.22);
    headGroup.add(skull);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.36), lionBellyMat);
    muzzle.position.set(0, -0.02, 0.48);
    headGroup.add(muzzle);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.08, 4),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.4 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.06, 0.67);
    headGroup.add(nose);

    // White fangs
    const fangMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-0.11, 0.11]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 6), fangMat);
      fang.rotation.x = Math.PI;
      fang.position.set(sx, -0.14, 0.56);
      headGroup.add(fang);
    }

    // Glowing amber-gold lion eyes
    const lionEyeMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (const sx of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), lionEyeMat);
      eye.position.set(sx, 0.14, 0.49);
      headGroup.add(eye);
    }

    // Lion ears
    for (const sx of [-0.28, 0.28]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), lionFurMat);
      ear.scale.set(0.8, 1.1, 0.5);
      ear.position.set(sx, 0.38, 0.14);
      headGroup.add(ear);
    }

    // Golden Crown Crest on Lion Forehead
    const lionCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), goldArmorMat);
    lionCrest.position.set(0, 0.27, 0.46);
    headGroup.add(lionCrest);

    // 3. Articulated 4 Lion Legs (Front-Left, Front-Right, Back-Left, Back-Right)
    function makeLionLeg(x, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.72, z);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.46, 12), lionFurMat);
      upper.position.y = -0.22;
      upper.castShadow = true;
      pivot.add(upper);

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.38, 12), lionFurMat);
      lower.position.set(0, -0.52, 0.03);
      lower.castShadow = true;
      pivot.add(lower);

      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lionBellyMat);
      paw.scale.set(1.0, 0.62, 1.35);
      paw.position.set(0, -0.68, 0.08);
      pivot.add(paw);
      mountRoot.add(pivot);
      return pivot;
    }

    const legFL = makeLionLeg(0.28, 0.48);
    const legFR = makeLionLeg(-0.28, 0.48);
    const legBL = makeLionLeg(0.27, -0.58);
    const legBR = makeLionLeg(-0.27, -0.58);

    // 4. Articulated Lion Tail with Tuft
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.92, -0.96);
    const tailStem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.85, 8), lionFurMat);
    tailStem.rotation.x = -0.65;
    tailStem.position.set(0, 0.15, -0.35);
    tailPivot.add(tailStem);
    const tailTuft = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), maneMat);
    tailTuft.scale.set(0.9, 0.9, 1.4);
    tailTuft.position.set(0, 0.36, -0.72);
    tailPivot.add(tailTuft);
    mountRoot.add(tailPivot);

    // 5. Princess Rider Seated on the Golden Lion
    const princessGroup = new THREE.Group();
    princessGroup.position.set(0, 1.22, -0.02);
    mountRoot.add(princessGroup);

    const gownMat = new THREE.MeshStandardMaterial({
      color: 0xfff1f2,
      emissive: 0x4c0519,
      emissiveIntensity: 0.22,
      roughness: 0.45,
    });
    const roseSilkMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0x881337,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffe4d6,
      roughness: 0.55,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x2e1911,
      roughness: 0.65,
    });

    // Royal Gown Skirt draped gracefully over the saddle
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.68, 16), gownMat);
    skirt.position.set(0, 0.24, 0);
    skirt.castShadow = true;
    princessGroup.add(skirt);

    const overskirt = new THREE.Mesh(new THREE.ConeGeometry(0.49, 0.42, 16), roseSilkMat);
    overskirt.position.set(0, 0.34, -0.02);
    princessGroup.add(overskirt);

    // Princess Bodice & Golden Belt
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.48, 14), roseSilkMat);
    bodice.position.set(0, 0.68, 0.02);
    bodice.castShadow = true;
    princessGroup.add(bodice);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 8, 20), goldArmorMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 0.48, 0.02);
    princessGroup.add(belt);

    // Flowing Royal Silk Cape behind Princess
    const capePivot = new THREE.Group();
    capePivot.position.set(0, 0.88, -0.14);
    const capeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.92, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xfb7185,
        emissive: 0x881337,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      })
    );
    capeMesh.position.set(0, -0.42, -0.16);
    capeMesh.rotation.x = 0.38;
    capePivot.add(capeMesh);
    princessGroup.add(capePivot);

    // Princess Head, Eyes, Flowing Hair & 5-Point Golden Crown
    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skinMat);
    pHead.position.set(0, 1.08, 0.05);
    pHead.castShadow = true;
    princessGroup.add(pHead);

    const pEyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    for (const sx of [-0.075, 0.075]) {
      const pe = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), pEyeMat);
      pe.position.set(sx, 1.1, 0.25);
      princessGroup.add(pe);
    }

    // Long flowing hair
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 14), hairMat);
    hairCap.position.set(0, 1.12, -0.01);
    princessGroup.add(hairCap);

    const hairBack = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.72, 12), hairMat);
    hairBack.rotation.x = 0.25;
    hairBack.position.set(0, 0.82, -0.16);
    princessGroup.add(hairBack);

    // Golden Crown / Tiara with Glowing Ruby Gem
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 1.28, 0.04);
    const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.1, 16), goldArmorMat);
    crownGroup.add(crownBand);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 6), goldArmorMat);
      spike.position.set(Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15);
      crownGroup.add(spike);
    }
    const crownGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.055, 0),
      new THREE.MeshStandardMaterial({ color: 0xff2a85, emissive: 0xff2a85, emissiveIntensity: 1.8 })
    );
    crownGem.position.set(0, 0.08, 0.17);
    crownGroup.add(crownGem);
    princessGroup.add(crownGroup);

    // Princess Arms & Golden Reins
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.44, 10), skinMat);
    armL.position.set(-0.24, 0.72, 0.2);
    armL.rotation.x = 0.85;
    princessGroup.add(armL);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.44, 10), skinMat);
    armR.position.set(0.26, 0.78, 0.22);
    armR.rotation.x = 1.05;
    armR.rotation.z = -0.25;
    princessGroup.add(armR);

    // Royal Crystal Lantern Scepter held in Princess's right hand
    const miniPivot = new THREE.Group();
    miniPivot.position.set(0.36, 0.96, 0.46);
    const scepterStaff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 8), goldArmorMat);
    scepterStaff.rotation.x = 0.35;
    miniPivot.add(scepterStaff);

    const miniOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xfacc15,
        emissiveIntensity: 2.4,
      })
    );
    miniOrb.position.set(0, 0.28, 0.14);
    miniPivot.add(miniOrb);

    const playerLight = new THREE.PointLight(0xffd166, 2.2, 16);
    playerLight.position.set(0, 0.28, 0.14);
    miniPivot.add(playerLight);

    princessGroup.add(miniPivot);

    g.userData = {
      mountRoot,
      headGroup,
      legFL,
      legFR,
      legBL,
      legBR,
      tailPivot,
      capePivot,
      miniPivot,
      playerLight,
    };
    return g;
  }

  function buildLanternMesh(safeRadius, isBench = false) {
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

    const tearGroup = new THREE.Group();
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x181522, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.09), tearMat);
      const a = (i * Math.PI) / 2;
      tear.position.set(Math.cos(a) * 0.53, 3.05, Math.sin(a) * 0.53);
      tear.rotation.y = -a + Math.PI / 2;
      tear.rotation.z = 0.45;
      tearGroup.add(tear);
    }
    g.add(tearGroup);

    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 4.45;
    const fbBg = new THREE.Mesh(
      new THREE.BoxGeometry(1.44, 0.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x0e1430 })
    );
    fuelBarGroup.add(fbBg);

    const fbFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
    const fbFill = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.13, 0.1), fbFillMat);
    fbFill.position.z = 0.01;
    fuelBarGroup.add(fbFill);
    fuelBarGroup.visible = false;
    g.add(fuelBarGroup);

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
    beam.visible = !isBench; // Creative sky-beam disabled during standardized benchmark
    g.add(beam);

    g.userData = { core, coreMat, cap, tearGroup, fuelBarGroup, fbFill, fbFillMat, light, ring, beam };
    return g;
  }

  // Radiant Celestial Crystal Monster (Bright, vivid, easily visible on screen)
  function buildShadeMesh() {
    const g = new THREE.Group();

    // Luminous crystal outer body (bright sky-cyan / aqua glow)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      metalness: 0.15,
      transparent: true,
      opacity: 0.92,
    });
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 1), bodyMat);
    body.scale.set(0.95, 1.35, 0.95);
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);

    // Warm golden-sun inner core shining through the crystal spirit
    const innerCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    innerCore.position.y = 0.95;
    g.add(innerCore);

    // Floating Golden Halo Crown above the Spirit
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.82;
    g.add(halo);

    // Articulated Crystal Light Wings (left & right)
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 4), wingMat);
    wingL.rotation.z = Math.PI / 2.4;
    wingL.position.set(0.65, 1.05, -0.05);
    g.add(wingL);

    const wingR = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 4), wingMat);
    wingR.rotation.z = -Math.PI / 2.4;
    wingR.position.set(-0.65, 1.05, -0.05);
    g.add(wingR);

    // Bright Jewel Eyes & Glowing Aura Ring
    const eyeColor = settings.colorblind ? PALETTE.shadeEyeCB : 0xfffbeb;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), eyeMat);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), eyeMat);
    eyeL.position.set(-0.19, 1.08, 0.52);
    eyeR.position.set(0.19, 1.08, 0.52);
    g.add(eyeL, eyeR);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 24), eyeMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.28;
    g.add(rim);

    const drainBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.14, 2.0, 8),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.88 })
    );
    drainBeam.rotation.x = Math.PI / 2;
    drainBeam.position.set(0, 1.1, 1.0);
    drainBeam.visible = false;
    g.add(drainBeam);

    g.userData = { bodyMat, eyeMat, drainBeam, wingL, wingR, halo };
    return g;
  }

  // Radiant Golden-Silver Wind Pixie (Drifter / Gió Lạc)
  function buildDrifterMesh() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.48, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.4,
        roughness: 0.15,
      })
    );
    core.position.y = 0.95;
    g.add(core);

    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.055, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    swirl.rotation.x = Math.PI / 2;
    swirl.position.y = 0.95;
    g.add(swirl);

    const swirl2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    swirl2.rotation.y = Math.PI / 3;
    swirl2.position.y = 0.95;
    g.add(swirl2);

    g.userData = { swirl, swirl2 };
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
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.32, 4.0), woodMat);
      bridge.position.set(35.0, -0.14, 0);
      bridge.receiveShadow = true;
      worldGroup.add(bridge);

      const jp1 = buildJumpPadMesh();
      jp1.position.set(20, 0, 18);
      const jp2 = buildJumpPadMesh();
      jp2.position.set(50, 0, -18);
      worldGroup.add(jp1, jp2);
    } else {
      const t0 = new THREE.Mesh(new THREE.CylinderGeometry(43.8, 44.5, 1.8, 56), grassMat);
      t0.position.y = -0.9;
      t0.receiveShadow = true;
      worldGroup.add(t0);

      const sand = new THREE.Mesh(new THREE.CylinderGeometry(45.0, 47.0, 2.2, 56), sandMat);
      sand.position.y = -1.15;
      worldGroup.add(sand);

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

      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8.0, 8.2, 6.0, 32), grassMat);
      t2.position.y = 3.0;
      t2.receiveShadow = true;
      t2.castShadow = true;
      worldGroup.add(t2);

      const jp3 = buildJumpPadMesh();
      jp3.position.set(0, 3.0, 13.0);
      worldGroup.add(jp3);

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

  // Input Handling (supports custom remapped keys from settings.keybinds)
  const keys = {};
  const edge = { jump: false, dash: false, interact: false, pulse: false };
  let listeningKeyAction = null;
  let camYawDeg = 0;
  let camPitch = 0.44;
  let dragging = false;
  let lastMouseX = 0;

  window.addEventListener("keydown", (e) => {
    const code = e.code;

    // Handle active key remapping capture in Settings modal
    if (listeningKeyAction) {
      e.preventDefault();
      settings.keybinds[listeningKeyAction] = code;
      listeningKeyAction = null;
      saveSettings();
      renderKeybindList();
      return;
    }

    // Do not intercept typing when entering player name in leaderboard input
    if (document.activeElement === inpPlayerName) return;

    const kb = settings.keybinds;
    if (!keys[code]) {
      if (code === kb.jump) edge.jump = true;
      if (code === kb.dash) edge.dash = true;
      if (code === kb.interact || code === "KeyF") edge.interact = true;
      if (code === kb.pulse || code === "KeyX") edge.pulse = true;
      if (code === kb.pause || code === "KeyP") togglePause();
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
    if (benchState && benchState.active) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Game, Campaign & 3D Benchmark State
  let contract = null;
  let game = null;
  let selectedNight = 1;
  let campaignScores = { 1: 0, 2: 0, 3: 0 };
  let campaignNightsWon = 0;
  let modalMode = "menu";
  let lastCountdownSec = -1;
  let lowFuelSubtitleCooldown = 0;
  let benchState = null;

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

  function playerCapacity() {
    if (!game || !contract) return 10;
    const base = contract.tuning.carry_capacity || 10;
    const maxCap = contract.tuning.capacity_max || 20;
    return Math.min(maxCap, base + 2 * game.player.successfulLights);
  }

  function requiredLitForWin() {
    if (!game || !contract) return 3;
    const ratio = contract.tuning.win_ratio || 0.6;
    return Math.ceil(ratio * game.lanterns.length - 1e-9);
  }

  function initNight(night, seed = 42 + night, isBench = false) {
    selectedNight = night;
    clearEntities();
    buildIslandEnvironment(night);

    const t = contract.tuning;
    const rng = new SeededRNG(seed);
    const durS = t[`night${night}_duration_s`] || t.night1_duration_s;

    const lanterns = defaultLanternCoords(night).map(([id, x, y, z]) => {
      const mesh = buildLanternMesh(t.safe_radius, isBench);
      mesh.position.set(x, y, z);
      entitiesGroup.add(mesh);
      return {
        id, x, y, z,
        deposited: 0,
        lit: false,
        fuelTicks: 0,
        everLit: false,
        relitCount: 0,
        mesh,
      };
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
      seed,
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
        successfulLights: 0,
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

    if (!isBench) {
      const indices = moteSpawnPoints.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng.random() * (i + 1));
        const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
      }
      for (let k = 0; k < Math.min(INITIAL_MOTES, indices.length); k++) {
        const [x, y, z] = moteSpawnPoints[indices[k]];
        spawnMoteAt(x, y, z, "random", null);
      }
    }

    hudNightName.textContent = NIGHT_INFO[night].name;
    lastCountdownSec = -1;
    updateHUD();
  }

  // Standardized 1280x720 3D Benchmark Scene (Ticket-04 Section 1)
  function start3DBenchmark(seed = 42, durationS = 30) {
    overlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    settingsOverlay.classList.add("hidden");
    leaderboardOverlay.classList.add("hidden");

    const tLoad0 = performance.now();
    camera.aspect = 1280 / 720;
    camera.updateProjectionMatrix();
    renderer.setSize(1280, 720);

    initNight(1, seed, true);
    const fuelMaxTicks = Math.round((contract.tuning.fuel_max || 100) * 60);
    for (let i = 0; i < 3; i++) {
      game.lanterns[i].lit = true;
      game.lanterns[i].fuelTicks = fuelMaxTicks;
      game.lanterns[i].everLit = true;
    }

    const rng = new SeededRNG(seed);
    const safeR = contract.tuning.safe_radius;
    const litLans = game.lanterns.slice(0, 3);

    // Spawn exact 200 Shades in wander state
    for (let i = 0; i < 200; i++) {
      let sx = 0, sz = 0;
      for (let k = 0; k < 30; k++) {
        const r = 38.5 * Math.sqrt(rng.random());
        const theta = rng.uniform(0, Math.PI * 2);
        sx = r * Math.cos(theta);
        sz = r * Math.sin(theta);
        if (litLans.every((l) => Math.hypot(sx - l.x, sz - l.z) >= safeR + 0.2)) break;
      }
      const mesh = buildShadeMesh();
      mesh.position.set(sx, 0, sz);
      entitiesGroup.add(mesh);
      game.shades.push({
        id: `S${i + 1}`, x: sx, y: 0, z: sz,
        state: "wander",
        stateTicksLeft: 0, pushTicksLeft: 0,
        pushDirX: 1, pushDirZ: 0, recoilDirX: 1, recoilDirZ: 0,
        inSafeZone: false,
        wanderAngle: rng.uniform(0, Math.PI * 2),
        targetLanternId: null, drainTicks: 0,
        mesh,
      });
    }

    // Spawn exact 100 Motes
    for (let i = 0; i < 100; i++) {
      const r = 38.0 * Math.sqrt(rng.random());
      const theta = rng.uniform(0, Math.PI * 2);
      spawnMoteAt(r * Math.cos(theta), 0, r * Math.sin(theta), "random", null);
    }

    sync3DVisuals(0);
    renderer.render(scene, camera);
    const loadMs = Math.round(performance.now() - tLoad0);

    benchState = {
      active: true,
      seed,
      warmupS: 3.0,
      durationS,
      loadMs,
      startTime: performance.now(),
      measureStart: null,
      lastFrameTime: null,
      dtMsList: [],
    };
    showToast(`⏱ Đang chạy Benchmark 1280×720 (Khởi động 3s + Đo ${durationS}s · 200 Bóng Mực · 100 Đom đóm)...`);
  }

  function step3DBenchmark(now) {
    const elapsedTotalS = (now - benchState.startTime) / 1000;
    const shadeSpeed = contract.tuning.shade_speed;
    const safeR = contract.tuning.safe_radius;
    const safeLans = game.lanterns.filter((l) => l.lit);
    const unlitLans = game.lanterns.filter((l) => !l.lit);

    // Move 200 Shades in wander state (spawning/damage/pickup/fuel-decay/end disabled)
    for (const sh of game.shades) {
      let nx = sh.x, nz = sh.z;
      const unlit = unlitLans[0];
      if (unlit && Math.hypot(sh.x - unlit.x, sh.z - unlit.z) > 2.0) {
        const du = Math.hypot(sh.x - unlit.x, sh.z - unlit.z);
        const stepD = Math.min(shadeSpeed * 0.55 * DT, du);
        nx += ((unlit.x - sh.x) / du) * stepD;
        nz += ((unlit.z - sh.z) / du) * stepD;
      } else {
        sh.wanderAngle += 0.6 * DT;
        nx += Math.cos(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
        nz += Math.sin(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
      }
      for (const lan of safeLans) {
        const ldx = nx - lan.x, ldz = nz - lan.z;
        const ld = Math.hypot(ldx, ldz);
        if (ld < safeR) {
          const ux = ld > 1e-6 ? ldx / ld : 1, uz = ld > 1e-6 ? ldz / ld : 0;
          nx = lan.x + ux * safeR;
          nz = lan.z + uz * safeR;
        }
      }
      sh.x = nx; sh.z = nz;
      sh.mesh.position.set(sh.x, 0, sh.z);
    }

    // Orbit camera: center (0,0,0), r=30m, Y=15m, start at 0° (30,15,0), CCW from above, 15s/loop
    const angle = (2 * Math.PI * elapsedTotalS) / 15.0;
    camera.position.set(30.0 * Math.cos(angle), 15.0, -30.0 * Math.sin(angle));
    camera.lookAt(0, 0, 0);

    if (elapsedTotalS >= benchState.warmupS) {
      if (benchState.measureStart === null) {
        benchState.measureStart = now;
        benchState.lastFrameTime = now;
      } else {
        const dtMs = Math.max(0.1, now - benchState.lastFrameTime);
        benchState.dtMsList.push(dtMs);
        benchState.lastFrameTime = now;
        const measuredS = (now - benchState.measureStart) / 1000;
        hudNightName.textContent = `Benchmark 1280×720 (${measuredS.toFixed(1)}/${benchState.durationS}s)`;
        if (measuredS >= benchState.durationS) {
          finish3DBenchmark();
        }
      }
    } else {
      hudNightName.textContent = `Benchmark Khởi động (${elapsedTotalS.toFixed(1)}/3.0s)`;
    }
  }

  function finish3DBenchmark() {
    const dts = benchState.dtMsList;
    const n = dts.length || 1;
    const totalMs = dts.reduce((a, b) => a + b, 0) || 16.6;
    const avgFps = Number(((1000 * n) / totalMs).toFixed(1));
    const k = Math.max(1, Math.ceil(0.01 * n));
    const worstK = [...dts].sort((a, b) => b - a).slice(0, k);
    const p1LowFps = Number((1000 / (worstK.reduce((a, b) => a + b, 0) / k)).toFixed(1));
    const sorted = [...dts].sort((a, b) => a - b);
    const frameMsP95 = Number(sorted[Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1))].toFixed(2));

    benchState.active = false;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    modalMode = "menu";
    modalIcon.textContent = "⏱";
    modalTitle.textContent = "Kết quả Benchmark 3D (1280×720)";
    modalQuote.textContent = "Cảnh chuẩn: Đêm 1 · 200 Bóng Mực wander · 100 Đom đóm · 3 đèn sáng (L1–L3) · Camera quỹ đạo r=30m, Y=15m (15s/vòng).";
    modalDesc.textContent = `avg_fps: ${avgFps} · p1_low_fps: ${p1LowFps} · frame_ms_p95: ${frameMsP95} ms · frames: ${n} · load_ms: ${benchState.loadMs} ms`;
    nightSelector.classList.add("hidden");
    scoreSubmitBox.classList.add("hidden");
    modalStats.classList.remove("hidden");
    modalStats.innerHTML = `
      <div class="modal-stat"><div class="k">AVG FPS (≥ 60)</div><div class="v">${avgFps}</div></div>
      <div class="modal-stat"><div class="k">1% LOW FPS (≥ 30)</div><div class="v">${p1LowFps}</div></div>
      <div class="modal-stat"><div class="k">P95 FRAME (ms)</div><div class="v">${frameMsP95}ms</div></div>
    `;
    btnBackMenu.classList.remove("hidden");
    overlay.classList.remove("hidden");
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
    const lowTicks = Math.round((contract.tuning.low_fuel_threshold || 30) * 60);
    const pl = game.player;
    const valid = game.shadeSpawnPoints.filter((pt) => {
      if (Math.hypot(pt[0] - pl.x, pt[2] - pl.z) < 15.0) return false;
      if (game.lanterns.some((l) => l.lit && l.fuelTicks >= lowTicks && Math.hypot(pt[0] - l.x, pt[2] - l.z) < safeR)) return false;
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
      targetLanternId: null,
      drainTicks: 0,
      mesh,
    });
    // Ticket-04 Section 4: Visual subtitle & screen-edge arrow when a Shade spawns
    lastSpawnedShadePos = { id, x: pt[0], y: pt[1], z: pt[2] };
    shadeArrowTimer = 4.0;
    showSubtitle(`👁 Phụ đề: Bóng Mực ${id} vừa xuất hiện ở rìa đảo!`);
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
    if (night === 1) return Math.hypot(x, z) <= 40.0 ? 0.0 : null;
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
    if (y >= 5.5 && rNew < 2.0) return true;
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

  // Mandatory 12-Step Simulation Tick (Contract v1.3)
  function stepSimulation() {
    if (!game || game.state !== "playing") return;
    const t = contract.tuning;
    const pl = game.player;
    const fuelMaxTicks = Math.round((t.fuel_max || 100) * 60);
    const lowFuelTicks = Math.round((t.low_fuel_threshold || 30) * 60);
    const fuelPerMoteTicks = Math.round((t.fuel_per_mote || 10) * 60);
    const decayPerTick = Math.round(t.fuel_decay_per_s || 1.0);
    const drainPerTick = Math.round(t.drain_per_s || 5.0);

    game.tick += 1;
    game.simTick += 1;

    // Step 2: Decrement counters + lantern fuel decay & Shade drain
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

    for (const lan of game.lanterns) {
      if (!lan.lit) continue;
      const wasAboveLow = lan.fuelTicks >= lowFuelTicks;
      let drainCount = 0;
      for (const sh of game.shades) {
        if (sh.state === "drain" && Math.hypot(sh.x - lan.x, sh.z - lan.z) <= 2.0 + 1e-6 && lan.fuelTicks < lowFuelTicks) {
          drainCount += 1;
        }
      }
      lan.fuelTicks = Math.max(0, lan.fuelTicks - decayPerTick - drainCount * drainPerTick);
      if (wasAboveLow && lan.fuelTicks < lowFuelTicks && lan.fuelTicks > 0) {
        showSubtitle(`⚠ Phụ đề: Đèn ${lan.id} còn dưới 30 nhiên liệu — mất vùng an toàn!`);
      }
      if (lan.fuelTicks <= 0) {
        lan.lit = false;
        lan.fuelTicks = 0;
        lan.deposited = 0;
        lan.everLit = true;
        sfx.lanternOut();
        showToast(`🕯 Đèn Lồng ${lan.id} đã cạn dầu và tắt! (Cần ${t.relight_cost || 5} đom đóm để thắp lại)`);
        showSubtitle(`🕯 Phụ đề: Đèn ${lan.id} đã tắt vì cạn dầu!`);
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

    if (game.night === 3) {
      const mod = game.simTick % WIND_PERIOD_TICKS;
      if (game.simTick >= WIND_PERIOD_TICKS - WIND_WARN_TICKS && mod === WIND_PERIOD_TICKS - WIND_WARN_TICKS) {
        game.windDirDeg = Math.round(game.rng.uniform(0, 360));
        showToast("🍃 Gió mạnh sắp thổi qua Đảo Chuông!");
        showSubtitle(`🍃 Phụ đề: Gió mạnh sắp thổi (hướng ${game.windDirDeg}°) trong 2 giây!`);
      }
      game.windWarn = game.simTick >= WIND_PERIOD_TICKS - WIND_WARN_TICKS && mod >= WIND_PERIOD_TICKS - WIND_WARN_TICKS;
      const wasWind = game.windActive;
      game.windActive = game.simTick >= WIND_PERIOD_TICKS && mod < WIND_DUR_TICKS;
      if (game.windActive && !wasWind) sfx.wind();
    } else {
      game.windActive = false;
      game.windWarn = false;
    }

    const secCeil = Math.ceil(game.timeLeftS);
    if (secCeil <= 10 && secCeil > 0 && secCeil !== lastCountdownSec) {
      lastCountdownSec = secCeil;
      sfx.countdownTick();
      showSubtitle(`⏰ Phụ đề: Còn ${secCeil} giây trước bình minh!`, 1.2);
    }

    // Step 1/3: Input & Player Movement (using custom remapped keybinds)
    if (keys["BracketLeft"]) camYawDeg = (camYawDeg - 95 * DT) % 360;
    if (keys["BracketRight"]) camYawDeg = (camYawDeg + 95 * DT) % 360;

    const kb = settings.keybinds;
    let mx = 0, mz = 0;
    if (keys[kb.left] || keys["ArrowLeft"]) mx += 1;
    if (keys[kb.right] || keys["ArrowRight"]) mx -= 1;
    if (keys[kb.forward] || keys["ArrowUp"]) mz += 1;
    if (keys[kb.back] || keys["ArrowDown"]) mz -= 1;

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

      if (pl.y < FALL_Y) {
        pl.carried = 0;
        pl.flames = Math.max(0, pl.flames - 1);
        pl.vx = pl.vy = pl.vz = 0;
        pl.launchActive = false;
        pl.dashTicksLeft = 0;
        sfx.hit();
        triggerHitFeedback();
        if (pl.flames > 0) {
          pl.fallWaitTicks = FALL_WAIT_TICKS;
          showToast("⚠ Mây rơi khỏi đảo! Mất 1 Ngọn lửa & toàn bộ đom đóm mang theo.");
        }
      }
    }

    // Step 4: Pick up motes and charms
    const curCap = playerCapacity();
    if (pl.fallWaitTicks === 0) {
      for (const m of game.motes) {
        if (pl.carried >= curCap) break;
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
        .filter((l) => (!l.lit || l.fuelTicks < fuelMaxTicks) && Math.hypot(pl.x - l.x, pl.z - l.z) <= t.interact_radius && Math.abs(pl.y - l.y) <= 2.5)
        .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z) || a.id.localeCompare(b.id));
      if (candidates.length > 0) {
        const target = candidates[0];
        if (!target.lit) {
          const reqCost = target.everLit ? (t.relight_cost || 5) : t.lantern_cost;
          const needed = Math.max(0, reqCost - target.deposited);
          const amount = Math.min(pl.carried, needed);
          if (amount > 0) {
            pl.carried -= amount;
            target.deposited += amount;
            game.score += amount * t.score.per_mote;
            if (target.deposited >= reqCost) {
              const isRelight = target.everLit;
              target.lit = true;
              target.fuelTicks = fuelMaxTicks;
              target.everLit = true;
              if (isRelight) {
                target.relitCount += 1;
                game.score += (t.score.per_relight || 40);
              } else {
                game.score += t.score.per_lantern;
              }
              pl.successfulLights += 1;
              sfx.lanternLit();
              showToast(`🏮 ${isRelight ? "Thắp lại" : "Thắp sáng"} Đèn Lồng ${target.id}! (Sức chứa tăng lên ${playerCapacity()})`);
            } else {
              sfx.deposit();
              showToast(`Đã nạp ${amount} đom đóm vào ${target.id} (${target.deposited}/${reqCost})`);
            }
          }
        } else {
          const missingTicks = Math.max(0, fuelMaxTicks - target.fuelTicks);
          const neededMotes = Math.floor((missingTicks + fuelPerMoteTicks - 1) / fuelPerMoteTicks);
          const used = Math.min(pl.carried, neededMotes);
          if (used > 0) {
            pl.carried -= used;
            target.fuelTicks = Math.min(fuelMaxTicks, target.fuelTicks + used * fuelPerMoteTicks);
            game.score += used * t.score.per_mote;
            sfx.refuel();
            showToast(`🛢 Đã châm ${used} đom đóm vào ${target.id} (Nhiên liệu: ${(target.fuelTicks / 60).toFixed(1)}/100)`);
          }
        }
      }
    }

    // Step 6: Update safe zones
    const safeR = t.safe_radius;
    const safeLanterns = game.lanterns.filter((l) => l.lit && l.fuelTicks >= lowFuelTicks);
    const pushPerTick = Math.max(t.shade_speed * DT, safeR / 30.0);
    for (const sh of game.shades) {
      sh.inSafeZone = false;
      for (const lan of safeLanterns) {
        const dx = sh.x - lan.x, dz = sh.z - lan.z;
        const d = Math.hypot(dx, dz);
        if (d < safeR) {
          sh.inSafeZone = true;
          if (sh.state === "drain") {
            sh.state = "wander";
            sh.drainTicks = 0;
            sh.targetLanternId = null;
          }
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
        let drainCount = 0;

        for (const sh of game.shades) {
          const d3 = Math.hypot(cx - sh.x, cy - sh.y, cz - sh.z);
          if (d3 <= t.pulse_radius) {
            const wasDrain = sh.state === "drain";
            sh.state = "stunned";
            sh.stateTicksLeft = stunTicks;
            sh.pushTicksLeft = PULSE_PUSH_TICKS;
            sh.drainTicks = 0;
            sh.targetLanternId = null;
            const dx = sh.x - pl.x, dz = sh.z - pl.z;
            const dh = Math.hypot(dx, dz);
            sh.pushDirX = dh > 1e-6 ? dx / dh : 1;
            sh.pushDirZ = dh > 1e-6 ? dz / dh : 0;
            game.score += wasDrain ? (t.score.per_drain_stun || 15) : t.score.per_stun;
            count += 1;
            if (wasDrain) drainCount += 1;
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
        if (count > 0) {
          showToast(`✨ Tỏa sáng làm choáng ${count} Bóng Mực${drainCount > 0 ? ` (${drainCount} con đang hút dầu: +15đ)` : ""}!`);
        }
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
        if (sh.stateTicksLeft <= 0) sh.state = "wander";
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
        if (sh.stateTicksLeft <= 0) sh.state = "wander";
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

      if (sh.state === "drain") {
        if (pl.fallWaitTicks === 0 && dPl <= 6.0) {
          sh.state = "chase";
          sh.targetLanternId = null;
        } else {
          const tLan = game.lanterns.find((l) => l.id === sh.targetLanternId);
          if (!tLan || !tLan.lit || tLan.fuelTicks >= lowFuelTicks || Math.hypot(sh.x - tLan.x, sh.z - tLan.z) > 2.0) {
            sh.state = "wander";
            sh.targetLanternId = null;
          } else {
            continue;
          }
        }
      }

      if (sh.state === "chase") {
        if (pl.fallWaitTicks > 0 || dPl > 18.0) {
          sh.state = "wander";
        } else {
          if (sh.inSafeZone) continue;
          let nx = sh.x, nz = sh.z;
          if (dPl > 1e-6) {
            const stepD = Math.min(shadeSpeed * DT, dPl);
            nx += ((pl.x - sh.x) / dPl) * stepD;
            nz += ((pl.z - sh.z) / dPl) * stepD;
          }
          for (const lan of safeLanterns) {
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
          continue;
        }
      }

      const weakLanterns = game.lanterns
        .filter((l) => l.lit && l.fuelTicks < lowFuelTicks)
        .sort((a, b) => Math.hypot(sh.x - a.x, sh.z - a.z) - Math.hypot(sh.x - b.x, sh.z - b.z) || a.id.localeCompare(b.id));

      if (weakLanterns.length > 0) {
        const wLan = weakLanterns[0];
        sh.targetLanternId = wLan.id;
        const dw = Math.hypot(sh.x - wLan.x, sh.z - wLan.z);
        if (dw <= 2.0) {
          sh.state = "drain";
          continue;
        }
        if (sh.inSafeZone) continue;
        const stepD = Math.min(shadeSpeed * DT, dw);
        let nx = sh.x + ((wLan.x - sh.x) / dw) * stepD;
        let nz = sh.z + ((wLan.z - sh.z) / dw) * stepD;
        for (const lan of safeLanterns) {
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
        if (Math.hypot(sh.x - wLan.x, sh.z - wLan.z) <= 2.0) {
          sh.state = "drain";
        }
        continue;
      }

      sh.targetLanternId = null;
      let nx = sh.x, nz = sh.z;
      if (pl.fallWaitTicks === 0 && dPl <= 12.0) {
        sh.state = "chase";
        if (sh.inSafeZone) continue;
        if (dPl > 1e-6) {
          const stepD = Math.min(shadeSpeed * DT, dPl);
          nx += ((pl.x - sh.x) / dPl) * stepD;
          nz += ((pl.z - sh.z) / dPl) * stepD;
        }
      } else {
        if (sh.inSafeZone) continue;
        const unlit = game.lanterns
          .filter((l) => !l.lit)
          .sort((a, b) => Math.hypot(sh.x - a.x, sh.z - a.z) - Math.hypot(sh.x - b.x, sh.z - b.z) || a.id.localeCompare(b.id))[0];
        if (unlit && Math.hypot(sh.x - unlit.x, sh.z - unlit.z) > 2.0) {
          const du = Math.hypot(sh.x - unlit.x, sh.z - unlit.z);
          const stepD = Math.min(shadeSpeed * 0.55 * DT, du);
          nx += ((unlit.x - sh.x) / du) * stepD;
          nz += ((unlit.z - sh.z) / du) * stepD;
        } else {
          sh.wanderAngle += 0.6 * DT;
          nx += Math.cos(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
          nz += Math.sin(sh.wanderAngle) * (shadeSpeed * 0.35 * DT);
        }
      }

      for (const lan of safeLanterns) {
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

    // Step 9: Collisions
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
          sh.targetLanternId = null;

          sfx.hit();
          triggerHitFeedback();
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

    // Step 11: Win / Loss check
    if (pl.flames <= 0) {
      game.state = "lost";
      sfx.lose();
      showEndModal("lost", "no_flames");
      return;
    }
    if (game.timeLeftS <= 0) {
      const litLanterns = game.lanterns.filter((l) => l.lit);
      if (litLanterns.length >= requiredLitForWin()) {
        game.state = "won";
        const perLitDawn = t.score.per_lit_lantern_dawn || 50;
        for (const lan of litLanterns) {
          game.score += perLitDawn + Math.floor(lan.fuelTicks / 60);
        }
        game.score += pl.flames * t.score.per_flame_left;
        campaignScores[game.night] = game.score;
        campaignNightsWon = Math.max(campaignNightsWon, game.night);
        sfx.win();
        showEndModal("won", "dawn_survived");
      } else {
        game.state = "lost";
        sfx.lose();
        showEndModal("lost", "dawn");
      }
    }
  }

  function updateHUD() {
    if (!game) return;
    const t = contract.tuning;
    const pl = game.player;
    const fuelMaxTicks = Math.round((t.fuel_max || 100) * 60);
    const lowFuelTicks = Math.round((t.low_fuel_threshold || 30) * 60);

    hudFlames.textContent = "🔥".repeat(pl.flames) + "🖤".repeat(Math.max(0, t.flames - pl.flames));
    const litCount = game.lanterns.filter((l) => l.lit).length;
    const reqLit = requiredLitForWin();
    hudLanterns.textContent = `${litCount} / ${game.lanterns.length} (cần ≥ ${reqLit})`;
    hudScore.textContent = String(game.score);

    const mins = Math.floor(game.timeLeftS / 60);
    const secs = Math.floor(game.timeLeftS % 60);
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if (game.timeLeftS <= 30) {
      hudTime.textContent = settings.colorblind ? `⚠ ${timeStr}` : timeStr;
      hudTime.classList.add("danger-blink");
    } else {
      hudTime.textContent = timeStr;
      hudTime.classList.remove("danger-blink");
    }

    const drainingLanterns = game.lanterns.filter((l) => l.lit && game.shades.some((s) => s.state === "drain" && s.targetLanternId === l.id));
    const weakLanterns = game.lanterns.filter((l) => l.lit && l.fuelTicks < lowFuelTicks);
    if (drainingLanterns.length > 0) {
      hudFuelAlert.classList.remove("hidden");
      hudFuelAlertText.textContent = `⚠ Bóng Mực đang hút dầu đèn ${drainingLanterns.map((l) => l.id).join(", ")}!`;
    } else if (weakLanterns.length > 0) {
      hudFuelAlert.classList.remove("hidden");
      hudFuelAlertText.textContent = `⚠ Đèn ${weakLanterns.map((l) => `${l.id} (${(l.fuelTicks / 60).toFixed(0)}%)`).join(", ")} sắp cạn dầu!`;
    } else {
      hudFuelAlert.classList.add("hidden");
    }

    const curCap = playerCapacity();
    hudCarried.textContent = `${pl.carried} / ${curCap}`;
    for (let i = 0; i < moteSlotEls.length; i++) {
      if (i >= curCap) {
        moteSlotEls[i].classList.add("hidden");
      } else {
        moteSlotEls[i].classList.remove("hidden");
        moteSlotEls[i].classList.toggle("filled", i < pl.carried);
      }
    }

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

    const nearLantern = game.lanterns
      .filter((l) => (!l.lit || l.fuelTicks < fuelMaxTicks) && Math.hypot(pl.x - l.x, pl.z - l.z) <= t.interact_radius && Math.abs(pl.y - l.y) <= 2.5)
      .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z) || a.id.localeCompare(b.id))[0];
    const interactKeyName = formatKeyCode(settings.keybinds.interact);
    if (nearLantern) {
      if (!nearLantern.lit) {
        const reqCost = nearLantern.everLit ? (t.relight_cost || 5) : t.lantern_cost;
        promptBanner.textContent = `${interactKeyName} — ${nearLantern.everLit ? "Thắp lại" : "Nạp ánh sáng"} ${nearLantern.id} (${nearLantern.deposited}/${reqCost})`;
      } else {
        promptBanner.textContent = `${interactKeyName} — Châm dầu ${nearLantern.id} (Nhiên liệu: ${(nearLantern.fuelTicks / 60).toFixed(1)}/100)`;
      }
      promptBanner.classList.remove("hidden");
    } else {
      promptBanner.classList.add("hidden");
    }
  }

  function placeEdgeArrow(arrowEl, labelEl, worldX, worldY, worldZ, labelText) {
    const v = new THREE.Vector3(worldX, worldY, worldZ);
    v.project(camera);
    const isBehind = v.z > 1.0;
    const isOffScreen = isBehind || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.88;
    if (!isOffScreen) {
      arrowEl.classList.add("hidden");
      return;
    }
    let nx = v.x, ny = -v.y;
    if (isBehind) { nx = -nx; ny = -ny; }
    const angle = Math.atan2(ny, nx);
    const pad = 62;
    const hw = window.innerWidth / 2 - pad;
    const hh = window.innerHeight / 2 - pad;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const scale = Math.min(
      Math.abs(cosA) > 1e-4 ? hw / Math.abs(cosA) : hw,
      Math.abs(sinA) > 1e-4 ? hh / Math.abs(sinA) : hh
    );
    const sx = window.innerWidth / 2 + cosA * scale;
    const sy = window.innerHeight / 2 + sinA * scale;

    arrowEl.style.left = `${Math.round(sx - 34)}px`;
    arrowEl.style.top = `${Math.round(sy - 16)}px`;
    arrowEl.querySelector(".arrow-glyph").style.transform = `rotate(${Math.round((angle * 180) / Math.PI)}deg)`;
    labelEl.textContent = labelText;
    arrowEl.classList.remove("hidden");
  }

  function updateOffscreenIndicator() {
    if (!game || game.state !== "playing") {
      offscreenArrow.classList.add("hidden");
      shadeSpawnArrow.classList.add("hidden");
      return;
    }
    const pl = game.player;
    const lowFuelTicks = Math.round((contract.tuning.low_fuel_threshold || 30) * 60);
    const priority = game.lanterns
      .filter((l) => !l.lit || l.fuelTicks < lowFuelTicks)
      .sort((a, b) => Math.hypot(pl.x - a.x, pl.z - a.z) - Math.hypot(pl.x - b.x, pl.z - b.z));
    if (priority.length > 0) {
      const target = priority[0];
      const distM = Math.round(Math.hypot(pl.x - target.x, pl.z - target.z));
      placeEdgeArrow(offscreenArrow, offscreenLabel, target.x, target.y + 3.0, target.z, `${target.id}${target.lit ? "⚠" : ""} · ${distM}m`);
    } else {
      offscreenArrow.classList.add("hidden");
    }

    if (settings.subtitles && shadeArrowTimer > 0 && lastSpawnedShadePos) {
      const distS = Math.round(Math.hypot(pl.x - lastSpawnedShadePos.x, pl.z - lastSpawnedShadePos.z));
      placeEdgeArrow(shadeSpawnArrow, shadeArrowLabel, lastSpawnedShadePos.x, lastSpawnedShadePos.y + 1.2, lastSpawnedShadePos.z, `👁 ${lastSpawnedShadePos.id} · ${distS}m`);
    } else {
      shadeSpawnArrow.classList.add("hidden");
    }
  }

  function sync3DVisuals(timeSec) {
    if (!game) return;
    const pl = game.player;
    const fuelMaxTicks = Math.round((contract.tuning.fuel_max || 100) * 60);
    const lowFuelTicks = Math.round((contract.tuning.low_fuel_threshold || 30) * 60);

    const litCount = game.lanterns.filter((l) => l.lit).length;
    hemiLight.intensity = 0.42 + 0.55 * (litCount / Math.max(1, game.lanterns.length));
    moonLight.intensity = 0.68;

    playerMesh.visible = pl.fallWaitTicks === 0 && (pl.invulnTicks === 0 || Math.floor(pl.invulnTicks / 4) % 2 === 0);
    playerMesh.position.set(pl.x, pl.y, pl.z);
    const speedH = Math.hypot(pl.vx, pl.vz);
    if (speedH > 0.1) {
      playerMesh.rotation.y = Math.atan2(pl.vx, pl.vz);
    }

    // Animate Golden Lion gallop & Princess cape/scepter
    const pud = playerMesh.userData;
    if (pud && pud.legFL) {
      const moveRatio = Math.min(1.5, speedH / 6.0);
      const stride = timeSec * 14.0;
      if (!pl.grounded) {
        // Jumping / mid-air bounding pose
        pud.legFL.rotation.x = -0.65;
        pud.legFR.rotation.x = -0.5;
        pud.legBL.rotation.x = 0.55;
        pud.legBR.rotation.x = 0.45;
        pud.mountRoot.rotation.x = Math.max(-0.35, Math.min(0.35, -pl.vy * 0.03));
        pud.mountRoot.position.y = 0.06;
      } else if (moveRatio > 0.05) {
        // Galloping gait
        const swing = 0.62 * moveRatio;
        pud.legFL.rotation.x = Math.sin(stride) * swing;
        pud.legFR.rotation.x = Math.sin(stride + 0.9) * swing;
        pud.legBL.rotation.x = Math.sin(stride + Math.PI) * swing;
        pud.legBR.rotation.x = Math.sin(stride + Math.PI + 0.9) * swing;
        pud.mountRoot.position.y = Math.abs(Math.sin(stride)) * 0.08 * moveRatio;
        pud.mountRoot.rotation.x = Math.cos(stride) * 0.06 * moveRatio;
        pud.headGroup.rotation.x = Math.sin(stride) * 0.08 * moveRatio;
      } else {
        // Idle breathing pose
        pud.legFL.rotation.x = 0;
        pud.legFR.rotation.x = 0;
        pud.legBL.rotation.x = 0;
        pud.legBR.rotation.x = 0;
        pud.mountRoot.position.y = Math.sin(timeSec * 2.5) * 0.025;
        pud.mountRoot.rotation.x = 0;
        pud.headGroup.rotation.x = Math.sin(timeSec * 1.8) * 0.04;
      }
      pud.tailPivot.rotation.y = Math.sin(timeSec * (4.0 + moveRatio * 6.0)) * 0.35;
      pud.capePivot.rotation.x = 0.18 + moveRatio * 0.42 + Math.sin(timeSec * 8.0) * 0.08;
      pud.miniPivot.rotation.z = Math.sin(timeSec * 4.5) * 0.08;
    }

    const blink1Hz = 0.5 + 0.5 * Math.sin(timeSec * Math.PI * 2.0);

    for (const lan of game.lanterns) {
      const ud = lan.mesh.userData;
      if (lan.lit) {
        const fuelRatio = Math.max(0, Math.min(1, lan.fuelTicks / fuelMaxTicks));
        const isLow = lan.fuelTicks < lowFuelTicks;

        ud.core.scale.set(1.0, 1.0, 1.0);
        ud.core.position.y = 3.05;
        ud.cap.position.y = 3.75;
        ud.tearGroup.visible = false;

        ud.fuelBarGroup.visible = !(benchState && benchState.active);
        ud.fuelBarGroup.lookAt(camera.position);
        ud.fbFill.scale.x = Math.max(0.03, fuelRatio);
        ud.fbFill.position.x = -0.68 * (1 - fuelRatio);
        if (isLow) {
          ud.fbFillMat.color.setHex(settings.colorblind ? PALETTE.dangerCB : PALETTE.danger);
          if (!(benchState && benchState.active)) ud.fuelBarGroup.visible = blink1Hz > 0.25;
        } else {
          ud.fbFillMat.color.setHex(PALETTE.gold);
        }

        ud.coreMat.color.setHex(PALETTE.lanternLit);
        const blinkFactor = isLow ? (0.35 + 0.65 * blink1Hz) : 1.0;
        ud.coreMat.emissiveIntensity = (1.1 + 0.9 * fuelRatio) * blinkFactor;
        ud.light.intensity = (1.4 + 1.3 * fuelRatio) * blinkFactor;
        ud.ring.material.opacity = isLow ? 0.0 : (0.42 + 0.1 * Math.sin(timeSec * 2.5));
        ud.beam.material.opacity = isLow ? 0.05 * blinkFactor : 0.14;
      } else {
        ud.core.scale.set(1.06, 0.8, 1.06);
        ud.core.position.y = 2.94;
        ud.cap.position.y = 3.54;
        ud.tearGroup.visible = true;
        ud.fuelBarGroup.visible = false;

        const reqCost = lan.everLit ? (contract.tuning.relight_cost || 5) : contract.tuning.lantern_cost;
        const ratio = lan.deposited / Math.max(1, reqCost);
        ud.coreMat.color.setHex(PALETTE.lanternUnlit);
        ud.coreMat.emissiveIntensity = 0.08 + ratio * 0.65;
        ud.light.intensity = ratio * 0.9;
        ud.ring.material.opacity = 0.0;
        ud.beam.material.opacity = 0.0;
      }
    }

    for (let i = 0; i < game.motes.length; i++) {
      const m = game.motes[i];
      if (!m.active) continue;
      m.mesh.position.y = m.y + 0.55 + 0.18 * Math.sin(timeSec * 3.2 + i);
    }

    for (const c of game.charms) {
      if (!c.available) continue;
      c.mesh.rotation.y = timeSec * 2.2;
      c.mesh.position.y = c.y + 0.15 * Math.sin(timeSec * 3.0);
    }

    const activeEyeColor = settings.colorblind ? PALETTE.shadeEyeCB : 0xfffbeb;
    for (let i = 0; i < game.shades.length; i++) {
      const sh = game.shades[i];
      sh.mesh.position.set(sh.x, sh.y + 0.14 * Math.sin(timeSec * 4.5 + i), sh.z);
      const ud = sh.mesh.userData;

      // Animate crystal wings & golden halo on every bright spirit monster
      if (ud.wingL && ud.wingR) {
        const flap = 0.25 * Math.sin(timeSec * 9.0 + i);
        ud.wingL.rotation.y = flap;
        ud.wingR.rotation.y = -flap;
      }
      if (ud.halo) {
        ud.halo.rotation.z = timeSec * 3.0 + i;
      }

      if (sh.state === "drain") {
        const tLan = game.lanterns.find((l) => l.id === sh.targetLanternId);
        if (tLan) sh.mesh.rotation.y = Math.atan2(tLan.x - sh.x, tLan.z - sh.z);
        ud.drainBeam.visible = true;
        ud.drainBeam.material.color.setHex(0xf43f5e);
        ud.bodyMat.color.setHex(0xfda4af);
        ud.bodyMat.emissive.setHex(0xf43f5e);
        ud.eyeMat.color.setHex(activeEyeColor);
      } else {
        ud.drainBeam.visible = false;
        const dx = pl.x - sh.x, dz = pl.z - sh.z;
        if (Math.hypot(dx, dz) > 0.1) sh.mesh.rotation.y = Math.atan2(dx, dz);
        if (sh.state === "stunned") {
          ud.bodyMat.color.setHex(0xfef08a);
          ud.bodyMat.emissive.setHex(0xfacc15);
          ud.eyeMat.color.setHex(PALETTE.gold);
        } else {
          ud.bodyMat.color.setHex(0x7dd3fc);
          ud.bodyMat.emissive.setHex(0x38bdf8);
          ud.eyeMat.color.setHex(activeEyeColor);
        }
      }
    }

    for (const dr of game.drifters) {
      if (dr.state === "removed") continue;
      dr.mesh.position.set(dr.x, dr.y + 0.18 * Math.sin(timeSec * 5.5), dr.z);
      dr.mesh.userData.swirl.rotation.z = timeSec * 6.5;
      if (dr.mesh.userData.swirl2) dr.mesh.userData.swirl2.rotation.x = timeSec * 5.0;
    }

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

    if (pulseAnim > 0) {
      pulseAnim = Math.max(0, pulseAnim - DT * 2.4);
      const scale = 1 + (1 - pulseAnim) * contract.tuning.pulse_radius * 2.0;
      pulseRing.scale.set(scale, scale, 1);
      pulseRing.material.opacity = pulseAnim * 0.75;
    } else {
      pulseRing.material.opacity = 0;
    }

    if (benchState && benchState.active) return;

    const camDist = 11.8;
    const camHeight = 6.2;
    const rad = (camYawDeg * Math.PI) / 180;
    let shakeX = 0, shakeY = 0;
    if (!settings.reducedMotion && camShakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * 0.45;
      shakeY = (Math.random() - 0.5) * 0.45;
    }
    const targetCamX = pl.x - Math.sin(rad) * camDist + shakeX;
    const targetCamZ = pl.z - Math.cos(rad) * camDist;
    const targetCamY = pl.y + camHeight * (0.7 + camPitch * 0.6) + shakeY;
    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.16);
    camera.lookAt(pl.x, pl.y + 1.25, pl.z);
  }

  // Local Leaderboard Functions (Ticket-04 Section 3)
  function totalWonCampaignScore() {
    return (campaignScores[1] || 0) + (campaignScores[2] || 0) + (campaignScores[3] || 0);
  }

  async function fetchLeaderboardEntries() {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.entries)) {
          localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(data.entries));
          return data.entries;
        }
      }
    } catch (_) {}
    try {
      return JSON.parse(localStorage.getItem(LB_LOCAL_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  async function openLeaderboardModal() {
    const entries = await fetchLeaderboardEntries();
    lbTbody.innerHTML = "";
    if (!entries.length) {
      lbTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có kỷ lục nào.</td></tr>`;
    } else {
      entries.forEach((e, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><b>#${idx + 1}</b></td>
          <td>${e.name}</td>
          <td><b style="color:var(--gold)">${e.score}</b></td>
          <td>${e.nights_won} / 3</td>
          <td><code>${e.seed}</code></td>
          <td><small>${e.achieved_at}</small></td>
        `;
        lbTbody.appendChild(tr);
      });
    }
    leaderboardOverlay.classList.remove("hidden");
  }

  btnOpenLeaderboard.addEventListener("click", openLeaderboardModal);
  btnCloseLeaderboard.addEventListener("click", () => leaderboardOverlay.classList.add("hidden"));

  btnSaveScore.addEventListener("click", async () => {
    const rawName = (inpPlayerName.value || "").trim();
    if (!/^[\wÀ-ỹ]{3,12}$/u.test(rawName)) {
      lblSaveMsg.textContent = "⚠ Tên phải từ 3–12 ký tự (chữ cái, số, '_' hoặc tiếng Việt)!";
      lblSaveMsg.style.color = "var(--danger)";
      return;
    }
    const payload = {
      name: rawName,
      score: totalWonCampaignScore(),
      nights_won: campaignNightsWon,
      seed: game ? game.seed : 42,
      achieved_at: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(data.entries || []));
        lblSaveMsg.textContent = "✔ Đã lưu điểm vào Bảng xếp hạng trên đĩa cục bộ!";
        lblSaveMsg.style.color = "var(--gold)";
        btnSaveScore.disabled = true;
        return;
      }
    } catch (_) {}
    // Fallback localStorage save
    const cur = await fetchLeaderboardEntries();
    cur.push(payload);
    cur.sort((a, b) => b.score - a.score);
    localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(cur.slice(0, 10)));
    lblSaveMsg.textContent = "✔ Đã lưu điểm vào Bảng xếp hạng cục bộ!";
    lblSaveMsg.style.color = "var(--gold)";
    btnSaveScore.disabled = true;
  });

  // Key Remapping UI & Duplicate Detection (Ticket-04 Section 4)
  function renderKeybindList() {
    keybindListEl.innerHTML = "";
    const counts = {};
    Object.values(settings.keybinds).forEach((code) => {
      counts[code] = (counts[code] || 0) + 1;
    });
    const hasConflict = Object.values(counts).some((c) => c > 1);
    kbConflictMsg.classList.toggle("hidden", !hasConflict);

    Object.keys(DEFAULT_KEYBINDS).forEach((action) => {
      const code = settings.keybinds[action];
      const div = document.createElement("div");
      div.className = "kb-item";
      const isConflict = counts[code] > 1;
      const isListening = listeningKeyAction === action;
      div.innerHTML = `
        <span>${KEYBIND_LABELS[action]}</span>
        <button class="kb-btn ${isListening ? "listening" : ""} ${isConflict ? "conflict" : ""}" data-action="${action}">
          ${isListening ? "Bấm phím..." : formatKeyCode(code)}
        </button>
      `;
      div.querySelector("button").addEventListener("click", () => {
        listeningKeyAction = action;
        renderKeybindList();
      });
      keybindListEl.appendChild(div);
    });
  }

  btnResetKeys.addEventListener("click", () => {
    settings.keybinds = { ...DEFAULT_KEYBINDS };
    listeningKeyAction = null;
    saveSettings();
    renderKeybindList();
  });

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
    leaderboardOverlay.classList.add("hidden");
    scoreSubmitBox.classList.add("hidden");
    modalIcon.textContent = "🏮";
    nightSelector.classList.remove("hidden");
    modalStats.classList.add("hidden");
    btnBackMenu.classList.add("hidden");
    btnOpenLeaderboard.classList.remove("hidden");
    btnOpenSettingsMenu.classList.remove("hidden");
    btnRunBenchUi.classList.remove("hidden");
    selectNightPill(selectedNight);
    overlay.classList.remove("hidden");
  }

  function showIntroCard(night) {
    modalMode = "intro";
    selectedNight = night;
    if (night === 1) {
      campaignScores = { 1: 0, 2: 0, 3: 0 };
      campaignNightsWon = 0;
    }
    initNight(night);
    game.state = "paused";
    const info = NIGHT_INFO[night];
    modalIcon.textContent = night === 1 ? "🏮" : (night === 2 ? "🌉" : "🔔");
    modalTitle.textContent = info.title;
    modalQuote.textContent = info.quote;
    modalDesc.textContent = info.desc;
    nightSelector.classList.add("hidden");
    modalStats.classList.add("hidden");
    scoreSubmitBox.classList.add("hidden");
    btnOpenLeaderboard.classList.add("hidden");
    btnOpenSettingsMenu.classList.add("hidden");
    btnRunBenchUi.classList.add("hidden");
    btnBackMenu.classList.remove("hidden");
    btnPlay.textContent = `Vào ${info.name}`;
    overlay.classList.remove("hidden");
  }

  function prepareScoreSubmitBox() {
    scoreSubmitBox.classList.remove("hidden");
    btnSaveScore.disabled = false;
    lblSaveMsg.textContent = `Tổng điểm các Đêm đã thắng: ${totalWonCampaignScore()} (${campaignNightsWon}/3 Đêm)`;
    lblSaveMsg.style.color = "var(--safe-zone)";
  }

  function showEndModal(result, reason) {
    const litCount = game.lanterns.filter((l) => l.lit).length;
    const reqLit = requiredLitForWin();
    nightSelector.classList.add("hidden");
    btnOpenLeaderboard.classList.remove("hidden");
    btnOpenSettingsMenu.classList.add("hidden");
    btnRunBenchUi.classList.add("hidden");
    btnBackMenu.classList.remove("hidden");
    modalStats.classList.remove("hidden");

    if (result === "won" && game.night === 3) {
      modalMode = "dawn";
      const totalCampaign = totalWonCampaignScore();
      modalIcon.textContent = "🌅";
      modalTitle.textContent = "Bình Minh Trên Ba Hòn Đảo!";
      modalQuote.textContent = "“Cảm ơn cháu, Mây! Cháu đã kiên cường giữ lửa và châm dầu suốt cả 3 đêm để đón bình minh rực rỡ trên khắp biển mây!” — Ông Đăng";
      modalDesc.textContent = `Chiến dịch 3 đêm hoàn tất! Điểm Đêm 3: ${game.score} · Tổng điểm chiến dịch: ${totalCampaign}.`;
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Đêm 1 · Đảo Bến</div><div class="v">${campaignScores[1] || "—"}</div></div>
        <div class="modal-stat"><div class="k">Đêm 2 · Đảo Cau</div><div class="v">${campaignScores[2] || "—"}</div></div>
        <div class="modal-stat"><div class="k">Tổng 3 Đêm</div><div class="v">${totalCampaign}</div></div>
      `;
      prepareScoreSubmitBox();
      btnPlay.textContent = "Chơi lại Chiến dịch (Đêm 1)";
    } else if (result === "won") {
      modalMode = "won";
      scoreSubmitBox.classList.add("hidden");
      modalIcon.textContent = "🌅";
      modalTitle.textContent = `Giữ Đảo Sáng Tới Bình Minh (${NIGHT_INFO[game.night].name})!`;
      modalQuote.textContent = "“Giỏi lắm Mây! Bình minh đã lên và những ngọn đèn cháu giữ lửa vẫn đang tỏa sáng rực rỡ!” — Ông Đăng";
      modalDesc.textContent = `Đã duy trì ${litCount}/${game.lanterns.length} Đèn Lồng Lớn cháy sáng tới bình minh (yêu cầu ≥ ${reqLit}).`;
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Điểm Đêm ${game.night}</div><div class="v">${game.score}</div></div>
        <div class="modal-stat"><div class="k">Đèn sáng lúc bình minh</div><div class="v">${litCount}/${game.lanterns.length}</div></div>
        <div class="modal-stat"><div class="k">Sức chứa đạt được</div><div class="v">${playerCapacity()}</div></div>
      `;
      btnPlay.textContent = `Sang Đêm ${game.night + 1} →`;
    } else {
      modalMode = "lost";
      modalIcon.textContent = "🌑";
      modalTitle.textContent = "Đèn Tắt Trước Bình Minh...";
      modalQuote.textContent = "“Đừng nản lòng Mây ơi, nhớ ưu tiên châm dầu cho các đèn dưới 30% và xua Bóng Mực đang hút dầu nhé!” — Ông Đăng";
      modalDesc.textContent = reason === "no_flames"
        ? "Mây đã tắt hết cả 3 Ngọn lửa hộ mệnh trước khi bình minh tới."
        : `Khi bình minh tới, đảo chỉ còn ${litCount}/${game.lanterns.length} đèn sáng (cần ít nhất ${reqLit} đèn sáng).`;
      modalStats.innerHTML = `
        <div class="modal-stat"><div class="k">Điểm Đêm này</div><div class="v">${game.score}</div></div>
        <div class="modal-stat"><div class="k">Tổng điểm Đêm thắng</div><div class="v">${totalWonCampaignScore()}</div></div>
        <div class="modal-stat"><div class="k">Số Đêm đã thắng</div><div class="v">${campaignNightsWon} / 3</div></div>
      `;
      prepareScoreSubmitBox();
      btnPlay.textContent = `Thử lại Đêm ${game.night}`;
    }
    overlay.classList.remove("hidden");
  }

  function togglePause() {
    if (!game || (benchState && benchState.active)) return;
    if (!overlay.classList.contains("hidden") || !settingsOverlay.classList.contains("hidden") || !leaderboardOverlay.classList.contains("hidden")) return;
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
    chkColorblind.checked = !!settings.colorblind;
    chkSubtitles.checked = !!settings.subtitles;
    chkReducedMotion.checked = !!settings.reducedMotion;
    chkLargeText.checked = !!settings.largeText;
    listeningKeyAction = null;
    renderKeybindList();
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
  chkColorblind.addEventListener("change", () => {
    settings.colorblind = !!chkColorblind.checked;
    saveSettings();
  });
  chkSubtitles.addEventListener("change", () => {
    settings.subtitles = !!chkSubtitles.checked;
    if (!settings.subtitles) subtitleBanner.classList.add("hidden");
    saveSettings();
  });
  chkReducedMotion.addEventListener("change", () => {
    settings.reducedMotion = !!chkReducedMotion.checked;
    saveSettings();
  });
  chkLargeText.addEventListener("change", () => {
    settings.largeText = !!chkLargeText.checked;
    saveSettings();
  });
  btnCloseSettings.addEventListener("click", () => {
    listeningKeyAction = null;
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
      showIntroCard(1);
    } else if (modalMode === "lost") {
      showIntroCard(game.night);
    }
  });

  btnRunBenchUi.addEventListener("click", () => start3DBenchmark(42, 30));
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
    if (subtitleTimer > 0) {
      subtitleTimer -= frameDt;
      if (subtitleTimer <= 0) subtitleBanner.classList.add("hidden");
    }
    if (shadeArrowTimer > 0) {
      shadeArrowTimer -= frameDt;
      if (shadeArrowTimer <= 0) shadeSpawnArrow.classList.add("hidden");
    }
    if (camShakeTimer > 0) camShakeTimer = Math.max(0, camShakeTimer - frameDt);
    if (flashTimer > 0) {
      flashTimer -= frameDt;
      if (flashTimer <= 0) screenFlashEl.classList.add("hidden");
    }

    if (benchState && benchState.active) {
      step3DBenchmark(now);
      sync3DVisuals(now / 1000);
      renderer.render(scene, camera);
      return;
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
      shadeSpawnArrow.classList.add("hidden");
    }

    sync3DVisuals(now / 1000);
    renderer.render(scene, camera);
  }

  fetch("/game.contract.json")
    .then((r) => r.json())
    .then((c) => {
      contract = c;
      const params = new URLSearchParams(window.location.search);
      if (params.get("bench") === "1") {
        const bSeed = Number(params.get("seed") || 42);
        const bDur = Number(params.get("duration") || 30);
        start3DBenchmark(bSeed, bDur);
      } else {
        initNight(1);
        game.state = "paused";
        showMainMenu();
      }
      requestAnimationFrame(animate);
    });
})();
