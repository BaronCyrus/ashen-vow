import { SLOTS } from './types';
import type { Item, Rarity, Slot, Stats } from './types';

let serial = 0;
const names: Record<Slot, string[]> = {
  weapon: ['Graveblade', 'Oathbreaker', 'Dusksplitter', 'Widow’s Edge'],
  armor: ['Sepulchral Plate', 'Ashen Hauberk', 'Penitent’s Mantle', 'Dreadmail'],
  boots: ['Pilgrim’s Treads', 'Gravewalkers', 'Hollow Greaves', 'Cindersteps'],
  amulet: ['Mourning Star', 'Votive Pendant', 'Saint’s Remnant', 'Bloodstone'],
};
const suffixes = ['of the Fallen', 'of Embers', 'of the Vigil', 'of Ruin', 'of the Hollow'];
const legendary: Record<Slot, string> = { weapon: 'The Last Benediction', armor: 'Shroud of the First Martyr', boots: 'Footsteps of the Forgotten', amulet: 'Heart of the Dying Sun' };
const flavors: Record<Rarity, string> = {
  Common: 'Even the forgotten leave something behind.',
  Magic: 'A whisper of the old rites lingers within.',
  Rare: 'The sanctum remembers the hand that bore it.',
  Legendary: 'Some vows outlive the gods who heard them.',
};
const random = <T>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

export function rollItem(wave: number, force?: Rarity, slotOverride?: Slot): Item {
  const roll = Math.random();
  const rarity = force ?? (roll < .035 + Math.min(wave * .004, .065) ? 'Legendary' : roll < .23 ? 'Rare' : roll < .64 ? 'Magic' : 'Common');
  const rank = ['Common', 'Magic', 'Rare', 'Legendary'].indexOf(rarity);
  const slot = slotOverride ?? random(SLOTS);
  const power = (1 + (wave - 1) * .16) * (1 + rank * .42);
  const stats: Partial<Stats> = {};
  if (slot === 'weapon') stats.damage = Math.round((7 + Math.random() * 5) * power);
  if (slot === 'armor') { stats.maxHp = Math.round((18 + Math.random() * 14) * power); stats.armor = Math.round(2 * power); }
  if (slot === 'boots') stats.speed = Number((.04 + .025 * power).toFixed(3));
  if (slot === 'amulet') stats.crit = Number((.025 + .012 * power).toFixed(3));
  const affixes: (keyof Stats)[] = ['damage', 'maxHp', 'crit', 'speed', 'haste', 'armor'].filter(k => !(k in stats)) as (keyof Stats)[];
  for (let i = 0; i < rank; i++) {
    const index = Math.floor(Math.random() * affixes.length);
    const key = affixes.splice(index, 1)[0];
    const ranges: Stats = { damage: 4.5, maxHp: 14, crit: .022, speed: .026, haste: .04, armor: 1.8 };
    const value = ranges[key] * power * (.8 + Math.random() * .5);
    stats[key] = key === 'damage' || key === 'maxHp' || key === 'armor' ? Math.max(1, Math.round(value)) : Number(value.toFixed(3));
  }
  return { id: ++serial, name: rank === 3 ? legendary[slot] : `${random(names[slot])}${rank > 0 ? ` ${random(suffixes)}` : ''}`, slot, rarity, level: wave, stats, flavor: flavors[rarity] };
}

export function starterWeapon(): Item {
  return { id: ++serial, name: 'Vowkeeper', slot: 'weapon', rarity: 'Common', level: 1, stats: { damage: 6 }, flavor: 'The blade you carried into the dark.' };
}

export function deriveStats(level: number, equipment: Partial<Record<Slot, Item>>): Stats {
  const stats: Stats = { damage: 18 + (level - 1) * 3, maxHp: 120 + (level - 1) * 15, crit: .08, speed: 0, haste: 0, armor: 0 };
  for (const item of Object.values(equipment)) for (const [key, value] of Object.entries(item?.stats ?? {})) stats[key as keyof Stats] += value;
  stats.crit = Math.min(stats.crit, .7);
  stats.speed = Math.min(stats.speed, .65);
  stats.haste = Math.min(stats.haste, 1.5);
  return stats;
}

export const salvageValue = (item: Item): number => ([5, 12, 28, 65][['Common', 'Magic', 'Rare', 'Legendary'].indexOf(item.rarity)]) + item.level * 2;
