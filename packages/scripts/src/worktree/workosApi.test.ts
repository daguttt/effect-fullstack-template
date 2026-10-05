import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Ref from 'effect/Ref';
import type * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientError from 'effect/http/HttpClientError';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';

import * as WorkosApi from './workosApi.ts';

const API_KEY = `sk_test_${'a'.repeat(40)}`;
const WEBHOOK_SECRET = `whsec_${'b'.repeat(32)}`;
const WEBHOOK_URL = 'https://test.convex.site/workos/webhook';
const EVENTS = ['user.created', 'user.deleted'];

type RecordedRequest = {
  readonly method: string;
  readonly url: string;
  readonly authorization: 'the environment key' | 'something else';
  readonly body: unknown;
};

const endpointPayload = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  object: 'webhook_endpoint',
  id: 'we_01JABCDEF',
  endpoint_url: WEBHOOK_URL,
  secret: WEBHOOK_SECRET,
  status: 'enabled',
  events: EVENTS,
  created_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
  ...overrides,
});

const listPayload = (
  data: ReadonlyArray<Record<string, unknown>>,
  after: string | null = null
) => ({ object: 'list', data, list_metadata: { before: null, after } });

const decodeJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown)
);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Records whether authorization matched without storing the credential. */
const withRecordedHttp = Effect.fn('withRecordedHttp')(function* <A, E>(
  respond: (request: RecordedRequest, callIndex: number) => Response,
  use: (workosApi: WorkosApi.WorkosApi['Service']) => Effect.Effect<A, E, never>
) {
  const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([]);
  const client = HttpClient.make((request, url) =>
    Effect.gen(function* () {
      const body =
        request.body._tag === 'Uint8Array'
          ? yield* decodeJson(new TextDecoder().decode(request.body.body)).pipe(
              Effect.orDie
            )
          : undefined;
      const recorded: RecordedRequest = {
        method: request.method,
        url: url.toString(),
        authorization:
          request.headers.authorization === `Bearer ${API_KEY}`
            ? 'the environment key'
            : 'something else',
        body,
      };
      const callIndex = (yield* Ref.get(requests)).length;
      yield* Ref.update(requests, (seen) => [...seen, recorded]);

      return HttpClientResponse.fromWeb(request, respond(recorded, callIndex));
    })
  );

  const workosApi = yield* WorkosApi.WorkosApi.pipe(
    Effect.provide(
      WorkosApi.WorkosApi.layer.pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient)(client))
      )
    )
  );
  const outcome = yield* Effect.result(use(workosApi));

  return { outcome, requests: yield* Ref.get(requests) };
});

const ensure = (workosApi: WorkosApi.WorkosApi['Service']) =>
  workosApi.ensureWebhookEndpoint(
    { url: WEBHOOK_URL, events: EVENTS },
    Redacted.make(API_KEY)
  );

const failureMessage = (
  outcome: Result.Result<unknown, WorkosApi.WorkosApiError>
) =>
  outcome._tag === 'Failure'
    ? outcome.failure.message
    : 'the call unexpectedly succeeded';

