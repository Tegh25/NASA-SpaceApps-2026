import { useEffect, useRef } from 'react';
import type { TourController } from './controller';
import { TELEPORT_RADIUS_M } from './controller';

const SIZE = 168;
const RANGE_M = 6000;

interface Props {
  ctl: TourController | null;
  waypoints: { name: string; lat: number; lon: number }[];
}

export function Minimap({ ctl, waypoints }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c || !ctl) return;
      const g = c.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== SIZE * dpr) {
        c.width = c.height = SIZE * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = SIZE / 2 / RANGE_M;
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = 'rgba(7,10,16,0.85)';
      g.fillRect(0, 0, SIZE, SIZE);
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      for (let m = -RANGE_M; m <= RANGE_M; m += 1000) {
        g.beginPath();
        g.moveTo(cx + m * s, 0);
        g.lineTo(cx + m * s, SIZE);
        g.moveTo(0, cy + m * s);
        g.lineTo(SIZE, cy + m * s);
        g.stroke();
      }
      g.strokeStyle = 'rgba(159,180,199,0.5)';
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(cx, cy, TELEPORT_RADIUS_M * s, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(159,180,199,0.9)';
      g.beginPath();
      g.arc(cx, cy, 3, 0, Math.PI * 2);
      g.fill();
      for (const w of waypoints) {
        const o = ctl.distanceFromSpawn(w.lat, w.lon);
        g.fillStyle = '#E3B23C';
        g.fillRect(cx + o.e * s - 2.5, cy - o.n * s - 2.5, 5, 5);
      }
      const p = ctl.pose;
      const o = ctl.distanceFromSpawn(p.lat, p.lon);
      const x = cx + o.e * s;
      const y = cy - o.n * s;
      g.save();
      g.translate(x, y);
      g.rotate(p.heading);
      g.fillStyle = '#3CC8A0';
      g.strokeStyle = '#070A10';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(5.5, 6);
      g.lineTo(0, 3);
      g.lineTo(-5.5, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = 'rgba(232,237,245,0.7)';
      g.font = '10px JetBrains Mono, monospace';
      g.fillText('N', cx - 3, 11);
      g.fillText('1 km grid', 6, SIZE - 6);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ctl, waypoints]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctl) return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = SIZE / 2 / RANGE_M;
    const east = (e.clientX - r.left - SIZE / 2) / s;
    const north = -(e.clientY - r.top - SIZE / 2) / s;
    ctl.teleportOffset(north, east);
  };

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      style={{ width: SIZE, height: SIZE }}
      className="cursor-crosshair rounded-lg border border-white/10"
      aria-label="Minimap. Click to teleport within 5 kilometres of the start point."
      role="img"
    />
  );
}
