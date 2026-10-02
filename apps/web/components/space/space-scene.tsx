'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion } from './motion';
import { Starfield } from './starfield';

// A WebGL deep-space backdrop: a fly-through starfield, a slowly turning spiral galaxy,
// and soft dust drifting near the camera. Scroll speeds up the flight; the mouse tilts the view.

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;
  uniform float uTravel;   // forward flight, wraps along z
  uniform float uRise;     // upward drift, wraps along y
  uniform float uDepth;    // wrap length for z (0 = no wrap)
  uniform float uHeight;   // wrap length for y (0 = no wrap)
  uniform float uMaxSize;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float fade = 1.0;
    if (uDepth > 0.0) {
      p.z = mod(p.z + uTravel + uDepth - 10.0, uDepth) - uDepth + 10.0;
      fade *= smoothstep(-uDepth + 10.0, -uDepth + 40.0, p.z) * (1.0 - smoothstep(4.0, 9.0, p.z));
    }
    if (uHeight > 0.0) {
      p.y = mod(p.y + uRise + uHeight * 0.5, uHeight) - uHeight * 0.5;
      fade *= 1.0 - smoothstep(uHeight * 0.38, uHeight * 0.5, abs(p.y));
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 1.0 - uTwinkle + uTwinkle * (0.55 + 0.45 * sin(uTime * 1.7 + aPhase));
    gl_PointSize = clamp(aSize * uPixelRatio * (uScale / -mv.z), uPixelRatio, uMaxSize * uPixelRatio);
    vColor = aColor;
    vAlpha = tw * fade;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uLight;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.8);
    // Light mode: stars become ink and violet specks (bright colours vanish on paper).
    float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
    vec3 lightCol = mix(vec3(0.05, 0.05, 0.07), vec3(0.36, 0.24, 0.96), step(lum, 0.72) * 0.85);
    vec3 col = mix(vColor, lightCol, uLight);
    gl_FragColor = vec4(col, a * vAlpha * uOpacity * mix(1.0, 0.55, uLight));
  }
