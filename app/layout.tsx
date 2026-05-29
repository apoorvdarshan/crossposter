import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Personal Crossposter",
  description: "Private publish-now dashboard for your own social accounts."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
