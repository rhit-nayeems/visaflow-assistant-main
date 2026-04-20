const DEFAULT_POST_AUTH_PATH = "/dashboard";
const PASSWORD_RECOVERY_PATH = "/reset-password";
const AUTH_CALLBACK_PATH = "/auth/callback";

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const getConfiguredAppOrigin = () => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;

  return (
    env?.VITE_AUTH_REDIRECT_ORIGIN ??
    env?.VITE_APP_URL ??
    process.env.VITE_AUTH_REDIRECT_ORIGIN ??
    process.env.VITE_APP_URL ??
    process.env.APP_URL ??
    null
  );
};

export const resolveAppOrigin = (originOverride?: string | null) => {
  if (originOverride) {
    return trimTrailingSlashes(originOverride);
  }

  const configuredOrigin = getConfiguredAppOrigin();
  if (configuredOrigin) {
    return trimTrailingSlashes(configuredOrigin);
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  throw new Error(
    "Unable to determine the app origin for auth redirects. Set VITE_AUTH_REDIRECT_ORIGIN or APP_URL.",
  );
};

export const sanitizeAuthNextPath = (
  nextPath: string | null | undefined,
  fallbackPath = DEFAULT_POST_AUTH_PATH,
) => {
  if (typeof nextPath !== "string" || nextPath.length === 0) {
    return fallbackPath;
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallbackPath;
  }

  return nextPath;
};

export const buildAuthCallbackUrl = ({
  nextPath = DEFAULT_POST_AUTH_PATH,
  origin,
}: {
  nextPath?: string;
  origin?: string | null;
} = {}) => {
  const url = new URL(AUTH_CALLBACK_PATH, resolveAppOrigin(origin));
  const safeNextPath = sanitizeAuthNextPath(nextPath);

  if (safeNextPath !== DEFAULT_POST_AUTH_PATH) {
    url.searchParams.set("next", safeNextPath);
  }

  return url.toString();
};

const createUrlParams = (value: string) =>
  new URLSearchParams(value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value);

export const getAuthCallbackFlowType = ({ hash, search }: { hash: string; search: string }) => {
  const hashParams = createUrlParams(hash);
  const searchParams = createUrlParams(search);

  return hashParams.get("type") ?? searchParams.get("type");
};

export const getAuthCallbackErrorMessage = ({ hash, search }: { hash: string; search: string }) => {
  const hashParams = createUrlParams(hash);
  const searchParams = createUrlParams(search);

  return (
    searchParams.get("error_description") ??
    hashParams.get("error_description") ??
    searchParams.get("error") ??
    hashParams.get("error")
  );
};

export const getAuthCallbackCode = (search: string) => createUrlParams(search).get("code");

export const resolvePostAuthPath = ({ hash, search }: { hash: string; search: string }) => {
  const searchParams = createUrlParams(search);
  const nextPath = searchParams.get("next");
  const flowType = getAuthCallbackFlowType({ hash, search });

  return sanitizeAuthNextPath(
    nextPath,
    flowType === "recovery" ? PASSWORD_RECOVERY_PATH : DEFAULT_POST_AUTH_PATH,
  );
};

export const AUTH_PATHS = {
  callback: AUTH_CALLBACK_PATH,
  defaultPostAuth: DEFAULT_POST_AUTH_PATH,
  recovery: PASSWORD_RECOVERY_PATH,
} as const;
