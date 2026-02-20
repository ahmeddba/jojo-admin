import "./globals.css";
import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// We can use Google Fonts for Merriweather and others if needed via next/font/google
import { Merriweather, Roboto, Montserrat } from "next/font/google";

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-merriweather",
  display: "swap",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "La Storia di JOJO – Admin",
  description: "Back-office to manage revenue, stock, menu, deals and caisse.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${merriweather.variable} ${roboto.variable} ${montserrat.variable}`}>
      <body className="bg-jojo-bg text-jojo-text font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
