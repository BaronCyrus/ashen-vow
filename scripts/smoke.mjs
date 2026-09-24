import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';

// Real Chromium input + deterministic simulation checks. Debug access is dev-only.
const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(root, '.qa');
mkdirSync(resolve(artifacts, 'tmp'), { recursive: true });
process.env.TMPDIR = resolve(artifacts, 'tmp');
const errors = [];
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const devPort = Number(process.env.TEST_PORT ?? 5186);
let serverOutput = '';
const dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
dev.stdout.on('data', chunk => { serverOutput += chunk; });
dev.stderr.on('data', chunk => { serverOutput += chunk; });
let context;
let staticServer;

try {
  for (let i = 0; i < 100; i++) {
    if (dev.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`);
    try { const response = await fetch(`http://127.0.0.1:${devPort}/`); if (response.ok) break; } catch { /* Wait for startup. */ }
    await new Promise(r => setTimeout(r, 100));
  }
  const chromePath = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
  context = await chromium.launchPersistentContext(resolve(artifacts, 'test-browser'), {
    ...(chromePath ? { executablePath: chromePath } : {}), headless: true,
    viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    env: { ...process.env, XDG_CONFIG_HOME: resolve(artifacts, 'config'), XDG_CACHE_HOME: resolve(artifacts, 'cache') },
  });
  const page = context.pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${devPort}/?debug`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ashen?.renderer.info.render.frame > 1);
  check('WebGL scene initializes', await page.locator('#game-canvas').isVisible());
  check('Start screen is ready', await page.locator('#start-button').isVisible());
  await page.screenshot({ path: resolve(artifacts, 'welcome.png') });
  await page.evaluate(() => {
    const g = window.__ashen;
    g.renderer.setAnimationLoop(null);
    window.__step = seconds => {
      for (let i = 0; i < Math.ceil(seconds * 60); i++) {
        const dt = Math.min(1 / 60, seconds - i / 60);
        g.time += dt;
        if (g.active) { g.update(dt); g.updateDrops(dt); }
        g.effects.update(g.panel ? 0 : dt, g.camera);
      }
      g.updateCamera(1); g.hud.update(); g.renderer.render(g.scene, g.camera);
    };
    window.__clearEnemies = () => { g.enemies.forEach(e => g.disposeObject(e.model)); g.enemies.length = 0; g.projectiles.forEach(p => g.scene.remove(p.model)); g.projectiles.length = 0; g.spawnRemaining = 1; g.spawnTimer = 10000; };
  });
  await page.locator('#start-button').click();
  check('Start button begins a run', await page.evaluate(() => window.__ashen.phase === 'playing' && window.__ashen.hp === 120));
  const beforeMove = await page.evaluate(() => window.__ashen.hero.root.position.toArray());
  await page.keyboard.down('w');
  await page.evaluate(() => window.__step(1));
  await page.keyboard.up('w');
  const afterMove = await page.evaluate(() => window.__ashen.hero.root.position.toArray());
  check('WASD moves the player in screen space', Math.hypot(beforeMove[0] - afterMove[0], beforeMove[2] - afterMove[2]) > 5);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.__step(8));
  await page.keyboard.up('ArrowRight');
  check('Arena boundary keeps the player on the floor', await page.evaluate(() => window.__ashen.hero.root.position.length() < 18));

  await page.evaluate(() => {
    const g = window.__ashen; g.start(); window.__clearEnemies(); g.autoAttack = false; g.input.hasPointer = false;
    g.aim.set(0, 0, -1); g.wave = 1;
    const e = g.spawnEnemy('stalker', false); e.model.position.copy(g.hero.root.position); e.model.position.z -= 2; e.hp = 10; e.age = 1;
  });
  await page.mouse.move(720, 440); await page.mouse.down();
  await page.evaluate(() => { const g = window.__ashen; g.input.hasPointer = false; g.aim.set(0, 0, -1); window.__step(.02); });
  await page.mouse.up();
  check('Mouse attacks kill enemies and award XP and gold', await page.evaluate(() => { const g = window.__ashen; return g.kills === 1 && g.xp > 0 && g.gold > 0; }));
  check('First kill drops a magic relic', await page.evaluate(() => window.__ashen.drops.some(d => d.item.rarity === 'Magic')));
  await page.keyboard.press('e');
  check('E collects nearby loot', await page.evaluate(() => window.__ashen.inventory.length === 1));

  await page.evaluate(async () => {
    const { rollItem } = await import('/src/game/loot.ts');
    window.__roll = rollItem;
    const g = window.__ashen;
    g.inventory = [rollItem(2, 'Rare', 'weapon'), rollItem(3, 'Magic', 'boots'), rollItem(3, 'Legendary', 'armor')];
  });
  await page.keyboard.press('i');
  check('Inventory pauses the run', await page.evaluate(() => window.__ashen.panel === 'inventory' && !window.__ashen.active));
  const pausedTime = await page.evaluate(() => window.__ashen.elapsed);
  await page.evaluate(() => window.__step(2));
  check('Timers stop while inventory is open', (await page.evaluate(() => window.__ashen.elapsed)) === pausedTime);
  await page.locator('#inventory-grid button').first().click();
  check('Item comparison displays affixes and equipped item', (await page.locator('#item-detail').innerText()).includes('Compared with Vowkeeper'));
  const oldDps = await page.evaluate(() => window.__ashen.dps);
  await page.locator('#equip-selected').click();
  check('Equipping swaps gear and increases DPS', await page.evaluate(old => window.__ashen.equipment.weapon.rarity === 'Rare' && window.__ashen.inventory.length === 3 && window.__ashen.dps > old, oldDps));
  await page.locator('#inventory-grid button').nth(1).dblclick();
  check('Double-click equips into an empty slot', await page.evaluate(() => !!window.__ashen.equipment.boots && window.__ashen.inventory.length === 2));
  await page.locator('#inventory-grid button').first().click();
  const goldBefore = await page.evaluate(() => window.__ashen.gold);
  await page.locator('#salvage-selected').click();
  check('Salvage removes one item and awards gold', await page.evaluate(gold => window.__ashen.inventory.length === 1 && window.__ashen.gold > gold, goldBefore));
  await page.evaluate(() => { const g = window.__ashen; g.gold = 100; g.potionCharges = 1; g.hud.refresh(); });
  await page.locator('#buy-potion').click();
  check('Flask vendor spends 30 gold for one charge', await page.evaluate(() => window.__ashen.gold === 70 && window.__ashen.potionCharges === 2));
  check('Equipment swaps preserve health percentage without free healing', await page.evaluate(() => {
    const g = window.__ashen;
    g.hp = g.stats.maxHp * .4;
    const armor = g.inventory.find(i => i.slot === 'armor');
    g.equip(armor.id);
    const first = g.hp / g.stats.maxHp;
    const replacement = window.__roll(1, 'Common', 'armor');
    g.inventory.push(replacement); g.equip(replacement.id); g.equip(armor.id);
    return Math.abs(first - .4) < .00001 && Math.abs(g.hp / g.stats.maxHp - .4) < .00001;
  }));
  await page.evaluate(() => {
    const g = window.__ashen; g.inventory = ['Common', 'Magic', 'Rare', 'Legendary'].flatMap(rarity => ['weapon', 'armor', 'amulet'].map(slot => window.__roll(3, rarity, slot))); g.hud.refresh();
  });
  await page.locator('#inventory-grid button').last().click();
  await page.screenshot({ path: resolve(artifacts, 'inventory.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const g = window.__ashen; g.dropItem(window.__roll(2, 'Rare'), g.hero.root.position.clone()); });
  const fullDropCount = await page.evaluate(() => window.__ashen.drops.length);
  await page.keyboard.press('e');
  check('Full inventory preserves ground loot', await page.evaluate(count => window.__ashen.inventory.length === 12 && window.__ashen.drops.length === count, fullDropCount));

  await page.evaluate(() => {
    const g = window.__ashen; g.start(); window.__clearEnemies(); g.autoAttack = false; g.input.hasPointer = false; g.wave = 1;
    const e = g.spawnEnemy('warden', false); e.model.position.copy(g.hero.root.position); e.model.position.z += 3; e.age = 1;
    g.shoot(e); window.__targetEnemy = e;
  });
  await page.keyboard.press('1');
  check('Cinder Nova damages enemies and clears projectiles', await page.evaluate(() => window.__targetEnemy.hp < window.__targetEnemy.maxHp && window.__ashen.projectiles.length === 0 && window.__ashen.novaCooldown === 8));
  const novaHp = await page.evaluate(() => window.__targetEnemy.hp);
  await page.keyboard.press('1');
  check('Skill cooldown prevents repeat casts', (await page.evaluate(() => window.__targetEnemy.hp)) === novaHp);
  await page.evaluate(() => { window.__clearEnemies(); const g = window.__ashen; g.aim.set(0, 0, -1); window.__dashStart = g.hero.root.position.clone(); });
  await page.keyboard.press('Space');
  check('Dash grants invulnerability', await page.evaluate(() => { const g = window.__ashen; const hp = g.hp; g.hurt(40); return g.hp === hp && g.invincible > 0; }));
  await page.evaluate(() => window.__step(.5));
  check('Dash moves the hero and enters cooldown', await page.evaluate(() => window.__ashen.hero.root.position.distanceTo(window.__dashStart) > 4 && window.__ashen.dashCooldown > 0));
  await page.evaluate(() => { const g = window.__ashen; g.hp = 40; g.invincible = 0; });
  await page.keyboard.press('q');
  check('Healing consumes a charge and restores vitality', await page.evaluate(() => window.__ashen.hp === 106 && window.__ashen.potionCharges === 2));

  await page.evaluate(() => {
    const g = window.__ashen; window.__clearEnemies(); g.hero.root.position.set(0, 0, 3); g.hp = 120; g.invincible = 0;
    const e = g.spawnEnemy('acolyte', false); e.model.position.set(0, 0, -5); e.age = 1; e.cooldown = 0;
    window.__step(2);
  });
  check('Ranged enemies fire projectiles that damage the hero', await page.evaluate(() => window.__ashen.hp < 120));
  await page.evaluate(() => {
    const g = window.__ashen; window.__clearEnemies(); g.hp = 120; g.invincible = 0; g.dashCooldown = 0; g.aim.set(0, 0, -1);
    const e = g.spawnEnemy('warden', false); e.model.position.copy(g.hero.root.position); e.model.position.z += 1.8; e.age = 1; e.cooldown = 0;
    window.__step(.05); window.__tank = e;
  });
  check('Heavy enemies telegraph their attack', await page.evaluate(() => window.__tank.windup > 0 && window.__tank.warning.material.opacity > 0));
  await page.keyboard.press('2'); await page.evaluate(() => window.__step(1.1));
  check('Dashing away avoids a telegraphed slam', await page.evaluate(() => window.__ashen.hp === 120));

  const waves = await page.evaluate(() => {
    const g = window.__ashen; g.start(); g.autoAttack = false; const results = [];
    for (let wave = 1; wave <= 3; wave++) {
      g.waveCountdown = 0; window.__step(.02); window.__step(6);
      results.push({ wave: g.wave, count: g.enemies.length, kinds: [...new Set(g.enemies.map(e => e.kind))], elite: g.enemies.some(e => e.elite) });
      if (wave === 3) break;
      for (const e of [...g.enemies]) g.hitEnemy(e, 100000, false);
      window.__step(.02);
    }
    return results;
  });
  check('Waves grow and introduce all three enemy types', waves[1].count > waves[0].count && waves[1].kinds.length === 3);
  check('Third wave spawns an elite', waves[2].wave === 3 && waves[2].elite);
  await page.evaluate(() => {
    const g = window.__ashen;
    g.hero.root.position.set(0, 0, 3); g.input.hasPointer = false;
    const positions = [[-3, -1], [3, -3], [-5, 4], [5, 4], [-6, -3], [0, -7], [7, 0], [-3, 7], [5, -7], [7, 6]];
    g.enemies.forEach((e, i) => { e.model.position.set(positions[i % positions.length][0], 0, positions[i % positions.length][1]); e.age = 1; e.model.scale.setScalar(1); });
    const elite = g.enemies.find(e => e.elite); if (elite) { elite.model.position.set(4, 0, 1); g.hitEnemy(elite, 30, true); }
    for (const [i, rarity] of ['Magic', 'Rare', 'Legendary'].entries()) g.dropItem(window.__roll(3, rarity), g.hero.root.position.clone().set(-2 + i * 3, 0, 6));
    g.effects.slash(g.hero.root.position, g.aim);
    g.hud.get('announcement').classList.remove('visible');
    g.updateCamera(1); g.updateDrops(0); g.effects.update(.01, g.camera); g.hud.refresh(); g.renderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: resolve(artifacts, 'combat.png') });
  await page.evaluate(() => { const g = window.__ashen; const elite = g.enemies.find(e => e.elite); g.hitEnemy(elite, 100000, true); });
  check('Elite guarantees a legendary drop', await page.evaluate(() => window.__ashen.drops.filter(d => d.item.rarity === 'Legendary').length >= 2));
  check('XP grants levels and increases base stats', await page.evaluate(() => window.__ashen.level > 1 && window.__ashen.stats.maxHp > 120));
  await page.keyboard.press('Escape');
  check('Escape pauses and opens the pause screen', await page.locator('#pause-panel').isVisible());
  await page.locator('#pause-help').click();
  check('Controls are accessible from pause', await page.locator('#help-panel').isVisible());
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  check('Mute hotkey updates audio and UI', await page.evaluate(() => window.__ashen.audio.muted) && (await page.locator('#sound-button').getAttribute('aria-pressed')) === 'true');
  await page.evaluate(() => { const g = window.__ashen; g.invincible = 0; g.hurt(100000); });
  check('Death opens a complete run summary', await page.locator('#death-panel').isVisible() && Number((await page.locator('#final-score').innerText()).replaceAll(',', '')) > 0);
  check('Best run persists to localStorage', await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-vow-best')).score > 0));
  await page.screenshot({ path: resolve(artifacts, 'game-over.png') });
  await page.keyboard.press('Enter');
  check('Restart resets run, gear, inventory, skills, and health', await page.evaluate(() => { const g = window.__ashen; return g.phase === 'playing' && g.level === 1 && g.wave === 0 && g.kills === 0 && g.gold === 0 && g.inventory.length === 0 && g.hp === 120 && g.potionCharges === 3 && g.novaCooldown === 0 && g.best.score > 0; }));

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => { const g = window.__ashen; g.renderer.render(g.scene, g.camera); });
  check('HUD stays in the viewport at 1024 × 768', await page.locator('.bottom-hud').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  await page.screenshot({ path: resolve(artifacts, 'compact.png') });

  // Serve the exact dist directory under a project path: absolute asset URLs fail here.
  check('Production build exists', existsSync(resolve(root, 'dist/index.html')));
  const prefix = '/test-repository/';
  staticServer = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix) || pathname.includes('..')) { response.writeHead(404); response.end(); return; }
    const file = resolve(root, 'dist', pathname.slice(prefix.length) || 'index.html');
    try {
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type }); response.end(readFileSync(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(r => staticServer.listen(0, '127.0.0.1', r));
  const prodURL = `http://127.0.0.1:${staticServer.address().port}${prefix}`;
  const failedRequests = [];
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(response.url()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${prodURL}?debug`, { waitUntil: 'networkidle' });
  check('Production loads from a repository subdirectory', await page.locator('#start-button').isVisible());
  check('Production has no debug hook', await page.evaluate(() => !('__ashen' in window)));
  await page.locator('#start-button').click();
  await page.keyboard.press('i');
  check('Production controls and inventory work', await page.locator('#inventory-panel').isVisible());
  check('No broken production asset paths', failedRequests.length === 0);
  check('No browser runtime or console errors', errors.length === 0);
  console.log(`\n${checks.length} checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  console.error('Browser errors:', errors);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (staticServer) await new Promise(r => staticServer.close(r));
  dev.kill('SIGTERM');
}
