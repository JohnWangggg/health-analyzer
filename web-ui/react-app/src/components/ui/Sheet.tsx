import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Button } from './Button';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** side drawer on wide screens; bottom sheet feel on narrow via CSS */
  side?: 'right' | 'bottom';
};

/**
 * Accessible dialog/sheet primitive — focus trap lite, Esc to close, no portal CDN.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = 'right',
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const closeBtn = panelRef.current?.querySelector<HTMLElement>(
        '[data-sheet-close]',
      );
      closeBtn?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const onPanelKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="ui-sheet-root" data-testid="sheet-root">
      <button
        type="button"
        className="ui-sheet-backdrop"
        aria-label="关闭面板"
        onClick={onClose}
        data-testid="sheet-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`ui-sheet-panel ui-sheet-${side}`}
        onKeyDown={onPanelKeyDown}
        data-testid="sheet-panel"
      >
        <header className="ui-sheet-header">
          <h2 id={titleId} className="ui-sheet-title">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-sheet-close
            data-testid="sheet-close"
            aria-label="关闭"
          >
            关闭
          </Button>
        </header>
        <div className="ui-sheet-body">{children}</div>
      </div>
    </div>
  );
}
