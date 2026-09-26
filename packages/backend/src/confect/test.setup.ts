/// <reference types="vite/client" />
import { TestConfect as TestConfect_ } from '@confect/test';

import convexSchema from './_generated/convexSchema';
import confectSchema from './_generated/schema';

export const TestConfect = TestConfect_.TestConfect<typeof confectSchema>();

// oxlint-disable-next-line effecttsgo/lazy-effect -- `@confect/test` intentionally returns a factory so each test receives an isolated Layer.
export const layer = TestConfect_.layer(
  confectSchema,
  convexSchema,
  import.meta.glob([
    '/src/convex/**/*.{ts,js}',
    '!/src/convex/**/*.config.{ts,js}',
    '!/src/convex/**/*.d.ts',
    '!/src/convex/**/*.setup.{ts,js}',
    '!/src/convex/**/*.spec.{ts,js}',
    '!/src/convex/**/*.test.{ts,js}',
  ])
);
