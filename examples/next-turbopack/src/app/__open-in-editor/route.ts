import { createOpenInEditorRoute } from "react-spot/next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createOpenInEditorRoute({
  projectRoot: process.cwd(),
  requireLocalhost: true
});

export const POST = GET;
