import * as THREE from 'three';
import type { EnemyKind } from '../game/types';

export const material = (color: number, metalness = .1, roughness = .8, emissive = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, flatShading: true });

export function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function box(parent: THREE.Object3D, mat: THREE.Material, size: [number, number, number], position: [number, number, number]): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), mat, parent, ...position);
}

function horn(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, direction: number): void {
  const h = mesh(new THREE.ConeGeometry(.13, .63, 5), mat, parent, x, y, z);
  h.rotation.z = direction * -.5;
}

export function createPlayer(): { root: THREE.Group; body: THREE.Group; sword: THREE.Group; cape: THREE.Mesh } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const iron = material(0x717d7e, .75, .36);
  const dark = material(0x242d32, .65, .5);
  const gold = material(0xbb995b, .75, .35);
  const cloth = material(0x822b32, .08, .9);
  const black = material(0x171d20);
  const leather = material(0x3e332e);
  const glow = material(0xbfe2df, .65, .3, 0x3e7e79);

  for (const side of [-1, 1]) {
    const leg = box(body, dark, [.3, .6, .34], [side * .23, .49, .01]);
    leg.rotation.z = side * -.06;
    box(body, iron, [.32, .22, .25], [side * .23, .55, .2]);
    box(body, black, [.34, .22, .51], [side * .24, .14, .09]);
    const shoulder = mesh(new THREE.DodecahedronGeometry(.36, 0), iron, body, side * .58, 1.56, .01);
    shoulder.scale.set(1.15, .8, 1.0);
    box(body, gold, [.12, .22, .48], [side * .75, 1.54, .03]);
    const arm = box(body, dark, [.26, .58, .3], [side * .68, 1.16, .08]);
    arm.rotation.z = side * .1;
    box(body, iron, [.29, .2, .32], [side * .7, .96, .12]);
  }
  const torso = mesh(new THREE.CylinderGeometry(.45, .32, .77, 6), iron, body, 0, 1.27, 0);
  torso.scale.z = .65;
  box(body, gold, [.065, .6, .04], [0, 1.34, .29]);
  box(body, gold, [.55, .065, .04], [0, 1.4, .285]);
  box(body, leather, [.77, .12, .43], [0, .96, 0]);
  box(body, gold, [.17, .15, .07], [0, .96, .26]);
  const skirt = mesh(new THREE.CylinderGeometry(.3, .43, .45, 6, 1, true), cloth, body, 0, .77, -.03);
  skirt.scale.z = .7;
  const head = mesh(new THREE.IcosahedronGeometry(.33, 0), dark, body, 0, 1.98, .025);
  head.scale.set(.84, 1.25, .9);
  box(body, iron, [.12, .52, .38], [0, 1.99, .07]);
  box(body, black, [.41, .09, .06], [0, 2.04, .29]);
  box(body, glow, [.12, .028, .01], [-.105, 2.045, .325]);
  box(body, glow, [.12, .028, .01], [.105, 2.045, .325]);
  mesh(new THREE.ConeGeometry(.095, .32, 4), gold, body, 0, 2.4, 0);
  const capeGeometry = new THREE.BufferGeometry();
  capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.44, 1.65, -.28, .44, 1.65, -.28, -.61, .2, -.65, .61, .2, -.65, -.61, .2, -.65, .44, 1.65, -.28], 3));
  capeGeometry.computeVertexNormals();
  const capeMaterial = cloth.clone();
  capeMaterial.side = THREE.DoubleSide;
  const cape = mesh(capeGeometry, capeMaterial, body);
  const sword = new THREE.Group();
  sword.position.set(.68, 1, .1);
  body.add(sword);
  box(sword, leather, [.105, .1, .35], [0, 0, .2]);
  box(sword, gold, [.51, .1, .1], [0, 0, .42]);
  box(sword, iron, [.2, .07, 1.2], [0, 0, 1.04]);
  box(sword, glow, [.038, .08, 1.15], [0, 0, 1.03]);
  const point = mesh(new THREE.ConeGeometry(.14, .31, 4), iron, sword, 0, 0, 1.78);
  point.rotation.x = Math.PI / 2;
  point.rotation.y = Math.PI / 4;
  const shield = mesh(new THREE.CylinderGeometry(.4, .3, .12, 5), dark, body, -.85, 1.04, .2);
  shield.rotation.x = Math.PI / 2;
  box(body, gold, [.06, .58, .06], [-.85, 1.07, .3]);
  box(body, gold, [.39, .06, .06], [-.85, 1.18, .3]);
  const ring = mesh(new THREE.RingGeometry(.65, .7, 48), new THREE.MeshBasicMaterial({ color: 0xa4b9b1, transparent: true, opacity: .45, depthWrite: false }), root, 0, .04, 0);
  ring.rotation.x = -Math.PI / 2;
  return { root, body, sword, cape };
}

