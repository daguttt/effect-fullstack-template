import { useState } from 'react';
import type * as React from 'react';

import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@repo/ui';

import type { AuthUser } from './user.models';
import { getUserDisplayName } from './user.utils';

export function UserAvatarMenu({ user }: { user: AuthUser }) {
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Open user menu"
          />
        }
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {getUserDisplayName(user.firstName, user.lastName)}
            </p>
            {user.email ? (
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <UserSignOutMenuItem />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DropdownMenuContentProps = React.ComponentProps<
  typeof DropdownMenuContent
>;

export function UserSessionMenu({
  user,
  contentSide,
  contentAlign = 'end',
  contentSideOffset = 4,
}: {
  user: NonNullable<AuthUser>;
  contentSide?: DropdownMenuContentProps['side'];
  contentAlign?: DropdownMenuContentProps['align'];
  contentSideOffset?: DropdownMenuContentProps['sideOffset'];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="group/menu-button flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-accent active:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground"
            aria-label="Open session menu"
          />
        }
      >
        <div className="flex w-full items-center gap-2 overflow-hidden">
          <UserSessionInfo
            user={user}
            className="flex-1"
            textClassName="group-data-[collapsible=icon]:hidden"
          />
          <span className="ml-auto group-data-[collapsible=icon]:hidden">
            {isOpen ? <ChevronRight /> : <ChevronDown />}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--anchor-width) min-w-56"
        side={contentSide}
        align={contentAlign}
        sideOffset={contentSideOffset}
      >
        <DropdownMenuGroup>
          <UserSignOutMenuItem />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserSessionInfo({
  user,
  className,
  textClassName,
}: {
  user: NonNullable<AuthUser>;
  className?: string;
  textClassName?: string;
}) {
  const displayName = getUserDisplayName(user.firstName, user.lastName);

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <UserAvatar user={user} />
      <p
        className={cn(
          'grid min-w-0 flex-1 text-left text-sm leading-tight',
          textClassName
        )}
      >
        <span className="truncate font-medium">{displayName}</span>
        {user.email ? (
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function UserSignOutMenuItem() {
  return (
    <DropdownMenuItem
      render={
        <Link className="flex items-center gap-2" to="/signout">
          <LogOut />
          Log out
        </Link>
      }
    />
  );
}

function UserAvatar({
  user: { firstName, lastName, email, profilePictureUrl },
}: {
  user: NonNullable<AuthUser>;
}) {
  const parsedFullname = [firstName, lastName].filter(Boolean);

  const initialFromFullname = parsedFullname.map((part) => part?.[0]).join('');
  const initialFromEmail = email?.[0] ?? '';
  const initials =
    initialFromFullname.toUpperCase() || initialFromEmail.toUpperCase() || '?';

  const fullname = parsedFullname.join(' ');
  const label = fullname ? `${fullname}'s profile photo` : 'User profile photo';

  return (
    <Avatar aria-label={label} title={fullname || email || undefined}>
      <AvatarImage
        src={profilePictureUrl ?? undefined}
        alt={label}
        referrerPolicy="no-referrer"
      />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
