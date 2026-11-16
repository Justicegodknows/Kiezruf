// Stroke icons from the design system (main's `design` branch, packages/shared/src/icons.ts), only the ones the
// citizen web uses. Decorative by default; pass `label` when an icon carries meaning on its own.
const PATHS = {
  camera:
    'M4 7.5h3.2L9 5h6l1.8 2.5H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20.5a2 2 0 0 0 4 0',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.5l2.7 2.7L16 9.8',
  hand: 'M7 11V6.5a1.5 1.5 0 0 1 3 0V11 M10 10V4.5a1.5 1.5 0 0 1 3 0V10 M13 10V5.5a1.5 1.5 0 0 1 3 0V11 M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5.3-2.7L3.6 14.6a1.6 1.6 0 0 1 2.5-2L7 13.5V11',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
