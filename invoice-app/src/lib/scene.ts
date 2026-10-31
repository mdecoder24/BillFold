import * as THREE from "three";
import type { Template } from "./model";

/** Scroll ranges (0 to 1) for each chapter of the showcase. The text and the 3D scene both read these. */
export const TEMPLATE_KEYS: Template[] = ["gst", "classic", "modern", "bold", "sidebar"];
export const SCREEN_KEYS = ["editor", "documents", "company"] as const;
const HERO_END = 0.12;
const TEMPLATES_START = 0.14;
const TEMPLATE_STEP = 0.092;
const SCREENS_START = 0.62;
const SCREEN_STEP = 0.0733;
const END_START = 0.88;

export const BEATS = {
  hero: [0, HERO_END] as const,
  template: (i: number) => [TEMPLATES_START + i * TEMPLATE_STEP, TEMPLATES_START + (i + 1) * TEMPLATE_STEP] as const,
  screen: (i: number) => [SCREENS_START + i * SCREEN_STEP, SCREENS_START + (i + 1) * SCREEN_STEP] as const,
  end: [END_START, 1] as const,
};
export const TEMPLATES_ANCHOR = TEMPLATES_START;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => { const t = clamp01((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }
const blend = (a: Pose, b: Pose, t: number): Pose => ({
  x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), rx: mix(a.rx, b.rx, t), ry: mix(a.ry, b.ry, t), rz: mix(a.rz, b.rz, t), s: mix(a.s, b.s, t),
});
const apply = (o: THREE.Object3D, p: Pose) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, p.ry, p.rz); o.scale.setScalar(Math.max(p.s, 0.0001)); };

function softShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.filter = "blur(22px)";
  g.fillStyle = "rgba(20,24,22,0.3)";
  g.fillRect(44, 44, 168, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A thin box with an image on the front, optionally bent a little so it reads as paper. */
function panel(w: number, h: number, depth: number, curve: number, map: THREE.Texture, shadow: THREE.Texture) {
  const geo = new THREE.BoxGeometry(w, h, depth, curve ? 24 : 1, 1, 1);
  if (curve) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / (w / 2);
      pos.setZ(i, pos.getZ(i) + curve * (nx * nx - 0.5));
    }
    geo.computeVertexNormals();
  }
  const edge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map, roughness: 0.82 });
  const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, front, edge]);
  const drop = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.5, h * 1.42),
    new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }),
  );
  drop.position.set(0.06, -0.1, -0.09);
  const group = new THREE.Group();
  group.add(drop, mesh);
  return group;
}

/** The logo in 3D, built from the same coordinates as the SVG mark (64-unit grid, y flipped). */
function logo() {
  const X = (v: number) => (v - 32) / 32;
  const Y = (v: number) => (32 - v) / 32;
  const tile = new THREE.Shape();
  const r = 15 / 32;
  tile.moveTo(-1 + r, -1);
  tile.lineTo(1 - r, -1);
  tile.quadraticCurveTo(1, -1, 1, -1 + r);
  tile.lineTo(1, 1 - r);
  tile.quadraticCurveTo(1, 1, 1 - r, 1);
  tile.lineTo(-1 + r, 1);
  tile.quadraticCurveTo(-1, 1, -1, 1 - r);
  tile.lineTo(-1, -1 + r);
  tile.quadraticCurveTo(-1, -1, -1 + r, -1);

  const b = new THREE.Shape();
  b.moveTo(X(16), Y(11));
  b.lineTo(X(37), Y(11));
  b.lineTo(X(46), Y(20));
  b.lineTo(X(46), Y(25));
  b.bezierCurveTo(X(46), Y(28), X(44), Y(30.5), X(41.5), Y(31.5));
  b.bezierCurveTo(X(45), Y(32.5), X(48), Y(35.2), X(48), Y(39.5));
  b.lineTo(X(48), Y(42));
  b.bezierCurveTo(X(48), Y(48), X(44), Y(53), X(37), Y(53));
  b.lineTo(X(16), Y(53));
  b.closePath();
  for (const [x, y, w, h] of [[24, 21, 13, 4.5], [24, 38, 16, 4.5]]) {
    const hole = new THREE.Path();
    hole.moveTo(X(x), Y(y));
    hole.lineTo(X(x), Y(y + h));
    hole.lineTo(X(x + w), Y(y + h));
    hole.lineTo(X(x + w), Y(y));
    hole.closePath();
    b.holes.push(hole);
  }
  const fold = new THREE.Shape();
  fold.moveTo(X(37), Y(11));
  fold.lineTo(X(37), Y(20));
  fold.lineTo(X(46), Y(20));
  fold.closePath();

  const group = new THREE.Group();
  const bevel = { bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 3, curveSegments: 16 };
  const tileMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tile, { depth: 0.2, ...bevel }), new THREE.MeshStandardMaterial({ color: 0x0f5f4c, roughness: 0.42, metalness: 0.08 }));
  const bMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(b, { depth: 0.1, ...bevel, bevelSize: 0.008, bevelThickness: 0.012 }), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }));
  bMesh.position.z = 0.22;
  const foldMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(fold, { depth: 0.125, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xa9d8c8, roughness: 0.6 }));
  foldMesh.position.z = 0.22;
  group.add(tileMesh, bMesh, foldMesh);
  return group;
}

