# react-spot

Dev-only DOM to source opener for React 19, Next.js, and Turbopack.

It does not inject `data-*` attributes at compile time. In the browser it finds the React Fiber attached to a clicked DOM node, walks `fiber.return` and owner metadata, reads React development source hints such as `_debugSource`, `_debugStack`, `_debugInfo`, and owner stacks, then calls a local `__open-in-editor` endpoint.

This intentionally depends on React private development fields. The library keeps those reads isolated and returns diagnostics when React, Next.js, or Turbopack do not expose enough metadata.

## Install

```bash
npm install react-spot
```

## Next.js App Router

Create the endpoint:

```ts
// app/__open-in-editor/route.ts
export { GET, POST, runtime, dynamic } from "react-spot/next";
```

Install the click listener in a client component:

```tsx
"use client";

import { useEffect } from "react";
import { installReactSpot } from "react-spot";

export function ReactSpotDevtools() {
  useEffect(() => {
    return installReactSpot({
      trigger: "alt"
    });
  }, []);

  return null;
}
```

Render `ReactSpotDevtools` only in development, for example from your root layout.

- Alt-clicking an element opens the closest available React source.
- Alt-right-clicking opens a component ancestry menu so you can pick parent components.

## Options

```ts
installReactSpot({
  endpoint: "/__open-in-editor",
  trigger: "alt", // "always" | "meta-shift" | "ctrl-shift" | function
  menuMaxEntries: 8,
  onOpen(target) {
    console.log(target.source, target.componentName, target.strategy);
  },
  onError(error) {
    console.warn(error);
  }
});
```

Set the editor with one of:

```bash
REACT_SPOT_EDITOR=code
REACT_SPOT_EDITOR=cursor
REACT_SPOT_EDITOR=webstorm
```

VS Code-like editors receive `-g file:line:column`. JetBrains IDEs receive `--line line file`.

## Custom Next Route Options

```ts
// app/__open-in-editor/route.ts
import { createOpenInEditorRoute } from "react-spot/next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createOpenInEditorRoute({
  projectRoot: process.cwd(),
  editor: "cursor",
  requireLocalhost: true
});

export const POST = GET;
```

## How It Resolves Source

1. Finds a DOM expando like `__reactFiber$...`.
2. Starts with that host Fiber and walks `fiber.return`.
3. Checks direct source objects such as `_debugSource`.
4. Parses stack metadata such as `_debugStack`, `_debugInfo`, and owner stacks.
5. Follows owner links such as `_debugOwner`.
6. Calls `/__open-in-editor?file=...&line=...&column=...`.

Server Components and Client Component boundaries may only expose the client entry or nearest hydrated owner. When React/Turbopack do not emit source metadata, `inspectElement` returns `source: null` instead of guessing.

## Public API

```ts
import {
  installReactSpot,
  inspectElement,
  findFiberFromElement,
  findSourceFromFiber,
  parseSourceFromStack
} from "react-spot";
```

`inspectElement(element)` is useful if you want to build your own overlay or command palette instead of opening the editor directly.
