import { DashboardShell } from "../components/DashboardShell";
import { ServerOnlyPanel } from "../components/ServerOnlyPanel";

export default function Home() {
  const generatedAt = new Date().toISOString();

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Next.js + Turbopack</p>
          <h1>react-spot demo</h1>
          <p>
            Alt-click the interface to ask React development metadata where the
            clicked element came from.
          </p>
        </div>
        <ServerOnlyPanel generatedAt={generatedAt} />
      </section>

      <DashboardShell generatedAt={generatedAt} />
    </main>
  );
}
