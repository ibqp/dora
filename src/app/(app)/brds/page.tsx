import type { Metadata } from "next";

import { PageContent } from "@/components/common/page-content";
import { PageHeader } from "@/components/common/page-header";
import { BrdList } from "@/components/brds/brd-list";

export const metadata: Metadata = { title: "BRD Documents" };

export default function BrdDocumentsPage() {
  return (
    <>
      <PageHeader
        title="BRD Documents"
        description="Business Requirements Documents generated from discovery sessions (one per session)."
      />
      <PageContent>
        <BrdList />
      </PageContent>
    </>
  );
}
