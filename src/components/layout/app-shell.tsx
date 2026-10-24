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
        {/* `relative` makes this frame the containing block of absolutely positioned elements
            (e.g. `sr-only` labels), so `overflow-hidden` clips them instead of letting them
            extend the document below the chat input. */}
        <div className="relative flex h-svh w-full overflow-hidden bg-background">
          <a
            href="#main-content"
            className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to main content
          </a>
          <AppSidebar />
          <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-y-auto outline-none">
            {children}
          </main>
        </div>
      </BrdsProvider>
    </SessionsProvider>
  );
}
