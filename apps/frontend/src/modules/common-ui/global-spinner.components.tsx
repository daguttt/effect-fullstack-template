import { LoaderCircle, Sparkles } from 'lucide-react';

import { APP_NAME } from './app-name.constant';

const DEFAULT_MESSAGE = 'Preparing your workspace';

type GlobalSpinnerProps = {
  message?: string;
};

export function GlobalSpinner({
  message = DEFAULT_MESSAGE,
}: GlobalSpinnerProps) {
  return (
    <main className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--primary)/0.14),transparent_34%),radial-gradient(circle_at_18%_78%,hsl(var(--muted-foreground)/0.08),transparent_28%)]" />
      <div className="relative flex w-[min(22rem,calc(100vw-3rem))] flex-col items-center gap-5 rounded-3xl border border-border/60 bg-card/80 px-8 py-10 text-center shadow-2xl shadow-black/10 backdrop-blur-xl">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LoaderCircle
            className="absolute size-16 animate-spin"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <Sparkles className="size-7" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-[0.24em] uppercase">
            {APP_NAME}
          </p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </main>
  );
}
