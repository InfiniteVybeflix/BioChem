import { SystemCheck } from "@/components/console/system-check";

/**
 * Console — System. Database health + one-click fix SQL. When any
 * console feature fails with "could not create/update", the cause is
 * almost always a missing table or column from a migration that
 * hasn't been applied yet — this page names the culprit and hands the
 * operator one idempotent SQL script that repairs everything.
 */
export default function ConsoleSystemPage() {
  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">System</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Health checks for everything the console depends on — the database, the AI gateway and the
        fix for any missing piece.
      </p>
      <div className="mt-4">
        <SystemCheck />
      </div>
    </div>
  );
}
