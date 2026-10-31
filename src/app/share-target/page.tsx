"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * PWA share target: receives shared links/text from the OS, stores them in
 * localStorage for the submission form, and confirms to the user.
 */
export default function ShareTargetPage() {
  return (
    <Suspense fallback={null}>
      <ShareTargetInner />
    </Suspense>
  );
}

function ShareTargetInner() {
  const searchParams = useSearchParams();
  const [stored, setStored] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const title = searchParams.get("title") ?? "";
    const body = searchParams.get("text") ?? "";
    const url = searchParams.get("url") ?? "";
    const combined = [title, body, url].filter(Boolean).join("\n\n").trim();

    if (combined.length > 0) {
      try {
        const existing = JSON.parse(window.localStorage.getItem("biochem:shared") ?? "[]");
        window.localStorage.setItem(
          "biochem:shared",
          JSON.stringify([...existing, { content: combined, at: new Date().toISOString() }]),
        );
        setStored(true);
        setText(combined);
      } catch {
        setText(combined);
      }
    }
  }, [searchParams]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
        {stored ? (
          <CheckCircle2 className="size-8" aria-hidden />
        ) : (
          <Share2 className="size-8" aria-hidden />
        )}
      </span>
      <h1 className="font-heading mt-6 text-2xl font-bold">
        {stored ? "Saved to your drafts" : "Share into BioChem"}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {stored
          ? "We stashed this for you. Open Contribute to turn it into a note or question for the class."
          : "Share links or text from any app straight into BioChem."}
      </p>
      {text ? (
        <Textarea
          readOnly
          value={text}
          aria-label="Shared content"
          className="mt-6 min-h-32 text-left"
        />
      ) : null}
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/submit">Open Contribute</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
