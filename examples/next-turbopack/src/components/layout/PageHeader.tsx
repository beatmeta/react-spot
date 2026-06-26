import { PageSubtitle } from "./PageSubtitle";
import { PageTitle } from "./PageTitle";

export function PageHeader() {
  return (
    <header className="page-header">
      <PageTitle />
      <PageSubtitle />
    </header>
  );
}
