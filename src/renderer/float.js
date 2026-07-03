/* global diriAPI */

// ── 极光配方配置 ──
const palettes = {
  idle: {
    main: "#6C6EF5", mid: "#30268a", dark: "#140c38", deepDark: "#0d0728",
    highlight: "#C5C1FF", glow: "rgba(108, 110, 245, 0.45)",
    filaments: ["#6C6EF5", "#EC4899", "#8B5CF6"],
    blobs: ["#6C6EF5", "#8B5CF6", "#EC4899"]
  },
  listening: {
    main: "#5B9EF5", mid: "#184594", dark: "#0a1738", deepDark: "#02071a",
    highlight: "#B8DBFF", glow: "rgba(91, 158, 245, 0.55)",
    filaments: ["#06B6D4", "#ec4899", "#10B981"],
    blobs: ["#5B9EF5", "#06B6D4", "#a855f7"]
  },
  thinking: {
    main: "#F5A062", mid: "#9e4313", dark: "#3d1404", deepDark: "#1a0600",
    highlight: "#FFE0C0", glow: "rgba(245, 160, 98, 0.55)",
    filaments: ["#FBBF24", "#EC4899", "#8B5CF6"],
    blobs: ["#F5A062", "#E08030", "#EF4444"]
  },
  speaking: {
    main: "#4ED090", mid: "#0e5a37", dark: "#032112", deepDark: "#010d06",
    highlight: "#B0FFD4", glow: "rgba(78, 208, 144, 0.55)",
    filaments: ["#10B981", "#06B6D4", "#8B5CF6"],
    blobs: ["#4ED090", "#34D399", "#06B6D4"]
  },
  error: {
    main: "#F56060", mid: "#8a1b1b", dark: "#380606", deepDark: "#170101",
    highlight: "#FFC0C0", glow: "rgba(245, 96, 96, 0.55)",
    filaments: ["#EF4444", "#FBBF24", "#EC4899"],
    blobs: ["#F56060", "#DC2626", "#8B5CF6"]
  }
};

const targetConfigs = {
  idle:      { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 },
  listening: { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 },
  thinking:  { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 },
  speaking:  { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 },
  error:     { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 }
};

// ── 运行状态 ──
let currentState = 'idle';
let speedMultiplier = 0.1; // 固定 0.1x
let visible = false;

let animSpeed = targetConfigs.idle.speed;
let animSpread = targetConfigs.idle.spread;
let animPulse = targetConfigs.idle.pulse;
let animRotation = targetConfigs.idle.rotation;
let orbScale = 1;
let opacity = 0;
let wakeScale = 1.0;
let targetWakeScale = 1.0;
let wakeShrinkTimer = null;

let gaseousTime = 0;
let globalRotationAngle = 0;
let time = 0;
let lastFrameTime = performance.now();
let smoothedVolume = 0;

// TTS audio analysis
let audioCtx = null;
let analyser = null;
let audioSource = null;
let currentAudio = null;
let currentAudioPath = null;
let interrupted = false;

const canvas = document.getElementById("orbCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 120;
  const h = rect.height || 120;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
}

window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 50);

const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

// ── IPC 通信 ──
diriAPI.onStateUpdate((payload) => {
  try {
    const data = JSON.parse(payload);
    let state = data.state || "idle";
    if (state === "processing") state = "thinking";
    currentState = state;
  } catch {}
});

diriAPI.onShowWindow(() => {
  visible = true;
  // Reset to full 140px size, shrink to 120px after 1.5s
  wakeScale = 1.0;
  targetWakeScale = 1.0;
  if (wakeShrinkTimer) clearTimeout(wakeShrinkTimer);
  wakeShrinkTimer = setTimeout(() => {
    targetWakeScale = 90 / 120;
  }, 1500);
});

diriAPI.onHideWindow(() => {
  visible = false;
  if (wakeShrinkTimer) { clearTimeout(wakeShrinkTimer); wakeShrinkTimer = null; }
});

