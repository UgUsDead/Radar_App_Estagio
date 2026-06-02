import { useRef, useCallback } from "react";

export function useInteractionManager() {
  const interactingRef = useRef(false);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markInteracting = useCallback(() => {
    interactingRef.current = true;
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    // Auto-resume after 12s of no interaction to avoid permanent stall
    interactionTimerRef.current = setTimeout(() => {
      interactingRef.current = false;
    }, 12_000);
  }, []);

  const markDoneInteracting = useCallback(() => {
    // Small delay so the load() call that follows an action doesn't get skipped
    setTimeout(() => {
      interactingRef.current = false;
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    }, 300);
  }, []);

  return {
    interactingRef,
    markInteracting,
    markDoneInteracting,
  };
}
