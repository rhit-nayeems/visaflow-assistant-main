# Deploy To Cloudflare Workers

This repo already uses TanStack Start with the Cloudflare Vite plugin, so the remaining work is mostly configuration.

## What is already prepared in this repo

- `wrangler.jsonc` is configured to deploy the TanStack Start server entry to Cloudflare Workers.
- `package.json` includes:
  - `npm run cf:login`
  - `npm run cf:whoami`
  - `npm run cf:typegen`
  - `npm run deploy`
- `.env.example` lists the environment variables this app expects.

## Commands you run locally

From the repo root:

```powershell
npm install
copy .env.example .env
```

Edit `.env` and replace the placeholder values.

Then authenticate and deploy:

```powershell
npm run cf:login
npm run cf:whoami
npm run build
npm run deploy
```

Your first deployment will give you a `*.workers.dev` URL.

## Manual Cloudflare dashboard steps

In Cloudflare, open `Workers & Pages -> visaflow-assistant -> Settings -> Variables and Secrets` and add:

Plain text variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_URL`

Secret:

- `SUPABASE_SERVICE_ROLE_KEY`

Notes:

- `APP_URL` should be your deployed app origin, for example `https://app.example.com`.
- This codebase currently does not import `src/integrations/supabase/client.server.ts` anywhere, so `SUPABASE_SERVICE_ROLE_KEY` is not exercised by the current app path. Keep it configured anyway if you plan to add server-side admin flows.

If you want a real domain instead of the default `workers.dev` address:

1. Open `Workers & Pages -> visaflow-assistant`.
2. Go to `Settings -> Domains & Routes`.
3. Add a custom domain such as `app.yourdomain.com`.

## Manual Supabase steps

### 1. Fix auth URL configuration

In Supabase, go to `Authentication -> URL Configuration`.

Set:

- `Site URL` = `https://your-app-domain.com`

Add redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://your-worker-subdomain.workers.dev/auth/callback`
- `https://your-app-domain.com/auth/callback`

If you keep using the temporary Cloudflare URL before adding a custom domain, use the `workers.dev` URL in both the site URL and redirect list until the real domain is ready.

### 2. Fix email confirmation / reset links

If your Supabase email templates still send people to a Lovable URL, open `Authentication -> Email Templates` and remove any hardcoded Lovable domain.

Use the redirect-aware template variables so Supabase sends users back to your app instead of an old builder URL.

### 3. Fix Google and Apple sign-in

The error:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: missing OAuth secret"}
```

means the provider is enabled in Supabase without a complete OAuth client configuration.

In Supabase, go to:

- `Authentication -> Providers -> Google`
- `Authentication -> Providers -> Apple`

Enter the provider credentials from Google Cloud and Apple Developer.

The OAuth callback you register with Google or Apple should be your Supabase auth callback, not your app callback:

```text
https://your-project-id.supabase.co/auth/v1/callback
```

Your app callback remains:

```text
https://your-app-domain.com/auth/callback
```

## After deployment, test these flows

1. Email signup
2. Email confirmation link
3. Forgot password
4. Password reset
5. Google sign-in
6. Apple sign-in
