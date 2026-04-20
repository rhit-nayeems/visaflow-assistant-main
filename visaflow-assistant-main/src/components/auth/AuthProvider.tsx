import { useState, useEffect, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AppRole, type AuthState } from "@/lib/auth";

const loadUserRoles = async (userId: string): Promise<AppRole[]> => {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);

  if (error) {
    console.error("[auth] failed to load roles", error);
    return [];
  }

  return (data ?? []).map(({ role }) => role);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (nextSession: Session | null) => {
      if (cancelled) {
        return;
      }

      setIsLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRoles([]);
        setIsLoading(false);
        return;
      }

      const nextRoles = await loadUserRoles(nextSession.user.id);

      if (cancelled) {
        return;
      }

      setRoles(nextRoles);
      setIsLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      void applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user,
    session,
    roles,
    isSchoolAdmin: roles.includes("school_admin"),
    isLoading,
    isAuthenticated: !!session,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}
