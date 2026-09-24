export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  muted = false;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = .18;
      this.master.connect(this.context.destination);
    }
    void this.context.resume().catch(() => undefined);
  }

  toggle(): boolean { this.muted = !this.muted; return this.muted; }

  private tone(frequency: number, end: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + .008);
    envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  play(name: 'swing' | 'hit' | 'hurt' | 'kill' | 'loot' | 'rare' | 'equip' | 'nova' | 'dash' | 'heal' | 'level' | 'wave' | 'death'): void {
    if (name === 'swing') this.tone(210, 45, .1, 'sawtooth', .22);
    if (name === 'hit') { this.tone(115, 30, .12, 'triangle', .65); this.tone(720, 120, .05, 'square', .13); }
    if (name === 'hurt') this.tone(150, 42, .23, 'sawtooth', .45);
    if (name === 'kill') this.tone(85, 25, .21, 'triangle', .6);
    if (name === 'loot' || name === 'equip') { this.tone(610, 810, .18, 'sine', .5); this.tone(920, 1200, .28, 'sine', .3, .07); }
    if (name === 'rare') [392, 494, 587, 784].forEach((note, i) => this.tone(note, note, .6, 'sine', .4, i * .12));
    if (name === 'nova') { this.tone(65, 220, .5, 'sawtooth', .45); this.tone(320, 36, .6, 'triangle', .8); }
    if (name === 'dash') this.tone(140, 650, .18, 'triangle', .3);
    if (name === 'heal') [330, 440, 660].forEach((note, i) => this.tone(note, note * 1.03, .4, 'sine', .4, i * .09));
    if (name === 'level') [294, 370, 440, 587].forEach((note, i) => this.tone(note, note, .65, 'triangle', .3, i * .1));
    if (name === 'wave') { this.tone(73, 73, .8, 'triangle', .6); this.tone(110, 110, .9, 'sine', .4, .18); }
    if (name === 'death') [146, 110, 73].forEach((note, i) => this.tone(note, note * .7, 1.1, 'triangle', .45, i * .25));
  }
}
