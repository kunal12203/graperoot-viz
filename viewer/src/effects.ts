// Visual effects engine — pure THREE primitives + per-frame ticker.
// No React. All animation is driven by direct mutation of THREE objects.

import * as THREE from "three";
import { EXT_COLOR, EXT_DEFAULT } from "./styles";

export type NodePos = { x?: number; y?: number; z?: number };

export type NodeUserData = {
  node: any;                 // GraphNode (we avoid the import cycle)
  sphere: THREE.Mesh;
  permanentHalo: THREE.Sprite;
  heatHalo: THREE.Sprite;
  label: THREE.Sprite;
  isHub: boolean;
  baseSize: number;
  baseColor: number;         // hex
};

export type Effect =
  | { kind: "ring";   obj: THREE.Mesh;   born: number; ttl: number; node: NodePos; r0: number }
  | { kind: "halo";   obj: THREE.Sprite; born: number; ttl: number; node: NodePos; size: number }
  | { kind: "glyph";  obj: THREE.Sprite; born: number; ttl: number; node: NodePos;
                       offset: number; swing: boolean }
  | { kind: "spark";  obj: THREE.Mesh;   born: number; ttl: number; node: NodePos;
                       dir: THREE.Vector3; speed: number }
  | { kind: "packet"; obj: THREE.Mesh;   born: number; ttl: number;
                       getFrom: () => THREE.Vector3; getTo: () => THREE.Vector3 }
  | { kind: "orbit";  obj: THREE.Mesh;   born: number; ttl: number; orb: THREE.Group;
                       radius: number; cycles: number; phase: number };

// ---------- texture caches ----------

const glyphCache = new Map<string, THREE.CanvasTexture>();
const haloCache = new Map<number, THREE.CanvasTexture>();
let _whiteHalo: THREE.CanvasTexture | null = null;

function glyphTexture(text: string): THREE.CanvasTexture {
  const cached = glyphCache.get(text);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = '92px "Apple Color Emoji", "Segoe UI Emoji", system-ui';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  glyphCache.set(text, tex);
  return tex;
}

function haloTexture(hex: number): THREE.CanvasTexture {
  const cached = haloCache.get(hex);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const cs = "#" + hex.toString(16).padStart(6, "0");
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, cs);
  grad.addColorStop(0.4, cs + "70");
  grad.addColorStop(1.0, cs + "00");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  haloCache.set(hex, tex);
  return tex;
}

function whiteHaloTexture(): THREE.CanvasTexture {
  if (_whiteHalo) return _whiteHalo;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, "#ffffff");
  grad.addColorStop(0.5, "#ffffff70");
  grad.addColorStop(1.0, "#ffffff00");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  _whiteHalo = new THREE.CanvasTexture(c);
  return _whiteHalo;
}

function textTexture(text: string, color = "#dee3ec"): THREE.CanvasTexture {
  const w = 256, h = 64;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = '600 26px ui-monospace, SFMono-Regular, Menlo';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  return new THREE.CanvasTexture(c);
}

// ---------- factories ----------

export function makeRing(hex: number): THREE.Mesh {
  const g = new THREE.RingGeometry(1, 1.18, 64);
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.disposeOnRemove = true;
  return mesh;
}

export function makeHalo(hex: number, opacity = 1, additive = true): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: haloTexture(hex),
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    opacity,
  });
  return new THREE.Sprite(mat);
}

function makeWhiteHalo(opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: whiteHaloTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity,
  });
  return new THREE.Sprite(mat);
}

export function makeMonoGlyph(text: string, color = "#fff"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = '900 92px ui-monospace, SFMono-Regular, Menlo';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(11, 11, 1);
  return sp;
}

export function makeGlyph(glyph: string): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glyphTexture(glyph),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(14, 14, 1);
  return sp;
}

export function makeTextSprite(text: string, color = "#dee3ec"): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: textTexture(text, color),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(36, 9, 1);
  return sp;
}

