import * as THREE from 'three';
import { createEnemy, createPlayer } from '../entities/models';
import { Arena, ARENA_RADIUS } from '../world/Arena';
import { Effects } from '../world/Effects';
import { HUD } from '../ui/HUD';
import { AudioEngine } from './audio';
import { Input } from './input';
import { deriveStats, rollItem, salvageValue, starterWeapon } from './loot';
import { RARITY_COLORS } from './types';
import type { Enemy, EnemyKind, GroundLoot, Item, Phase, Projectile, RunRecord, Slot, Stats } from './types';

type Panel = 'inventory' | 'pause' | 'help' | null;
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(22, 0, -18).normalize();
const FORWARD = new THREE.Vector3(-18, 0, -22).normalize();
const temp = new THREE.Vector3();
const MAX_INVENTORY = 12;

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-20, 20, 15, -15, .1, 110);
  readonly renderer: THREE.WebGLRenderer;
  readonly arena: Arena;
  readonly effects: Effects;
  readonly audio = new AudioEngine();
  readonly input: Input;
  readonly hud: HUD;
  readonly hero = createPlayer();
  readonly playerLight = new THREE.PointLight(0x90bfc5, 9, 8, 2);
  readonly aim = new THREE.Vector3(0, 0, -1);
  readonly enemies: Enemy[] = [];
  readonly drops: GroundLoot[] = [];
  readonly projectiles: Projectile[] = [];
  inventory: Item[] = [];
  equipment: Partial<Record<Slot, Item>> = { weapon: starterWeapon() };
  stats: Stats = deriveStats(1, this.equipment);
  phase: Phase = 'ready';
  panel: Panel = null;
  hp = 120;
  xp = 0;
  level = 1;
  wave = 0;
  clearedWaves = 0;
  kills = 0;
  gold = 0;
  elapsed = 0;
  waveCountdown = 1;
  spawnRemaining = 0;
  potionCharges = 3;
  potionCooldown = 0;
  novaCooldown = 0;
  dashCooldown = 0;
  autoAttack = true;
  best: RunRecord = { wave: 0, kills: 0, score: 0 };
  private lastTime = 0;
  private time = 0;
  private uiTimer = 0;
  private spawnTimer = 0;
  private attackCooldown = 0;
  private attackAnimation = 0;
  private invincible = 0;
  private dashTime = 0;
  private dashDirection = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(UP, 0);
  private target = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();
  private shake = 0;
  private serial = 0;
  private fullWarning = 0;
  private aimMarker: THREE.Mesh;
  private projectileGeometry = new THREE.IcosahedronGeometry(.19, 0);
  private projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xd18fff });

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.23;
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D sanctum arena. Use WASD to move, mouse to aim, and hold click to attack.');
    container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0b1317);
    this.scene.fog = new THREE.FogExp2(0x101b20, .025);
    this.scene.add(new THREE.HemisphereLight(0x8ea9b2, 0x3c312b, 1.65));
    const moon = new THREE.DirectionalLight(0xa5c2d0, 2.5);
    moon.position.set(-9, 20, -12); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
    moon.shadow.bias = -.0003;
    moon.shadow.normalBias = .07;
    this.scene.add(moon);
    const rim = new THREE.DirectionalLight(0xcbb591, 1.7); rim.position.set(10, 8, 10); this.scene.add(rim);
    this.arena = new Arena(this.scene);
    this.scene.add(this.hero.root, this.playerLight);
    this.hero.root.position.set(0, 0, 3);
    this.hero.root.rotation.y = -.3;
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xc2ae7e, transparent: true, opacity: .5, depthWrite: false });
    this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(.22, .27, 4), markerMaterial);
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.aimMarker);
    this.aimMarker.visible = false;
    this.hud = new HUD(container, this);
    this.effects = new Effects(this.scene, this.hud.effectsLayer);
    this.input = new Input(this.renderer.domElement, key => this.action(key));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { if (this.phase === 'playing' && !this.panel) this.openPanel('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'playing' && !this.panel) this.openPanel('pause'); });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.openPanel('pause'); this.hud.toast('Graphics context lost. Reload the page to return.', 'warning', 10000);
    });
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('ashen-vow-best') ?? 'null');
      if (saved && typeof saved === 'object' && 'score' in saved && 'wave' in saved && 'kills' in saved) {
        const r = saved as RunRecord;
        if ([r.score, r.wave, r.kills].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) this.best = r;
      }
    } catch { /* Storage is optional, including private browsing. */ }
    this.resize();
    this.cameraTarget.copy(this.hero.root.position).multiplyScalar(.55);
    this.updateCamera(1);
    for (const [kind, x, z] of [['stalker', -5, -3], ['acolyte', 7, -6], ['warden', -7, 6], ['stalker', 5, 6]] as [EnemyKind, number, number][]) {
      const e = this.spawnEnemy(kind, false); e.model.position.set(x, 0, z); e.model.rotation.y = Math.atan2(-x, 3 - z); e.healthBar.parent!.visible = false;
    }
    this.hud.refresh();
    this.renderer.setAnimationLoop(timestamp => this.frame(timestamp));
  }

  get active(): boolean { return this.phase === 'playing' && !this.panel; }
  get xpRequired(): number { return Math.round(75 + (this.level - 1) * 42); }
  get cooldown(): number { return .48 / (1 + this.stats.haste); }
  get dps(): number { return Math.round(this.stats.damage / this.cooldown * (1 + this.stats.crit * .8)); }
  get score(): number { return this.kills * 100 + this.clearedWaves * 500 + this.gold * 2 + (this.level - 1) * 100; }

  start(): void {
    this.audio.unlock();
    this.enemies.forEach(e => this.disposeObject(e.model)); this.enemies.length = 0;
    this.drops.forEach(d => { this.disposeObject(d.model); d.label.remove(); }); this.drops.length = 0;
    this.projectiles.forEach(p => this.scene.remove(p.model)); this.projectiles.length = 0;
    this.effects.clear();
    this.inventory = []; this.equipment = { weapon: starterWeapon() };
    this.level = 1; this.stats = deriveStats(1, this.equipment); this.hp = this.stats.maxHp;
    this.xp = this.wave = this.clearedWaves = this.kills = this.gold = this.elapsed = 0;
    this.spawnRemaining = 0; this.waveCountdown = 1.4; this.potionCharges = 3;
    this.potionCooldown = this.novaCooldown = this.dashCooldown = this.attackCooldown = this.invincible = this.dashTime = this.shake = 0;
    this.hero.root.position.set(0, 0, 3); this.hero.root.visible = true; this.hero.body.rotation.set(0, 0, 0);
    this.panel = null; this.phase = 'playing'; this.input.clear();
    this.hud.closeTooltip(); this.hud.refresh();
    this.hud.announce('THE VOW BEGINS', 'Survive the sanctum. Claim what the fallen leave behind.');
  }

  action(key: string): void {
    if (key === 'KeyM') { this.audio.toggle(); this.hud.refresh(); return; }
    if (key === 'Enter' && (this.phase === 'ready' || this.phase === 'dead')) { this.start(); return; }
    if (key === 'Escape') {
      if (this.panel) this.closePanel(); else if (this.phase === 'playing') this.openPanel('pause');
      return;
    }
    if (key === 'KeyH') { if (this.panel === 'help') this.closePanel(); else this.openPanel('help'); return; }
    if (this.phase !== 'playing') return;
    if (key === 'KeyI' || key === 'Tab') { if (this.panel === 'inventory') this.closePanel(); else this.openPanel('inventory'); return; }
    if (!this.active) return;
    if (key === 'Digit1') this.nova();
    if (key === 'Digit2' || key === 'Space') this.dash();
    if (key === 'KeyQ') this.heal();
    if (key === 'KeyE') this.pickupNearest();
    if (key === 'KeyF') { this.autoAttack = !this.autoAttack; this.hud.toast(`Auto-strike ${this.autoAttack ? 'enabled' : 'disabled'}`, 'system'); this.hud.refresh(); }
  }

  openPanel(panel: Exclude<Panel, null>): void {
    if (panel !== 'help' && this.phase !== 'playing') return;
    this.panel = panel; this.input?.clear(); this.hud.refresh();
  }

  closePanel(): void { this.panel = null; this.input.clear(); this.hud.closeTooltip(); this.hud.refresh(); }

  equip(itemId: number): void {
    const index = this.inventory.findIndex(i => i.id === itemId);
    if (index === -1) return;
    const item = this.inventory[index], previous = this.equipment[item.slot];
    if (previous) this.inventory[index] = previous; else this.inventory.splice(index, 1);
    this.equipment[item.slot] = item;
    const oldMax = this.stats.maxHp;
    this.stats = deriveStats(this.level, this.equipment);
    this.hp = this.stats.maxHp * Math.min(1, this.hp / oldMax);
    this.audio.play('equip');
    this.hud.toast(`${item.name} equipped`, item.rarity);
    this.hud.refresh();
  }

  salvage(itemId: number): void {
    const index = this.inventory.findIndex(i => i.id === itemId);
    if (index === -1) return;
    const item = this.inventory[index], value = salvageValue(item);
    this.inventory.splice(index, 1); this.gold += value;
    this.audio.play('loot'); this.hud.toast(`Salvaged ${item.name} · +${value} gold`, 'system'); this.hud.refresh();
  }

  buyPotion(): void {
    if (this.potionCharges >= 3) { this.hud.toast('Your flask is already full', 'system'); return; }
    if (this.gold < 30) { this.hud.toast('A flask charge costs 30 gold', 'warning'); return; }
    this.gold -= 30; this.potionCharges++; this.audio.play('loot'); this.hud.refresh(); this.hud.toast('Flask replenished', 'system');
  }

  private resize(): void {
    const width = window.innerWidth, height = window.innerHeight, aspect = width / height;
    const view = Math.max(27.5, 33 / aspect);
    this.camera.left = -view * aspect / 2; this.camera.right = view * aspect / 2;
    this.camera.top = view / 2; this.camera.bottom = -view / 2;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  }

  private frame(timestamp: number): void {
    const dt = Math.min((timestamp - (this.lastTime || timestamp)) / 1000, .05);
    this.lastTime = timestamp; this.time += dt;
    this.arena.update(dt, this.time);
    if (this.active) this.update(dt);
    else if (this.phase === 'ready') {
      this.hero.body.position.y = Math.sin(this.time * 2) * .035;
      this.enemies.forEach(e => { e.body.position.y = e.kind === 'acolyte' ? Math.sin(this.time * 2 + e.id) * .13 : Math.sin(this.time * 2 + e.id) * .03; });
    }
    this.updateCamera(dt);
    this.effects.update(this.panel ? 0 : dt, this.camera);
    this.updateDrops(this.active ? dt : 0);
    this.playerLight.position.copy(this.hero.root.position).add(new THREE.Vector3(0, 3, 0));
    this.aimMarker.visible = this.active && this.input.hasPointer;
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.hud.update(); this.uiTimer = .08; }
    this.renderer.render(this.scene, this.camera);
    this.input.pressed.clear();
  }

  private updateCamera(dt: number): void {
    temp.copy(this.hero.root.position).multiplyScalar(.7); temp.y = 1.25; temp.z -= 3;
    this.cameraTarget.lerp(temp, 1 - Math.exp(-dt * 4));
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(18, 26, 22));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - .5) * this.shake;
      this.camera.position.y += (Math.random() - .5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 3.5);
    }
    this.camera.lookAt(this.cameraTarget);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.attackCooldown -= dt; this.invincible -= dt; this.fullWarning -= dt;
    this.novaCooldown = Math.max(0, this.novaCooldown - dt); this.dashCooldown = Math.max(0, this.dashCooldown - dt); this.potionCooldown = Math.max(0, this.potionCooldown - dt);
    const movement = this.input.movement();
    const velocity = RIGHT.clone().multiplyScalar(movement.x).addScaledVector(FORWARD, movement.y);
    const position = this.hero.root.position;
    if (this.dashTime > 0) {
      this.dashTime -= dt; position.addScaledVector(this.dashDirection, dt * 24);
      if (Math.random() < .7) this.effects.burst(position, 0x9fe0e2, 2, .7);
    } else position.addScaledVector(velocity, dt * 5.6 * (1 + this.stats.speed));
    this.arena.constrain(position, .48);
    if (this.input.hasPointer) {
      this.raycaster.setFromCamera(this.input.pointer, this.camera);
      if (this.raycaster.ray.intersectPlane(this.ground, this.target)) {
        temp.copy(this.target).sub(position); temp.y = 0;
        if (temp.lengthSq() > .1) this.aim.copy(temp).normalize();
        this.aimMarker.position.copy(this.target); this.aimMarker.position.y = .025;
      }
    } else if (velocity.lengthSq() > 0) this.aim.copy(velocity).normalize();
    if (this.autoAttack && !this.input.attacking && this.attackCooldown <= 0) {
      let nearest: Enemy | undefined, distance = 3.2;
      for (const e of this.enemies) { const d = e.model.position.distanceTo(position); if (d < distance && e.age > .6) { nearest = e; distance = d; } }
      if (nearest) { this.aim.copy(nearest.model.position).sub(position).normalize(); this.attack(); }
    }
    this.hero.root.rotation.y = Math.atan2(this.aim.x, this.aim.z);
    this.hero.body.position.y = movement.lengthSq() > 0 ? Math.abs(Math.sin(this.time * 12)) * .09 : Math.sin(this.time * 2) * .025;
    this.hero.body.rotation.z = Math.sin(this.time * 12) * .035 * movement.length();
    this.attackAnimation = Math.max(0, this.attackAnimation - dt);
    this.hero.sword.rotation.y = this.attackAnimation > 0 ? -.8 + (1 - this.attackAnimation / .24) * 2 : -.25;
    this.hero.cape.rotation.x = Math.sin(this.time * 7) * .06 + movement.length() * .1;
    if (this.input.attacking && this.attackCooldown <= 0) this.attack();
    this.updateEnemies(dt);
    if (!this.active) return;
    this.updateProjectiles(dt);
    if (!this.active) return;
    if (this.spawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const index = this.spawnRemaining;
        const elite = this.wave % 3 === 0 && index === 1;
        const kind: EnemyKind = elite || index % 7 === 0 ? 'warden' : index % 3 === 0 ? 'acolyte' : 'stalker';
        this.spawnEnemy(kind, elite);
        this.spawnRemaining--; this.spawnTimer = .48;
      }
    } else if (this.enemies.length === 0) {
      if (this.wave > this.clearedWaves) this.clearWave();
      this.waveCountdown -= dt;
      if (this.waveCountdown <= 0) this.nextWave();
    }
  }

  private attack(): void {
    this.attackCooldown = this.cooldown; this.attackAnimation = .24;
    this.audio.play('swing'); this.effects.slash(this.hero.root.position, this.aim);
    for (const e of [...this.enemies]) {
      temp.copy(e.model.position).sub(this.hero.root.position);
      const distance = temp.length();
      if (distance < 3.25 + e.radius * .3 && (distance < 1.25 || temp.normalize().dot(this.aim) > .2)) {
        const critical = Math.random() < this.stats.crit;
        this.hitEnemy(e, this.stats.damage * (.92 + Math.random() * .16) * (critical ? 1.8 : 1), critical);
      }
    }
  }

  nova(): void {
    if (!this.active || this.novaCooldown > 0) return;
    this.novaCooldown = 8; this.shake = .5; this.audio.play('nova');
    const p = this.hero.root.position;
    this.effects.ring(p, 0xf9a15a, .8, .65, 8);
    this.effects.ring(p, 0xffd294, 2, .5, 2.2);
    this.effects.burst(p, 0xffaa55, 85, 7);
    for (const e of [...this.enemies]) if (e.model.position.distanceTo(p) < 6.5) {
      const push = e.model.position.clone().sub(p).normalize();
      e.model.position.addScaledVector(push, e.kind === 'warden' ? .6 : 2);
      this.arena.constrain(e.model.position, e.radius);
      this.hitEnemy(e, this.stats.damage * 2.8, true); e.windup = 0; e.cooldown = .9;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].model.position.distanceTo(p) < 7) { this.scene.remove(this.projectiles[i].model); this.projectiles.splice(i, 1); }
    this.hud.update();
  }

  dash(): void {
    if (!this.active || this.dashCooldown > 0) return;
    this.dashCooldown = 3.2; this.dashTime = .2; this.invincible = .45;
    const movement = this.input.movement();
    this.dashDirection.copy(movement.lengthSq() ? RIGHT.clone().multiplyScalar(movement.x).addScaledVector(FORWARD, movement.y) : this.aim).normalize();
    this.audio.play('dash'); this.effects.ring(this.hero.root.position, 0x9bccd6, .6, .3, 1.5); this.hud.update();
  }

  heal(): void {
    if (!this.active || this.potionCooldown > 0) return;
    if (this.potionCharges <= 0) { this.hud.toast('Flask empty · refill in your inventory', 'warning'); return; }
    if (this.hp >= this.stats.maxHp) { this.hud.toast('Vitality is already full', 'system'); return; }
    this.potionCharges--; this.potionCooldown = 4;
    const amount = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * .55);
    this.hp += amount; this.invincible = .4;
    this.effects.text(this.hero.root.position, `+${Math.round(amount)}`, '#9bc8a0', true);
    this.effects.burst(this.hero.root.position, 0x99d69e, 25, 2); this.effects.ring(this.hero.root.position, 0x9bcca0, .7, .8, 3);
    this.audio.play('heal'); this.hud.update();
  }

  private spawnEnemy(kind: EnemyKind, elite: boolean): Enemy {
    const { root, body, healthBar, warning } = createEnemy(kind, elite);
    const base = { stalker: { hp: 40, damage: 9, speed: 2.8, radius: .48 }, acolyte: { hp: 48, damage: 12, speed: 2, radius: .5 }, warden: { hp: 145, damage: 24, speed: 1.45, radius: .83 } }[kind];
    const scale = 1 + Math.max(0, this.wave - 1) * .19;
    const affix = elite ? (this.wave % 6 === 0 ? 'Frenzied' : 'Ironbound') : '';
    const maxHp = Math.round(base.hp * scale * (elite ? 2.05 : 1));
    let x = 0, z = 0;
    for (let attempts = 0; attempts < 20; attempts++) {
      const angle = Math.random() * Math.PI * 2, radius = 14.5 + Math.random() * 2.5;
      x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
      if (Math.hypot(x - this.hero.root.position.x, z - this.hero.root.position.z) > 8) break;
    }
    root.position.set(x, 0, z); this.arena.constrain(root.position, base.radius); this.scene.add(root);
    const enemy: Enemy = { id: ++this.serial, kind, model: root, body, hp: maxHp, maxHp, damage: base.damage * (1 + Math.max(0, this.wave - 1) * .13) * (elite ? 1.35 : 1), speed: base.speed * (1 + Math.min(this.wave * .015, .4)) * (affix === 'Frenzied' ? 1.5 : 1), radius: base.radius, cooldown: .7 + Math.random(), windup: 0, attackTarget: new THREE.Vector3(), flash: 0, age: 0, elite, affix, healthBar, warning };
    this.enemies.push(enemy);
    if (this.phase === 'playing') this.effects.ring(root.position, elite ? 0xeab160 : 0xa46256, .7, .8, 1.5);
    if (elite) this.hud.announce('THE BELL TOLLS', `${affix} Warden has entered the sanctum`, true);
    return enemy;
  }

  private updateEnemies(dt: number): void {
    const player = this.hero.root.position;
    for (const e of this.enemies) {
      e.age += dt; e.cooldown -= dt;
      e.healthBar.parent!.quaternion.copy(this.camera.quaternion);
      e.healthBar.parent!.visible = e.hp < e.maxHp || e.elite;
      e.healthBar.scale.x = Math.max(0, e.hp / e.maxHp);
      e.healthBar.position.x = -(1 - e.hp / e.maxHp) * .58;
      if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.model.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.userData.baseEmissive !== undefined) object.material.emissive.setHex(object.material.userData.baseEmissive); }); }
      if (e.age < .65) { e.model.scale.setScalar(Math.min(1, .2 + e.age * 1.3)); continue; }
      e.model.scale.setScalar(1);
      temp.copy(player).sub(e.model.position); temp.y = 0;
      const distance = temp.length(), direction = temp.clone().normalize();
      e.model.rotation.y = Math.atan2(direction.x, direction.z);
      const warningMat = e.warning.material as THREE.MeshBasicMaterial;
      if (e.windup > 0) {
        e.windup -= dt;
        warningMat.opacity = .45 + Math.sin(this.time * 24) * .2;
        e.body.rotation.x = -.15;
        if (e.windup <= 0) {
          e.body.rotation.x = 0; warningMat.opacity = 0;
          if (e.kind === 'acolyte') this.shoot(e);
          else {
            const range = e.kind === 'warden' ? 2.85 : 1.85;
            if (e.kind === 'warden') { this.effects.ring(e.model.position, 0xce674d, 1, .4, 1.7); this.effects.burst(e.model.position, 0x9b7657, 18, 3); }
            if (distance < range) this.hurt(e.damage);
          }
          e.cooldown = e.kind === 'warden' ? 1.7 : e.kind === 'acolyte' ? 2.1 : 1;
        }
      } else {
        warningMat.opacity = 0;
        if (e.kind === 'acolyte') {
          const move = distance < 6.3 ? -.9 : distance > 9 ? 1 : 0;
          e.model.position.addScaledVector(direction, e.speed * dt * move);
          if (!move) e.model.position.addScaledVector(new THREE.Vector3(direction.z, 0, -direction.x), dt * .55 * Math.sin(e.id));
          if (distance < 14 && e.cooldown <= 0) { e.windup = .55; e.attackTarget.copy(player); }
        } else {
          if (distance > (e.kind === 'warden' ? 2.1 : 1.25)) e.model.position.addScaledVector(direction, e.speed * dt);
          else if (e.cooldown <= 0) { e.windup = e.kind === 'warden' ? .85 : .38; e.attackTarget.copy(player); }
        }
      }
      e.body.position.y = e.kind === 'acolyte' ? .04 + Math.sin(this.time * 3 + e.id) * .14 : Math.abs(Math.sin(this.time * e.speed * 3 + e.id)) * .08;
      for (const other of this.enemies) {
        if (other.id <= e.id) continue;
        const delta = e.model.position.clone().sub(other.model.position), d = delta.length(), minimum = e.radius + other.radius + .12;
        if (d < minimum && d > .001) { delta.multiplyScalar((minimum - d) / d * .5); e.model.position.add(delta); other.model.position.sub(delta); }
      }
      this.arena.constrain(e.model.position, e.radius);
      if (!this.active) break;
    }
  }

  private shoot(enemy: Enemy): void {
    const model = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
    model.position.copy(enemy.model.position); model.position.y = .95;
    const direction = enemy.attackTarget.clone().sub(enemy.model.position); direction.y = 0; direction.normalize();
    model.position.addScaledVector(direction, .8);
    this.scene.add(model);
    this.projectiles.push({ model, velocity: direction.multiplyScalar(7.5), damage: enemy.damage, life: 3.8 });
    this.effects.burst(model.position, 0xcc83f1, 6, .8);
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.life -= dt;
      p.model.position.addScaledVector(p.velocity, dt); p.model.rotation.y += dt * 7;
      const dx = p.model.position.x - this.hero.root.position.x, dz = p.model.position.z - this.hero.root.position.z;
      if (Math.hypot(dx, dz) < .72) { this.hurt(p.damage); p.life = 0; }
      if (Math.hypot(p.model.position.x, p.model.position.z) > ARENA_RADIUS) p.life = 0;
      for (const obstacle of this.arena.obstacles) if (Math.hypot(p.model.position.x - obstacle.x, p.model.position.z - obstacle.z) < obstacle.radius) p.life = 0;
      if (p.life <= 0) { this.effects.burst(p.model.position, 0xae83da, 5, 1); this.scene.remove(p.model); this.projectiles.splice(i, 1); }
    }
  }

  private hitEnemy(enemy: Enemy, rawDamage: number, critical: boolean): void {
    if (enemy.hp <= 0) return;
    const damage = Math.round(rawDamage * (enemy.affix === 'Ironbound' ? .8 : 1));
    enemy.hp -= damage; enemy.flash = .1;
    enemy.model.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        if (object.material.userData.baseEmissive === undefined) object.material.userData.baseEmissive = object.material.emissive.getHex();
        object.material.emissive.setHex(0xbfa895);
      }
    });
    this.effects.text(enemy.model.position, `${damage}${critical ? '!' : ''}`, critical ? '#f5d08b' : '#e9dfc7', critical);
    this.effects.burst(enemy.model.position, critical ? 0xf7c47a : 0xd5b098, critical ? 12 : 7, 2.5);
    this.shake = Math.max(this.shake, critical ? .17 : .065); this.audio.play('hit');
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    const position = enemy.model.position.clone();
    const index = this.enemies.indexOf(enemy); if (index === -1) return;
    this.enemies.splice(index, 1); this.kills++;
    const gold = (enemy.elite ? 35 : enemy.kind === 'warden' ? 15 : 4) + Math.floor(Math.random() * 5) + this.wave;
    this.gold += gold;
    this.xp += enemy.elite ? 85 : enemy.kind === 'warden' ? 40 : enemy.kind === 'acolyte' ? 24 : 17;
    this.effects.burst(position, enemy.kind === 'acolyte' ? 0xab7cbc : 0xa84235, 26, 3.4);
    this.effects.burst(position, 0xe4bb6b, 5, 2);
    this.arena.addBlood(position, enemy.kind === 'warden' ? 1.25 : .7);
    this.audio.play('kill');
    if (enemy.elite || this.kills === 1 || Math.random() < (enemy.kind === 'warden' ? .95 : .36)) {
      this.dropItem(rollItem(Math.max(1, this.wave), enemy.elite ? 'Legendary' : this.kills === 1 ? 'Magic' : undefined), position);
    }
    this.disposeObject(enemy.model);
    while (this.xp >= this.xpRequired) {
      this.xp -= this.xpRequired; this.level++;
      this.stats = deriveStats(this.level, this.equipment); this.hp = this.stats.maxHp;
      this.audio.play('level'); this.effects.ring(this.hero.root.position, 0xead09a, 1, 1, 5);
      this.effects.burst(this.hero.root.position, 0xffdda1, 55, 4);
      this.hud.announce(`LEVEL ${this.level}`, 'Vitality restored · damage and maximum vitality increased');
    }
    this.hud.update();
  }

  private hurt(raw: number): void {
    if (this.invincible > 0 || !this.active) return;
    const damage = Math.max(1, Math.round(raw * 100 / (100 + this.stats.armor * 5)));
    this.hp = Math.max(0, this.hp - damage); this.invincible = .42; this.shake = .32;
    this.audio.play('hurt'); this.effects.text(this.hero.root.position, `−${damage}`, '#f49788');
    this.effects.burst(this.hero.root.position, 0xb44436, 9, 2);
    this.hud.flash();
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.phase = 'dead'; this.panel = null; this.input.clear(); this.saveBest();
    this.audio.play('death'); this.hero.body.rotation.z = -Math.PI / 2; this.hero.body.position.y = .2;
    this.effects.burst(this.hero.root.position, 0xc7b397, 55, 3); this.hud.refresh();
  }

  private nextWave(): void {
    this.wave++; this.spawnRemaining = Math.min(44, 5 + Math.floor(this.wave * 1.75));
    this.spawnTimer = .1; this.waveCountdown = 0;
    this.audio.play('wave');
    this.hud.announce(`WAVE ${String(this.wave).padStart(2, '0')}`, this.wave % 3 === 0 ? 'An ancient warden answers the call.' : ['The fallen stir beneath your feet.', 'The dark has learned your name.', 'Another vow. Another reckoning.'][(this.wave - 1) % 3]);
    this.hud.refresh();
  }

  private clearWave(): void {
    this.clearedWaves = this.wave; this.waveCountdown = 7;
    this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * .3);
    this.potionCharges = Math.min(3, this.potionCharges + 1);
    this.hud.announce('A MOMENT OF GRACE', 'Wave cleared · vitality restored · +1 flask charge');
    this.audio.play('level'); this.saveBest();
    const rewardPosition = this.hero.root.position.clone().add(new THREE.Vector3(1.7, 0, 0));
    this.arena.constrain(rewardPosition, .3);
    this.dropItem(rollItem(this.wave, this.wave % 3 === 0 ? 'Rare' : 'Magic'), rewardPosition);
  }

  private saveBest(): void {
    if (this.score > this.best.score) {
      this.best = { score: this.score, wave: this.clearedWaves, kills: this.kills };
      try { localStorage.setItem('ashen-vow-best', JSON.stringify(this.best)); } catch { /* The run is playable without persistence. */ }
    }
  }

  private dropItem(item: Item, position: THREE.Vector3): void {
    if (this.drops.length >= 22) {
      const index = this.drops.findIndex(d => d.item.rarity !== 'Legendary');
      const old = this.drops.splice(index < 0 ? 0 : index, 1)[0]; this.disposeObject(old.model); old.label.remove();
    }
    const color = new THREE.Color(RARITY_COLORS[item.rarity]);
    const model = new THREE.Group(); model.position.copy(position); this.scene.add(model);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: .7, roughness: .2 }));
    gem.position.y = .45; model.add(gem);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.025, .16, item.rarity === 'Legendary' ? 4 : 2.2, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = item.rarity === 'Legendary' ? 2 : 1.1; model.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.32, .38, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .024; model.add(ring);
    const label = document.createElement('button'); label.className = `loot-label ${item.rarity.toLowerCase()}`; label.textContent = item.name;
    label.style.setProperty('--rarity', RARITY_COLORS[item.rarity]); label.title = 'Walk near this relic to collect it, or press E';
    const drop = { id: item.id, item, model, label, labelWidth: 160, age: 0 };
    label.addEventListener('click', () => { if (this.active) this.collect(drop, 3); });
    this.hud.lootLayer.append(label); drop.labelWidth = label.offsetWidth; this.drops.push(drop);
    if (item.rarity === 'Legendary') { this.audio.play('rare'); this.hud.toast('A legendary relic has fallen', 'Legendary', 5000); this.effects.ring(position, 0xf8a253, .5, 1.2, 5); }
  }

  private updateDrops(dt: number): void {
    const placedLabels: { x: number; y: number; width: number }[] = [];
    for (const drop of [...this.drops]) {
      drop.age += dt;
      drop.model.children[0].rotation.y = this.time * 1.8;
      drop.model.children[0].position.y = .42 + Math.sin(this.time * 3 + drop.id) * .09;
      const projected = drop.model.position.clone(); projected.y = 1.1; projected.project(this.camera);
      const x = (projected.x * .5 + .5) * window.innerWidth;
      let y = (-projected.y * .5 + .5) * window.innerHeight;
      const distance = drop.model.position.distanceTo(this.hero.root.position);
      drop.label.hidden = this.phase !== 'playing' || this.panel !== null || distance > 12 || projected.z > 1 || x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight;
      if (!drop.label.hidden) {
        for (let attempt = 0; attempt < 12; attempt++) {
          if (!placedLabels.some(other => Math.abs(other.x - x) < (other.width + drop.labelWidth) / 2 + 5 && Math.abs(other.y - y) < 25)) break;
          y -= 25;
        }
        placedLabels.push({ x, y, width: drop.labelWidth });
      }
      drop.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (dt > 0 && drop.age > .4 && distance < 1.6) this.collect(drop, 1.65);
    }
  }

  private pickupNearest(): void {
    const drop = this.drops.filter(d => d.model.position.distanceTo(this.hero.root.position) < 3).sort((a, b) => a.model.position.distanceTo(this.hero.root.position) - b.model.position.distanceTo(this.hero.root.position))[0];
    if (drop) this.collect(drop, 3); else this.hud.toast('No relics within reach', 'system');
  }

  private collect(drop: GroundLoot, radius: number): void {
    if (drop.model.position.distanceTo(this.hero.root.position) > radius) { this.hud.toast('Move closer to collect this relic', 'system'); return; }
    if (this.inventory.length >= MAX_INVENTORY) {
      if (this.fullWarning <= 0) { this.hud.toast('Inventory full · press I to equip or salvage', 'warning'); this.fullWarning = 4; }
      return;
    }
    const index = this.drops.indexOf(drop); if (index === -1) return;
    this.inventory.push(drop.item); this.drops.splice(index, 1);
    this.effects.burst(drop.model.position, new THREE.Color(RARITY_COLORS[drop.item.rarity]).getHex(), 12, 2);
    this.disposeObject(drop.model); drop.label.remove(); this.audio.play('loot');
    this.hud.toast(`${drop.item.name} · I to equip`, drop.item.rarity); this.hud.update();
  }

  private disposeObject(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => mat.dispose());
      }
    });
  }
}
