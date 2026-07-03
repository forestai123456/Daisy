import { useEffect, useState } from "react";

export type DiriState =
  | "idle"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error"
  | "hidden";

export function useDiriState() {
  const [state, setState] = useState<DiriState>("hidden");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubState = window.diriAPI.onStateUpdate((raw) => {
      try {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const next = data?.state || data || "idle";
        setState(next);
      } catch {
        setState("idle");
      }
    });

    const unsubShow = window.diriAPI.onShowWindow(() => setVisible(true));
    const unsubHide = window.diriAPI.onHideWindow(() => setVisible(false));

    return () => {
      unsubState();
      unsubShow();
      unsubHide();
    };
  }, []);

  return { state, visible };
}
