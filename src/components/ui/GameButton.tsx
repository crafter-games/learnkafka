import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "accent" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-2xl font-display font-semibold cursor-pointer " +
  "transition-[transform,box-shadow,filter,border-color,background-color] duration-150 ease-out " +
  "hover:-translate-y-0.5 active:translate-y-[3px] disabled:pointer-events-none disabled:opacity-45 " +
  "focus-visible:outline-3 focus-visible:outline-offset-3";

const variants: Record<Variant, string> = {
  primary:
    "bg-producer text-[#2a1800] shadow-[0_5px_0_var(--producer-dark),0_14px_28px_-10px_rgba(255,176,32,0.7)] " +
    "hover:brightness-110 active:shadow-[0_2px_0_var(--producer-dark)] focus-visible:outline-producer",
  accent:
    "bg-partition text-bg shadow-[0_5px_0_var(--partition-dark),0_14px_28px_-12px_rgba(34,211,238,0.7)] " +
    "hover:brightness-110 active:shadow-[0_2px_0_var(--partition-dark)] focus-visible:outline-partition",
  secondary:
    "border-2 border-line bg-panel-2 text-text shadow-[0_4px_0_var(--bg-deep)] " +
    "hover:border-partition/50 active:shadow-[0_1px_0_var(--bg-deep)] focus-visible:outline-partition",
  ghost: "text-muted hover:text-text hover:bg-white/5 focus-visible:outline-partition",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-3.5 text-sm",
  md: "h-12 px-5 text-base",
  lg: "h-16 px-8 text-xl",
  icon: "size-11 text-xl",
};

type Props = { variant?: Variant; size?: Size };

export function gameButtonClass({ variant = "secondary", size = "md" }: Props = {}) {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

export function GameButton({ variant, size, className = "", ...rest }: Props & ComponentProps<"button">) {
  return <button type="button" className={`${gameButtonClass({ variant, size })} ${className}`} {...rest} />;
}
