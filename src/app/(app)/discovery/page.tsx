import type { Metadata } from "next";

import { NewDiscoveryChat } from "@/components/discovery/new-discovery-chat";

export const metadata: Metadata = { title: "New Discovery" };

export default function NewDiscoveryPage() {
  return <NewDiscoveryChat />;
}
