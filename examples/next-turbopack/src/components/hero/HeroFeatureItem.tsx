export function HeroFeatureItem({ label }: { label: string }) {
  return (
    <li className="hero-feature-item">
      <span className="hero-feature-dot" aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}
