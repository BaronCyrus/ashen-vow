import { Vector2 } from 'three';

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  pointer = new Vector2();
  attacking = false;
  hasPointer = false;

  constructor(canvas: HTMLCanvasElement, onAction: (key: string) => void) {
    window.addEventListener('keydown', event => {
      if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) { this.pressed.add(event.code); onAction(event.code); }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('pointermove', event => {
      this.pointer.set(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
      this.hasPointer = true;
    });
    canvas.addEventListener('pointerdown', event => { if (event.button === 0) this.attacking = true; });
    window.addEventListener('pointerup', () => { this.attacking = false; });
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  movement(): Vector2 {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const y = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    return new Vector2(x, y).normalize();
  }

  clear(): void { this.keys.clear(); this.pressed.clear(); this.attacking = false; }
}
