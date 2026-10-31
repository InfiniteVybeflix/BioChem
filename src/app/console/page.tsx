import { redirect } from "next/navigation";
import { ConsoleSignIn } from "@/components/console/console-sign-in";
import { ConsoleBaseProvider } from "@/lib/admin/console-context";
import { adminBasePath, hasAdminSession } from "@/lib/admin/session";

/**
 * Console entry: shows the sign-in form, or jumps straight to the
 * dashboard when a valid session cookie is present.
 */
export default async function ConsolePage() {
  if (await hasAdminSession()) {
    redirect(`${adminBasePath()}/dashboard`);
  }
  return (
    <ConsoleBaseProvider basePath={adminBasePath()}>
      <ConsoleSignIn />
    </ConsoleBaseProvider>
  );
}
