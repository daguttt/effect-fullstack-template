import { createEnv } from '@t3-oss/env-core';
import * as Schema from 'effect/Schema';

import * as Env from '#modules/env';

const validatedEnv = createEnv({
  runtimeEnv: import.meta.env,
  clientPrefix: 'VITE_',
  client: Env.clientSchema,
  shared: {
    BASE_URL: Schema.toStandardSchemaV1(Schema.String),
    MODE: Schema.toStandardSchemaV1(Schema.String),
    DEV: Schema.toStandardSchemaV1(Schema.Boolean),
    PROD: Schema.toStandardSchemaV1(Schema.Boolean),
    SSR: Schema.toStandardSchemaV1(Schema.Boolean),
  },
  emptyStringAsUndefined: true,
});

export const env = {
  DEV: validatedEnv.DEV,
  PROD: validatedEnv.PROD,
  MODE: validatedEnv.MODE,
  VITE_PR_PREVIEW: validatedEnv.VITE_PR_PREVIEW,
  VITE_CONVEX_URI: validatedEnv.VITE_CONVEX_URI,
  VITE_WORKOS_CLIENT_ID: validatedEnv.VITE_WORKOS_CLIENT_ID,
};

export const IS_PROD = env.PROD;
export const IS_DEV = env.DEV;
