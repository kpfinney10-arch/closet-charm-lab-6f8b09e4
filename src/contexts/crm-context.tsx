import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCrmMemberships, type CrmMembership } from "@/lib/crm-context.functions";

type CrmContextValue = {
  loading: boolean;
  memberships: CrmMembership[];
  currentOrg: CrmMembership | null;
  isAdmin: boolean;
};

const CrmContext = createContext<CrmContextValue | undefined>(undefined);

export function CrmProvider({ children }: { children: ReactNode }) {
  const fetchMemberships = useServerFn(getMyCrmMemberships);
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "memberships"],
    queryFn: () => fetchMemberships({}),
    staleTime: 60_000,
  });

  const value = useMemo<CrmContextValue>(() => {
    const memberships = (data ?? []).filter((m) => m.approved);
    const currentOrg = memberships[0] ?? null;
    return {
      loading: isLoading,
      memberships,
      currentOrg,
      isAdmin: currentOrg?.crm_role === "crm_admin",
    };
  }, [data, isLoading]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within CrmProvider");
  return ctx;
}