diriAPI.onTtsPlay((filePath) => {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if (audioSource) { try { audioSource.disconnect(); } catch {} audioSource = null; }
  if (analyser) { try { analyser.disconnect(); } catch {} analyser = null; }
  if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }

  interrupted = false;
  currentAudioPath = filePath;
  currentAudio = new Audio("file://" + filePath);

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioSource = audioCtx.createMediaElementSource(currentAudio);
    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
    audioCtx.resume().catch(() => {});
  } catch {}

  currentAudio.onended = () => {
    currentAudio = null;
    if (!interrupted) diriAPI.sendTtsPlayEnded(currentAudioPath);
    currentAudioPath = null;
    cleanupAudio();
  };
  currentAudio.onerror = () => {
    currentAudio = null;
    if (!interrupted) diriAPI.sendTtsPlayEnded(currentAudioPath);
    currentAudioPath = null;
    cleanupAudio();
  };
  currentAudio.play().catch(() => {
    currentAudio = null;
    if (!interrupted) diriAPI.sendTtsPlayEnded(currentAudioPath);
    currentAudioPath = null;
    cleanupAudio();
  });
});

diriAPI.onTtsEnd(() => {
  interrupted = true;
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  currentAudioPath = null;
  cleanupAudio();
});

function cleanupAudio() {
  if (audioSource) { try { audioSource.disconnect(); } catch {} audioSource = null; }
  if (analyser) { try { analyser.disconnect(); } catch {} analyser = null; }
  if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
  smoothedVolume = 0;
}

function getAudioVolume() {
  if (analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }
  if (currentState === 'listening') {
    return 0.12 * Math.sin(time * 0.2) * Math.cos(time * 0.1) +
           0.07 * Math.sin(time * 0.5) + 0.13;
  }
  return 0;
}

// ── 渲染主循环 ──
function render() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Opacity transition
  opacity = lerp(opacity, visible ? 1 : 0, 0.12);
  if (opacity < 0.003 && !visible) {
    requestAnimationFrame(render);
    return;
  }

  const rawVolume = getAudioVolume();
  smoothedVolume = lerp(smoothedVolume, rawVolume, 0.08);

  const now = performance.now();
  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const dt = Math.min(0.08, rawDt) * speedMultiplier;

  const targetConfig = targetConfigs[currentState] || targetConfigs.idle;
  animSpeed = lerp(animSpeed, targetConfig.speed, 0.04);
  animSpread = lerp(animSpread, targetConfig.spread, 0.04);
  animPulse = lerp(animPulse, targetConfig.pulse, 0.04);
  animRotation = lerp(animRotation, targetConfig.rotation, 0.03);

  gaseousTime += animSpeed * dt * 60;
  globalRotationAngle += animRotation * dt * 9;
  time += dt * 60;

  let baseScale = 1.0;
  if (currentState === 'speaking') baseScale += smoothedVolume * 0.13;
  else if (currentState === 'listening') baseScale += smoothedVolume * 0.08;
  const breath = 1.0 + Math.sin(time * 0.4) * animPulse;
  orbScale = lerp(orbScale, baseScale * breath, 0.04);
  // Smooth transition for wake scale (140px → 120px)
  wakeScale = lerp(wakeScale, targetWakeScale, 0.04);

  let shakeX = 0, shakeY = 0;
  if (currentState === 'error') {
    shakeX = Math.sin(time * 65) * 2.5;
    shakeY = Math.cos(time * 55) * 2.5;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.scale(dpr, dpr);
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(orbScale * wakeScale, orbScale * wakeScale);
  ctx.translate(-w / 2, -h / 2);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 20;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  drawSphereBase(cx, cy, radius);
  drawBackgroundBlobs(cx, cy, radius, smoothedVolume);
  drawNeonFilaments(cx, cy, radius, smoothedVolume);
  drawInnerShadow(cx, cy, radius);
  drawGlassWallRefraction(cx, cy, radius);

  ctx.restore();

  drawGlassHighlights(cx, cy, radius);
  ctx.restore();

  requestAnimationFrame(render);
}

function drawOuterGlow(cx, cy, radius, vol) {
  const glowRad = radius * 1.28 + (vol * 6.5);
  const palette = palettes[currentState] || palettes.idle;
  const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, glowRad);
  glowGrad.addColorStop(0, palette.glow);
  glowGrad.addColorStop(0.65, palette.glow.replace(/[\d.]+\)$/, "0.08)"));
  glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
  ctx.fill();
}

