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
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
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
const SIZE = 420, HALF = SIZE / 2, SEGS = 180;
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
  const s = 3.2;
  const ice = mat({ color: 0xcfe9ff, roughness: 0.5, flatShading: true }), iceD = mat({ color: 0xa6cfee, roughness: 0.5, flatShading: true }),
        eye = mat({ color: 0x113355, emissive: 0x5ad0ff, emissiveIntensity: 2.2 }), teeth = mat({ color: 0xffffff, roughness: 0.3 }), mouthM = mat({ color: 0x08202f });
  const g = new THREE.Group();
  P(g, G.ico, ice, [0, 1.7 * s, 0], [0.3, 0.4, 0], [1.25 * s, 1.55 * s, 1.05 * s]);   // torso
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; P(g, G.ico, iceD, [Math.cos(a) * 0.95 * s, (1.1 + Math.sin(a * 2) * 0.5) * s, Math.sin(a) * 0.45 * s + 0.55 * s], null, [0.5 * s, 0.5 * s, 0.5 * s]); } // lumps
  P(g, G.ico, ice, [0, 2.95 * s, 0.3 * s], [0.2, 0.7, 0], [0.75 * s, 0.62 * s, 0.72 * s]); // head (hunched)
  P(g, G.box, mouthM, [0, 2.82 * s, 0.88 * s], null, [0.72 * s, 0.18 * s, 0.12 * s]);       // grin
  for (let i = 0; i < 5; i++) P(g, G.box, teeth, [(-0.26 + i * 0.13) * s, 2.82 * s, 0.93 * s], null, [0.07 * s, 0.16 * s, 0.06 * s], true);
  P(g, G.sph, eye, [-0.24 * s, 3.12 * s, 0.62 * s], null, [0.08 * s, 0.08 * s, 0.08 * s], true);
  P(g, G.sph, eye, [0.24 * s, 3.12 * s, 0.62 * s], null, [0.08 * s, 0.08 * s, 0.08 * s], true);
  const arms = [], legs = [];
  for (const sx of [-1, 1]) {
    arms.push(P(g, G.ico, iceD, [sx * 1.75 * s, 1.7 * s, 0], [0, 0, sx * 0.2], [0.58 * s, 1.35 * s, 0.58 * s]));
    P(g, G.ico, ice, [sx * 1.85 * s, 0.5 * s, 0], null, [0.62 * s, 0.62 * s, 0.62 * s]);   // fists
    legs.push(P(g, G.ico, iceD, [sx * 0.62 * s, 0.6 * s, 0], null, [0.62 * s, 0.95 * s, 0.72 * s]));
  }
  g.userData = { arms, legs, walk: 0, gScale: s };
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
const ALT_SCALE = 2;
const START_Z = -HALF + 20;
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
const monsters = [], allies = [], trees = [], nodes = [], fires = [], caves = [], gates = [], chests = [], rooms = [];
const bossFx = { waves: [], icicles: [], pillars: [] };
let boss = null, underground = null;
function placeOnGround(root, x, z) { root.position.set(x, groundY(x, z), z); }

// ---------- Inventory & gear ----------
const inv = { wood: 0, stone: 0, iron: 0, fiber: 0, herb: 0, crystal: 0 };
const gear = { rope: false, axe: false, crampons: false, coat: false, torch: false, sword: false, shield: false };
const RES_ICON = { wood: "🪵", stone: "🪨", iron: "🔩", fiber: "🧶", herb: "🌿", crystal: "💎" };
const GEAR_ICON = { rope: "🪢", axe: "🪓", crampons: "🥾", coat: "🧥", torch: "🔦", sword: "🗡️", shield: "🛡️" };

