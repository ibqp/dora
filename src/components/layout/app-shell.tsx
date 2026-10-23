import type { ReactNode } from "react";

import { BrdsProvider } from "@/components/brds/brds-provider";
import { SessionsProvider } from "@/components/sessions/sessions-provider";

import { AppSidebar } from "./app-sidebar";

/**
 * Desktop-first frame: fixed-width sidebar and a main column that scrolls on its own.
 * `min-w-0` on the main column lets content shrink instead of overflowing horizontally.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionsProvider>
      <BrdsProvider>
        <div className="flex h-svh w-full overflow-hidden bg-background">
          <AppSidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
        </div>
      </BrdsProvider>
    </SessionsProvider>
  );
}
