import * as React from 'react';

import { Switch } from '#components/ui/switch';
import { useControllableState } from '#hooks/use-controllable-state';
import { cn } from '#lib/utils';

export const title = 'Controllable toggle';
export const description =
  'A Radix-style controlled/uncontrolled component powered by useControllableState.';

type ToggleProps = {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
};

function Toggle({
  pressed: pressedProp,
  defaultPressed = false,
  onPressedChange,
}: ToggleProps) {
  const [pressed, setPressed] = useControllableState({
    prop: pressedProp,
    defaultProp: defaultPressed,
    onChange: onPressedChange,
    name: 'Toggle',
    state: 'pressed',
  });

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-6 rounded-xl border px-5 py-4 transition-colors duration-200',
        pressed
          ? 'border-sky-400/40 bg-sky-400/10'
          : 'border-white/10 bg-slate-900/50'
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-heading text-base font-semibold text-white">
          Resort announcements
        </p>
        <p
          className={cn('text-sm', pressed ? 'text-sky-200' : 'text-slate-400')}
        >
          {pressed ? 'Notifications enabled' : 'Notifications paused'}
        </p>
      </div>
      <Switch checked={pressed} onCheckedChange={setPressed} />
    </div>
  );
}

function MetricBadge({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'sky' | 'amber';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs',
        tone === 'sky' && 'border-sky-400/30 bg-sky-400/10 text-sky-200',
        tone === 'amber' &&
          'border-amber-400/30 bg-amber-400/10 text-amber-200',
        tone === 'neutral' && 'border-white/10 bg-slate-950/60 text-slate-300'
      )}
    >
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function DemoPanel({
  badge,
  badgeTone,
  title,
  description,
  children,
  footer,
}: {
  badge: string;
  badgeTone: 'sky' | 'amber';
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-inner shadow-black/20">
      <header className="space-y-3">
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] uppercase',
            badgeTone === 'sky' && 'bg-sky-400/15 text-sky-300',
            badgeTone === 'amber' && 'bg-amber-400/15 text-amber-300'
          )}
        >
          {badge}
        </span>
        <div>
          <h3 className="font-heading text-lg font-medium text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            {description}
          </p>
        </div>
      </header>

      {children}

      <footer className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
        {footer}
      </footer>
    </section>
  );
}

function TogglePlayground() {
  const [controlledPressed, setControlledPressed] = React.useState(false);
  const [uncontrolledChanges, setUncontrolledChanges] = React.useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DemoPanel
        badge="Uncontrolled"
        badgeTone="sky"
        title="Internal state"
        description="No pressed prop — the component owns state and initializes from defaultPressed."
        footer={
          <>
            <MetricBadge
              label="onPressedChange"
              value={`${uncontrolledChanges} calls`}
              tone="sky"
            />
            <MetricBadge label="defaultPressed" value="true" tone="neutral" />
          </>
        }
      >
        <Toggle
          defaultPressed
          onPressedChange={() =>
            setUncontrolledChanges((current) => current + 1)
          }
        />
      </DemoPanel>

      <DemoPanel
        badge="Controlled"
        badgeTone="amber"
        title="Parent-driven state"
        description="pressed is supplied by the parent; each click flows through onPressedChange."
        footer={
          <>
            <MetricBadge
              label="parent state"
              value={String(controlledPressed)}
              tone="amber"
            />
            <MetricBadge
              label="mode"
              value={controlledPressed ? 'on' : 'off'}
              tone="neutral"
            />
          </>
        }
      >
        <Toggle
          pressed={controlledPressed}
          onPressedChange={setControlledPressed}
        />
      </DemoPanel>
    </div>
  );
}

export default TogglePlayground;
