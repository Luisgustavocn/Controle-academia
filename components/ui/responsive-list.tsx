import { ReactNode } from "react";
import { clsx } from "clsx";

export function ResponsiveList({ desktop, mobile, breakpoint = "md", className }: { desktop: ReactNode; mobile: ReactNode; breakpoint?: "sm" | "md" | "lg"; className?: string }) {
  const desktopClass = { sm: "sm:block", md: "md:block", lg: "lg:block" }[breakpoint];
  const mobileClass = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" }[breakpoint];
  return (
    <div className={className}>
      <div className={clsx("hidden", desktopClass)}>{desktop}</div>
      <div className={mobileClass}>{mobile}</div>
    </div>
  );
}
