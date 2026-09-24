# Ashen Vow — The Hollow Sanctum

A complete, browser-playable, dark fantasy loot-grind ARPG prototype. Play an oathbound knight in a ruined cathedral, cut through escalating waves of the fallen, and turn their relics into a stronger build. Every third wave summons an elite warden carrying a legendary item. Death ends the run; your personal best remains.

Built with **Vite, TypeScript, and Three.js**, without a UI framework, game engine, backend, or external asset service. All meshes, stone textures, sigils, lighting, effects, and sounds are generated locally. The production site needs only the contents of `dist/`.

## Run locally

Use Node.js **20.19+** (Node 22 LTS also works) and npm.

```sh
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Click **Enter the Sanctum** or press **Enter**. The first click enables audio. Use a desktop browser with WebGL 2 and hardware acceleration.

## Controls

| Control | Action |
| --- | --- |
| **WASD / Arrow keys** | Move relative to the screen |
| **Mouse** | Aim |
| **Hold left click** | Cleave in the aimed direction |
| **F** | Toggle auto-strike; enabled initially, attacks the closest enemy in melee range |
| **1** | Cinder Nova: area damage, knockback, and projectile destruction; 8-second cooldown |
| **2 / Space** | Wraithstep: dash in your movement direction, or toward your aim while stationary; brief invulnerability; 3.2-second cooldown |
| **Q** | Crimson Flask: restore 55% maximum vitality; 3 charges; 4-second cooldown |
| **E** | Pick up the nearest relic within reach |
| **I / Tab** | Open or close inventory; the run pauses |
| **Escape** | Pause / close the current panel |
| **H** | Controls and gameplay guide |
| **M** | Mute / unmute |
| **Enter** | Begin a run or restart after death |

Walking over loot also collects it. Gold and XP are awarded automatically on kills. Click a ground nameplate to collect it when nearby. In the inventory, select an item to compare it with your equipped gear, then click **Equip Relic**; double-clicking a satchel item also equips it. **Salvage** turns unwanted gear into gold. **Refill Flask** buys a charge for 30 gold.

## The run

- **Three enemy types:** fast horned Stalkers rush and claw; purple-robed Acolytes maintain distance and fire projectiles; armored Wardens wind up heavy area attacks. Their warning circles give time to dodge.
- **Endless escalation:** larger waves, stronger enemies, and every-third-wave elites. Ironbound elites resist damage; Frenzied elites move faster. The active elite has a dedicated health bar.
- **Four rarities:** Common, Magic, Rare, and Legendary. Colored nameplates, rotating relics, and light beams identify loot. Higher tiers gain more random affixes.
- **Four equipment slots:** weapon, armor, boots, and amulet; **12 satchel slots**. Gear can improve damage, maximum health, critical chance, movement, attack speed, and armor. Comparison arrows include stats lost by replacing an item.
- **Progression:** XP levels increase base damage and vitality and fully heal you. A cleared wave restores 30% vitality, replenishes one flask charge, awards a relic, and grants a seven-second respite.
- **Combat feedback:** sword arcs, critical numbers, hit flashes, sparks, blood pools, death bursts, skill shockwaves, light camera shake, and synthesized Web Audio cues.
- **Atmosphere:** an isometric 3D crypt with gothic arches, carved pillars, tombs, candles, flickering torches, fog, embers, crimson banners, and a ritual floor.
- **Complete HUD:** vitality orb and bar, XP, level, DPS, wave progress, kill count, time, enemy/loot minimap, cooldowns, gold, and loot notifications.
- **Run summary and best score:** kills, completed waves, time, and soulscore. Best runs use the `ashen-vow-best` localStorage key. No storage permission is needed to play; if storage is unavailable, only persistence is skipped.
- Opening inventory, pausing, or losing browser focus freezes gameplay. Loot stays on the ground if the satchel is full. Ground drops, particles, and blood decals are bounded for long runs.

Soulscore is `100 × kills + 500 × cleared waves + 2 × held gold + 100 × levels gained`. Critical chance, movement bonuses, and attack-speed bonuses are capped to keep late-game gear manageable. Each new run starts with a basic Vowkeeper sword; gear is not carried between runs.

## Production build

```sh
npm install
npm run build
npm run preview
```

`build` first type-checks the project, then creates **`dist/index.html`** and hashed JS/CSS bundles. `preview` serves that build locally, normally on `http://localhost:4173`. Use HTTP(S), rather than opening `index.html` as a `file://` URL, because browsers restrict ES modules on local file URLs.

