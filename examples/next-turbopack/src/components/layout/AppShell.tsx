import { ContentGrid } from "./ContentGrid";
import { HeroSection } from "../hero/HeroSection";
import { PageHeader } from "./PageHeader";

export function AppShell({ generatedAt }: { generatedAt: string }) {
  return (
    <main className="page">
      <PageHeader />
      <HeroSection generatedAt={generatedAt} />
      <ContentGrid generatedAt={generatedAt} />
    </main>
  );
}
