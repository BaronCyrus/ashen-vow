import type { Group, Mesh, Vector3 } from 'three';

export type Slot = 'weapon' | 'armor' | 'boots' | 'amulet';
export type Rarity = 'Common' | 'Magic' | 'Rare' | 'Legendary';
export type EnemyKind = 'stalker' | 'acolyte' | 'warden';
export type Phase = 'ready' | 'playing' | 'paused' | 'dead';
export interface Stats {
  damage: number;
  maxHp: number;
  crit: number;
  speed: number;
  haste: number;
  armor: number;
}
export interface Item {
  id: number;
  name: string;
  slot: Slot;
  rarity: Rarity;
  level: number;
  stats: Partial<Stats>;
  flavor: string;
}
export interface Enemy {
  id: number;
  kind: EnemyKind;
  model: Group;
  body: Group;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  cooldown: number;
  windup: number;
  attackTarget: Vector3;
  flash: number;
  age: number;
  elite: boolean;
  affix: string;
  healthBar: Mesh;
  warning: Mesh;
}
export interface GroundLoot {
  id: number;
  item: Item;
  model: Group;
  label: HTMLButtonElement;
  labelWidth: number;
  age: number;
}
export interface Projectile {
  model: Mesh;
  velocity: Vector3;
  damage: number;
  life: number;
}
export interface RunRecord { wave: number; kills: number; score: number; }
export const RARITY_COLORS: Record<Rarity, string> = {
  Common: '#c7c4b8', Magic: '#6caeff', Rare: '#efce73', Legendary: '#f29148',
};
export const SLOTS: Slot[] = ['weapon', 'armor', 'boots', 'amulet'];
export const STAT_LABELS: Record<keyof Stats, string> = {
  damage: 'Damage', maxHp: 'Max. vitality', crit: 'Critical chance', speed: 'Movement bonus', haste: 'Attack speed bonus', armor: 'Armor',
};
export function formatStat(key: keyof Stats, value: number): string {
  return key === 'crit' || key === 'haste' || key === 'speed' ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
}
