"use client";

import { Button } from "@react-spot-example/ui";

export function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="refresh-button" onClick={onClick}>
      Refresh metrics
    </Button>
  );
}
