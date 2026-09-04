import * as React from "react";

import { AuthGuard } from "@/components/app/auth-guard";
import { DeferredLiveVideoWallView as LiveVideoWallView } from "@/components/app/deferred-live-views";

export default function LiveVideoWallPage() {
  return (
    <AuthGuard>
      <React.Suspense fallback={<WallLoading />}>
        <LiveVideoWallView />
      </React.Suspense>
    </AuthGuard>
  );
}

function WallLoading() {
  return (
    <main className="h-screen w-screen animate-pulse bg-muted" />
  );
}
