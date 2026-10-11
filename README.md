# Hillward

A 2D sledding game for phones. A gentleman in a top hat and a small child share a sled and ride through rolling green hills, cypress groves and round bushes, crossing six hills to reach the summit.

Everything (hills, forests, characters, sounds, music) is drawn or synthesized in code. There are no image or audio assets, and no build step.

## How to play

- **Tap** to jump: clear rocks and gaps.
- **Hold** while in the air to backflip. **Let go** before you land, or you'll tumble.
- Collect **daisies**. Flags are **checkpoints**. Reach the glowing **lamp-post** to finish a hill.
- Each hill gives up to 3 stars: one for finishing, one for 75% of the daisies, one for no tumbles.
- On desktop: Space / Up / W to jump, P or Esc to pause.

| # | Hill | What's new |
|---|------|------------|
| 1 | The Meadow | Tutorial: jumps, rocks, first flips |
| 2 | Cypress Row | More rocks, double rocks |
| 3 | Rolling Downs | Gaps you must jump |
| 4 | Golden Hour | Evening light, bigger hills |
| 5 | Misty Heights | Mist, the hardest mix |
| 6 | The Summit | The final climb to the peak |

## Put it on your phone

It's a static site and an installable web app (PWA): fullscreen, home-screen icon, works offline after the first visit.

1. In the GitHub repo: **Settings → Pages → Build and deployment → Deploy from a branch**, pick the branch and `/ (root)`, then save.
2. Open the Pages URL on your phone.
3. **iPhone:** Share → *Add to Home Screen*. **Android:** menu → *Install app* (or the *Install app* button on the title screen).

To wrap it as a store app later, tools like Capacitor can package this folder as-is.

## Run locally

```sh
npm start          # serves on http://localhost:8080
npm test           # headless check that every level is finishable
```

To reach a local server from your phone, use your computer's LAN IP. Some handy URL flags:

- `?level=3` jumps straight into hill 3
- `?bot` turns on the autopilot
- `?nosw` skips the offline service worker (useful while editing)

When you change files, bump `VERSION` in `sw.js` so installed copies update.

## Code map

| File | What it does |
|------|--------------|
| `js/levels.js` | Level list, colour palettes, and the builder that lays out hills, rocks, gaps, daisies and flags |
| `js/terrain.js` | Smooth height field (monotone cubic spline) with gaps |
| `js/player.js` | Sled physics: slopes, launches over crests, jumps, flips, landings |
| `js/world.js` | One attempt at a level: collisions, pickups, checkpoints, crashes, stars |
| `js/bot.js` | Autopilot for the title-screen demo and the tests |
| `js/background.js` | Parallax meadows, forest bands and the mountain, cached in chunks |
| `js/draw.js` | Terrain, scenery, rocks, daisies, lamp-post and the two riders |
| `js/audio.js` | Synthesized sound effects, wind and music-box melody |
| `js/main.js` | Game loop, camera, input, menus, HUD, saving |
| `test/sim.mjs` | Plays every level headlessly and fails if one can't be finished cleanly |

Tuning lives in `PHYS` (`js/player.js`) and `LEVELS` (`js/levels.js`). The game name is in `index.html`, `manifest.webmanifest` and the title text, if you want to rename it.
