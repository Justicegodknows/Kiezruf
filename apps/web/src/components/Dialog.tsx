'use client';

// Modal dialog on the native <dialog> element: the browser traps focus, Esc closes it and focus returns to the
// opener (WCAG 2.1.2, 2.4.3). Falls back to the `open` attribute where showModal is missing (jsdom).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '@/i18n/I18nProvider';

export function Dialog({
  open,
  title,
  onClose,
  children,
  describedBy,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const t = useT();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn ghost" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
