"use client";

import dynamic from "next/dynamic";

const EmbeddedLiveViewRuntime = dynamic(
  () =>
    import("@/components/app/embedded-live-view").then(
      (module) => module.EmbeddedLiveView,
    ),
  { loading: EmbeddedViewLoading, ssr: false },
);

const LiveVideoWallViewRuntime = dynamic(
  () =>
    import("@/components/app/live-video-wall-view").then(
      (module) => module.LiveVideoWallView,
    ),
  { loading: VideoWallLoading, ssr: false },
);

export function DeferredEmbeddedLiveView() {
  return <EmbeddedLiveViewRuntime />;
}

export function DeferredLiveVideoWallView() {
  return <LiveVideoWallViewRuntime />;
}

function EmbeddedViewLoading() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="h-full w-full animate-pulse rounded-md bg-muted" />
    </main>
  );
}

function VideoWallLoading() {
  return <main className="h-screen w-screen animate-pulse bg-muted" />;
}
