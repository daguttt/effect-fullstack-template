import type * as React from 'react';

import { type CreateLinkProps, createLink } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';

import { buttonVariants, cn } from '@repo/ui';

type NavLinkButtonBaseProps = CreateLinkProps &
  React.ComponentProps<'a'> &
  VariantProps<typeof buttonVariants>;

export const NavLinkButton = createLink(function NavLinkButtonBase({
  className,
  variant = 'ghost',
  size = 'default',
  ref,
  ...props
}: NavLinkButtonBaseProps) {
  return (
    <a
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
