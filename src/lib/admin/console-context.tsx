"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Console URL context. The console's external path is a secret that
 * only the server knows (ADMIN_ROUTE_PATH). The panel layout provides
 * it here so every console client component can build correct fetch
 * URLs — a plain relative fetch breaks on the console root page
 * ("/panel-x7" resolves "api/x" against "/", not the panel).
 */

const ConsoleBaseContext = createContext<string>("");

export function ConsoleBaseProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  return <ConsoleBaseContext.Provider value={basePath}>{children}</ConsoleBaseContext.Provider>;
}

/** The console's external base path, e.g. "/panel-x7k29m" (no trailing slash). */
export function useConsoleBase(): string {
  return useContext(ConsoleBaseContext);
}

/** Builds a console API URL for the given sub-path ("api/users" → "/panel-x/api/users"). */
export function consoleUrl(base: string, subPath: string): string {
  return `${base.replace(/\/+$/, "")}/${subPath.replace(/^\/+/, "")}`;
}
