"use client";

import { Children, cloneElement, isValidElement, KeyboardEvent, ReactElement, ReactNode, useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";

type DropdownMenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  label?: string;
  align?: "start" | "end";
  className?: string;
};

export function DropdownMenu({ trigger, children, label = "Abrir menu", align = "end", className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function items() {
    return menuRef.current ? Array.from(menuRef.current.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])")) : [];
  }

  function openAndFocus(position: "first" | "last" = "first") {
    setOpen(true);
    requestAnimationFrame(() => {
      const menuItems = items();
      (position === "last" ? menuItems[menuItems.length - 1] : menuItems[0])?.focus();
    });
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const menuItems = items();
    const current = menuItems.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      menuItems[(current + 1 + menuItems.length) % menuItems.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      menuItems[(current - 1 + menuItems.length) % menuItems.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      menuItems[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      menuItems[menuItems.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={clsx("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openAndFocus())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAndFocus("first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus("last");
          }
        }}
        className="inline-flex h-control-md items-center justify-center gap-2 rounded-ds-lg border border-line bg-card px-3 text-sm font-semibold text-ink shadow-surface-sm transition hover:bg-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {trigger}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={clsx("absolute top-[calc(100%+0.375rem)] z-40 min-w-48 rounded-ds-lg border border-line bg-card p-1.5 shadow-surface-md", align === "end" ? "right-0" : "left-0")}
        >
          {Children.map(children, (child) =>
            isValidElement(child)
              ? cloneElement(child as ReactElement<DropdownMenuItemProps>, {
                  closeMenu: () => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                })
              : child
          )}
        </div>
      ) : null}
    </div>
  );
}

export type DropdownMenuItemProps = {
  children: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  closeMenu?: () => void;
  className?: string;
};

export function DropdownMenuItem({ children, onSelect, destructive, disabled, closeMenu, className }: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        closeMenu?.();
      }}
      className={clsx(
        "flex w-full items-center rounded-ds-md px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:bg-accentSoft disabled:cursor-not-allowed disabled:opacity-50",
        destructive ? "text-danger hover:bg-dangerSoft focus-visible:bg-dangerSoft" : "text-ink hover:bg-accentSoft",
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
