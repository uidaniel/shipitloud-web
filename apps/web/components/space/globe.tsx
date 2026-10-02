'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Footer globe: dotted continents in violet, an atmosphere glow, lime launch pings,
// and arcs from Lagos (home) to the markets we launch in. Spins slowly; renders only on screen.

const DEG = Math.PI / 180;
function toVec(lat: number, lon: number, r = 1) {
  const la = lat * DEG;
  const lo = lon * DEG;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r);
}

const HOME = { lat: 6.52, lon: 3.38 }; // Lagos
const PINGS = [
  { lat: 37.77, lon: -122.42 }, // San Francisco
  { lat: 40.71, lon: -74.0 }, // New York
  { lat: 51.51, lon: -0.13 }, // London
  { lat: 52.52, lon: 13.4 }, // Berlin
  HOME,
];

const landVert = /* glsl */ `
  attribute float aRand;
  uniform float uPR;
  uniform float uSize;
  varying float vFacing;
  varying float vRand;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * position);
    vFacing = dot(n, normalize(cameraPosition - world.xyz));
    vRand = aRand;
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR / -mv.z;
  }
`;
const landFrag = /* glsl */ `
  uniform float uTime;
  varying float vFacing;
  varying float vRand;
  void main() {
    if (vFacing < 0.02) discard;
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.1, d);
    float tw = 0.8 + 0.2 * sin(uTime * 1.8 + vRand * 40.0);
    vec3 violet = vec3(0.643, 0.576, 1.0);
    vec3 col = mix(violet, vec3(0.96, 0.95, 1.0), pow(vFacing, 4.0) * 0.55);
    gl_FragColor = vec4(col, a * (0.2 + 0.8 * vFacing) * tw);
  }
`;
const bodyVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const bodyFrag = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - max(dot(vN, vView), 0.0), 3.0);
    gl_FragColor = vec4(vec3(0.035, 0.03, 0.07) + vec3(0.36, 0.24, 0.96) * f * 0.55, 1.0);
  }
`;
const atmoFrag = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float i = pow(0.62 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.36, 0.24, 0.96, 1.0) * i * 0.75;
  }
`;
const pingVert = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPR;
  uniform float uZoom;
  varying float vFacing;
  varying float vPulse;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(mat3(modelMatrix) * position), normalize(cameraPosition - world.xyz));
    vPulse = fract(uTime * 0.5 + aPhase);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (10.0 + vPulse * 34.0) * uPR * uZoom / -mv.z * 3.0;
  }
`;
const pingFrag = /* glsl */ `
  varying float vFacing;
  varying float vPulse;
  void main() {
    if (vFacing < 0.05) discard;
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.16, 0.06, d);
    float ring = smoothstep(0.03, 0.0, abs(d - 0.42)) * (1.0 - vPulse);
    gl_FragColor = vec4(0.776, 1.0, 0.239, max(core, ring) * vFacing);
  }
`;
const arcVert = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const arcFrag = /* glsl */ `
  uniform float uHead;
  varying float vT;
  void main() {
    float tail = 0.45;
    float a = smoothstep(uHead - tail, uHead, vT) * step(vT, uHead);
    gl_FragColor = vec4(0.776, 1.0, 0.239, a * 0.9);
  }
