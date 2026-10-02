'use client';

import { useEffect, useRef } from 'react';
import { motion } from './motion';

interface Star { x: number; y: number; z: number; r: number; tw: number; color: string }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

const WHITE = '245,245,242';
const VIOLET = '164,147,255';
const LIME = '198,255,61';

// Three depths of stars drifting with scroll (parallax), streaking when you scroll fast,
// plus the odd shooting star. Static when the visitor prefers reduced motion.
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let vel = 0;
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    const stars: Star[] = [];
    const meteors: Meteor[] = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars.length = 0;
      const count = Math.min(700, Math.round((w * h) / 2200));
      for (let i = 0; i < count; i++) {
        const z = Math.pow(Math.random(), 1.8) * 0.9 + 0.1;
        const roll = Math.random();
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: 0.35 + z * 1.25,
          tw: Math.random() * Math.PI * 2,
          color: roll < 0.04 ? LIME : roll < 0.16 ? VIOLET : WHITE,
        });
      }
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);
      vel += (motion.velocity - vel) * 0.12;
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      const streak = Math.min(Math.abs(vel), 60);

      for (const s of stars) {
        if (!reduce) {
          s.y -= (0.06 + vel * 0.22) * s.z;
          if (s.y < -10) { s.y = h + 10; s.x = Math.random() * w; }
          else if (s.y > h + 10) { s.y = -10; s.x = Math.random() * w; }
        }
        const px = s.x + mx * s.z * 18;
        const py = s.y + my * s.z * 18;
        const twinkle = reduce ? 1 : 0.72 + 0.28 * Math.sin(t * 0.0016 + s.tw);
        const a = (0.25 + 0.75 * s.z) * twinkle;
        if (streak > 3 && s.z > 0.25) {
          const len = streak * s.z * 1.4 * Math.sign(vel);
          ctx!.strokeStyle = `rgba(${s.color},${a * 0.8})`;
          ctx!.lineWidth = s.r;
          ctx!.beginPath();
          ctx!.moveTo(px, py);
          ctx!.lineTo(px, py + len);
          ctx!.stroke();
        } else {
          ctx!.fillStyle = `rgba(${s.color},${a})`;
          ctx!.beginPath();
          ctx!.arc(px, py, s.r, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      if (!reduce) {
        if (Math.random() < 0.004 && meteors.length < 2) {
          meteors.push({ x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, vx: -(6 + Math.random() * 5), vy: 2.5 + Math.random() * 2, life: 1 });
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i]!;
          m.x += m.vx;
          m.y += m.vy;
          m.life -= 0.012;
          if (m.life <= 0) { meteors.splice(i, 1); continue; }
          const g = ctx!.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
          g.addColorStop(0, `rgba(${WHITE},${m.life})`);
          g.addColorStop(1, `rgba(${WHITE},0)`);
          ctx!.strokeStyle = g;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.moveTo(m.x, m.y);
          ctx!.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
          ctx!.stroke();
        }
        raf = requestAnimationFrame(draw);
      }
    }

    function onMove(e: PointerEvent) {
      tmx = e.clientX / w - 0.5;
      tmy = e.clientY / h - 0.5;
    }
    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(draw);
    }

    function onResize() {
      resize();
      if (reduce) draw(0);
    }

    resize();
    draw(0);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