export function createEnemy(kind: EnemyKind, elite: boolean): { root: THREE.Group; body: THREE.Group; healthBar: THREE.Mesh; warning: THREE.Mesh } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bone = material(0xa79881, .05, .95);
  const shadow = material(0x211b26, .05, .95);
  const red = material(0x733c38);
  const armor = material(elite ? 0x6c5240 : 0x414546, .7, .46);
  const fire = material(elite ? 0xffad53 : 0xfe6f52, .1, .5, elite ? 0xff5710 : 0xe33917);
  if (kind === 'stalker') {
    const torso = mesh(new THREE.IcosahedronGeometry(.5, 0), red, body, 0, .87, 0);
    torso.scale.set(.8, 1, .7);
    torso.rotation.x = .4;
    mesh(new THREE.IcosahedronGeometry(.29, 0), bone, body, 0, 1.4, .3);
    for (const side of [-1, 1]) {
      const leg = box(body, red, [.19, .6, .2], [side * .26, .38, -.06]);
      leg.rotation.z = side * -.26;
      box(body, bone, [.18, .13, .42], [side * .31, .12, .08]);
      const arm = box(body, red, [.18, .65, .2], [side * .49, .79, .19]);
      arm.rotation.z = side * -.28;
      for (let i = 0; i < 3; i++) box(body, bone, [.042, .07, .35], [side * .6 + i * .065, .45, .4]);
      horn(body, bone, side * .19, 1.69, .2, side);
      box(body, fire, [.095, .065, .055], [side * .12, 1.45, .56]);
    }
    for (let i = 0; i < 3; i++) {
      const spine = mesh(new THREE.ConeGeometry(.08, .25, 4), bone, body, 0, 1.15 - i * .12, -.33);
      spine.rotation.x = -.6;
    }
  } else if (kind === 'acolyte') {
    const robe = material(0x514462, .05, .9);
    mesh(new THREE.ConeGeometry(.58, 1.65, 7), robe, body, 0, 1.05, 0);
    const hood = mesh(new THREE.IcosahedronGeometry(.4, 0), robe, body, 0, 1.95, 0);
    hood.scale.y = 1.2;
    mesh(new THREE.IcosahedronGeometry(.24, 0), shadow, body, 0, 1.96, .22);
    const purple = material(0xddb2ff, .3, .35, 0xb650ef);
    box(body, purple, [.29, .065, .03], [0, 2.03, .43]);
    for (const side of [-1, 1]) {
      const arm = mesh(new THREE.ConeGeometry(.2, .65, 5), robe, body, side * .48, 1.45, .1);
      arm.rotation.z = side * .9;
      mesh(new THREE.IcosahedronGeometry(.12, 0), bone, body, side * .73, 1.24, .1);
    }
    box(body, bone, [.075, 2.05, .075], [.77, 1.2, .1]);
    mesh(new THREE.OctahedronGeometry(.21, 0), purple, body, .77, 2.36, .1);
    const halo = mesh(new THREE.TorusGeometry(.31, .03, 4, 16), purple, body, .77, 2.36, .1);
    halo.rotation.y = .3;
  } else {
    const torso = mesh(new THREE.CylinderGeometry(.68, .48, 1.12, 6), armor, body, 0, 1.27, 0);
    torso.scale.z = .8;
    box(body, red, [.42, .9, .05], [0, 1.15, .59]);
    for (const side of [-1, 1]) {
      box(body, armor, [.39, .73, .45], [side * .34, .45, 0]);
      box(body, shadow, [.46, .25, .65], [side * .34, .15, .12]);
      mesh(new THREE.IcosahedronGeometry(.43, 0), armor, body, side * .77, 1.7, .01);
      horn(body, bone, side * .85, 2.1, -.04, side);
      box(body, armor, [.3, .65, .38], [side * .8, 1.15, .08]);
    }
    mesh(new THREE.IcosahedronGeometry(.38, 0), armor, body, 0, 2.09, 0);
    box(body, fire, [.37, .08, .05], [0, 2.15, .33]);
    horn(body, bone, -.3, 2.4, 0, -1);
    horn(body, bone, .3, 2.4, 0, 1);
    box(body, shadow, [.14, 1.4, .14], [.97, .86, .25]);
    mesh(new THREE.DodecahedronGeometry(.45, 0), armor, body, .97, 1.6, .25);
    for (let i = 0; i < 4; i++) horn(body, bone, .97 + Math.cos(i * Math.PI / 2) * .4, 1.7, .25 + Math.sin(i * Math.PI / 2) * .4, 0);
    if (elite) body.scale.setScalar(1.2);
  }
  const healthRoot = new THREE.Group();
  healthRoot.position.y = kind === 'warden' ? 3.35 : 2.65;
  root.add(healthRoot);
  mesh(new THREE.PlaneGeometry(1.2, .085), new THREE.MeshBasicMaterial({ color: 0x181515, depthTest: false }), healthRoot);
  const healthBar = mesh(new THREE.PlaneGeometry(1.16, .055), new THREE.MeshBasicMaterial({ color: elite ? 0xd49e4a : 0xa83e36, depthTest: false }), healthRoot, 0, 0, .002);
  healthBar.renderOrder = 10;
  const warning = mesh(new THREE.RingGeometry(.88, 1, 40), new THREE.MeshBasicMaterial({ color: elite ? 0xeab461 : 0xff583a, transparent: true, opacity: 0, depthWrite: false }), root, 0, .035, 0);
  warning.rotation.x = -Math.PI / 2;
  warning.scale.setScalar(kind === 'warden' ? 2.5 : 1.3);
  if (elite) {
    const aura = mesh(new THREE.RingGeometry(.95, 1.02, 32), new THREE.MeshBasicMaterial({ color: 0xd08f48, transparent: true, opacity: .45 }), root, 0, .025, 0);
    aura.rotation.x = -Math.PI / 2;
  }
  return { root, body, healthBar, warning };
}
