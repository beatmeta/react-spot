"use client";

import { ShowComponent } from "react-spot";

export function ReactSpotDevtools() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <ShowComponent
      sourceRoot={process.env.NEXT_PUBLIC_SOURCE_ROOT}
      editorScheme="cursor"
    />
  );
}
