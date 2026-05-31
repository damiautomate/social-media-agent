import "./globals.css";

export const metadata = {
  title: "Cadence — AI Content Studio",
  description: "Research, generate, and publish on-brand content across LinkedIn, Instagram, TikTok, and Facebook.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
