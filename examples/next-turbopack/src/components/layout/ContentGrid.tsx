import { DashboardRoot } from "../dashboard/DashboardRoot";
import { SidebarColumn } from "../sidebar/SidebarColumn";

export function ContentGrid({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="content-grid">
      <DashboardRoot generatedAt={generatedAt} />
      <SidebarColumn />
    </div>
  );
}
