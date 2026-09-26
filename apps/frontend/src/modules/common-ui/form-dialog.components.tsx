import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@repo/ui';

/** Keep mobile actions above the keyboard while the form body scrolls. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  actions,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actions: ReactNode;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  const form = (body: ReactNode, footer: ReactNode) => (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSubmit();
      }}
      onKeyDown={(event) => {
        const isModifierSubmit =
          event.key === 'Enter' && (event.metaKey || event.ctrlKey);

        if (!isModifierSubmit) return;

        event.preventDefault();
        onSubmit();
      }}
    >
      {body}
      {footer}
    </form>
  );

  if (isMobile)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-2xl data-[side=bottom]:max-h-[calc(100dvh-2.5rem)]"
        >
          <SheetHeader className="shrink-0 pr-14">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {form(
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {children}
            </div>,
            <SheetFooter className="shrink-0 flex-row justify-end">
              {actions}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form(children, <DialogFooter>{actions}</DialogFooter>)}
      </DialogContent>
    </Dialog>
  );
}
