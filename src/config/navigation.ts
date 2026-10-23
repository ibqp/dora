import { FileText, MessageSquarePlus, Settings, type LucideIcon } from "lucide-react";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only active on the route itself, not on nested routes (which have their own entries). */
  exact?: boolean;
}

export const ROUTES = {
  home: "/",
  newDiscovery: "/discovery",
  brds: "/brds",
  settings: "/settings",
} as const;

export const NEW_DISCOVERY_ITEM: NavigationItem = {
  href: ROUTES.newDiscovery,
  label: "New Discovery",
  icon: MessageSquarePlus,
};

export const BRD_DOCUMENTS_ITEM: NavigationItem = {
  href: ROUTES.brds,
  label: "All BRD documents",
  icon: FileText,
  exact: true,
};

export const SETTINGS_ITEM: NavigationItem = {
  href: ROUTES.settings,
  label: "Settings",
  icon: Settings,
};

/** True when `pathname` is `href` itself or a nested route below it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
