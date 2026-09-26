import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useControllableState } from './use-controllable-state';

describe('useControllableState', () => {
  it('uses defaultProp in uncontrolled mode', () => {
    const { result } = renderHook(() =>
      useControllableState({
        prop: undefined,
        defaultProp: 'hello',
        name: 'TextInput',
      })
    );

    expect(result.current[0]).toBe('hello');
  });

  it('uses prop in controlled mode', () => {
    const { result } = renderHook(() =>
      useControllableState({
        prop: 'controlled',
        defaultProp: 'default',
        name: 'TextInput',
      })
    );

    expect(result.current[0]).toBe('controlled');
  });

  it('calls onChange when the setter requests a new value', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({
        prop: 'controlled',
        defaultProp: 'default',
        onChange,
        name: 'TextInput',
      })
    );

    act(() => result.current[1]('next'));

    expect(onChange).toHaveBeenCalledWith('next');
  });

  it('updates internal state in uncontrolled mode', () => {
    const { result } = renderHook(() =>
      useControllableState({
        prop: undefined,
        defaultProp: 'initial',
        name: 'TextInput',
      })
    );

    act(() => result.current[1]('next'));

    expect(result.current[0]).toBe('next');
  });

  it('does not update internal state in controlled mode', () => {
    const { result } = renderHook(() =>
      useControllableState({
        prop: 'controlled',
        defaultProp: 'default',
        name: 'TextInput',
      })
    );

    act(() => result.current[1]('next'));

    expect(result.current[0]).toBe('controlled');
  });

  it('does nothing when the requested value is Object.is-equal to the current value', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({
        prop: Number.NaN,
        defaultProp: 0,
        onChange,
        name: 'NumberInput',
      })
    );

    act(() => result.current[1](Number.NaN));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports functional updates', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useControllableState({
        prop: undefined,
        defaultProp: false,
        onChange,
        name: 'Toggle',
        state: 'pressed',
      })
    );

    act(() => result.current[1]((current) => !current));

    expect(result.current[0]).toBe(true);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps the latest onChange callback without changing the setter', () => {
    const firstOnChange = vi.fn();
    const latestOnChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ onChange }) =>
        useControllableState({
          prop: 'controlled',
          defaultProp: 'default',
          onChange,
          name: 'TextInput',
        }),
      { initialProps: { onChange: firstOnChange } }
    );
    const setValue = result.current[1];

    rerender({ onChange: latestOnChange });
    act(() => setValue('next'));

    expect(result.current[1]).toBe(setValue);
    expect(firstOnChange).not.toHaveBeenCalled();
    expect(latestOnChange).toHaveBeenCalledWith('next');
  });
});
