'use client';

import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Signups by source as 3D columns that grow when the chart scrolls into view.
// Example data for an illustrative dashboard, not ShipItLoud's own numbers.
export const SOURCES: { label: string; short?: string; value: number }[] = [
  { label: 'Reddit', value: 128 },
  { label: 'X', value: 96 },
  { label: 'Referrals', value: 88 },
  { label: 'Hacker News', short: 'HN', value: 74 },
  { label: 'LinkedIn', value: 52 },
  { label: 'Email', value: 41 },
];

export function Bars3D() {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const values = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.classList.add('bars-fallback');
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 9, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa493ff, 1.2);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    const max = Math.max(...SOURCES.map((s) => s.value));
    const n = SOURCES.length;
    const gap = 1.35;
    const offset = ((n - 1) * gap) / 2;
    const maxH = 4.2;

    // Floor: a soft plate with a fine grid.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(n * gap + 0.9, 0.08, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.9 }),
    );
    floor.position.y = -0.04;
    scene.add(floor);
    const grid = new THREE.GridHelper(n * gap + 0.9, n * 4, 0x2a2a38, 0x1f1f2a);
    grid.position.y = 0.002;
    grid.scale.z = 2.4 / (n * gap + 0.9);
    scene.add(grid);

    const geo = new THREE.BoxGeometry(0.78, 1, 0.78);
    geo.translate(0, 0.5, 0);
    const violet = new THREE.MeshStandardMaterial({ color: 0x5b3df5, roughness: 0.45, metalness: 0.1, emissive: 0x1d1160, emissiveIntensity: 0.6 });
    const lime = new THREE.MeshStandardMaterial({ color: 0xc6ff3d, roughness: 0.45, metalness: 0.05, emissive: 0x2c3a07, emissiveIntensity: 0.6 });
    const bars = SOURCES.map((s, i) => {
      const m = new THREE.Mesh(geo, s.value === max ? lime : violet);
      m.position.x = i * gap - offset;
      m.scale.y = 0.0001;
      scene.add(m);
      return m;
    });
    const targets = SOURCES.map((s) => (s.value / max) * maxH);
    const shown = SOURCES.map(() => ({ v: 0 }));

    const v3 = new THREE.Vector3();
    function placeLabels() {
      const w = el!.clientWidth;
      const h = el!.clientHeight;
      bars.forEach((b, i) => {
        const lab = labels.current[i];
        const val = values.current[i];
        v3.set(b.position.x, 0, 0.6).project(camera);
        if (lab) lab.style.transform = `translate(-50%, 0) translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h + 10}px)`;
        v3.set(b.position.x, b.scale.y, 0).project(camera);
        if (val) {
          val.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h - 8}px)`;
          val.textContent = String(Math.round(shown[i]!.v));
        }
      });
    }

    let sway = 0;
    function render() {
      const r = 12;
      const a = Math.PI / 4 + Math.sin(sway) * 0.12;
      camera.position.set(Math.sin(a) * r * 0.55, 7.5, Math.cos(a) * r);
      camera.lookAt(0, 1.6, 0);
      renderer.render(scene, camera);
      placeLabels();
    }

    function resize() {
      const w = el!.clientWidth;
      const h = el!.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      const half = aspect < 1.2 ? 4.5 : 4.1; // fit all columns on narrow screens
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      if (aspect < 1.2) { camera.left = -half; camera.right = half; camera.top = half / aspect; camera.bottom = -half / aspect; }
      camera.updateProjectionMatrix();
      render();
    }

    let raf = 0;
    let running = false;
    let last = performance.now();
    function frame(now: number) {
      sway += Math.min(0.05, (now - last) / 1000) * 0.5;
      last = now;
      render();
      if (running) raf = requestAnimationFrame(frame);
    }

    let grown = false;
    function grow() {
      grown = true;
      if (reduce) {
        bars.forEach((b, i) => { b.scale.y = targets[i]!; shown[i]!.v = SOURCES[i]!.value; });
        render();
        return;
      }
      bars.forEach((b, i) => {
        gsap.to(b.scale, { y: targets[i]!, duration: 1.4, delay: i * 0.12, ease: 'elastic.out(1, 0.75)' });
        gsap.to(shown[i]!, { v: SOURCES[i]!.value, duration: 1.4, delay: i * 0.12, ease: 'power3.out' });
      });
    }

    const io = new IntersectionObserver(([e]) => {
      const vis = !!e?.isIntersecting;
      if (vis && !grown && (e?.intersectionRatio ?? 0) > 0.35) grow();
      if (vis && !reduce && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      if (!vis) { running = false; cancelAnimationFrame(raf); }
    }, { threshold: [0, 0.35, 0.6] });

    resize();
    io.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      gsap.killTweensOf(bars.map((b) => b.scale));
      geo.dispose(); violet.dispose(); lime.dispose();
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); grid.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={host} className="bars3d" role="img" aria-label={`Example chart, signups by source: ${SOURCES.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
      {SOURCES.map((s, i) => (
        <span key={s.label} aria-hidden="true">
          <span ref={(e) => { labels.current[i] = e; }} className="bars3d-label"><span className="bl-full">{s.label}</span><span className="bl-short">{s.short ?? s.label}</span></span>
          <span ref={(e) => { values.current[i] = e; }} className="bars3d-value">0</span>
        </span>
      ))}
    </div>
  );
}
