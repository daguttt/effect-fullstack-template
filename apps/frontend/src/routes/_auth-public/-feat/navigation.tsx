import * as CommonUI from '#modules/common-ui';

export function Navigation() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex items-center justify-between gap-6 px-6 py-3.5">
        <h1 className="text-xl font-semibold tracking-tight">
          {CommonUI.APP_NAME}
        </h1>
      </div>
    </header>
  );
}
