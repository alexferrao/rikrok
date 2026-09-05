// One fixed, deterministic accent colour per project, chosen to read on a black
// canvas so a project is identifiable by colour alone while scrolling.
export const ACCENTS = [
  "#69C9D0", // cyan (brand)
  "#EE1D52", // red (brand)
  "#F5D547", // yellow
  "#7CFC9A", // mint
  "#FF8C42", // orange
  "#B98CFF", // lavender
  "#4DA3FF", // sky
  "#FF6BC1", // pink
  "#A8E34D", // lime
  "#FFB86B", // apricot
  "#5EEAD4", // teal
  "#E0E0E0", // silver
];

export function accentFor(projectName) {
  // FNV-1a spreads short similar names far better than djb2 mod n
  let h = 0x811c9dc5;
  const s = String(projectName).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ACCENTS[h % ACCENTS.length];
}
