import { HTMLAttributes } from "react";
import { clsx } from "clsx";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={clsx("animate-pulse rounded-ds-md bg-line/60 motion-reduce:animate-none", className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={clsx("h-3", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
