"use client";

import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * School + year pickers for the /units browse page. Selecting a value
 * pushes `?school=<id|all>&year=<n|all>` — the server page re-renders
 * with the filtered units. Defaults come from the signed-in student's
 * own profile (their school + their study year).
 */
export function UnitFilters({
  schools,
  years,
  activeSchool,
  activeYear,
}: {
  schools: { id: string; name: string; shortName: string }[];
  years: number[];
  activeSchool: string; // uuid or "all"
  activeYear: string; // "1"…"8" or "all"
}) {
  const router = useRouter();

  const navigate = (school: string, year: string) => {
    // Both params are always sent ("all" included) so an explicit
    // "everything" choice is distinguishable from the initial visit,
    // where the student's own school + year are pre-applied.
    const params = new URLSearchParams();
    params.set("school", school);
    params.set("year", year);
    router.push(`/units?${params.toString()}`);
  };

  return (
    <div className="glass-card flex flex-wrap items-end gap-3 p-4">
      <div className="space-y-1.5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <GraduationCap className="size-3.5" aria-hidden /> School
        </p>
        <Select value={activeSchool} onValueChange={(school) => navigate(school, activeYear)}>
          <SelectTrigger className="w-56" aria-label="Choose a school">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All schools</SelectItem>
            {schools.map((school) => (
              <SelectItem key={school.id} value={school.id}>
                {school.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium">Study year</p>
        <Select value={activeYear} onValueChange={(year) => navigate(activeSchool, year)}>
          <SelectTrigger className="w-44" aria-label="Choose a study year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                Year {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
