export function Keycap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-current/30 bg-black/20 px-1.5 font-mono text-[11px] font-bold leading-none shadow-[0_2px_0_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </kbd>
  );
}
