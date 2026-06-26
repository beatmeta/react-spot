import { ServerOnlyPanel } from "../ServerOnlyPanel";
import { ServerStatsBlock } from "../server/ServerStatsBlock";

export function HeroAside({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="hero-aside">
      <ServerOnlyPanel generatedAt={generatedAt} />
      <ServerStatsBlock />
    </div>
  );
}
