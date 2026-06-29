import { DashboardRoot } from "../dashboard/DashboardRoot";
import { SidebarColumn } from "../sidebar/SidebarColumn";
import { Button }  from "@react-spot-example/ui"

export function ContentGrid({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="content-grid">
      <Button>Click me</Button>
      <DashboardRoot generatedAt={generatedAt} />
      <SidebarColumn />
    </div>
  );
}