`;

interface LayerOpts {
  scale: number;
  twinkle: number;
  maxSize: number;
  opacity: number;
  depth?: number;
  height?: number;
}

function makePoints(positions: Float32Array, colors: Float32Array, sizes: Float32Array, o: LayerOpts) {
  const count = sizes.length;
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = Math.random() * Math.PI * 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: o.twinkle },
      uTravel: { value: 0 },
      uRise: { value: 0 },
      uDepth: { value: o.depth ?? 0 },
      uHeight: { value: o.height ?? 0 },
      uMaxSize: { value: o.maxSize },
      uScale: { value: o.scale },
      uOpacity: { value: o.opacity },
      uLight: { value: 0 },
    },
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat, geo };
}

const WHITE = new THREE.Color('#f5f5f2');
const VIOLET = new THREE.Color('#5b3df5');
const VIOLET_SOFT = new THREE.Color('#a493ff');
const LIME = new THREE.Color('#c6ff3d');
const WARM = new THREE.Color('#fff1d6');

function starLayer(count: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 140;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 2] = Math.random() * -170 + 10;
    const r = Math.random();
    c.copy(r < 0.05 ? LIME : r < 0.2 ? VIOLET_SOFT : r < 0.3 ? WARM : WHITE);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = Math.random() < 0.06 ? 3.2 + Math.random() * 2.5 : 1 + Math.random() * 1.6;
  }
  return makePoints(pos, col, size, { scale: 110, twinkle: 0.6, maxSize: 6, opacity: 0.45, depth: 180 });
}

function galaxyLayer(count: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const radius = 24;
  const branches = 3;
  const spin = 0.9;
  const c = new THREE.Color();
  const bulge = Math.floor(count * 0.16);
  for (let i = 0; i < count; i++) {
    if (i < bulge) {
      // Core: a soft, warm ellipsoid of dense stars.
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      pos[i * 3] = g() * 4.2;
      pos[i * 3 + 1] = g() * 1.6;
      pos[i * 3 + 2] = g() * 4.2;
      c.copy(WARM).lerp(VIOLET_SOFT, 0.25 + Math.random() * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0.9 + Math.random() * 1.2;
      continue;
    }
    const r = Math.pow(Math.random(), 1.35) * radius;
    const branch = ((i % branches) / branches) * Math.PI * 2;
    const angle = branch + r * spin * 0.18;
    const spread = 0.7 + (r / radius) * 1.6;
    const rx = Math.pow(Math.random(), 2.2) * (Math.random() < 0.5 ? 1 : -1) * spread * 3;
    const ry = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * spread * 1.1;
    const rz = Math.pow(Math.random(), 2.2) * (Math.random() < 0.5 ? 1 : -1) * spread * 3;
    pos[i * 3] = Math.cos(angle) * r + rx;
    pos[i * 3 + 1] = ry;
    pos[i * 3 + 2] = Math.sin(angle) * r + rz;
    const t = r / radius;
    c.copy(WARM).lerp(VIOLET_SOFT, Math.min(1, t * 1.6)).lerp(VIOLET, Math.max(0, t - 0.55));
    if (Math.random() < 0.025) c.copy(LIME);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = (1 - t) * 2.2 + 0.7 + (Math.random() < 0.02 ? 2.5 : 0);
  }
  return makePoints(pos, col, size, { scale: 55, twinkle: 0.25, maxSize: 4, opacity: 0.12 });
}

function dustLayer(count: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 2] = Math.random() * 8 - 4;
    const c = Math.random() < 0.15 ? VIOLET_SOFT : WHITE;
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 0.8 + Math.random() * 1.6;
  }
  return makePoints(pos, col, size, { scale: 30, twinkle: 0.5, maxSize: 8, opacity: 0.18, height: 16 });
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function SpaceScene() {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!webglAvailable()) {
      setFallback(true);
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.innerWidth < 760;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFallback(true);
      return;
    }
    const pr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    camera.position.set(0, 0, 10);

    const stars = starLayer(small ? 2600 : 6000);
    const galaxy = galaxyLayer(small ? 16000 : 42000);
    const dust = dustLayer(small ? 90 : 200);
    const galaxyPivot = new THREE.Group();
    galaxyPivot.add(galaxy.points);
    galaxy.points.rotation.x = 1.05;
    galaxy.points.rotation.z = -0.35;
    scene.add(stars.points, galaxyPivot, dust.points);
    const layers = [stars, galaxy, dust];
    function setTheme() {
      const light = document.documentElement.dataset.theme === 'light';
      for (const l of layers) {
        l.mat.uniforms.uLight!.value = light ? 1 : 0;
        l.mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        l.mat.needsUpdate = true;
      }
    }
    setTheme();
    const themeObserver = new MutationObserver(() => { setTheme(); if (reduce) renderStatic(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    layers.forEach((l) => { l.mat.uniforms.uPixelRatio!.value = pr; });

    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    let travel = 0;
    let rise = 0;
    let raf = 0;
    let last = performance.now();
    const start = last;

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function place(progress: number, time: number) {
      // The galaxy starts behind the hero, upper right, then drifts across and closer as you scroll.
      const narrow = camera.aspect < 0.9;
      galaxyPivot.position.set(
        narrow ? 14 : 44,
        (narrow ? 16 : 6 + 16 * (1 - THREE.MathUtils.smoothstep(progress, 0, 0.18))) + camera.position.y - progress * 4,
        -72 + progress * 16,
      );
      galaxy.points.rotation.y = time * 0.025 + progress * 1.4;
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
      const v = Math.min(Math.abs(motion.velocity), 80);

      travel += dt * (1.2 + v * 0.9);
      rise += dt * (0.18 + v * 0.02);
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      camera.rotation.y = -mx * 0.06;
      camera.rotation.x = -my * 0.04;
      camera.position.y = -progress * 3;
      dust.points.position.y = camera.position.y;

      for (const l of layers) l.mat.uniforms.uTime!.value = t;
      stars.mat.uniforms.uTravel!.value = travel;
      dust.mat.uniforms.uRise!.value = rise;
      place(progress, t);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    function renderStatic() {
      place(0, 0);
      renderer.render(scene, camera);
    }

    function onMove(e: PointerEvent) {
      tmx = e.clientX / window.innerWidth - 0.5;
      tmy = e.clientY / window.innerHeight - 0.5;
    }
    function onResize() {
      resize();
      if (reduce) renderStatic();
    }
    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    resize();
    if (reduce) renderStatic();
    else raf = requestAnimationFrame(frame);
    requestAnimationFrame(() => window.dispatchEvent(new Event('sil:scene-ready')));
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      layers.forEach((l) => { l.geo.dispose(); l.mat.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (fallback) return <Starfield />;
  return <div ref={host} className="space-scene" aria-hidden="true" />;
}
