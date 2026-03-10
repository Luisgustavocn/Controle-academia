"use client";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
        window.location.replace("/login");
      }}
    >
      Sair
    </Button>
  );
}
