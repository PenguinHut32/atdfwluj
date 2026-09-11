import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ExperienceProvider } from "@/components/experience-provider";
import "./globals.css";
import "./typography.css";

const japanese = localFont({
  src: "../../public/fonts/noto-serif-jp.ttf",
  variable: "--font-jp",
  display: "swap",
  preload: false,
});

const serif = localFont({
  src: "../../public/fonts/cormorant.ttf",
  variable: "--font-serif",
  display: "swap",
});
const sans = localFont({
  src: "../../public/fonts/manrope.ttf",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "GETO — По ту сторону обыденного", template: "%s | GETO" },
  description:
    "Личное пространство Сугуру Гето. Некоторые двери открываются только для тебя. Неофициальный фан-проект.",
  applicationName: "GETO",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08070a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${serif.variable} ${sans.variable} ${japanese.variable}`}
    >
      <body>
        <ExperienceProvider>{children}</ExperienceProvider>
      </body>
    </html>
  );
}
