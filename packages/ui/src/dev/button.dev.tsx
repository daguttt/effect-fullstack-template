import { Button } from '#components/ui/button';

export const title = 'Button';
export const description =
  'Basic shadcn-style button variants exported from the library entrypoint.';

function ButtonPlayground() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-3">
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link button</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Icon action">
          T
        </Button>
        <Button
          nativeButton={false}
          variant="default"
          render={<a href="#">Link as button</a>}
        />
      </div>
    </div>
  );
}

export default ButtonPlayground;
