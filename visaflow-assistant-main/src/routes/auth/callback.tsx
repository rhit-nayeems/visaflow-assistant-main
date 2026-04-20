import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AlertBanner } from "@/components/shared/AlertBanner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getAuthCallbackCode,
  getAuthCallbackErrorMessage,
  resolvePostAuthPath,
} from "@/lib/auth-redirect";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      const locationState = {
        hash: window.location.hash,
        search: window.location.search,
      };
      const directError = getAuthCallbackErrorMessage(locationState);

      if (directError) {
        if (!cancelled) {
          setError(directError);
        }
        return;
      }

      const {
        data: { session: existingSession },
        error: existingSessionError,
      } = await supabase.auth.getSession();

      if (existingSessionError) {
        if (!cancelled) {
          setError(existingSessionError.message);
        }
        return;
      }

      if (existingSession) {
        await navigate({
          to: resolvePostAuthPath(locationState),
          replace: true,
        });
        return;
      }

      const code = getAuthCallbackCode(locationState.search);
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          if (!cancelled) {
            setError(exchangeError.message);
          }
          return;
        }
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (!cancelled) {
          setError(sessionError.message);
        }
        return;
      }

      if (!session) {
        if (!cancelled) {
          setError("Authentication link is invalid, expired, or returned without a session.");
        }
        return;
      }

      await navigate({
        to: resolvePostAuthPath(locationState),
        replace: true,
      });
    };

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {error ? (
          <div className="space-y-4">
            <AlertBanner variant="error" title="Authentication failed" description={error} />
            <Button asChild className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Finishing sign-in</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Finalizing your secure authentication and redirecting you now.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
