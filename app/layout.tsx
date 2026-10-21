import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KVSync Pro | School Operations",
  description: "A secure school administration and communication workspace.",
  applicationName: "KVSync Pro",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
