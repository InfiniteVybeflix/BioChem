import Link from "next/link";
import { redirect } from "next/navigation";
import { FileQuestion } from "lucide-react";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/common/setup-notice";
import { EmptyState, PageHeader } from "@/components/common/ui-bits";
import { Button } from "@/components/ui/button";
import { MockRunner } from "@/components/mocks/mock-runner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attempt detail — validity is checked server-side (own attempts only), then
 * the client runner fetches the full payload from the API.
 */
export default async function MockAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mock attempt" description="Take or review a mock exam." />
        <SetupNotice missing="app" />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const validId = UUID_RE.test(id);
  const { data: attempt } = validId
    ? await supabase
        .from("exam_attempts")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  if (!attempt) {
    return (
      <EmptyState
        icon={<FileQuestion className="size-5" aria-hidden />}
        title="Attempt not found"
        description="This mock attempt doesn't exist, or it belongs to another account."
        action={
          <Button asChild>
            <Link href="/mocks">Back to mock hub</Link>
          </Button>
        }
      />
    );
  }

  return <MockRunner attemptId={attempt.id} />;
}
