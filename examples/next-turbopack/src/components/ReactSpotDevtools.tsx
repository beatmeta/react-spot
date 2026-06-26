"use client";

import { useEffect, useState } from "react";
import { installReactSpot, type ReactSpotTarget } from "react-spot";

function formatTarget(target: ReactSpotTarget | null) {
  if (!target?.source) {
    return "No source selected yet";
  }

  const { fileName, lineNumber, columnNumber } = target.source;
  return `${target.componentName ?? "unknown"} via ${target.strategy}: ${fileName}:${lineNumber ?? 1}:${columnNumber ?? 1}`;
}

export function ReactSpotDevtools() {
  const [target, setTarget] = useState<ReactSpotTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    return installReactSpot({
      trigger: "alt",
      onOpen(nextTarget) {
        setError(null);
        setTarget(nextTarget);
      },
      onError(nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    });
  }, []);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <aside className="spot-status" aria-live="polite">
      <strong>{error ? "react-spot error" : "react-spot target"}</strong>
      <code>{error ?? formatTarget(target)}</code>
    </aside>
  );
}
