// Drawn stand-ins for citizens' photos in the demo data: one simple street scene per kind of problem, as in the
// product plan's prototype. No people, no number plates, no text: nothing that would need blurring.
import sharp from 'sharp';

export const SCENES = ['light', 'pothole', 'dump', 'door', 'toilet', 'swing', 'van', 'lamp', 'sign', 'bins'] as const;
export type Scene = (typeof SCENES)[number];

const W = 1200;
const H = 900;

/** Sky, buildings and pavement, tinted per variant so photos of the same scene differ a little. */
function street(variant: number): string {
  const sky = ['#cfe3f2', '#dfe7ee', '#f2e6d0'][variant % 3];
  const facade = ['#c9b79c', '#b8a48a', '#d6c4a8'][variant % 3];
  const windows = Array.from({ length: 12 }, (_, i) => {
    const x = 60 + (i % 6) * 190;
    const y = 90 + Math.floor(i / 6) * 150;
    return `<rect x="${x}" y="${y}" width="90" height="100" rx="6" fill="#6f8796" opacity="0.8"/>`;
  }).join('');
  return `
    <rect width="${W}" height="${H}" fill="${sky}"/>
    <rect y="40" width="${W}" height="420" fill="${facade}"/>
    ${windows}
    <rect y="460" width="${W}" height="120" fill="#9a9a96"/>
    <rect y="580" width="${W}" height="${H - 580}" fill="#5d5f61"/>
    <rect y="575" width="${W}" height="10" fill="#d8d8d2"/>`;
}

const DRAW: Record<Scene, string> = {
  light: `
    <rect x="560" y="200" width="22" height="390" fill="#3a3a3a"/>
    <rect x="520" y="150" width="100" height="190" rx="14" fill="#262626"/>
    <circle cx="570" cy="200" r="30" fill="#4a4a4a"/><circle cx="570" cy="290" r="30" fill="#4a4a4a"/>
    <g fill="#ffffff">${Array.from({ length: 6 }, (_, i) => `<rect x="${200 + i * 140}" y="640" width="90" height="200"/>`).join('')}</g>`,
  pothole: `
    <rect x="0" y="690" width="${W}" height="80" fill="#3f7fbf" opacity="0.55"/>
    <ellipse cx="620" cy="730" rx="190" ry="70" fill="#2b2b2b"/>
    <ellipse cx="620" cy="722" rx="150" ry="48" fill="#4b4237"/>
    <path d="M430 730 L380 700 M810 735 L870 760 M600 660 L610 610" stroke="#2b2b2b" stroke-width="10"/>`,
  dump: `
    <rect x="300" y="420" width="420" height="180" rx="20" fill="#e9e3d2" transform="rotate(-8 510 510)"/>
    <ellipse cx="820" cy="560" rx="90" ry="70" fill="#1f1f1f"/><ellipse cx="930" cy="580" rx="70" ry="55" fill="#2e2e2e"/>
    <rect x="200" y="520" width="120" height="90" fill="#8b5a2b"/><ellipse cx="700" cy="600" rx="80" ry="40" fill="#3d3d3d"/>`,
  door: `
    <rect x="460" y="180" width="280" height="400" fill="#7a4b2a"/>
    <rect x="460" y="180" width="280" height="400" fill="none" stroke="#3b2414" stroke-width="16"/>
    <path d="M600 190 L640 330 L590 420 L630 570" stroke="#1d1d1d" stroke-width="8" fill="none"/>
    <circle cx="700" cy="390" r="14" fill="#c9a227"/>`,
  toilet: `
    <rect x="380" y="220" width="440" height="360" rx="30" fill="#4c7a5a"/>
    <rect x="520" y="320" width="160" height="260" fill="#33533d"/>
    <rect x="460" y="250" width="280" height="50" fill="#ffffff"/>
    <line x1="470" y1="275" x2="730" y2="275" stroke="#c0392b" stroke-width="14"/>`,
  swing: `
    <rect y="460" width="${W}" height="440" fill="#7fa65a"/>
    <path d="M350 250 L450 640 M850 250 L750 640 M350 250 L850 250" stroke="#b33" stroke-width="22" fill="none"/>
    <line x1="560" y1="255" x2="560" y2="520" stroke="#555" stroke-width="6"/>
    <line x1="660" y1="255" x2="620" y2="560" stroke="#555" stroke-width="6"/>
    <rect x="540" y="520" width="90" height="18" fill="#2d6ca2" transform="rotate(35 560 520)"/>`,
  van: `
    <rect x="0" y="600" width="${W}" height="70" fill="#c0392b" opacity="0.7"/>
    <rect x="300" y="430" width="560" height="230" rx="24" fill="#f4f4f4"/>
    <rect x="760" y="460" width="100" height="90" rx="10" fill="#8fb3c7"/>
    <circle cx="420" cy="670" r="50" fill="#222"/><circle cx="760" cy="670" r="50" fill="#222"/>`,
  lamp: `
    <rect width="${W}" height="${H}" fill="#1c2733" opacity="0.65"/>
    ${[260, 600, 940].map((x) => `<rect x="${x}" y="230" width="18" height="360" fill="#222"/><rect x="${x - 40}" y="210" width="98" height="30" rx="10" fill="#333"/>`).join('')}
    <rect y="600" width="${W}" height="300" fill="#2f3d47"/>`,
  sign: `
    <rect x="560" y="420" width="18" height="300" fill="#7f8c8d" transform="rotate(78 569 640)"/>
    <polygon points="760,600 900,600 830,720" fill="#ffffff" stroke="#c0392b" stroke-width="20"/>`,
  bins: `
    <rect y="460" width="${W}" height="440" fill="#7fa65a"/>
    ${[380, 620].map((x) => `<rect x="${x}" y="420" width="170" height="220" rx="12" fill="#e67e22"/><rect x="${x - 10}" y="405" width="190" height="28" rx="8" fill="#b35f15"/>`).join('')}
    <ellipse cx="900" cy="640" rx="80" ry="40" fill="#ecf0f1"/><ellipse cx="300" cy="650" rx="60" ry="30" fill="#bdc3c7"/>`,
};

/** A JPEG of the scene, 1200 × 900. */
export async function demoPhoto(scene: Scene, variant = 0): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${street(variant)}${DRAW[scene]}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}
