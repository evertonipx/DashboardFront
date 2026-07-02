import * as React from "react";

import { AuthGuard } from "@/components/app/auth-guard";
import { EmbeddedLiveView } from "@/components/app/embedded-live-view";

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
