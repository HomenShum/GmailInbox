"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const sizeMap: Record<Size, string> = {
  xs: "px-2 h-6 text-[11px]",
  sm: "px-3 h-8 text-[12px]",
  md: "px-4 h-9 text-[13px]",
  lg: "px-5 h-10 text-[14px]",
};

const variantStyle: Record<Variant, React.CSSProperties> = {
  primary:   { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" },
  secondary: { background: "var(--bg-elev)", color: "var(--text)", border: "1px solid var(--border)" },
  ghost:     { background: "transparent", color: "var(--text-dim)", border: "1px solid transparent" },
  danger:    { background: "var(--err)", color: "white", border: "1px solid var(--err)" },
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "sm", className = "", children, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      style={{ ...variantStyle[variant], ...style }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 ${sizeMap[size]} ${className}`}
    >
      {children}
    </button>
  );
});
