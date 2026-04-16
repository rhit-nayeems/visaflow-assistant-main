import type { Session } from "@supabase/supabase-js";

export const buildSupabaseServerFnHeaders = (session: Session | null): HeadersInit => {
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("You must be signed in to continue.");
  }

  return {
    authorization: `Bearer ${accessToken}`,
  };
};