The only runtime dependency is Three.js. Playwright is a development-only verification dependency. Nothing is fetched from a third-party CDN at game runtime, including fonts or audio.

## GitHub Pages deployment

The included `.github/workflows/deploy.yml` builds and publishes `dist/` using GitHub Pages Actions. To use it in your own repository:

1. Add the source and `package-lock.json` to your repository. Keep `node_modules/` and `dist/` ignored.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. The workflow runs on `main`, or manually from the Actions tab. If your default branch has another name, update `on.push.branches` in the workflow.
4. Once the workflow succeeds, use the Pages URL shown by GitHub.

### Base paths

This project deliberately uses **`base: './'`** in `vite.config.ts`. Every production asset path is relative, so the same `dist/` works at both:

- User/organization site: `https://USERNAME.github.io/`
- Project site: `https://USERNAME.github.io/REPO_NAME/`

Keep the trailing slash on a subdirectory URL. There is no client-side router, so no history fallback or `404.html` rewrite is necessary. You can also choose an explicit Vite base and rebuild:

```ts
// Project site:
base: '/REPO_NAME/'

// User site or root of a custom domain:
base: '/'
```

Always deploy the **contents of `dist/`**, including its `assets/` directory and `sigil.svg`. Do not point Pages at unbuilt TypeScript source. The same output can be uploaded to any static CDN or web host. See the [official Vite static-deployment guide](https://vite.dev/guide/static-deploy.html#github-pages) for the hosting workflow and explicit-base alternatives.

## Browser verification

```sh
npm run build
npm run test:smoke
```

The smoke runner starts a temporary local Vite server, drives Chromium with real keyboard/mouse input, and uses deterministic simulation to check combat, XP, equipment, comparison, double-click equip, full inventories, salvage, flasks, cooldowns, projectile damage, telegraphed attacks, wave escalation, elites, death, persistence, restart, and compact desktop layout. It also serves **the actual production build under `/test-repository/`** to catch broken asset paths and runtime errors.

The runner automatically uses a system Chrome/Chromium installation on Linux when available. Set `CHROME_PATH` to a browser executable on other systems, or install Playwright’s browser with `npx playwright install chromium`. Set `TEST_PORT` if port 5186 is occupied. Screenshots and browser test data go into the ignored `.qa/` directory. The `?debug` inspection hook exists only in Vite development mode; the production bundle does not expose it.

## Project layout

```text
src/
  main.ts              Bootstrap and WebGL fallback
  style.css            HUD, panels, responsive layout, and effects
  game/
    Game.ts            Run state, combat, AI, waves, equipment, persistence
    types.ts           Shared data types and rarity/stat formatting
    loot.ts            Item generation and derived player stats
    input.ts           Keyboard and mouse handling
    audio.ts           Synthesized sound effects
  entities/models.ts   Procedural knight and enemy meshes
  world/
    Arena.ts           Crypt architecture, lighting, obstacles, floor, blood
    Effects.ts         Bounded particle pool, sword arcs, floating numbers
  ui/
    HUD.ts             HUD, minimap, inventory, comparisons, overlays
    icons.ts           Inline SVG interface icons
public/sigil.svg        Local favicon
scripts/smoke.mjs       Browser and production-path verification
```

This is an endless-arena prototype designed for desktop keyboard and mouse. The interface adapts to smaller screens, but touch movement is not implemented. There are no external art or audio assets, accounts, remote services, or networked gameplay.
