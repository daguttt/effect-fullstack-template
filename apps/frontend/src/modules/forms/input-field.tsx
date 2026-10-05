import { type ComponentProps, type ReactNode, useId } from 'react';

import type { AnyFieldApi } from '@tanstack/react-form';
import * as Predicate from 'effect/Predicate';

import { Input, Label, cn } from '@repo/ui';

import { useFieldContext } from './form-context';

export type InputFieldProps = Omit<
  ComponentProps<typeof Input>,
  'id' | 'onBlur' | 'onChange' | 'value'
> & {
  id?: string;
  label: string;
  /** Sits beside the label, outside it, so it never joins the input's name. */
  labelHint?: ReactNode;
  numeric?: boolean;
  optional?: boolean;
};

export function InputField({
  id,
  label,
  labelHint,
  numeric = false,
  optional = false,
  required = false,
  className,
  inputMode,
  ...inputProps
}: InputFieldProps) {
  const field = useFieldContext<string | number>();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const error = getFieldErrorMessage(field);
  const hasNumberValue = typeof field.state.value === 'number';
  const shouldUseNumericPattern = numeric && !hasNumberValue;

  const labelElement = (
    <Label htmlFor={inputId} className="gap-1">
      {label}
      {required ? <span className="text-destructive">*</span> : null}
      {optional ? (
        <span className="font-normal text-muted-foreground">(Optional)</span>
      ) : null}
    </Label>
  );

  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={error ? '' : undefined}
    >
      {Predicate.isUndefined(labelHint) ? (
        labelElement
      ) : (
        <div className="flex items-center gap-1">
          {labelElement}
          {labelHint}
        </div>
      )}
      <Input
        {...inputProps}
        id={inputId}
        className={cn(className)}
        inputMode={numeric ? 'numeric' : inputMode}
        pattern={shouldUseNumericPattern ? '[0-9]*' : inputProps.pattern}
        type={hasNumberValue ? 'number' : inputProps.type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const nextValue = hasNumberValue
            ? event.target.valueAsNumber
            : numeric
              ? event.target.value.replace(/\D/g, '')
              : event.target.value;

          field.handleChange(nextValue);
        }}
        aria-invalid={Predicate.isNotNull(error)}
        aria-required={required}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function getFieldErrorMessage(field: AnyFieldApi) {
  const firstError = field.state.meta.errors.at(0) as
    { message?: string } | string | undefined;

  if (!firstError) return null;

  return typeof firstError === 'string'
    ? firstError
    : (firstError.message ?? null);
}