export function makePacket(hex: number, big = false): THREE.Mesh {
  const r = big ? 2.0 : 1.5;
  const g = new THREE.SphereGeometry(r, 16, 16);
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  const halo = makeHalo(hex, 1);
  halo.scale.set(big ? 12 : 9, big ? 12 : 9, 1);
  mesh.add(halo);
  mesh.userData.disposeOnRemove = true;
  return mesh;
}

export function makeSpark(hex: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(0.6, 8, 8);
  const m = new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  const halo = makeHalo(hex, 1);
  halo.scale.set(4, 4, 1);
  mesh.add(halo);
  mesh.userData.disposeOnRemove = true;
  return mesh;
}

// ---------- hub labels (separate sprite layer in scene) ----------

export function makeHubLabel(text: string): THREE.Sprite {
  const display = text.length > 22 ? "…" + text.slice(-21) : text;
  const w = 512, h = 96;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = '600 36px ui-monospace, SFMono-Regular, Menlo';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#eef1f7";
  ctx.fillText(display, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.92,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(34, 6.4, 1);
  return sp;
}

// ---------- per-node group (legacy — unused after revert) ----------

function nodeLabelSprite(text: string): THREE.Sprite {
  const display = text.length > 22 ? "…" + text.slice(-21) : text;
  const w = 512, h = 96;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.font = '600 36px ui-monospace, SFMono-Regular, Menlo';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#eef1f7";
  ctx.fillText(display, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.9,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(34, 6.4, 1);
  return sp;
}

export function makeNodeObject(
  node: { id: string; ext: string; degree: number },
  opts: { isHub: boolean } = { isHub: false },
): THREE.Group {
  const baseSize = Math.max(2.6, Math.log2((node.degree ?? 1) + 2)) * 1.7;
  const cssColor = EXT_COLOR[node.ext] ?? EXT_DEFAULT;
  const baseColor = parseInt(cssColor.replace("#", ""), 16);

  const grp = new THREE.Group();

  // Unlit material — guaranteed to render regardless of scene lights.
  // Halos provide the glow.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(baseSize, 20, 20),
    new THREE.MeshBasicMaterial({ color: baseColor }),
  );
  grp.add(sphere);

  const permanentHalo = makeHalo(baseColor, 0.22);
  permanentHalo.scale.setScalar(baseSize * 4.0);
  grp.add(permanentHalo);

  const heatHalo = makeWhiteHalo(0);
  heatHalo.scale.setScalar(baseSize * 6);
  grp.add(heatHalo);

  // Filename label — visible only on hubs and heated nodes (LOD).
  const filename = node.id.split("/").pop() ?? node.id;
  const label = nodeLabelSprite(filename);
  label.position.y = -(baseSize + 7);
  label.visible = opts.isHub;
  grp.add(label);

  const userData: NodeUserData = {
    node,
    sphere,
    permanentHalo,
    heatHalo,
    label,
    isHub: opts.isHub,
    baseSize,
    baseColor,
  };
  grp.userData = userData;

  return grp;
}

// ---------- claude orb + stars ----------

export function makeClaudeOrb(): THREE.Group {
  const grp = new THREE.Group();

  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(8, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xbb9af7 }),
  );
  grp.add(inner);

  const halo = makeHalo(0xbb9af7, 0.85);
  halo.scale.set(46, 46, 1);
  grp.add(halo);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(15, 0.55, 12, 64),
    new THREE.MeshBasicMaterial({
      color: 0xc4a7e7,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    }),
  );
  torus.rotation.x = Math.PI / 2;
  grp.add(torus);

  const torus2 = new THREE.Mesh(
    new THREE.TorusGeometry(19, 0.35, 10, 64),
    new THREE.MeshBasicMaterial({
      color: 0xe1c4ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    }),
  );
  torus2.rotation.x = Math.PI / 2;
  torus2.rotation.y = Math.PI / 4;
  grp.add(torus2);

  // Clean "C" mark instead of an emoji.
  const label = makeMonoGlyph("C", "#1a0a30");
  label.scale.set(11, 11, 1);
  label.position.set(0, 0, 8);
  grp.add(label);

  grp.userData.torus = torus;
  grp.userData.torus2 = torus2;
  return grp;
}

