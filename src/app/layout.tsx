import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { settings } from "@/src/db/schema";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daymark — personal planner",
  description: "A calm place for today's tasks, goals and calendar.",
};

function hueFromHex(hex: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (difference !== 0) {
    if (maximum === red) hue = ((green - blue) / difference + (green < blue ? 6 : 0)) / 6;
    else if (maximum === green) hue = ((blue - red) / difference + 2) / 6;
    else hue = ((red - green) / difference + 4) / 6;
  }
  return [Math.round(hue * 360), Math.round(saturation * 100)] as const;
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const appearance = await db.select({ theme: settings.theme, accentColor: settings.accentColor, colorStyle: settings.colorStyle, fontStyle: settings.fontStyle }).from(settings).where(eq(settings.id, "default")).get();
  const accentColor = appearance?.accentColor ?? "#4b775f";
  const [hue, saturation] = hueFromHex(accentColor);
  const theme = appearance?.theme ?? "system";
  const colorStyle = appearance?.colorStyle ?? "hue";
  const fontStyle = appearance?.fontStyle ?? "current";
  const appearanceStyle = {
    "--custom-hue": String(hue),
    "--custom-saturation": `${saturation}%`,
    "--surface-saturation": `${Math.min(Math.round(saturation * 0.35), 20)}%`,
  } as CSSProperties;
  return <html lang="en-GB" data-theme={theme} data-palette={colorStyle} data-font={fontStyle} style={appearanceStyle}><body>{children}</body></html>;
}
