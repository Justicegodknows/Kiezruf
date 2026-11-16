// Status as text with an icon shape, so it does not depend on colour (WCAG 1.4.1).
const ICONS: Record<string, string> = {
  open: '○',
  acknowledged: '◔',
  in_progress: '◑',
  resolved: '●',
  forwarded: '→',
  rejected: '×',
  processing: '…',
  in_moderation: '…',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true">{ICONS[status] ?? '•'} </span>
      {label}
    </span>
  );
}
