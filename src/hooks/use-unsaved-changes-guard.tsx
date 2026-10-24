"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

/**
 * Warns before leaving a page with unsaved changes:
 * - reload, closing the tab and external links → the browser's own "Leave site?" prompt;
 * - in-app links (sidebar, Back to Discovery, …) → a confirmation dialog. Confirming discards
 *   the changes (`onDiscard`) and then navigates.
 * Browser back/forward cannot be intercepted in the App Router; the hidden page keeps its
 * state (Activity) and shows the unsaved changes again on return.
 * Listeners exist only while `dirty` and while the page is visible (effects pause in Activity).
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  onDiscard: () => void,
  /** What has unsaved changes, for the dialog text (e.g. "this BRD"). */
  subject = "this page",
) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Required by some browsers to show the prompt.
      event.returnValue = "";
    }

    // Capture phase on document: runs before React's (and next/link's) click handlers.
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href);
      // Other origins unload the page and get the beforeunload prompt instead.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [dirty]);

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      onOpenChange={(open) => !open && setPendingHref(null)}
      title="Discard unsaved changes?"
      description={`Your changes to ${subject} have not been saved. If you leave this page, they will be discarded.`}
      cancelLabel="Stay on page"
      confirmLabel="Discard and leave"
      destructive
      onConfirm={() => {
        if (pendingHref === null) return;
        onDiscard();
        router.push(pendingHref);
      }}
    />
  );

  return { dialog };
}
