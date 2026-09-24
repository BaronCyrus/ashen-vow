import * as THREE from 'three';

interface Particle { position: THREE.Vector3; velocity: THREE.Vector3; life: number; maxLife: number; color: THREE.Color; }
interface Ring { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; maxLife: number; expansion: number; }
interface Floater { element: HTMLDivElement; position: THREE.Vector3; life: number; maxLife: number; }

export class Effects {
  private readonly count = 700;
  private particles: Particle[] = [];
  private cursor = 0;
  private geometry = new THREE.BufferGeometry();
  private positions = new Float32Array(this.count * 3);
  private colors = new Float32Array(this.count * 3);
  private rings: Ring[] = [];
  private floaters: Floater[] = [];
  private projected = new THREE.Vector3();
  readonly points: THREE.Points;

  constructor(private scene: THREE.Scene, private layer: HTMLElement) {
    for (let i = 0; i < this.count; i++) this.particles.push({ position: new THREE.Vector3(0, -100, 0), velocity: new THREE.Vector3(), life: 0, maxLife: 1, color: new THREE.Color() });
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({ size: .12, vertexColors: true, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(position: THREE.Vector3, color: number, count = 20, force = 4): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor++ % this.count];
      p.position.copy(position); p.position.y += .8;
      const a = Math.random() * Math.PI * 2;
      const speed = force * (.3 + Math.random() * .7);
      p.velocity.set(Math.cos(a) * speed, Math.random() * force + .5, Math.sin(a) * speed);
      p.life = p.maxLife = .3 + Math.random() * .65;
      p.color.set(color);
    }
  }

  ring(position: THREE.Vector3, color: number, radius: number, duration = .5, expansion = 1, arc = Math.PI * 2, angle = 0): void {
    const geometry = new THREE.RingGeometry(radius * .87, radius, 64, 1, angle, arc);
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position); ring.position.y = .08;
    this.scene.add(ring);
    this.rings.push({ mesh: ring, life: duration, maxLife: duration, expansion });
  }

  slash(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.ring(position, 0xfce1aa, 3.1, .18, .25, 2.35, Math.atan2(-direction.z, direction.x) - 1.175);
    const ring = this.rings[this.rings.length - 1];
    ring.mesh.position.y = .78;
    this.ring(position, 0xffffff, 2.6, .13, .4, 2.15, Math.atan2(-direction.z, direction.x) - 1.075);
    this.rings[this.rings.length - 1].mesh.position.y = .75;
  }

  text(position: THREE.Vector3, text: string, color: string, large = false): void {
    if (this.floaters.length > 42) this.floaters.shift()!.element.remove();
    const element = document.createElement('div');
    element.className = `damage-number${large ? ' critical' : ''}`;
    element.textContent = text; element.style.color = color;
    this.layer.append(element);
    const point = position.clone(); point.y += 2.35; point.x += (Math.random() - .5) * .4;
    this.floaters.push({ element, position: point, life: 1, maxLife: 1 });
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i]; p.life -= dt;
      if (p.life > 0) {
        p.position.addScaledVector(p.velocity, dt); p.velocity.y -= dt * 8;
        if (p.position.y < .03) { p.position.y = .03; p.velocity.multiplyScalar(.4); p.velocity.y = Math.abs(p.velocity.y); }
        this.positions.set(p.position.toArray(), i * 3);
        const fade = p.life / p.maxLife;
        this.colors[i * 3] = p.color.r * fade; this.colors[i * 3 + 1] = p.color.g * fade; this.colors[i * 3 + 2] = p.color.b * fade;
      } else this.positions[i * 3 + 1] = -100;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt;
      const progress = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(1 + progress * r.expansion);
      r.mesh.material.opacity = Math.max(0, 1 - progress) * .8;
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.life -= dt; f.position.y += dt * 1.15;
      this.projected.copy(f.position).project(camera);
      const x = (this.projected.x * .5 + .5) * window.innerWidth;
      const y = (-this.projected.y * .5 + .5) * window.innerHeight;
      f.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      f.element.style.opacity = String(Math.min(1, f.life * 3));
      if (f.life <= 0) { f.element.remove(); this.floaters.splice(i, 1); }
    }
  }

  clear(): void {
    this.floaters.forEach(f => f.element.remove()); this.floaters = [];
    this.rings.forEach(r => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }); this.rings = [];
    this.particles.forEach(p => { p.life = 0; });
  }
}
