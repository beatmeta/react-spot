import { ProbeHintItem } from "./ProbeHintItem";

const hints = [
  {
    title: "Server panel body",
    detail: "ServerOnlyPanel paragraph inside HeroAside.",
    tone: "server"
  },
  {
    title: "Feature list item",
    detail: "HeroFeatureItem span nested under HeroIntro.",
    tone: "server"
  },
  {
    title: "Activity feed row",
    detail: "ActivityListItem time element under ActivityPanel.",
    tone: "client"
  }
] as const;

export function ProbeHintList() {
  return (
    <ul className="probe-hint-list">
      {hints.map((hint) => (
        <li key={hint.title}>
          <ProbeHintItem title={hint.title} detail={hint.detail} tone={hint.tone} />
        </li>
      ))}
    </ul>
  );
}
