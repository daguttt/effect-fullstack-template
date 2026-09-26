import { createFileRoute } from '@tanstack/react-router';

import * as CommonUI from '#modules/common-ui';

import * as SignoutRouteFeat from './-feat';

export const Route = createFileRoute('/_authenticated/signout/')({
  component: SignoutPage,
});

function SignoutPage() {
  SignoutRouteFeat.useSignOutOnce();

  return <CommonUI.GlobalSpinner message="Signing you out" />;
}
