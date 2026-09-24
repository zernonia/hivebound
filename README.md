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
| Action: enter the hive, befriend, talk to the Queen, collect, unseal, leave | `F` | The floating prompt over the tile, or tap the hive |
| Befriending dance: catch in the green | `F` (`Esc` backs away) | Tap the ring |
| Inside the hive: quick build on an empty cell | `B` (then ↑/↓ or 1–5, `Enter`) | Build… button |
| Inside the hive: colony / upgrades | `C` / `U` | Colony / Upgrades buttons |
| Inside the hive: pick a cell | Movement keys | Tap a cell |
| Performance overlay (dev, or `?perf`) | `` ` `` | × on the overlay |
| Minimap size | `M` | Expand button |
| Zoom | `+` / `−` | Scroll, pinch, +/− buttons |
| Settings | `Esc` / `O` | Gear button |

Hold a movement key to keep flying.

## Project layout

```
app/
  audio/engine.ts            Synthesised music + sound effects (Web Audio, no audio files)
  composables/useGameAudio.ts   Turns game events into sounds; volume + scene mood
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
    accessories.ts           Accessories for the bee: the Queen's crown and all the wearable keepsakes
    hiveView.ts              Inside the hive: comb cells, Queen, walls, motes, trays
    resourceMarkers.ts       Floating badges over neighbouring / hovered tiles showing what can be gathered
    buildings.ts             Hive building models (press, kitchen, wax works, larder, bee room)
    goldenSparkles.ts        Glowing golden pollen spots out in the world
    beePool.ts               Pooled models for other bees (0.8× scale) + frustum check
    geometry.ts              Rounded "cushion" hex, rings, blob shadow
  stores/
    game.ts                  Position, route queue, discovery, journal, narration, save/load
    settings.ts              Accessibility & comfort settings (persisted)
    hive.ts                  Pouch, store, tile supplies, buildings, upgrades, offline catch-up
    colony.ts                Wild encounters, befriending dance, helper bees, jobs + trips
    queen.ts                 The Queen's requests: progress, handing in, rewards, map reveals
  utils/
    hex.ts                   Axial flat-top hex math, BFS pathfinding
    world.ts                 Seeded world generation, terrain, points of interest + journal text
    resources.ts             Resources, which tiles yield them, buildings, recipes, upgrades
    species.ts               Wild bee species: look, habitat, favourite job, speed, dance
    requests.ts              Chapter one of the Queen's requests + endless "little wishes"
    keepsakes.ts             Wearable keepsakes: where each is found, and its slot
    golden.ts                Which far-off tiles sparkle with golden pollen
    daylight.ts              The 24-minute day and night clock
    palette.ts               Default + colour-vision-friendly palettes
    noise.ts                 Seeded RNG + value noise
