// Location photos of the demo reports' streets, from Wikimedia Commons. These show the place, not
// the reported damage: report photos come from residents once the API exists (US-06, US-31).
// Every licence below requires credit next to the photo or in a credits list; both apps do both.
// The files ship in apps/web/public/photos and apps/mobile/assets/photos (960 px wide, unedited).

export interface PhotoCredit {
  /** Street or place shown. */
  place: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Commons file page. */
  source: string;
}

export const PHOTOS = {
  rathaus: {
    place: 'Karl-Marx-Straße, Rathaus Neukölln',
    author: 'Beek100',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Berlin,_Neukoelln,_Karl-Marx-Strasse_83,_Rathaus_Neukoelln.jpg',
  },
  hermannstrasse: {
    place: 'Hermannstraße',
    author: 'SupapleX',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Ladezone_Hermannstra%C3%9Fe_Berlin_Neuk%C3%B6lln.jpg',
  },
  weserstrasse: {
    place: 'Weserstraße',
    author: 'Nicor, Tabsnic',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Neuk%C3%B6lln_Weserstra%C3%9Fe.JPG',
  },
  sonnenallee: {
    place: 'Sonnenallee',
    author: 'Leonhard Lenz',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Sonnenallee_Berlin-Neuk%C3%B6lln_2020-06-26_01.jpg',
  },
  hermannplatz: {
    place: 'Hermannplatz',
    author: 'A.Savin',
    license: 'Free Art License 1.3',
    licenseUrl: 'https://artlibre.org/licence/lal/en/',
    source: 'https://commons.wikimedia.org/wiki/File:Berlin_Neukoelln_Hermannplatz_asv2021-03_img1.jpg',
  },
  lipschitzallee: {
    place: 'Lipschitzallee, Gropiusstadt',
    author: 'Fridolin freudenfett',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Gropiusstadt_Lipschitzallee.JPG',
  },
} as const satisfies Record<string, PhotoCredit>;

export type PhotoKey = keyof typeof PHOTOS;
export const PHOTO_KEYS = Object.keys(PHOTOS) as PhotoKey[];
