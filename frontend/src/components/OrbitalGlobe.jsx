/**
 * OrbitalGlobe v5 — Three.js 3D globe for Batla Medicos
 *
 * Sizing: CSS-driven (30 vw, clamped 180px–400px). ResizeObserver keeps
 * the Three.js renderer in sync — no hard-coded pixel `size` prop needed.
 *
 * Background: DNA double-helix particle structure (two strands + rungs)
 * Layers (world units, FOV=55°, cam z=260):
 *   DNA helix bg       z-offset=-60, radius=65, height=260
 *   Wireframe globe    r = 55
 *   Inner glow sphere  r = 22
 *   Logo billboard     z = 26  (scale 40×40)
 *   Ring 1 green       r = 40  (equatorial)
 *   Ring 2 blue        r = 56  (tilted)
 *   Ring 3 gold        r = 72  (counter-tilted)
 *   Icon sprites       r = 94  (Fibonacci sphere, no overlap)
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ── Data ──────────────────────────────────────────────────────────────── */

const ICONS = [
  { label: '💊', color: '#93C5FD' },
  { label: '🌿', color: '#4ADE80' },
  { label: '✚',  color: '#FF6B8A' },
  { label: '🧪', color: '#FDE68A' },
  { label: '💉', color: '#F9A8D4' },
  { label: '❤️', color: '#FC8181' },
  { label: '🩺', color: '#A78BFA' },
  { label: '💧', color: '#67E8F9' },
];

/* ── Texture helpers ───────────────────────────────────────────────────── */

