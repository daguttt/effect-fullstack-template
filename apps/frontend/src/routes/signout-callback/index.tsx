import { createFileRoute } from '@tanstack/react-router';

import * as SignoutCallbackRouteFeat from './-feat';

export const Route = createFileRoute('/signout-callback/')({
  component: SignOutCallbackPage,
});

function SignOutCallbackPage() {
  return <SignoutCallbackRouteFeat.SignOutCallbackScreen />;
}
