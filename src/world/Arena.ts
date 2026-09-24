import * as THREE from 'three';
import { box, material, mesh } from '../entities/models';

export const ARENA_RADIUS = 17.8;
export interface Obstacle { x: number; z: number; radius: number; }
interface Torch { light: THREE.PointLight; flame: THREE.Mesh; phase: number; }

function stoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#99958a'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9500; i++) {
    const alpha = Math.random() * .1;
    ctx.fillStyle = Math.random() > .5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 5 + 1, Math.random() * 5 + 1);
  }
  ctx.strokeStyle = '#4f504d'; ctx.lineWidth = 1.5;
  for (let crack = 0; crack < 3; crack++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += Math.random() * 38 - 19; y += Math.random() * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sigilTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(512, 512);
  ctx.strokeStyle = '#a28c63';
  ctx.fillStyle = '#a28c63';
  ctx.globalAlpha = .6;
  [467, 456, 395, 389, 248, 235].forEach((r, i) => { ctx.lineWidth = i % 2 ? 2 : 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
  for (let i = 0; i < 48; i++) {
    ctx.save(); ctx.rotate(i / 48 * Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, 413); ctx.lineTo(0, 442); ctx.lineTo(8, 413); ctx.moveTo(-11, 425); ctx.lineTo(11, 425); ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(0, 356); ctx.lineTo(26, 295); ctx.lineTo(0, 256); ctx.lineTo(-26, 295); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, -193); ctx.lineTo(153, 115); ctx.lineTo(0, 66); ctx.lineTo(-153, 115); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -154); ctx.lineTo(0, 185); ctx.moveTo(-92, 18); ctx.lineTo(92, 18); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Arena {
  readonly obstacles: Obstacle[] = [];
  private torches: Torch[] = [];
  private embers: THREE.Points;
  private emberPositions: Float32Array;
  private blood: THREE.Mesh[] = [];
  private bloodGeometry = new THREE.CircleGeometry(1, 11);
  private bloodMaterial = new THREE.MeshBasicMaterial({ color: 0x3e1213, transparent: true, opacity: .56, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  private flameGlow: THREE.Texture;
  readonly root = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
    const glowContext = glowCanvas.getContext('2d')!;
    const glowGradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    glowGradient.addColorStop(0, '#ffe7bdee'); glowGradient.addColorStop(.15, '#ffc472a0'); glowGradient.addColorStop(.4, '#f2994940'); glowGradient.addColorStop(1, '#e3772700');
    glowContext.fillStyle = glowGradient; glowContext.fillRect(0, 0, 64, 64);
    this.flameGlow = new THREE.CanvasTexture(glowCanvas);
    const stone = material(0x595b55, .12, .93);
    const pale = material(0x646a63, .18, .86);
    const darkStone = material(0x242d2d, .25, .9);
    const trim = material(0x615b48, .65, .65);
    const iron = material(0x282d2a, .75, .55);
    const map = stoneTexture();
    const tileMat = new THREE.MeshStandardMaterial({ map, roughness: .94, metalness: .09 });
    mesh(new THREE.CylinderGeometry(21, 21.5, .9, 12), darkStone, this.root, 0, -.7, 0);
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.93, .22, 1.93), tileMat, 441);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let count = 0;
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
      if (Math.hypot(x, z) > 10.6) continue;
      dummy.position.set(x * 2, -.16 + Math.random() * .018, z * 2);
      dummy.rotation.set(0, (Math.floor(Math.random() * 4) * Math.PI) / 2, 0);
      dummy.updateMatrix(); tiles.setMatrixAt(count, dummy.matrix);
      const cross = Math.abs(x) < 2 || Math.abs(z) < 2;
      color.setHSL(cross ? .105 : .15, cross ? .085 : .065, .32 + Math.random() * .09 + (cross ? .045 : 0));
      tiles.setColorAt(count++, color);
    }
    tiles.count = count;
    tiles.receiveShadow = true;
    this.root.add(tiles);
    const sigil = mesh(new THREE.PlaneGeometry(11.6, 11.6), new THREE.MeshStandardMaterial({ map: sigilTexture(), transparent: true, roughness: .7, metalness: .55, depthWrite: false }), this.root, 0, -.016, 0);
    sigil.rotation.x = -Math.PI / 2;
    sigil.castShadow = false;
    for (const r of [6.05, 6.13, 17.95, 18.07]) {
      const ring = mesh(new THREE.RingGeometry(r, r + .045, 96), trim, this.root, 0, -.015, 0);
      ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
    }
    // Inlaid cardinal paths and ruined edges.
    for (const side of [-1, 1]) {
      box(this.root, trim, [.075, .025, 30], [side * 3.01, 0, 0]);
      box(this.root, trim, [30, .025, .075], [0, 0, side * 3.01]);
    }

    const pillarPositions = [[-11, -10], [11, -10], [-15, 0], [15, 0], [-10, 11], [10, 11]];
    pillarPositions.forEach(([x, z], i) => {
      this.pillar(x, z, i > 3 ? 3.1 : 5.8, stone, pale, trim);
      this.obstacles.push({ x, z, radius: 1.12 });
      this.torch(x, z + 1.03, i % 2 ? 0xff9c53 : 0xffad60);
    });

    for (let i = -2; i <= 2; i++) {
      const x = i * 7;
      const z = -17.8 + Math.abs(i) * 1.1;
      this.pillar(x - 2.65, z, 7.9, stone, pale, trim);
      this.pillar(x + 2.65, z, 7.9, stone, pale, trim);
      this.arch(x, z, 5.25, 7.4, darkStone, trim);
      box(this.root, darkStone, [5.2, 2, .65], [x, .9, z - .12]);
      if (i === 0) {
        box(this.root, iron, [5, 6.3, .3], [x, 3.15, z + .1]);
        for (let j = -4; j <= 4; j++) box(this.root, trim, [.055, 6.5 - Math.abs(j) * .23, .12], [j * .5, 3.1, z + .31]);
        const portal = mesh(new THREE.PlaneGeometry(4.6, 5.6), new THREE.MeshBasicMaterial({ color: 0x1e5c62, transparent: true, opacity: .28 }), this.root, 0, 3, z + .27);
        portal.castShadow = false;
        scene.add(new THREE.PointLight(0x55b9c1, 32, 15, 2).translateY(3).translateZ(-15.8));
      } else {
        const banner = box(this.root, material(0x60282c, .05, .95), [1.45, 3.6, .08], [x, 4.8, z + .46]);
        banner.rotation.z = i * .015;
        box(this.root, trim, [.09, 1.2, .05], [x, 5, z + .515]);
        box(this.root, trim, [.7, .09, .05], [x, 5.23, z + .515]);
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = -11 + i * 7;
        const x = side * (19.25 - Math.abs(z) * .08);
        box(this.root, darkStone, [.9, 1.15, 6.5], [x, .45, z]);
        box(this.root, pale, [1.1, .16, 6.7], [x, 1.08, z]);
        if (i < 3) this.pillar(x, z - 3, 3.5 + (3 - i), stone, pale, trim);
      }
    }
    // Side tombs, votive candles, and broken masonry.
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = side * (13.5 + (i % 2) * 2), z = -6 + i * 6;
      const tomb = new THREE.Group(); tomb.position.set(x, 0, z); tomb.rotation.y = side * .2;
      this.root.add(tomb);
      box(tomb, darkStone, [1.6, .65, 2.4], [0, .28, 0]);
      box(tomb, pale, [1.8, .22, 2.65], [0, .72, 0]);
      box(tomb, trim, [.08, .04, 1.3], [0, .86, 0]);
      box(tomb, trim, [.65, .04, .08], [0, .86, -.26]);
      this.obstacles.push({ x, z, radius: 1.25 });
      for (let c = 0; c < 3; c++) this.candle(x + (c - 1) * .31, .84, z - .78, .18 + c * .08);
    }
    for (let i = 0; i < 100; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 18.3 + Math.random() * 2.5;
      const rock = mesh(new THREE.DodecahedronGeometry(.18 + Math.random() * .36, 0), stone, this.root, Math.cos(angle) * r, .08, Math.sin(angle) * r);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.set(1, .4 + Math.random(), 1);
    }
    for (let i = 0; i < 11; i++) this.addBlood(new THREE.Vector3((Math.random() - .5) * 27, 0, (Math.random() - .5) * 25), .5 + Math.random());

    const countEmbers = 130;
    this.emberPositions = new Float32Array(countEmbers * 3);
    for (let i = 0; i < countEmbers; i++) { this.emberPositions[i * 3] = (Math.random() - .5) * 38; this.emberPositions[i * 3 + 1] = Math.random() * 9; this.emberPositions[i * 3 + 2] = (Math.random() - .5) * 38; }
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    this.embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: 0xd4a16a, size: .038, transparent: true, opacity: .65, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.embers);
  }

  private pillar(x: number, z: number, height: number, stone: THREE.Material, pale: THREE.Material, trim: THREE.Material): void {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.root.add(group);
    box(group, stone, [1.7, .3, 1.7], [0, .1, 0]);
    box(group, pale, [1.37, .23, 1.37], [0, .35, 0]);
    mesh(new THREE.CylinderGeometry(.58, .69, height - 1, 8), stone, group, 0, height / 2, 0);
    for (const [dx, dz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]) mesh(new THREE.CylinderGeometry(.14, .18, height - 1.1, 6), pale, group, dx, height / 2, dz);
    box(group, trim, [1.3, .11, 1.3], [0, height - .5, 0]);
    box(group, pale, [1.55, .26, 1.55], [0, height - .3, 0]);
    box(group, stone, [1.7, .18, 1.7], [0, height - .07, 0]);
  }

  private arch(x: number, z: number, width: number, height: number, stone: THREE.Material, trim: THREE.Material): void {
    const peak = new THREE.Vector3(x, height + 1.8, z);
    for (const side of [-1, 1]) {
      const points = [new THREE.Vector3(x + side * width / 2, height - 2.2, z), new THREE.Vector3(x + side * width / 2, height - .6, z), new THREE.Vector3(x + side * width * .28, height + 1.05, z), peak];
      const curve = new THREE.CatmullRomCurve3(points);
      mesh(new THREE.TubeGeometry(curve, 12, .35, 6, false), stone, this.root);
      const inner = points.map(p => new THREE.Vector3(x + (p.x - x) * .92, p.y - .16, z + .38));
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(inner), 12, .07, 4, false), trim, this.root);
    }
  }

  private torch(x: number, z: number, color: number): void {
    const iron = material(0x302c25, .8);
    box(this.root, iron, [.15, .8, .15], [x, 1.1, z]);
    mesh(new THREE.CylinderGeometry(.32, .16, .25, 8), iron, this.root, x, 1.53, z);
    const flame = mesh(new THREE.OctahedronGeometry(.23, 0), new THREE.MeshBasicMaterial({ color: 0xffc77e }), this.root, x, 1.94, z);
    flame.scale.y = 2.5;
    const core = mesh(new THREE.OctahedronGeometry(.13, 0), new THREE.MeshBasicMaterial({ color: 0xfff0bc }), flame, 0, -.04, 0);
    core.scale.y = 1.25;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameGlow, color: 0xffbc78, transparent: true, opacity: .58, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(x, 2.03, z); glow.scale.set(2.3, 3, 1); this.root.add(glow);
    const light = new THREE.PointLight(color, 34, 11, 2);
    light.position.set(x, 2.3, z);
    this.root.add(light);
    this.torches.push({ light, flame, phase: Math.random() * Math.PI * 2 });
  }

  private candle(x: number, y: number, z: number, height: number): void {
    mesh(new THREE.CylinderGeometry(.045, .058, height, 6), material(0xb8a785), this.root, x, y + height / 2, z);
    const flame = mesh(new THREE.OctahedronGeometry(.058, 0), new THREE.MeshBasicMaterial({ color: 0xffd595 }), this.root, x, y + height + .045, z);
    flame.scale.y = 2;
  }

  constrain(position: THREE.Vector3, radius: number): void {
    const distance = Math.hypot(position.x, position.z);
    if (distance > ARENA_RADIUS - radius) { position.x *= (ARENA_RADIUS - radius) / distance; position.z *= (ARENA_RADIUS - radius) / distance; }
    for (const obstacle of this.obstacles) {
      const dx = position.x - obstacle.x, dz = position.z - obstacle.z;
      const d = Math.hypot(dx, dz), min = obstacle.radius + radius;
      if (d < min) { position.x = obstacle.x + (d > .001 ? dx / d : 1) * min; position.z = obstacle.z + (d > .001 ? dz / d : 0) * min; }
    }
  }

  addBlood(position: THREE.Vector3, scale = 1): void {
    const blood = new THREE.Mesh(this.bloodGeometry, this.bloodMaterial);
    blood.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    blood.position.set(position.x, .006 + Math.random() * .005, position.z);
    blood.scale.set(scale, scale * (.55 + Math.random() * .35), 1);
    this.root.add(blood);
    this.blood.push(blood);
    if (this.blood.length > 65) this.root.remove(this.blood.shift()!);
  }

  update(dt: number, time: number): void {
    for (const torch of this.torches) {
      const flicker = Math.sin(time * 13 + torch.phase) * .06 + Math.sin(time * 23 + torch.phase) * .04;
      torch.light.intensity = 34 * (1 + flicker);
      torch.flame.scale.y = 2.4 + flicker * 5;
      torch.flame.rotation.y = time * 1.5;
    }
    for (let i = 0; i < this.emberPositions.length; i += 3) {
      this.emberPositions[i] += Math.sin(time * .3 + i) * dt * .1;
      this.emberPositions[i + 1] += dt * .19;
      if (this.emberPositions[i + 1] > 9) this.emberPositions[i + 1] = .1;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }
}
