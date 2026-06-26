export type ReactSpotTrigger =
  | "alt"
  | "always"
  | "meta-shift"
  | "ctrl-shift"
  | ((event: MouseEvent) => boolean);

export interface ReactSpotSource {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ReactSpotTarget {
  element: unknown;
  fiber: unknown | null;
  source: ReactSpotSource | null;
  componentName: string | null;
  strategy: string;
}

export interface InstallReactSpotOptions {
  endpoint?: string;
  trigger?: ReactSpotTrigger;
  menuMaxEntries?: number;
  force?: boolean;
  window?: Window;
  document?: Document;
  fetch?: typeof fetch;
  onOpen?: (target: ReactSpotTarget) => false | void;
  onError?: (error: unknown) => void;
}

export interface OpenSourceOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  extraQuery?: Record<string, string | number | boolean | null | undefined>;
}

export interface CreateOpenInEditorUrlOptions {
  endpoint?: string;
  extraQuery?: Record<string, string | number | boolean | null | undefined>;
}

export declare function installReactSpot(options?: InstallReactSpotOptions): () => void;
export declare function inspectElement(element: unknown): ReactSpotTarget;
export declare function findFiberFromElement(element: unknown): { element: unknown; fiber: unknown } | null;
export declare function getFiberFromDomNode(node: unknown): unknown | null;
export declare function findSourceFromFiber(fiber: unknown): {
  source: ReactSpotSource;
  componentName: string | null;
  strategy: string;
} | null;
export declare function openSource(source: ReactSpotSource, options?: OpenSourceOptions): Promise<void>;
export declare function createOpenInEditorUrl(
  source: ReactSpotSource,
  options?: CreateOpenInEditorUrlOptions
): string;
export declare function parseSourceFromStack(stack: string): ReactSpotSource | null;

export declare class ReactSpotError extends Error {
  code?: string;
  status?: number;
  detail?: unknown;
}
