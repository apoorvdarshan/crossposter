import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Crossposter",
  description: "Private publish-now dashboard for your own social accounts."
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