const RECIPES = [
  { id: "campfire", name: "Campfire 🔥", cost: { wood: 5, stone: 2 }, repeat: true, desc: "Place at your feet. Stand near it to restore warmth." },
  { id: "rope", name: "Climbing Rope 🪢", cost: { fiber: 6 }, desc: "Scale the first ice wall." },
  { id: "axe", name: "Ice Axe 🪓", cost: { wood: 4, iron: 3 }, desc: "Scale the second ice wall. Mines faster." },
  { id: "crampons", name: "Crampons 🥾", cost: { stone: 4, fiber: 3 }, desc: "Scale the final glacier. Far less slipping on ice." },
  { id: "coat", name: "Warm Coat 🧥", cost: { fiber: 6, herb: 2 }, desc: "Lose warmth half as fast." },
  { id: "torch", name: "Torch 🔦", cost: { wood: 2, fiber: 1 }, desc: "Light up the dark caves." },
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
  const R = 12;
  const cave = new THREE.Group();
  const dome = new THREE.Mesh(G.dome, M.caveRock);
  dome.position.set(0, -0.5, 0); dome.scale.set(R, R * 0.85, R); dome.receiveShadow = true; cave.add(dome);
  const entA = -Math.PI / 2, entHalf = 0.5;
  const ex = Math.cos(entA) * R, ez = Math.sin(entA) * R;
  const mouth = P(cave, G.box, mat({ color: 0x04060a }), [ex, 3, ez], null, [6.5, 6, 2]); mouth.castShadow = false;
  P(cave, G.box, M.caveRock, [ex - 4, 3.2, ez], null, [2.2, 7, 3]);
  P(cave, G.box, M.caveRock, [ex + 4, 3.2, ez], null, [2.2, 7, 3]);
  P(cave, G.box, M.caveRock, [ex, 6.5, ez], null, [9, 2, 3]);
  cave.position.set(x, groundY(x, z), z);
  scene.add(cave);
  const caveObj = { x, z, R, entA, entHalf, root: cave, basement: null };
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
    const ropeMat = mat({ color: 0x9a6a3a, roughness: 0.9 });
    const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, gy - roomY, 6), ropeMat);
    ropeMesh.position.set(rx, (gy + roomY) / 2, rz); scene.add(ropeMesh); rooms.push(ropeMesh);
    const bm = { roomY, cx: x, cz: z, RR, ropeX: rx, ropeZ: rz, topY: gy };
    caveObj.basement = bm;
    // chests: first guaranteed loot, rest random with 20% trap
    const spots = [[x - 5, z - 4], [x + 4, z + 5], [x - 3, z + 6]];
    for (let i = 0; i < spots.length; i++) {
      const isTrap = i === 0 ? false : Math.random() < 0.2;
      let loot = "crystal";
      if (i === 0) loot = basementLoot;                    // guaranteed sword or shield
      else if (!isTrap) loot = Math.random() < 0.5 ? "salveBig" : "crystal";
      spawnChest(spots[i][0], roomY, spots[i][1], isTrap, loot);
    }
  }
}
function spawnChest(x, y, z, isTrap, loot) {
  const g = new THREE.Group();
  P(g, G.box, mat({ color: 0x6b4327, roughness: 0.85 }), [0, 0.4, 0], null, [1.3, 0.8, 0.9]);
  const lid = P(g, G.box, mat({ color: 0x8a5a32, roughness: 0.85 }), [0, 0.82, -0.4], null, [1.35, 0.4, 0.95]);
  P(g, G.box, mat({ color: 0xffd27a, emissive: 0x553300, emissiveIntensity: 0.5 }), [0, 0.5, 0.46], null, [0.22, 0.3, 0.12], true);
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
  placeOnGround(g, frog.x, frog.z); scene.add(g);
  fires.push({ g, flame, x: frog.x, z: frog.z });
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
  root.position.set(x, gy - 20, z); scene.add(root);   // buried under the snow
  const bar = makeBar(0x9be0ff); scene.add(bar);
  boss = { root, bar, hp: 1300, maxHp: 1300, kind: "boss", walk: 0, atkAnim: 0,
           state: "dormant", buriedY: gy - 20, standY: gy, x, z, atkTimer: 3.5, armRaise: 0 };
}
function spawnTrappedAlly(name, builder, kind, x, z, atk) {
  const root = builder(); placeOnGround(root, x, z); scene.add(root);
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), M.ice);
  ice.position.set(x, groundY(x, z) + 1.3, z); ice.scale.set(1, 1.5, 1); scene.add(ice);
  const bar = makeBar(0x55dd55); scene.add(bar);
  allies.push({ root, bar, ice, hp: 160, maxHp: 160, atk, cd: 0, kind, state: "trapped", hits: 0, need: 6, name, slot: allies.length, target: null });
}

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
addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; if (e.key === " ") { keys[" "] = true; e.preventDefault(); } });
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; if (e.key === " ") keys[" "] = false; });

