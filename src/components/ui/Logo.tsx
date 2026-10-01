import { Package } from "@phosphor-icons/react/dist/ssr";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-xl bg-producer text-[#2a1800] shadow-[0_4px_0_var(--producer-dark)]">
        <Package size={24} weight="fill" />
      </span>
      {!compact && (
        <span className="font-display text-xl font-bold tracking-tight">
          Kafka <span className="text-producer">Express</span>
        </span>
      )}
    </span>
  );
}
