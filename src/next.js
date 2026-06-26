import { handleOpenInEditorRequest } from "./node.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function createOpenInEditorRoute(options = {}) {
  return function openInEditorRoute(request) {
    return handleOpenInEditorRequest(request, options);
  };
}

export const GET = createOpenInEditorRoute();
export const POST = GET;
