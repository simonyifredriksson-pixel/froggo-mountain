/* ============================================================
   Froggo Mountain — Expedition (v3)
   Open map · crafting · caves · ice-wall gates · allies · boss.
   Three.js r149 (classic global build, runs from file://).
============================================================ */
if (typeof THREE === "undefined") {
  const el = document.getElementById("loadinfo");
  if (el) el.textContent = "⚠ Could not load three.min.js (is it in the same folder?)";
  throw new Error("THREE not loaded");
}

// ---------- Renderer ----------
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe6ff, 80, 380);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
function onResize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", onResize); onResize();

// ---------- Lights ----------
const sun = new THREE.DirectionalLight(0xfff2dc, 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 240; sun.shadow.bias = -0.0004;
{ const c = sun.shadow.camera; c.left = -80; c.right = 80; c.top = 80; c.bottom = -80; }
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xdcefff, 0x47533f, 0.9); scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.28); scene.add(ambient);
const torchLight = new THREE.PointLight(0xffd9a0, 0, 26); scene.add(torchLight);

// ---------- Sky dome ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x3f7fd6) }, bot: { value: new THREE.Color(0xcfe6ff) } },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
    void main(){ float h=clamp(normalize(vP).y*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bot,top,smoothstep(0.0,0.9,h)),1.0);} `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 14), skyMat); sky.frustumCulled = false; scene.add(sky);

// ---------- Terrain ----------
const SIZE = 700, HALF = SIZE / 2, SEGS = 200;
function heightAt(x, z) {
  let h = 0;
  h += (z + HALF) * 0.15;
  h += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 3.2;
  h += Math.sin((x + z) * 0.035) * 4.5;
  h += Math.cos(x * 0.045 - z * 0.03) * 3.5;
  h += Math.sin(x * 0.2) * 0.6 + Math.sin(z * 0.18) * 0.6;
  return h;
}
function iceAt(x, z) { return Math.sin(x * 0.08 + 1.3) * Math.cos(z * 0.06 - 0.7) + 0.4 * Math.sin(x * 0.18 - z * 0.15); }
function isIcy(x, z) { const f = (z + HALF) / SIZE; return iceAt(x, z) > (0.6 - f * 0.45); }
function slopeInfo(x, z) {
  const e = 0.7;
  const dhx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dhz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const slope = Math.hypot(dhx, dhz); let dx = -dhx, dz = -dhz; const l = Math.hypot(dx, dz) || 1;
  return { slope, downX: dx / l, downZ: dz / l };
}
function groundY(x, z) { return heightAt(x, z); }

const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  terrainGeo.computeVertexNormals();
  const colors = [];
  const cGrass = new THREE.Color(0.34, 0.5, 0.28), cSnow = new THREE.Color(0.87, 0.92, 0.99),
        cIce = new THREE.Color(0.54, 0.77, 0.98), cRock = new THREE.Color(0.29, 0.29, 0.32);
  const nrm = terrainGeo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), up = nrm.getY(i), f = (z + HALF) / SIZE;
    let c = f < 0.2 ? cGrass.clone() : (isIcy(x, z) ? cIce.clone() : cSnow.clone());
    if (up < 0.8) c.lerp(cRock, Math.min(1, (0.8 - up) * 3.2));
    colors.push(c.r, c.g, c.b);
  }
  terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
terrain.receiveShadow = true; scene.add(terrain);

// ---------- Build helpers ----------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 12), ico: new THREE.IcosahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10), dome: new THREE.SphereGeometry(1, 22, 12, 0, 6.2832, 0, Math.PI * 0.55),
  tri: (() => { const s = new THREE.Shape(); s.moveTo(-1, 0); s.lineTo(1, 0); s.lineTo(0, 1); s.closePath(); return new THREE.ShapeGeometry(s); })(),
};
function mat(o) { return new THREE.MeshStandardMaterial(o); }
function P(group, g, m, pos, rot, scl, noSh) {
  const mesh = new THREE.Mesh(g, m);
  if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
  if (!noSh) mesh.castShadow = true;
  group.add(mesh); return mesh;
}
const M = {
  wolf: mat({ color: 0x52617f, roughness: 0.8 }), wolfDark: mat({ color: 0x2e3950, roughness: 0.8 }),
  rock: mat({ color: 0x707a8c, roughness: 1, flatShading: true }), rockDark: mat({ color: 0x444b59, roughness: 1, flatShading: true }),
  core: mat({ color: 0x002233, emissive: 0x18b6ff, emissiveIntensity: 2.4 }),
  redEye: mat({ color: 0x330000, emissive: 0xff2a18, emissiveIntensity: 3 }),
  horn: mat({ color: 0x20232b, roughness: 0.6 }), fang: mat({ color: 0xeef2f5, roughness: 0.4 }),
  bossBody: mat({ color: 0x3a2d52, roughness: 0.9, flatShading: true }), bossDark: mat({ color: 0x241a38, roughness: 0.9, flatShading: true }),
  bossCore: mat({ color: 0x220033, emissive: 0xb84dff, emissiveIntensity: 2.8 }),
  fox: mat({ color: 0xff8a3a, roughness: 0.6 }), foxCream: mat({ color: 0xffe7c4, roughness: 0.6 }),
  dragon: mat({ color: 0x4cae6a, roughness: 0.6 }), dragonWing: mat({ color: 0x9be0b0, roughness: 0.5, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  owl: mat({ color: 0xb8c4e0, roughness: 0.7 }), owlBelly: mat({ color: 0xf0f4ff, roughness: 0.7 }),
  eyeW: mat({ color: 0xffffff, roughness: 0.3 }), eyeB: mat({ color: 0x141414, roughness: 0.3 }),
  glowGood: mat({ color: 0x113322, emissive: 0x55ffaa, emissiveIntensity: 1.6 }),
  ice: mat({ color: 0xbfe6ff, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.5 }),
  wall: mat({ color: 0x9fd4f2, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.9 }),
  climbGlow: mat({ color: 0x113355, emissive: 0x44ddff, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }),
  bark: mat({ color: 0x5e3c22, roughness: 0.95 }), pine: mat({ color: 0x2c6238, roughness: 0.85 }),
  pine2: mat({ color: 0x37794a, roughness: 0.85 }), snowy: mat({ color: 0xeaf4ff, roughness: 0.7 }),
  stone: mat({ color: 0x6b6e76, roughness: 1, flatShading: true }),
  ironRock: mat({ color: 0x55504a, roughness: 1, flatShading: true }), ironOre: mat({ color: 0x3a2a1a, emissive: 0xb86a2a, emissiveIntensity: 0.8 }),
  bush: mat({ color: 0x2f6b3a, roughness: 0.85 }), berry: mat({ color: 0xc02a4a, emissive: 0x5a0010, emissiveIntensity: 0.4 }),
  crystal: mat({ color: 0x2aa6ff, emissive: 0x1166cc, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.85 }),
  caveRock: mat({ color: 0x4a4d55, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
};

// ---------- Monsters ----------
function buildWolf() {
  const g = new THREE.Group();
  P(g, G.box, M.wolf, [0, 1.0, 0], null, [0.85, 0.85, 1.7]);
  P(g, G.box, M.wolf, [0, 1.15, 1.05], null, [0.7, 0.65, 0.6]);
  P(g, G.box, M.wolfDark, [0, 1.0, 1.45], null, [0.4, 0.35, 0.5]);
  P(g, G.box, M.fang, [-0.12, 0.82, 1.6], null, [0.08, 0.18, 0.08]);
  P(g, G.box, M.fang, [0.12, 0.82, 1.6], null, [0.08, 0.18, 0.08]);
  P(g, G.cone, M.wolfDark, [-0.25, 1.55, 0.95], null, [0.18, 0.4, 0.18]);
  P(g, G.cone, M.wolfDark, [0.25, 1.55, 0.95], null, [0.18, 0.4, 0.18]);
  P(g, G.sph, M.redEye, [-0.22, 1.25, 1.32], null, [0.1, 0.1, 0.1], true);
  P(g, G.sph, M.redEye, [0.22, 1.25, 1.32], null, [0.1, 0.1, 0.1], true);
  for (let i = 0; i < 4; i++) P(g, G.cone, M.wolfDark, [0, 1.55, -0.6 + i * 0.4], [Math.PI, 0, 0], [0.16, 0.3, 0.16]);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(P(g, G.box, M.wolfDark, [sx * 0.5, 0.45, sz * 0.7], null, [0.22, 0.9, 0.22]));
  P(g, G.box, M.wolf, [0, 1.1, -1.0], [0.5, 0, 0], [0.18, 0.18, 0.8]);
  g.userData.legs = legs;
  return g;
}
function buildGolem(boss) {
  const s = boss || 1, bm = boss ? M.bossBody : M.rock, dm = boss ? M.bossDark : M.rockDark, cm = boss ? M.bossCore : M.core;
  const g = new THREE.Group();
  P(g, G.ico, bm, [0, 1.5 * s, 0], [0.3, 0.5, 0], [1.1 * s, 1.3 * s, 0.95 * s]);
  P(g, G.sph, cm, [0, 1.5 * s, 0.7 * s], null, [0.28 * s, 0.28 * s, 0.28 * s], true);
  P(g, G.ico, dm, [0, 2.7 * s, 0], [0.2, 0.8, 0], [0.6 * s, 0.6 * s, 0.6 * s]);
  P(g, G.sph, boss ? M.bossCore : M.redEye, [-0.25 * s, 2.75 * s, 0.45 * s], null, [0.1 * s, 0.1 * s, 0.1 * s], true);
  P(g, G.sph, boss ? M.bossCore : M.redEye, [0.25 * s, 2.75 * s, 0.45 * s], null, [0.1 * s, 0.1 * s, 0.1 * s], true);
  const arms = [], legs = [];
  for (const sx of [-1, 1]) {
    arms.push(P(g, G.ico, dm, [sx * 1.5 * s, 1.6 * s, 0], [0, 0, 0.3], [0.45 * s, 1.0 * s, 0.45 * s]));
    P(g, G.ico, dm, [sx * 1.5 * s, 0.55 * s, 0], null, [0.5 * s, 0.5 * s, 0.5 * s]);
    P(g, G.cone, M.horn, [sx * 0.7 * s, 2.5 * s, 0], [0, 0, sx * 0.6], [0.22 * s, 0.7 * s, 0.22 * s]);
    legs.push(P(g, G.box, dm, [sx * 0.45 * s, 0.5 * s, 0], null, [0.5 * s, 1.0 * s, 0.6 * s]));
  }
  g.userData.arms = arms; g.userData.legs = legs;
  for (let i = 0; i < 3; i++) P(g, G.cone, M.horn, [0, 2.0 * s, -0.7 * s], [-0.5, 0, 0], [0.25 * s, 0.8 * s, 0.25 * s]);
  if (boss) { P(g, G.cone, M.horn, [-0.35 * s, 3.2 * s, 0], [0, 0, -0.3], [0.2 * s, 1.0 * s, 0.2 * s]);
              P(g, G.cone, M.horn, [0.35 * s, 3.2 * s, 0], [0, 0, 0.3], [0.2 * s, 1.0 * s, 0.2 * s]); }
  return g;
}

// ---------- Allies ----------
function buildFox() {
  const g = new THREE.Group();
  P(g, G.sph, M.fox, [0, 0.85, 0], null, [0.75, 0.7, 0.95]);
  P(g, G.sph, M.foxCream, [0, 0.7, 0.55], null, [0.45, 0.4, 0.5]);
  P(g, G.sph, M.fox, [0, 1.25, 0.55], null, [0.5, 0.5, 0.5]);
  P(g, G.box, M.foxCream, [0, 1.1, 0.95], null, [0.22, 0.18, 0.3]);
  P(g, G.cone, M.fox, [-0.28, 1.7, 0.5], null, [0.2, 0.4, 0.2]);
  P(g, G.cone, M.fox, [0.28, 1.7, 0.5], null, [0.2, 0.4, 0.2]);
  P(g, G.sph, M.eyeB, [-0.18, 1.3, 0.9], null, [0.08, 0.1, 0.06], true);
  P(g, G.sph, M.eyeB, [0.18, 1.3, 0.9], null, [0.08, 0.1, 0.06], true);
  P(g, G.cone, M.fox, [0, 0.95, -0.8], [-1.0, 0, 0], [0.35, 0.9, 0.35]);
  P(g, G.sph, M.glowGood, [0, 1.95, 0.5], null, [0.1, 0.1, 0.1], true);
  return g;
}
function buildDragon() {
  const g = new THREE.Group();
  P(g, G.sph, M.dragon, [0, 0.95, 0], null, [0.7, 0.7, 1.0]);
  P(g, G.sph, M.dragon, [0, 1.35, 0.6], null, [0.45, 0.45, 0.55]);
  P(g, G.cone, M.dragon, [0, 1.0, -0.9], [-1.2, 0, 0], [0.25, 1.0, 0.25]);
  P(g, G.cone, M.horn, [-0.18, 1.7, 0.45], null, [0.1, 0.3, 0.1]);
  P(g, G.cone, M.horn, [0.18, 1.7, 0.45], null, [0.1, 0.3, 0.1]);
  P(g, G.sph, M.eyeB, [-0.2, 1.4, 0.95], null, [0.08, 0.1, 0.06], true);
  P(g, G.sph, M.eyeB, [0.2, 1.4, 0.95], null, [0.08, 0.1, 0.06], true);
  const wl = P(g, G.box, M.dragonWing, [-0.7, 1.2, -0.1], [0, 0, 0.4], [0.9, 0.05, 0.7], true);
  const wr = P(g, G.box, M.dragonWing, [0.7, 1.2, -0.1], [0, 0, -0.4], [0.9, 0.05, 0.7], true);
  g.userData.wings = [wl, wr]; return g;
}
function buildOwl() {
  const g = new THREE.Group();
  P(g, G.sph, M.owl, [0, 1.0, 0], null, [0.8, 0.95, 0.7]);
  P(g, G.sph, M.owlBelly, [0, 0.95, 0.45], null, [0.45, 0.6, 0.4]);
  P(g, G.cone, M.owl, [-0.35, 1.85, 0], null, [0.15, 0.35, 0.15]);
  P(g, G.cone, M.owl, [0.35, 1.85, 0], null, [0.15, 0.35, 0.15]);
  P(g, G.sph, M.eyeW, [-0.28, 1.4, 0.55], null, [0.22, 0.22, 0.18]);
  P(g, G.sph, M.eyeW, [0.28, 1.4, 0.55], null, [0.22, 0.22, 0.18]);
  P(g, G.sph, M.eyeB, [-0.28, 1.4, 0.72], null, [0.1, 0.1, 0.08], true);
  P(g, G.sph, M.eyeB, [0.28, 1.4, 0.72], null, [0.1, 0.1, 0.08], true);
  const wl = P(g, G.box, M.owl, [-0.7, 1.0, 0], [0, 0, 0.2], [0.18, 0.7, 0.5], true);
  const wr = P(g, G.box, M.owl, [0.7, 1.0, 0], [0, 0, -0.2], [0.18, 0.7, 0.5], true);
  g.userData.wings = [wl, wr]; return g;
}

// ---------- Frog ----------
function buildFrog() {
  const g = new THREE.Group();
  const green = mat({ color: 0x66b03f, roughness: 0.5 }), greenDark = mat({ color: 0x4e9233, roughness: 0.5 }), belly = mat({ color: 0xd7e9a6, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), green);
  body.scale.set(1.0, 1.05, 0.96); body.position.y = 1.15; body.castShadow = true; g.add(body);
  P(g, G.sph, greenDark, [0, 1.75, -0.2], null, [1.0, 0.55, 0.95]);
  P(g, G.sph, belly, [0, 0.95, 0.66], null, [0.88, 1.0, 0.6], true);
  for (const sx of [-1, 1]) { P(g, G.sph, M.eyeW, [sx * 0.46, 2.08, 0.34], null, [0.34, 0.36, 0.34]); P(g, G.sph, M.eyeB, [sx * 0.48, 2.12, 0.62], null, [0.16, 0.18, 0.16], true); }
  P(g, G.box, mat({ color: 0x294415 }), [0, 1.38, 1.03], null, [0.34, 0.06, 0.06]);
  const arms = [], feet = [];
  for (const sx of [-1, 1]) {
    arms.push(P(g, G.sph, green, [sx * 1.02, 1.0, 0.18], null, [0.5, 0.36, 0.62]));
    feet.push(P(g, G.sph, belly, [sx * 0.5, 0.16, 0.5], null, [0.72, 0.34, 1.0]));
  }
  g.userData = { body, arms, feet, walk: 0, bodyY: body.position.y, feetY: 0.16, feetZ: 0.5 };
  return g;
}
function buildBunny() {
  const g = new THREE.Group();
  const fur = mat({ color: 0xf4f4f7, roughness: 0.78 }), furD = mat({ color: 0xe2e3ea, roughness: 0.78 }),
        pink = mat({ color: 0xffc2d0, roughness: 0.6 }), belly = mat({ color: 0xffd4dc, roughness: 0.6 }),
        cheek = mat({ color: 0xff9eb2, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 30, 24), fur);
  body.scale.set(1.0, 1.05, 0.98); body.position.y = 1.22; body.castShadow = true; g.add(body);
  P(g, G.sph, belly, [0, 0.95, 0.78], null, [0.72, 0.88, 0.52], true);  // big pink belly
  P(g, G.sph, fur, [0, 2.12, 0.2], null, [0.64, 0.62, 0.64]);           // head
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    P(ear, G.sph, fur, [0, 0.55, 0], null, [0.17, 0.62, 0.2]);
    P(ear, G.sph, pink, [0, 0.55, 0.11], null, [0.09, 0.48, 0.11]);
    ear.position.set(sx * 0.26, 2.55, 0.12); ear.rotation.z = sx * 0.1; g.add(ear); ears.push(ear);
  }
  for (const sx of [-1, 1]) {
    P(g, G.sph, M.eyeB, [sx * 0.25, 2.16, 0.66], null, [0.09, 0.11, 0.07], true);
    P(g, G.sph, cheek, [sx * 0.42, 2.0, 0.52], null, [0.12, 0.09, 0.1], true); // rosy cheeks
  }
  P(g, G.sph, pink, [0, 2.02, 0.78], null, [0.06, 0.045, 0.05], true);  // nose
  P(g, G.sph, fur, [0, 0.7, -0.98], null, [0.34, 0.34, 0.34]);          // tail
  const arms = [], feet = [];
  for (const sx of [-1, 1]) {
    arms.push(P(g, G.sph, fur, [sx * 1.05, 1.05, 0.16], null, [0.34, 0.5, 0.42]));
    feet.push(P(g, G.sph, furD, [sx * 0.46, 0.16, 0.62], null, [0.52, 0.32, 1.12]));
  }
  g.userData = { body, arms, feet, ears, walk: 0, bodyY: body.position.y, feetY: 0.16, feetZ: 0.62 };
  return g;
}
function buildBear() {
  const g = new THREE.Group();
  const fur = mat({ color: 0xeef0f3, roughness: 0.82 }), furD = mat({ color: 0xdbdde3, roughness: 0.82 }),
        snout = mat({ color: 0xf7f8fb, roughness: 0.8 }), tie = mat({ color: 0xe6b800, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.32, 30, 24), fur);
  body.scale.set(1.04, 1.04, 1.0); body.position.y = 1.32; body.castShadow = true; g.add(body);
  P(g, G.sph, fur, [0, 2.32, 0.18], null, [0.8, 0.76, 0.76]);          // head
  P(g, G.sph, snout, [0, 2.14, 0.76], null, [0.34, 0.28, 0.32], true); // snout
  P(g, G.sph, M.eyeB, [0, 2.14, 1.02], null, [0.09, 0.09, 0.07], true);// nose
  for (const sx of [-1, 1]) {
    P(g, G.sph, fur, [sx * 0.54, 2.88, 0.12], null, [0.27, 0.27, 0.2]);
    P(g, G.sph, furD, [sx * 0.54, 2.88, 0.2], null, [0.14, 0.14, 0.1], true);
    P(g, G.sph, M.eyeB, [sx * 0.28, 2.36, 0.72], null, [0.08, 0.1, 0.06], true);
  }
  // yellow necktie
  P(g, G.box, tie, [0, 1.82, 1.04], null, [0.18, 0.18, 0.06], true);
  P(g, G.cone, tie, [0, 1.42, 1.02], [Math.PI, 0, 0], [0.18, 0.6, 0.08], true);
  const arms = [], feet = [];
  for (const sx of [-1, 1]) {
    arms.push(P(g, G.sph, fur, [sx * 1.24, 1.22, 0.18], null, [0.42, 0.6, 0.5]));
    feet.push(P(g, G.sph, furD, [sx * 0.56, 0.2, 0.6], null, [0.64, 0.4, 1.18]));
  }
  g.userData = { body, arms, feet, walk: 0, bodyY: body.position.y, feetY: 0.2, feetZ: 0.6 };
  return g;
}
function buildSnowGiant() {
  // a BIPEDAL icy beast (built at unit scale, the whole group is scaled in spawnBoss)
  const g = new THREE.Group();
  const ice = mat({ color: 0xe2f0ff, roughness: 0.5, flatShading: true }), iceD = mat({ color: 0xb6d8f2, roughness: 0.5, flatShading: true }),
        eye = mat({ color: 0x331100, emissive: 0xffb030, emissiveIntensity: 2.2 }), teeth = mat({ color: 0xffffff, roughness: 0.3 }), mouthM = mat({ color: 0x7a1838 });
  const legs = [], arms = [];
  // two big hind legs it stands on
  for (const sx of [-1, 1]) { legs.push(P(g, G.box, iceD, [sx * 0.85, 1.3, -0.2], null, [0.8, 2.6, 1.0])); P(g, G.box, ice, [sx * 0.85, 0.2, 0.4], null, [0.85, 0.4, 1.4]); }
  // upright torso leaning forward
  P(g, G.sph, ice, [0, 3.1, 0.2], [0.25, 0, 0], [1.35, 1.7, 1.3]);
  P(g, G.sph, iceD, [0, 2.4, 0.75], null, [1.0, 1.0, 0.85]);              // belly
  const blue = mat({ color: 0x9ccdf0, emissive: 0x4a8fd8, emissiveIntensity: 0.5, roughness: 0.4, flatShading: true });
  for (let i = 0; i < 7; i++) { const t = i / 6, h = 0.55 + Math.sin(t * Math.PI) * 0.8; P(g, G.cone, blue, [0, 3.95 - i * 0.42, -0.35 - i * 0.18], [-0.3, 0, 0], [0.5, h, 0.12]); } // blue dorsal fins
  // neck + head
  P(g, G.sph, ice, [0, 4.05, 0.95], null, [0.78, 0.82, 0.8]);
  P(g, G.box, ice, [0, 4.45, 1.95], null, [1.05, 0.62, 1.5]);            // snout
  P(g, G.box, mouthM, [0, 4.15, 2.15], null, [0.9, 0.26, 1.2]);          // maw
  const jaw = new THREE.Group(); jaw.position.set(0, 4.05, 1.3); g.add(jaw);   // hinge at back of jaw
  P(jaw, G.box, iceD, [0, -0.17, 0.6], null, [0.95, 0.4, 1.3]);          // lower jaw
  for (let i = 0; i < 5; i++) P(jaw, G.box, teeth, [-0.34 + i * 0.17, -0.03, 1.2], null, [0.07, 0.18, 0.07], true);
  for (let i = 0; i < 5; i++) P(g, G.box, teeth, [-0.34 + i * 0.17, 4.28, 2.6], null, [0.07, 0.22, 0.07], true);
  P(g, G.sph, eye, [-0.38, 4.8, 1.65], null, [0.13, 0.13, 0.13], true);
  P(g, G.sph, eye, [0.38, 4.8, 1.65], null, [0.13, 0.13, 0.13], true);
  P(g, G.cone, iceD, [-0.4, 5.15, 1.45], [-0.3, 0, -0.2], [0.16, 0.7, 0.16]);
  P(g, G.cone, iceD, [0.4, 5.15, 1.45], [-0.3, 0, 0.2], [0.16, 0.7, 0.16]);
  // counterbalancing tail in its own group so it can sway
  const tail = new THREE.Group(); tail.position.set(0, 2.6, -1.2); g.add(tail);
  for (let i = 0; i < 6; i++) { const t = i / 6; P(tail, G.cone, i >= 4 ? blue : (i % 2 ? ice : iceD), [0, -t * 1.7, -i * 0.78], [Math.PI / 2 - 0.5, 0, 0], [0.5 - t * 0.34, 1.0, 0.5 - t * 0.34]); }
  // small raised front arms (used for attacks)
  for (const sx of [-1, 1]) { const arm = P(g, G.box, iceD, [sx * 1.0, 3.1, 0.95], [-0.7, 0, 0], [0.35, 0.95, 0.35]); P(g, G.cone, ice, [sx * 1.0, 2.6, 1.45], [0.5, 0, 0], [0.13, 0.35, 0.13]); arms.push(arm); }
  // jagged ice spikes — shoulders, arms, head crest, tail tip
  for (const sx of [-1, 1]) {
    P(g, G.cone, blue, [sx * 1.15, 3.7, 0.0], [0, 0, sx * 0.6], [0.24, 1.0, 0.24]);   // big shoulder spike
    P(g, G.cone, blue, [sx * 0.75, 3.95, 0.1], [-0.2, 0, sx * 0.25], [0.16, 0.6, 0.16]);
    P(g, G.cone, blue, [sx * 1.05, 3.5, 1.05], [-1.0, 0, 0], [0.12, 0.5, 0.12]);       // arm spike
  }
  P(g, G.cone, blue, [0, 5.4, 1.2], [-0.2, 0, 0], [0.18, 0.8, 0.18]);                  // head crest
  P(g, G.cone, blue, [0, 0.85, -5.05], [Math.PI / 2 - 0.5, 0, 0], [0.22, 1.3, 0.22]);  // tail-tip spike
  g.userData = { arms, legs, jaw, tail, walk: 0 };
  return g;
}
const BUILDERS = { frog: buildFrog, bunny: buildBunny, bear: buildBear };
const player = { type: "frog", speedMul: 1, jumpMul: 1, allyDmgMul: 1 };
let frogModel = buildFrog(); scene.add(frogModel);
function setCharacter(type) {
  if (frogModel) scene.remove(frogModel);
  frogModel = BUILDERS[type]();
  frogModel.position.set(frog.x, frog.y, frog.z);
  scene.add(frogModel);
  player.type = type;
  player.speedMul = type === "bunny" ? 1.5 : 1;
  player.jumpMul = type === "frog" ? 1.414 : 1;
  player.allyDmgMul = type === "bear" ? 2 : 1;
  player.swordMesh = null; player.shieldMesh = null; player.swing = 0; player.spinning = false; player.spinAngle = 0;
}
const ALT_SCALE = 5;
const START_Z = -HALF + 25;
const START_Y = groundY(0, START_Z);
const frog = { x: 0, z: START_Z, y: 0, vx: 0, vy: 0, vz: 0, yaw: 0, hp: 100, warmth: 100, stamina: 100, climb: null };
frog.y = groundY(frog.x, frog.z);
function dampAngle(cur, target, rate, dt) {
  let d = target - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return cur + d * Math.min(1, rate * dt);
}

// ---------- HP bars ----------
function makeBar(color) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.2), new THREE.MeshBasicMaterial({ color: 0x0c0f14, depthTest: false, transparent: true }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.13), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  fill.position.z = 0.01; bg.renderOrder = 998; fill.renderOrder = 999;
  g.add(bg); g.add(fill); g.userData.fill = fill; g.visible = false; return g;
}
function billboard(bar, root, frac, yOff) {
  bar.position.set(root.position.x, root.position.y + yOff, root.position.z);
  bar.quaternion.copy(camera.quaternion);
  bar.userData.fill.scale.x = Math.max(0.001, frac); bar.userData.fill.position.x = -(1 - frac) * 0.71;
}

// ---------- Collections ----------
const monsters = [], allies = [], trees = [], nodes = [], fires = [], caves = [], gates = [], chests = [], rooms = [], pickups = [];
const houses = [], villagers = [], crevasses = [];
const bossFx = { waves: [], icicles: [], pillars: [] };
let boss = null, underground = null, guardian = null, villageHostile = false, inHouse = null;
let avState = "idle", avTimer = 45, avT = 0, avCount = 0;
function placeOnGround(root, x, z) { root.position.set(x, groundY(x, z), z); }

// ---------- Inventory & gear ----------
const inv = { wood: 0, stone: 0, iron: 0, fiber: 0, herb: 0, crystal: 0, leather: 0 };
const gear = { rope: false, axe: false, crampons: false, coat: false, torch: false, sword: false, shield: false, jacket: false, boots: false };
const RES_ICON = { wood: "🪵", stone: "🪨", iron: "🔩", fiber: "🧶", herb: "🌿", crystal: "💎", leather: "🟫" };
const GEAR_ICON = { rope: "🪢", axe: "🪓", crampons: "🥾", coat: "🧥", torch: "🔦", sword: "🗡️", shield: "🛡️", jacket: "🦺", boots: "👢" };

const RECIPES = [
  { id: "campfire", name: "Campfire 🔥", cost: { wood: 5, stone: 2 }, repeat: true, desc: "Place at your feet. Stand near it to restore warmth." },
  { id: "rope", name: "Climbing Rope 🪢", cost: { fiber: 10 }, desc: "Scale the first glacier." },
  { id: "axe", name: "Ice Axe 🪓", cost: { wood: 6, iron: 5 }, lock: 0, desc: "Scale the second glacier · mines faster. (Unlocks after the 1st glacier)" },
  { id: "crampons", name: "Crampons 🥾", cost: { stone: 8, fiber: 6, iron: 3 }, lock: 1, desc: "Scale the final glacier · less slipping. (Unlocks after the 2nd glacier)" },
  { id: "coat", name: "Warm Coat 🧥", cost: { fiber: 6, herb: 2 }, desc: "Lose warmth half as fast." },
  { id: "torch", name: "Torch 🔦", cost: { wood: 2, fiber: 1 }, desc: "Light up the dark caves." },
  { id: "jacket", name: "Leather Jacket 🦺", cost: { leather: 6 }, desc: "Lose warmth far slower (made from monster leather)." },
  { id: "boots", name: "Leather Boots 👢", cost: { leather: 4 }, desc: "Move 20% faster (made from monster leather)." },
  { id: "salve", name: "Healing Salve 🧪", cost: { herb: 3, crystal: 2 }, repeat: true, desc: "Instantly restore 50 health." },
];

// ---------- Trees / nodes / caves / gates ----------
function makeTree2() {
  const g = new THREE.Group();
  const hgt = 2.0 + Math.random() * 1.4;
  P(g, G.cyl, M.bark, [0, hgt * 0.5, 0], null, [0.3, hgt, 0.3]);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const r = 2.0 - i * 0.4, cy = hgt - 0.2 + i * 1.05;
    const m = i % 2 ? M.pine2 : M.pine;
    P(g, G.cone, m, [0, cy, 0], [0, Math.random() * 0.4, 0], [r, 1.25, r]);
  }
  P(g, G.cone, M.snowy, [0, hgt - 0.2 + tiers * 1.05, 0], null, [0.55, 0.7, 0.55]); // snowy top
  return g;
}

const NODE_DEF = {
  stone:   { res: "stone",   per: 2, hits: 3, prompt: "mine rock" },
  iron:    { res: "iron",    per: 2, hits: 3, prompt: "mine iron ore" },
  bush:    { res: "fiber",   per: 2, hits: 1, prompt: "gather bush", extra: { herb: 1 } },
  crystal: { res: "crystal", per: 1, hits: 2, prompt: "harvest crystal" },
};
function buildNode(type) {
  const g = new THREE.Group();
  if (type === "stone") { const s = 0.7 + Math.random() * 0.8; P(g, G.ico, M.stone, [0, s * 0.6, 0], [Math.random()*3, Math.random()*3, 0], [s, s * 0.8, s]); }
  else if (type === "iron") {
    const s = 0.9; P(g, G.ico, M.ironRock, [0, s * 0.6, 0], [Math.random()*3, Math.random()*3, 0], [s, s * 0.8, s]);
    for (let i = 0; i < 4; i++) P(g, G.sph, M.ironOre, [(Math.random()-0.5)*1.1, 0.5 + Math.random()*0.6, (Math.random()-0.5)*1.1], null, [0.16, 0.16, 0.16], true);
  } else if (type === "bush") {
    for (let i = 0; i < 3; i++) P(g, G.sph, M.bush, [(Math.random()-0.5)*0.7, 0.4 + Math.random()*0.3, (Math.random()-0.5)*0.7], null, [0.6, 0.55, 0.6]);
    for (let i = 0; i < 4; i++) P(g, G.sph, M.berry, [(Math.random()-0.5)*0.9, 0.4 + Math.random()*0.4, (Math.random()-0.5)*0.9], null, [0.1, 0.1, 0.1], true);
  } else if (type === "crystal") {
    for (let i = 0; i < 4; i++) P(g, G.cone, M.crystal, [(Math.random()-0.5)*0.7, 0.5 + Math.random()*0.4, (Math.random()-0.5)*0.7], [Math.random()*0.4-0.2, 0, Math.random()*0.4-0.2], [0.18, 0.7 + Math.random()*0.5, 0.18], true);
  }
  return g;
}
function spawnNode(type, x, z) {
  const root = buildNode(type); placeOnGround(root, x, z); root.rotation.y = Math.random() * 6.28; scene.add(root);
  const d = NODE_DEF[type];
  nodes.push({ root, x, z, type, hits: 0, max: d.hits, depleted: false });
}

function spawnCave(x, z, basementLoot) {
  const R = 12, floorY = groundY(x, z);
  const cave = new THREE.Group();
  // smooth rock dome (no flat-shading banding)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 18, 0, 6.2832, 0, Math.PI * 0.55),
    mat({ color: 0x595e68, roughness: 1, side: THREE.DoubleSide }));
  dome.position.set(0, -0.4, 0); dome.scale.set(1, 0.9, 1); dome.receiveShadow = true; cave.add(dome);
  // smooth flat floor inside
  P(cave, G.cyl, mat({ color: 0x71757d, roughness: 1 }), [0, 0.05, 0], null, [R * 0.97, 0.4, R * 0.97]);
  // clean dark doorway on the downhill (-z) side
  const entA = -Math.PI / 2, entHalf = 0.32;
  const door = P(cave, G.box, mat({ color: 0x05070b }), [0, 3, -R + 0.5], null, [7, 6, 1.2]); door.castShadow = false;
  cave.position.set(x, floorY, z); scene.add(cave);
  const caveObj = { x, z, R, entA, entHalf, root: cave, basement: null, floorY };
  caves.push(caveObj);
  for (let i = 0; i < 3; i++) { const a = Math.random()*6.28, r = 2 + Math.random()*R*0.5; spawnNode("iron", x + Math.cos(a)*r, z + Math.sin(a)*r); }
  for (let i = 0; i < 2; i++) { const a = Math.random()*6.28, r = 2 + Math.random()*R*0.5; spawnNode("crystal", x + Math.cos(a)*r, z + Math.sin(a)*r); }

  // optional second floor reached by a rope
  if (basementLoot) {
    const gy = groundY(x, z), RR = 13, roomY = gy - 28, rx = x + 5, rz = z;
    const room = new THREE.Group();
    P(room, G.cyl, M.caveRock, [0, -0.3, 0], null, [RR, 0.6, RR]);                 // floor
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, 16, 24, 1, true), M.caveRock);
    wall.position.y = 8; room.add(wall);
    P(room, G.cyl, M.caveRock, [0, 16, 0], null, [RR, 0.6, RR]);                    // ceiling
    room.position.set(x, roomY, z); scene.add(room); rooms.push(room);
    // rope (down in cave, and the same shaft back up)
    // glowing rope so it's always visible (sticks up above the grass + into the bottom floor)
    const ropeMat = mat({ color: 0xb07a3a, emissive: 0xffcc55, emissiveIntensity: 1.5, roughness: 0.8 });
    const ropeTop = gy + 4;
    const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, ropeTop - roomY, 8), ropeMat);
    ropeMesh.position.set(rx, (ropeTop + roomY) / 2, rz); scene.add(ropeMesh); rooms.push(ropeMesh);
    // little post + ring at the top so it's obvious where to descend
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 16), ropeMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(rx, ropeTop, rz); scene.add(ring); rooms.push(ring);
    const bm = { roomY, cx: x, cz: z, RR, ropeX: rx, ropeZ: rz, topY: gy };
    caveObj.basement = bm;
    // exactly 1 safe chest (the loot) + 2 dangerous (trap) chests
    const spots = [[x - 5, z - 4], [x + 4, z + 5], [x - 3, z + 6]];
    const safeIdx = Math.floor(Math.random() * 3);
    for (let i = 0; i < 3; i++) {
      const isTrap = i !== safeIdx;
      spawnChest(spots[i][0], roomY, spots[i][1], isTrap, isTrap ? null : basementLoot);
    }
  }
}
function makeSkull() {
  const g = new THREE.Group();
  const w = mat({ color: 0xf2f2f2, roughness: 0.6 }), b = mat({ color: 0x111111 });
  P(g, G.sph, w, [0, 0, 0], null, [0.24, 0.26, 0.22]);                      // cranium
  P(g, G.sph, b, [-0.1, 0.02, 0.18], null, [0.07, 0.08, 0.05], true);       // eyes
  P(g, G.sph, b, [0.1, 0.02, 0.18], null, [0.07, 0.08, 0.05], true);
  P(g, G.box, w, [0, -0.2, 0.16], null, [0.16, 0.12, 0.1]);                 // jaw
  return g;
}
function spawnChest(x, y, z, isTrap, loot) {
  const g = new THREE.Group();
  const wood = mat({ color: 0x6b4327, roughness: 0.8 }), wood2 = mat({ color: 0x57341d, roughness: 0.8 }),
        metal = mat({ color: 0x3a3d44, metalness: 0.6, roughness: 0.4 }), gold = mat({ color: 0xffd24a, metalness: 0.5, roughness: 0.3 });
  P(g, G.box, wood, [0, 0.42, 0], null, [1.5, 0.85, 1.0]);                  // base
  const lid = new THREE.Group();
  P(lid, G.cyl, wood2, [0, 0, 0], [0, 0, Math.PI / 2], [0.5, 1.5, 0.5]);    // rounded lid
  P(lid, G.box, metal, [-0.45, 0, 0], [0, 0, Math.PI / 2], [0.52, 0.14, 0.52]);
  P(lid, G.box, metal, [0.45, 0, 0], [0, 0, Math.PI / 2], [0.52, 0.14, 0.52]);
  lid.position.set(0, 0.86, 0); g.add(lid);
  P(g, G.box, metal, [-0.55, 0.42, 0], null, [0.12, 0.9, 1.04]);            // side bands
  P(g, G.box, metal, [0.55, 0.42, 0], null, [0.12, 0.9, 1.04]);
  P(g, G.box, gold, [0, 0.5, 0.52], null, [0.24, 0.3, 0.12], true);         // lock
  if (isTrap) { const sk = makeSkull(); sk.position.set(0, 1.25, 0.45); sk.scale.setScalar(0.95); g.add(sk); }
  g.position.set(x, y, z); g.userData.lid = lid; scene.add(g);
  chests.push({ root: g, lid, x, z, y, isTrap, loot, opened: false });
}

function spawnGate(z, requires, climbX, label) {
  const g = new THREE.Group();
  // glacier: a wall of chunky stacked ice blocks across the map
  for (let bx = -HALF + 8; bx < HALF - 8; bx += 16) {
    const by = groundY(bx, z), h = 15 + Math.random() * 6;
    const b1 = P(g, G.box, M.wall, [bx, by + h * 0.5, z], [0, Math.random() * 0.2 - 0.1, Math.random() * 0.08 - 0.04], [13 + Math.random() * 4, h, 4.5]);
    b1.castShadow = false;
    if (Math.random() < 0.8) { const b2 = P(g, G.box, M.wall, [bx + (Math.random() * 5 - 2.5), by + h + 2.5, z + (Math.random() * 2 - 1)], null, [9, 6, 4]); b2.castShadow = false; }
  }
  // glowing climbable seam
  const climbY = groundY(climbX, z);
  P(g, G.box, M.climbGlow, [climbX, climbY + 8, z], null, [6, 18, 5]);
  scene.add(g);
  gates.push({ z, requires, climbX, climbed: false, group: g, label });
}

function makeRockDecor() {
  const g = new THREE.Group(); const s = 0.6 + Math.random() * 1.6;
  P(g, G.ico, M.stone, [0, s * 0.6, 0], [Math.random()*3, Math.random()*3, Math.random()*3], [s, s * 0.8, s]); return g;
}

// ---------- Campfire ----------
function placeCampfire() {
  const g = new THREE.Group();
  P(g, G.cyl, mat({ color: 0x5a3a1f }), [0, 0.15, 0], null, [0.6, 0.3, 0.6]);
  const flame = P(g, G.cone, mat({ color: 0xff8a2a, emissive: 0xff5a00, emissiveIntensity: 2.2 }), [0, 0.85, 0], null, [0.5, 1.1, 0.5], true);
  const light = new THREE.PointLight(0xff8a3a, 3, 22); light.position.y = 1.4; g.add(light);
  g.position.set(frog.x, frog.y, frog.z); scene.add(g);   // at the player's current floor
  fires.push({ g, flame, x: frog.x, z: frog.z, t: 0 });
}
function updateFires(dt, now) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t += dt;
    if (f.t > 20) { scene.remove(f.g); fires.splice(i, 1); continue; }
    f.flame.scale.y = 1 + Math.sin(now * 0.02) * 0.2;
    if (f.t > 16) f.g.visible = (Math.floor(now / 200) % 2 === 0); // blink before vanishing
  }
}

// ---------- Spawners ----------
function spawnMonster(kind, x, z, st) {
  const root = kind === "golem" ? buildGolem() : buildWolf();
  placeOnGround(root, x, z); root.rotation.y = Math.random() * 6.28; scene.add(root);
  const bar = makeBar(0xff4d4d); scene.add(bar);
  monsters.push(Object.assign({ root, bar, cd: 0, wanderT: 0, tx: x, tz: z, aggro: false, kind, walk: 0, atkAnim: 0 }, st));
}
function spawnBoss(x, z) {
  const root = buildSnowGiant(); const gy = groundY(x, z);
  const S = 2.3; root.scale.setScalar(S); root.userData.gScale = S;
  root.position.set(x, gy - 13, z); scene.add(root);   // buried under the snow
  const bar = makeBar(0x9be0ff); scene.add(bar);
  boss = { root, bar, S, hp: 2400, maxHp: 2400, kind: "boss", walk: 0, atkAnim: 0,
           state: "dormant", buriedY: gy - 13, standY: gy, x, z, atkTimer: 3.5, armRaise: 0, slam: -1, slamHit: false, punch: -1, punchHit: false, fire: -1, fireHit: false, fireDx: 0, fireDz: 1 };
}
function spawnTrappedAlly(name, builder, kind, x, z, atk) {
  const root = builder(); placeOnGround(root, x, z); scene.add(root);
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), M.ice);
  ice.position.set(x, groundY(x, z) + 1.3, z); ice.scale.set(1, 1.5, 1); scene.add(ice);
  const bar = makeBar(0x55dd55); scene.add(bar);
  allies.push({ root, bar, ice, hp: 160, maxHp: 160, atk, cd: 0, kind, state: "trapped", hits: 0, need: 6, name, slot: allies.length, target: null });
}

// ---------- Summit flag ----------
const SUMMIT_Z = HALF - 22;
const flag = new THREE.Group();
{
  P(flag, G.cyl, mat({ color: 0x999999, metalness: 0.4, roughness: 0.5 }), [0, 3, 0], null, [0.12, 6, 0.12]);
  const cloth = P(flag, G.box, mat({ color: 0xff3344, side: THREE.DoubleSide }), [1.1, 5, 0], null, [2.2, 1.3, 0.06]);
  flag.userData.cloth = cloth;
}
flag.position.set(0, groundY(0, SUMMIT_Z), SUMMIT_Z);
flag.visible = false;
scene.add(flag);

// ---------- Snow (GPU) ----------
const SNOW_MAX = 4000, SNOW_BOX = 80;
const snowGeo = new THREE.BufferGeometry();
const sp = new Float32Array(SNOW_MAX * 3), ssp = new Float32Array(SNOW_MAX);
for (let i = 0; i < SNOW_MAX; i++) { sp[i*3]=(Math.random()-0.5)*SNOW_BOX; sp[i*3+1]=Math.random()*SNOW_BOX; sp[i*3+2]=(Math.random()-0.5)*SNOW_BOX; ssp[i]=0.6+Math.random()*0.8; }
snowGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
snowGeo.setAttribute("aSpeed", new THREE.BufferAttribute(ssp, 1));
const snowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime:{value:0}, uCam:{value:new THREE.Vector3()}, uBox:{value:SNOW_BOX}, uFall:{value:14}, uWind:{value:new THREE.Vector2()}, uSize:{value:5}, uOpacity:{value:0.9} },
  vertexShader: `attribute float aSpeed; uniform float uTime,uBox,uFall,uSize; uniform vec3 uCam; uniform vec2 uWind;
    void main(){ vec3 p=position; float y=mod(p.y-uTime*uFall*aSpeed,uBox); float wx=uWind.x*uTime,wz=uWind.y*uTime; vec3 w;
    w.x=uCam.x+mod(p.x+wx-uCam.x+uBox*0.5,uBox)-uBox*0.5; w.z=uCam.z+mod(p.z+wz-uCam.z+uBox*0.5,uBox)-uBox*0.5; w.y=uCam.y-uBox*0.5+y;
    vec4 mv=modelViewMatrix*vec4(w,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(60.0/-mv.z); }`,
  fragmentShader: `uniform float uOpacity; void main(){ vec2 d=gl_PointCoord-0.5; if(dot(d,d)>0.25) discard; gl_FragColor=vec4(1.0,1.0,1.0,uOpacity);} `,
});
const snow = new THREE.Points(snowGeo, snowMat); snow.frustumCulled = false; snow.visible = false; scene.add(snow);

// ---------- Weather ----------
const WEATHER = {
  clear:    { label: "☀️ Clear",    snow: 0,    fogN: 100, fogF: 420, top: 0x3f7fd6, bot: 0xd6ebff, wind: 0,  drain: 1.0, sun: 2.0, op: 0 },
  snow:     { label: "🌨️ Snowing",  snow: 1600, fogN: 55,  fogF: 220, top: 0x8aa6c4, bot: 0xc4d4e4, wind: 4,  drain: 2.3, sun: 1.2, op: 0.85 },
  blizzard: { label: "🌪️ Blizzard", snow: 4000, fogN: 18,  fogF: 80,  top: 0xb8c4d0, bot: 0xd2dde6, wind: 16, drain: 4.5, sun: 0.6, op: 0.95 },
};
let weather = "clear", weatherTimer = 22, windDir = 0;
function setWeather(w) {
  weather = w; const c = WEATHER[w];
  snowGeo.setDrawRange(0, c.snow); snow.visible = c.snow > 0;
  snowMat.uniforms.uOpacity.value = c.op; snowMat.uniforms.uFall.value = w === "blizzard" ? 26 : 14;
  document.getElementById("weather").textContent = c.label; windDir = Math.random() * 6.28;
  snowMat.uniforms.uWind.value.set(Math.sin(windDir) * c.wind, Math.cos(windDir) * c.wind);
  if (w === "blizzard") toast("🌪️ Blizzard! Find a campfire or you'll freeze.");
}

// ---------- Input ----------
const keys = {};
addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; if (e.code === "Space" || e.key === " ") { keys[" "] = true; e.preventDefault(); } });
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; if (e.code === "Space" || e.key === " ") keys[" "] = false; });

let camYaw = 0, camPitch = 0.42, camDist = 11, camDistCur = 11;
canvas.addEventListener("click", () => { if (!cutscene && running && !craftOpen) canvas.requestPointerLock(); });
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) {
    camYaw -= e.movementX * 0.0022;
    camPitch = Math.max(0.02, Math.min(1.1, camPitch - e.movementY * 0.0022));
  }
});

// ---------- HUD ----------
let running = false, won = false, craftOpen = false, nearInteract = null, cutscene = null, inCaveNow = false;
function toast(msg) { const el = document.getElementById("toast"); el.innerHTML = msg; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2800); }
function setPrompt(msg) { const el = document.getElementById("prompt"); if (msg) { el.innerHTML = msg; el.classList.add("show"); } else el.classList.remove("show"); }
function setSubtitle(msg) { const el = document.getElementById("subtitle"); if (msg) { el.innerHTML = msg; el.classList.add("show"); } else el.classList.remove("show"); }
function damageFlash() { const el = document.getElementById("dmgflash"); el.classList.add("show"); clearTimeout(damageFlash._t); damageFlash._t = setTimeout(() => el.classList.remove("show"), 110); }
function altMeters() { return Math.max(0, Math.round((frog.y - START_Y) * ALT_SCALE)); }
function zoneName() { const p = (frog.z + HALF) / SIZE; if (p > 0.9) return "Summit Ridge"; if (p > 0.72) return "Death Zone"; if (p > 0.52) return "The Icefall"; if (p > 0.3) return "Snowline"; return "Forest Base"; }
function updateHud() {
  document.getElementById("altitude").textContent = altMeters().toLocaleString();
  document.getElementById("zone").textContent = zoneName();
  document.getElementById("health-fill").style.width = Math.max(0, frog.hp) + "%";
  document.getElementById("warmth-fill").style.width = Math.max(0, frog.warmth) + "%";
  document.getElementById("stamina-fill").style.width = Math.max(0, frog.stamina) + "%";
  const active = allies.filter(c => c.state === "active" && c.hp > 0).length;
  document.getElementById("companions").textContent = active;
  const freed = allies.filter(c => c.state === "active").length;
  document.getElementById("objective").textContent = `Allies ${freed}/3 · Glaciers ${gates.filter(g=>g.climbed).length}/3 · Snow Giant ${boss && boss.hp>0 ? (boss.state==="active"?"FIGHT!":"asleep") : "DOWN"}`;
  // inventory chips
  document.getElementById("inventory").innerHTML = Object.keys(inv).map(k => `<div class="chip ${inv[k]?"":"dim"}">${RES_ICON[k]} ${inv[k]}</div>`).join("");
  document.getElementById("gearbar").innerHTML = Object.keys(gear).map(k => `<div class="chip gear ${gear[k]?"":"dim"}">${GEAR_ICON[k]}</div>`).join("");
}

// ---------- Crafting UI ----------
function has(cost) { return Object.keys(cost).every(k => inv[k] >= cost[k]); }
function renderCraft() {
  document.getElementById("craft-inv").textContent = "— " + Object.keys(inv).map(k => `${RES_ICON[k]}${inv[k]}`).join("  ");
  const box = document.getElementById("recipes"); box.innerHTML = "";
  for (const r of RECIPES) {
    const owned = !r.repeat && gear[r.id];
    const locked = r.lock !== undefined && !(gates[r.lock] && gates[r.lock].climbed);
    const ok = has(r.cost) && !owned && !locked;
    const label = owned ? "✓ Crafted" : locked ? `🔒 Climb glacier ${r.lock + 1} first` : (ok ? "Craft" : "Need materials");
    const div = document.createElement("div");
    div.className = "recipe" + (owned ? " have" : "");
    div.innerHTML = `<div class="rn">${r.name}</div><div class="rd">${r.desc}</div>
      <div class="rc">${Object.keys(r.cost).map(k => `${RES_ICON[k]}${r.cost[k]}`).join("  ")}</div>
      <button ${ok ? "" : "disabled"}>${label}</button>`;
    const btn = div.querySelector("button");
    if (ok) btn.onclick = () => { craft(r); renderCraft(); };
    box.appendChild(div);
  }
}
function craft(r) {
  if (!has(r.cost) || (!r.repeat && gear[r.id])) return;
  for (const k in r.cost) inv[k] -= r.cost[k];
  if (r.id === "campfire") { placeCampfire(); toast("🔥 Campfire placed."); }
  else if (r.id === "salve") { frog.hp = Math.min(100, frog.hp + 50); toast("🧪 +50 health."); }
  else { gear[r.id] = true; toast(`🛠️ Crafted ${r.name}!`); if (r.id === "torch") torchLight.intensity = 0; }
  updateHud();
}
function toggleCraft(force) {
  craftOpen = force !== undefined ? force : !craftOpen;
  document.getElementById("craft").classList.toggle("hidden", !craftOpen);
  if (craftOpen) { document.exitPointerLock && document.exitPointerLock(); renderCraft(); }
}
document.getElementById("craft-close").onclick = () => toggleCraft(false);

// ---------- Start ----------
function clearArr(arr) { for (const o of arr) { if (o.root) scene.remove(o.root); if (o.g) scene.remove(o.g); if (o.group) scene.remove(o.group); if (o.bar) scene.remove(o.bar); if (o.ice) scene.remove(o.ice); if (o.dome) scene.remove(o.dome); } arr.length = 0; }
function startGame() {
  frog.x = 0; frog.z = -HALF + 20; frog.vx = frog.vy = frog.vz = 0; frog.hp = 100; frog.warmth = 100; frog.stamina = 100; frog.climb = null;
  frog.y = groundY(frog.x, frog.z);
  for (const k in inv) inv[k] = 0; for (const k in gear) gear[k] = false; torchLight.intensity = 0;
  won = false; underground = null; inCaveNow = false;
  ambient.intensity = 0.28; hemi.intensity = 0.9; torchLight.intensity = 0;
  for (const p of dmgPopups) p.el.remove(); dmgPopups.length = 0;
  for (const p of pickups) scene.remove(p.g); pickups.length = 0;
  if (boss) { scene.remove(boss.root); scene.remove(boss.bar); boss = null; }
  if (guardian) { scene.remove(guardian.root); scene.remove(guardian.bar); guardian = null; }
  clearArr(houses); clearArr(villagers); crevasses.length = 0;
  villageHostile = false; avState = "idle"; avTimer = 45; avCount = 0; avMesh.visible = false; document.getElementById("avwarn").classList.add("hidden");
  frog.crevasse = null; frog.crevImmune = 0; inHouse = null;
  flag.visible = true; fireBreath.visible = false; if (ambulance) { scene.remove(ambulance); ambulance = null; }
  document.getElementById("bossbar").classList.add("hidden");
  for (const m of rooms) scene.remove(m); rooms.length = 0;
  for (const w of bossFx.waves) scene.remove(w.mesh); for (const ic of bossFx.icicles) scene.remove(ic.mesh); for (const p of bossFx.pillars) if (p.mesh) scene.remove(p.mesh);
  bossFx.waves.length = bossFx.icicles.length = bossFx.pillars.length = 0;
  clearArr(monsters); clearArr(allies); clearArr(trees); clearArr(nodes); clearArr(fires); clearArr(caves); clearArr(gates); clearArr(chests);

  // trees + bushes + stone spread across the WHOLE (much bigger) map
  for (let i = 0; i < 480; i++) {
    const x = (Math.random()-0.5)*(SIZE-30), z = (Math.random()-0.5)*(SIZE-30);
    if (slopeInfo(x,z).slope > 0.95) continue;
    const f = (z + HALF) / SIZE;
    const roll = Math.random();
    if (roll < 0.44 && trees.length < 110) { const t = makeTree2(); placeOnGround(t, x, z); t.rotation.y = Math.random()*6.28; scene.add(t); trees.push({ root: t, x, z, hits: 0, fallen: false, falling: 0, shake: 0 }); }
    else if (roll < 0.58) spawnNode("bush", x, z);
    else if (roll < 0.70) spawnNode("stone", x, z);
    else if (roll > 0.93 && f > 0.35) spawnNode("crystal", x, z);
  }
  for (let i = 0; i < 22; i++) { const x=(Math.random()-0.5)*(SIZE-20), z=0+Math.random()*(HALF-20); const r=makeRockDecor(); placeOnGround(r,x,z); scene.add(r); }

  // glacier gates spread along the long climb
  spawnGate(-160, "rope", 60, "Rope");
  spawnGate(-10, "axe", -70, "Ice Axe");
  spawnGate(170, "crampons", 30, "Crampons");

  // caves (kept clear of the glacier z-lines); two have a second floor (sword / shield)
  spawnCave(30, -250, "sword");   // start zone — second floor with the sword
  spawnCave(95, -90); spawnCave(-95, -90);
  spawnCave(-80, 70, "shield");   // beyond the 2nd glacier — second floor with the shield
  spawnCave(80, 250);
  for (let i = 0; i < 8; i++) spawnNode("iron", (Math.random()-0.5)*(SIZE-60), -120 + Math.random()*240);

  // allies (the third is frozen inside a cave!)
  spawnTrappedAlly("Ember", buildFox, "fox", -16, -230, 19);     // free, before glacier 1
  spawnTrappedAlly("Sprout", buildDragon, "dragon", 24, -90, 23);// behind glacier 1
  spawnTrappedAlly("Hoot", buildOwl, "owl", -80, 70, 21);        // inside cave 4, behind glacier 2

  // monsters — more of them, tougher, spread over the long mountain
  const wolf = () => ({ hp: 70, maxHp: 70, atk: 12, speed: 5.0 });
  const golem = () => ({ hp: 200, maxHp: 200, atk: 26, speed: 3.2 });
  spawnMonster("wolf", 20, -90, wolf()); spawnMonster("wolf", 30, -80, wolf());
  spawnMonster("golem", -70, 60, golem()); spawnMonster("wolf", -90, 80, wolf());
  for (let i = 0; i < 26; i++) {
    const x = (Math.random()-0.5)*(SIZE-60), z = -120 + Math.random()*(HALF + 100);
    const hi = z > 120;
    spawnMonster(hi || Math.random()<0.45 ? "golem" : "wolf", x, z, hi || Math.random()<0.45 ? golem() : wolf());
  }
  spawnBoss(0, HALF - 40);
  flag.visible = true; flag.rotation.set(0, 0, 0); flag.position.set(0, groundY(0, SUMMIT_Z), SUMMIT_Z);

  // peaceful village near the start + shelter huts up in the avalanche zone
  spawnVillage(-55, -270);
  spawnHouse(50, 50, 0.5); spawnHouse(-45, 140, 2.2); spawnHouse(35, 240, 4);
  // loot chests inside the cabin (mid resources)
  spawnChest(cabinRoom.cx - 4, cabinRoom.fy, cabinRoom.cz - 6, false, "supplies"); chests[chests.length - 1].cabin = true;
  spawnChest(cabinRoom.cx + 4, cabinRoom.fy, cabinRoom.cz - 6, false, "supplies"); chests[chests.length - 1].cabin = true;
  // hidden crevasses across the upper mountain
  for (let i = 0; i < 16; i++) { const x = (Math.random() - 0.5) * (SIZE - 50), z = -120 + Math.random() * (HALF + 90); spawnCrevasse(x, z); }

  setWeather("clear"); weatherTimer = 26; running = true;
  document.getElementById("overlay").classList.add("hidden"); toggleCraft(false);
  updateHud(); updateCamera(true); canvas.requestPointerLock();
}
const charBtns = Array.from(document.querySelectorAll(".char"));
charBtns.forEach((b) => b.addEventListener("click", () => { if (!b.disabled) startGameAs(b.dataset.type); }));
function startGameAs(type) { setCharacter(type); startGame(); }

// ---------- Camera-relative movement basis (FIX) ----------
// Use the camera's OWN axes so W = into-screen, D = screen-right, always.
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
function camBasis() {
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-5) _fwd.set(0, 0, 1); _fwd.normalize();
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion); _right.y = 0; _right.normalize();
}

// ---------- Frog physics ----------
const GRAV = 32, JUMP_V = 11, WALK = 5, SPRINT = 8.5, V3 = new THREE.Vector3(1, 1, 1);
function updateFrog(dt) {
  const fm = frogModel.userData;
  // climbing the glacier — arc up the face and mantle over the top
  if (frog.climb) {
    const c = frog.climb; c.t += dt / c.dur; const k = Math.min(1, c.t);
    const ks = k * k * (3 - 2 * k);                 // smoothstep across
    frog.x = c.x;
    frog.z = c.z0 + (c.z1 - c.z0) * ks;
    frog.y = c.baseY + (c.topY - c.baseY) * ks + Math.sin(k * Math.PI) * c.arc; // up & over
    frogModel.position.set(frog.x, frog.y, frog.z);
    frog.yaw = dampAngle(frog.yaw, 0, 10, dt);      // face into the glacier (+z)
    frogModel.rotation.set(-0.4 * Math.sin(k * Math.PI), frog.yaw, 0); // lean into the wall
    const ph = Math.sin(performance.now() * 0.02);
    fm.arms[0].rotation.x = -1.4 + ph * 0.8; fm.arms[1].rotation.x = -1.4 - ph * 0.8;
    const fY = fm.feetY;
    fm.feet[0].position.y = fY + Math.max(0, ph) * 0.4; fm.feet[1].position.y = fY + Math.max(0, -ph) * 0.4;
    if (k >= 1) { frog.climb = null; frog.vy = 0; frogModel.rotation.set(0, frog.yaw, 0); fm.arms[0].rotation.x = fm.arms[1].rotation.x = 0; }
    return;
  }

  // climbing the rope between cave floors
  if (frog.rope) {
    const r = frog.rope; r.t += dt / r.dur; const k = Math.min(1, r.t);
    frog.x = r.x; frog.z = r.z; frog.y = r.y0 + (r.y1 - r.y0) * k; frog.vx = frog.vy = frog.vz = 0;
    frogModel.position.set(frog.x, frog.y, frog.z); frogModel.rotation.set(0, frog.yaw, 0);
    const ph = Math.sin(performance.now() * 0.02);
    fm.arms[0].rotation.x = -1.3 + ph * 0.6; fm.arms[1].rotation.x = -1.3 - ph * 0.6;
    if (k >= 1) { underground = r.enter ? r.bm : null; frog.rope = null; fm.arms[0].rotation.x = fm.arms[1].rotation.x = 0; }
    return;
  }

  // stuck in a crevasse — hold E to climb out
  if (frog.crevasse) {
    const cv = frog.crevasse;
    frog.x = cv.x; frog.z = cv.z; frog.y = cv.floorY; frog.vx = frog.vy = frog.vz = 0;
    frogModel.position.set(frog.x, frog.y, frog.z);
    if (keys["e"]) cv.climb += dt;
    setPrompt(`Hold <b>E</b> to climb out of the crevasse (${Math.max(0, 1.6 - cv.climb).toFixed(1)}s)`);
    const ph = Math.sin(performance.now() * 0.02);
    if (fm.arms) { fm.arms[0].rotation.x = -1.4 + ph * 0.7; fm.arms[1].rotation.x = -1.4 - ph * 0.7; }
    if (cv.climb >= 1.6) {
      frog.y = cv.topY; frog.crevasse = null; frog.crevImmune = 2.5; frog.hp -= 33;
      if (fm.arms) { fm.arms[0].rotation.x = fm.arms[1].rotation.x = 0; }
      toast("🧗 Climbed out of the crevasse! -33 health");
      if (frog.hp <= 0) return lose();
    }
    return;
  }
  if (frog.crevImmune > 0) frog.crevImmune -= dt;
  const under = underground;

  camBasis();
  let ix = 0, iz = 0;
  if (keys["w"] || keys["arrowup"]) iz += 1;
  if (keys["s"] || keys["arrowdown"]) iz -= 1;
  if (keys["d"] || keys["arrowright"]) ix += 1;   // D = right
  if (keys["a"] || keys["arrowleft"]) ix -= 1;    // A = left

  const len = Math.hypot(ix, iz);
  const wantSprint = keys["shift"] && frog.stamina > 1 && len > 0;
  const speed = (wantSprint ? SPRINT : WALK) * player.speedMul * (gear.boots ? 1.2 : 1);
  if (wantSprint) frog.stamina = Math.max(0, frog.stamina - 28 * dt); else frog.stamina = Math.min(100, frog.stamina + 16 * dt);

  let curCave = null;
  if (!under && !inHouse) for (const c of caves) { if (Math.hypot(frog.x - c.x, frog.z - c.z) < c.R) { curCave = c; break; } }
  let gy;
  if (inHouse) gy = inHouse.fy;
  else if (under) gy = under.roomY;
  else if (curCave) { const dr = Math.hypot(frog.x - curCave.x, frog.z - curCave.z); const tt = Math.min(1, Math.max(0, (curCave.R - dr) / (curCave.R * 0.35))); gy = groundY(frog.x, frog.z) * (1 - tt) + curCave.floorY * tt; }
  else gy = groundY(frog.x, frog.z);
  const onGround = frog.y <= gy + 0.06 && frog.vy <= 0.01;
  const si = (under || curCave || inHouse) ? { slope: 0, downX: 0, downZ: 0 } : slopeInfo(frog.x, frog.z);
  const icy = (under || curCave || inHouse) ? false : isIcy(frog.x, frog.z);

  let grip = 1.0;
  if (icy) grip *= gear.crampons ? 0.7 : 0.13;
  if (si.slope > 0.7) grip *= gear.crampons ? 0.8 : 0.4;
  if (!onGround) grip *= 0.5;
  grip = Math.max(0.04, grip);
  const accel = Math.min(1, grip * 16 * dt);

  const solidStill = onGround && !icy && si.slope < 0.5;
  if (len > 0) {
    ix /= len; iz /= len;
    const wantX = (_fwd.x * iz + _right.x * ix) * speed, wantZ = (_fwd.z * iz + _right.z * ix) * speed;
    frog.vx += (wantX - frog.vx) * accel; frog.vz += (wantZ - frog.vz) * accel;
  } else if (solidStill) {
    frog.vx = 0; frog.vz = 0;            // no input on solid ground → stop dead (no drift)
  } else {
    frog.vx += (0 - frog.vx) * accel; frog.vz += (0 - frog.vz) * accel;
  }

  if (onGround && (si.slope > 0.55 || icy) && !gear.crampons) {
    const slide = si.slope * (icy ? 20 : 10) * dt; frog.vx += si.downX * slide; frog.vz += si.downZ * slide;
  }
  const wc = WEATHER[weather];
  if (wc.wind > 0 && !(solidStill && len === 0)) { frog.vx += Math.sin(windDir) * wc.wind * 0.2 * dt; frog.vz += Math.cos(windDir) * wc.wind * 0.2 * dt; }

  if (keys[" "] && onGround) frog.vy = JUMP_V * player.jumpMul;
  frog.vy -= GRAV * dt;

  const prevX = frog.x, prevZ = frog.z;
  frog.x += frog.vx * dt; frog.z += frog.vz * dt; frog.y += frog.vy * dt;

  let inCave = !!under;
  if (inHouse) {
    frog.x = Math.max(inHouse.cx - (inHouse.hx - 1), Math.min(inHouse.cx + (inHouse.hx - 1), frog.x));
    frog.z = Math.max(inHouse.cz - (inHouse.hz - 1), Math.min(inHouse.cz + (inHouse.hz - 1), frog.z));
  } else if (under) {
    // bound inside the underground room
    const dx = frog.x - under.cx, dz = frog.z - under.cz, dr = Math.hypot(dx, dz);
    if (dr > under.RR - 1.5) { frog.x = under.cx + dx / dr * (under.RR - 1.5); frog.z = under.cz + dz / dr * (under.RR - 1.5); }
  } else {
    frog.x = Math.max(-HALF + 4, Math.min(HALF - 4, frog.x));
    frog.z = Math.max(-HALF + 4, Math.min(HALF - 4, frog.z));
    // glacier gates block upward progress until climbed
    for (const g of gates) { if (!g.climbed && frog.z > g.z - 1.2) { frog.z = g.z - 1.2; if (frog.vz > 0) frog.vz = 0; } }
    // cave walls are solid — push the frog to the correct side (smooth slide), entrance gap is open
    for (const c of caves) {
      const dx = frog.x - c.x, dz = frog.z - c.z, dr = Math.hypot(dx, dz) || 0.001;
      if (dr < c.R) inCave = true;
      let ang = Math.atan2(dz, dx), ad = Math.abs(ang - c.entA);
      if (ad > Math.PI) ad = 2 * Math.PI - ad;
      if (ad >= c.entHalf) {
        const wasIn = Math.hypot(prevX - c.x, prevZ - c.z) < c.R;
        if (wasIn && dr > c.R - 0.8) { const k = (c.R - 0.8) / dr; frog.x = c.x + dx * k; frog.z = c.z + dz * k; }
        else if (!wasIn && dr < c.R + 1.0) { const k = (c.R + 1.0) / dr; frog.x = c.x + dx * k; frog.z = c.z + dz * k; }
      }
    }
  }

  let ncave = null;
  if (!under && !inHouse) for (const c of caves) { if (Math.hypot(frog.x - c.x, frog.z - c.z) < c.R) { ncave = c; break; } }
  let ngy;
  if (inHouse) ngy = inHouse.fy;
  else if (under) ngy = under.roomY;
  else if (ncave) { const dr = Math.hypot(frog.x - ncave.x, frog.z - ncave.z); const tt = Math.min(1, Math.max(0, (ncave.R - dr) / (ncave.R * 0.35))); ngy = groundY(frog.x, frog.z) * (1 - tt) + ncave.floorY * tt; }
  else ngy = groundY(frog.x, frog.z);
  if (frog.y <= ngy) { if (frog.vy < -24) { const d = (-frog.vy - 24) * 1.7; frog.hp -= d; if (d > 6) toast("💥 Hard landing!"); } frog.y = ngy; frog.vy = 0; }

  // fall into a hidden crevasse
  if (!under && !frog.crevasse && frog.crevImmune <= 0 && frog.y <= ngy + 0.2) {
    for (const cr of crevasses) {
      if (Math.hypot(frog.x - cr.x, frog.z - cr.z) < cr.r * 0.7) {
        const cy = groundY(cr.x, cr.z); frog.crevasse = { x: cr.x, z: cr.z, climb: 0, floorY: cy - 5, topY: cy };
        toast("🕳️ You fell into a hidden crevasse!"); break;
      }
    }
  }

  // ---- smooth turning + walk animation ----
  const hv = Math.hypot(frog.vx, frog.vz);
  if (hv > 0.4) frog.yaw = dampAngle(frog.yaw, Math.atan2(frog.vx, frog.vz), 11, dt);
  frogModel.position.set(frog.x, frog.y, frog.z); frogModel.rotation.set(0, frog.yaw, 0);
  frogModel.scale.set(1, 1, 1);
  const moving = onGround && hv > 0.6;
  fm.walk += dt * (moving ? Math.min(hv, SPRINT) * 1.7 : 2.5);
  const sw = Math.sin(fm.walk), bY = fm.bodyY, fY = fm.feetY, fZ = fm.feetZ;
  const fxL = fm.feet[0].position.x, fxR = fm.feet[1].position.x;
  if (moving) {
    fm.feet[0].position.set(fxL, fY + Math.max(0, sw) * 0.22, fZ + sw * 0.4);
    fm.feet[1].position.set(fxR, fY + Math.max(0, -sw) * 0.22, fZ - sw * 0.4);
    fm.arms[0].rotation.x = -sw * 0.6; fm.arms[1].rotation.x = sw * 0.6;
    fm.body.position.y = bY + Math.abs(sw) * 0.09;
  } else {
    fm.feet[0].position.set(fxL, fY, fZ); fm.feet[1].position.set(fxR, fY, fZ);
    fm.arms[0].rotation.x = 0; fm.arms[1].rotation.x = 0;
    fm.body.position.y = bY + Math.sin(performance.now() * 0.003) * 0.04; // breathing
  }
  if (fm.ears) { const e = sw * (moving ? 0.3 : 0.05); fm.ears[0].rotation.x = -e; fm.ears[1].rotation.x = e; }

  // ---- warmth: campfire warms (even in caves); caves shelter from drain ----
  let nearFire = false; for (const f of fires) if (Math.hypot(frog.x - f.x, frog.z - f.z) < 6) nearFire = true;
  const drain = wc.drain * (gear.coat ? 0.5 : 1) * (gear.jacket ? 0.55 : 1);
  if (nearFire) frog.warmth = Math.min(100, frog.warmth + 20 * dt);
  else if (inCave || under || inHouse || (boss && boss.state === "active")) { /* sheltered / fighting the boss — warmth holds */ }
  else { frog.warmth -= drain * dt; if (frog.warmth <= 0) { frog.warmth = 0; frog.hp -= 6 * dt; } }

  // lighting: top-floor caves stay LIT, the underground bottom floor is INSTANTLY pitch black
  inCaveNow = !!under;
  if (under) { ambient.intensity = 0; hemi.intensity = 0; }
  else {
    ambient.intensity += (0.28 - ambient.intensity) * Math.min(1, dt * 4);
    hemi.intensity += (0.9 - hemi.intensity) * Math.min(1, dt * 4);
  }
  const wantTorch = (under && gear.torch) ? 4.0 : 0;
  torchLight.intensity += (wantTorch - torchLight.intensity) * Math.min(1, dt * 5);
  torchLight.distance = 13;   // only lights nearby — must approach a chest to see its skull
  torchLight.position.set(frog.x, frog.y + 2.2, frog.z);
  // snow must not clip into caves/houses
  let nearCave = under || inHouse;
  for (const c of caves) if (Math.hypot(frog.x - c.x, frog.z - c.z) < c.R + 6) nearCave = true;
  snow.visible = !nearCave && WEATHER[weather].snow > 0;

  // touching the flag awakens the Snow Giant
  if (boss && boss.state === "dormant" && !cutscene && Math.hypot(frog.x, frog.z - SUMMIT_Z) < 8) startAwaken();

  if (frog.hp <= 0) return lose();
}

// ---------- Camera ----------
const _camPos = new THREE.Vector3();
let camInit = false;
function updateCamera(snap) {
  const cx = Math.sin(camYaw) * Math.cos(camPitch), cz = Math.cos(camYaw) * Math.cos(camPitch), cy = Math.sin(camPitch);
  // keep the camera inside whatever cave you're in (no peeking through walls)
  let confine = null;
  if (!inHouse) {
    if (underground) confine = { cx: underground.cx, cz: underground.cz, r: underground.RR - 1.5, top: underground.roomY + 14 };
    else for (const c of caves) { if (Math.hypot(frog.x - c.x, frog.z - c.z) < c.R * 0.95) { confine = { cx: c.x, cz: c.z, r: c.R - 1.5, top: c.floorY + c.R * 0.78 }; break; } }
  }
  const dist = inHouse ? 6 : (confine ? 5.5 : camDist);
  if (snap || !camInit) camDistCur = dist; else camDistCur += (dist - camDistCur) * 0.1;   // smooth zoom in/out of caves
  const tx = frog.x, ty = frog.y + 2, tz = frog.z;
  _camPos.set(tx - cx * camDistCur, ty + cy * camDistCur + 1, tz - cz * camDistCur);
  if (snap || !camInit) { camera.position.copy(_camPos); camInit = true; } else camera.position.lerp(_camPos, 0.16);
  if (inHouse) {
    camera.position.x = Math.max(inHouse.cx - (inHouse.hx - 0.8), Math.min(inHouse.cx + (inHouse.hx - 0.8), camera.position.x));
    camera.position.z = Math.max(inHouse.cz - (inHouse.hz - 0.8), Math.min(inHouse.cz + (inHouse.hz - 0.8), camera.position.z));
    camera.position.y = Math.max(inHouse.fy + 1.4, Math.min(inHouse.fy + 4.6, camera.position.y));
  } else if (confine) {
    const dx = camera.position.x - confine.cx, dz = camera.position.z - confine.cz, dr = Math.hypot(dx, dz);
    if (dr > confine.r) { camera.position.x = confine.cx + dx / dr * confine.r; camera.position.z = confine.cz + dz / dr * confine.r; }
    if (camera.position.y > confine.top) camera.position.y = confine.top;
    if (!underground) { const mY = groundY(camera.position.x, camera.position.z) + 1.0; if (camera.position.y < mY) camera.position.y = mY; }
  } else { const minY = groundY(camera.position.x, camera.position.z) + 1.4; if (camera.position.y < minY) camera.position.y = minY; }
  camera.lookAt(tx, ty, tz);
  sky.position.copy(camera.position);
  sun.position.set(frog.x + 60, frog.y + 100, frog.z + 40); sun.target.position.set(frog.x, frog.y, frog.z);
  snowMat.uniforms.uCam.value.copy(camera.position);
}

// ---------- Interact (E) ----------
function findInteract() {
  if (inHouse) {
    for (const c of chests) { if (c.cabin && !c.opened && Math.hypot(frog.x - c.x, frog.z - c.z) < 3.5) return { best: c, type: "chest" }; }
    return { best: inHouse, type: "houseExit" };
  }
  if (underground) {
    let best = null, bd = 3.6;
    for (const c of chests) { if (c.opened) continue; const d = Math.hypot(frog.x - c.x, frog.z - c.z); if (d < bd) { bd = d; best = c; } }
    if (best) return { best, type: "chest" };
    const u = underground; if (Math.hypot(frog.x - u.ropeX, frog.z - u.ropeZ) < 3) return { best: u, type: "ropeUp" };
    return null;
  }
  let best = null, bd = 3.6, type = null;
  for (const t of trees) { if (t.fallen) continue; const d = Math.hypot(frog.x - t.x, frog.z - t.z); if (d < bd) { bd = d; best = t; type = "tree"; } }
  for (const n of nodes) { if (n.depleted) continue; const d = Math.hypot(frog.x - n.x, frog.z - n.z); if (d < bd) { bd = d; best = n; type = "node"; } }
  for (const a of allies) { if (a.state !== "trapped") continue; const d = Math.hypot(frog.x - a.root.position.x, frog.z - a.root.position.z); if (d < 4.5 && d < bd + 1) { bd = d; best = a; type = "ally"; } }
  for (const c of caves) { if (!c.basement) continue; if (Math.hypot(frog.x - c.basement.ropeX, frog.z - c.basement.ropeZ) < 3) return { best: c.basement, type: "ropeDown" }; }
  for (const g of gates) { if (g.climbed) continue; if (frog.z < g.z && g.z - frog.z < 4.5) return { best: g, type: "gate" }; }
  for (const h of houses) { if (h.fallen) continue; if (Math.hypot(frog.x - h.x, frog.z - h.z) < 4) return { best: h, type: "houseEnter" }; }
  return best ? { best, type } : null;
}
function interactPrompt() {
  if (frog.crevasse) return;   // keep the crevasse climb prompt
  const it = findInteract(); nearInteract = it;
  if (!it) { setPrompt(""); return; }
  if (it.type === "tree") setPrompt(`Press <b>E</b> to chop tree (${it.best.hits}/4)`);
  else if (it.type === "node") { const d = NODE_DEF[it.best.type]; setPrompt(`Press <b>E</b> to ${d.prompt} (${it.best.hits}/${it.best.max})`); }
  else if (it.type === "ally") setPrompt(`Hold <b>E</b> to free ${it.best.name} (${it.best.hits}/${it.best.need})`);
  else if (it.type === "gate") setPrompt(gear[it.best.requires] ? `Press <b>E</b> to scale the glacier` : `🧗 Glacier — needs <b>${it.best.label}</b> (craft with C)`);
  else if (it.type === "ropeDown") setPrompt(`Press <b>E</b> to climb down the rope ⬇️`);
  else if (it.type === "ropeUp") setPrompt(`Press <b>E</b> to climb back up ⬆️`);
  else if (it.type === "chest") setPrompt(`Press <b>E</b> to open the chest`);
  else if (it.type === "houseEnter") setPrompt(`Press <b>E</b> to enter the cabin 🚪`);
  else if (it.type === "houseExit") setPrompt(`Press <b>E</b> to leave the cabin 🚪`);
}
function doInteract() {
  const it = nearInteract; if (!it) return;
  if (it.type === "tree") { const t = it.best; t.hits++; t.shake = 0.4; if (t.hits >= 4) { t.fallen = true; t.falling = 1; inv.wood += 3; toast("🪵 Timber! +3 wood"); updateHud(); } }
  else if (it.type === "node") {
    const n = it.best, d = NODE_DEF[n.type]; n.hits++;
    const mult = (n.type === "iron" || n.type === "stone") && gear.axe ? 2 : 1;
    inv[d.res] += d.per * mult; if (d.extra) for (const k in d.extra) inv[k] += d.extra[k];
    n.root.scale.multiplyScalar(0.82);
    if (n.hits >= n.max) { n.depleted = true; scene.remove(n.root); }
    toast(`${RES_ICON[d.res]} +${d.per * mult} ${d.res}` + (d.extra ? ` · 🌿 +${d.extra.herb}` : "")); updateHud();
  } else if (it.type === "ally") {
    const a = it.best; a.hits++; a.ice.scale.multiplyScalar(0.84);
    if (a.hits >= a.need) { scene.remove(a.ice); a.ice = null; a.state = "active"; toast(`✨ ${a.name} is freed! Press F to send allies into battle.`); updateHud(); }
    else toast(`Chipping ice… (${a.hits}/${a.need})`);
  } else if (it.type === "gate") {
    const g = it.best;
    if (!gear[g.requires]) { toast(`🧗 You need ${g.label} to scale this glacier.`); return; }
    g.climbed = true;
    const cx = frog.x, faceZ = g.z - 1.8; frog.z = faceZ;
    frog.climb = { t: 0, dur: 3.2, x: cx, z0: faceZ, z1: g.z + 7, baseY: groundY(cx, faceZ), topY: groundY(cx, g.z + 7), arc: 14 };
    toast(`🧗 Scaling the glacier!`);
  } else if (it.type === "ropeDown") {
    const bm = it.best; frog.x = bm.ropeX; frog.z = bm.ropeZ;
    frog.rope = { t: 0, dur: 1.6, x: bm.ropeX, z: bm.ropeZ, y0: bm.topY, y1: bm.roomY, enter: true, bm };
    toast("⬇️ Climbing down the rope…");
  } else if (it.type === "ropeUp") {
    const u = it.best;
    frog.rope = { t: 0, dur: 1.6, x: u.ropeX, z: u.ropeZ, y0: u.roomY, y1: u.topY, enter: false };
    toast("⬆️ Climbing up…");
  } else if (it.type === "houseEnter") {
    inHouse = { exitX: frog.x, exitZ: frog.z, cx: cabinRoom.cx, cz: cabinRoom.cz, fy: cabinRoom.fy, hx: cabinRoom.hx, hz: cabinRoom.hz };
    frog.x = cabinRoom.cx; frog.z = cabinRoom.cz + 6; frog.y = cabinRoom.fy; frog.vx = frog.vy = frog.vz = 0; frog.yaw = Math.PI; camInit = false;
    toast("🚪 You step inside the cozy cabin.");
  } else if (it.type === "houseExit") {
    const h = it.best; frog.x = h.exitX; frog.z = h.exitZ; frog.y = groundY(frog.x, frog.z); inHouse = null; camInit = false; toast("🚪 Back outside.");
  } else if (it.type === "chest") {
    const c = it.best; if (c.opened) return; c.opened = true; c.lid.rotation.x = -1.9;
    if (c.isTrap) { frog.hp = Math.max(0, frog.hp - 33); damageFlash(); toast("💥 It's a TRAP! Lost a third of your health."); }
    else if (c.loot === "sword") { gear.sword = true; attachWeapon("sword"); toast("🗡️ A Sword! Left-click to swing · hold Right-click to spin-attack."); }
    else if (c.loot === "shield") { gear.shield = true; attachWeapon("shield"); toast("🛡️ A Shield! Blocks 45% of incoming damage."); }
    else if (c.loot === "salveBig") { frog.hp = Math.min(100, frog.hp + 60); toast("🧪 A healing draught! +60 health."); }
    else if (c.loot === "supplies") { inv.stone += 4; inv.fiber += 4; inv.leather += 2; toast("📦 Supplies! +4 🪨 +4 🧶 +2 🟫"); }
    else { inv.crystal += 4; toast("💎 +4 crystals"); }
    updateHud();
  }
}

// ---------- Player weapons & melee ----------
const FX_ICE = mat({ color: 0xbfe6ff, emissive: 0x3aa0e0, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.9, flatShading: true });
function makeSword() {
  const g = new THREE.Group();
  P(g, G.box, mat({ color: 0xe2eef6, metalness: 0.5, roughness: 0.3 }), [0, 0.85, 0], null, [0.13, 1.5, 0.05]);
  P(g, G.cone, mat({ color: 0xeaf4ff, metalness: 0.5, roughness: 0.3 }), [0, 1.68, 0], null, [0.11, 0.32, 0.05]);
  P(g, G.box, mat({ color: 0x6b4327 }), [0, 0.05, 0], null, [0.44, 0.14, 0.18]);
  P(g, G.box, mat({ color: 0x4a2f18 }), [0, -0.28, 0], null, [0.13, 0.5, 0.13]);
  return g;
}
function makeShield() {
  const g = new THREE.Group();
  P(g, G.cyl, mat({ color: 0x9aa0aa, metalness: 0.4, roughness: 0.45 }), [0, 0, 0], [Math.PI / 2, 0, 0], [0.6, 0.18, 0.6]);
  P(g, G.sph, mat({ color: 0xffd27a, metalness: 0.3 }), [0, 0, 0.11], null, [0.15, 0.15, 0.15]);
  return g;
}
function attachWeapon(type) {
  if (type === "sword") { const s = makeSword(); s.scale.setScalar(0.85); frogModel.add(s); player.swordMesh = s; }
  else { const sh = makeShield(); frogModel.add(sh); player.shieldMesh = sh; }
}
function meleeHit(range, dmg, frontal) {
  const fx = Math.sin(frog.yaw), fz = Math.cos(frog.yaw);
  const tryHit = (m, extra, yoff) => {
    const dx = m.root.position.x - frog.x, dz = m.root.position.z - frog.z, d = Math.hypot(dx, dz);
    if (d > range + extra) return false;
    if (frontal && d > 1) { const dot = (dx * fx + dz * fz) / d; if (dot < 0.0) return false; }
    m.hp -= dmg; m.root.scale.multiplyScalar(0.95);
    showDamage(m.root.position.x, m.root.position.y + (yoff || 3), m.root.position.z, dmg);
    return true;
  };
  for (const m of monsters) if (m.hp > 0) tryHit(m, 0);
  if (boss && boss.state === "active" && boss.hp > 0) tryHit(boss, boss.S * 1.5, boss.S * 4);
  // village entities are hittable — striking any of them angers the guardian
  for (const vg of villagers) if (vg.hp > 0 && tryHit(vg, 0.4, 2)) angerVillage();
  if (guardian && guardian.hp > 0 && tryHit(guardian, 1.5, 3.5)) angerVillage();
  for (const h of houses) if (h.hp > 0) {
    if (Math.hypot(h.x - frog.x, h.z - frog.z) < range + 2.5) { h.hp -= dmg; showDamage(h.x, groundY(h.x, h.z) + 3.5, h.z, dmg); angerVillage(); }
  }
}

// ---------- Floating damage numbers ----------
const dmgPopups = [];
const _dv = new THREE.Vector3();
function showDamage(x, y, z, amount) {
  const el = document.createElement("div");
  el.className = "dmgnum"; el.textContent = "-" + Math.round(amount);
  document.getElementById("dmgnums").appendChild(el);
  dmgPopups.push({ x, y, z, life: 0.2, el });
}
function updateDmgPopups(dt) {
  for (let i = dmgPopups.length - 1; i >= 0; i--) {
    const p = dmgPopups[i]; p.life -= dt;
    if (p.life <= 0) { p.el.remove(); dmgPopups.splice(i, 1); continue; }
    _dv.set(p.x, p.y, p.z).project(camera);
    if (_dv.z > 1) { p.el.style.display = "none"; continue; }
    p.el.style.display = "block";
    p.el.style.left = (_dv.x * 0.5 + 0.5) * innerWidth + "px";
    p.el.style.top = (-_dv.y * 0.5 + 0.5) * innerHeight + "px";
    p.el.style.opacity = Math.min(1, p.life / 0.2 + 0.2);
  }
}
function updateCombat(dt) {
  if (!frogModel || frog.climb || frog.rope) return;
  const sm = player.swordMesh, sh = player.shieldMesh;
  if (sh) { sh.position.set(-1.05, 1.05, 0.55); sh.rotation.set(0, 0, 0); }
  if (!gear.sword || !sm) return;
  const spin = rmbDown && frog.stamina > 0;
  if (spin) {
    player.spinning = true; frog.stamina = Math.max(0, frog.stamina - 32 * dt);
    player.spinAngle = (player.spinAngle || 0) + dt * 16;
    frogModel.rotation.y = player.spinAngle;                  // whirl the whole body
    sm.position.set(0.2, 1.0, 1.15); sm.rotation.set(-0.1, 0, -0.5);
    player.spinTick = (player.spinTick || 0) - dt;
    if (player.spinTick <= 0) { meleeHit(4.2, 16, false); player.spinTick = 0.25; }
  } else {
    player.spinning = false;
    if (player.swing > 0) {
      player.swing -= dt; const k = 1 - Math.max(0, player.swing) / 0.32;
      sm.position.set(0.9, 1.05, 0.7); sm.rotation.set(-0.6 + Math.sin(k * Math.PI) * 2.4, 0, 0);
    } else { sm.position.set(0.95, 1.05, 0.6); sm.rotation.set(-0.35, 0, 0); }
  }
}
let rmbDown = false;
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) { rmbDown = true; return; }                 // right-click charges spin
  if (e.button !== 0 || !running || craftOpen || cutscene) return;
  if (document.pointerLockElement !== canvas) return;
  if (gear.sword && !frog.climb && !frog.rope && (player.swing || 0) <= 0 && !rmbDown) { player.swing = 0.32; meleeHit(3.8, 28, true); }
});
window.addEventListener("mouseup", (e) => { if (e.button === 2) rmbDown = false; });
window.addEventListener("blur", () => { rmbDown = false; });

// ---------- Combat ----------
function moveTowards(root, tx, tz, step, collide) {
  const px = root.position.x, pz = root.position.z;
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz) || 1;
  let nx = px + (dx / d) * step, nz = pz + (dz / d) * step;
  if (collide) {
    for (const g of gates) { if ((pz - g.z) * (nz - g.z) < 0) nz = g.z - (nz > pz ? 1.5 : -1.5); }  // can't cross glacier walls
    for (const c of caves) { const cr = Math.hypot(nx - c.x, nz - c.z) || 1; if (cr < c.R + 1.5) { const k = (c.R + 1.5) / cr; nx = c.x + (nx - c.x) * k; nz = c.z + (nz - c.z) * k; } } // kept out of caves
  }
  root.position.x = nx; root.position.z = nz;
  root.position.y = groundY(nx, nz) + Math.abs(Math.sin(performance.now() * 0.01)) * 0.12;
  root.rotation.y = Math.atan2(dx, dz);
}
function nearestMonster(x, z, maxD) {
  let best = null, bd = maxD;
  for (const m of monsters) { if (m.hp <= 0) continue; const d = Math.hypot(m.root.position.x - x, m.root.position.z - z); if (d < bd) { bd = d; best = m; } }
  if (boss && boss.hp > 0) { const d = Math.hypot(boss.root.position.x - x, boss.root.position.z - z); if (d < bd) { bd = d; best = boss; } }
  return best;
}
function commandAllies() {
  const m = nearestMonster(frog.x, frog.z, 90); if (!m) { toast("No monsters nearby."); return; }
  let any = false; for (const a of allies) if (a.state === "active" && a.hp > 0) { a.target = m; any = true; }
  toast(any ? "✨ Allies, attack!" : "Free an ally first (hold E on the ice).");
}
const tmpS = new THREE.Vector3();
function updateAllies(dt) {
  for (const a of allies) {
    if (a.state === "trapped") { a.root.position.y = groundY(a.root.position.x, a.root.position.z) + Math.sin(performance.now()*0.005)*0.05; if (a.ice) a.ice.rotation.y += dt * 0.5; continue; }
    if (a.hp <= 0) {
      a.root.visible = false; a.bar.visible = false; a.deadT = (a.deadT || 0) + dt;
      if (a.deadT >= 2) { a.deadT = 0; a.hp = a.maxHp * 0.7; a.target = null; a.root.visible = true; a.root.position.set(frog.x + (a.slot - 1) * 2, groundY(frog.x, frog.z), frog.z - 2); toast(`✨ ${a.name} revived!`); }
      continue;
    }
    a.deadT = 0;
    if (a.cd > 0) a.cd -= dt;
    if (a.target && a.target.hp <= 0) a.target = null;
    if (!a.target) { const m = nearestMonster(a.root.position.x, a.root.position.z, 20); if (m) a.target = m; }
    if (a.target) {
      const e = a.target, ex = e.root.position.x, ez = e.root.position.z, d = Math.hypot(ex - a.root.position.x, ez - a.root.position.z);
      const reach = e.kind === "boss" ? (e.S || 9) * 1.4 : 1.9;
      if (d > reach) moveTowards(a.root, ex, ez, (a.kind === "owl" ? 7 : 6) * dt);
      else { a.root.rotation.y = Math.atan2(ex - a.root.position.x, ez - a.root.position.z); if (a.cd <= 0) { e.hp -= a.atk * player.allyDmgMul; a.cd = 0.55; e.root.scale.multiplyScalar(0.96); } }
    } else {
      const ang = a.slot * 2.2 + performance.now() * 0.0006;
      const tx = frog.x + Math.cos(ang) * 3.5, tz = frog.z + Math.sin(ang) * 3.5 - 1;
      if (Math.hypot(tx - a.root.position.x, tz - a.root.position.z) > 1) moveTowards(a.root, tx, tz, 7 * dt);
    }
    if (a.root.userData.wings) { const f = Math.sin(performance.now()*0.02)*0.5; a.root.userData.wings[0].rotation.z = 0.4 + f; a.root.userData.wings[1].rotation.z = -0.4 - f; }
    a.root.scale.lerp(V3, 0.18);
    a.bar.visible = true; billboard(a.bar, a.root, a.hp / a.maxHp, 2.4);
  }
}
function targetsFor(x, z) {
  let tx = frog.x, tz = frog.z, td = Math.hypot(frog.x - x, frog.z - z), tgt = null;
  for (const a of allies) { if (a.state !== "active" || a.hp <= 0) continue; const d = Math.hypot(a.root.position.x - x, a.root.position.z - z); if (d < td) { td = d; tx = a.root.position.x; tz = a.root.position.z; tgt = a; } }
  return { tx, tz, td, tgt };
}
function monsterAI(m, dt, aggro) {
  if (m.hp <= 0) return;
  if (m.cd > 0) m.cd -= dt;
  if (m.atkAnim > 0) m.atkAnim -= dt;
  m.root.scale.lerp(V3, 0.18);
  const x = m.root.position.x, z = m.root.position.z, t = targetsFor(x, z);
  let moved = false;
  if (t.td < aggro) {
    m.aggro = true; const reach = m.kind === "boss" ? 3.6 : (m.kind === "golem" ? 2.4 : 1.8);
    if (t.td > reach) { moveTowards(m.root, t.tx, t.tz, m.speed * dt, true); moved = true; }
    else {
      m.root.rotation.y = Math.atan2(t.tx - x, t.tz - z);
      if (m.cd <= 0) {
        m.cd = m.kind === "golem" ? 1.4 : (m.kind === "boss" ? 1.6 : 1.0); m.atkAnim = 0.28; m.root.scale.multiplyScalar(1.12);
        if (t.tgt) t.tgt.hp -= m.atk;
        else {
          frog.hp -= m.atk; damageFlash();
          if (m.kind === "golem") {                 // golems fling you back a little
            const dx = frog.x - x, dz = frog.z - z, dd = Math.hypot(dx, dz) || 1;
            frog.vx += dx / dd * 9; frog.vz += dz / dd * 9; if (frog.vy < 5) frog.vy = 6;
          }
        }
      }
    }
  } else {
    m.aggro = false; m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = 2 + Math.random()*3; m.tx = x + (Math.random()-0.5)*24; m.tz = z + (Math.random()-0.5)*24; }
    if (Math.hypot(m.tx - x, m.tz - z) > 1) { moveTowards(m.root, m.tx, m.tz, m.speed * 0.4 * dt, true); moved = true; }
  }
  // animation
  if (moved) m.walk += m.speed * dt * 1.4;
  const ud = m.root.userData, atk = m.atkAnim > 0 ? m.atkAnim / 0.28 : 0;
  if (ud.legs) { const a = moved ? 0.55 : 0; for (let i = 0; i < ud.legs.length; i++) ud.legs[i].rotation.x = Math.sin(m.walk + (i % 2 ? Math.PI : 0)) * a; }
  if (ud.arms) { const a = moved ? 0.3 : 0.05; ud.arms[0].rotation.x = Math.sin(m.walk * 0.7) * a - atk * 1.1; ud.arms[1].rotation.x = -Math.sin(m.walk * 0.7) * a - atk * 1.1; }
  if (m.kind === "wolf") m.root.rotation.x = -0.45 * atk;
}
function killMonster(m) {
  m.removed = true; scene.remove(m.root); scene.remove(m.bar);
  dropLoot(m); toast("💀 Monster slain! 🟫 dropped leather");
}
function dropLoot(m) {
  const amt = m.kind === "golem" ? 3 : 2;
  const g = new THREE.Group();
  P(g, G.box, mat({ color: 0x8a5a2b, roughness: 0.85 }), [0, 0, 0], null, [0.55, 0.32, 0.42]);
  P(g, G.box, mat({ color: 0x6e4524, roughness: 0.85 }), [0, 0, 0], null, [0.6, 0.14, 0.46]);
  const gx = m.root.position.x, gz = m.root.position.z;
  g.position.set(gx, groundY(gx, gz) + 0.8, gz); scene.add(g);
  pickups.push({ g, x: gx, z: gz, amount: amt });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.g.rotation.y += dt * 2.2; p.g.position.y = groundY(p.x, p.z) + 0.8 + Math.sin(performance.now() * 0.004) * 0.15;
    if (Math.hypot(frog.x - p.x, frog.z - p.z) < 2.6) { inv.leather += p.amount; toast(`🟫 +${p.amount} leather`); scene.remove(p.g); pickups.splice(i, 1); updateHud(); }
  }
}
function updateMonsters(dt) {
  for (const m of monsters) {
    if (m.hp <= 0) { if (!m.removed) killMonster(m); continue; }   // remove the moment it dies, wherever the killing blow came from
    monsterAI(m, dt, 30);
    if (m.hp <= 0) { killMonster(m); continue; }
    const show = m.aggro || m.hp < m.maxHp; m.bar.visible = show; if (show) billboard(m.bar, m.root, m.hp / m.maxHp, m.kind === "golem" ? 3.4 : 2.4);
  }
  if (boss) updateBoss(dt);
}

// ---------- Snow Giant boss ----------
function playerHurt(dmg) { frog.hp = Math.max(0, frog.hp - dmg * (gear.shield ? 0.55 : 1)); damageFlash(); }
function updateBoss(dt) {
  if (boss.state !== "active") return;
  const tnow = performance.now(), br = 1 + Math.sin(tnow * 0.003) * 0.02;   // breathing
  boss.root.scale.lerp(tmpS.set(boss.S * br, boss.S * br, boss.S * br), 0.25);
  const ud = boss.root.userData, Rr = boss.S * 1.4;
  const dx = frog.x - boss.x, dz = frog.z - boss.z, d = Math.hypot(dx, dz);
  boss.root.rotation.y = Math.atan2(dx, dz);
  let moving = false;
  if (d > Rr) { boss.x += dx / d * 6 * dt; boss.z += dz / d * 6 * dt; boss.walk += dt * 7; moving = true; }
  boss.root.position.set(boss.x, groundY(boss.x, boss.z), boss.z);
  if (ud.legs) { const a = moving ? 0.4 : 0; for (let i = 0; i < ud.legs.length; i++) ud.legs[i].rotation.x = Math.sin(boss.walk + (i ? Math.PI : 0)) * a; }
  // always-on idle animations: tail sway, jaw chomp
  if (ud.tail) ud.tail.rotation.y = Math.sin(tnow * 0.0018) * 0.28 + (moving ? Math.sin(boss.walk) * 0.12 : 0);
  if (ud.jaw) ud.jaw.rotation.x = 0.1 + Math.abs(Math.sin(tnow * 0.0017)) * 0.3;
  // keep the stolen flag planted on his head
  flag.visible = true;
  const ffwd = boss.S * 1.1, fhy = groundY(boss.x, boss.z) + boss.S * 4.4;
  flag.position.set(boss.x + Math.sin(boss.root.rotation.y) * ffwd, fhy, boss.z + Math.cos(boss.root.rotation.y) * ffwd);
  flag.rotation.set(0.12, boss.root.rotation.y, 0.14);

  // two-arm overhead SLAM (slower)
  if (boss.slam >= 0) {
    boss.slam += dt; const p = boss.slam / 0.9;
    const armRot = p < 0.5 ? -2.4 * (p / 0.5) : -2.4 + 3.2 * ((p - 0.5) / 0.5);
    if (ud.arms) { ud.arms[0].rotation.x = armRot; ud.arms[1].rotation.x = armRot; }
    if (!boss.slamHit && p >= 0.55) { boss.slamHit = true; spawnShockwave(boss.x, boss.z); }
    if (p >= 1) { boss.slam = -1; if (ud.arms) { ud.arms[0].rotation.x = ud.arms[1].rotation.x = 0; } }
  } else if (boss.punch >= 0) {
    // one-hand punch
    boss.punch += dt; const p = boss.punch / 0.8;
    const armRot = p < 0.5 ? -2.2 * (p / 0.5) : -2.2 + 3.4 * ((p - 0.5) / 0.5);
    if (ud.arms) ud.arms[0].rotation.x = armRot;
    if (!boss.punchHit && p >= 0.55) { boss.punchHit = true; if (d < Rr + 10) { playerHurt(22); const dd = d || 1; frog.vx += dx / dd * -12; frog.vz += dz / dd * -12; frog.vy = 7; } }
    if (p >= 1) { boss.punch = -1; if (ud.arms) ud.arms[0].rotation.x = 0; }
  } else if (boss.fire >= 0) {
    boss.fire += dt; const p = boss.fire / 1.8;
    if (ud.jaw) ud.jaw.rotation.x = 0.7;                 // mouth wide open
    updateFireBreath(p);
    if (p >= 1) { boss.fire = -1; fireBreath.visible = false; }
  } else {
    boss.armRaise = Math.max(0, (boss.armRaise || 0) - dt * 3);
    const sway = Math.sin(tnow * 0.002) * 0.14;
    if (ud.arms) { ud.arms[0].rotation.x = -boss.armRaise - 0.5 + sway; ud.arms[1].rotation.x = -boss.armRaise - 0.5 - sway; }
  }

  boss.atkTimer -= dt;
  if (boss.atkTimer <= 0 && d < 90 && boss.slam < 0 && boss.punch < 0 && boss.fire < 0) { doBossAttack(d, Rr); boss.atkTimer = 2.8 + Math.random() * 1.8; }
  updateBossFx(dt);
  boss.bar.visible = true; billboard(boss.bar, boss.root, boss.hp / boss.maxHp, boss.S * 5.4);
  document.getElementById("bossbar-fill").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
  if (boss.hp <= 0) bossDefeated();
}
function doBossAttack(d, Rr) {
  const r = Math.random();
  if (d < Rr + 12 && r < 0.32) { boss.punch = 0; boss.punchHit = false; }
  else if (r < 0.45) { boss.slam = 0; boss.slamHit = false; }
  else if (r < 0.62) { const dd = d || 1; boss.fire = 0; boss.fireHit = false; boss.fireDx = (frog.x - boss.x) / dd; boss.fireDz = (frog.z - boss.z) / dd; }   // blue fire breath
  else if (r < 0.76) { boss.armRaise = 1.0; spawnIcicles(); }
  else if (r < 0.88) { boss.armRaise = 1.0; spawnIceBlocks(); }
  else { boss.armRaise = 1.1; spawnPillars(); }
}
function updateFireBreath(p) {
  fireBreath.visible = true;
  const ry = boss.root.rotation.y, mx = boss.x + Math.sin(ry) * boss.S * 1.9, mz = boss.z + Math.cos(ry) * boss.S * 1.9;
  const my = groundY(boss.x, boss.z) + boss.S * 4.2;
  const len = 50 * Math.min(1, p * 2);
  fireBreath.position.set(mx + boss.fireDx * len / 2, my - 2, mz + boss.fireDz * len / 2);
  fireBreath.scale.set(3 + Math.random() * 0.6, len, 3 + Math.random() * 0.6);
  fireBreath.lookAt(mx + boss.fireDx * len, my - 2, mz + boss.fireDz * len); fireBreath.rotateX(Math.PI / 2);
  fireBreath.material.opacity = 0.6 + Math.random() * 0.3;
  // hit: player on the beam line?
  if (!boss.fireHit && p > 0.25) {
    const px = frog.x - mx, pz = frog.z - mz, along = px * boss.fireDx + pz * boss.fireDz, perp = Math.abs(px * -boss.fireDz + pz * boss.fireDx);
    if (along > 0 && along < 54 && perp < 4) { boss.fireHit = true; startFireHit(); }
  }
}
function spawnShockwave(x, z) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.4, 8, 36), FX_ICE.clone());
  mesh.rotation.x = Math.PI / 2; mesh.position.set(x, groundY(x, z) + 0.4, z); scene.add(mesh);
  bossFx.waves.push({ x, z, r: 2, maxR: 34, dmg: 22, hit: false, mesh });
}
function spawnIcicles() {
  const hx = boss.x, hz = boss.z, hy = groundY(boss.x, boss.z) + boss.S * 3;
  for (let i = 0; i < 4; i++) {
    const tx = frog.x + (Math.random() - 0.5) * 6, tz = frog.z + (Math.random() - 0.5) * 6;
    const dx = tx - hx, dz = tz - hz, dist = Math.hypot(dx, dz) || 1, sp = 26;
    const mesh = new THREE.Mesh(G.cone, FX_ICE); mesh.scale.set(0.4, 1.4, 0.4);
    mesh.position.set(hx, hy, hz); scene.add(mesh);
    bossFx.icicles.push({ mesh, x: hx, y: hy, z: hz, vx: dx / dist * sp, vy: -7, vz: dz / dist * sp, life: 3, dmg: 14, r: 2.2 });
  }
}
function spawnIceBlocks() {
  const hx = boss.x, hz = boss.z, hy = groundY(boss.x, boss.z) + boss.S * 2.5;
  for (let i = 0; i < 2; i++) {
    const tx = frog.x + (Math.random() - 0.5) * 4, tz = frog.z + (Math.random() - 0.5) * 4;
    const dx = tx - hx, dz = tz - hz, dist = Math.hypot(dx, dz) || 1, sp = 20;
    const mesh = new THREE.Mesh(G.box, FX_ICE.clone()); mesh.scale.set(1.6, 1.6, 1.6);
    mesh.position.set(hx, hy, hz); scene.add(mesh);
    bossFx.icicles.push({ mesh, x: hx, y: hy, z: hz, vx: dx / dist * sp, vy: -4, vz: dz / dist * sp, life: 4, dmg: 26, r: 2.8, spin: true });
  }
}
function spawnPillars() {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * 6.28, rr = Math.random() * 7;
    const x = frog.x + Math.cos(a) * rr, z = frog.z + Math.sin(a) * rr;
    const tel = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 6, 20), mat({ color: 0x66c0ff, emissive: 0x3399cc, emissiveIntensity: 1, transparent: true, opacity: 0.7 }));
    tel.rotation.x = Math.PI / 2; tel.position.set(x, groundY(x, z) + 0.2, z); scene.add(tel);
    bossFx.pillars.push({ x, z, t: 1.0, erupted: false, tel, mesh: null, life: 0, hit: false });
  }
}
function updateBossFx(dt) {
  // shockwaves
  for (let i = bossFx.waves.length - 1; i >= 0; i--) {
    const w = bossFx.waves[i]; w.r += 26 * dt; w.mesh.scale.set(w.r, w.r, 1); w.mesh.material.opacity = Math.max(0, 0.9 * (1 - w.r / w.maxR));
    const dd = Math.hypot(frog.x - w.x, frog.z - w.z), grounded = frog.y <= groundY(frog.x, frog.z) + 0.8;
    if (!w.hit && grounded && Math.abs(dd - w.r) < 2.4) { w.hit = true; playerHurt(w.dmg); }
    if (w.r > w.maxR) { scene.remove(w.mesh); bossFx.waves.splice(i, 1); }
  }
  // icicles
  for (let i = bossFx.icicles.length - 1; i >= 0; i--) {
    const ic = bossFx.icicles[i]; ic.x += ic.vx * dt; ic.y += ic.vy * dt; ic.z += ic.vz * dt; ic.vy -= 12 * dt; ic.life -= dt;
    if (ic.spin) { ic.mesh.position.set(ic.x, ic.y, ic.z); ic.mesh.rotation.x += dt * 4; ic.mesh.rotation.y += dt * 3; }
    else { ic.mesh.position.set(ic.x, ic.y, ic.z); ic.mesh.lookAt(ic.x + ic.vx, ic.y + ic.vy, ic.z + ic.vz); ic.mesh.rotateX(Math.PI / 2); }
    const gyl = groundY(ic.x, ic.z);
    if (Math.hypot(frog.x - ic.x, frog.z - ic.z) < (ic.r || 2.2) && Math.abs(frog.y + 1 - ic.y) < 3.5) { playerHurt(ic.dmg || 15); scene.remove(ic.mesh); bossFx.icicles.splice(i, 1); continue; }
    if (ic.y <= gyl || ic.life <= 0) { scene.remove(ic.mesh); bossFx.icicles.splice(i, 1); }
  }
  // pillars
  for (let i = bossFx.pillars.length - 1; i >= 0; i--) {
    const p = bossFx.pillars[i];
    if (!p.erupted) {
      p.t -= dt; p.tel.material.opacity = 0.4 + Math.abs(Math.sin(performance.now() * 0.02)) * 0.4;
      if (p.t <= 0) {
        p.erupted = true; p.life = 1.6; scene.remove(p.tel);
        const gyl = groundY(p.x, p.z), mesh = new THREE.Mesh(G.cone, FX_ICE); mesh.scale.set(1.4, 4.5, 1.4); mesh.position.set(p.x, gyl + 2.2, p.z); scene.add(mesh); p.mesh = mesh;
        if (Math.hypot(frog.x - p.x, frog.z - p.z) < 2.6) { playerHurt(20); frog.vy = 11; }
      }
    } else { p.life -= dt; if (p.mesh) p.mesh.position.y -= dt * 1.5; if (p.life <= 0) { if (p.mesh) scene.remove(p.mesh); bossFx.pillars.splice(i, 1); } }
  }
}
function bossDefeated() {
  if (won) return; won = true; boss.state = "dead"; flag.visible = false; fireBreath.visible = false;
  document.getElementById("bossbar").classList.add("hidden");
  for (const w of bossFx.waves) scene.remove(w.mesh); for (const ic of bossFx.icicles) scene.remove(ic.mesh); for (const p of bossFx.pillars) { if (p.tel) scene.remove(p.tel); if (p.mesh) scene.remove(p.mesh); }
  bossFx.waves.length = bossFx.icicles.length = bossFx.pillars.length = 0;
  startRescue();
}
function buildAmbulance() {
  const g = new THREE.Group();
  const body = mat({ color: 0xf2f2f2, roughness: 0.5 }), red = mat({ color: 0xd02a2a, roughness: 0.5 }),
        glass = mat({ color: 0x223344, roughness: 0.2, metalness: 0.4 }), tyre = mat({ color: 0x1a1a1a, roughness: 0.8 }),
        lightR = mat({ color: 0xff3030, emissive: 0xff0000, emissiveIntensity: 2 }), lightB = mat({ color: 0x3060ff, emissive: 0x0030ff, emissiveIntensity: 2 });
  P(g, G.box, body, [0, 1.5, 0], null, [2.6, 2.2, 5.4]);            // box body
  P(g, G.box, body, [0, 1.2, 3.0], null, [2.6, 1.6, 1.2]);         // cab
  P(g, G.box, glass, [0, 1.6, 3.65], null, [2.2, 0.9, 0.2]);       // windshield
  P(g, G.box, red, [1.31, 1.6, 0], null, [0.06, 0.7, 0.7]); P(g, G.box, red, [1.31, 1.6, 0], null, [0.06, 0.2, 1.6]); // red cross (R)
  P(g, G.box, red, [-1.31, 1.6, 0], null, [0.06, 0.7, 0.7]); P(g, G.box, red, [-1.31, 1.6, 0], null, [0.06, 0.2, 1.6]);
  const lr = P(g, G.box, lightR, [-0.5, 2.75, 2.6], null, [0.5, 0.3, 0.5], true), lb = P(g, G.box, lightB, [0.5, 2.75, 2.6], null, [0.5, 0.3, 0.5], true);
  for (const sx of [-1, 1]) for (const sz of [-1.6, 2.3]) P(g, G.cyl, tyre, [sx * 1.2, 0.5, sz], [0, 0, Math.PI / 2], [0.6, 0.4, 0.6]);
  g.userData.lights = [lr, lb];
  return g;
}
let ambulance = null;

// ============================================================
//  Village — houses, villagers, a guardian
// ============================================================
function buildHouse() {
  const g = new THREE.Group();
  const log = mat({ color: 0x9c6b3f, roughness: 0.9 }), logD = mat({ color: 0x7a5230, roughness: 0.9 }),
        roof = mat({ color: 0x4a3018, roughness: 0.85 }), snowM = mat({ color: 0xf0f5ff, roughness: 0.7 }),
        win = mat({ color: 0xffd27a, emissive: 0xffaa33, emissiveIntensity: 1.6 }), frame = mat({ color: 0x5a3a22, roughness: 0.7 }),
        stone = mat({ color: 0x7c8088, roughness: 1, flatShading: true });
  const W = 6.5, D = 5.5, H = 4.0;             // front = +z
  P(g, G.box, logD, [0, H / 2, 0], null, [W - 0.3, H, D - 0.3]);        // solid core (no gaps)
  for (let i = 0; i < 5; i++) {                                        // stacked log rows w/ corner notches
    const y = 0.5 + i * 0.78, m = i % 2 ? log : logD, ext = i % 2 ? 0.5 : 0;
    P(g, G.cyl, m, [0, y, D / 2], [0, 0, Math.PI / 2], [0.32, W + ext, 0.32]);
    P(g, G.cyl, m, [0, y, -D / 2], [0, 0, Math.PI / 2], [0.32, W + ext, 0.32]);
    P(g, G.cyl, m, [-W / 2, y, 0], [Math.PI / 2, 0, 0], [0.32, D + (0.5 - ext), 0.32]);
    P(g, G.cyl, m, [W / 2, y, 0], [Math.PI / 2, 0, 0], [0.32, D + (0.5 - ext), 0.32]);
  }
  // peaked gable roof — two slabs meeting cleanly at the ridge
  const roofH = 2.3, ridgeY = H + roofH, midY = H + roofH / 2, ra = 0.69, rl = 3.6, rz = D / 4;
  P(g, G.box, roof, [0, midY, rz], [ra, 0, 0], [W + 1.0, 0.3, rl]);
  P(g, G.box, roof, [0, midY, -rz], [-ra, 0, 0], [W + 1.0, 0.3, rl]);
  P(g, G.box, snowM, [0, midY + 0.22, rz], [ra, 0, 0], [W + 1.1, 0.16, rl]);
  P(g, G.box, snowM, [0, midY + 0.22, -rz], [-ra, 0, 0], [W + 1.1, 0.16, rl]);
  // gable-end triangles (close the front/back openings under the peak)
  const gable = mat({ color: 0x7a5230, roughness: 0.9, side: THREE.DoubleSide });
  P(g, G.tri, gable, [0, H - 0.1, D / 2 + 0.02], null, [W / 2 + 0.1, roofH + 0.1, 1]);
  P(g, G.tri, gable, [0, H - 0.1, -D / 2 - 0.02], null, [W / 2 + 0.1, roofH + 0.1, 1]);
  // stone chimney with snow cap
  P(g, G.box, stone, [W * 0.32, H + 1.7, -D * 0.2], null, [0.9, 2.4, 0.9]);
  P(g, G.box, snowM, [W * 0.32, H + 2.95, -D * 0.2], null, [1.0, 0.2, 1.0]);
  // door + warm windows
  P(g, G.box, frame, [0, 1.2, D / 2 + 0.35], null, [1.3, 2.4, 0.18]);
  P(g, G.box, frame, [-2.0, 2.3, D / 2 + 0.36], null, [1.1, 1.1, 0.1]); P(g, G.box, win, [-2.0, 2.3, D / 2 + 0.3], null, [0.86, 0.86, 0.2], true);
  P(g, G.box, frame, [2.0, 2.3, D / 2 + 0.36], null, [1.1, 1.1, 0.1]); P(g, G.box, win, [2.0, 2.3, D / 2 + 0.3], null, [0.86, 0.86, 0.2], true);
  // porch: overhang + posts + bench + step
  P(g, G.box, roof, [0, 3.5, D / 2 + 1.4], null, [3.8, 0.2, 2.0]);
  P(g, G.cyl, logD, [-1.6, 1.75, D / 2 + 2.2], null, [0.16, 3.5, 0.16]); P(g, G.cyl, logD, [1.6, 1.75, D / 2 + 2.2], null, [0.16, 3.5, 0.16]);
  P(g, G.box, logD, [0, 0.5, D / 2 + 1.7], null, [2.0, 0.3, 0.5]); P(g, G.box, logD, [0, 0.85, D / 2 + 1.5], null, [2.0, 0.5, 0.18]);
  P(g, G.box, snowM, [0, 0.18, D / 2 + 1.0], null, [2.6, 0.36, 0.8]);
  return g;
}
// one shared cozy cabin interior you teleport into (placed off-map)
function buildCabinInterior(cx, cz, fy) {
  const g = new THREE.Group();
  const wall = mat({ color: 0xa9743f, roughness: 0.85, side: THREE.DoubleSide }),
        floorM = mat({ color: 0xb87c46, roughness: 0.8 }), stone = mat({ color: 0x8a8f98, roughness: 1, flatShading: true }),
        fireM = mat({ color: 0xffae3a, emissive: 0xff7a10, emissiveIntensity: 2.8 }),
        rug = mat({ color: 0x7a3a2a, roughness: 0.9 }), couch = mat({ color: 0x9a7250, roughness: 0.8 }),
        wood = mat({ color: 0x6e4524, roughness: 0.85 }), lampM = mat({ color: 0xfff0c0, emissive: 0xffcf6a, emissiveIntensity: 2 }),
        antler = mat({ color: 0xe8e0d0, roughness: 0.6 }), pic = mat({ color: 0x3a5a3a, roughness: 0.7 }), cushion = mat({ color: 0xb04a3a, roughness: 0.8 });
  const HX = 7, HZ = 9, H = 5;
  P(g, G.box, floorM, [0, -0.1, 0], null, [HX * 2, 0.4, HZ * 2]);
  P(g, G.box, wall, [0, H / 2, -HZ], null, [HX * 2, H, 0.3]);
  P(g, G.box, wall, [0, H / 2, HZ], null, [HX * 2, H, 0.3]);
  P(g, G.box, wall, [-HX, H / 2, 0], null, [0.3, H, HZ * 2]);
  P(g, G.box, wall, [HX, H / 2, 0], null, [0.3, H, HZ * 2]);
  P(g, G.box, wall, [0, H + 1.6, -3.5], [-0.5, 0, 0], [HX * 2.1, 0.3, HZ * 1.5]);   // vaulted ceiling (∧)
  P(g, G.box, wall, [0, H + 1.6, 3.5], [0.5, 0, 0], [HX * 2.1, 0.3, HZ * 1.5]);
  // stone fireplace with bright warm fire
  P(g, G.box, stone, [0, 2.2, -HZ + 0.5], null, [3.6, 4.4, 0.7]);
  P(g, G.box, stone, [0, 4.9, -HZ + 0.5], null, [1.0, 1.8, 0.9]);
  const fire = P(g, G.box, fireM, [0, 1.35, -HZ + 1.0], null, [1.5, 1.2, 0.45], true);
  P(g, G.box, wood, [0, 0.45, -HZ + 1.1], null, [2.0, 0.3, 0.6]);                  // hearth logs
  const fl = new THREE.PointLight(0xffac55, 3.4, 34); fl.position.set(0, 1.9, -HZ + 2.0); g.add(fl);
  const fl2 = new THREE.PointLight(0xffd9a0, 1.6, 30); fl2.position.set(0, 4.5, 2); g.add(fl2);  // soft ceiling warmth
  // antlers + picture above the fireplace
  P(g, G.cone, antler, [-0.6, 5.0, -HZ + 0.9], [0.3, 0, 0.6], [0.1, 0.9, 0.1]); P(g, G.cone, antler, [0.6, 5.0, -HZ + 0.9], [0.3, 0, -0.6], [0.1, 0.9, 0.1]);
  P(g, G.box, pic, [-4.5, 3.0, -HZ + 0.3], null, [1.6, 1.2, 0.1]); P(g, G.box, pic, [4.5, 3.0, -HZ + 0.3], null, [1.6, 1.2, 0.1]);
  // table lamp (emissive + light) on a side table
  P(g, G.cyl, wood, [-5.6, 0.6, 6], null, [0.5, 1.2, 0.5]); P(g, G.sph, lampM, [-5.6, 1.6, 6], null, [0.4, 0.5, 0.4], true);
  // rug + coffee table + couches + cushions
  P(g, G.box, rug, [0, 0.13, 2.5], null, [7, 0.06, 6]);
  P(g, G.box, wood, [0, 0.75, 2.5], null, [2.8, 0.3, 1.4]); P(g, G.box, wood, [0, 0.4, 2.5], null, [2.4, 0.5, 1.0]);
  P(g, G.box, couch, [0, 0.7, 6.4], null, [5.6, 1.0, 1.6]); P(g, G.box, couch, [0, 1.3, 7.1], null, [5.6, 1.2, 0.4]);
  P(g, G.box, cushion, [-1.6, 1.25, 6.4], null, [1.0, 0.6, 1.0]); P(g, G.box, cushion, [1.6, 1.25, 6.4], null, [1.0, 0.6, 1.0]);
  P(g, G.box, couch, [-5.2, 0.7, 2.5], null, [1.6, 1.0, 3.2]); P(g, G.box, couch, [5.2, 0.7, 2.5], null, [1.6, 1.0, 3.2]);
  g.position.set(cx, fy, cz); scene.add(g);
  return { g, fire, fl, cx, cz, fy, hx: HX, hz: HZ };
}
const cabinRoom = buildCabinInterior(900, 0, -140);   // hidden off-map & underground; entered houses teleport here

// a towering snow tsunami shown during an avalanche
const avMesh = new THREE.Group();
{
  const avMat = mat({ color: 0xffffff, transparent: true, opacity: 0.95, roughness: 1 }),
        avMat2 = mat({ color: 0xdCeaf6, transparent: true, opacity: 0.95, roughness: 1, flatShading: true });
  const COLS = 9, ROWS = 6;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const m = new THREE.Mesh(G.sph, r === 0 ? avMat2 : avMat);
    const s = 7 + Math.random() * 6 + r;                       // bigger toward the top
    m.scale.set(s, s, s);
    m.position.set((c - (COLS - 1) / 2) * 17 + (Math.random() - 0.5) * 6,
                   r * 8 + Math.random() * 4,
                   -r * 5 + (Math.random() - 0.5) * 6);          // higher rows curl forward (downhill crest)
    avMesh.add(m);
  }
}
avMesh.visible = false; scene.add(avMesh);

// blue fire-breath beam
const fireBreath = new THREE.Mesh(G.cone, mat({ color: 0x8fd0ff, emissive: 0x33aaff, emissiveIntensity: 2.6, transparent: true, opacity: 0.8 }));
fireBreath.visible = false; scene.add(fireBreath);
function spawnHouse(x, z, rot) {
  const g = buildHouse(); g.position.set(x, groundY(x, z), z); g.rotation.y = rot; scene.add(g);
  houses.push({ root: g, x, z, fy: groundY(x, z), hp: 120, maxHp: 120, fallen: false });
}
function buildVillager(color) {
  const g = new THREE.Group();
  const c = mat({ color, roughness: 0.75 }), skin = mat({ color: 0xe8c2a0, roughness: 0.6 }), dark = mat({ color: 0x33271a, roughness: 0.7 });
  P(g, G.box, c, [0, 0.95, 0], null, [0.6, 0.95, 0.42]);
  P(g, G.sph, skin, [0, 1.6, 0], null, [0.27, 0.3, 0.27]);
  P(g, G.box, dark, [0, 1.85, 0], null, [0.36, 0.2, 0.36]);             // hat
  P(g, G.sph, M.eyeB, [-0.1, 1.6, 0.24], null, [0.05, 0.06, 0.04], true);
  P(g, G.sph, M.eyeB, [0.1, 1.6, 0.24], null, [0.05, 0.06, 0.04], true);
  const legs = [], arms = [];
  for (const sx of [-1, 1]) { legs.push(P(g, G.box, dark, [sx * 0.16, 0.35, 0], null, [0.18, 0.7, 0.22])); arms.push(P(g, G.box, c, [sx * 0.42, 1.0, 0], null, [0.15, 0.6, 0.2])); }
  g.userData = { legs, arms, walk: 0 };
  return g;
}
function spawnVillager(x, z) {
  const cols = [0x9a4b3a, 0x3a5a9a, 0x4a7a3a, 0x8a6aaa, 0xaa7a3a];
  const g = buildVillager(cols[Math.floor(Math.random() * cols.length)]);
  g.position.set(x, groundY(x, z), z); scene.add(g);
  const bar = makeBar(0x88dd88); scene.add(bar);
  villagers.push({ root: g, bar, hp: 40, maxHp: 40, hx: x, hz: z, tx: x, tz: z, wanderT: 0, walk: 0 });
}
function buildGuardianMesh() {
  const g = new THREE.Group();
  const armor = mat({ color: 0x9098ad, metalness: 0.5, roughness: 0.4, flatShading: true }),
        dark = mat({ color: 0x444b59, roughness: 0.6 }),
        ice = mat({ color: 0xbfe6ff, emissive: 0x55b0ee, emissiveIntensity: 1.0, roughness: 0.3 }),
        cape = mat({ color: 0x596273, roughness: 0.85, side: THREE.DoubleSide });
  P(g, G.box, armor, [0, 1.7, 0], null, [1.3, 2.0, 0.9]);
  P(g, G.box, cape, [0, 1.8, -0.55], null, [1.5, 2.6, 0.06]);
  P(g, G.box, dark, [0, 2.95, 0], null, [0.75, 0.75, 0.75]);            // head
  P(g, G.cone, armor, [0, 3.6, 0], null, [0.34, 0.8, 0.34]);           // helmet crest
  P(g, G.sph, ice, [-0.2, 2.95, 0.38], null, [0.1, 0.1, 0.1], true);
  P(g, G.sph, ice, [0.2, 2.95, 0.38], null, [0.1, 0.1, 0.1], true);
  for (const sx of [-1, 1]) P(g, G.box, armor, [sx * 0.95, 2.45, 0], null, [0.7, 0.55, 1.0]); // pauldrons
  const arms = [], legs = [];
  for (const sx of [-1, 1]) { arms.push(P(g, G.box, dark, [sx * 1.0, 1.7, 0], null, [0.42, 1.4, 0.42])); legs.push(P(g, G.box, dark, [sx * 0.42, 0.65, 0], null, [0.48, 1.4, 0.55])); }
  P(g, G.box, ice, [1.05, 1.4, 0.4], null, [0.14, 2.2, 0.16]);          // greatsword
  g.userData = { arms, legs, walk: 0 };
  return g;
}
function spawnVillage(cx, cz) {
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const hx = cx + Math.cos(a) * 16, hz = cz + Math.sin(a) * 16; spawnHouse(hx, hz, a + Math.PI / 2); }
  for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, r = 2 + Math.random() * 8; spawnVillager(cx + Math.cos(a) * r, cz + Math.sin(a) * r); }
  const gm = buildGuardianMesh(); gm.position.set(cx, groundY(cx, cz - 6), cz - 6); scene.add(gm);
  const bar = makeBar(0xffcc44); scene.add(bar);
  guardian = { root: gm, bar, hp: 320, maxHp: 320, x: cx, z: cz - 6, hx: cx, hz: cz - 6, walk: 0, cd: 0, atkAnim: 0 };
}
function angerVillage() {
  if (!villageHostile) { villageHostile = true; toast("😠 The village Guardian is enraged!"); }
}
function animLegs(ud, moving, walk, amp) {
  if (ud.legs) for (let i = 0; i < ud.legs.length; i++) ud.legs[i].rotation.x = Math.sin(walk + (i ? Math.PI : 0)) * (moving ? amp : 0);
  if (ud.arms) for (let i = 0; i < ud.arms.length; i++) ud.arms[i].rotation.x = Math.sin(walk + (i ? 0 : Math.PI)) * (moving ? amp * 0.7 : 0);
}
function updateVillage(dt) {
  // villagers
  for (let i = villagers.length - 1; i >= 0; i--) {
    const v = villagers[i];
    if (v.hp <= 0) { scene.remove(v.root); scene.remove(v.bar); villagers.splice(i, 1); angerVillage(); toast("💀 You killed a villager…"); continue; }
    const px = v.root.position.x, pz = v.root.position.z;
    let moving = false;
    if (villageHostile) {            // flee from the player
      const dx = px - frog.x, dz = pz - frog.z, d = Math.hypot(dx, dz) || 1;
      if (d < 18) { moveTowards(v.root, px + dx / d * 6, pz + dz / d * 6, 5 * dt); moving = true; }
    } else {
      v.wanderT -= dt;
      if (v.wanderT <= 0) { v.wanderT = 2 + Math.random() * 3; v.tx = v.hx + (Math.random() - 0.5) * 10; v.tz = v.hz + (Math.random() - 0.5) * 10; }
      if (Math.hypot(v.tx - px, v.tz - pz) > 0.6) { moveTowards(v.root, v.tx, v.tz, 2.2 * dt); moving = true; }
    }
    if (moving) v.walk += dt * 9; animLegs(v.root.userData, moving, v.walk, 0.6);
    const show = villageHostile || v.hp < v.maxHp; v.bar.visible = show; if (show) billboard(v.bar, v.root, v.hp / v.maxHp, 2.2);
  }
  // houses collapse when destroyed
  for (const h of houses) {
    if (!h.fallen && h.hp <= 0) { h.fallen = true; h.root.rotation.z = 0.5; h.root.position.y -= 1.2; angerVillage(); toast("🏚️ A house collapses!"); }
  }
  // guardian
  if (guardian) {
    if (guardian.hp <= 0) {
      scene.remove(guardian.root); scene.remove(guardian.bar);
      inv.iron += 8; toast("🛡️ Guardian defeated! +8 iron"); updateHud(); guardian = null; return;
    }
    if (guardian.cd > 0) guardian.cd -= dt; if (guardian.atkAnim > 0) guardian.atkAnim -= dt;
    const gx = guardian.x, gz = guardian.z, ud = guardian.root.userData;
    let moving = false;
    if (villageHostile) {
      const dx = frog.x - gx, dz = frog.z - gz, d = Math.hypot(dx, dz);
      guardian.root.rotation.y = Math.atan2(dx, dz);
      if (d > 2.6) { guardian.x += dx / d * 5.5 * dt; guardian.z += dz / d * 5.5 * dt; moving = true; }
      else if (guardian.cd <= 0) { guardian.cd = 1.2; guardian.atkAnim = 0.3; frog.hp -= 16; damageFlash(); }
    } else {
      // patrol slowly around home
      guardian.root.rotation.y += dt * 0.3;
    }
    guardian.root.position.set(guardian.x, groundY(guardian.x, guardian.z), guardian.z);
    if (moving) guardian.walk += dt * 8; animLegs(ud, moving, guardian.walk, 0.4);
    if (ud.arms && guardian.atkAnim > 0) { ud.arms[0].rotation.x = -2.2 * (guardian.atkAnim / 0.3); }
    const show = villageHostile || guardian.hp < guardian.maxHp; guardian.bar.visible = show; if (show) billboard(guardian.bar, guardian.root, guardian.hp / guardian.maxHp, 4.4);
  }
}
function nearShelter() {
  if (under || inHouse) return true;
  for (const c of caves) if (Math.hypot(frog.x - c.x, frog.z - c.z) < c.R) return true;   // inside a cave dome
  for (const h of houses) if (!h.fallen && Math.hypot(frog.x - h.x, frog.z - h.z) < 9) return true;
  return false;
}

// ============================================================
//  Crevasses (hidden cracks)
// ============================================================
function spawnCrevasse(x, z) {
  const r = 3.2;
  const disc = new THREE.Mesh(G.cyl, mat({ color: 0xc4d4ec, roughness: 0.9 }));
  disc.position.set(x, groundY(x, z) + 0.06, z); disc.scale.set(r, 0.12, r * 1.4); disc.rotation.y = Math.random() * 3;
  scene.add(disc); rooms.push(disc);   // (reuse rooms[] for cleanup of plain meshes)
  crevasses.push({ x, z, r });
}

// ============================================================
//  Avalanche
// ============================================================
const GATE2_Z = -10;
function updateAvalanche(dt) {
  if (frog.z <= GATE2_Z) { if (avState === "warn") { avState = "idle"; avMesh.visible = false; document.getElementById("avwarn").classList.add("hidden"); } return; }
  if (avState === "idle") {
    if (avCount >= 2) return;   // only two avalanches per game
    avTimer -= dt;
    if (avTimer <= 0) { avState = "warn"; avT = 5; avCount++; document.getElementById("avwarn").classList.remove("hidden"); }
  } else if (avState === "warn") {
    avT -= dt;
    // visible wall of snow rolling down from uphill toward (and past) the player
    avMesh.visible = true;
    const prog = 1 - avT / 5, az = frog.z + 85 - prog * 120;
    avMesh.position.set(frog.x, groundY(frog.x, az) + 9, az);
    for (let i = 0; i < avMesh.children.length; i++) { const c = avMesh.children[i]; c.rotation.x += dt * 2.2; c.rotation.y += dt * 1.6; }
    if (avT <= 0) {
      avMesh.visible = false;
      document.getElementById("avwarn").classList.add("hidden");
      avState = "idle"; avTimer = 45 + Math.random() * 50;
      if (!nearShelter()) {
        frog.hp -= 66; damageFlash();
        // flung downhill ~10m, but not back behind a climbed glacier
        let limit = -HALF + 4;
        for (const g of gates) if (g.climbed && g.z < frog.z && g.z + 3 > limit) limit = g.z + 3;
        frog.z = Math.max(limit, frog.z - 10); frog.vz = -6; frog.vy = 4;
        toast("🏔️ Caught in the avalanche! -66 health");
      } else toast("⛺ You weathered the avalanche in shelter.");
      if (frog.hp <= 0) lose();
    }
  }
}

// ---------- Trees fall anim ----------
function updateTrees(dt) {
  for (const t of trees) {
    if (t.fallen) { if (t.falling > 0) { t.falling -= dt; t.root.rotation.z = Math.min(Math.PI/2, t.root.rotation.z + dt*2.4); } continue; }
    if (t.shake > 0) { t.shake -= dt; t.root.rotation.x = Math.sin(performance.now()*0.05)*0.05*t.shake; } else t.root.rotation.x = 0;
  }
}

// ---------- Weather ----------
const _t = new THREE.Color(), _b = new THREE.Color();
function updateWeather(dt) {
  weatherTimer -= dt;
  if (weatherTimer <= 0) { const s = ["clear","snow","snow","blizzard"]; let n = s[Math.floor(Math.random()*s.length)]; if (n === weather && n !== "clear") n = "clear"; setWeather(n); weatherTimer = 18 + Math.random()*18; }
  const c = WEATHER[weather], k = Math.min(1, dt * 1.8);
  scene.fog.near += (c.fogN - scene.fog.near) * k; scene.fog.far += (c.fogF - scene.fog.far) * k;
  if (inCaveNow) sun.intensity = 0; else sun.intensity += (c.sun - sun.intensity) * k;
  skyMat.uniforms.top.value.lerp(_t.set(c.top), k); skyMat.uniforms.bot.value.lerp(_b.set(c.bot), k);
  scene.fog.color.copy(skyMat.uniforms.bot.value);
}

// ---------- Win / Lose ----------
function endScreen(emoji, title, text) {
  running = false; document.exitPointerLock && document.exitPointerLock();
  const o = document.getElementById("overlay"); o.classList.remove("hidden");
  document.getElementById("overlay-frog").textContent = emoji;
  document.getElementById("overlay-title").innerHTML = title;
  document.getElementById("overlay-text").innerHTML = text;
  document.getElementById("overlay-text").innerHTML += `<br><br><b>Choose a climber to play again.</b>`;
  setPrompt("");
}
function showWin() { endScreen("🏆", "The Snow Giant Falls!", `Froggo and its spirit allies brought down the Snow Giant at the summit of the mountain — and carried their hero home. A legend of the peaks. 🐸🏔️`); }
function lose() { if (!running) return; endScreen("🥶", "Froggo is down...", `You fell in the <b>${zoneName()}</b> (${altMeters().toLocaleString()} m climbed). Craft a warm coat, build campfires, free allies, and respect the ice. Try again!`); }

// ---------- Cutscenes ----------
function startCutscene() {
  cutscene = { type: "intro", t: 0 };
  frog.x = 12; frog.z = 110; frog.y = groundY(12, 110); frog.yaw = 0;
  frogModel.position.set(frog.x, frog.y, frog.z); frogModel.rotation.set(0, 0, 0);
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("skiphint").classList.add("show");
  // moody snowy look
  scene.fog.near = 35; scene.fog.far = 170;
  skyMat.uniforms.top.value.set(0x8aa6c4); skyMat.uniforms.bot.value.set(0xc4d4e4); scene.fog.color.set(0xc4d4e4);
  snowGeo.setDrawRange(0, 1800); snow.visible = true; snowMat.uniforms.uOpacity.value = 0.85; snowMat.uniforms.uWind.value.set(3, 1);
}
function endCutscene() {
  cutscene = null; setSubtitle(""); document.getElementById("skiphint").classList.remove("show");
  frogModel.rotation.set(0, 0, 0); frogModel.scale.set(1, 1, 1);
  frog.x = 0; frog.z = START_Z; frog.y = groundY(0, START_Z); frog.yaw = 0;
  frogModel.position.set(frog.x, frog.y, frog.z);
  snow.visible = false; snowGeo.setDrawRange(0, 0);
  skyMat.uniforms.top.value.set(0x3f7fd6); skyMat.uniforms.bot.value.set(0xd6ebff); scene.fog.color.set(0xd6ebff); scene.fog.near = 100; scene.fog.far = 420;
  camInit = false;
  document.getElementById("overlay").classList.remove("hidden");
}
function updateCutscene(dt) {
  if (cutscene.type === "awaken") return updateAwaken(dt);
  if (cutscene.type === "rescue") return updateRescue(dt);
  if (cutscene.type === "firehit") return updateFireHit(dt);
  // HOLD space for 2 seconds to skip the intro
  cutscene.skipHold = keys[" "] ? (cutscene.skipHold || 0) + dt : 0;
  const sh = document.getElementById("skiphint");
  sh.textContent = cutscene.skipHold > 0 ? `Keep holding to skip… ${(1 - cutscene.skipHold).toFixed(1)}s` : "Hold Space to skip";
  if (cutscene.skipHold >= 1) { endCutscene(); return; }
  const c = cutscene; c.t += dt; const t = c.t, fm = frogModel.userData;
  if (t < 3.2) {                       // hiking up
    setSubtitle("High on the icy shoulders of Mount Everest…");
    frog.z += 2.2 * dt; frog.y = groundY(frog.x, frog.z);
    fm.walk += dt * 9; const sw = Math.sin(fm.walk);
    fm.feet[0].position.set(-0.5, 0.16 + Math.max(0, sw) * 0.2, 0.5 + sw * 0.4);
    fm.feet[1].position.set(0.5, 0.16 + Math.max(0, -sw) * 0.2, 0.5 - sw * 0.4);
    frogModel.position.set(frog.x, frog.y, frog.z); frogModel.rotation.set(0, 0, 0);
    camera.position.set(frog.x - 3, frog.y + 5, frog.z - 9); camera.lookAt(frog.x, frog.y + 1.5, frog.z + 8);
  } else if (t < 4.4) {                 // the slip
    setSubtitle("…until the snow gives way beneath you!");
    frogModel.rotation.z = Math.sin(t * 34) * 0.35;
    camera.position.set(frog.x - 3, frog.y + 5, frog.z - 9); camera.lookAt(frog.x, frog.y + 1.5, frog.z);
  } else if (t < 8.8) {                 // tumbling down
    setSubtitle("You tumble all the way down the mountain…");
    const k = (t - 4.4) / 4.4; frog.z = 110 - k * 298;
    frog.y = groundY(frog.x, frog.z) + Math.abs(Math.sin(t * 7)) * 2.4;
    frogModel.position.set(frog.x, frog.y, frog.z);
    frogModel.rotation.x += dt * 9; frogModel.rotation.z += dt * 5.5;
    camera.position.set(frog.x + 13, frog.y + 6, frog.z - 2); camera.lookAt(frog.x, frog.y + 1, frog.z);
  } else if (t < 13.5) {                // waking, looking up
    setSubtitle("You wake at the foot of the mountain. The only way out… is up. 🏔️");
    frog.x = 0; frog.z = START_Z; frog.y = groundY(0, START_Z);
    const rise = Math.min(1, (t - 8.8) / 2.2);
    frogModel.position.set(frog.x, frog.y, frog.z);
    frogModel.rotation.set((1 - rise) * 1.35, 0, 0);
    const look = Math.min(1, (t - 9.6) / 3.2);
    camera.position.set(frog.x - 1, frog.y + 2.4, frog.z - 7.5);
    camera.lookAt(frog.x, frog.y + 5 + look * 45, frog.z + 45 + look * 130);
  } else endCutscene();
}
function startAwaken() {
  cutscene = { type: "awaken", t: 0 }; document.exitPointerLock && document.exitPointerLock();
  document.getElementById("skiphint").classList.remove("show"); setPrompt("");
}
function updateAwaken(dt) {
  const c = cutscene; c.t += dt; const t = c.t, s = boss.root.userData.gScale, bx = boss.x, bz = boss.z;
  const k = Math.min(1, t / 4), by = boss.buriedY + (boss.standY - boss.buriedY) * k;
  boss.root.position.set(bx, by, bz); boss.root.rotation.y = Math.sin(t * 3) * 0.12;
  flag.visible = true; flag.position.set(bx, by + 4.5 * s, bz + 1.0 * s); flag.rotation.set(0.12, 0, 0.14);
  camera.position.set(bx, boss.standY + s * 6, bz - s * 12); camera.lookAt(bx, boss.standY + s * 3, bz);
  setSubtitle(t > 1.7 ? "THE SNOW GIANT AWAKENS!" : "Something stirs beneath the snow…");
  if (t >= 4.6) {
    boss.state = "active"; boss.atkTimer = 2.6;
    document.getElementById("bossbar").classList.remove("hidden");
    setSubtitle(""); cutscene = null; camInit = false; canvas.requestPointerLock();
  }
}
function startFireHit() {
  if (boss) boss.fire = -1; fireBreath.visible = false;
  frog.hp -= 30;
  cutscene = { type: "firehit", t: 0 }; document.exitPointerLock && document.exitPointerLock(); setPrompt("");
}
function updateFireHit(dt) {
  const t = cutscene.t += dt;
  setSubtitle("🔥 Caught in the blue flames! −30 health");
  fireBreath.visible = true;
  fireBreath.position.set(frog.x, frog.y + 1.6, frog.z); fireBreath.scale.set(3.2, 5, 3.2); fireBreath.rotation.set(Math.PI, 0, 0);
  fireBreath.material.opacity = 0.55 + Math.random() * 0.4;
  frogModel.rotation.set(Math.sin(t * 26) * 0.12, frog.yaw, Math.sin(t * 21) * 0.1);
  const ang = t * 1.3; camera.position.set(frog.x + Math.cos(ang) * 6, frog.y + 3.6, frog.z + Math.sin(ang) * 6); camera.lookAt(frog.x, frog.y + 1.5, frog.z);
  if (t >= 1.9) {
    cutscene = null; setSubtitle(""); fireBreath.visible = false; frogModel.rotation.set(0, frog.yaw, 0); camInit = false;
    if (frog.hp <= 0) lose(); else canvas.requestPointerLock();
  }
}
function startRescue() {
  cutscene = { type: "rescue", t: 0 }; document.exitPointerLock && document.exitPointerLock(); setPrompt("");
  if (ambulance) scene.remove(ambulance);
  ambulance = buildAmbulance(); ambulance.position.set(frog.x + 50, groundY(frog.x + 50, frog.z - 10), frog.z - 10); ambulance.rotation.y = -Math.PI / 2; scene.add(ambulance);
}
function updateRescue(dt) {
  const c = cutscene; c.t += dt; const t = c.t;
  frogModel.rotation.set(Math.min(1.4, t * 0.9), frog.yaw, 0);
  frogModel.position.set(frog.x, groundY(frog.x, frog.z) + 0.3, frog.z);
  let i = 0;
  for (const a of allies) { if (a.state !== "active") continue; if (a.hp <= 0) { a.hp = a.maxHp; a.root.visible = true; } const ang = i * 2.1; moveTowards(a.root, frog.x + Math.cos(ang) * 3, frog.z + Math.sin(ang) * 3, 4 * dt); i++; }
  // ambulance drives up to the fallen hero
  if (ambulance) {
    const tx = frog.x + 6, tz = frog.z, ax = ambulance.position.x, k = Math.min(1, t / 4);
    ambulance.position.x = (frog.x + 50) + (tx - (frog.x + 50)) * (k * k * (3 - 2 * k));
    ambulance.position.z = tz; ambulance.position.y = groundY(ambulance.position.x, tz);
    const blink = Math.floor(t * 5) % 2 === 0;                       // flashing lights
    if (ambulance.userData.lights) { ambulance.userData.lights[0].visible = blink; ambulance.userData.lights[1].visible = !blink; }
  }
  setSubtitle(t > 3 ? "🚑 Mountain rescue carries you to safety. You did it! 🐸🏔️" : "You collapse from the battle…");
  const ang = t * 0.4;
  camera.position.set(frog.x + Math.cos(ang) * 13, frog.y + 7, frog.z + Math.sin(ang) * 13); camera.lookAt(frog.x + 2, frog.y + 1, frog.z);
  if (t >= 7) { cutscene = null; setSubtitle(""); frogModel.rotation.set(0, frog.yaw, 0); if (ambulance) { scene.remove(ambulance); ambulance = null; } showWin(); }
}

// ---------- Keys ----------
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (cutscene) return;   // intro is skipped by HOLDING space (handled in updateCutscene)
  if (k === "c") { if (running) toggleCraft(); return; }
  if (!running || craftOpen) return;
  if (k === "e" && !frog.crevasse) doInteract();
  else if (k === "f") commandAllies();
});

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  snowMat.uniforms.uTime.value = now * 0.001;
  if (cutscene) {
    updateCutscene(dt);
  } else if (running && !craftOpen) {
    updateFrog(dt); updateCombat(dt); updateTrees(dt); updateAllies(dt); updateMonsters(dt); updateVillage(dt); updateWeather(dt); updateAvalanche(dt);
    updateFires(dt, now); updateDmgPopups(dt); updatePickups(dt); interactPrompt(); updateCamera(); updateHud();
  } else if (!running) { camYaw += dt * 0.08; updateCamera(); }
  sky.position.copy(camera.position); snowMat.uniforms.uCam.value.copy(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
frogModel.position.set(0, groundY(0, START_Z), START_Z);
updateCamera(true);
document.getElementById("loadinfo").textContent = "3D engine ready ✓";
charBtns.forEach((b) => b.disabled = false);
startCutscene();
requestAnimationFrame(loop);
