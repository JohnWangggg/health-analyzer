import type { ReactNode } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { Button } from './Button';

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Optional trigger rendered outside the portal */
  trigger?: ReactNode;
  testId?: string;
};

/**
 * Mobile bottom drawer (Vaul) — swipe-to-dismiss, safe-area aware.
 * Desktop can still use Sheet; Overview uses this for advanced tools on narrow viewports.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  trigger,
  testId = 'drawer',
}: DrawerProps) {
  return (
    <VaulDrawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <VaulDrawer.Trigger asChild>{trigger}</VaulDrawer.Trigger> : null}
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="ui-drawer-overlay" data-testid={`${testId}-overlay`} />
        <VaulDrawer.Content
          className="ui-drawer-content"
          data-testid={testId}
          aria-describedby={undefined}
        >
          <div className="ui-drawer-handle" aria-hidden />
          <header className="ui-drawer-header">
            <VaulDrawer.Title className="ui-drawer-title">{title}</VaulDrawer.Title>
            <VaulDrawer.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`${testId}-close`}
                aria-label="关闭"
              >
                关闭
              </Button>
            </VaulDrawer.Close>
          </header>
          <div className="ui-drawer-body">{children}</div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
