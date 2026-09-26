import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';

export { UnsetKeys, unsetScoped, without };

const UnsetKeys = Context.Reference<ReadonlySet<string>>(
  '@repo/scripts/worktree/CommandEnvironment/UnsetKeys',
  { defaultValue: () => new Set<string>() }
);

const union = (keys: ReadonlyArray<string>) => (current: ReadonlySet<string>) =>
  new Set([...current, ...keys]);

const unsetScoped = (keys: ReadonlyArray<string>) =>
  Effect.updateServiceScoped(UnsetKeys, union(keys));

const without =
  (keys: ReadonlyArray<string>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.updateService(effect, UnsetKeys, union(keys));
