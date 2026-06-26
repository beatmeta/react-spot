"use client";

export function ActivityListItem({
  time,
  message
}: {
  time: string;
  message: string;
}) {
  return (
    <li>
      <time>{time}</time>
      <span>{message}</span>
    </li>
  );
}
