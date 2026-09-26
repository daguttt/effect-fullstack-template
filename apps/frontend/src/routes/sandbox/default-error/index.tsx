import { createFileRoute } from '@tanstack/react-router';

import * as CommonUI from '#modules/common-ui';

export const Route = createFileRoute('/sandbox/default-error/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <CommonUI.DefaultRouteErrorComponent
      error={new Error('Something went wrong')}
      reset={() => {}}
    />
  );
}
