import React, { useEffect, useRef } from "react";

export const IdleOrb: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let lastFrameTime = performance.now();
    let gaseousTime = 0;
    let globalRotationAngle = 0;
    let time = 0;

    const palette = {
      main: "#5B9EF5",
      mid: "#184594",
      dark: "#0a1738",
      deepDark: "#02071a",
      highlight: "#B8DBFF",
      glow: "rgba(91, 158, 245, 0.45)",
      filaments: ["#06B6D4", "#EC4899", "#10B981"],
      blobs: ["#5B9EF5", "#06B6D4", "#a855f7"]
    };

    const targetConfig = { speed: 0.35, spread: 0.46, pulse: 0.04, rotation: 0.06 };
    const speedMultiplier = 0.1;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function hexToRgb(hex: string) {
      const clean = hex.replace("#", "");
      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16)
      };
    }

    const rgbBlobs = palette.blobs.map(hexToRgb);
    const rgbFilaments = palette.filaments.map(hexToRgb);

    function drawSphereBase(cx: number, cy: number, radius: number) {
      const baseGrad = ctx!.createRadialGradient(
        cx - radius * 0.2, cy - radius * 0.25, radius * 0.05,
        cx + radius * 0.05, cy + radius * 0.05, radius * 1.10
      );
      baseGrad.addColorStop(0, palette.mid);
      baseGrad.addColorStop(0.3, palette.dark);
      baseGrad.addColorStop(0.8, palette.deepDark);
      baseGrad.addColorStop(1, palette.deepDark);
      ctx!.fillStyle = baseGrad;
      ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    function drawBackgroundBlobs(cx: number, cy: number, radius: number) {
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(globalRotationAngle * 0.6);
      ctx!.translate(-cx, -cy);
      ctx!.globalCompositeOperation = "screen";

      for (let i = 0; i < rgbBlobs.length; i++) {
        const phase = i * 1.6;
        const blobTime = gaseousTime * (0.35 + i * 0.03) + phase;
        const pathX = Math.sin(blobTime * 1.1) * radius * targetConfig.spread * (0.65 + 0.2 * Math.cos(blobTime * 0.5));
        const pathY = Math.cos(blobTime * 0.85) * radius * targetConfig.spread * 0.8 * (0.65 + 0.2 * Math.sin(blobTime * 0.9));
        const bx = cx + pathX;
        const by = cy + pathY;
        const br = radius * (0.75 + 0.15 * Math.sin(blobTime * 0.4));
        const alpha = 0.26;
        const blobGrad = ctx!.createRadialGradient(bx, by, 0, bx, by, br);
        const rgb = rgbBlobs[i];
        blobGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
        blobGrad.addColorStop(0.55, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
        blobGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx!.fillStyle = blobGrad;
        ctx!.beginPath();
        ctx!.arc(bx, by, br, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
      ctx!.globalCompositeOperation = "source-over";
    }

    function drawNeonFilaments(cx: number, cy: number, radius: number) {
      ctx!.save();
      ctx!.globalCompositeOperation = "screen";
      ctx!.translate(cx, cy);
      ctx!.rotate(globalRotationAngle);
      ctx!.translate(-cx, -cy);

      for (let i = 0; i < rgbFilaments.length; i++) {
        const rgb = rgbFilaments[i];
        const speedFactor = gaseousTime * (0.60 + i * 0.05) + i * 2.0;

        const drawPath = () => {
          ctx!.beginPath();
          const points = 72; // Optimized for 40px dimensions
          for (let j = 0; j <= points; j++) {
            const angle = (j / points) * Math.PI * 2;
            let wave1, wave2;
            if (i === 0) {
              wave1 = Math.sin(angle * 3.0 + speedFactor * 1.3) * 1.2;
              wave2 = Math.cos(angle * 2.0 - speedFactor * 0.7) * 0.8;
            } else if (i === 1) {
              wave1 = Math.sin(angle * 4.0 - speedFactor * 0.9) * 1.0;
              wave2 = Math.cos(angle * 3.0 + speedFactor * 1.1) * 0.9;
            } else {
              wave1 = Math.sin(angle * 2.0 + speedFactor * 0.6) * 1.3;
              wave2 = Math.cos(angle * 5.0 - speedFactor * 1.4) * 0.7;
            }
            const r_base = radius * (0.81 - i * 0.04);
            const r = r_base + wave1 + wave2;
            const cos_tilt = (i === 0) ? 0.95 : 0.68;
            const x_local = Math.cos(angle) * r;
            const y_local = Math.sin(angle) * r * cos_tilt;
            const tilt_angle = (i === 0) ? -Math.PI / 12 : (i === 1 ? Math.PI / 3.2 : -Math.PI / 3.2);
            const x = cx + x_local * Math.cos(tilt_angle) - y_local * Math.sin(tilt_angle);
            const y = cy + x_local * Math.sin(tilt_angle) + y_local * Math.cos(tilt_angle);
            if (j === 0) ctx!.moveTo(x, y);
            else ctx!.lineTo(x, y);
          }
          ctx!.closePath();
        };

        // Outer soft glow
        drawPath();
        ctx!.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`;
        ctx!.lineWidth = 3.5;
        ctx!.lineCap = "round";
        ctx!.lineJoin = "round";
        ctx!.stroke();

        // Inner filament core
        drawPath();
        const centerAlpha = 0.68;
        ctx!.strokeStyle = `rgba(${Math.floor(lerp(rgb.r, 255, 0.45))}, ${Math.floor(lerp(rgb.g, 255, 0.45))}, ${Math.floor(lerp(rgb.b, 255, 0.45))}, ${centerAlpha})`;
        ctx!.lineWidth = 0.75;
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function drawInnerShadow(cx: number, cy: number, radius: number) {
      const innerShadow = ctx!.createRadialGradient(
        cx + radius * 0.05, cy + radius * 0.08, radius * 0.7,
        cx + radius * 0.08, cy + radius * 0.12, radius * 1.05
      );
      innerShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
      innerShadow.addColorStop(0.75, "rgba(0, 0, 0, 0)");
      innerShadow.addColorStop(0.9, "rgba(0, 0, 0, 0.15)");
      innerShadow.addColorStop(1, "rgba(0, 0, 0, 0.45)");
      ctx!.fillStyle = innerShadow;
      ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    function drawGlassWallRefraction(cx: number, cy: number, radius: number) {
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx!.lineWidth = 1.0;
      ctx!.stroke();

      const wallGrad = ctx!.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius);
      wallGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      wallGrad.addColorStop(0.88, "rgba(255, 255, 255, 0.03)");
      wallGrad.addColorStop(1, "rgba(255, 255, 255, 0.14)");
      ctx!.fillStyle = wallGrad;
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function drawGlassHighlights(cx: number, cy: number, radius: number) {
      const bounceRgb = hexToRgb(palette.main);
      const bounceX = cx + radius * 0.3;
      const bounceY = cy + radius * 0.35;
      const bounceRad = radius * 0.65;
      const bounceGrad = ctx!.createRadialGradient(bounceX, bounceY, 0, bounceX, bounceY, bounceRad);
      bounceGrad.addColorStop(0, `rgba(${bounceRgb.r}, ${bounceRgb.g}, ${bounceRgb.b}, 0.28)`);
      bounceGrad.addColorStop(0.45, `rgba(${bounceRgb.r}, ${bounceRgb.g}, ${bounceRgb.b}, 0.08)`);
      bounceGrad.addColorStop(0.85, "rgba(255, 255, 255, 0.02)");
      bounceGrad.addColorStop(1, "rgba(0,0,0,0)");

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();
      ctx!.fillStyle = bounceGrad;
      ctx!.beginPath();
      ctx!.arc(bounceX, bounceY, bounceRad, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();

      const hl1X = cx - radius * 0.25;
      const hl1Y = cy - radius * 0.32;
      const hl1RadX = radius * 0.35;
      const hlGrad1 = ctx!.createRadialGradient(hl1X - radius * 0.05, hl1Y - radius * 0.05, 0, hl1X, hl1Y, hl1RadX);
      hlGrad1.addColorStop(0, "rgba(255, 255, 255, 0.88)");
      hlGrad1.addColorStop(0.3, "rgba(255, 255, 255, 0.40)");
      hlGrad1.addColorStop(0.65, "rgba(255, 255, 255, 0.05)");
      hlGrad1.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx!.fillStyle = hlGrad1;
      ctx!.beginPath();
      ctx!.ellipse(hl1X, hl1Y, hl1RadX, radius * 0.16, -Math.PI / 5.5, 0, Math.PI * 2);
      ctx!.fill();

      ctx!.beginPath();
      ctx!.ellipse(cx - radius * 0.42, cy - radius * 0.45, radius * 0.07, radius * 0.035, -Math.PI / 4, 0, Math.PI * 2);
      ctx!.fillStyle = "rgba(255, 255, 255, 0.72)";
      ctx!.fill();
      ctx!.restore();

      ctx!.beginPath();
      ctx!.arc(cx, cy, radius - 0.5, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx!.lineWidth = 0.8;
      ctx!.lineCap = "round";
      ctx!.stroke();

      ctx!.beginPath();
      ctx!.arc(cx, cy, radius - 0.6, Math.PI * 0.5, Math.PI * 0.95);
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx!.lineWidth = 0.5;
      ctx!.stroke();
    }

    function render() {
      const dpr = window.devicePixelRatio || 1;
      const w = 52;
      const h = 52;

      if (canvas!.width !== w * dpr || canvas!.height !== h * dpr) {
        canvas!.width = w * dpr;
        canvas!.height = h * dpr;
      }

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      const now = performance.now();
      const rawDt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      const dt = Math.min(0.08, rawDt) * speedMultiplier;

      gaseousTime += targetConfig.speed * dt * 60;
      globalRotationAngle += targetConfig.rotation * dt * 9;
      time += dt * 60;

      const breath = 1.0 + Math.sin(time * 0.4) * targetConfig.pulse;

      ctx!.save();
      ctx!.scale(dpr, dpr);
      ctx!.translate(w / 2, h / 2);
      ctx!.scale(breath, breath);
      ctx!.translate(-w / 2, -h / 2);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2 - 3;

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx!.clip();

      drawSphereBase(cx, cy, radius);
      drawBackgroundBlobs(cx, cy, radius);
      drawNeonFilaments(cx, cy, radius);
      drawInnerShadow(cx, cy, radius);
      drawGlassWallRefraction(cx, cy, radius);

      ctx!.restore();

      drawGlassHighlights(cx, cy, radius);
      ctx!.restore();

      animationFrameId = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-[52px] h-[52px] flex items-center justify-center select-none pointer-events-none">
      <div className="absolute inset-1 rounded-full bg-[#38bdf8]/15 blur-md" />
      <canvas
        ref={canvasRef}
        style={{ width: "52px", height: "52px" }}
        className="relative z-10 block"
      />
    </div>
  );
};
