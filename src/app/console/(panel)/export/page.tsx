import { Download } from "lucide-react";
import { adminBasePath } from "@/lib/admin/session";

/**
 * Console — CSV exports (users, attempts, notes, questions, job
 * enquiries, support tickets). Files stream from console-api/export.
 */
export default function ConsoleExportPage() {
  const base = adminBasePath();
  const exports = [
    { type: "users", label: "Users", hint: "Profiles, roles, schools, XP, status" },
    { type: "attempts", label: "Exam attempts", hint: "Every submitted attempt with scores" },
    { type: "notes", label: "Notes", hint: "All published and pending notes" },
    { type: "questions", label: "Questions", hint: "The full question bank" },
    { type: "enquiries", label: "Job enquiries", hint: "Student enquiries with status" },
    { type: "tickets", label: "Support tickets", hint: "The full support history" },
  ];

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">Export data</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Download a CSV snapshot — perfect for backups, audits or semester reports.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {exports.map((item) => (
          <li key={item.type}>
            <a
              href={`${base}/api/export?type=${item.type}`}
              className="bg-muted/40 hover:bg-muted flex items-center gap-3 rounded-xl p-4 transition-colors"
              download
            >
              <Download className="text-primary size-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="text-muted-foreground block text-xs">{item.hint}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
