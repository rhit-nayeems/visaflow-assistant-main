const SUPABASE_URL_SUFFIXES = ["/rest/v1", "/auth/v1"] as const;

export function normalizeSupabaseUrl(value: string) {
  let normalized = value.trim().replace(/\/+$/, "");

  for (const suffix of SUPABASE_URL_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }

  return normalized;
}
