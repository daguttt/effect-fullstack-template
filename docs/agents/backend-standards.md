# Backend Standards

## Effect dependency declaration

Declare every service the scope yields _itself_ at the top of the Effect, immediately after the function/generator starts and before validation or business logic — including a service used on only one branch. "Itself" means this body writes `yield* Service` and uses the value here; services a called helper needs are that helper's to declare.

Why: the full dependency set is visible upfront, and a missing layer surfaces on the first run instead of on the code path that first yields the service.

## Concurrency

Run independent work passed to `Effect.all` concurrently. Use the greatest safe concurrency supported by the operations, and preserve ordering only where a real dependency exists:

```ts
const program = Effect.gen(function* () {
    const [userByExternalId, userByEmail] = yield* Effect.all(
        [
            Users.getOneByExternalId(args.workosUser.id),
            Users.getOneByEmail(args.workosUser.email),
        ],
        { concurrency: 'unbounded' }
    );

    const isIdentityConflict =
        Predicate.isNotNull(userByExternalId) &&
        Predicate.isNotNull(userByEmail) &&
        userByExternalId._id !== userByEmail._id;

    if (isIdentityConflict)
        return yield* new Users.IdentityConflictError({
            externalUserId: args.workosUser.id,
            email: args.workosUser.email,
        });
});
```

## Confect modules

Split each module under `src/confect/modules/` into the layers it needs. Give each layer an `index.ts`, and re-export its public API from `modules/<name>/index.ts`.

- `domain/` — schemas, errors, tag unions, persisted field models, and total functions over loaded data. It is pure: its only `_generated` imports are `_generated/id` and type-only imports from `_generated/docs`. A module that owns a persisted entity defines its complete field schema as `<Entities>TableSchema` in `domain/models.ts`.
- `application/` — use-case orchestration across domain logic, persistence, workflows, and external systems. It declares and consumes the interfaces that orchestration needs, leaving the concrete integrations to infrastructure.
- `infrastructure/` — concrete adapters and runtime wiring: SDK clients, configured integration instances, generated Convex components, provider-specific error mapping, and production or testing dependency layers.
- `presentation/` — outward-facing copy and wire encoding, such as `deriveUserMessage` and `dieWithConvexError`.

Dependencies point inward: `infrastructure → application → domain` and `presentation → domain`. `*.impl.ts` files provide the infrastructure layer to the functions they implement.

### Table schema ownership

The owning domain module defines the complete persisted field schema. Files under `tables/*.ts` are adapters that register the domain schema with Confect and declare its indexes:

```ts
export default Table.make(
    () => ExampleWorkflowsDomain.ExampleWorkflowRunsTableSchema
).index('by_requestedBy', ['requestedBy']);
```

Build derived DTOs and projections from the owning `<Entities>TableSchema` with `mapFields`, `Struct.pick`, and `Struct.omit`, so every persisted field is defined once.

### Load-context imports

Import a Confect module through the narrowest entry point the load context allows:

| Importing file                      | Import from                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `tables/*.ts` or `*.spec.ts`        | `modules/<name>/domain`                                                   |
| `*.impl.ts` and root `confect/*.ts` | `modules/<name>` or a specific layer; may import static `_generated/refs` |

This keeps two sensitive load graphs pure:

- Convex evaluates `tables/` in a schema isolate that rejects runtime imports.
- `confect:codegen` loads every `*.spec.ts`; reaching `_generated/refs` from a spec creates a cycle through `_generated/spec`.

Convex's V8 runtime rejects dynamic `import()`, so `refs`-dependent code moves into `*.impl.ts`.

Use namespace imports for module and cross-layer APIs. Name a module barrel `<Module>` (`ExampleWorkflows`), a cross-module layer `<Module><Layer>` (`UsersDomain`), and an intra-module layer `<Layer>` (`Domain`). Within the same layer, use plain named imports (`import { identifier } from './file'`).

Common violations have misleading symptoms:

| Symptom                                                                         | Cause                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `Cannot read properties of undefined (reading 'name')` during `confect:codegen` | A spec reached `_generated/refs` through a barrel    |
| `NoImportModuleInSchema: Can't import _deps/<chunk>.js while evaluating schema` | A table reached Convex runtime code through a barrel |
| `TypeError: dynamic module import unsupported`                                  | Runtime code used dynamic `import()`                 |