let camYaw = 0, camPitch = 0.42, camDist = 11;
canvas.addEventListener("click", () => { if (!cutscene && running && !craftOpen) canvas.requestPointerLock(); });
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) {
    camYaw -= e.movementX * 0.0022;
    camPitch = Math.max(0.02, Math.min(1.1, camPitch - e.movementY * 0.0022));
  }
});

// ---------- HUD ----------
let running = false, won = false, craftOpen = false, nearInteract = null, cutscene = null;
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
    const ok = has(r.cost) && !owned;
    const div = document.createElement("div");
    div.className = "recipe" + (owned ? " have" : "");
    div.innerHTML = `<div class="rn">${r.name}</div><div class="rd">${r.desc}</div>
      <div class="rc">${Object.keys(r.cost).map(k => `${RES_ICON[k]}${r.cost[k]}`).join("  ")}</div>
      <button ${ok ? "" : "disabled"}>${owned ? "✓ Crafted" : "Craft"}</button>`;
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
  won = false; underground = null;
  if (boss) { scene.remove(boss.root); scene.remove(boss.bar); boss = null; }
  document.getElementById("bossbar").classList.add("hidden");
  for (const m of rooms) scene.remove(m); rooms.length = 0;
  for (const w of bossFx.waves) scene.remove(w.mesh); for (const ic of bossFx.icicles) scene.remove(ic.mesh); for (const p of bossFx.pillars) if (p.mesh) scene.remove(p.mesh);
  bossFx.waves.length = bossFx.icicles.length = bossFx.pillars.length = 0;
  clearArr(monsters); clearArr(allies); clearArr(trees); clearArr(nodes); clearArr(fires); clearArr(caves); clearArr(gates); clearArr(chests);

  // trees + bushes + stone spread across the WHOLE map (so wood/stone is always available)
  for (let i = 0; i < 300; i++) {
    const x = (Math.random()-0.5)*(SIZE-30), z = (Math.random()-0.5)*(SIZE-30);
    if (slopeInfo(x,z).slope > 0.95) continue;
    const f = (z + HALF) / SIZE;
    const roll = Math.random();
    if (roll < 0.44 && trees.length < 80) { const t = makeTree2(); placeOnGround(t, x, z); t.rotation.y = Math.random()*6.28; scene.add(t); trees.push({ root: t, x, z, hits: 0, fallen: false, falling: 0, shake: 0 }); }
    else if (roll < 0.58) spawnNode("bush", x, z);
    else if (roll < 0.70) spawnNode("stone", x, z);
    else if (roll > 0.93 && f > 0.35) spawnNode("crystal", x, z);
  }
  // a few rock decorations high up
  for (let i = 0; i < 14; i++) { const x=(Math.random()-0.5)*(SIZE-20), z=40+Math.random()*(HALF-20); const r=makeRockDecor(); placeOnGround(r,x,z); scene.add(r); }

  // caves (iron + crystals); two have a second floor with chests (sword / shield)
  spawnCave(-95, -75, "sword"); spawnCave(90, 5); spawnCave(-70, 80, "shield"); spawnCave(70, 160);
  // a little surface iron too
  for (let i = 0; i < 6; i++) spawnNode("iron", (Math.random()-0.5)*(SIZE-40), -20 + Math.random()*120);

  // glacier gates (z lines kept clear of caves)
  spawnGate(-30, "rope", 40, "Rope");
  spawnGate(45, "axe", -55, "Ice Axe");
  spawnGate(125, "crampons", 25, "Crampons");

  // allies (the third is frozen inside a cave!)
  spawnTrappedAlly("Ember", buildFox, "fox", -12, -64, 19);
  spawnTrappedAlly("Sprout", buildDragon, "dragon", 22, 20, 23);
  spawnTrappedAlly("Hoot", buildOwl, "owl", -70, 80, 21); // inside cave 3

  // monsters scale by altitude
  const wolf = () => ({ hp: 55, maxHp: 55, atk: 10, speed: 5.2 });
  const golem = () => ({ hp: 160, maxHp: 160, atk: 22, speed: 2.8 });
  spawnMonster("wolf", 18, 18, wolf()); spawnMonster("wolf", 30, 28, wolf());
  spawnMonster("golem", -60, 74, golem()); spawnMonster("wolf", -80, 88, wolf());
  for (let i = 0; i < 12; i++) {
    const x = (Math.random()-0.5)*(SIZE-50), z = 0 + Math.random()*(HALF-10);
    const hi = z > 80;
    spawnMonster(hi || Math.random()<0.4 ? "golem" : "wolf", x, z, hi || Math.random()<0.4 ? golem() : wolf());
  }
  spawnBoss(0, HALF - 28);
  flag.visible = true; flag.rotation.set(0, 0, 0); flag.position.set(0, groundY(0, SUMMIT_Z), SUMMIT_Z);

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
  const under = underground;

  camBasis();
  let ix = 0, iz = 0;
  if (keys["w"] || keys["arrowup"]) iz += 1;
  if (keys["s"] || keys["arrowdown"]) iz -= 1;
  if (keys["d"] || keys["arrowright"]) ix += 1;   // D = right
  if (keys["a"] || keys["arrowleft"]) ix -= 1;    // A = left

  const len = Math.hypot(ix, iz);
  const wantSprint = keys["shift"] && frog.stamina > 1 && len > 0;
  const speed = (wantSprint ? SPRINT : WALK) * player.speedMul;
  if (wantSprint) frog.stamina = Math.max(0, frog.stamina - 28 * dt); else frog.stamina = Math.min(100, frog.stamina + 16 * dt);

  const gy = under ? under.roomY : groundY(frog.x, frog.z);
  const onGround = frog.y <= gy + 0.06 && frog.vy <= 0.01;
  const si = under ? { slope: 0, downX: 0, downZ: 0 } : slopeInfo(frog.x, frog.z);
  const icy = under ? false : isIcy(frog.x, frog.z);

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
  if (under) {
    // bound inside the underground room
    const dx = frog.x - under.cx, dz = frog.z - under.cz, dr = Math.hypot(dx, dz);
    if (dr > under.RR - 1.5) { frog.x = under.cx + dx / dr * (under.RR - 1.5); frog.z = under.cz + dz / dr * (under.RR - 1.5); }
  } else {
    frog.x = Math.max(-HALF + 4, Math.min(HALF - 4, frog.x));
    frog.z = Math.max(-HALF + 4, Math.min(HALF - 4, frog.z));
    // glacier gates block upward progress until climbed
    for (const g of gates) { if (!g.climbed && frog.z > g.z - 1.2) { frog.z = g.z - 1.2; if (frog.vz > 0) frog.vz = 0; } }
    // cave walls are solid — only the entrance gap lets you through
    for (const c of caves) {
      const drN = Math.hypot(frog.x - c.x, frog.z - c.z);
      if (drN < c.R * 0.92) inCave = true;
      let ang = Math.atan2(frog.z - c.z, frog.x - c.x), ad = Math.abs(ang - c.entA);
      if (ad > Math.PI) ad = 2 * Math.PI - ad;
      if (ad >= c.entHalf) { const drP = Math.hypot(prevX - c.x, prevZ - c.z); if ((drP - c.R) * (drN - c.R) < 0) { frog.x = prevX; frog.z = prevZ; frog.vx = 0; frog.vz = 0; } }
    }
  }

  const ngy = under ? under.roomY : groundY(frog.x, frog.z);
  if (frog.y <= ngy) { if (frog.vy < -24) { const d = (-frog.vy - 24) * 1.7; frog.hp -= d; if (d > 6) toast("💥 Hard landing!"); } frog.y = ngy; frog.vy = 0; }

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

  // ---- warmth: campfire warms, cave is neutral (no freeze, no recovery) ----
  let nearFire = false; for (const f of fires) if (Math.hypot(frog.x - f.x, frog.z - f.z) < 6) nearFire = true;
  const drain = wc.drain * (gear.coat ? 0.5 : 1);
  if (inCave) { /* sheltered — warmth holds steady */ }
  else if (nearFire) frog.warmth = Math.min(100, frog.warmth + 20 * dt);
  else { frog.warmth -= drain * dt; if (frog.warmth <= 0) { frog.warmth = 0; frog.hp -= 6 * dt; } }

  // cave darkness + torch (dark, but you can still make out shapes)
  const targetAmb = (under || inCave) ? 0.06 : 0.28;
  const targetHemi = (under || inCave) ? 0.13 : 0.9;
  ambient.intensity += (targetAmb - ambient.intensity) * Math.min(1, dt * 4);
  hemi.intensity += (targetHemi - hemi.intensity) * Math.min(1, dt * 4);
  const wantTorch = ((inCave || under) && gear.torch) ? 3.4 : 0;
  torchLight.intensity += (wantTorch - torchLight.intensity) * Math.min(1, dt * 5);
  torchLight.distance = 30;
  torchLight.position.set(frog.x, frog.y + 2.5, frog.z);

  // touching the flag awakens the Snow Giant
  if (boss && boss.state === "dormant" && !cutscene && Math.hypot(frog.x, frog.z - SUMMIT_Z) < 8) startAwaken();

  if (frog.hp <= 0) return lose();
}

