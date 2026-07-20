import * as React from "react";

import { AuthGuard } from "@/components/app/auth-guard";
import { LiveVideoWallView } from "@/components/app/live-video-wall-view";

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