`;

function decodeLand(data: string): Float32Array {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pairs = new Int16Array(bytes.buffer);
  const out = new Float32Array((pairs.length / 2) * 3);
  for (let i = 0; i < pairs.length / 2; i++) {
    const v = toVec(pairs[i * 2]! / 100, pairs[i * 2 + 1]! / 100, 1.001);
    out.set([v.x, v.y, v.z], i * 3);
  }
  return out;
}

export function Globe() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.classList.add('globe-fallback');
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0, 4.4);

    const globe = new THREE.Group();
    globe.rotation.x = 0.16;
    scene.add(globe);
    const spin = new THREE.Group();
    globe.add(spin);

    const sphereGeo = new THREE.SphereGeometry(0.99, 96, 96);
    const body = new THREE.Mesh(sphereGeo, new THREE.ShaderMaterial({ vertexShader: bodyVert, fragmentShader: bodyFrag }));
    spin.add(body);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 64, 64),
      new THREE.ShaderMaterial({ vertexShader: bodyVert, fragmentShader: atmoFrag, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    globe.add(atmo);

    const landMat = new THREE.ShaderMaterial({
      vertexShader: landVert, fragmentShader: landFrag, transparent: true, depthWrite: false,
      uniforms: { uPR: { value: pr }, uSize: { value: 11 }, uTime: { value: 0 } },
    });
    // The continent dots are ~180KB, so they load in their own chunk after the page is up.
    let disposed = false;
    import('./land-dots').then(({ LAND_DOTS }) => {
      if (disposed) return;
      const landPos = decodeLand(LAND_DOTS);
      const landGeo = new THREE.BufferGeometry();
      landGeo.setAttribute('position', new THREE.BufferAttribute(landPos, 3));
      landGeo.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(landPos.length / 3).map(() => Math.random()), 1));
      spin.add(new THREE.Points(landGeo, landMat));
      render();
    });

    const pingPos = new Float32Array(PINGS.length * 3);
    PINGS.forEach((p, i) => { const v = toVec(p.lat, p.lon, 1.012); pingPos.set([v.x, v.y, v.z], i * 3); });
    const pingGeo = new THREE.BufferGeometry();
    pingGeo.setAttribute('position', new THREE.BufferAttribute(pingPos, 3));
    pingGeo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(PINGS.map((_, i) => i / PINGS.length)), 1));
    const pingMat = new THREE.ShaderMaterial({
      vertexShader: pingVert, fragmentShader: pingFrag, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPR: { value: pr }, uZoom: { value: 1 } },
    });
    spin.add(new THREE.Points(pingGeo, pingMat));

    // Arcs from home to each market, lifted off the surface by their length.
    const home = toVec(HOME.lat, HOME.lon, 1.005);
    const arcs = PINGS.filter((p) => p !== HOME).map((p, i) => {
      const end = toVec(p.lat, p.lon, 1.005);
      const mid = home.clone().add(end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(1 + home.distanceTo(end) * 0.38);
      const curve = new THREE.QuadraticBezierCurve3(home, mid, end);
      const pts = curve.getPoints(80);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(pts.map((_, k) => k / (pts.length - 1))), 1));
      const mat = new THREE.ShaderMaterial({ vertexShader: arcVert, fragmentShader: arcFrag, transparent: true, depthWrite: false, uniforms: { uHead: { value: 0 } } });
      spin.add(new THREE.Line(geo, mat));
      return { mat, offset: i * 0.55 };
    });

    // Start with the Atlantic facing us: Americas, Europe and West Africa in view.
    const frontLon = -25;
    const baseRot = -(90 + frontLon) * DEG;

    function resize() {
      const w = el!.clientWidth;
      const h = el!.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // A huge globe: wider than the screen, with only its top cap rising over the bottom edge.
      const D = 3.2;
      const diameterVsWidth = w < 760 ? 1.8 : 1.35;
      const halfW = 1 / diameterVsWidth;
      const halfH = halfW / aspect;
      camera.aspect = aspect;
      camera.fov = 2 * Math.atan(halfH / D) / DEG;
      camera.position.set(0, 0, D);
      camera.updateProjectionMatrix();
      globe.position.y = 0.32 * halfH - 1; // top of the globe sits just above the canvas middle
      // Keep dots and pings the same on-screen size whatever the zoom.
      const pxPerUnit = h / (2 * halfH);
      landMat.uniforms.uSize!.value = 0.0052 * pxPerUnit * D;
      pingMat.uniforms.uZoom!.value = (pxPerUnit * D) / 2400;
    }

    let raf = 0;
    let visible = false;
    let t0 = performance.now();
    let t = 0;
    function render() {
      spin.rotation.y = baseRot + t * 0.06;
      landMat.uniforms.uTime!.value = t;
      pingMat.uniforms.uTime!.value = t;
      arcs.forEach((a) => { a.mat.uniforms.uHead!.value = ((t * 0.32 + a.offset) % 2.2); });
      renderer.render(scene, camera);
    }
    function frame(now: number) {
      t += Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      render();
      if (visible) raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
    }, { rootMargin: '200px' });

    const onResize = () => { resize(); render(); };
    resize();
    t = 2.4; // start with arcs mid-flight
    render();
    io.observe(el);
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className="globe" aria-hidden="true" />;
}
