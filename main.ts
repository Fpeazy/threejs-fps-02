// Night Bazaar — the entrypoint that hands the game in (Node 22, standard
// library only). It copies the static game/ folder and the screenshots/ folder
// from beside this file into the output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and play the game with `node serve.ts` on http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The scorer's own caps (reference/gate.json). Only text_max_bytes shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse: more than
// 4 screenshots, or one over 256 KiB; more than 993 files in game/, or more
// than 48 MiB of game files (game/ counts beside /output's own 1000-entry cap).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function handIn() {
  const repoRoot = fileURLToPath(new URL('.', import.meta.url));
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
  const shotsOut = join(outputDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  const shotsIn = join(repoRoot, 'screenshots');
  if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });
  writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));
}

handIn();
