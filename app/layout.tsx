import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./styles.css";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap"
});

const bodyFont = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap"
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Crossposter",
  description: "Private publish-now dashboard for your own social accounts.",
  icons: {
    icon: "/assets/logo-crossposter.png",
    apple: "/assets/logo-crossposter.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    (function() {
      try {
        var legacyMode = window.localStorage.getItem('personal-' + 'crossposter:theme');
        var mode = window.localStorage.getItem('crossposter:theme') || legacyMode || 'system';
        if (legacyMode && !window.localStorage.getItem('crossposter:theme')) {
          window.localStorage.setItem('crossposter:theme', legacyMode);
        }
        if (mode === 'light' || mode === 'dark') {
          document.documentElement.dataset.theme = mode;
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
      } catch (error) {}
    })();
  `;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
