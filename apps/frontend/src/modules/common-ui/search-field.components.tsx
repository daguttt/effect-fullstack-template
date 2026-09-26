import { Search, X } from 'lucide-react';

import { Button, Input, cn } from '@repo/ui';

/**
 * Text input with a leading magnifier and a Clear button that appears once
 * there is something to clear.
 *
 * Purely presentational — the caller owns the text and decides what committing
 * it means. `useUrlSyncedSearchTerm` is the intended source for `text` /
 * `onTextChange` / `onClear`.
 *
 * It lives here rather than in a route's `-feat` because its consumers are
 * sibling listings — Customers and Pets — and no `-feat` is an ancestor of
 * both.
 */
export function SearchField({
  text,
  onTextChange,
  onClear,
  placeholder,
  ariaLabel,
  className,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onClear: () => void;
  placeholder: string;
  /**
   * What this field searches, named for screen readers.
   *
   * Required rather than defaulted: the label was hardcoded to "Search
   * customers" while this component lived in the Customers `-feat`, and the
   * second listing to use it would otherwise have announced the wrong entity
   * with nothing to catch it.
   */
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-8"
      />
      {text.length > 0 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={onClear}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
