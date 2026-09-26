import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { CliEnvelopeFromJsonString } from './envelope.ts';

const decode = (body: string) =>
  Effect.runSync(Schema.decodeEffect(CliEnvelopeFromJsonString)(body));

const PROVISION_FIXTURE = JSON.stringify({
  status: 'ok',
  message: 'Environment provisioned',
  data: {
    name: 'unclaimed-2',
    type: 'sandbox',
    active: true,
    apiKey: `sk_test_${'a'.repeat(75)}`,
    clientId: `client_${'0'.repeat(26)}`,
    claimToken: '0'.repeat(25),
    authkitDomain: 'scholarly-night-29-sandbox.authkit.app',
  },
});

const SEED_FIXTURE = JSON.stringify({
  status: 'ok',
  message: 'Seed complete',
  state: {
    permissions: [],
    roles: [],
    organizations: [],
    createdAt: '2026-09-03T00:00:00.000Z',
  },
});

const NO_ENVIRONMENTS_FIXTURE =
  '{"error":{"code":"no_environments","message":"No environments configured. Run `workos env add` to get started."}}';

/**
 * Verbatim output of `workos env list --json --insecure-storage` against an
 * empty registry. Note the absent `status` field — the envelope must not
 * require it.
 */
const EMPTY_LIST_FIXTURE = '{"data":[]}';

const ENV_LIST_FIXTURE = JSON.stringify({
  status: 'ok',
  data: [
    {
      name: 'unclaimed',
      type: 'sandbox',
      active: true,
      endpoint: 'https://api.workos.com',
      hasApiKey: true,
      hasClientId: true,
    },
  ],
});

describe('CliEnvelope', () => {
  it('decodes a provision success body', () => {
    const envelope = decode(PROVISION_FIXTURE);

    expect(envelope.error).toBeUndefined();
    expect(envelope.status).toBe('ok');
    expect(envelope.data).toMatchObject({ name: 'unclaimed-2' });
  });

  it('decodes a seed success body, which carries no data member', () => {
    const envelope = decode(SEED_FIXTURE);

    expect(envelope.error).toBeUndefined();
    expect(envelope.status).toBe('ok');
    expect(envelope.data).toBeUndefined();
  });

  it('decodes the error body the CLI writes to stderr', () => {
    const envelope = decode(NO_ENVIRONMENTS_FIXTURE);

    expect(envelope.error?.code).toBe('no_environments');
    expect(envelope.status).toBeUndefined();
  });

  it('decodes an array payload', () => {
    const envelope = decode(ENV_LIST_FIXTURE);

    expect(envelope.error).toBeUndefined();
    expect(envelope.data).toHaveLength(1);
  });

  it('decodes a success body that omits status entirely', () => {
    const envelope = decode(EMPTY_LIST_FIXTURE);

    expect(envelope.error).toBeUndefined();
    expect(envelope.status).toBeUndefined();
    expect(envelope.data).toStrictEqual([]);
  });

  it('rejects a body that is not JSON', () => {
    expect(() => decode('workos: command not found')).toThrow();
  });
});
