# Backend Standards

## Effect dependency declaration

Declare every service the scope yields _itself_ at the top of the Effect, immediately after the function/generator starts and before validation or business logic — including a service used on only one branch. "Itself" means this body writes `yield* Service` and uses the value here; services a called helper needs are that helper's to declare.

Why: the full dependency set is visible upfront, and a missing layer surfaces on the first run instead of on the code path that first yields the service.

## Confect modules

Split each module under `src/confect/modules/` into the layers it needs. Give each layer an `index.ts`, and re-export its public API from `modules/<name>/index.ts`.

- `domain/` — schemas, errors, tag unions, persisted field models, and total functions over loaded data. It is pure: no I/O.
- `application/` — use-case orchestration across domain logic, persistence, workflows, and external systems. It declares and consumes the interfaces that orchestration needs, leaving the concrete integrations to infrastructure.
- `infrastructure/` — concrete adapters and runtime wiring: SDK clients, configured integration instances, generated Convex components, provider-specific error mapping, and production or testing dependency layers.
- `presentation/` — outward-facing copy and wire encoding, such as `deriveUserMessage` and `dieWithConvexError`.

Infrastructure and presentation never import each other. `*.impl.ts` files provide the infrastructure layer to the functions they implement.

### Table schema ownership

The owning domain module defines the complete persisted field schema. Build derived DTOs and projections from the owning `<Entities>TableSchema` with `mapFields`, `Struct.pick`, and `Struct.omit`, so every persisted field is defined once.

### Load-context imports

Import a Confect module through the narrowest entry point the load context allows:

| Importing file                      | Import from                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `tables/*.ts` or `*.spec.ts`        | `modules/<name>/domain`                                                   |
| `*.impl.ts` and root `confect/*.ts` | `modules/<name>` or a specific layer; may import static `_generated/refs` |

This keeps two sensitive load graphs pure:

- Convex evaluates `tables/` in a schema isolate that rejects runtime imports.
- `confect:codegen` loads every `*.spec.ts`; reaching `_generated/refs` from a spec creates a cycle through `_generated/spec`.

Common violations have misleading symptoms:

| Symptom                                                                         | Cause                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `Cannot read properties of undefined (reading 'name')` during `confect:codegen` | A spec reached `_generated/refs` through a barrel    |
| `NoImportModuleInSchema: Can't import _deps/<chunk>.js while evaluating schema` | A table reached Convex runtime code through a barrel |
