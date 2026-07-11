import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Security Portal",
  description: "Vault-based Security Self-Service Portal",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
