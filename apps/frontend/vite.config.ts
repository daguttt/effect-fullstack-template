import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import { createEnv } from '@t3-oss/env-core';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import type { DotenvPopulateInput } from 'dotenv-expand';
import { expand } from 'dotenv-expand';
import * as Predicate from 'effect/Predicate';
import { defineConfig, loadEnv } from 'vite';

import * as Env from './src/modules/env/index.ts';

const rootMonorepoDir = path.resolve(import.meta.dirname, '../..');
const DEFAULT_VITE_DEV_SERVER_PORT = 5173;

const definedProcessEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] =>
      Predicate.isNotUndefined(entry[1])
    )
  );

function expandProcessEnv(prefix = 'VITE_') {
  const parsed = Object.fromEntries(
    Object.entries(definedProcessEnv()).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith(prefix) && Predicate.isNotUndefined(entry[1])
    )
  );
  const processEnv: DotenvPopulateInput = definedProcessEnv();

  expand({ parsed, processEnv });

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  return parsed;
}

export default defineConfig(({ command, mode }) => {
  const loadedEnv = loadEnv(mode, rootMonorepoDir, '');
  const runtimeEnv = {
    ...loadedEnv,
    ...expandProcessEnv(),
  };

  const env = createEnv({
    runtimeEnv,
    clientPrefix: 'VITE_',
    client: Env.clientSchema,
    emptyStringAsUndefined: true,
  });

  return {
    envDir: rootMonorepoDir,
    server: {
      port: env.VITE_DEV_SERVER_PORT ?? DEFAULT_VITE_DEV_SERVER_PORT,
      strictPort: true,
    },
    resolve: {
      alias: {
        '#modules': path.resolve(import.meta.dirname, 'src/modules'),
        '#routes': path.resolve(import.meta.dirname, 'src/routes'),
        '#': path.resolve(import.meta.dirname, 'src'),
      },
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routeFileIgnorePrefix: '-',
      }),
      react({
        include: /\/(apps\/frontend|packages\/ui)\/src\/.*\.[jt]sx?$/,
      }),
      babel({
        plugins: command === 'serve' ? ['@locator/babel-jsx/dist'] : [],
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
    ],
  };
});
