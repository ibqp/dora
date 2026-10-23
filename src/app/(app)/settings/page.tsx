import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PageContent } from "@/components/common/page-content";
import { PageHeader } from "@/components/common/page-header";
import { ASSISTANT_NAME } from "@/config/app";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description={`Default ${ASSISTANT_NAME} role and simulated response delay for this demo.`}
      />
      <PageContent width="narrow">
        <EmptyState
          icon={SlidersHorizontal}
          title="Settings are not editable yet"
          description="Configuration of the default assistant role and the simulated response delay is not available in this version."
        />
      </PageContent>
    </>
  );
}
