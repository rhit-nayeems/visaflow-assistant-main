import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_PATHS,
  buildAuthCallbackUrl,
  getAuthCallbackCode,
  getAuthCallbackErrorMessage,
  getAuthCallbackFlowType,
  resolveAppOrigin,
  resolvePostAuthPath,
  sanitizeAuthNextPath,
} from "./auth-redirect.ts";

test("buildAuthCallbackUrl defaults to the dashboard callback path", () => {
  assert.equal(
    buildAuthCallbackUrl({ origin: "https://visaflow.example.com/" }),
    "https://visaflow.example.com/auth/callback",
  );
});

test("buildAuthCallbackUrl includes a safe non-default next path", () => {
  assert.equal(
    buildAuthCallbackUrl({
      origin: "https://visaflow.example.com",
      nextPath: AUTH_PATHS.recovery,
    }),
    "https://visaflow.example.com/auth/callback?next=%2Freset-password",
  );
});

test("sanitizeAuthNextPath rejects external redirect targets", () => {
  assert.equal(sanitizeAuthNextPath("https://evil.example.com"), AUTH_PATHS.defaultPostAuth);
  assert.equal(sanitizeAuthNextPath("//evil.example.com"), AUTH_PATHS.defaultPostAuth);
});

test("resolvePostAuthPath prefers recovery when the flow type is recovery", () => {
  assert.equal(
    resolvePostAuthPath({
      search: "",
      hash: "#type=recovery",
    }),
    AUTH_PATHS.recovery,
  );
});

test("resolvePostAuthPath respects a safe explicit next path", () => {
  assert.equal(
    resolvePostAuthPath({
      search: "?next=%2Fsettings",
      hash: "#type=signup",
    }),
    "/settings",
  );
});

test("auth callback helpers read code, flow type, and error state from the URL", () => {
  assert.equal(getAuthCallbackCode("?code=abc123&next=%2Fdashboard"), "abc123");
  assert.equal(
    getAuthCallbackFlowType({
      search: "",
      hash: "#type=recovery",
    }),
    "recovery",
  );
  assert.equal(
    getAuthCallbackErrorMessage({
      search: "?error_description=OAuth+failed",
      hash: "",
    }),
    "OAuth failed",
  );
});

test("resolveAppOrigin trims trailing slashes from explicit origins", () => {
  assert.equal(resolveAppOrigin("https://visaflow.example.com///"), "https://visaflow.example.com");
});
