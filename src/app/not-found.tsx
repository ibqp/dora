import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageContent } from "@/components/common/page-content";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/navigation";

export default function NotFound() {
  return (
    <AppShell>
      <PageContent width="narrow">
        <EmptyState
          icon={SearchX}
          title="Page not found"
          description="The page you are looking for does not exist or is no longer available."
          action={
            <Button asChild variant="outline">
              <Link href={ROUTES.newDiscovery}>Go to New Discovery</Link>
            </Button>
          }
        />
      </PageContent>
    </AppShell>
  );
}
