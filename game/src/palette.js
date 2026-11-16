// The look plan, in one place. Night Bazaar at dusk, in a realistic register:
// deep indigo shadows, warm amber lantern light, weathered wood and muted
// terracotta brick, cool moonlight fill. NOT cartoon: colours are muted and
// photographic; the teams read as accents on muted uniforms (EMBER warm amber,
// LANTERN cool teal), never as flat bright bodies. The same names are the CSS
// custom properties in index.html.
export const PALETTE = {
  canvas: '#2b2440', // dusk sky / fog (deep indigo, lifted so shapes do not vanish)
  ground: '#5a4632', // packed earth, warm mid-brown
  surface: '#6e5238', // weathered wood walls
  hairline: '#8a6f4d', // wood trim (lighter, so edges read)
  ink: '#f5e6c8', // warm cream (text, light)
  muted: '#a89a80',
  accent: '#ffb347', // lantern amber (the warm light, stays bright)
  teal: '#3d8a80', // muted aqua — LANTERN accent only
  ember: '#c96a2e', // muted burnt orange — EMBER accent only
  brick: '#9c5a38', // muted terracotta brick
  leaf: '#5f7040', // muted stall greens
  olive: '#6b6238', // EMBER uniform (dark olive/khaki)
  slate: '#3a4a52', // LANTERN uniform (dark slate teal-grey)
  charcoal: '#2e2a26', // legs, gunmetal darks
  skin: '#8a6a4d', // muted skin tone under the helmet
};

export function shade(name) {
  return PALETTE[name];
}
