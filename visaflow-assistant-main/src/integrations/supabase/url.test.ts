import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSupabaseUrl } from "./url.ts";

test("normalizeSupabaseUrl strips the PostgREST suffix", () => {
  assert.equal(
    normalizeSupabaseUrl("https://example.supabase.co/rest/v1"),
    "https://example.supabase.co",
  );
});

test("normalizeSupabaseUrl strips the auth suffix", () => {
  assert.equal(
    normalizeSupabaseUrl("https://example.supabase.co/auth/v1"),
    "https://example.supabase.co",
  );
});

test("normalizeSupabaseUrl trims whitespace and trailing slashes", () => {
  assert.equal(
    normalizeSupabaseUrl(" https://example.supabase.co/ "),
    "https://example.supabase.co",
  );
});
