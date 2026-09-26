import { createFormHook } from '@tanstack/react-form';

import { fieldContext, formContext } from './form-context';
import { InputField } from './input-field';
import { TextareaField } from './textarea-field';

export const { useAppForm } = createFormHook({
  fieldComponents: { InputField, TextareaField },
  formComponents: {},
  fieldContext,
  formContext,
});
