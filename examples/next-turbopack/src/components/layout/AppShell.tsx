import { ContentGrid } from "./ContentGrid";
import { HeroSection } from "../hero/HeroSection";
import { PageHeader } from "./PageHeader";
import { Button }  from "@react-spot-example/ui"
import Image from "next/image"

export function AppShell({ generatedAt }: { generatedAt: string }) {
  return (
    <main className="page">
      <Image src="/image.png" alt="Logo" width={100} height={100} />
      <Button>Click me</Button>
      <PageHeader />
      <HeroSection generatedAt={generatedAt} />
      <ContentGrid generatedAt={generatedAt} />
    </main>
  );
}
