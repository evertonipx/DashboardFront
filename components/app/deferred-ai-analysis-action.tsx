"use client";

import * as React from "react";
import { BrainCog, Loader2 } from "lucide-react";

import type {
  AiAnalysisActionProps,
  AiAnalysisActionRuntimeProps,
} from "@/components/app/ai-analysis-action";
import { useAuth } from "@/components/app/auth-provider";
import { Button } from "@/components/ui/button";
import { hasMasterAccess } from "@/lib/access";
import {
  createAiInsightsAvailabilityScopeKey,
  isAiInsightsFailClosedError,
  subscribeAiInsightsAvailability,
  type AiInsightsAvailabilitySnapshot,
} from "@/lib/ai-insights-availability";
import { purgeLegacyAiInsightsLocalSettings } from "@/lib/ai-insights-storage-keys";
import { useEffectiveCompanyScopeId } from "@/lib/master-company-scope";

type AiAnalysisActionRuntime = React.ComponentType<
  AiAnalysisActionRuntimeProps
>;

let runtimePromise: Promise<AiAnalysisActionRuntime> | null = null;

function loadAiAnalysisActionRuntime() {
  runtimePromise ??= import("@/components/app/ai-analysis-action").then(
    (module) => module.AiAnalysisAction,
  );
  return runtimePromise;
}

export function AiAnalysisAction(props: AiAnalysisActionProps) {
  const { loading: authLoading, user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const userId = user?.id ?? "";
  const masterAccess = hasMasterAccess(user);
  const activeScopeKey = createAiInsightsAvailabilityScopeKey({
    companyScopeId,
    module: props.source.module,
    surface: props.source.surface,
    userId,
  });
  const [availabilityState, setAvailabilityState] = React.useState<{
    scopeKey: string;
    value: AiInsightsAvailabilitySnapshot;
  } | null>(null);
  const availabilityStateRef = React.useRef(availabilityState);
  const [runtimeState, setRuntimeState] = React.useState<{
    Component: AiAnalysisActionRuntime;
    scopeKey: string;
  } | null>(null);
  const [loadingRuntime, setLoadingRuntime] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const requestSequence = React.useRef(0);
  const releasesRef = React.useRef(new Set<() => void>());
  const runtimeSequence = React.useRef(0);

  const refreshAvailability = React.useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (authLoading || !userId || !companyScopeId) {
      availabilityStateRef.current = null;
      setAvailabilityState(null);
      return;
    }

    const subscription = subscribeAiInsightsAvailability({
      companyScopeId,
      module: props.source.module,
      scopeKey: activeScopeKey,
      surface: props.source.surface,
    });
    releasesRef.current.add(subscription.release);

    try {
      const snapshot = await subscription.promise;
      if (requestSequence.current !== requestId) return;
      const nextState = { scopeKey: activeScopeKey, value: snapshot };
      availabilityStateRef.current = nextState;
      setAvailabilityState(nextState);
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      if (
        isAiInsightsFailClosedError(error) ||
        availabilityStateRef.current?.scopeKey !== activeScopeKey
      ) {
        availabilityStateRef.current = null;
        setAvailabilityState(null);
      }
    } finally {
      releasesRef.current.delete(subscription.release);
      subscription.release();
    }
  }, [
    activeScopeKey,
    authLoading,
    companyScopeId,
    props.source.module,
    props.source.surface,
    userId,
  ]);

  React.useEffect(() => {
    const releases = releasesRef.current;
    requestSequence.current += 1;
    runtimeSequence.current += 1;
    availabilityStateRef.current = null;
    setAvailabilityState(null);
    setRuntimeState(null);
    setLoadingRuntime(false);
    setAnnouncement("");
    void refreshAvailability();
    const handleFocus = () => void refreshAvailability();
    window.addEventListener("focus", handleFocus);
    return () => {
      requestSequence.current += 1;
      runtimeSequence.current += 1;
      window.removeEventListener("focus", handleFocus);
      for (const release of releases) release();
      releases.clear();
    };
  }, [refreshAvailability]);

  React.useEffect(() => {
    if (!userId || !companyScopeId || masterAccess) return;
    purgeLegacyAiInsightsLocalSettings({
      companyId: companyScopeId,
      userId,
    });
  }, [companyScopeId, masterAccess, userId]);

  const availability =
    availabilityState?.scopeKey === activeScopeKey
      ? availabilityState.value
      : null;
  const available = Boolean(availability?.status.available);

  function preloadRuntime() {
    const request = loadAiAnalysisActionRuntime();
    void request.catch(() => {
      if (runtimePromise === request) runtimePromise = null;
    });
  }

  async function openAdvisor() {
    if (!availability || loadingRuntime) return;
    const requestedScopeKey = activeScopeKey;
    const requestId = ++runtimeSequence.current;
    setLoadingRuntime(true);
    setAnnouncement("Abrindo IA Advisor.");
    try {
      let request = loadAiAnalysisActionRuntime();
      let Component: AiAnalysisActionRuntime;
      try {
        Component = await request;
      } catch {
        if (runtimePromise === request) runtimePromise = null;
        request = loadAiAnalysisActionRuntime();
        Component = await request;
      }
      if (
        runtimeSequence.current !== requestId ||
        requestedScopeKey !== activeScopeKey
      ) {
        return;
      }
      setRuntimeState({ Component, scopeKey: requestedScopeKey });
      setAnnouncement("");
    } catch {
      if (runtimeSequence.current !== requestId) return;
      runtimePromise = null;
      setAnnouncement("Não foi possível abrir o IA Advisor. Tente novamente.");
    } finally {
      if (runtimeSequence.current === requestId) setLoadingRuntime(false);
    }
  }

  if (!available || !availability) return null;

  if (runtimeState?.scopeKey === activeScopeKey) {
    const Runtime = runtimeState.Component;
    return (
      <Runtime
        {...props}
        availability={availability}
        initialDialogOpen
      />
    );
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0 border-primary/25 bg-primary/[0.045] text-primary shadow-sm transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40"
        aria-busy={loadingRuntime}
        aria-label="Abrir IA Advisor desta visão"
        aria-haspopup="dialog"
        aria-expanded={false}
        disabled={loadingRuntime}
        title="Abrir IA Advisor"
        onFocus={preloadRuntime}
        onMouseEnter={preloadRuntime}
        onPointerDown={preloadRuntime}
        onClick={() => void openAdvisor()}
      >
        {loadingRuntime ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <BrainCog className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        )}
      </Button>
    </>
  );
}
