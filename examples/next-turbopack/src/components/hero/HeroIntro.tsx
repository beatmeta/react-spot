import { HeroFeatureList } from "./HeroFeatureList";

export function HeroIntro() {
  return (
    <div className="hero-copy">
      <p className="eyebrow">Deep nesting</p>
      <h2 className="hero-heading">Multi-layer component tree</h2>
      <p>
        Each section below is split into server and client islands with several
        levels of child components for source-mapping accuracy checks.
      </p>
      <HeroFeatureList />
    </div>
  );
}