// ---------- Camera ----------
const _camPos = new THREE.Vector3();
let camInit = false;
function updateCamera(snap) {
  const cx = Math.sin(camYaw) * Math.cos(camPitch), cz = Math.cos(camYaw) * Math.cos(camPitch), cy = Math.sin(camPitch);
  const dist = underground ? 6.5 : camDist;
  const tx = frog.x, ty = frog.y + 2, tz = frog.z;
  _camPos.set(tx - cx * dist, ty + cy * dist + 1, tz - cz * dist);
  if (snap || !camInit) { camera.position.copy(_camPos); camInit = true; } else camera.position.lerp(_camPos, 0.16);
  if (!underground) { const minY = groundY(camera.position.x, camera.position.z) + 1.4; if (camera.position.y < minY) camera.position.y = minY; }
  camera.lookAt(tx, ty, tz);
  sky.position.copy(camera.position);
  sun.position.set(frog.x + 60, frog.y + 100, frog.z + 40); sun.target.position.set(frog.x, frog.y, frog.z);
  snowMat.uniforms.uCam.value.copy(camera.position);
}

// ---------- Interact (E) ----------
function findInteract() {
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
  return best ? { best, type } : null;
}
function interactPrompt() {
  const it = findInteract(); nearInteract = it;
  if (!it) { setPrompt(""); return; }
  if (it.type === "tree") setPrompt(`Press <b>E</b> to chop tree (${it.best.hits}/4)`);
  else if (it.type === "node") { const d = NODE_DEF[it.best.type]; setPrompt(`Press <b>E</b> to ${d.prompt} (${it.best.hits}/${it.best.max})`); }
  else if (it.type === "ally") setPrompt(`Hold <b>E</b> to free ${it.best.name} (${it.best.hits}/${it.best.need})`);
  else if (it.type === "gate") setPrompt(gear[it.best.requires] ? `Press <b>E</b> to scale the glacier` : `🧗 Glacier — needs <b>${it.best.label}</b> (craft with C)`);
  else if (it.type === "ropeDown") setPrompt(`Press <b>E</b> to climb down the rope ⬇️`);
  else if (it.type === "ropeUp") setPrompt(`Press <b>E</b> to climb back up ⬆️`);
  else if (it.type === "chest") setPrompt(`Press <b>E</b> to open the chest`);
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
  } else if (it.type === "chest") {
    const c = it.best; if (c.opened) return; c.opened = true; c.lid.rotation.x = -1.9;
    if (c.isTrap) { frog.hp = Math.max(0, frog.hp - 33); damageFlash(); toast("💥 It's a TRAP! Lost a third of your health."); }
    else if (c.loot === "sword") { gear.sword = true; attachWeapon("sword"); toast("🗡️ A Sword! Left-click to swing · hold Right-click to spin-attack."); }
    else if (c.loot === "shield") { gear.shield = true; attachWeapon("shield"); toast("🛡️ A Shield! Blocks 45% of incoming damage."); }
    else if (c.loot === "salveBig") { frog.hp = Math.min(100, frog.hp + 60); toast("🧪 A healing draught! +60 health."); }
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
  const tryHit = (m, extra) => {
    const dx = m.root.position.x - frog.x, dz = m.root.position.z - frog.z, d = Math.hypot(dx, dz);
    if (d > range + extra) return;
    if (frontal && d > 1) { const dot = (dx * fx + dz * fz) / d; if (dot < 0.0) return; }
    m.hp -= dmg; m.root.scale.multiplyScalar(0.95);
  };
  for (const m of monsters) if (m.hp > 0) tryHit(m, 0);
  if (boss && boss.state === "active" && boss.hp > 0) tryHit(boss, 7);
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
function moveTowards(root, tx, tz, step) {
  const dx = tx - root.position.x, dz = tz - root.position.z, d = Math.hypot(dx, dz) || 1;
  root.position.x += (dx / d) * step; root.position.z += (dz / d) * step;
  root.position.y = groundY(root.position.x, root.position.z) + Math.abs(Math.sin(performance.now()*0.01)) * 0.12;
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
      const reach = e.kind === "boss" ? 3.4 : 1.9;
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
    if (t.td > reach) { moveTowards(m.root, t.tx, t.tz, m.speed * dt); moved = true; }
    else {
      m.root.rotation.y = Math.atan2(t.tx - x, t.tz - z);
      if (m.cd <= 0) {
        m.cd = m.kind === "golem" ? 1.4 : (m.kind === "boss" ? 1.6 : 1.0); m.atkAnim = 0.28; m.root.scale.multiplyScalar(1.12);
        if (t.tgt) t.tgt.hp -= m.atk; else { frog.hp -= m.atk; damageFlash(); }
      }
    }
  } else {
    m.aggro = false; m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = 2 + Math.random()*3; m.tx = x + (Math.random()-0.5)*24; m.tz = z + (Math.random()-0.5)*24; }
    if (Math.hypot(m.tx - x, m.tz - z) > 1) { moveTowards(m.root, m.tx, m.tz, m.speed * 0.4 * dt); moved = true; }
  }
  // animation
  if (moved) m.walk += m.speed * dt * 1.4;
  const ud = m.root.userData, atk = m.atkAnim > 0 ? m.atkAnim / 0.28 : 0;
  if (ud.legs) { const a = moved ? 0.55 : 0; for (let i = 0; i < ud.legs.length; i++) ud.legs[i].rotation.x = Math.sin(m.walk + (i % 2 ? Math.PI : 0)) * a; }
  if (ud.arms) { const a = moved ? 0.3 : 0.05; ud.arms[0].rotation.x = Math.sin(m.walk * 0.7) * a - atk * 1.1; ud.arms[1].rotation.x = -Math.sin(m.walk * 0.7) * a - atk * 1.1; }
  if (m.kind === "wolf") m.root.rotation.x = -0.45 * atk;
}
function updateMonsters(dt) {
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    monsterAI(m, dt, 24);
    if (m.hp <= 0) { scene.remove(m.root); m.bar.visible = false; toast("💀 Monster slain!"); continue; }
    const show = m.aggro || m.hp < m.maxHp; m.bar.visible = show; if (show) billboard(m.bar, m.root, m.hp / m.maxHp, m.kind === "golem" ? 3.4 : 2.4);
  }
  if (boss) updateBoss(dt);
}