function makeIconTexture(label, ringColor, sz = 120) {
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');
  const cx = sz / 2, cy = sz / 2, r = sz / 2 - 6;

  // Outer glow halo
  const grd = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r + 12);
  grd.addColorStop(0, ringColor + '45');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Dark background disc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5,8,28,0.88)';
  ctx.fill();

  // Coloured border + glow
  ctx.save();
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();

  // Emoji / symbol
  ctx.font = `${Math.floor(sz * 0.40)}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, cx, cy + 2);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeLogoTexture(sz = 256) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = '/logo.png?v=3';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = sz; c.height = sz;
      const ctx = c.getContext('2d');
      const pad = sz * 0.06;
      ctx.drawImage(img, pad, pad, sz - pad * 2, sz - pad * 2);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
  });
}

// Even distribution on sphere surface
function fibonacciSphere(count, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rxy = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * rxy * radius, y * radius, Math.sin(theta) * rxy * radius));
  }
  return pts;
}

/* ── Build DNA double-helix particle geometry ──────────────────────────── */
//
//  Two intertwined helices (strand 1 = blue, strand 2 = green) + white rungs.
//  Positions are computed once at module level so they never change at runtime.

function buildDNA() {
  const HELIX_R    = 65;   // helix tube radius
  const HELIX_H    = 260;  // total height (y: -130 … +130)
  const N_STRAND   = 240;  // particles per strand
  const TURNS      = 5;    // full helical turns
  const RUNG_STEP  = 12;   // place a rung every Nth particle

  const pos1 = new Float32Array(N_STRAND * 3);
  const pos2 = new Float32Array(N_STRAND * 3);
  const rungFlat = [];

  for (let i = 0; i < N_STRAND; i++) {
    const t  = (i / N_STRAND) * Math.PI * 2 * TURNS;
    const y  = (i / N_STRAND) * HELIX_H - HELIX_H / 2;
    const x1 = Math.cos(t)             * HELIX_R;
    const z1 = Math.sin(t)             * HELIX_R;
    const x2 = Math.cos(t + Math.PI)  * HELIX_R;
    const z2 = Math.sin(t + Math.PI)  * HELIX_R;

    pos1[i * 3]     = x1;  pos1[i * 3 + 1] = y;  pos1[i * 3 + 2] = z1;
    pos2[i * 3]     = x2;  pos2[i * 3 + 1] = y;  pos2[i * 3 + 2] = z2;

    // Rung — 6 evenly-spaced points bridging the two strands
    if (i % RUNG_STEP === 0) {
      for (let r = 0; r <= 5; r++) {
        const f = r / 5;
        rungFlat.push(x1 + (x2 - x1) * f, y, z1 + (z2 - z1) * f);
      }
    }
  }

  return { pos1, pos2, rungPos: new Float32Array(rungFlat) };
}

const { pos1: DNA_POS1, pos2: DNA_POS2, rungPos: DNA_RUNG } = buildDNA();

/* ── Component ─────────────────────────────────────────────────────────── */

export default function OrbitalGlobe() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    /* Renderer — sized to container; ResizeObserver keeps it in sync */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    /* Scene + Camera (FOV 55°, z=260 → visible half-height ≈ 135 world units) */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(0, 0, 260);
    camera.lookAt(0, 0, 0);

    /* Resize helper — called by ResizeObserver and on first paint */
    const onResize = (w, h) => {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    // Initial size from CSS
    onResize(el.clientWidth || 300, el.clientHeight || 300);

    /* Watch container for CSS-driven size changes */
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) onResize(Math.round(width), Math.round(height));
      }
    });
    ro.observe(el);

    /* Lights */
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sunLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    sunLight.position.set(6, 9, 8);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x4ade80, 0.35);
    fillLight.position.set(-5, -4, -6);
    scene.add(fillLight);

    /* ─── DNA double-helix background ─────────────────────────────── */
    // Group slides back in Z so it appears behind / inside the globe.
    const dnaGroup = new THREE.Group();
    dnaGroup.position.z = -60;
    scene.add(dnaGroup);

    const mkDnaGeo = (flatArr) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(flatArr.slice(), 3));
      return geo;
    };

    // Strand 1 — brand blue
    dnaGroup.add(new THREE.Points(
      mkDnaGeo(DNA_POS1),
      new THREE.PointsMaterial({ color: 0x93C5FD, size: 2.2, transparent: true, opacity: 0.55, sizeAttenuation: true }),
    ));
    // Strand 2 — brand green
    dnaGroup.add(new THREE.Points(
      mkDnaGeo(DNA_POS2),
      new THREE.PointsMaterial({ color: 0x4ADE80, size: 2.2, transparent: true, opacity: 0.55, sizeAttenuation: true }),
    ));
    // Rungs — soft white
    dnaGroup.add(new THREE.Points(
      mkDnaGeo(DNA_RUNG),
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.30, sizeAttenuation: true }),
    ));

    /* ─── Wireframe globe shell r=55 ─────────────────────────────── */
    const meshGlobe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(55, 3),
      new THREE.MeshBasicMaterial({
        color: 0x3451D1, wireframe: true, transparent: true, opacity: 0.18,
      }),
    );
    scene.add(meshGlobe);

    /* Inner glow sphere r=22 */
    const meshInner = new THREE.Mesh(
      new THREE.SphereGeometry(22, 48, 48),
      new THREE.MeshPhongMaterial({
        color: 0x0a1f6e, emissive: 0x3451D1, emissiveIntensity: 0.55,
        transparent: true, opacity: 0.92, shininess: 130,
      }),
    );
    scene.add(meshInner);

    /* Logo billboard Sprite at centre */
    makeLogoTexture(256).then(tex => {
      if (!tex) return;
      const logo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false }),
      );
      logo.scale.set(40, 40, 1);
      logo.position.set(0, 0, 26);
      scene.add(logo);
    });

    /* ─── Orbit group: rings + icon sprites spin together ────────── */
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);

    // Ring 1 — equatorial green (r=40)
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(40, 0.9, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0x27AE60, transparent: true, opacity: 0.65 }),
    );
    ring1.rotation.x = Math.PI / 2;
    orbitGroup.add(ring1);

    // Ring 2 — tilted blue (r=56)
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(56, 0.75, 8, 120),
      new THREE.MeshBasicMaterial({
        color: 0x3451D1, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring2.rotation.x = Math.PI / 2.5;
    ring2.rotation.z = Math.PI / 6;
    orbitGroup.add(ring2);

    // Ring 3 — counter-tilted gold (r=72)
    const ring3 = new THREE.Mesh(
      new THREE.TorusGeometry(72, 0.65, 8, 140),
      new THREE.MeshBasicMaterial({
        color: 0xfde68a, transparent: true, opacity: 0.40,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring3.rotation.x = Math.PI / 2.5;
    ring3.rotation.z = -Math.PI / 6;
    orbitGroup.add(ring3);

    // Icon sprites at Fibonacci sphere r=94
    const spriteObjs = [];
    fibonacciSphere(ICONS.length, 94).forEach((pos, i) => {
      const { label, color } = ICONS[i];
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeIconTexture(label, color, 120),
          transparent: true, opacity: 0.92, depthWrite: false,
        }),
      );
      sprite.scale.set(28, 28, 1);
      sprite.position.copy(pos);
      orbitGroup.add(sprite);
      spriteObjs.push({ sprite, base: pos.clone(), phase: (Math.PI * 2 * i) / ICONS.length });
    });

    /* ─── Animation loop ────────────────────────────────────────────── */
    const mouse = { tx: 0, ty: 0 };
    let animId;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // DNA helix slowly rotates + gentle wobble
      dnaGroup.rotation.y = t * 0.14;
      dnaGroup.rotation.x = Math.sin(t * 0.08) * 0.10;

      // Globe wireframe — gentle slow spin
      meshGlobe.rotation.y = t * 0.10;
      meshGlobe.rotation.x = t * 0.04;
      // Inner sphere — counter-spin
      meshInner.rotation.y = -t * 0.08;

      // Orbit group (rings + icons) auto-rotates
      orbitGroup.rotation.y = t * 0.28;
      // Each ring also spins on its own local axis
      ring1.rotation.z = t * 0.35;
      ring2.rotation.z =  t * 0.25 + Math.PI / 6;
      ring3.rotation.z = -t * 0.18 - Math.PI / 6;

      // Icon sprite pulse + opacity flicker
      spriteObjs.forEach(({ sprite, base, phase }) => {
        const pulse = 1 + 0.05 * Math.sin(t * 1.4 + phase);
        sprite.position.set(base.x * pulse, base.y * pulse, base.z * pulse);
        sprite.material.opacity = 0.68 + 0.24 * Math.sin(t * 0.9 + phase);
      });

      // Smooth camera parallax toward mouse
      camera.position.x += (mouse.tx * 28 - camera.position.x) * 0.04;
      camera.position.y += (mouse.ty * 20 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.tx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
      mouse.ty = -((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    };
    el.addEventListener('mousemove', onMouseMove);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      el.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: 'clamp(180px, 30vw, 400px)',
        height: 'clamp(180px, 30vw, 400px)',
        flexShrink: 0,
        cursor: 'grab',
      }}
      aria-hidden="true"
    />
  );
}
