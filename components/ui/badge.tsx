import { PropsWithChildren } from "react";
import { clsx } from "clsx";

type Tone = "neutral" | "good" | "warn" | "bad";

const tones: Record<Tone, string> = {
  neutral: "bg-accentSoft text-muted",
  good: "bg-[#f9d5db] text-accentDark",
  warn: "bg-[#ffd9dc] text-warning",
  bad: "bg-[#2a2024] text-white"
};

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: Tone }>) {
  return <span className={clsx("inline-flex rounded-full px-2 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}
