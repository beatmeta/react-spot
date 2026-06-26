import { AppShell } from "../components/layout/AppShell";

export default function Home() {
  const generatedAt = new Date().toISOString();

  return <AppShell generatedAt={generatedAt} />;
}
