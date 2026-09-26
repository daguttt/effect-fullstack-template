/**
 * Vendored from shadcn's `base-vega` registry entry for `tabs`
 * (`https://ui.shadcn.com/r/styles/base-vega/tabs.json`). The file is that
 * entry verbatim apart from this package's import alias (`#lib/utils`), the
 * dropped `"use client"` directive that most components here drop too, and the
 * deviations below — which a future `shadcn add tabs` overwrites, so re-apply
 * them:
 *
 * 1. `Tabs` forwards `orientation` to `TabsPrimitive.Root`. The registry
 *    destructures the prop and re-emits it only as `data-orientation`, so a
 *    `vertical` Tabs styles vertically while the primitive keeps horizontal
 *    keyboard navigation and activation direction. The registry's explicit
 *    `data-orientation` stays as-is; it now agrees with the attribute Base UI
 *    derives from its own state.
 * 2. `TabsContent` routes its `style` through `withLeavingPanelHidden` — see
 *    the note on that function.
 * 3. `import * as React`, for the `React.CSSProperties` return type of
 *    `withLeavingPanelHidden`.
 *
 * Deviations 1 and 2 each have a failing-against-stock test in `tabs.test.tsx`,
 * so an unapplied re-apply surfaces there rather than in a browser.
 */
import * as React from 'react';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '#lib/utils';

function Tabs({
  className,
  orientation = 'horizontal',
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'group/tabs flex gap-2 data-horizontal:flex-col',
        className
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        line: 'gap-1 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className
      )}
      {...props}
    />
  );
}

/**
 * A deselected Base UI panel keeps `mounted` true — and so stays visible and
 * laid out, because its `hidden` attribute is `!mounted` (`TabsPanel.js:66`) —
 * until `useOpenChangeComplete` reports that the panel's exit animation
 * finished.
 *
 * base-vega's panel declares no exit animation, which makes the untreated cost
 * much narrower than that description suggests: in a browser `getAnimations()`
 * returns `[]`, `Promise.all([])` settles on the animation frame Base UI has
 * already queued, and the panel unmounts inside a `flushSync` written to stop
 * the browser painting the intermediate state (`useAnimationsFinished.js`,
 * mui/base-ui#979). What is left is one frame in which both panels are mounted
 * and share the layout — painted or not, depending on when React flushes the
 * passive effect that starts the wait. It is a flash, not an outgoing panel
 * that lingers.
 *
 * The unbounded failure belongs to whoever gives `TabsContent` an exit
 * animation later. Base UI awaits `animation.finished` with
 * `treatAbortedAsFinished: false`, so an animation that never finishes — or
 * one cancelled with nothing left running — never reports, and the outgoing
 * panel stays on screen indefinitely.
 *
 * Collapsing the panel on `ending` closes both. `state.transitionStatus ===
 * 'ending'` is the only signal that marks that window: `TabsPanel.State`'s
 * `hidden` is `!mounted`, so it is still `false` throughout it, and
 * `TabsPanel.Props`'s `keepMounted` extends a panel's life rather than ending
 * it sooner.
 *
 * Two consequences, both accepted here:
 *
 * - `display: none` hides without unmounting. Through `ending` the panel keeps
 *   its effects, its subscriptions and its `registerMountedTabPanel`
 *   registration (keyed on `hidden`, still `false`). It suppresses the symptom,
 *   not the mount.
 * - A consumer who gives `TabsContent` an exit animation will have it silently
 *   suppressed by this inline `display: none`, with no way to opt out.
 */
function withLeavingPanelHidden(style: TabsPrimitive.Panel.Props['style']) {
  return (state: TabsPrimitive.Panel.State): React.CSSProperties => {
    const isLeavingPanel = state.transitionStatus === 'ending';

    return {
      ...(typeof style === 'function' ? style(state) : style),
      ...(isLeavingPanel ? { display: 'none' } : undefined),
    };
  };
}

function TabsContent({
  className,
  style,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
      style={withLeavingPanelHidden(style)}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
