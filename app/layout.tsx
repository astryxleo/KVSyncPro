import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KVSync Pro | School Operations",
  description: "A secure school administration and communication workspace.",
  applicationName: "KVSync Pro",
  icons: {
    icon: [{ url: "https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png", type: "image/png" }],
    shortcut: ["https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png"],
    apple: [{ url: "https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
