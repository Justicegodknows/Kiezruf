// Kiezruf design tokens for React Native. Same values as the web tokens in
// apps/web/src/app/globals.css: change both together.
// Paper and asphalt neutrals, tram green for links and active states, signal yellow reserved for
// the one primary action on a screen, white enamel street-name plates in both themes.
import { Platform } from 'react-native';

const light = {
  bg: '#f4f6f3',
  surface: '#ffffff',
  sunk: '#ebefec',
  ink: '#1a2430',
  ink2: '#344250',
  muted: '#586571',
  line: '#d3dad6',
  lineStrong: '#b4beb9',

  brand: '#0d6b5b',
  brandSoft: '#e0eee9',
  brandInk: '#0b5a4d',
  onBrand: '#ffffff',

  signal: '#f2c230',
  signalPressed: '#e8b51a',
  signalSoft: '#fcf2cc',
  onSignal: '#1a2430',

  plate: '#ffffff',
  plateInk: '#16202a',
  plateMuted: '#4a5762',

  open: '#1d5bb8',
  openSoft: '#e7eefa',
  acknowledged: '#0b5a4d',
  acknowledgedSoft: '#e0eee9',
  inProgress: '#8a5100',
  inProgressSoft: '#fcf0d9',
  resolved: '#1d7243',
  resolvedSoft: '#e2f3e8',

  sceneSky: '#e4ecef',
  sceneGround: '#cfd8dc',
  sceneLine: '#b8c4c9',
  sceneObj: '#4a5a64',
  sceneOff: '#8d9ba3',
  sceneMark: '#ffffff',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#10171d',
  surface: '#161f27',
  sunk: '#0c1217',
  ink: '#e9eef0',
  ink2: '#c3cdd2',
  muted: '#97a4ad',
  line: '#27333d',
  lineStrong: '#3b4955',

  brand: '#55c6ad',
  brandSoft: '#143029',
  brandInk: '#82dcc7',
  onBrand: '#06241d',

  signal: '#f2c230',
  signalPressed: '#f7d257',
  signalSoft: '#3a3116',
  onSignal: '#1a2430',

  plate: '#e8ece9',
  plateInk: '#16202a',
  plateMuted: '#4a5762',

  open: '#8ab8f2',
  openSoft: '#172b45',
  acknowledged: '#82dcc7',
  acknowledgedSoft: '#143029',
  inProgress: '#f2b860',
  inProgressSoft: '#3a2a12',
  resolved: '#78d29d',
  resolvedSoft: '#153222',

  sceneSky: '#1b2730',
  sceneGround: '#24313a',
  sceneLine: '#34434e',
  sceneObj: '#b9c6cd',
  sceneOff: '#5d6d77',
  sceneMark: '#3b4a55',
};

export const palettes = { light, dark };
export type Scheme = keyof typeof palettes;

// One signage family in two widths, loaded in src/app/_layout.tsx. With custom fonts each weight
// is its own family name; never combine them with fontWeight.
export const fonts = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  display: 'BarlowCondensed_700Bold',
  displaySemibold: 'BarlowCondensed_600SemiBold',
};

// Type scale (~1.25), matching the web sizes at phone width.
export const type = {
  display: { fontFamily: fonts.display, fontSize: 52, lineHeight: 50 },
  title: { fontFamily: fonts.displaySemibold, fontSize: 34, lineHeight: 36 },
  heading: { fontFamily: fonts.displaySemibold, fontSize: 26, lineHeight: 28 },
  subheading: { fontFamily: fonts.displaySemibold, fontSize: 22, lineHeight: 24 },
  lead: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 27 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 56 } as const;
export const radius = { sm: 4, md: 6, lg: 10 } as const;

/** Minimum touch target (WCAG 2.5.5 / Apple HIG). */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
export const touchTarget = Platform.select({ ios: 44, default: 48 });
