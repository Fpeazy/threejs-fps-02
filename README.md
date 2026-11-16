# threejs-fps-02 — Night Bazaar

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Fpeazy/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Fpeazy/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Night Bazaar** — a round-based tactical FPS in three.js 0.187.0, built for make.fun's "Make the best three.js tactical FPS" bounty. Two teams fight over a dusk night market: EMBER (orange, attackers) must plant the charge at SPICE ROW or TEA HOUSE; LANTERN (teal, defenders) must stop them. First to 8 rounds, max 15.

## The game

- **Map:** one original 48×36 m night market — a three-tier lantern tower at MID, SPICE ROW (Site A, west), TEA HOUSE (Site B, east), SILK LANE and ALLEY flanks, GATE and FOUNTAIN spawns. Named callouts painted on the ground and on the minimap.
- **Combat:** five original weapons (Moth P4 pistol, Wasp-9 SMG, Juniper R7 rifle, Boar 12 shotgun, Longshadow L9 sniper with ADS zoom), 3× headshot damage, disc-sampled spread, scheduled-clock fire rates, recoil that punishes firing on the move, crouch, jump, and AABB collision.
- **Tactics:** bomb plant (3 s) / defuse (5 s) objective with a 40 s fuse, a buy menu (5 categories) with round economy, a grenade, armour, and 9 bots that follow routes, hold sites, react to sight and sound, rotate on the plant, and chase last-known positions.
- **HUD:** minimap with callouts and live agent dots, top score bar with timer/round/phase, kill feed with headshot marks, radio lines, health + armour + cash, weapon/ammo/grenade slots, crosshair spread, plant/defuse bar, buy menu, and scoreboard (K/D/DMG/HS/Cash).
- **Effects (light):** pooled tracers, pooled impact particles, grenade explosions, a pulsing bomb beacon with a fresnel shell, trauma-based screen shake, hit-stop, muzzle flash — one sun + one hemisphere light, ACES tone mapping, no post-processing, no per-frame allocation in the hot loops.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Build the dossier (what the judge reads):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are taken deterministically with `?shot=combat|buy|plant|end&seed=N` (see `shots.json`).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
