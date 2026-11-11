// Colours chosen for WCAG 2.1 AA contrast on white (text ≥ 4.5:1, controls ≥ 3:1). Colour never carries
// meaning alone: every status, toggle and warning also has text or an icon glyph.
export const colors = {
  text: '#1A1F24', // 16:1 on white
  muted: '#4B5563', // 7.6:1
  primary: '#0B5CAD', // 6.6:1; white text on it 6.6:1
  primaryText: '#FFFFFF',
  danger: '#B42318', // 6.4:1
  dangerBg: '#FEE4E2',
  infoBg: '#E3EEFA',
  successBg: '#E3F4E8',
  success: '#146C2E', // 6.5:1
  border: '#8A94A3', // 3.1:1 against white, for control outlines
  divider: '#D5DAE1',
  surface: '#FFFFFF',
  sunk: '#F2F4F7',
  pin: '#1A1F24',
  overlay: 'rgba(0,0,0,0.45)',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const radius = { s: 8, m: 12, pill: 999 };
/** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
export const TOUCH = 48;
