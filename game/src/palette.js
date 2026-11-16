// The look plan, in one place. Night Bazaar at dusk: deep indigo sky, warm amber
// lanterns, teal awnings, terracotta brick. The same names are the CSS custom
// properties in index.html. LANTERN team is teal, EMBER team is orange.
export const PALETTE = {
  canvas: '#1c1626', // dusk sky / fog
  ground: '#3d2f1e', // packed earth floor
  surface: '#54402c', // dark wood walls
  hairline: '#6b543a', // wood trim
  ink: '#f5e6c8', // warm cream (text, light)
  muted: '#8a7f6a',
  accent: '#ffb347', // lantern amber
  teal: '#2a9d8f', // awnings + LANTERN team
  ember: '#e86a2a', // EMBER team
  brick: '#b5502a', // terracotta
  leaf: '#5a7a3a', // stall greens
};

export function shade(name) {
  return PALETTE[name];
}
