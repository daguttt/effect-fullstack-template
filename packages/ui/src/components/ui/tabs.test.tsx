import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

/**
 * jsdom implements no Web Animations API, so Base UI takes its "animations are
 * unsupported" shortcut and drops a deselected panel synchronously — which
 * would let an untreated Tabs pass every case below. These cases install a
 * browser-shaped `getAnimations` and drive it per case, so a panel's exit goes
 * through the animation-finished wait a browser would actually run.
 */
let getAnimations: () => Animation[] = () => [];

const neverFinishingAnimation = {
  // oxlint-disable-next-line effecttsgo/new-promise -- `Animation.finished` is a DOM contract, so the stub has to be a real Promise.
  finished: new Promise<Animation>(() => {}),
} as Animation;

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => getAnimations(),
  });
});

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

afterEach(() => {
  cleanup();
  getAnimations = () => [];
});

function renderTabs(orientation?: 'horizontal' | 'vertical') {
  return render(
    <Tabs defaultValue="details" orientation={orientation}>
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="pets">Pets</TabsTrigger>
      </TabsList>
      <TabsContent value="details">Details panel</TabsContent>
      <TabsContent value="pets">Pets panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  // Baseline. Passes against the stock registry component too — it describes
  // what Tabs owes a caller, and guards nothing this file adds.
  it('presents only the active panel', () => {
    renderTabs();

    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel').textContent).toBe('Details panel');
  });

  // Also passes against the stock registry component: with no animations,
  // `Promise.all([])` settles on the next frame and Base UI unmounts the
  // outgoing panel itself. Kept because it is the path the app actually takes,
  // but it is not the regression guard either.
  it('stops presenting the outgoing panel when no exit animation runs', async () => {
    renderTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Pets' }));

    await waitFor(() => {
      expect(screen.queryByText('Details panel')).toBeNull();
    });
    expect(screen.getByRole('tabpanel').textContent).toBe('Pets panel');
  });

  // THE regression guard for `withLeavingPanelHidden`: the only case here that
  // fails against the stock registry component, where the outgoing panel waits
  // on a report that never arrives and stays presented forever. Deleting this
  // deletes the coverage for the whole deviation. `getAllByRole` is what makes
  // it bite — the outgoing panel is still mounted, so only its removal from the
  // accessibility tree distinguishes hidden from presented.
  it('stops presenting the outgoing panel when an exit animation never finishes', async () => {
    getAnimations = () => [neverFinishingAnimation];

    renderTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Pets' }));

    await waitFor(() => {
      expect(screen.getByRole('tabpanel').textContent).toBe('Pets panel');
    });
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  // Guards the second deviation from the registry entry: stock `Tabs` styles a
  // vertical strip while leaving the primitive horizontal, so this fails there
  // (ArrowDown is inert in a horizontal Tabs).
  it('navigates a vertical Tabs with the vertical arrow keys', async () => {
    renderTabs('vertical');

    const detailsTab = screen.getByRole('tab', { name: 'Details' });
    detailsTab.focus();
    fireEvent.keyDown(detailsTab, { key: 'ArrowDown' });

    // Base UI moves focus in a microtask, so this cannot be asserted inline.
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('tab', { name: 'Pets' })
      );
    });
  });
});
