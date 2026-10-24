import type { Metadata } from "next";

import { PageContent } from "@/components/common/page-content";
import { PageHeader } from "@/components/common/page-header";
import { SettingsView } from "@/components/settings/settings-form";
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
        <SettingsView />
      </PageContent>
    </>
  );
}
