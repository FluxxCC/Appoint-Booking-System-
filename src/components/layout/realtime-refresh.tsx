"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Scope = "application" | "public";
type ConnectionState = "connecting" | "live" | "reconnecting";
const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/**
 * Realtime messages are deliberately empty invalidation hints. The refreshed
 * route is rendered again on the server and applies the existing authorization
 * checks before it reads any database data.
 */
export function RealtimeRefresh({ scope = "application", indicator = false, compact = false }: { scope?: Scope; indicator?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>(() => supabaseConfigured ? "connecting" : "reconnecting");

  useEffect(() => {
    if (!supabaseConfigured) return;
    const client = createClient();

    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    const refreshSoon = () => {
      if (document.visibilityState !== "visible" || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        router.refresh();
      }, 250);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSoon();
      else if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const topic = scope === "application" ? "app:changes" : "public:changes";
    const channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "refresh" }, refreshSoon)
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (fallbackTimer) clearInterval(fallbackTimer);
          fallbackTimer = undefined;
          setConnection("live");
        } else {
          setConnection("reconnecting");
          if (!fallbackTimer) fallbackTimer = setInterval(refreshSoon, 30_000);
        }
      });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void client.removeChannel(channel);
    };
  }, [router, scope]);

  if (!indicator) return null;

  const label = connection === "live" ? "Live updates" : connection === "connecting" ? "Connecting" : "Reconnecting";
  return <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-muted sm:px-3" role="status" aria-live="polite" aria-label={label} title={label}>
    <span aria-hidden="true" className={`size-2 rounded-full ${connection === "live" ? "bg-success" : connection === "connecting" ? "animate-pulse bg-warning" : "bg-muted"}`} />
    <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
  </span>;
}
