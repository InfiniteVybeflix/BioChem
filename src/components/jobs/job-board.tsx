"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Briefcase,
  ChevronDown,
  GraduationCap,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown/markdown";
import { EmptyState, StatCard } from "@/components/common/ui-bits";
import { AdSlot } from "@/components/ads/ad-slot";
import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { JobCard, JOB_TYPE_META, type BoardJob } from "@/components/jobs/job-card";
import { EnquireDialog } from "@/components/jobs/enquire-dialog";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import type { JobStatus, JobType } from "@/types/domain";

/**
 * Job board client shell: header stats, type filter chips, sponsored section
 * (only when ads_enabled + sponsorships flags are both on), the public card
 * list, an ad placement, the post-a-job dialog (staff) and the admin
 * "Pending review" moderation panel.
 */

const JOB_FIELDS =
  "id, posted_by, title, org, location, type, description_md, contact, status, closes_at, is_sponsored, created_at";

interface JobQueryRow {
  id: string;
  posted_by: string;
  title: string;
  org: string;
  location: string;
  type: JobType;
  description_md: string;
  contact: string;
  status: JobStatus;
  closes_at: string | null;
  is_sponsored: boolean;
  created_at: string;
}

/** Rows → BoardJob, resolving poster names via a second profiles query. */
async function attachPosterNames(
  client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  rows: JobQueryRow[],
): Promise<BoardJob[]> {
  const ids = [...new Set(rows.map((row) => row.posted_by))];
  const { data: profileRows } = ids.length
    ? await client.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    org: row.org,
    location: row.location,
    type: row.type,
    descriptionMd: row.description_md,
    contact: row.contact,
    status: row.status,
    closesAt: row.closes_at,
    isSponsored: row.is_sponsored,
    createdAt: row.created_at,
    postedByName: nameById.get(row.posted_by) ?? "Department poster",
  }));
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "internship", label: "Internship" },
  { id: "entry", label: "Entry-level" },
  { id: "full_time", label: "Full-time" },
] as const;

type JobFilter = (typeof FILTERS)[number]["id"];

const FILTER_TO_TYPE: Record<Exclude<JobFilter, "all">, JobType> = {
  internship: "internship",
  entry: "entry",
  full_time: "full_time",
};

function isOpenPosition(job: BoardJob): boolean {
  if (job.status !== "approved") return false;
  if (!job.closesAt) return true;
  const closes = new Date(job.closesAt).getTime();
  return Number.isNaN(closes) || closes > Date.now();
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export function JobBoard({ initialJobs }: { initialJobs: BoardJob[] }) {
  const { supabase, userId, can } = useUser();
  const [jobs, setJobs] = useState<BoardJob[]>(initialJobs);
  const [filter, setFilter] = useState<JobFilter>("all");
  const [adsOn, setAdsOn] = useState(false);
  const [sponsorshipsOn, setSponsorshipsOn] = useState(false);
  const [enquiredIds, setEnquiredIds] = useState<Set<string>>(new Set());
  const [enquireJob, setEnquireJob] = useState<BoardJob | null>(null);
  const [postOpen, setPostOpen] = useState(false);

  const canPost = can("post_jobs");
  const canEnquire = can("enquire_jobs");

  // Sponsored placements only render when BOTH flags are on (fetched
  // client-side; both default to off when the rows are missing).
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const load = async () => {
      const [adsResult, sponsorshipsResult] = await Promise.all([
        supabase.from("feature_flags").select("enabled").eq("key", "ads_enabled").maybeSingle(),
        supabase.from("feature_flags").select("enabled").eq("key", "sponsorships").maybeSingle(),
      ]);
      if (cancelled) return;
      setAdsOn(adsResult.data?.enabled === true);
      setSponsorshipsOn(sponsorshipsResult.data?.enabled === true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Which jobs has the signed-in student already enquired on?
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("job_enquiries").select("job_id").eq("user_id", userId);
      if (!cancelled && data) setEnquiredIds(new Set(data.map((row) => row.job_id)));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const refreshBoard = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .in("status", ["approved", "closed"])
      .order("is_sponsored", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setJobs(await attachPosterNames(supabase, data));
  }, [supabase]);

  const sponsoredVisible = adsOn && sponsorshipsOn;
  const visibleJobs = useMemo(
    () => (sponsoredVisible ? jobs : jobs.filter((job) => !job.isSponsored)),
    [jobs, sponsoredVisible],
  );
  const sponsoredJobs = useMemo(
    () => (sponsoredVisible ? jobs.filter((job) => job.isSponsored) : []),
    [jobs, sponsoredVisible],
  );
  const openCount = visibleJobs.filter(isOpenPosition).length;
  const internshipCount = visibleJobs.filter(
    (job) => isOpenPosition(job) && job.type === "internship",
  ).length;

  const filteredJobs =
    filter === "all"
      ? visibleJobs
      : visibleJobs.filter((job) => job.type === FILTER_TO_TYPE[filter]);

  const activeFilterLabel = FILTERS.find((entry) => entry.id === filter)?.label ?? "matching";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-lg">
        <StatCard
          label="Open positions"
          value={openCount}
          hint="Live and accepting enquiries"
          icon={<Briefcase className="size-4" aria-hidden />}
        />
        <StatCard
          label="Internships"
          value={internshipCount}
          hint="Attachment + industrial placement roles"
          icon={<GraduationCap className="size-4" aria-hidden />}
          tone="emerald"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter jobs by type"
        >
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
              className={cn(
                "focus-ring min-h-11 rounded-full border px-4 text-sm font-medium transition-all",
                filter === entry.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:-translate-y-0.5",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {canPost ? (
          <JobFormDialog
            open={postOpen}
            onOpenChange={setPostOpen}
            onCreated={() => void refreshBoard()}
          />
        ) : null}
      </div>

      {sponsoredJobs.length > 0 ? (
        <section
          aria-label="Sponsored positions"
          className="glass-card border-amber-500/30 p-4 sm:p-5"
        >
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
            <Sparkles className="size-3" aria-hidden />
            Sponsored
          </span>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {sponsoredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                sponsored
                showEnquire={canEnquire}
                enquirySent={enquiredIds.has(job.id)}
                onEnquire={setEnquireJob}
              />
            ))}
          </div>
        </section>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" aria-hidden />}
          title="No positions posted yet"
          description="No positions posted yet — staff can post internships and graduate roles."
          action={
            canPost ? (
              <Button type="button" onClick={() => setPostOpen(true)} className="focus-ring">
                Post the first job
              </Button>
            ) : null
          }
        />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" aria-hidden />}
          title={`No ${activeFilterLabel.toLowerCase()} roles right now`}
          description="Try another filter to see the rest of the board."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              showEnquire={canEnquire}
              enquirySent={enquiredIds.has(job.id)}
              onEnquire={setEnquireJob}
            />
          ))}
        </div>
      )}

      <AdSlot placement="jobs" />

      <EnquireDialog
        job={enquireJob}
        onClose={() => setEnquireJob(null)}
        onSent={(jobId) => setEnquiredIds((prev) => new Set(prev).add(jobId))}
      />

      <p className="sr-only" role="status">
        {openCount} open positions, {internshipCount} internships
      </p>
    </div>
  );
}
