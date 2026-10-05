import { type ComponentProps, useId } from 'react';

import * as Predicate from 'effect/Predicate';

import { Label, Textarea, cn } from '@repo/ui';

import { useFieldContext } from './form-context';
import { getFieldErrorMessage } from './input-field';

export type TextareaFieldProps = Omit<
  ComponentProps<typeof Textarea>,
  'id' | 'onBlur' | 'onChange' | 'value'
> & {
  id?: string;
  label: string;
  maxLength: number;
  optional?: boolean;
};

export function TextareaField({
  id,
  label,
  maxLength,
  optional = false,
  required = false,
  className,
  ...textareaProps
}: TextareaFieldProps) {
  const field = useFieldContext<string>();
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const error = getFieldErrorMessage(field);

  return (
    <div
      className="flex w-full flex-col gap-1.5"
      data-invalid={error ? '' : undefined}
    >
      <Label htmlFor={textareaId} className="gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? (
          <span className="font-normal text-muted-foreground">(Optional)</span>
        ) : null}
      </Label>
      <Textarea
        {...textareaProps}
        id={textareaId}
        className={cn(className)}
        maxLength={maxLength}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={Predicate.isNotNull(error)}
        aria-required={required}
      />
      <div className="flex items-start justify-between gap-3">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {/* Keep the changing count silent for screen readers. */}
        <p
          className="ml-auto text-xs text-muted-foreground tabular-nums"
          aria-hidden="true"
        >
          {field.state.value.length}/{maxLength}
        </p>
      </div>
    </div>
  );
}
