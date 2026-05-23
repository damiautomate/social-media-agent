import "./globals.css";

export const metadata = {
  title: "Social Media Agent",
  description: "Multi-user content automation for LinkedIn, Instagram, TikTok, and Facebook.",
};

// Next.js 15 viewport API — this generates the <meta name="viewport"> tag
// that mobile browsers need to render at the correct width. Without it,
// mobile browsers render at 980px wide and zoom out, which is why the app
// looked tiny and broken on phones.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#09090b",
          color: "#e4e4e7",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
