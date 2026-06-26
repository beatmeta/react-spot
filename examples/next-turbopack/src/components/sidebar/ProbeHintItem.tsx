export function ProbeHintItem({
  title,
  detail,
  tone
}: {
  title: string;
  detail: string;
  tone: "server" | "client";
}) {
  return (
    <article className="probe-hint-item" data-tone={tone}>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}
