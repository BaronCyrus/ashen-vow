import type { Game } from '../game/Game';
import { formatStat, RARITY_COLORS, SLOTS, STAT_LABELS } from '../game/types';
import type { Item, Stats } from '../game/types';
import { salvageValue } from '../game/loot';
import { icon } from './icons';

const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const timeString = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export class HUD {
  readonly effectsLayer: HTMLDivElement;
  readonly lootLayer: HTMLDivElement;
  private root: HTMLDivElement;
  private map: HTMLCanvasElement;
  private elements = new Map<string, HTMLElement>();
  private announceTimer = 0;
  private toastSerial = 0;
  private selectedId: number | null = null;

  constructor(container: HTMLElement, private game: Game) {
    this.root = document.createElement('div'); this.root.id = 'interface';
    this.root.innerHTML = `
      <div class="vignette"></div><div class="grain"></div><div id="damage-flash"></div>
      <div id="loot-layer"></div><div id="effects-layer"></div>
      <header class="masthead">
        <div class="brand">${icon('sigil', 'brand-sigil')}<div><span class="wordmark">ASHEN VOW</span><span class="brand-caption">A DESCENT INTO THE HOLLOW</span></div></div>
        <div class="location"><div class="eyebrow">THE FORSAKEN DEPTHS</div><div class="location-name"><span></span>The Hollow Sanctum<span></span></div></div>
        <div class="top-actions"><button id="help-button" class="icon-button" title="Controls (H)" aria-label="View controls">?</button><button id="sound-button" class="icon-button" title="Toggle sound (M)" aria-label="Toggle sound">${icon('sound')}</button><button id="pause-button" class="icon-button" title="Pause (Escape)" aria-label="Pause game">${icon('pause')}</button></div>
      </header>
      <aside id="encounter" class="encounter">
        <div class="eyebrow"><i class="tiny-diamond"></i> THE ENDLESS DESCENT</div>
        <h2 id="objective-title">Purge the sanctum</h2>
        <div class="encounter-line"><span id="wave-label">WAVE 01</span><span id="enemy-count">The fallen awaken</span></div>
        <div class="encounter-track"><div id="wave-progress"></div></div>
        <p id="objective-hint">Slay the fallen. Claim their relics.</p>
        <div class="run-details"><span>${icon('skull')} <b id="kill-count">0</b> slain</span><span id="run-time">0:00</span></div>
      </aside>
      <aside class="minimap-panel"><div class="minimap-heading"><span>SANCTUM <b id="map-wave">I</b></span><i class="map-live"></i></div><div class="minimap-frame"><canvas id="minimap" width="180" height="150" aria-label="Minimap: red enemies, gold loot, white player"></canvas><span class="map-north">N</span></div><div class="minimap-footer"><span id="map-status">UNHALLOWED GROUND</span><span>◆</span></div></aside>
      <section id="welcome" class="welcome">
        <div class="welcome-kicker"><span></span> THE LIGHT ENDS HERE</div>
        <h1>Every vow<br>has a <em>price.</em></h1>
        <p>The sanctum has fallen. Its dead have not.<br>Take up your blade, claim forgotten relics,<br>and hold back the dark.</p>
        <button id="start-button" class="primary-button">ENTER THE SANCTUM ${icon('arrow')}</button>
        <div class="enter-hint">or press <kbd>ENTER</kbd></div>
        <div class="welcome-features"><span>ENDLESS WAVES</span><i>✧</i><span>POWERFUL RELICS</span><i>✧</i><span>ONE LAST VOW</span></div>
        <div id="welcome-best" class="welcome-best"></div>
      </section>
      <div id="announcement" class="announcement" aria-live="polite"><div class="announcement-rule">✦</div><h2 id="announcement-title"></h2><p id="announcement-subtitle"></p></div>
      <div id="elite-bar" class="elite-bar" hidden><div><span id="elite-name"></span><span>ELITE</span></div><div class="elite-track"><i id="elite-fill"></i></div></div>
      <div id="toasts" class="toasts" aria-live="polite"></div>
      <div id="control-hint" class="control-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><i>·</i><span>MOUSE AIM</span><i>·</i><span>HOLD CLICK TO STRIKE</span></div>
      <footer class="bottom-hud">
        <div class="hud-ornament"><span></span>✦<span></span></div>
        <div class="hud-main">
          <div class="vitals"><div class="health-orb"><div id="orb-fill" class="orb-fill"></div><div class="orb-glass"></div>${icon('sigil')}<span id="orb-level">1</span></div><div class="vitals-copy"><div class="eyebrow">VITALITY</div><div class="hp-value"><b id="hp-current">120</b><span>/ <span id="hp-max">120</span></span></div><div class="hp-track" role="progressbar" aria-label="Vitality" id="hp-bar"><div id="hp-fill"></div></div><span class="character-class">THE OATHBOUND</span></div></div>
          <div class="skill-tray">
            <button class="ability attack-ability" id="attack-button" title="Vowkeeper — hold left mouse to cleave. Auto-strike attacks nearby enemies." aria-label="Toggle auto-strike"><kbd>LMB</kbd>${icon('sword')}<span class="ability-name">CLEAVE</span><span id="auto-dot" class="auto-dot"></span></button>
            <button class="ability" id="nova-button" title="Cinder Nova (1) — blast nearby enemies and destroy projectiles. 8s cooldown." aria-label="Cast Cinder Nova"><kbd>1</kbd>${icon('nova')}<span class="ability-name">CINDER NOVA</span><span id="nova-cooldown" class="cooldown"></span></button>
            <button class="ability" id="dash-button" title="Wraithstep (2 or Space) — dash with brief invulnerability. 3.2s cooldown." aria-label="Use Wraithstep"><kbd>2</kbd>${icon('dash')}<span class="ability-name">WRAITHSTEP</span><span id="dash-cooldown" class="cooldown"></span></button>
            <button class="ability potion-ability" id="potion-button" title="Crimson Flask (Q) — restore 55% vitality. 4s cooldown." aria-label="Drink Crimson Flask"><kbd>Q</kbd>${icon('potion')}<span class="ability-name">FLASK</span><span id="potion-charges" class="charge-count">3</span><span id="potion-cooldown" class="cooldown"></span></button>
            <span class="skill-divider"></span>
            <button class="ability inventory-ability" id="inventory-button" title="Inventory (I or Tab) — equip and compare relics. Pauses the run." aria-label="Open inventory"><kbd>I</kbd>${icon('bag')}<span class="ability-name">INVENTORY</span><span id="bag-count" class="charge-count">0</span></button>
          </div>
          <div class="battle-stats"><div class="power-stat"><span class="eyebrow">DAMAGE / SEC</span><strong id="dps-value">53</strong></div><div class="gold-stat">${icon('coin')}<span id="gold-value">0</span><span class="gold-caption">GOLD</span></div></div>
        </div>
        <div class="experience-row"><span id="level-label">LEVEL 1</span><div id="xp-bar" class="xp-track" role="progressbar" aria-label="Experience"><div id="xp-fill"></div></div><span id="xp-value">0 / 75 XP</span></div>
      </footer>
      <div class="corner-left">DARKNESS IS PATIENT. <span>SO ARE YOU.</span></div><button id="auto-button" class="auto-toggle"><kbd>F</kbd> AUTO-STRIKE <b id="auto-status">ON</b></button>
      <div id="panel-backdrop" class="panel-backdrop" hidden></div>
      <section id="inventory-panel" class="inventory-panel panel" hidden aria-label="Inventory" role="dialog" aria-modal="true">
        <div class="panel-heading"><div><div class="eyebrow">WHAT THE FALLEN LEAVE BEHIND</div><h2>Your relics</h2></div><button id="close-inventory" class="close-button" aria-label="Close inventory">${icon('close')}<kbd>ESC</kbd></button></div>
        <div class="inventory-layout"><div class="loadout-column"><div class="section-label">EQUIPPED</div><div id="equipment-slots" class="equipment-slots"></div><div class="section-label character-label">THE OATHBOUND <span id="inventory-level">LV. 1</span></div><div id="character-stats" class="character-stats"></div></div><div class="pack-column"><div class="section-label">SATCHEL <span id="inventory-capacity">0 / 12</span></div><div id="inventory-grid" class="inventory-grid"></div><p id="inventory-message" class="inventory-tip" aria-live="polite">Select a relic to compare. Double-click to equip.</p><div id="item-detail" class="item-detail"></div></div></div>
        <div class="inventory-footer"><div>${icon('coin')} <b id="inventory-gold">0</b> <span>GOLD</span></div><button id="buy-potion" class="secondary-button">${icon('potion')} REFILL FLASK <span>30 G</span></button><span class="paused-caption">✧ RUN PAUSED</span></div>
      </section>
      <section id="pause-panel" class="center-panel panel" role="dialog" aria-modal="true" aria-label="Game paused" hidden><div class="modal-sigil">${icon('sigil')}</div><div class="eyebrow">A MOMENT BETWEEN BATTLES</div><h2>The dark can wait.</h2><p>Your vow remains unbroken.</p><button id="resume-button" class="primary-button">RETURN TO THE SANCTUM ${icon('arrow')}</button><button id="pause-help" class="text-button">VIEW CONTROLS</button><span class="modal-key">ESC TO RESUME</span></section>
      <section id="help-panel" class="center-panel help-panel panel" role="dialog" aria-modal="true" aria-label="Controls" hidden><div class="panel-heading"><div><div class="eyebrow">A PILGRIM’S GUIDE</div><h2>Keep your vow.</h2></div><button id="close-help" class="close-button" aria-label="Close controls">${icon('close')}</button></div><div class="controls-list"><div><span>Move</span><span><kbd>WASD</kbd> / <kbd>ARROWS</kbd></span></div><div><span>Aim & cleave</span><span>MOUSE / HOLD <kbd>LMB</kbd></span></div><div><span>Cinder Nova <small>Area blast · 8s</small></span><kbd>1</kbd></div><div><span>Wraithstep <small>Invulnerable dash · 3.2s</small></span><span><kbd>2</kbd> / <kbd>SPACE</kbd></span></div><div><span>Crimson Flask <small>Restore 55% vitality</small></span><kbd>Q</kbd></div><div><span>Inventory & equipment</span><span><kbd>I</kbd> / <kbd>TAB</kbd></span></div><div><span>Collect nearby relic</span><kbd>E</kbd></div><div><span>Toggle auto-strike</span><kbd>F</kbd></div><div><span>Pause / Sound</span><span><kbd>ESC</kbd> / <kbd>M</kbd></span></div></div><p class="help-note">Walk over relics to collect them. Gold and experience are collected on kills. Every third wave brings an elite with a legendary relic. Clear a wave to recover vitality and a flask charge.</p><button id="help-done" class="secondary-button">MY VOW IS UNDERSTOOD ${icon('arrow')}</button></section>
      <section id="death-panel" class="center-panel death-panel panel" role="dialog" aria-modal="true" aria-label="Run summary" hidden><div class="death-sigil">${icon('skull')}</div><div class="eyebrow">THE SANCTUM CLAIMS ANOTHER</div><h2>A vow in ashes.</h2><p>Even in defeat, the dark remembers.</p><div class="death-score"><span class="eyebrow">SOULSCORE</span><strong id="final-score">0</strong><span id="record-notice"></span></div><div class="run-summary"><div><strong id="final-wave">0</strong><span>WAVES CLEARED</span></div><div><strong id="final-kills">0</strong><span>FALLEN SLAIN</span></div><div><strong id="final-time">0:00</strong><span>TIME SURVIVED</span></div></div><button id="restart-button" class="primary-button">SWEAR ANOTHER VOW ${icon('arrow')}</button><span class="modal-key">ENTER TO BEGIN AGAIN</span></section>
      <div id="small-screen-note">Best played on a desktop with a keyboard & mouse.</div>
    `;
    container.append(this.root);
    this.effectsLayer = this.get('effects-layer') as HTMLDivElement;
    this.lootLayer = this.get('loot-layer') as HTMLDivElement;
    this.map = this.get('minimap') as HTMLCanvasElement;
    this.bind('start-button', () => game.start());
    this.bind('restart-button', () => game.start());
    this.bind('resume-button', () => game.closePanel());
    this.bind('inventory-button', () => game.action('KeyI'));
    this.bind('close-inventory', () => game.closePanel());
    this.bind('help-button', () => game.action('KeyH'));
    this.bind('pause-help', () => game.openPanel('help'));
    this.bind('close-help', () => game.closePanel());
    this.bind('help-done', () => game.closePanel());
    this.bind('sound-button', () => game.action('KeyM'));
    this.bind('pause-button', () => game.action('Escape'));
    this.bind('nova-button', () => game.nova());
    this.bind('dash-button', () => game.dash());
    this.bind('potion-button', () => game.heal());
    this.bind('auto-button', () => game.action('KeyF'));
    this.bind('attack-button', () => game.action('KeyF'));
    this.bind('buy-potion', () => game.buyPotion());
    this.root.addEventListener('pointerdown', event => { if ((event.target as HTMLElement).closest('button')) this.game.audio.unlock(); });
  }

  private get(id: string): HTMLElement {
    if (!this.elements.has(id)) this.elements.set(id, this.root.querySelector<HTMLElement>(`#${id}`)!);
    return this.elements.get(id)!;
  }

  private bind(id: string, action: () => void): void { this.get(id).addEventListener('click', () => { action(); this.get(id).blur(); }); }
  private text(id: string, value: string): void { const el = this.get(id); if (el.textContent !== value) el.textContent = value; }

  refresh(): void {
    const g = this.game;
    this.root.classList.toggle('is-ready', g.phase === 'ready');
    this.root.classList.toggle('has-panel', !!g.panel || g.phase === 'dead');
    this.get('welcome').hidden = g.phase !== 'ready' || !!g.panel;
    this.get('encounter').hidden = g.phase === 'ready';
    this.get('inventory-panel').hidden = g.panel !== 'inventory';
    this.get('pause-panel').hidden = g.panel !== 'pause';
    this.get('help-panel').hidden = g.panel !== 'help';
    this.get('death-panel').hidden = g.phase !== 'dead' || g.panel === 'help';
    this.get('panel-backdrop').hidden = !g.panel && g.phase !== 'dead';
    this.get('control-hint').hidden = g.phase !== 'playing' || !!g.panel;
    this.get('announcement').classList.toggle('obscured', !!g.panel || g.phase !== 'playing');
    this.get('sound-button').innerHTML = icon(g.audio.muted ? 'mute' : 'sound');
    this.get('sound-button').setAttribute('aria-label', g.audio.muted ? 'Unmute sound' : 'Mute sound');
    this.get('sound-button').setAttribute('aria-pressed', String(g.audio.muted));
    this.get('auto-button').setAttribute('aria-pressed', String(g.autoAttack));
    this.text('auto-status', g.autoAttack ? 'ON' : 'OFF');
    this.get('auto-dot').classList.toggle('off', !g.autoAttack);
    this.text('welcome-best', g.best.score ? `BEST VOW  ·  ${g.best.score.toLocaleString()} SOULSCORE` : 'DESKTOP · KEYBOARD + MOUSE · SOUND RECOMMENDED');
    if (g.panel === 'inventory') this.renderInventory();
    if (g.phase === 'dead') {
      this.text('final-score', g.score.toLocaleString()); this.text('final-wave', String(g.clearedWaves)); this.text('final-kills', String(g.kills)); this.text('final-time', timeString(g.elapsed));
      this.text('record-notice', g.score >= g.best.score && g.score > 0 ? '✦ A NEW PERSONAL BEST ✦' : `PERSONAL BEST  ${g.best.score.toLocaleString()}`);
    }
    this.update();
  }

  update(): void {
    const g = this.game;
    const ratio = Math.max(0, Math.min(1, g.hp / g.stats.maxHp));
    this.text('hp-current', `${Math.ceil(g.hp)}`); this.text('hp-max', `${g.stats.maxHp}`);
    this.get('hp-fill').style.width = `${ratio * 100}%`; this.get('orb-fill').style.height = `${ratio * 100}%`;
    this.get('hp-bar').setAttribute('aria-valuenow', String(Math.ceil(g.hp))); this.get('hp-bar').setAttribute('aria-valuemax', String(g.stats.maxHp));
    this.root.classList.toggle('low-health', ratio < .3 && g.phase === 'playing');
    this.text('orb-level', String(g.level)); this.text('level-label', `LEVEL ${g.level}`);
    this.get('xp-fill').style.width = `${g.xp / g.xpRequired * 100}%`;
    this.get('xp-bar').setAttribute('aria-valuenow', String(g.xp)); this.get('xp-bar').setAttribute('aria-valuemax', String(g.xpRequired));
    this.text('xp-value', `${g.xp} / ${g.xpRequired} XP`);
    this.text('dps-value', String(g.dps)); this.text('gold-value', g.gold.toLocaleString());
    this.text('bag-count', String(g.inventory.length)); this.text('potion-charges', String(g.potionCharges));
    this.text('kill-count', String(g.kills)); this.text('run-time', timeString(g.elapsed));
    this.text('wave-label', `WAVE ${String(Math.max(1, g.wave)).padStart(2, '0')}`);
    const remaining = g.enemies.length + g.spawnRemaining;
    const intermission = remaining === 0 && g.waveCountdown > 0;
    this.text('enemy-count', intermission ? `Next wave in ${Math.ceil(g.waveCountdown)}s` : `${remaining} remaining`);
    this.text('objective-title', intermission ? 'Gather the remnants' : 'Purge the sanctum');
    this.text('objective-hint', intermission ? 'A brief respite. Equip your spoils.' : 'Slay the fallen. Claim their relics.');
    this.get('wave-progress').style.width = `${intermission ? g.waveCountdown / 7 * 100 : Math.max(0, remaining / Math.min(44, 5 + Math.floor(g.wave * 1.75))) * 100}%`;
    this.text('map-wave', String(Math.max(1, g.wave)).padStart(2, '0'));
    this.text('map-status', g.phase === 'ready' ? 'UNHALLOWED GROUND' : intermission ? 'A MOMENT OF GRACE' : 'HOSTILES WITHIN');
    for (const [name, cd, max] of [['nova', g.novaCooldown, 8], ['dash', g.dashCooldown, 3.2], ['potion', g.potionCooldown, 4]] as const) {
      const el = this.get(`${name}-cooldown`); el.hidden = cd <= 0; el.textContent = cd > 0 ? cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd)) : '';
      el.style.setProperty('--remaining', `${cd / max * 100}%`);
      this.get(`${name}-button`).classList.toggle('on-cooldown', cd > 0);
    }
    this.get('potion-button').classList.toggle('empty-flask', g.potionCharges === 0);
    const elite = g.enemies.find(e => e.elite);
    this.get('elite-bar').hidden = !elite || g.phase !== 'playing' || !!g.panel;
    if (elite) { this.text('elite-name', `${elite.affix} Warden`); this.get('elite-fill').style.width = `${elite.hp / elite.maxHp * 100}%`; }
    this.drawMap();
  }

  announce(title: string, subtitle: string, danger = false): void {
    clearTimeout(this.announceTimer);
    this.text('announcement-title', title); this.text('announcement-subtitle', subtitle);
    const el = this.get('announcement'); el.classList.remove('visible');
    void el.offsetWidth; el.classList.add('visible'); el.classList.toggle('danger', danger);
    this.announceTimer = window.setTimeout(() => el.classList.remove('visible'), 3600);
  }

  toast(message: string, type: string, duration = 3300): void {
    if (this.game.panel === 'inventory') {
      this.text('inventory-message', message);
      this.get('inventory-message').style.color = type === 'warning' ? '#d4967d' : '#b9b494';
    }
    const el = document.createElement('div'); el.className = `toast ${type.toLowerCase()}`;
    el.innerHTML = `${icon(type === 'warning' ? 'skull' : type === 'system' ? 'sigil' : 'amulet')}<span>${escape(message)}</span>`;
    el.dataset.toast = String(++this.toastSerial);
    if (type in RARITY_COLORS) el.style.setProperty('--toast-color', RARITY_COLORS[type as keyof typeof RARITY_COLORS]);
    const parent = this.get('toasts'); parent.append(el);
    while (parent.children.length > 4) parent.firstElementChild?.remove();
    window.setTimeout(() => { el.classList.add('leaving'); window.setTimeout(() => el.remove(), 300); }, duration);
  }

  flash(): void { const el = this.get('damage-flash'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  closeTooltip(): void {
    this.selectedId = null;
    this.text('inventory-message', 'Select a relic to compare. Double-click to equip.');
    this.get('inventory-message').style.color = '';
  }

  private renderInventory(): void {
    const g = this.game;
    this.text('inventory-capacity', `${g.inventory.length} / 12`); this.text('inventory-gold', String(g.gold)); this.text('inventory-level', `LV. ${g.level}`);
    this.get('equipment-slots').innerHTML = SLOTS.map(slot => {
      const item = g.equipment[slot];
      return `<button class="equipment-slot ${item ? item.rarity.toLowerCase() : 'empty'}" data-equipped="${slot}" style="--rarity:${item ? RARITY_COLORS[item.rarity] : '#66675c'}"><span class="equipment-icon">${icon(slot)}</span><span><small>${slot.toUpperCase()}</small><strong>${item ? escape(item.name) : 'Empty slot'}</strong>${item ? `<em>${item.rarity}</em>` : '<em>Find a relic in the sanctum</em>'}</span></button>`;
    }).join('');
    this.get('equipment-slots').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
      const item = g.equipment[button.dataset.equipped as keyof typeof g.equipment];
      if (item) { this.selectedId = null; this.renderItemDetail(item, true); }
    }));
    this.get('character-stats').innerHTML = (Object.entries(g.stats) as [keyof Stats, number][]).map(([key, value]) => `<div><span>${STAT_LABELS[key]}</span><b>${formatStat(key, value)}</b></div>`).join('');
    this.get('inventory-grid').innerHTML = Array.from({ length: 12 }, (_, index) => {
      const item = g.inventory[index];
      return item ? `<button class="item-slot ${item.rarity.toLowerCase()} ${this.selectedId === item.id ? 'selected' : ''}" data-item="${item.id}" style="--rarity:${RARITY_COLORS[item.rarity]}" aria-label="${escape(item.rarity + ' ' + item.name)}" title="${escape(item.name)}">${icon(item.slot)}<span>${item.slot.toUpperCase()}</span><i class="item-level">${item.level}</i><i class="rarity-pips">${'◆'.repeat(['Common', 'Magic', 'Rare', 'Legendary'].indexOf(item.rarity) + 1)}</i></button>` : `<div class="item-slot empty-slot"><span>✧</span></div>`;
    }).join('');
    this.get('inventory-grid').querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedId = Number(button.dataset.item);
        this.get('inventory-grid').querySelectorAll('button').forEach(slot => slot.classList.toggle('selected', slot === button));
        const item = g.inventory.find(i => i.id === this.selectedId);
        if (item) this.renderItemDetail(item);
      });
      button.addEventListener('dblclick', () => { const id = Number(button.dataset.item); this.selectedId = null; g.equip(id); });
    });
    const selected = g.inventory.find(i => i.id === this.selectedId);
    if (selected) this.renderItemDetail(selected);
    else { this.selectedId = null; this.get('item-detail').innerHTML = `<div class="empty-detail">${icon('amulet')}<span>Power sleeps in forgotten things.</span><p>Select a relic above to inspect its properties.</p><div class="rarity-legend"><span>COMMON</span><span>MAGIC</span><span>RARE</span><span>LEGENDARY</span></div></div>`; }
    this.get('buy-potion').setAttribute('title', `${g.potionCharges}/3 charges · 30 gold per charge`);
  }

  private renderItemDetail(item: Item, equipped = false): void {
    const old = this.game.equipment[item.slot];
    const keys = [...new Set([...Object.keys(item.stats), ...(!equipped ? Object.keys(old?.stats ?? {}) : [])])] as (keyof Stats)[];
    this.get('item-detail').innerHTML = `<div class="detail-heading" style="--rarity:${RARITY_COLORS[item.rarity]}"><span class="detail-icon">${icon(item.slot)}</span><div><span class="eyebrow">${item.rarity.toUpperCase()} ${item.slot.toUpperCase()} · TIER ${item.level}</span><h3>${escape(item.name)}</h3></div>${equipped ? '<span class="equipped-tag">EQUIPPED</span>' : ''}</div><div class="affix-list">${keys.map(key => {
      const value = item.stats[key] ?? 0, difference = value - (old?.stats[key] ?? 0);
      return `<div><span>${value > 0 ? '+' : ''}${formatStat(key, value)} ${STAT_LABELS[key]}</span>${!equipped ? `<b class="${difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral'}">${difference ? `${difference > 0 ? '↑ +' : '↓ −'}${formatStat(key, Math.abs(difference))}` : '—'}</b>` : ''}</div>`;
    }).join('')}</div>${!equipped ? `<div class="comparison-caption">Compared with ${old ? escape(old.name) : `empty ${item.slot} slot`}</div>` : ''}<p class="item-flavor">“${item.flavor}”</p>${!equipped ? `<div class="item-actions"><button id="equip-selected" class="secondary-button">EQUIP RELIC ${icon('arrow')}</button><button id="salvage-selected" class="salvage-button">SALVAGE <span>+${salvageValue(item)} G</span></button></div>` : ''}`;
    this.root.querySelector('#equip-selected')?.addEventListener('click', () => { this.selectedId = null; this.game.equip(item.id); });
    this.root.querySelector('#salvage-selected')?.addEventListener('click', () => { this.selectedId = null; this.game.salvage(item.id); });
  }

  private drawMap(): void {
    const ctx = this.map.getContext('2d')!;
    const g = this.game;
    ctx.clearRect(0, 0, 180, 150);
    ctx.save(); ctx.translate(90, 75);
    const scale = 3.4;
    ctx.fillStyle = '#192023'; ctx.strokeStyle = '#626055'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; const x = Math.cos(a) * 65, y = Math.sin(a) * 65; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#373e3b';
    for (const offset of [-10, 10]) { ctx.beginPath(); ctx.moveTo(offset, -61); ctx.lineTo(offset, 61); ctx.moveTo(-61, offset); ctx.lineTo(61, offset); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.stroke();
    for (const obstacle of g.arena.obstacles) { ctx.fillStyle = '#6b6b5b'; ctx.fillRect(obstacle.x * scale - 2, obstacle.z * scale - 2, 4, 4); }
    if (g.phase !== 'ready') {
      for (const enemy of g.enemies) { ctx.fillStyle = enemy.elite ? '#e5ad64' : enemy.kind === 'acolyte' ? '#b993cf' : '#ba6055'; ctx.beginPath(); ctx.arc(enemy.model.position.x * scale, enemy.model.position.z * scale, enemy.elite ? 3.2 : 2, 0, Math.PI * 2); ctx.fill(); }
      for (const drop of g.drops) { ctx.fillStyle = RARITY_COLORS[drop.item.rarity]; ctx.fillRect(drop.model.position.x * scale - 1.5, drop.model.position.z * scale - 1.5, 3, 3); }
    }
    ctx.translate(g.hero.root.position.x * scale, g.hero.root.position.z * scale);
    ctx.rotate(-g.hero.root.rotation.y);
    ctx.fillStyle = '#eee3c2'; ctx.shadowColor = '#e3c887'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-3.5, -3); ctx.lineTo(0, -1); ctx.lineTo(3.5, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
