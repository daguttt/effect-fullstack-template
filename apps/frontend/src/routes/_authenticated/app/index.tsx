import type * as Ref from '@confect/core/Ref';
import { QueryResult, useQuery } from '@confect/react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@workos-inc/authkit-react';

import refs from '@repo/backend/refs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@repo/ui';

import * as Authentication from '#modules/authentication';
import * as CommonUI from '#modules/common-ui';

import * as AppRouteFeat from './-feat';

export const Route = createFileRoute('/_authenticated/app/')({
  component: AppHomePage,
});

function AppHomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-3.5">
          <h1 className="text-xl font-semibold tracking-tight">
            {CommonUI.APP_NAME}
          </h1>
          <Authentication.UserAvatarMenu user={user} />
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <CurrentUserCard />
        <AppRouteFeat.ExampleWorkflowPanel />
      </main>
    </div>
  );
}

type CurrentUser = Ref.Returns<typeof refs.public.users.me>;

function CurrentUserCard() {
  const result = useQuery(refs.public.users.me, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed in</CardTitle>
        <CardDescription>
          Read from Convex through the typed `users.me` query.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {QueryResult.isSuccess(result) ? (
          <CurrentUserDetails user={result.value} />
        ) : (
          <Skeleton className="h-5 w-48" />
        )}
      </CardContent>
    </Card>
  );
}

function CurrentUserDetails({ user }: { user: CurrentUser }) {
  if (!user)
    return (
      <p className="text-sm text-muted-foreground">
        Waiting for the WorkOS webhook to sync your account.
      </p>
    );

  return (
    <p className="text-sm">
      {Authentication.getUserDisplayName(user.firstName, user.lastName)}{' '}
      <span className="text-muted-foreground">({user.email})</span>
    </p>
  );
}
