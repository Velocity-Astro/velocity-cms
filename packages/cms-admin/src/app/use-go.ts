import { useCallback } from "react";
import { useNavigate, type NavigateOptions } from "react-router";

/**
 * Goes to another screen. Every screen changes the same way: where the browser can, the old
 * screen fades as the new one comes in, and where it can't, the new one is simply shown.
 */
export function useGo(): (to: string, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (to, options) => void navigate(to, { viewTransition: true, ...options }),
    [navigate],
  );
}
