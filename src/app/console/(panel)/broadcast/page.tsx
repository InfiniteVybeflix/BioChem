"use client";

import { useState } from "react";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { BroadcastAiHelper } from "@/components/console/broadcast-ai-helper";

/**
 * Console — broadcast composer with AI drafting.
 */
export default function ConsoleBroadcastPage() {
  const [draft, setDraft] = useState<{ title: string; contentMd: string } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="glass-card p-5">
        <BroadcastForm draft={draft} onDraftUsed={() => setDraft(null)} />
      </div>
      <BroadcastAiHelper
        onUse={(result) => setDraft({ title: result.title, contentMd: result.contentMd })}
      />
    </div>
  );
}
