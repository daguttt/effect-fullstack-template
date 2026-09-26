/** WorkOS writes success to stdout and failure to stderr; the envelope shape remains authoritative. */
import * as Schema from 'effect/Schema';

export { CliEnvelope, CliEnvelopeFromJsonString, CliError };

const CliError = Schema.Struct({
  code: Schema.String,
  message: Schema.optionalKey(Schema.String),
});

/**
 * The envelope shell only. `data` is deliberately left as `Unknown` and decoded
 * separately by each caller against its own payload schema, so this codec stays
 * a single concrete type instead of a generic.
 *
 * Every field is optional so both shapes decode through one struct. Callers
 * branch on `error` first: a body carrying both keys is pathological, and
 * treating it as a failure is the safe reading.
 */
const CliEnvelope = Schema.Struct({
  status: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  data: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(CliError),
});

type CliEnvelope = typeof CliEnvelope.Type;

const CliEnvelopeFromJsonString = Schema.fromJsonString(CliEnvelope);
