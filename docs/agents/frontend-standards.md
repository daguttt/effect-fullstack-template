# Frontend Standards

## Backend-derived types

- Frontend-owned types are reserved for presentation-only state that has no backend representation; every persisted entity and function payload type is inferred from the backend.
- For Confect functions, infer arguments, decoded returns, and typed errors with `Ref.Args`, `Ref.Returns`, and `Ref.Error` from the generated `@repo/backend/refs` tree.
- Infer persisted documents from generated document types such as `UsersDoc` from `@repo/backend/docs`, or with Convex's generated `Doc<'tableName'>` where the generated data model is available.
- Infer an operation's document ID from that operation's function arguments; otherwise use the generated `Id<'tableName'>`.

## Route-local features

- Co-locate functionality shared within a route subtree in a `-feat/` directory.
- When an export's consumers span sibling subtrees — no single `-feat` is an ancestor of all of them — promote it to a `#modules/*` module. Promote on the third consumer.

## Forms

- Register reusable TanStack Form controls through the application form hook so forms can use `form.AppField` and field components such as `field.InputField`.

## TanStack tables

- Declare TanStack Table column definitions at module scope, outside React component functions.
- Use a module-scope column factory when cells need component callbacks, and memoize the factory result inside the component.

## Tailwind class values

- Wrap Tailwind class strings declared outside a common `className` JSX context with the `tw` tagged template or compose them with `cn` from `@repo/ui` so editor autocomplete and formatting can detect them.

## Toast notifications

- Use `toast` from `@repo/ui` (Sonner) for pending, success, and failure feedback from user actions.

## Mobile overlays

- Use `Sheet` for mobile modals and overlays.
- Overlay footers that contain actions must include mobile navigation and safe-area bottom clearance.
- Keep the form body scrollable while its action footer remains reachable.
