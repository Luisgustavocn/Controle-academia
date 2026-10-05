"use client";

import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import type { Capability } from "@/lib/auth/capabilities";

const CapabilityContext = createContext<ReadonlySet<Capability> | null>(null);

export function CapabilityProvider({ capabilities, children }: PropsWithChildren<{ capabilities: readonly Capability[] }>) {
  const value = useMemo(() => new Set(capabilities), [capabilities]);
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

export function useHasCapability(capability?: Capability): boolean {
  const capabilities = useContext(CapabilityContext);
  if (!capability) return true;
  return capabilities?.has(capability) ?? false;
}
