"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "../nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-border bg-surface md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-4 py-3 md:py-4">
        <Plug className="size-5 text-accent" aria-hidden />
        <span className="text-sm font-semibold">Fluig Integration Studio</span>
      </div>

      <nav
        aria-label="Principal"
        className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-4"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground",
                active && "bg-surface-2 text-foreground",
              )}
            >
              <Icon
                className={cn("size-4", active && "text-accent")}
                aria-hidden
              />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
