import type { OpenInEditorOptions } from "./node.js";

export declare const runtime = "nodejs";
export declare const dynamic = "force-dynamic";

export declare function createOpenInEditorRoute(
  options?: OpenInEditorOptions
): (request: Request) => Promise<Response>;

export declare const GET: (request: Request) => Promise<Response>;
export declare const POST: (request: Request) => Promise<Response>;