export function makeClusterLabel(text: string): THREE.Sprite {
  const w = 1024, h = 192;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;

  // Rounded-rect background panel so the label reads against any backdrop.
  const padX = 36, padY = 24;
  ctx.font = '800 88px ui-monospace, SFMono-Regular, Menlo';
  const metrics = ctx.measureText(text);
  const tw = Math.min(metrics.width, w - padX * 2);
  const bx = (w - tw) / 2 - padX;
  const by = (h - 96) / 2 - padY;
  const bw = tw + padX * 2;
  const bh = 96 + padY * 2;
  const r = 20;
  ctx.fillStyle = "rgba(8,10,18,0.78)";
  ctx.strokeStyle = "rgba(255,224,130,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
  ctx.arcTo(bx, by + bh, bx, by, r);
  ctx.arcTo(bx, by, bx + bw, by, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,1)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffe082";
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.95,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(110, 21, 1);
  return sp;
}

export function makeStarfield(count = 2500, radius = 12000): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.85 + Math.random() * 0.15);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    // Slight color variation: blueish-white.
    const tint = 0.7 + Math.random() * 0.3;
    colors[i * 3 + 0] = tint * 0.85;
    colors[i * 3 + 1] = tint * 0.9;
    colors[i * 3 + 2] = tint;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.3,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: false,
    depthWrite: false,
  });
  return new THREE.Points(geom, mat);
}

// ---------- per-frame ticking ----------

const _hot = new THREE.Color();
const _base = new THREE.Color();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function tickNodes(objs: Iterable<THREE.Group>): boolean {
  let anyHot = false;
  for (const grp of objs) {
    const ud = grp.userData as NodeUserData;
    const n = ud.node;
    const heat: number = n.heat ?? 0;
    const sphereMat = ud.sphere.material as THREE.MeshStandardMaterial;
    const haloMat = ud.heatHalo.material as THREE.SpriteMaterial;
    const labelMat = ud.label.material as THREE.SpriteMaterial;

    if (heat > 0.005) {
      anyHot = true;
      const sc = 1 + heat * 1.6;
      ud.sphere.scale.setScalar(sc);
      _base.setHex(ud.baseColor);
      _hot.setHex(n.lastToolColor ?? 0xff5470);
      sphereMat.color.copy(_base).lerp(_hot, Math.min(1, heat));
      sphereMat.emissive.copy(sphereMat.color);
      sphereMat.emissiveIntensity = 0.55 + heat * 0.45;
      haloMat.color.copy(_hot);
      haloMat.opacity = heat * 0.95;
      ud.heatHalo.scale.setScalar(ud.baseSize * (5 + heat * 5));
      ud.label.visible = true;
      labelMat.opacity = 1;
    } else if (ud.sphere.scale.x !== 1) {
      ud.sphere.scale.setScalar(1);
      sphereMat.color.setHex(ud.baseColor);
      sphereMat.emissive.setHex(ud.baseColor);
      sphereMat.emissiveIntensity = 0.55;
      haloMat.opacity = 0;
      ud.label.visible = ud.isHub;
      labelMat.opacity = 0.9;
    }
  }
  return anyHot;
}

