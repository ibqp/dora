"use client";

import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { BrdSidebarList, BrdSidebarListSkeleton } from "@/components/brds/brd-sidebar-list";
import { SessionList, SessionListSkeleton } from "@/components/sessions/session-list";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_NAME, ASSISTANT_NAME } from "@/config/app";
import {
  BRD_DOCUMENTS_ITEM,
  isActivePath,
  NEW_DISCOVERY_ITEM,
  ROUTES,
  SETTINGS_ITEM,
  type NavigationItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * The sidebar is prerendered as part of the static shell. Only the parts that depend on the
 * current URL (active states, session list) are wrapped in Suspense, because the pathname of a
 * dynamic route such as /discovery/[sessionId] is only known at request time.
 */
export function AppSidebar() {
  const NewDiscoveryIcon = NEW_DISCOVERY_ITEM.icon;

  return (
    <aside
      aria-label="Main navigation"
      className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground xl:w-72"
    >
      <Link
        href={ROUTES.newDiscovery}
        className="flex items-center gap-3 px-5 pt-5 pb-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessagesSquare className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-base leading-tight font-semibold tracking-tight text-foreground">
            {ASSISTANT_NAME}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{APP_NAME}</span>
        </span>
      </Link>

      <div className="px-3 pb-3">
        <Button asChild size="lg" className="w-full justify-start shadow-xs">
          <Link href={NEW_DISCOVERY_ITEM.href}>
            <NewDiscoveryIcon aria-hidden />
            {NEW_DISCOVERY_ITEM.label}
          </Link>
        </Button>
      </div>

      {/* Radix wraps the viewport content in a `display: table` div, which defeats text truncation. */}
      <ScrollArea className="min-h-0 flex-1 border-t border-sidebar-border [&_[data-slot=scroll-area-viewport]>div]:block!">
        <nav aria-label="Discovery sessions and documents" className="space-y-6 px-3 py-4">
          <SidebarSection title="Discovery Sessions">
            <Suspense fallback={<SessionListSkeleton />}>
              <SessionList />
            </Suspense>
          </SidebarSection>

          <SidebarSection title="BRD Documents">
            <ActiveNavLink item={BRD_DOCUMENTS_ITEM} />
            <Suspense fallback={<BrdSidebarListSkeleton />}>
              <BrdSidebarList />
            </Suspense>
          </SidebarSection>
        </nav>
      </ScrollArea>

      <div className="space-y-3 border-t border-sidebar-border px-3 py-3">
        <ActiveNavLink item={SETTINGS_ITEM} />
        <p className="px-2 text-[11px] leading-snug text-muted-foreground">
          Educational prototype · rule-based assistant, no AI service · fictional data
        </p>
      </div>
    </aside>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActiveNavLink({ item }: { item: NavigationItem }) {
  return (
    <Suspense fallback={<SidebarNavLink item={item} active={false} />}>
      <PathnameNavLink item={item} />
    </Suspense>
  );
}

function PathnameNavLink({ item }: { item: NavigationItem }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : isActivePath(pathname, item.href);
  return <SidebarNavLink item={item} active={active} />;
}

function SidebarNavLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
