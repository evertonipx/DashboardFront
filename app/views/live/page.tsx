import * as React from "react";

import { AuthGuard } from "@/components/app/auth-guard";
import { DeferredEmbeddedLiveView as EmbeddedLiveView } from "@/components/app/deferred-live-views";

export default function LiveViewPage() {
  return (
    <AuthGuard>
      <React.Suspense fallback={<ViewLoading />}>
        <EmbeddedLiveView />
      </React.Suspense>
    </AuthGuard>
  );
}

function ViewLoading() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="h-full w-full animate-pulse rounded-md bg-muted" />
    </main>
  );
}
