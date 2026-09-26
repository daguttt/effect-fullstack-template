'use client';

import * as React from 'react';

import { useControlled } from '@base-ui/utils/useControlled';

type SetStateAction<T> = T | ((previousValue: T) => T);

export type UseControllableStateParams<T> = {
  prop: T | undefined;
  defaultProp: T;
  onChange?: (value: T) => void;
  name: string;
  state?: string;
};

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
  name,
  state = 'value',
}: UseControllableStateParams<T>) {
  const [value, setValueIfUncontrolled] = useControlled({
    controlled: prop,
    default: defaultProp,
    name,
    state,
  });

  const onChangeRef = React.useRef(onChange);

  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setValue = React.useCallback(
    (nextValue: SetStateAction<T>) => {
      const resolvedValue =
        typeof nextValue === 'function'
          ? (nextValue as (previousValue: T) => T)(value)
          : nextValue;

      if (Object.is(resolvedValue, value)) {
        return;
      }

      setValueIfUncontrolled(resolvedValue);
      onChangeRef.current?.(resolvedValue);
    },
    [setValueIfUncontrolled, value]
  );

  return [value, setValue] as const;
}