// ---------- Snow Giant boss ----------
function playerHurt(dmg) { frog.hp = Math.max(0, frog.hp - dmg * (gear.shield ? 0.55 : 1)); damageFlash(); }
function updateBoss(dt) {
  if (boss.state !== "active") return;
  const dx = frog.x - boss.x, dz = frog.z - boss.z, d = Math.hypot(dx, dz);
  boss.root.rotation.y = Math.atan2(dx, dz);
  if (d > 11) { boss.x += dx / d * 3.0 * dt; boss.z += dz / d * 3.0 * dt; boss.walk += dt * 3; }
  boss.root.position.set(boss.x, groundY(boss.x, boss.z), boss.z);
  const ud = boss.root.userData;
  if (ud.legs) { const a = d > 11 ? 0.3 : 0; for (let i = 0; i < ud.legs.length; i++) ud.legs[i].rotation.x = Math.sin(boss.walk + (i ? Math.PI : 0)) * a; }
  boss.armRaise = Math.max(0, (boss.armRaise || 0) - dt * 2.2);
  if (ud.arms) { ud.arms[0].rotation.x = -boss.armRaise; ud.arms[1].rotation.x = -boss.armRaise; }
  boss.atkTimer -= dt;
  if (boss.atkTimer <= 0 && d < 70) { doBossAttack(d); boss.atkTimer = 3.0 + Math.random() * 1.6; }
  updateBossFx(dt);
  boss.bar.visible = true; billboard(boss.bar, boss.root, boss.hp / boss.maxHp, 13);
  document.getElementById("bossbar-fill").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
  if (boss.hp <= 0) bossDefeated();
}
function doBossAttack(d) {
  const r = Math.random();
  if (d < 16 || r < 0.34) { boss.armRaise = 1.3; spawnShockwave(boss.x, boss.z); toast("⚠️ Ground slam — jump or run!"); }
  else if (r < 0.67) { boss.armRaise = 1.0; spawnIcicles(); toast("⚠️ Icicles incoming!"); }
  else { boss.armRaise = 1.1; spawnPillars(); toast("⚠️ Ice pillars erupting!"); }
}
function spawnShockwave(x, z) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.4, 8, 36), FX_ICE.clone());
  mesh.rotation.x = Math.PI / 2; mesh.position.set(x, groundY(x, z) + 0.4, z); scene.add(mesh);
  bossFx.waves.push({ x, z, r: 2, maxR: 34, dmg: 22, hit: false, mesh });
}
function spawnIcicles() {
  const hx = boss.x, hz = boss.z, hy = groundY(boss.x, boss.z) + 9;
  for (let i = 0; i < 4; i++) {
    const tx = frog.x + (Math.random() - 0.5) * 6, tz = frog.z + (Math.random() - 0.5) * 6;
    const dx = tx - hx, dz = tz - hz, dist = Math.hypot(dx, dz) || 1, sp = 26;
    const mesh = new THREE.Mesh(G.cone, FX_ICE); mesh.scale.set(0.4, 1.4, 0.4);
    mesh.position.set(hx, hy, hz); scene.add(mesh);
    bossFx.icicles.push({ mesh, x: hx, y: hy, z: hz, vx: dx / dist * sp, vy: -7, vz: dz / dist * sp, life: 3 });
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
    ic.mesh.position.set(ic.x, ic.y, ic.z); ic.mesh.lookAt(ic.x + ic.vx, ic.y + ic.vy, ic.z + ic.vz); ic.mesh.rotateX(Math.PI / 2);
    const gyl = groundY(ic.x, ic.z);
    if (Math.hypot(frog.x - ic.x, frog.z - ic.z) < 2.2 && Math.abs(frog.y + 1 - ic.y) < 3) { playerHurt(15); scene.remove(ic.mesh); bossFx.icicles.splice(i, 1); continue; }
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
  if (won) return; won = true; boss.state = "dead";
  document.getElementById("bossbar").classList.add("hidden");
  for (const w of bossFx.waves) scene.remove(w.mesh); for (const ic of bossFx.icicles) scene.remove(ic.mesh); for (const p of bossFx.pillars) { if (p.tel) scene.remove(p.tel); if (p.mesh) scene.remove(p.mesh); }
  bossFx.waves.length = bossFx.icicles.length = bossFx.pillars.length = 0;
  startRescue();
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
  sun.intensity += (c.sun - sun.intensity) * k;
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
  flag.visible = true; flag.position.set(bx, by + 3.4 * s, bz); flag.rotation.z = 0.45;
  camera.position.set(bx, boss.standY + 11, bz - 32); camera.lookAt(bx, boss.standY + 9, bz);
  setSubtitle(t > 1.7 ? "THE SNOW GIANT AWAKENS!" : "Something stirs beneath the snow…");
  if (t >= 4.6) {
    boss.state = "active"; boss.atkTimer = 2.6; flag.visible = false;
    document.getElementById("bossbar").classList.remove("hidden");
    setSubtitle(""); cutscene = null; camInit = false; canvas.requestPointerLock();
  }
}
function startRescue() { cutscene = { type: "rescue", t: 0 }; document.exitPointerLock && document.exitPointerLock(); setPrompt(""); }
function updateRescue(dt) {
  const c = cutscene; c.t += dt; const t = c.t;
  frogModel.rotation.set(Math.min(1.4, t * 0.9), frog.yaw, 0);
  frogModel.position.set(frog.x, groundY(frog.x, frog.z) + 0.3, frog.z);
  let i = 0;
  for (const a of allies) { if (a.state !== "active") continue; if (a.hp <= 0) { a.hp = a.maxHp; a.root.visible = true; } const ang = i * 2.1; moveTowards(a.root, frog.x + Math.cos(ang) * 3, frog.z + Math.sin(ang) * 3, 4 * dt); i++; }
  setSubtitle(t > 2.6 ? "Your companions carry you home. You did it! 🐸🏔️" : "You collapse from the battle…");
  const ang = t * 0.5;
  camera.position.set(frog.x + Math.cos(ang) * 11, frog.y + 6, frog.z + Math.sin(ang) * 11); camera.lookAt(frog.x, frog.y + 1, frog.z);
  if (t >= 6.5) { cutscene = null; setSubtitle(""); frogModel.rotation.set(0, frog.yaw, 0); showWin(); }
}

// ---------- Keys ----------
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (cutscene) { if (cutscene.type === "intro" && (k === " " || k === "enter" || k === "escape")) endCutscene(); return; }
  if (k === "c") { if (running) toggleCraft(); return; }
  if (!running || craftOpen) return;
  if (k === "e") doInteract();
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
    updateFrog(dt); updateCombat(dt); updateTrees(dt); updateAllies(dt); updateMonsters(dt); updateWeather(dt);
    interactPrompt(); updateCamera(); updateHud();
  } else if (!running) { camYaw += dt * 0.08; updateCamera(); }
  sky.position.copy(camera.position); snowMat.uniforms.uCam.value.copy(camera.position);
  for (const f of fires) f.flame.scale.y = 1 + Math.sin(now * 0.02) * 0.2;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
frogModel.position.set(0, groundY(0, START_Z), START_Z);
updateCamera(true);
document.getElementById("loadinfo").textContent = "3D engine ready ✓";
charBtns.forEach((b) => b.disabled = false);
startCutscene();
requestAnimationFrame(loop);