export interface Showcase { dispose: () => void }

export function createShowcase(host: HTMLElement, opts: { target: () => number; onFrame: (p: number) => void }): Showcase {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.z = 7;
  scene.add(new THREE.AmbientLight(0xffffff, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-2.5, 3, 6);
  scene.add(key);

  const shadow = softShadow();
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const load = (url: string) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };

  const root = new THREE.Group();
  scene.add(root);
  const SHEET_W = 1.72;
  const SHEET_H = SHEET_W * 1.414;
  const sheets = TEMPLATE_KEYS.map((k) => panel(SHEET_W, SHEET_H, 0.012, 0.035, load(`/landing/tpl-${k}.jpg`), shadow));
  const SCREEN_W = 3.5;
  const screens = SCREEN_KEYS.map((k) => panel(SCREEN_W, SCREEN_W * 0.625, 0.03, 0, load(`/landing/${k}.jpg`), shadow));
  const mark = logo();
  root.add(...sheets, ...screens, mark);

  // Layout depends on shape: text sits beside the scene when wide and above it when narrow.
  let wide = true;
  let unit = 1;
  let cx = 1.5;
  let cy = 0;
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const aspect = w / h;
    const viewW = 2 * 7 * Math.tan(THREE.MathUtils.degToRad(16)) * aspect;
    wide = aspect > 1.05;
    unit = wide ? Math.min(1.08, viewW / 7.2) : Math.min(0.72, viewW / 2.3);
    cx = wide ? viewW * 0.25 : 0;
    cy = wide ? -0.05 : -0.82;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(host);

  let p = opts.target();
  let raf = 0;
  const clock = new THREE.Clock();

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    // Frame-rate independent smoothing, so scroll feels the same on every display.
    p += (opts.target() - p) * (1 - Math.exp(-dt * 7));
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 4));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 4));
    root.rotation.y = pointer.x * 0.09;
    root.rotation.x = pointer.y * 0.05;

    let focus = 0;
    for (let k = 1; k < TEMPLATE_KEYS.length; k++) {
      const edge = TEMPLATES_START + k * TEMPLATE_STEP;
      focus += seg(p, edge - 0.025, edge + 0.025);
    }
    const toRing = seg(p, HERO_END - 0.02, TEMPLATES_START + 0.02);
    const toAway = seg(p, SCREENS_START - 0.04, SCREENS_START + 0.02);
    const toStack = seg(p, END_START - 0.04, END_START + 0.03);
    const spread = (wide ? 1.42 : 0.98) * unit;

    sheets.forEach((sheet, i) => {
      const n = i - 2;
      const bob = Math.sin(time * 0.7 + i * 1.3) * 0.022;
      const hero: Pose = { x: cx + n * (wide ? 0.4 : 0.26) * unit, y: cy - Math.abs(n) * 0.09 * unit + bob, z: i * 0.08, rx: -0.04, ry: -0.3, rz: -n * 0.13, s: unit * 0.94 };
      const d = i - focus;
      // Cards already seen tuck in behind the current one, so nothing crosses the text beside it.
      const ring: Pose = d >= 0
        ? { x: cx + d * spread, y: cy + bob, z: 0.5 - d * 1.15, rx: 0, ry: -d * 0.62, rz: 0, s: unit * 1.08 }
        : { x: cx + d * 0.1 * unit, y: cy + bob, z: 0.5 + d * 0.5, rx: 0, ry: -d * 0.12, rz: d * 0.025, s: unit * 1.08 };
      const away: Pose = { x: cx + n * 0.3, y: -5.2 - i * 0.2, z: -1, rx: -0.7, ry: 0.3, rz: n * 0.1, s: unit };
      const stack: Pose = { x: cx, y: cy, z: -0.9 - i * 0.03, rx: 0, ry: 0, rz: n * 0.075, s: unit * 0.98 };
      apply(sheet, blend(blend(blend(hero, ring, toRing), away, toAway), stack, toStack));
    });

    let shown = 0;
    for (let k = 1; k < SCREEN_KEYS.length; k++) {
      const edge = SCREENS_START + k * SCREEN_STEP;
      shown += seg(p, edge - 0.02, edge + 0.02);
    }
    const screensIn = seg(p, SCREENS_START - 0.03, SCREENS_START + 0.03);
    const screensOut = seg(p, END_START - 0.05, END_START);
    const screenUnit = wide ? unit * 0.84 : Math.min(0.55, unit * 0.78);
    screens.forEach((screen, i) => {
      const d = i - shown;
      const bob = Math.sin(time * 0.6 + i * 2) * 0.016;
      const off: Pose = { x: cx + 5, y: cy + 0.6, z: -3, rx: 0, ry: -0.8, rz: 0, s: screenUnit };
      const on: Pose = d >= 0
        ? { x: cx + d * 3.05 * screenUnit, y: cy + bob, z: 0.3 - d * 1.1, rx: 0, ry: -d * 0.42 - (wide ? 0.14 : 0), rz: 0, s: screenUnit }
        : { x: cx + d * 0.12 * screenUnit, y: cy + bob, z: 0.3 + d * 0.7, rx: 0, ry: wide ? -0.14 : 0, rz: 0, s: screenUnit };
      const gone: Pose = { x: cx - 5, y: cy + 0.6, z: -3, rx: 0, ry: 0.8, rz: 0, s: screenUnit };
      apply(screen, blend(blend(off, on, screensIn), gone, screensOut));
      screen.visible = screensIn > 0.001 && screensOut < 0.999;
    });

    // The logo starts in front of the fan, leaves for the middle, and comes back to close the story.
    const logoOut = seg(p, HERO_END - 0.03, TEMPLATES_START);
    const logoBack = seg(p, END_START - 0.03, END_START + 0.04);
    const logoHero: Pose = { x: cx - (wide ? 1.0 : 0.62) * unit, y: cy - (wide ? 0.92 : 0.72) * unit + Math.sin(time * 0.9) * 0.03, z: 1.15, rx: -0.12 + Math.sin(time * 0.5) * 0.05, ry: 0.42 + Math.sin(time * 0.4) * 0.1, rz: 0.05, s: 0.36 * unit };
    const logoAway: Pose = { ...logoHero, y: -4.4, z: 0, rx: -1 };
    const logoEnd: Pose = { x: cx * 0.87, y: cy * 0.87 + Math.sin(time * 0.9) * 0.025, z: 0.9, rx: Math.sin(time * 0.5) * 0.05, ry: (1 - logoBack) * -1.6 + Math.sin(time * 0.45) * 0.14, rz: 0, s: 0.58 * unit };
    apply(mark, blend(blend(logoHero, logoAway, logoOut), logoEnd, logoBack));
    mark.visible = logoOut < 0.999 || logoBack > 0.001;

    opts.onFrame(p);
    renderer.render(scene, camera);
  };
  frame();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats as THREE.MeshStandardMaterial[]) { mat.map?.dispose(); mat.dispose(); }
      });
      shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
