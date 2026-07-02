export const LIVE_REFRESH_EVENT = "ipxdata:live-refresh";

export function requestLiveRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LIVE_REFRESH_EVENT));
}