function drawSphereBase(cx, cy, radius) {
  const palette = palettes[currentState] || palettes.idle;
  const baseGrad = ctx.createRadialGradient(
    cx - radius * 0.2, cy - radius * 0.25, radius * 0.05,
    cx + radius * 0.05, cy + radius * 0.05, radius * 1.10
  );
  baseGrad.addColorStop(0, palette.mid);
  baseGrad.addColorStop(0.3, palette.dark);
  baseGrad.addColorStop(0.8, palette.deepDark);
  baseGrad.addColorStop(1, palette.deepDark);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawBackgroundBlobs(cx, cy, radius, vol) {
  const palette = palettes[currentState] || palettes.idle;
  const colors = palette.blobs;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(globalRotationAngle * 0.6);
  ctx.translate(-cx, -cy);
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < colors.length; i++) {
    const phase = i * 1.6;
    const blobTime = gaseousTime * (0.35 + i * 0.03) + phase;
    const pathX = Math.sin(blobTime * 1.1) * radius * animSpread * (0.65 + 0.2 * Math.cos(blobTime * 0.5));
    const pathY = Math.cos(blobTime * 0.85) * radius * animSpread * 0.8 * (0.65 + 0.2 * Math.sin(blobTime * 0.9));
    const bx = cx + pathX;
    const by = cy + pathY;
    const br = radius * (0.75 + 0.15 * Math.sin(blobTime * 0.4)) * (1.0 + vol * 0.25);
    const alpha = 0.26;
    const blobGrad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    const rgb = hexToRgb(colors[i]);
    blobGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    blobGrad.addColorStop(0.55, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
    blobGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = blobGrad;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

function drawNeonFilaments(cx, cy, radius, vol) {
  const palette = palettes[currentState] || palettes.idle;
  const colors = palette.filaments;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(cx, cy);
  ctx.rotate(globalRotationAngle);
  ctx.translate(-cx, -cy);

  for (let i = 0; i < colors.length; i++) {
    const rgb = hexToRgb(colors[i]);
      const speedFactor = gaseousTime * (0.60 + i * 0.05) + i * 2.0;

    const drawPath = () => {
      ctx.beginPath();
      const points = 144;
      for (let j = 0; j <= points; j++) {
        const angle = (j / points) * Math.PI * 2;
        let wave1, wave2;
        if (i === 0) {
          wave1 = Math.sin(angle * 3.0 + speedFactor * 1.3) * 5.6;
          wave2 = Math.cos(angle * 2.0 - speedFactor * 0.7) * 3.4;
        } else if (i === 1) {
          wave1 = Math.sin(angle * 4.0 - speedFactor * 0.9) * 4.5;
          wave2 = Math.cos(angle * 3.0 + speedFactor * 1.1) * 3.8;
        } else {
          wave1 = Math.sin(angle * 2.0 + speedFactor * 0.6) * 6.0;
          wave2 = Math.cos(angle * 5.0 - speedFactor * 1.4) * 3.0;
        }
        const waveVolume = (currentState === 'speaking' || currentState === 'listening') ? vol * 9.5 : 0;
        const r_base = radius * (0.81 - i * 0.04);
        const r = r_base + wave1 + wave2 + waveVolume * Math.sin(angle * 4.0 + gaseousTime * 4);
        const cos_tilt = (i === 0) ? 0.95 : 0.68;
        const x_local = Math.cos(angle) * r;
        const y_local = Math.sin(angle) * r * cos_tilt;
        const tilt_angle = (i === 0) ? -Math.PI / 12 : (i === 1 ? Math.PI / 3.2 : -Math.PI / 3.2);
        const x = cx + x_local * Math.cos(tilt_angle) - y_local * Math.sin(tilt_angle);
        const y = cy + x_local * Math.sin(tilt_angle) + y_local * Math.cos(tilt_angle);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    drawPath();
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    drawPath();
    const centerAlpha = (currentState === 'speaking' || currentState === 'listening') ? 0.72 + vol * 0.25 : 0.68;
    ctx.strokeStyle = `rgba(${Math.floor(lerp(rgb.r, 255, 0.45))}, ${Math.floor(lerp(rgb.g, 255, 0.45))}, ${Math.floor(lerp(rgb.b, 255, 0.45))}, ${centerAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawInnerShadow(cx, cy, radius) {
  const innerShadow = ctx.createRadialGradient(
    cx + radius * 0.05, cy + radius * 0.08, radius * 0.7,
    cx + radius * 0.08, cy + radius * 0.12, radius * 1.05
  );
  innerShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
  innerShadow.addColorStop(0.75, "rgba(0, 0, 0, 0)");
  innerShadow.addColorStop(0.9, "rgba(0, 0, 0, 0.15)");
  innerShadow.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = innerShadow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawGlassWallRefraction(cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const wallGrad = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius);
  wallGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  wallGrad.addColorStop(0.88, "rgba(255, 255, 255, 0.03)");
  wallGrad.addColorStop(1, "rgba(255, 255, 255, 0.14)");
  ctx.fillStyle = wallGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEdgeGlowRing(cx, cy, radius, vol) {
  const palette = palettes[currentState] || palettes.idle;
  const color1 = palette.main;
  const color2 = palette.blobs[1] || palette.filaments[1] || color1;
  const color3 = palette.blobs[2] || palette.filaments[2] || color1;

  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const c3 = hexToRgb(color3);

  // HDR-style white-hot highlight cores
  const coreR = Math.floor(c1.r * 0.12 + 255 * 0.88);
  const coreG = Math.floor(c1.g * 0.12 + 255 * 0.88);
  const coreB = Math.floor(c1.b * 0.12 + 255 * 0.88);
  const coreColor1 = `rgba(${coreR}, ${coreG}, ${coreB}, 0.95)`;
  const coreColor2 = `rgba(${Math.floor(c1.r * 0.35 + 255 * 0.65)}, ${Math.floor(c1.g * 0.35 + 255 * 0.65)}, ${Math.floor(c1.b * 0.35 + 255 * 0.65)}, 0.75)`;
  const coreColor3 = `rgba(${Math.floor(c1.r * 0.55 + 255 * 0.45)}, ${Math.floor(c1.g * 0.55 + 255 * 0.45)}, ${Math.floor(c1.b * 0.55 + 255 * 0.45)}, 0.50)`;

  const baseAlpha = 0.45 + vol * 0.18;

  // Conic gradient helper
  const getScatteredGradient = (alpha, phaseOffset) => {
    const grad = ctx.createConicGradient(0, 0, 0);

    const stops = [
      { pos: 0.0, color: c1, factor: 0.85 },
      { pos: 0.12, color: c2, factor: 0.60 },
      { pos: 0.25, color: c2, factor: 1.00 },
      { pos: 0.38, color: c1, factor: 0.40 },
      { pos: 0.50, color: c1, factor: 0.80 },
      { pos: 0.65, color: c3, factor: 0.50 },
      { pos: 0.75, color: c3, factor: 0.98 },
      { pos: 0.88, color: c1, factor: 0.30 },
      { pos: 1.0, color: c1, factor: 0.85 }
    ];

    stops.forEach(s => {
      const shimmer = 0.85 + 0.15 * Math.sin(time * 0.12 + phaseOffset + s.pos * Math.PI * 2);
      grad.addColorStop(s.pos, `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${alpha * s.factor * shimmer})`);
    });
    return grad;
  };

  const t = time;
  // 所有层级均以此半径绘制，通过不同宽度融合成单个玻璃发光管
  const r = radius - 1.2;

  const glowColor = `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0.8)`;

  // --- 1. 外向/内向漫反射层 (Layers 3-4: 中层渐紧辉光) ---
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.015) * 0.03);
  ctx.shadowColor = glowColor;

  // Layer 3: 中层漫反射 (Width 18px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = getScatteredGradient(baseAlpha * 0.14, 3.0);
  ctx.lineWidth = 18; ctx.shadowBlur = 12; ctx.stroke();

  // Layer 4: 渐紧辉光 (Width 13px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = getScatteredGradient(baseAlpha * 0.24, 4.0);
  ctx.lineWidth = 13; ctx.shadowBlur = 10; ctx.stroke();
  ctx.restore();

  // --- 2. 核心过渡层 (Layers 5-7: 强光集聚区) ---
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.025 + 1.0) * 0.05);
  ctx.shadowColor = glowColor;

  // Layer 5: 实体荧光边 (Width 9px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = getScatteredGradient(baseAlpha * 0.40, 5.0);
  ctx.lineWidth = 9; ctx.shadowBlur = 8; ctx.stroke();

  // Layer 6: 高饱和霓虹 (Width 6px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = getScatteredGradient(baseAlpha * 0.60, 6.0);
  ctx.lineWidth = 6; ctx.shadowBlur = 6; ctx.stroke();

  // Layer 7: 亮核包裹圈 (Width 4px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = getScatteredGradient(baseAlpha * 0.80, 7.0);
  ctx.lineWidth = 4; ctx.shadowBlur = 4; ctx.stroke();
  ctx.restore();

  // --- 3. 白炽高亮灯丝 (Layers 8-10: HDR 风格核心) ---
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.035 + 2.0) * 0.07);
  ctx.shadowColor = glowColor;

  // Layer 8: 软热核心 (Width 2.8px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = coreColor3;
  ctx.lineWidth = 2.8; ctx.shadowBlur = 3; ctx.stroke();

  // Layer 9: 白炽中核 (Width 1.8px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = coreColor2;
  ctx.lineWidth = 1.8; ctx.shadowBlur = 2; ctx.stroke();

  // Layer 10: 极亮针尖白丝 (Width 1.0px)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = coreColor1;
  ctx.lineWidth = 1.0; ctx.shadowBlur = 2;
  ctx.stroke();
  ctx.restore();
}

function drawGlassHighlights(cx, cy, radius) {
  const palette = palettes[currentState] || palettes.idle;
  const bounceRgb = hexToRgb(palette.main);
  const bounceX = cx + radius * 0.3;
  const bounceY = cy + radius * 0.35;
  const bounceRad = radius * 0.65;
  const bounceGrad = ctx.createRadialGradient(bounceX, bounceY, 0, bounceX, bounceY, bounceRad);
  bounceGrad.addColorStop(0, `rgba(${bounceRgb.r}, ${bounceRgb.g}, ${bounceRgb.b}, 0.28)`);
  bounceGrad.addColorStop(0.45, `rgba(${bounceRgb.r}, ${bounceRgb.g}, ${bounceRgb.b}, 0.08)`);
  bounceGrad.addColorStop(0.85, "rgba(255, 255, 255, 0.02)");
  bounceGrad.addColorStop(1, "rgba(0,0,0,0)");

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = bounceGrad;
  ctx.beginPath();
  ctx.arc(bounceX, bounceY, bounceRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const hl1X = cx - radius * 0.25;
  const hl1Y = cy - radius * 0.32;
  const hl1RadX = radius * 0.35;
  const hlGrad1 = ctx.createRadialGradient(hl1X - radius * 0.05, hl1Y - radius * 0.05, 0, hl1X, hl1Y, hl1RadX);
  hlGrad1.addColorStop(0, "rgba(255, 255, 255, 0.88)");
  hlGrad1.addColorStop(0.3, "rgba(255, 255, 255, 0.40)");
  hlGrad1.addColorStop(0.65, "rgba(255, 255, 255, 0.05)");
  hlGrad1.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = hlGrad1;
  ctx.beginPath();
  ctx.ellipse(hl1X, hl1Y, hl1RadX, radius * 0.16, -Math.PI / 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.42, cy - radius * 0.45, radius * 0.07, radius * 0.035, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.0, -Math.PI * 0.85, -Math.PI * 0.15);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.2, Math.PI * 0.5, Math.PI * 0.95);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.0;
  ctx.stroke();
}

canvas.addEventListener("click", () => diriAPI.openSettings());

window.onerror = (message, source, lineno, colno, error) => {
  diriAPI.sendRendererError(`float.js error: ${message} at ${source}:${lineno}:${colno} ${error?.stack || ""}`);
};

resizeCanvas();
render();
