"use client";

import type { ComponentPropsWithoutRef } from "react";

export type ButtonProps = ComponentPropsWithoutRef<"button">;

export function Button({ type = "button", ...props }: ButtonProps) {
  return <button type={type} {...props} />;
}
