import { Package } from "@phosphor-icons/react/dist/ssr";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-lg bg-producer text-white shadow-[0_2px_0_var(--producer-dark)]">
        <Package size={20} weight="fill" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight max-sm:sr-only">Kafka Express</span>
    </span>
  );
}
