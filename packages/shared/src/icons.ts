// One stroke icon set for web and mobile: 24 × 24 viewBox, drawn for a 1.75 stroke with round caps
// and joins. Each value is a single SVG path; render it with stroke="currentColor" and no fill.
export const ICON_PATHS = {
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  hand: 'M7 11V6.5a1.5 1.5 0 0 1 3 0V11 M10 10V4.5a1.5 1.5 0 0 1 3 0V10 M13 10V5.5a1.5 1.5 0 0 1 3 0V11 M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5.3-2.7L3.6 14.6a1.6 1.6 0 0 1 2.5-2L7 13.5V11',
  message: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18.5 14.5a6.5 6.5 0 0 1 3 5.5',
  alert: 'M12 3.5L2.5 20h19L12 3.5z M12 10v4.5 M12 17.2v.1',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.5l2.7 2.7L16 9.8',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  trafficLight: 'M8.5 3h7a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 16.5v-12A1.5 1.5 0 0 1 8.5 3z M12 18v3 M12 7.5v.1 M12 10.5v.1 M12 13.5v.1',
  building: 'M4 21V7l8-4 8 4v14 M9 21v-5h6v5 M8.5 9.5h.1 M12 9.5h.1 M15.5 9.5h.1 M8.5 12.5h.1 M12 12.5h.1 M15.5 12.5h.1 M2.5 21h19',
  shield: 'M12 21s7-3 7-9.5V5.5L12 3 5 5.5v6C5 18 12 21 12 21z M9 12l2.2 2.2L15.5 10',
  camera: 'M4 7.5h3.2L9 5h6l1.8 2.5H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20.5a2 2 0 0 0 4 0',
  lock: 'M6.5 11h11a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  inbox: 'M3.5 13.5L6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5z M3.5 13.5H8.5l1 2h5l1-2h5',
  trendUp: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5',
  table: 'M3.5 5h17v14h-17z M3.5 10h17 M3.5 14.5h17 M9.5 10v9',
  chart: 'M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 21a7.5 7.5 0 0 1 15 0',
} as const;

export type IconName = keyof typeof ICON_PATHS;
