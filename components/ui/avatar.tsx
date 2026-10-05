"use client";

import { ImgHTMLAttributes, useState } from "react";
import { clsx } from "clsx";

type AvatarSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg"
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "").join("") || "?";
}

export function Avatar({ src, name, alt, size = "md", className, onError, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null; name: string; size?: AvatarSize }) {
  const [failed, setFailed] = useState(false);
  const base = clsx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accentSoft font-semibold text-accentDark", sizes[size], className);
  if (!src || failed) return <span className={base} role="img" aria-label={alt || name}>{initials(name)}</span>;
  // Native img accepts runtime branding/data URLs without requiring a global Next Image host allowlist.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt || name} className={clsx(base, "object-cover")} onError={(event) => { setFailed(true); onError?.(event); }} {...props} />;
}
