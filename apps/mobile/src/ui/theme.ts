// The Kiezruf palette from the design system (same values as the web tokens in apps/web/src/app/globals.css: change
// both together): paper and asphalt neutrals, tram green for links and active states. WCAG 2.1 AA contrast on white
// and on the paper background (text ≥ 4.5:1, controls ≥ 3:1). Colour never carries meaning alone: every status,
// toggle and warning also has text or an icon glyph.
export const colors = {
  text: '#1A2430', // asphalt, 15.7:1 on white
  muted: '#586571', // 6.0:1
  primary: '#0D6B5B', // tram green, 6.4:1; white text on it 6.4:1
  primaryText: '#FFFFFF',
  danger: '#B42318', // 6.6:1
  dangerBg: '#FDE8E6',
  infoBg: '#E7EEFA',
  successBg: '#E2F3E8',
  success: '#1D7243', // 5.9:1
  border: '#79847F', // 3.9:1 against white, for control outlines
  divider: '#D3DAD6',
  surface: '#FFFFFF',
  sunk: '#EBEFEC',
  pin: '#1A2430',
  overlay: 'rgba(0,0,0,0.45)',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const radius = { s: 4, m: 6, pill: 999 };
/** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
export const TOUCH = 48;
