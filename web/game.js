/* Đảo Đèn Lồng — 3D Third-Person WebGL Game (Phase 1: Đêm 1 — Đảo Bến)
 * Loads tuning dynamically from /game.contract.json (Single Source of Truth).
 */
(() => {
  const DT = 1 / 60;
  const ISLAND_RADIUS = 38.0;
  const JUMP_VEL = 7.5;
  const GRAVITY = 20.0;
  const DEFAULT_LANTERN_R = 25.0;
  const INITIAL_MOTES = 20;
  const MAX_MOTES = 24;
  const MOTE_RESPAWN_TICKS = 240;
  const INITIAL_SHADES = 2;
  const MAX_SHADES = 5;
  const SHADE_SPAWN_TICKS = 35 * 60;

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

  // Procedural WebAudio chimes (zero external audio assets)
  class SoundFX {
    constructor() { this.ctx = null; this.muted = false; }
    ensure() {
      if (this.muted) return null;
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
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    pickup() { this.tone(660, 0.14, "sine", 0.07); this.tone(880, 0.18, "triangle", 0.06, 0.05); }
    deposit() { this.tone(440, 0.16, "triangle", 0.08); this.tone(554, 0.2, "sine", 0.07, 0.06); }
    lanternLit() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.45, "sine", 0.08, i * 0.08));
    }
    pulse() { this.tone(330, 0.35, "triangle", 0.11); this.tone(660, 0.4, "sine", 0.07, 0.04); }
    hit() { this.tone(170, 0.25, "sawtooth", 0.07); this.tone(125, 0.3, "triangle", 0.07, 0.07); }
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.6, "sine", 0.09, i * 0.1)); }
    lose() { [311, 277, 233, 185].forEach((f, i) => this.tone(f, 0.45, "triangle", 0.08, i * 0.13)); }
  }

  const sfx = new SoundFX();

  // DOM refs
  const hudFlames = document.getElementById("hud-flames");
  const hudCarried = document.getElementById("hud-carried");
  const hudLanterns = document.getElementById("hud-lanterns");
  const hudTime = document.getElementById("hud-time");
  const hudScore = document.getElementById("hud-score");
  const hudPulseBar = document.getElementById("hud-pulse-bar");
  const hudPulseText = document.getElementById("hud-pulse-text");
  const promptBanner = document.getElementById("prompt-banner");
  const toastEl = document.getElementById("toast");
  const overlay = document.getElementById("overlay");
  const modalIcon = document.getElementById("modal-icon");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalStats = document.getElementById("modal-stats");
  const btnPlay = document.getElementById("btn-play");
  const btnMute = document.getElementById("btn-mute");
  const btnRestartHud = document.getElementById("btn-restart-hud");

  let toastTimer = 0;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    toastTimer = 2.4;
  }

  // Three.js scene setup
  const wrap = document.getElementById("canvas-wrap");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0918);
  scene.fog = new THREE.FogExp2(0x100b1e, 0.022);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 240);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0x6d5ba8, 0x1a1330, 0.55);
  scene.add(hemiLight);

  const moonLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
  moonLight.position.set(-24, 42, -18);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = -45;
  moonLight.shadow.camera.right = 45;
  moonLight.shadow.camera.top = 45;
  moonLight.shadow.camera.bottom = -45;
  scene.add(moonLight);

  // Island geometry (Đảo Bến — circular island + wooden pier + cloud sea ring)
  const islandGroup = new THREE.Group();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x202737, roughness: 0.92 });
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 2.5, 2.2, 48), groundMat);
  ground.position.y = -1.1;
  ground.receiveShadow = true;
  islandGroup.add(ground);

  // Subtle circular stone courtyard at center
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.8, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x353147, roughness: 0.85 })
  );
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  islandGroup.add(plaza);

  // Wooden pier ("Đảo Bến") extending south along +Z
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.85 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 9.0), pierMat);
  pier.position.set(0, 0.1, ISLAND_RADIUS - 2.0);
  pier.receiveShadow = true;
  islandGroup.add(pier);

  // Decorative floating cloud sea ("biển mây") around island — pure visual
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0x271e42,
    emissive: 0x160f2b,
    roughness: 1.0,
    transparent: true,
    opacity: 0.72,
  });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = ISLAND_RADIUS + 8 + (i % 3) * 5.5;
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(3.5 + (i % 4), 1), cloudMat);
    puff.position.set(Math.cos(a) * r, -2.8 - (i % 2) * 1.4, Math.sin(a) * r);
    puff.scale.set(1.6, 0.55, 1.3);
    cloudGroup.add(puff);
  }
  scene.add(cloudGroup);

  // Starfield sky dome
  const starPos = [];
  const starRng = new SeededRNG(1212);
  for (let i = 0; i < 360; i++) {
    const u = starRng.uniform(-1, 1);
    const phi = starRng.uniform(0, Math.PI * 2);
    const r = 130;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.abs(u) * r + 12;
    starPos.push(r * s * Math.cos(phi), y, r * s * Math.sin(phi));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xfef3c7, size: 0.75, transparent: true, opacity: 0.85 })
  );
  scene.add(stars);
  scene.add(islandGroup);

  // Build Mây (wearing nón lá with small hanging glowing lantern)
  function buildPlayerMesh() {
    const g = new THREE.Group();
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 1.25, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4d7a, roughness: 0.75 })
    );
    cloak.position.y = 0.65;
    cloak.castShadow = true;
    g.add(cloak);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.7 })
    );
    head.position.y = 1.45;
    head.castShadow = true;
    g.add(head);

    // Nón lá (conical Vietnamese hat)
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: 0xd6b370, roughness: 0.85 })
    );
    hat.position.y = 1.78;
    hat.castShadow = true;
    g.add(hat);

    // Small lantern hanging off the rim of the nón lá
    const miniPivot = new THREE.Group();
    miniPivot.position.set(0.56, 1.56, 0.18);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6),
      new THREE.MeshBasicMaterial({ color: 0xd97706 })
    );
    cord.position.y = -0.11;
    miniPivot.add(cord);

    const miniOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.0,
      })
    );
    miniOrb.position.y = -0.26;
    miniPivot.add(miniOrb);

    const playerLight = new THREE.PointLight(0xffb74d, 1.6, 11);
    playerLight.position.y = -0.26;
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
      new THREE.MeshStandardMaterial({ color: 0x4b4453, roughness: 0.9 })
    );
    post.position.y = 1.5;
    post.castShadow = true;
    g.add(post);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
    );
    cap.position.y = 3.75;
    g.add(cap);

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x3f374d,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.08,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 1.05, 8), coreMat);
    core.position.y = 3.05;
    g.add(core);

    const light = new THREE.PointLight(0xffb347, 0.0, 26);
    light.position.y = 3.3;
    g.add(light);

    // Safe radius ground ring (visible when lit)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(safeRadius - 0.15, safeRadius, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    // Creative touch: subtle rising warm sky beam when lit (purely visual)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.9, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfde68a,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.y = 16.5;
    g.add(beam);

    g.userData = { coreMat, light, ring, beam };
    return g;
  }

  function buildMoteMesh() {
    const g = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfef9c3,
        emissive: 0xfbbf24,
        emissiveIntensity: 2.2,
      })
    );
    g.add(orb);
    return g;
  }

  function buildShadeMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x160a26,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.65,
      roughness: 0.35,
    });
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 1), bodyMat);
    body.castShadow = true;
    g.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe879f9 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
    eyeL.position.set(-0.22, 0.15, 0.62);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.22;
    g.add(eyeL, eyeR);

    const stunRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.0 })
    );
    stunRing.rotation.x = Math.PI / 2;
    stunRing.position.y = 0.9;
    g.add(stunRing);

    g.userData = { body, bodyMat, eyeMat, stunRing };
    return g;
  }

  // Pulse visual shockwave ring
  const pulseWave = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.85, 48),
    new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  pulseWave.rotation.x = -Math.PI / 2;
  pulseWave.position.y = 0.2;
  scene.add(pulseWave);
  let pulseWaveT = 0;

  // Dynamic entity containers
  const playerMesh = buildPlayerMesh();
  scene.add(playerMesh);
  const dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  // Game state driven by contract tuning
  let tuning = null;
  let scoreCfg = null;
  let rng = new SeededRNG(1);
  let gameState = "menu"; // menu | playing | won | lost
  let simTick = 0;
  let score = 0;
  let timeLeft = 300;
  let camYawDeg = 0;

  let player = { x: 0, y: 0, z: 0, vy: 0, flames: 3, carried: 0, invuln: 0, pulseCd: 0 };
  let lanterns = [];
  let motes = [];
  let shades = [];
  let shadeSeq = 1;

  // Input tracking
  const keys = {};
  let dragging = false;
  let lastMouseX = 0;
  let prevButtons = { jump: false, interact: false, pulse: false };

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyM") toggleMute();
    if (e.code === "KeyR" && gameState !== "menu") resetGame();
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 0) { dragging = true; lastMouseX = e.clientX; }
    if (e.button === 2) { keys["MousePulse"] = true; }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) dragging = false;
    if (e.button === 2) keys["MousePulse"] = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging || gameState !== "playing") return;
    camYawDeg += (e.clientX - lastMouseX) * 0.28;
    lastMouseX = e.clientX;
  });
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  function toggleMute() {
    sfx.muted = !sfx.muted;
    btnMute.textContent = sfx.muted ? "🔇 Tắt tiếng" : "🔊 Âm thanh";
  }
  btnMute.addEventListener("click", toggleMute);
  btnRestartHud.addEventListener("click", () => resetGame());
  btnPlay.addEventListener("click", () => resetGame());

  function distXZ(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

  function spawnRandomMote() {
    for (let tries = 0; tries < 16; tries++) {
      const a = rng.uniform(0, Math.PI * 2);
      const r = rng.uniform(4, 32);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (distXZ(x, z, player.x, player.z) > tuning.pickup_radius + 1.0) {
        const mesh = buildMoteMesh();
        mesh.position.set(x, 0.7, z);
        dynamicGroup.add(mesh);
        motes.push({ x, z, active: true, phase: rng.uniform(0, Math.PI * 2), mesh });
        return;
      }
    }
  }

  function spawnRandomShade() {
    let sx = 28, sz = 0;
    for (let tries = 0; tries < 24; tries++) {
      const a = rng.uniform(0, Math.PI * 2);
      const r = rng.uniform(22, 32);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      if (distXZ(cx, cz, player.x, player.z) < 12) continue;
      if (lanterns.some((l) => l.lit && distXZ(cx, cz, l.x, l.z) <= tuning.safe_radius + 1)) continue;
      sx = cx; sz = cz;
      break;
    }
    const id = `S${shadeSeq++}`;
    const mesh = buildShadeMesh();
    mesh.position.set(sx, 1.0, sz);
    dynamicGroup.add(mesh);
    shades.push({ id, x: sx, y: 1.0, z: sz, state: "chase", stunTimer: 0, mesh });
  }

  function resetGame() {
    while (dynamicGroup.children.length) dynamicGroup.remove(dynamicGroup.children[0]);
    rng = new SeededRNG(Date.now() & 0xfffffff);
    simTick = 0;
    score = 0;
    timeLeft = tuning.night1_duration_s;
    camYawDeg = 0;
    player = { x: 0, y: 0, z: 0, vy: 0, flames: tuning.flames, carried: 0, invuln: 0, pulseCd: 0 };
    lanterns = [];
    motes = [];
    shades = [];
    shadeSeq = 1;
    prevButtons = { jump: false, interact: false, pulse: false };

    const n = tuning.lantern_count_night1;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const x = DEFAULT_LANTERN_R * Math.sin(a);
      const z = DEFAULT_LANTERN_R * Math.cos(a);
      const mesh = buildLanternMesh(tuning.safe_radius);
      mesh.position.set(x, 0, z);
      dynamicGroup.add(mesh);
      lanterns.push({ id: `L${i + 1}`, x, z, deposited: 0, lit: false, mesh });
    }
    for (let i = 0; i < INITIAL_MOTES; i++) spawnRandomMote();
    for (let i = 0; i < INITIAL_SHADES; i++) spawnRandomShade();

    gameState = "playing";
    overlay.classList.add("hidden");
    showToast("Đêm 1 bắt đầu — Gom đom đóm thắp 5 Đèn Lồng Lớn!");
    updateHUD();
  }

  function endGame(won, reason) {
    gameState = won ? "won" : "lost";
    if (won) sfx.win(); else sfx.lose();
    const litCount = lanterns.filter((l) => l.lit).length;
    modalIcon.textContent = won ? "✨🏮✨" : "🌑";
    modalTitle.textContent = won ? "Đảo Đèn Lồng rực sáng!" : (reason === "dawn" ? "Bình minh đã tới..." : "Ánh lửa đã tắt...");
    modalDesc.textContent = won
      ? "Chúc mừng! Mây đã thắp sáng toàn bộ 5 Đèn Lồng Lớn trên Đảo Bến và xua tan sương đen."
      : (reason === "dawn"
        ? "Hết thời gian Đêm 1 trước khi thắp đủ 5 đèn. Hãy thử lại nhé!"
        : "Bóng Mực đã dập tắt hết ngọn lửa của Mây. Đừng quên dùng Tỏa sáng [Shift] hoặc nấp gần đèn đã sáng!");
    modalStats.innerHTML = `
      <div class="modal-stat"><div class="k">Đèn đã thắp</div><div class="v">${litCount}/${lanterns.length}</div></div>
      <div class="modal-stat"><div class="k">Thời gian còn</div><div class="v">${Math.floor(timeLeft)}s</div></div>
      <div class="modal-stat"><div class="k">Tổng điểm</div><div class="v">${score}</div></div>
    `;
    modalStats.classList.remove("hidden");
    btnPlay.textContent = "Chơi lại Đêm 1";
    overlay.classList.remove("hidden");
  }

  function stepSim() {
    if (gameState !== "playing") return;
    simTick += 1;

    if (keys["KeyQ"]) camYawDeg -= 110 * DT;
    if (keys["KeyE"]) camYawDeg += 110 * DT;

    const mx = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);
    const mz = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const jumpNow = !!keys["Space"];
    const interactNow = !!(keys["KeyF"] || keys["Enter"]);
    const pulseNow = !!(keys["ShiftLeft"] || keys["ShiftRight"] || keys["KeyX"] || keys["MousePulse"]);

    const justJump = jumpNow && !prevButtons.jump;
    const justInteract = interactNow && !prevButtons.interact;
    const justPulse = pulseNow && !prevButtons.pulse;
    prevButtons = { jump: jumpNow, interact: interactNow, pulse: pulseNow };

    player.invuln = Math.max(0, player.invuln - DT);
    player.pulseCd = Math.max(0, player.pulseCd - DT);

    // Move using exact Contract v1.0 camera rotation
    const rad = (camYawDeg * Math.PI) / 180;
    let wx = mx * Math.cos(rad) + mz * Math.sin(rad);
    let wz = -mx * Math.sin(rad) + mz * Math.cos(rad);
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    player.x += wx * tuning.player_speed * DT;
    player.z += wz * tuning.player_speed * DT;

    // Gentle island perimeter clamp on 3D playfield (fall_enabled=false)
    const pr = Math.hypot(player.x, player.z);
    if (pr > ISLAND_RADIUS - 1.2) {
      player.x = (player.x / pr) * (ISLAND_RADIUS - 1.2);
      player.z = (player.z / pr) * (ISLAND_RADIUS - 1.2);
    }

    if (len > 0.05) {
      playerMesh.rotation.y = Math.atan2(wx, wz);
    }

    if (justJump && player.y <= 0.001) player.vy = JUMP_VEL;
    if (player.y > 0 || player.vy > 0) {
      player.y += player.vy * DT;
      player.vy -= GRAVITY * DT;
      if (player.y <= 0) { player.y = 0; player.vy = 0; }
    }

    // Pickup motes
    for (const m of motes) {
      if (!m.active || player.carried >= tuning.carry_capacity) continue;
      if (distXZ(player.x, player.z, m.x, m.z) <= tuning.pickup_radius) {
        m.active = false;
        m.mesh.visible = false;
        player.carried += 1;
        score += scoreCfg.per_mote;
        sfx.pickup();
      }
    }

    // Nearby unlit lantern hint + deposit
    let nearestUnlit = null;
    let nearestDist = Infinity;
    for (const lan of lanterns) {
      if (lan.lit) continue;
      const d = distXZ(player.x, player.z, lan.x, lan.z);
      if (d <= tuning.interact_radius && d < nearestDist) {
        nearestDist = d;
        nearestUnlit = lan;
      }
    }
    if (nearestUnlit && player.carried > 0) {
      promptBanner.textContent = `Nhấn [F] nạp đom đóm vào ${nearestUnlit.id} (${nearestUnlit.deposited}/${tuning.lantern_cost})`;
      promptBanner.classList.remove("hidden");
    } else {
      promptBanner.classList.add("hidden");
    }

    if (justInteract && nearestUnlit && player.carried > 0) {
      const amount = Math.min(player.carried, tuning.lantern_cost - nearestUnlit.deposited);
      if (amount > 0) {
        player.carried -= amount;
        nearestUnlit.deposited += amount;
        if (nearestUnlit.deposited >= tuning.lantern_cost) {
          nearestUnlit.lit = true;
          score += scoreCfg.per_lantern;
          sfx.lanternLit();
          showToast(`✨ Đã thắp sáng Đèn Lồng ${nearestUnlit.id}!`);
          if (lanterns.every((l) => l.lit)) {
            timeLeft = Math.max(0, tuning.night1_duration_s - simTick / 60);
            score += Math.floor(timeLeft) * scoreCfg.per_second_left + player.flames * scoreCfg.per_flame_left;
            endGame(true, "all_lit");
            return;
          }
        } else {
          sfx.deposit();
          showToast(`Nạp +${amount} vào ${nearestUnlit.id} (${nearestUnlit.deposited}/${tuning.lantern_cost})`);
        }
      }
    }

    // Light Pulse
    if (justPulse && player.carried >= tuning.pulse_cost && player.pulseCd <= 0) {
      player.carried -= tuning.pulse_cost;
      player.pulseCd = tuning.pulse_cooldown_s;
      pulseWaveT = 1.0;
      pulseWave.position.set(player.x, 0.25, player.z);
      sfx.pulse();
      let hitCount = 0;
      for (const sh of shades) {
        const dx = sh.x - player.x;
        const dz = sh.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d <= tuning.pulse_radius) {
          sh.state = "stunned";
          sh.stunTimer = tuning.pulse_stun_s;
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          sh.x += ux * tuning.pulse_push_m;
          sh.z += uz * tuning.pulse_push_m;
          score += scoreCfg.per_stun;
          hitCount += 1;
        }
      }
      showToast(hitCount > 0 ? `🌟 Tỏa sáng làm choáng ${hitCount} Bóng Mực!` : "🌟 Tỏa sáng!");
    }

    // Shades AI & safe zone & hit
    const litLanterns = lanterns.filter((l) => l.lit);
    for (const sh of shades) {
      if (sh.stunTimer > 0) {
        sh.stunTimer = Math.max(0, sh.stunTimer - DT);
        sh.state = sh.stunTimer > 0 ? "stunned" : "chase";
        continue;
      }
      const repeller = litLanterns.find((l) => distXZ(sh.x, sh.z, l.x, l.z) < tuning.safe_radius);
      if (repeller) {
        const dx = sh.x - repeller.x;
        const dz = sh.z - repeller.z;
        const d = Math.hypot(dx, dz) || 1;
        sh.x += (dx / d) * tuning.shade_speed * DT;
        sh.z += (dz / d) * tuning.shade_speed * DT;
        sh.state = "flee";
      } else {
        const dx = player.x - sh.x;
        const dz = player.z - sh.z;
        const d = Math.hypot(dx, dz);
        let nx = sh.x, nz = sh.z;
        if (d > 1e-6) {
          const step = Math.min(tuning.shade_speed * DT, d);
          nx += (dx / d) * step;
          nz += (dz / d) * step;
        }
        let repelled = false;
        for (const l of litLanterns) {
          const ldx = nx - l.x, ldz = nz - l.z;
          const ld = Math.hypot(ldx, ldz);
          if (ld < tuning.safe_radius) {
            repelled = true;
            const ux = ld > 1e-6 ? ldx / ld : 1;
            const uz = ld > 1e-6 ? ldz / ld : 0;
            nx = l.x + ux * tuning.safe_radius;
            nz = l.z + uz * tuning.safe_radius;
          }
        }
        sh.x = nx; sh.z = nz;
        sh.state = repelled ? "flee" : "chase";
      }

      if (player.invuln <= 0 && distXZ(player.x, player.z, sh.x, sh.z) <= tuning.shade_hit_radius) {
        const dropped = Math.floor(player.carried * tuning.hit_drop_ratio);
        player.carried -= dropped;
        for (let i = 0; i < dropped; i++) {
          const a = (2 * Math.PI * i) / Math.max(1, dropped);
          const dr = tuning.pickup_radius + 1.5;
          const mx2 = player.x + Math.cos(a) * dr;
          const mz2 = player.z + Math.sin(a) * dr;
          const mesh = buildMoteMesh();
          mesh.position.set(mx2, 0.7, mz2);
          dynamicGroup.add(mesh);
          motes.push({ x: mx2, z: mz2, active: true, phase: i, mesh });
        }
        player.flames = Math.max(0, player.flames - 1);
        player.invuln = tuning.invuln_s;
        sfx.hit();
        showToast(`💜 Bóng Mực chạm vào Mây! Còn ${player.flames} lửa.`);
        if (player.flames <= 0) {
          endGame(false, "no_flames");
          return;
        }
      }
    }

    // Periodic spawns
    if (simTick % MOTE_RESPAWN_TICKS === 0 && motes.filter((m) => m.active).length < MAX_MOTES) {
      spawnRandomMote();
    }
    if (simTick % SHADE_SPAWN_TICKS === 0 && shades.length < MAX_SHADES) {
      spawnRandomShade();
      showToast("🌑 Một Bóng Mực mới xuất hiện trong sương đen!");
    }

    timeLeft = Math.max(0, tuning.night1_duration_s - simTick / 60);
    if (timeLeft <= 0) {
      endGame(false, "dawn");
    }
  }

  function updateVisuals(nowSec) {
    // Island brightens progressively as lanterns are lit (PRD-0 §3)
    const litRatio = lanterns.length ? lanterns.filter((l) => l.lit).length / lanterns.length : 0;
    hemiLight.intensity = 0.52 + litRatio * 0.85;
    hemiLight.color.setHex(litRatio > 0.5 ? 0xfde68a : 0x7c6fb8);
    scene.fog.density = 0.024 - litRatio * 0.012;
    scene.background.setRGB(0.05 + litRatio * 0.09, 0.035 + litRatio * 0.06, 0.1 + litRatio * 0.06);

    cloudGroup.rotation.y = nowSec * 0.015;

    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.visible = player.invuln <= 0 || Math.floor(nowSec * 14) % 2 === 0;
    playerMesh.userData.miniPivot.rotation.z = Math.sin(nowSec * 4.5) * 0.12;
    playerMesh.userData.playerLight.intensity = 1.5 + player.carried * 0.25;

    for (const lan of lanterns) {
      const u = lan.mesh.userData;
      const frac = lan.lit ? 1 : lan.deposited / tuning.lantern_cost;
      u.coreMat.emissiveIntensity = lan.lit ? 2.4 + Math.sin(nowSec * 3) * 0.2 : 0.1 + frac * 0.9;
      u.coreMat.color.setHex(lan.lit ? 0xfef08a : 0x4b3f61);
      u.light.intensity = lan.lit ? 2.6 : frac * 0.6;
      u.ring.material.opacity = lan.lit ? 0.35 + Math.sin(nowSec * 2) * 0.08 : 0.0;
      u.beam.material.opacity = lan.lit ? 0.14 : 0.0;
    }

    for (const m of motes) {
      if (!m.active) continue;
      m.mesh.position.set(m.x, 0.75 + Math.sin(nowSec * 3.2 + m.phase) * 0.28, m.z);
    }

    for (const sh of shades) {
      sh.mesh.position.set(sh.x, 1.0 + Math.sin(nowSec * 3.6) * 0.22, sh.z);
      const u = sh.mesh.userData;
      if (sh.state === "stunned") {
        u.body.rotation.y += 0.22;
        u.bodyMat.emissive.setHex(0xfde047);
        u.stunRing.material.opacity = 0.85;
      } else {
        u.body.rotation.y = Math.atan2(player.x - sh.x, player.z - sh.z);
        u.bodyMat.emissive.setHex(sh.state === "flee" ? 0x9333ea : 0x4c1d95);
        u.stunRing.material.opacity = 0.0;
      }
    }

    if (pulseWaveT > 0) {
      pulseWaveT = Math.max(0, pulseWaveT - DT * 2.2);
      const scale = (1 - pulseWaveT) * tuning.pulse_radius + 0.5;
      pulseWave.scale.set(scale, scale, 1);
      pulseWave.material.opacity = pulseWaveT * 0.8;
    } else {
      pulseWave.material.opacity = 0;
    }

    // Third-person camera orbit (yaw=0 looks toward +Z from behind Mây at -Z)
    const rad = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.2;
    const targetCamX = player.x - Math.sin(rad) * camDist;
    const targetCamZ = player.z - Math.cos(rad) * camDist;
    camera.position.lerp(new THREE.Vector3(targetCamX, player.y + camHeight, targetCamZ), 0.14);
    camera.lookAt(player.x, player.y + 1.4, player.z);
  }

  function updateHUD() {
    hudFlames.textContent = player.flames > 0 ? "🔥".repeat(player.flames) : "—";
    hudCarried.textContent = `${player.carried} / ${tuning.carry_capacity}`;
    const lit = lanterns.filter((l) => l.lit).length;
    hudLanterns.textContent = `${lit} / ${lanterns.length}`;
    const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
    const ss = String(Math.floor(timeLeft % 60)).padStart(2, "0");
    hudTime.textContent = `${mm}:${ss}`;
    hudScore.textContent = String(score);

    const readyFrac = tuning.pulse_cooldown_s > 0 ? 1 - player.pulseCd / tuning.pulse_cooldown_s : 1;
    hudPulseBar.style.width = `${Math.max(0, Math.min(100, readyFrac * 100))}%`;
    if (player.pulseCd > 0) {
      hudPulseText.textContent = `Hồi chiêu ${player.pulseCd.toFixed(1)}s`;
    } else if (player.carried < tuning.pulse_cost) {
      hudPulseText.textContent = `Cần ${tuning.pulse_cost} đom đóm`;
    } else {
      hudPulseText.textContent = `Sẵn sàng (tốn ${tuning.pulse_cost})`;
    }
  }

  let acc = 0;
  let lastT = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const elapsed = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (toastTimer > 0) {
      toastTimer -= elapsed;
      if (toastTimer <= 0) toastEl.classList.add("hidden");
    }
    acc += elapsed;
    while (acc >= DT) {
      stepSim();
      acc -= DT;
    }
    if (tuning) {
      updateVisuals(now / 1000);
      if (gameState === "playing") updateHUD();
    }
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  fetch("/game.contract.json")
    .then((r) => r.json())
    .then((contract) => {
      tuning = contract.tuning;
      scoreCfg = tuning.score;
      requestAnimationFrame(animate);
    })
    .catch((err) => {
      modalTitle.textContent = "Lỗi tải game.contract.json";
      modalDesc.textContent = String(err);
    });
})();
