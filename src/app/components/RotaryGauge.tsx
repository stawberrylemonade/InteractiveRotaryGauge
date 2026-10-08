import { useEffect, useRef, useState } from "react";

export function RotaryGauge() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const currentAngleRef = useRef<number | null>(null);
  const targetAngleRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const anglesRef = useRef<number[]>([]);

  const [, setActivePosition] = useState(3);
  const isClickedRef = useRef(false);
  const clickedPositionRef = useRef<number>(-1);
  const clickTimeoutRef = useRef<NodeJS.Timeout>();

  type PopCircle = { x: number; y: number; color: string; visible: boolean };
  const popCircleRef = useRef<PopCircle>({ x: 0, y: 0, color: "", visible: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buildAngles = () => {
      const startAngle = -(107 * Math.PI) / 180;
      const endAngle = -(73 * Math.PI) / 180;
      const angles: number[] = [];
      for (let i = 0; i < 5; i++) {
        angles.push(startAngle + ((endAngle - startAngle) * i) / 4);
      }
      return angles;
    };

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const displayW = canvas.offsetWidth;
      const displayH = canvas.offsetHeight;
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);

      const angles = buildAngles();
      anglesRef.current = angles;
      if (currentAngleRef.current === null) {
        currentAngleRef.current = angles[2];
        targetAngleRef.current = angles[2];
      }
    };

    syncSize();

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(canvas);

    const POSITION_COLORS = [
      "#22c55e", // agree — green
      "#a3e635", // slightly agree — yellow-green
      "#7dd3fc", // neutral — light blue
      "#fb923c", // slightly disagree — orange
      "#ef4444", // disagree — red
    ];
    const getColorForPosition = (index: number) => POSITION_COLORS[index] ?? POSITION_COLORS[2];

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      // Layout constants scaled to canvas logical size
      const pivotX = W / 2;
      const pivotOffset = H * 0.625;   // pivot sits below visible area
      const pivotY = H + pivotOffset;
      const needleLength = H * 0.875;
      const labelY = pivotY - needleLength * 1.085; // a touch above needle tip
      const labelSpacing = W * 0.13;
      const startX = pivotX - 2 * labelSpacing;

      const angles = anglesRef.current;
      const target = targetAngleRef.current ?? angles[2];

      // Weighted spring with slight overshoot
      if (currentAngleRef.current === null) currentAngleRef.current = angles[2];
      const stiffness = 0.28;
      const damping = 0.60;
      velocityRef.current += (target - currentAngleRef.current) * stiffness;
      velocityRef.current *= damping;
      currentAngleRef.current += velocityRef.current;
      const current = currentAngleRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, W, H);

      // Pop circle
      const pop = popCircleRef.current;
      if (pop.visible) {
        const radius = Math.min(W, H) * 0.2; // 20% of the smaller dimension
        ctx.fillStyle = pop.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(pop.x, pop.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Find which preset the target angle is at
      let currentPositionIndex = 2;
      for (let i = 0; i < angles.length; i++) {
        if (Math.abs(target - angles[i]) < 0.01) {
          currentPositionIndex = i;
          break;
        }
      }

      // Needle
      const needleX = pivotX + needleLength * Math.cos(current);
      const needleY = pivotY + needleLength * Math.sin(current);
      ctx.strokeStyle = isClickedRef.current ? getColorForPosition(currentPositionIndex) : "black";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(needleX, needleY);
      ctx.stroke();

      // Labels
      const fontSize = Math.max(12, Math.round(W * 0.025));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const labels = ["agree", "●", "●", "●", "disagree"];
      const normalLabels = ["agree", "—", "—", "—", "disagree"];

      for (let i = 0; i < 5; i++) {
        const isActive = Math.abs(target - angles[i]) < 0.01;
        const isClickedPosition = isClickedRef.current && clickedPositionRef.current === i;
        ctx.fillStyle = isClickedPosition ? getColorForPosition(i) : "black";
        ctx.font = `${isClickedPosition ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.globalAlpha = isActive ? 1 : 0.4;
        ctx.fillText(
          isClickedPosition ? labels[i] : normalLabels[i],
          startX + i * labelSpacing,
          labelY
        );
      }
      ctx.globalAlpha = 1;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      ro.disconnect();
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const angles = anglesRef.current;

    // Only the center 40% of the canvas width drives the needle
    const activeZone = 0.4;
    const zoneLeft = rect.width * (0.5 - activeZone / 2);
    const zoneRight = rect.width * (0.5 + activeZone / 2);
    const clamped = Math.max(zoneLeft, Math.min(zoneRight, mouseX));
    const mapped = angles[0] + ((angles[4] - angles[0]) * (clamped - zoneLeft)) / (zoneRight - zoneLeft);

    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < angles.length; i++) {
      const d = Math.abs(mapped - angles[i]);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    if (targetAngleRef.current !== angles[nearest]) {
      velocityRef.current = 0;
    }
    targetAngleRef.current = angles[nearest];
    setActivePosition(nearest + 1);
  };

  const handleClick = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);

    const angles = anglesRef.current;
    const target = targetAngleRef.current ?? angles[2];
    let posIndex = 2;
    for (let i = 0; i < angles.length; i++) {
      if (Math.abs(target - angles[i]) < 0.01) { posIndex = i; break; }
    }

    clickedPositionRef.current = posIndex;
    isClickedRef.current = true;

    const POSITION_COLORS = ["#22c55e","#a3e635","#7dd3fc","#fb923c","#ef4444"];
    const color = POSITION_COLORS[posIndex] ?? POSITION_COLORS[2];

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const radius = Math.min(W, H) * 0.2;

    // Random position keeping circle fully within canvas
    const cx = radius + Math.random() * (W - 2 * radius);
    const cy = radius + Math.random() * (H - 2 * radius);
    popCircleRef.current = { x: cx, y: cy, color, visible: true };

    clickTimeoutRef.current = setTimeout(() => {
      isClickedRef.current = false;
      clickedPositionRef.current = -1;
      popCircleRef.current.visible = false;
    }, 800);
  };

  return (
    <div className="w-full h-screen bg-white">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
    </div>
  );
}
