import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Operations console — internal route group. This tree is only ever
 * served through the obscure-path rewrite configured in proxy.ts;
 * direct /console requests are answered with a plain 404. Nothing in
 * the student or staff app links here, mentions it, or hints it
 * exists.
 */
export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false, nocache: true },
};

export default function ConsoleRootLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <div className="bg-background text-foreground min-h-dvh">
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </ThemeProvider>
  );
}
