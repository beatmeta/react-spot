"use client";

export function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="refresh-button" onClick={onClick}>
      Refresh metrics
    </button>
  );
}
