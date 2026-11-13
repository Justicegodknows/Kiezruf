// A simplified, labelled street diagram of north Neukölln for the "reports near you" map, until a
// real map library lands (E-04). Not to scale; positions are close enough to read the area.
// Coordinates are in a 400 × 180 box. Report pins use percentages of the same box (demo.ts).

export interface MapLabel {
  text: string;
  x: number;
  y: number;
  /** Degrees, along the street. */
  angle: number;
}

export const KIEZ_MAP = {
  width: 400,
  height: 180,
  /** Volkspark Hasenheide. */
  park: 'M0 0H64L76 34L46 66L0 72Z',
  /** Landwehrkanal, along the top edge. */
  water: 'M150 0H400V9C330 15 236 13 150 4Z',
  majorStreets: [
    'M92 30L74 180', // Hermannstraße
    'M92 30L262 180', // Karl-Marx-Straße
    'M92 30L400 128', // Sonnenallee
  ],
  minorStreets: [
    'M128 14L400 76', // Weserstraße
    'M92 30L110 0', // Kottbusser Damm
    'M0 112L400 150', // Ring (S-Bahn)
    'M168 70L200 0', // Pannierstraße / Fuldastraße
  ],
  labels: [
    { text: 'Karl-Marx-Straße', x: 222, y: 141, angle: 41.4 },
    { text: 'Sonnenallee', x: 318, y: 95, angle: 17.6 },
    { text: 'Hermannstraße', x: 72, y: 132, angle: -83.2 },
    { text: 'Weserstraße', x: 336, y: 54, angle: 12.8 },
    { text: 'Hasenheide', x: 28, y: 26, angle: 0 },
    { text: 'Hermannplatz', x: 52, y: 42, angle: 0 },
  ] satisfies MapLabel[],
  /** Gropiusstadt is about 4 km south; reports there sit on the edge with this hint. */
  offMapHint: { text: 'Gropiusstadt ↓', x: 318, y: 172 },
} as const;
