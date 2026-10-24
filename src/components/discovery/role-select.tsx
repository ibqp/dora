"use client";

import { AssistantRole } from "@/generated/prisma/enums";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_PROFILES } from "@/lib/mock-ai/roles";

const ROLES = Object.values(AssistantRole);

interface RoleSelectProps {
  value: AssistantRole | null;
  onChange: (role: AssistantRole) => void;
  disabled?: boolean;
}

export function RoleSelect({ value, onChange, disabled }: RoleSelectProps) {
  return (
    <Select value={value ?? undefined} onValueChange={(role) => onChange(role as AssistantRole)} disabled={disabled}>
      <SelectTrigger size="sm" aria-label="Assistant role" className="w-[15.5rem] max-w-full bg-background">
        <SelectValue placeholder="Assistant role" />
      </SelectTrigger>
      <SelectContent align="end" position="popper" className="w-80">
        {ROLES.map((role) => (
          <SelectItem key={role} value={role} className="items-start py-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium">{ROLE_PROFILES[role].label}</span>
              <span className="text-xs text-muted-foreground in-data-[slot=select-value]:hidden">
                {ROLE_PROFILES[role].summary}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
