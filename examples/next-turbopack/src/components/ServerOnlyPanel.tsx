export function ServerOnlyPanel({ generatedAt }: { generatedAt: string }) {
  return (
    <aside className="server-panel">
      <div>
        <p className="eyebrow">Server Component</p>
        <h2>Rendered before hydration</h2>
        <p>
          This panel has no client directive, so React may resolve clicks to the
          nearest hydrated owner instead of this exact file.
        </p>
      </div>
      <span className="timestamp">{generatedAt}</span>
    </aside>
  );
}
