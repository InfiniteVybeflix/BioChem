"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/domain";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/domain";
import { can, type Capability } from "@/lib/rbac";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface UserContextValue {
  supabase: SupabaseClient<Database> | null;
  userId: string | null;
  profile: Profile | null;
  role: UserRole | "guest";
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  children,
  initialProfile = null,
}: {
  children: ReactNode;
  initialProfile?: Profile | null;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [userId, setUserId] = useState<string | null>(initialProfile?.id ?? null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (user) {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data ?? null);
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [supabase, refresh]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setProfile(null);
    setUserId(null);
  }, [supabase]);

  const role: UserRole | "guest" = profile?.role ?? (userId ? "student" : "guest");

  const value = useMemo<UserContextValue>(
    () => ({
      supabase,
      userId,
      profile,
      role,
      loading,
      refresh,
      signOut,
      can: (capability: Capability) => can(role, capability),
    }),
    [supabase, userId, profile, role, loading, refresh, signOut],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
}
