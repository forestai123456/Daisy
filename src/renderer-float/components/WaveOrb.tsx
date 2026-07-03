import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { palettes, type Palette } from "../lib/colors";
import { useTtsAnalyzer } from "../hooks/useTtsAnalyzer";

interface WaveOrbProps {
  state: string;
  visible: boolean;
}

type StateKey = "idle" | "listening" | "thinking" | "speaking" | "error";

interface TargetConfig {
  speed: number;
  spread: number; // how far clouds wander from center
  pulse: number;  // base scale pulse amplitude
  rotation: number;
}

export const WaveOrb: React.FC<WaveOrbProps> = ({ state, visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const volumeRef = useTtsAnalyzer();

  const stateRef = useRef<StateKey>("idle");
  const opacityRef = useRef(0);
  const targetOpacityRef = useRef(0);
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  const speedRef = useRef(0.4);
  const spreadRef = useRef(0.35);
  const pulseRef = useRef(0.03);
  const rotationRef = useRef(0);
  const scaleRef = useRef(1);

  const targetSpeedRef = useRef(0.4);
  const targetSpreadRef = useRef(0.35);
  const targetPulseRef = useRef(0.03);
  const targetRotationRef = useRef(0);

  useEffect(() => {
    let next: StateKey = "idle";
    if (state === "processing") next = "thinking";
    else if (["idle", "listening", "thinking", "speaking", "error"].includes(state)) {
      next = state as StateKey;
    }
    stateRef.current = next;

    const cfg = configForState(next);
    targetSpeedRef.current = cfg.speed;
    targetSpreadRef.current = cfg.spread;
    targetPulseRef.current = cfg.pulse;
    targetRotationRef.current = cfg.rotation;
  }, [state]);

  useEffect(() => {
    targetOpacityRef.current = visible ? 1 : 0;
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };

    resize();
    const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let debugLogged = false;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dpr = window.devicePixelRatio || 1;

      if (!debugLogged) {
        debugLogged = true;
        console.log("WAVE_DEBUG:", JSON.stringify({
          canvasW: canvas.width, canvasH: canvas.height,
          rectW: w, rectH: h,
          dpr,
          windowInnerW: window.innerWidth, windowInnerH: window.innerHeight,
          clientW: document.documentElement.clientWidth,
          clientH: document.documentElement.clientHeight,
        }));
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderRef.current = render;

      opacityRef.current = lerp(opacityRef.current, targetOpacityRef.current, 0.12);
      speedRef.current = lerp(speedRef.current, targetSpeedRef.current, 0.05);
      spreadRef.current = lerp(spreadRef.current, targetSpreadRef.current, 0.05);
      pulseRef.current = lerp(pulseRef.current, targetPulseRef.current, 0.05);
      rotationRef.current = lerp(rotationRef.current, targetRotationRef.current, 0.04);

      if (opacityRef.current < 0.003 && targetOpacityRef.current < 0.01) {
        rafRef.current = null;
        return;
      }

      const palette = palettes[stateRef.current] || palettes.idle;
      const t = timeRef.current;

      // Base scale + breathing + volume reactivity
      let baseScale = 1;
      if (stateRef.current === "speaking") {
        baseScale += volumeRef.current * 0.18;
      }
      const breath = 1 + Math.sin(t * 1.5) * pulseRef.current;
      scaleRef.current = lerp(scaleRef.current, baseScale * breath, 0.12);

      let shakeX = 0;
      let shakeY = 0;
      if (stateRef.current === "error") {
        shakeX = Math.sin(t * 55) * 2.5;
        shakeY = Math.cos(t * 47) * 2.5;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.globalAlpha = opacityRef.current;
      ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
      ctx.scale(scaleRef.current, scaleRef.current);
      ctx.translate(-w / 2, -h / 2);

      drawOrb(ctx, w, h, t, palette, stateRef.current, {
        speed: speedRef.current,
        spread: spreadRef.current,
        rotation: rotationRef.current,
        volume: volumeRef.current,
      });

      ctx.restore();

      timeRef.current += 0.016;
      rafRef.current = requestAnimationFrame(render);
    };

    renderRef.current = render;
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderRef.current = null;
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (visible && !rafRef.current && renderRef.current) {
      rafRef.current = requestAnimationFrame(renderRef.current);
    }
  }, [visible]);

  return (
    <motion.div
      className="orb-container"
      initial={{ scale: 0.5 }}
      animate={visible ? { scale: 1 } : { scale: 0.5 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <canvas ref={canvasRef} className="orb-canvas" />
    </motion.div>
  );
};

function configForState(state: StateKey): TargetConfig {
  switch (state) {
    case "listening":
      return { speed: 0.9, spread: 0.45, pulse: 0.05, rotation: 0 };
    case "thinking":
      return { speed: 1.8, spread: 0.5, pulse: 0.04, rotation: 0.4 };
    case "speaking":
      return { speed: 1.3, spread: 0.48, pulse: 0.08, rotation: 0 };
    case "error":
      return { speed: 2.5, spread: 0.4, pulse: 0.06, rotation: 0 };
    case "idle":
    default:
      return { speed: 0.35, spread: 0.32, pulse: 0.03, rotation: 0 };
  }
}

function drawOrb(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  palette: Palette,
  state: StateKey,
  anim: { speed: number; spread: number; rotation: number; volume: number }
) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 18;
  const glowRadius = radius + 16;

  // ── Outer soft glow ──
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, glowRadius);
  glow.addColorStop(0, palette.glowRgba);
  glow.addColorStop(0.6, palette.glowRgba.replace(/[\d.]+\)$/, "0.08)"));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // ── Glass sphere body ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Rich base gradient with 3D lighting (light from upper-left)
  const baseGrad = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.38,
    radius * 0.04,
    cx + radius * 0.1,
    cy + radius * 0.12,
    radius * 1.1
  );
  baseGrad.addColorStop(0, palette.highlight);
  baseGrad.addColorStop(0.08, palette.main);
  baseGrad.addColorStop(0.35, palette.mid);
  baseGrad.addColorStop(0.65, palette.dark);
  baseGrad.addColorStop(1, palette.deepDark);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Internal flowing clouds
  drawClouds(ctx, cx, cy, radius, time, palette, state, anim);

  // Inner shadow for 3D depth (darkens toward bottom-right edge)
  const innerShadow = ctx.createRadialGradient(
    cx + radius * 0.06,
    cy + radius * 0.08,
    radius * 0.5,
    cx + radius * 0.08,
    cy + radius * 0.14,
    radius * 1.06
  );
  innerShadow.addColorStop(0, "rgba(0,0,0,0)");
  innerShadow.addColorStop(0.55, "rgba(0,0,0,0)");
  innerShadow.addColorStop(0.78, "rgba(0,0,0,0.07)");
  innerShadow.addColorStop(0.92, "rgba(0,0,0,0.18)");
  innerShadow.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = innerShadow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // ── Specular highlight (glass reflection) ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Main highlight
  const hlGrad = ctx.createRadialGradient(
    cx - radius * 0.28,
    cy - radius * 0.35,
    0,
    cx - radius * 0.22,
    cy - radius * 0.28,
    radius * 0.35
  );
  hlGrad.addColorStop(0, "rgba(255,255,255,0.85)");
  hlGrad.addColorStop(0.2, "rgba(255,255,255,0.45)");
  hlGrad.addColorStop(0.5, "rgba(255,255,255,0.06)");
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hlGrad;
  ctx.beginPath();
  ctx.ellipse(
    cx - radius * 0.24,
    cy - radius * 0.32,
    radius * 0.32,
    radius * 0.16,
    -Math.PI / 6,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Tiny secondary highlight sparkle
  ctx.beginPath();
  ctx.ellipse(
    cx - radius * 0.4,
    cy - radius * 0.42,
    radius * 0.07,
    radius * 0.035,
    -Math.PI / 4,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fill();

  ctx.restore();

  // ── Rim light (Fresnel edge on upper arc) ──
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.2, -Math.PI * 0.82, -Math.PI * 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.stroke();

  // Secondary rim on lower arc (subtle bounce light)
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.5, Math.PI * 0.55, Math.PI * 0.95);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();
}

