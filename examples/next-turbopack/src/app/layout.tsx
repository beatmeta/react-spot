import type { Metadata } from "next";
import { ReactSpotDevtools } from "../components/ReactSpotDevtools";
import "./globals.css";

export const metadata: Metadata = {
  title: "Show Component Turbopack Demo",
  description: "Demo for show-component with Next.js and Turbopack"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ReactSpotDevtools />
        {children}
      </body>
    </html>
  );
}