```

### How the world is drawn
- **World props** are procedural and instanced: each kind (tufts, flowers, tulips, lavender, round trees, pines, fruit, pebbles, mushrooms, lily pads and blooms, clouds) is one merged, vertex-coloured geometry drawn as a single `InstancedMesh`. A per-vertex `tint` attribute controls which parts take the per-instance colour, so petals and leaves vary while centres and trunks stay put. Tilt, hue and variants come from a seeded per-tile random stream, so the world looks the same on every load.

### How movement works
- `game.queue` holds the hexes still to fly through. Taps call `travelTo()` (BFS path) and keys call `step()`, which buffers at most one extra hex so held keys don't overshoot.
- `GameScene` runs a smooth flight model: an invisible "carrot" glides along the route at a constant speed and the bee chases it with exponential smoothing, so it curves through corners instead of stopping at each hex. It climbs from hover to cruise altitude while travelling, follows the terrain height, banks into turns and pitches with speed (bank and bob are off with reduced motion).
- Each time the carrot reaches a hex, `game.arrive()` reveals fog (radius 2), triggers journal entries and saves. When the queue empties, a held key or pad button queues the next hex, so flight continues without a pause.
- The world is deterministic (`WORLD_SEED`), so saves only store position, discovered tiles and the journal.

### A bigger island that streams in
- The island is radius 24 (~1,800 tiles), generated from the seed at runtime. Only tiles within 3 of anywhere discovered are built into the scene; new land rises out of the mist as the bee explores, so the GPU only draws what's nearby.

### Gathering and the hive
- **Gather** by stopping on a resource tile: meadow gives nectar, flower patches pollen, water water, forest resin (bigger landmarks hold more). The bee hovers and gathers one unit at a time into its pouch. Tiles regrow over time.
- **Badges** float over the tiles next to the bee (and the one under the mouse) that you can gather from: each resource has its own shape and colour; a faded, smaller badge means the tile is picked clean and regrowing.
- **Gathered tiles thin out:** each flower, lily pad or mushroom on a tile is part of its supply, so they disappear as you gather and grow back as the tile regrows; the tile's colour also dulls slightly while it's low.
- **Unload** by reaching any of the six tiles around the hive; **go inside** with `F` (or tap the floating prompt / the hive). The bee flies in through the skep door; an iris wipe hides the scene swap.
- **One action key:** `F` does whatever the floating prompt over the tile says: enter the hive, collect a building's tray, unseal a cell, or leave through the doorway.
- **Inside**, cells around the Queen hold buildings: the Honey Press (nectar → honey), Bee Bread Kitchen (pollen + water → bee bread), Wax Works (resin + honey → wax) and Larder Comb (more storage). Sealed outer cells open with 1 wax each, so the hive can spread out early. Upgrades: bigger pouch, stronger wings, quicker gathering.
- Buildings run in real time and **catch up while the game is closed** (up to 8 hours); finished goods wait in each building's tray (10 max) until collected.
- Each visit starts at the **doorway**; you steer the bee from there, and leave by coming back to the doorway (`F`). Nothing flies you around on its own.
- The hive card (top right) shows the store and the cell you're looking at; the selected cell is announced to screen readers. Bigger pages open on demand: **B** build, **C** colony, **U** upgrades (or the buttons bottom-left).

### Helper bees
- **Wild bees** hover over their home terrain: Bumbles on meadows, Masons on flowers, Dew Bees on water, Carpenters in forests. The Wild Nest always has a friendly Bumble for your first friend; elsewhere encounters come and go every few minutes.
- **Befriend** one with `F`: a marker circles a ring, and you press `F` (or tap the ring) while it's inside the green arc. You get three tries; each species dances at its own speed. A soft tick plays as the marker enters the green, so it works by ear too. *Easier befriending* in Settings slows it down and widens the arc.
- **Helpers** live in the hive. You start with 2 beds; each **Bee Room** adds 4, up to a colony of 20. Give each bee a job in the **Colony** page (`C` in the hive) (nectar, pollen, water, resin, or rest); they fly to the nearest explored tile with that resource, gather, bring it home to the store, and take a little rest. Each species prefers its favourite (♥) and is a bit slower than you, so exploring yourself always gathers faster.
- **Building jobs:** a helper can also work at a Honey Press, Bee Bread Kitchen or Wax Works (2 per building): pick "Work at a building…" on its card, or "+ Add a helper" in the building's panel. Each helper makes batches quicker (1 helper 1.5×, 2 helpers 2×) and carries every batch straight to the store, so the tray never holds things up. They hover beside the building, bustling round it while it runs.
- Helpers keep working while the game is closed (same 8-hour cap). They're drawn smaller than your bee (0.8×) and only when on screen. Inside the hive (now radius 3), idle bees wander between cells and resting bees sleep in the Bee Room beds.

### The Queen's requests
- The Queen always has one request, shown in a small card under the location panel (tap to fold it away) and in her panel inside the hive. Hand it in by visiting her and pressing `F`. When it's ready, a gold **!** bobs over the hive outside and over the Queen inside (and on her cell in the hive map).
- **Chapter one** walks through the whole game: fly home nectar, press honey, befriend a bee, bake bee bread, make wax, build a Bee Room, a bigger colony, find golden pollen, visit the old honeycomb, and a hive feast. Some requests mark a place on your map when they start. Rewards are more room in the store, gifts, and the Royal Ribbon.
- After that come endless **little wishes** (honey, bee bread, wax, golden pollen) that grow slowly, each giving something back. The hive level counts requests completed.

### Exploring pays off
- **Golden pollen** sparkles on about 25 tiles 7 or more hexes from home. Only your own bee can pick it up (just fly over it); it goes straight to the store and the spot sparkles again after 30 minutes.
- **Keepsakes:** every place on the island gives a wearable keepsake the first time you visit (specs, sunflower clip, lily-pad hat, dandelion puff, acorn cap, satchel, ancient crown, mist scarf), plus the Queen's ribbon. Wear one per slot (head, face, neck, side, tail) from the journal's **Keepsakes** page.

### Day and night
- A slow day on the real clock: 24 minutes for a full day, about a quarter of it night. The light turns moonlit blue and the sky deepens; the location card shows the time of day.
- At night **fireflies** drift round your bee and the music turns low and hushed, with far-off crickets.
- **Moon Bees** hover over soft grass only at night. They're the fastest helpers, with a tricky dance. *Day and night* in Settings turns it off (always day; Moon Bees then visit any time).

### Chapter two: past the mist
- Handing in the feast (the end of chapter one) lifts the mist ring round the island. Beyond it lies new land: **Lavender Heath** (rich nectar) and the **Amber Woods** (rich resin), with meadows and pools between.
- Three new places, each with a keepsake: **Lavender Cottage** (Lavender Sprig), **the Hollow Oak** (Amber Leaf Cape, worn on the back) and **the Moonwell** (Moon Locket). Two new species: **Lavender Bees** on the heath and **Ember Bees** in the Amber Woods.
- Six chapter-two requests lead through it all and end with the Queen's **Star Pin**; then the little wishes carry on.
- The first island generates exactly as before (the new ring is appended after it), so existing saves keep every tile and place. Saves that were already on little wishes start chapter two, keeping those wishes as hive levels.

### Coming back
- If you've been away for 2 minutes or more (closed the game or left the tab) and the hive made something, a **Welcome back** card lists what came in and who was busy.
- Helpers on their **favourite** job (♥) gather it faster.

### Balance notes
- Tuned with a scripted player that plays chapter one on a virtual clock using the real stores (it flies, gathers, builds, befriends and hands in like a sensible player). It finishes chapter one in about 13 minutes, which should be roughly 40 minutes of relaxed human play.
- Unloading always empties the pouch: anything the store can't hold goes to the nursery, so a full store can never leave you unable to gather something else.
- Buildings can be **paused** from their card (handy so the Wax Works doesn't eat honey you're saving). The Honey Press makes a jar every 20s.

### Music and sound
- Everything is synthesised live with the Web Audio API (`app/audio/engine.ts`): a generative, never-quite-repeating piece (soft pad, bass, kalimba melody) that turns slower and warmer inside the hive, a wing buzz that follows flight speed, and one-shots for gathering, a full pouch, unloading, discoveries, the hive door, collecting and building.
- Audio starts on the first key press or tap (browser autoplay rules) and pauses while the tab is hidden. Music and effect volumes are in Settings.

### Performance overlay
- In dev (or any build opened with `?perf`, e.g. a Cloudflare preview on a phone), `` ` `` toggles an overlay with FPS, a frame-time graph, **main-thread busy %** (the game's frame work as a share of time; browsers don't expose real CPU usage), long tasks, JS heap (Chromium), draw calls, triangles and loaded tiles. Low FPS with a mostly idle main thread is flagged as GPU-bound.

