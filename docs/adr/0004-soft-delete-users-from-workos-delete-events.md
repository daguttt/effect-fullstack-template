# Soft Delete Users From WorkOS Delete Events

When WorkOS sends a `user.deleted` event, the local User is soft-deleted by setting `deletedAt` instead of removing the row, and every auth-facing lookup filters it out with `Users.isActiveOrNull`. Rows that reference the User keep a valid id, so history survives without cascading deletes, and a later `user.created` for the same email reactivates the same User. Features that grant access must revoke it here too, because a deleted external identity must retain no local access.
