"use client";

import { ReactSpot } from "react-spot";

export function ReactSpotDevtools() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <ReactSpot
      sourceRoot={process.env.NEXT_PUBLIC_SOURCE_ROOT}
      editorScheme="cursor"
    />
  );
}