## Your save
Your journey lives in your browser. Open **Settings → Your save** to **Copy save code** or **Download save file** (a small `.txt`), and keep it somewhere safe. To carry on elsewhere, choose **Load a save** and paste the code or pick the file. Loading replaces the game in that browser, so Hivebound asks first.

## Install / offline
Hivebound is installable: use your browser's **Install app** or **Add to Home Screen**. After your first visit it also opens offline, since the game is cached on your device. When you're online it always loads the newest version. Offline it uses the copy you last played, with the fallback fonts.

## Accessibility built in
- **Reduce motion** (follows the OS setting by default): no bob, squash, pop-ins or springy UI, and a calmer camera.
- **High contrast** (follows `prefers-contrast`), **text size** (100 / 120 / 140%), and a **colour-vision-friendly palette**. Terrain and minimap markers differ by shape and brightness as well as hue.
- **Screen reader narration**: a polite live region announces routes, arrivals, new journal entries and a full **Look around** description (what's in each hex direction, plus the nearest unvisited place).
- Everything is playable with the **keyboard alone**. Dialogs are native `<dialog>` elements, so focus is trapped and `Esc` closes them. Touch targets are at least 44–56px.
- The **on-screen hex pad** is on by default for touch screens, and anyone can turn it on for motor accessibility.

## Next steps
- Swap procedural props for Blender GLBs (same instancing approach; keep materials soft and slightly rough)
- Balance pass on resource yields, recipe times and upgrade costs after playtesting
- Chapter 1 quest line and NPC critters, feeding into the journal
- A Beedex page per species, and species perks for building work

## Deploy (Cloudflare Workers, auto-deploy from GitHub)

The game builds to static files (`nuxt generate` → `.output/public`) and is served by a Worker with static assets (`wrangler.jsonc`).

One-time setup: in the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, pick this repo, and use:

- Build command: `npx nuxt generate`
- Deploy command: `npx wrangler deploy`

Every push to `main` then deploys to production automatically.

**Branch previews:** `wrangler.jsonc` sets `preview_urls` and a `previews` block, so non-production branches can get a [Worker Preview](https://developers.cloudflare.com/workers/previews/). In the dashboard (Worker → **Settings → Build**):

- **Branch control:** tick **Enable Preview Builds**.
- **Preview command:** `npx wrangler preview`. A Worker connected to Builds before Worker Previews existed shows a **Set up Worker Previews** banner there; use it to switch (a one-time, irreversible switch).

Each pull request then gets a comment with a stable Preview URL for its branch.

Manual deploy: `npm run deploy`.
