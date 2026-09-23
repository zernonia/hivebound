# Hivebound 🐝

A cozy, relaxing bee exploration game for the browser. Fly hex to hex across a soft diorama meadow, uncover the map, and fill your journal.

This is the **feel-first scaffold**: art direction, movement, camera, minimap, journal and accessibility. Combat, catching, breeding and the quest line come later.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (.output/)
npm run typecheck
```

Stack: **Nuxt 4 · TresJS 5 · three.js r186 · Pinia 4**. The game route is client-only (`routeRules['/'].ssr = false`), so other pages like a landing page or Beedex can still be server-rendered later.

## Controls

| Action | Keyboard | Mouse / touch |
|---|---|---|
| Fly one hex | `Q` `W` `E` / `A` `S` `D` (hex directions), arrow keys (← → zig-zag straight) | On-screen hex pad |
| Fly to a tile | — | Tap/click a tile or the minimap |
| Stop route | `Space` | — |
| Look around (narrated) | `L` | Look button |
| Journal | `J` | Journal button |
| Fly home | `H` | Home button |
| Enter / leave the hive | `I` | Enter hive / Leave buttons, or tap the hive |
| Minimap size | `M` | Expand button |
| Zoom | `+` / `−` | Scroll, pinch, +/− buttons |
| Settings | `Esc` / `O` | Gear button |

Hold a movement key to keep flying.

## Project layout

```
app/
  pages/index.vue            Game page: keyboard input, <html> a11y classes, layout
  components/game/
    GameCanvas.vue           <TresCanvas> config (tone mapping, shadows, DPR)
    GameScene.vue            Camera rig, lights, pointer input, flight model + animation loop
  components/ui/             HUD, Minimap, JournalPanel, SettingsPanel, MovePad,
                             Announcer (screen-reader live region), UiDialog, icons
  game/                      Plain three.js builders (no Vue)
    worldView.ts             Instanced tiles + props, fog-of-war reveal animation
    props.ts                 Tuft/flower/tree/cloud kinds, hive, point-of-interest set pieces
    bee.ts                   Procedural bee: `BeeLook` presets + accessory anchors
    beeVariants.ts           Named variants (honey, queen, nocturnal); preview with ?bee=queen
    accessories.ts           Accessories that attach to the bee's anchors (crown…)
    hiveView.ts              Inside the hive: comb cells, Queen, walls, motes, trays
    buildings.ts             Hive building models (press, kitchen, wax works, larder)
    geometry.ts              Rounded "cushion" hex, rings, blob shadow
  stores/
    game.ts                  Position, route queue, discovery, journal, narration, save/load
    settings.ts              Accessibility & comfort settings (persisted)
    hive.ts                  Pouch, store, tile supplies, buildings, upgrades, offline catch-up
  utils/
    hex.ts                   Axial flat-top hex math, BFS pathfinding
    world.ts                 Seeded world generation, terrain, points of interest + journal text
    resources.ts             Resources, which tiles yield them, buildings, recipes, upgrades
    palette.ts               Default + colour-vision-friendly palettes
    noise.ts                 Seeded RNG + value noise
```

### How movement works
- `game.queue` holds the hexes still to fly through. Taps call `travelTo()` (BFS path) and keys call `step()`, which buffers at most one extra hex so held keys don't overshoot.
- `GameScene` runs a smooth flight model: an invisible "carrot" glides along the route at a constant speed and the bee chases it with exponential smoothing, so it curves through corners instead of stopping at each hex. It climbs from hover to cruise altitude while travelling, follows the terrain height, banks into turns and pitches with speed (bank and bob are off with reduced motion).
- Each time the carrot reaches a hex, `game.arrive()` reveals fog (radius 2), triggers journal entries and saves. When the queue empties, a held key or pad button queues the next hex, so flight continues without a pause.
- The world is deterministic (`WORLD_SEED`), so saves only store position, discovered tiles and the journal.

### Gathering and the hive
- **Gather** by stopping on a resource tile: meadow gives nectar, flower patches pollen, water water, forest resin (bigger landmarks hold more). The bee hovers and gathers one unit at a time into its pouch. Tiles regrow over time.
- **Unload** by reaching the doorstep; **go inside** with `I` or the Enter hive button (the bee flies in through the skep door; an iris wipe hides the scene swap).
- **Inside**, cells around the Queen hold buildings: the Honey Press (nectar → honey), Bee Bread Kitchen (pollen + water → bee bread), Wax Works (resin + honey → wax) and Larder Comb (more storage). Sealed outer cells open with wax. Upgrades: bigger pouch, stronger wings, quicker gathering.
- Buildings run in real time and **catch up while the game is closed** (up to 8 hours); finished goods wait in each building's tray (10 max) until collected.
- Everything inside is also reachable from the hive panel's cell map, which is plain buttons for keyboard and screen readers.

## Accessibility built in
- **Reduce motion** (follows the OS setting by default): no bob, squash, pop-ins or springy UI, and a calmer camera.
- **High contrast** (follows `prefers-contrast`), **text size** (100 / 120 / 140%), and a **colour-vision-friendly palette**. Terrain and minimap markers differ by shape and brightness as well as hue.
- **Screen reader narration**: a polite live region announces routes, arrivals, new journal entries and a full **Look around** description (what's in each hex direction, plus the nearest unvisited place).
- Everything is playable with the **keyboard alone**. Dialogs are native `<dialog>` elements, so focus is trapped and `Esc` closes them. Touch targets are at least 44–56px.
- The **on-screen hex pad** is on by default for touch screens, and anyone can turn it on for motor accessibility.

## Next steps
- Swap procedural props for Blender GLBs (same instancing approach; keep materials soft and slightly rough)
- Audio: ambient loop, buzz while flying, gathering hum, discovery chime (with volume setting)
- Balance pass on resource yields, recipe times and upgrade costs after playtesting
- Chapter 1 quest line and NPC critters, feeding into the journal
- Catching and the Beedex, which extends the journal's "Places" tab

## Deploy (Cloudflare Workers, auto-deploy from GitHub)

The game builds to static files (`nuxt generate` → `.output/public`) and is served by a Worker with static assets (`wrangler.jsonc`).

One-time setup: in the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, pick this repo, and use:

- Build command: `npx nuxt generate`
- Deploy command: `npx wrangler deploy`

Every push to `main` then deploys to production automatically. Pushes to other branches get preview URLs.

Manual deploy: `npm run deploy`.