export function tickEffects(
  effects: Effect[],
  scene: THREE.Scene,
  camera: THREE.Camera,
  now: number,
): Effect[] {
  const alive: Effect[] = [];
  for (const ef of effects) {
    const t = (now - ef.born) / ef.ttl;
    if (t < 0) {
      // Effect scheduled for the future (delayed shockwave) — keep but don't draw yet.
      ef.obj.visible = false;
      alive.push(ef);
      continue;
    }
    ef.obj.visible = true;
    if (t >= 1) {
      scene.remove(ef.obj);
      if (ef.obj.userData.disposeOnRemove) {
        (ef.obj as THREE.Mesh).geometry?.dispose?.();
        const mat = (ef.obj as THREE.Mesh).material as THREE.Material | undefined;
        mat?.dispose?.();
      }
      continue;
    }

    if (ef.kind === "ring") {
      const r = ef.r0 * (1 + t * 5);
      ef.obj.scale.set(r, r, r);
      ef.obj.position.set(ef.node.x ?? 0, ef.node.y ?? 0, ef.node.z ?? 0);
      // Always face the camera.
      ef.obj.lookAt(camera.position);
      (ef.obj.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 1.1;
    } else if (ef.kind === "halo") {
      const s = ef.size * (1 + t * 0.7);
      ef.obj.scale.set(s, s, 1);
      ef.obj.position.set(ef.node.x ?? 0, ef.node.y ?? 0, ef.node.z ?? 0);
      (ef.obj.material as THREE.SpriteMaterial).opacity = (1 - t) * 0.7;
    } else if (ef.kind === "glyph") {
      const bob = Math.sin(now / 220) * 1.5;
      ef.obj.position.set(
        ef.node.x ?? 0,
        (ef.node.y ?? 0) + ef.offset + bob,
        ef.node.z ?? 0,
      );
      (ef.obj.material as THREE.SpriteMaterial).opacity = 1 - t * 0.85;
      if (ef.swing) {
        ef.obj.material.rotation = Math.sin(now / 80) * 0.65;
      }
    } else if (ef.kind === "spark") {
      const elapsedMs = now - ef.born;
      const dist = ef.speed * (elapsedMs / 1000);
      ef.obj.position.set(
        (ef.node.x ?? 0) + ef.dir.x * dist,
        (ef.node.y ?? 0) + ef.dir.y * dist + (ef.dir.y > 0 ? -dist * 0.5 : 0),
        (ef.node.z ?? 0) + ef.dir.z * dist,
      );
      (ef.obj.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    } else if (ef.kind === "orbit") {
      const tt = (now - ef.born) / ef.ttl;
      const angle = ef.phase + tt * ef.cycles * Math.PI * 2;
      ef.obj.position.copy(ef.orb.position);
      ef.obj.position.x += Math.cos(angle) * ef.radius;
      ef.obj.position.z += Math.sin(angle) * ef.radius;
      ef.obj.position.y += Math.sin(angle * 1.6) * 4;
      const fade = tt < 0.12 ? tt / 0.12 : tt > 0.88 ? (1 - tt) / 0.12 : 1;
      (ef.obj.material as THREE.MeshBasicMaterial).opacity = fade;
      for (const c of ef.obj.children) {
        const m = (c as any).material;
        if (m && "opacity" in m) m.opacity = fade;
      }
    } else if (ef.kind === "packet") {
      const tt = t;
      const eased = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
      _v1.copy(ef.getFrom());
      _v2.copy(ef.getTo());
      ef.obj.position.lerpVectors(_v1, _v2, eased);
      // Upward arc through the journey.
      ef.obj.position.y += Math.sin(eased * Math.PI) * 22;
      const fade = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      (ef.obj.material as THREE.MeshBasicMaterial).opacity = fade;
    }

    alive.push(ef);
  }
  return alive;
}

// ---------- claude orb camera follower ----------

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();

export function followCamera(
  orb: THREE.Group,
  camera: THREE.Camera,
  now: number,
  smoothing = 0.18,
): void {
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();
  _up.crossVectors(_right, _fwd).normalize();
  _target.copy(camera.position)
    .addScaledVector(_fwd, 180)
    .addScaledVector(_right, 80)
    .addScaledVector(_up, 45);
  orb.position.lerp(_target, smoothing);
  orb.lookAt(camera.position);
  const torus = orb.userData.torus as THREE.Mesh | undefined;
  const torus2 = orb.userData.torus2 as THREE.Mesh | undefined;
  if (torus) torus.rotation.z = (now / 1400) % (Math.PI * 2);
  if (torus2) torus2.rotation.z = (-now / 1900) % (Math.PI * 2);
}
