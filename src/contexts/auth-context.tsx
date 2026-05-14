import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "dispatcher" | "driver" | "viewer";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  approved: boolean | null; // null while loading
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshApproval: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      console.error("Failed to load user roles", error);
      setRoles([]);
      return;
    }
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  const fetchApproval = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("approved")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("Failed to load approval status", error);
      setApproved(false);
      return;
    }
    setApproved(((data as { approved?: boolean } | null)?.approved ?? false) === true);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => {
          void fetchRoles(newSession.user.id);
          void fetchApproval(newSession.user.id);
        }, 0);
      } else {
        setRoles([]);
        setApproved(null);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void Promise.all([
          fetchRoles(data.session.user.id),
          fetchApproval(data.session.user.id),
        ]).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      user: session?.user ?? null,
      roles,
      approved,
      loading,
      hasRole: (role) => roles.includes(role),
      hasAnyRole: (rs) => rs.some((r) => roles.includes(r)),
      signOut: async () => {
        // Clear any case-intake drafts (decedent PII) before ending the session.
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith("case-intake-draft:")) sessionStorage.removeItem(k);
          }
        } catch {
          // ignore storage access errors
        }
        await supabase.auth.signOut();
      },
      refreshRoles: async () => {
        if (session?.user) await fetchRoles(session.user.id);
      },
      refreshApproval: async () => {
        if (session?.user) await fetchApproval(session.user.id);
      },
    };
  }, [session, roles, approved, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