describe('ensureWebhookEndpoint', () => {
  it.effect('creates the endpoint when no endpoint claims the URL', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(listPayload([]))
            : jsonResponse(endpointPayload(), 201),
        ensure
      );

      expect(outcome._tag).toBe('Success');
      expect(requests).toHaveLength(2);
      expect(requests[1]?.method).toBe('POST');
      expect(requests[1]?.url).toBe('https://api.workos.com/webhook_endpoints');
      expect(requests[1]?.authorization).toBe('the environment key');
      expect(requests[1]?.body).toStrictEqual({
        endpoint_url: WEBHOOK_URL,
        events: EVENTS,
      });
    })
  );

  it.effect('returns the signing secret as a Redacted value', () =>
    Effect.gen(function* () {
      const { outcome } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(listPayload([]))
            : jsonResponse(endpointPayload(), 201),
        ensure
      );

      const endpoint = outcome._tag === 'Success' ? outcome.success : undefined;
      expect(Redacted.value(endpoint?.secret ?? Redacted.make(''))).toBe(
        WEBHOOK_SECRET
      );
      // oxlint-disable-next-line typescript/no-base-to-string -- Effect Redacted.toString() returns '<redacted>'.
      expect(String(endpoint?.secret)).not.toContain(WEBHOOK_SECRET);
    })
  );

  it.effect('reuses an endpoint whose status and events already match', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        // Event equality is set-based, so the response order may differ.
        () =>
          jsonResponse(
            listPayload([endpointPayload({ events: [...EVENTS].reverse() })])
          ),
        ensure
      );

      expect(outcome._tag).toBe('Success');
      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe('GET');
    })
  );

  it.effect('re-enables and resubscribes an endpoint that drifted', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(
                listPayload([
                  endpointPayload({
                    status: 'disabled',
                    events: ['user.created'],
                  }),
                ])
              )
            : jsonResponse(endpointPayload()),
        ensure
      );

      expect(outcome._tag).toBe('Success');
      expect(requests).toHaveLength(2);
      expect(requests[1]?.method).toBe('PATCH');
      expect(requests[1]?.url).toBe(
        'https://api.workos.com/webhook_endpoints/we_01JABCDEF'
      );
      expect(requests[1]?.body).toStrictEqual({
        status: 'enabled',
        events: EVENTS,
      });
    })
  );

  it.effect('follows the list cursor instead of creating a duplicate', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(
                listPayload(
                  [
                    endpointPayload({
                      id: 'we_other',
                      endpoint_url: 'https://other.convex.site/workos/webhook',
                    }),
                  ],
                  'we_other'
                )
              )
            : jsonResponse(listPayload([endpointPayload()])),
        ensure
      );

      expect(outcome._tag).toBe('Success');
      expect(requests).toHaveLength(2);
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
      expect(requests[1]?.url).toContain('after=we_other');
    })
  );

  it.effect('catches duplicate endpoints split across two list pages', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(
                listPayload([endpointPayload({ id: 'we_first' })], 'we_first')
              )
            : jsonResponse(listPayload([endpointPayload({ id: 'we_second' })])),
        ensure
      );

      expect(outcome._tag).toBe('Failure');
      expect(failureMessage(outcome)).toContain('we_first');
      expect(failureMessage(outcome)).toContain('we_second');
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    })
  );

  it.effect('refuses to choose between duplicate endpoints for one URL', () =>
    Effect.gen(function* () {
      const { outcome, requests } = yield* withRecordedHttp(
        () =>
          jsonResponse(
            listPayload([
              endpointPayload({ id: 'we_first' }),
              endpointPayload({ id: 'we_second' }),
            ])
          ),
        ensure
      );

      expect(outcome._tag).toBe('Failure');
      expect(failureMessage(outcome)).toContain('we_first');
      expect(failureMessage(outcome)).toContain('we_second');
      expect(requests).toHaveLength(1);
    })
  );

  it.effect.each([401, 403, 422, 429, 500])(
    'turns a %i response into a safe error',
    (status) =>
      Effect.gen(function* () {
        const { outcome } = yield* withRecordedHttp(
          () =>
            jsonResponse(
              { message: `denied for ${API_KEY}`, code: 'unauthorized' },
              status
            ),
          ensure
        );

        const message = failureMessage(outcome);
        expect(outcome._tag).toBe('Failure');
        expect(message).toContain(`HTTP ${status}`);
        expect(message).not.toContain(API_KEY);
        expect(message).not.toContain('denied for');
      })
  );

  it.effect('fails schema decoding when a success body is malformed', () =>
    Effect.gen(function* () {
      const { outcome } = yield* withRecordedHttp(
        (_, callIndex) =>
          callIndex === 0
            ? jsonResponse(listPayload([]))
            : jsonResponse({ id: 'we_01JABCDEF', secret: WEBHOOK_SECRET }, 201),
        ensure
      );

      expect(outcome._tag).toBe('Failure');
      expect(failureMessage(outcome)).toContain('webhook endpoint create');
      expect(failureMessage(outcome)).not.toContain(WEBHOOK_SECRET);
    })
  );

  it.effect('never retries a create, so a lost response cannot duplicate', () =>
    Effect.gen(function* () {
      const requests = yield* Ref.make<ReadonlyArray<string>>([]);
      const client = HttpClient.make((request) =>
        Effect.gen(function* () {
          const seen = yield* Ref.get(requests);
          yield* Ref.update(requests, (methods) => [
            ...methods,
            request.method,
          ]);

          return seen.length === 0
            ? HttpClientResponse.fromWeb(request, jsonResponse(listPayload([])))
            : yield* new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  description: 'socket hang up',
                }),
              });
        })
      );

      const workosApi = yield* WorkosApi.WorkosApi.pipe(
        Effect.provide(
          WorkosApi.WorkosApi.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient)(client))
          )
        )
      );
      const outcome = yield* Effect.result(ensure(workosApi));

      expect(outcome._tag).toBe('Failure');
      expect(yield* Ref.get(requests)).toStrictEqual(['GET', 'POST']);
      expect(failureMessage(outcome)).not.toContain(API_KEY);
    })
  );
});
