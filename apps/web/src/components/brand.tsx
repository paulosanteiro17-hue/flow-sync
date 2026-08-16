import { cn } from '@/lib/utils';

/**
 * The FlowSync mark: two offset columns with a card crossing between them — the
 * product's core gesture (moving work across a board) reduced to a glyph.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      className={cn('size-7', className)}
      aria-hidden
      focusable="false"
    >
      <rect x="1.5" y="4.5" width="10" height="19" rx="3" className="fill-primary/15" />
      <rect x="16.5" y="4.5" width="10" height="19" rx="3" className="fill-primary/15" />
      <rect x="3.5" y="7" width="6" height="4" rx="1.5" className="fill-primary" />
      <rect x="18.5" y="14" width="6" height="4" rx="1.5" className="fill-primary" />
      <path
        d="M10.5 12.6h6.2"
        className="stroke-primary"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="2.6 2.6"
      />
      <path
        d="M15.2 10.9 17.4 12.6l-2.2 1.7"
        className="stroke-primary"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <Logo />
      <span className="text-[15px]">FlowSync</span>
    </span>
  );
}