function cloudColorsForState(palette: Palette): string[] {
  return [
    palette.main,
    palette.purple,
    palette.pink,
    palette.mid,
    palette.pink,
    palette.purple,
    palette.main,
  ];
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  palette: Palette,
  state: StateKey,
  anim: { speed: number; spread: number; rotation: number; volume: number }
) {
  const blobCount = 7;
  const colors = cloudColorsForState(palette);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(anim.rotation * time * 0.1);
  ctx.translate(-cx, -cy);
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < blobCount; i++) {
    const phase = i * 1.9;
    // Slower, more organic movement
    const tt = time * anim.speed * (0.45 + i * 0.06) + phase;

    // Organic wandering orbit with wobble
    const wobX = Math.sin(tt * 2.1 + i * 0.7) * radius * 0.08;
    const wobY = Math.cos(tt * 1.8 + i * 0.9) * radius * 0.08;
    const dist = radius * anim.spread * (0.65 + 0.35 * Math.sin(tt * 0.35));
    const bx = cx + Math.cos(tt) * dist + Math.sin(tt * 2.7 + i) * radius * 0.1 + wobX;
    const by = cy + Math.sin(tt * 0.8) * dist * 0.8 + Math.cos(tt * 1.9 + i) * radius * 0.1 + wobY;

    const br = radius * (0.38 + 0.14 * Math.sin(tt * 0.55 + i));
    const alpha =
      state === "speaking" ? 0.35 + anim.volume * 0.22 : 0.3;

    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, hexToRgba(colors[i], alpha));
    grad.addColorStop(0.5, hexToRgba(colors[i], alpha * 0.5));
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
