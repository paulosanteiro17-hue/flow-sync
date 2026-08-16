'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { initials, type UserSummary } from '@flowsync/shared';
import { avatarTint, cn } from '@/lib/utils';

const SIZES = {
  xs: 'size-5 text-[10px]',
  sm: 'size-6 text-[11px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-lg',
} as const;

interface UserAvatarProps {
  user: Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>;
  size?: keyof typeof SIZES;
  className?: string;
  /** Set when the avatar is purely decorative next to a visible name. */
  decorative?: boolean;
}

export function UserAvatar({ user, size = 'md', className, decorative }: UserAvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full ring-1 ring-border',
        SIZES[size],
        className,
      )}
      {...(decorative ? { 'aria-hidden': true } : { title: user.name })}
    >
      {user.avatarUrl ? (
        <AvatarPrimitive.Image
          src={user.avatarUrl}
          alt={decorative ? '' : user.name}
          className="aspect-square size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        className={cn(
          'flex size-full items-center justify-center font-semibold',
          avatarTint(user.id),
        )}
        delayMs={user.avatarUrl ? 300 : 0}
      >
        {initials(user.name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

interface AvatarGroupProps {
  users: Array<Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>>;
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}

export function AvatarGroup({ users, max = 3, size = 'sm', className }: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div
      className={cn('flex -space-x-1.5', className)}
      aria-label={
        users.length > 0 ? `Assigned to ${users.map((user) => user.name).join(', ')}` : undefined
      }
    >
      {visible.map((user) => (
        <UserAvatar key={user.id} user={user} size={size} className="ring-2 ring-card" decorative />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card',
            SIZES[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
