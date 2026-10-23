"use client";

import { MessageSquareText, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useBrds } from "@/components/brds/brds-provider";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/config/navigation";
import type { ChatSessionSummary } from "@/lib/api/types";
import { formatFullDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { RenameSessionDialog } from "./rename-session-dialog";
import { useSessions } from "./sessions-provider";

export const sessionPath = (sessionId: string) => `${ROUTES.newDiscovery}/${sessionId}`;

export function SessionListSkeleton() {
  return (
    <div className="space-y-2 px-2 py-1" role="status" aria-label="Loading sessions">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function SessionList() {
  const { sessions, status, error, reload, rename, remove } = useSessions();
  const { removeForSession } = useBrds();
  const pathname = usePathname();
  const router = useRouter();
  const [renaming, setRenaming] = useState<ChatSessionSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSessionSummary | null>(null);

  if (status === "loading" && sessions.length === 0) return <SessionListSkeleton />;

  if (status === "error") {
    return (
      <div className="space-y-2 px-2 py-1 text-xs text-muted-foreground">
        <p role="alert">Sessions could not be loaded. {error}</p>
        <Button size="xs" variant="outline" onClick={() => void reload()}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="flex items-start gap-2.5 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
        <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>No saved sessions yet. Start a New Discovery to create one.</span>
      </p>
    );
  }

  async function handleDelete(session: ChatSessionSummary) {
    await remove(session.id);
    removeForSession(session.id);
    if (pathname === sessionPath(session.id)) router.push(ROUTES.newDiscovery);
  }

  return (
    <>
      <ul className="space-y-0.5">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            active={pathname === sessionPath(session.id)}
            onRename={() => setRenaming(session)}
            onDelete={() => setDeleting(session)}
          />
        ))}
      </ul>

      <RenameSessionDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        currentTitle={renaming?.title ?? ""}
        onRename={async (title) => {
          if (renaming) await rename(renaming.id, title);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete discovery session?"
        description={
          <>
            “{deleting?.title}” will be permanently deleted, including its messages, collected requirements and BRD. This
            cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleting) await handleDelete(deleting);
        }}
      />
    </>
  );
}

interface SessionItemProps {
  session: ChatSessionSummary;
  active: boolean;
  onRename: () => void;
  onDelete: () => void;
}

function SessionItem({ session, active, onRename, onDelete }: SessionItemProps) {
  return (
    <li
      className={cn(
        "group/session relative flex items-center rounded-lg transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-secondary",
      )}
    >
      <Link
        href={sessionPath(session.id)}
        aria-current={active ? "page" : undefined}
        title={`${session.title} · last activity ${formatFullDateTime(session.updatedAt)}`}
        className="min-w-0 flex-1 truncate rounded-lg py-2 pr-9 pl-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {session.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${session.title}`}
            className={cn(
              "absolute right-1 opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
              active && "opacity-100",
            )}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
