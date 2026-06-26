import { HeroAside } from "./HeroAside";
import { HeroIntro } from "./HeroIntro";

export function HeroSection({ generatedAt }: { generatedAt: string }) {
  return (
    <section className="hero">
      <HeroIntro />
      <HeroAside generatedAt={generatedAt} />
    </section>
  );
}
