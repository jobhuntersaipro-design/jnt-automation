import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Salary Automation",
  description: "J&T dispatcher salary calculation platform",
  icons: {
    icon: "/logo-square-white.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="top-right"
          duration={10000}
          toastOptions={{
            style: {
              background: "#ffffff",
              border: "1px solid rgba(195, 198, 214, 0.2)",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              color: "#191c1d",
              boxShadow: "0 12px 40px -12px rgba(25, 28, 29, 0.08)",
            },
            classNames: {
              error: "!border-l-4 !border-l-critical",
              success: "!border-l-4 !border-l-primary",
            },
          }}
        />
      </body>
    </html>
  );
}
