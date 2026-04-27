export const metadata = {
  title: "Social Media Agent",
  description: "Multi-user content automation for LinkedIn, Instagram, TikTok, and Facebook.",
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
