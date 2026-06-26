import { HeroFeatureItem } from "./HeroFeatureItem";

const features = [
  "Server-only panels with nested rows",
  "Client islands with toolbar, grid, and feed",
  "Leaf nodes owned by different parent components"
] as const;

export function HeroFeatureList() {
  return (
    <ul className="hero-features">
      {features.map((feature) => (
        <HeroFeatureItem key={feature} label={feature} />
      ))}
    </ul>
  );
}
