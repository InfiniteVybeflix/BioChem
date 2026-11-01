"use client";

import { useState, type ReactNode } from "react";
import { FolderTree, Layers, Loader2, Palette, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — the CMS. Everything editable here is live for every
 * visitor on their next page load: no deploys, no code. The values
 * feed the landing page, the sign-in screens, the support page and
 * the "built by" credit across the app.
 */

export interface CmsValues {
  branding: { site_name: string; tagline: string; built_by: string };
  landing: { hero_title: string; hero_subtitle: string; schools_blurb: string };
  support: { contact_note: string };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={3}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function CmsSettings({
  initial,
  featuresSlot,
  topicsSlot,
}: {
  initial: CmsValues;
  /** CMS → Features tab: landing-page feature cards + module switches. */
  featuresSlot?: ReactNode;
  /** CMS → Topics tab: the content topic tree the importers resolve against. */
  topicsSlot?: ReactNode;
}) {
  const base = useConsoleBase();
  const [values, setValues] = useState<CmsValues>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: keyof CmsValues, value: Record<string, string>) => {
    setBusy(key);
    try {
      const response = await fetch(consoleUrl(base, "api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", key, value }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Could not save"));
        return;
      }
      toast.success("Saved — live for everyone on next load");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Palette className="size-4" aria-hidden /> Site content (CMS)
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Edit what students see — live, with zero deploys. Changes apply on the next page load.
        </p>
      </div>

      <Tabs defaultValue="branding">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="branding" className="flex-1 gap-1.5 sm:flex-none">
            <Sparkles className="size-3.5" aria-hidden /> Branding
          </TabsTrigger>
          <TabsTrigger value="landing" className="flex-1 sm:flex-none">
            Landing page
          </TabsTrigger>
          <TabsTrigger value="support" className="flex-1 sm:flex-none">
            Support page
          </TabsTrigger>
          {featuresSlot ? (
            <TabsTrigger value="features" className="flex-1 gap-1.5 sm:flex-none">
              <Layers className="size-3.5" aria-hidden /> Features
            </TabsTrigger>
          ) : null}
          {topicsSlot ? (
            <TabsTrigger value="topics" className="flex-1 gap-1.5 sm:flex-none">
              <FolderTree className="size-3.5" aria-hidden /> Topics
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="branding" className="mt-4">
          <div className="glass-card space-y-4 p-5">
            <Field
              id="cms-site-name"
              label="Site name"
              value={values.branding.site_name}
              maxLength={40}
              onChange={(site_name) =>
                setValues({ ...values, branding: { ...values.branding, site_name } })
              }
            />
            <Field
              id="cms-tagline"
              label="Tagline"
              value={values.branding.tagline}
              maxLength={120}
              onChange={(tagline) =>
                setValues({ ...values, branding: { ...values.branding, tagline } })
              }
            />
            <Field
              id="cms-built-by"
              label="Built-by credit"
              hint="Shown in the footer, sign-in screens and about page."
              value={values.branding.built_by}
              maxLength={60}
              onChange={(built_by) =>
                setValues({ ...values, branding: { ...values.branding, built_by } })
              }
            />
            <Button
              className="gap-2"
              disabled={busy === "branding"}
              onClick={() => void save("branding", values.branding)}
            >
              {busy === "branding" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Save branding
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="landing" className="mt-4">
          <div className="glass-card space-y-4 p-5">
            <Field
              id="cms-hero-title"
              label="Hero title"
              value={values.landing.hero_title}
              maxLength={80}
              onChange={(hero_title) =>
                setValues({ ...values, landing: { ...values.landing, hero_title } })
              }
            />
            <Field
              id="cms-hero-subtitle"
              label="Hero subtitle"
              multiline
              maxLength={240}
              value={values.landing.hero_subtitle}
              onChange={(hero_subtitle) =>
                setValues({ ...values, landing: { ...values.landing, hero_subtitle } })
              }
            />
            <Field
              id="cms-schools-blurb"
              label="Supported-schools blurb"
              hint="The sentence above the school list (the list itself comes from the Schools section)."
              multiline
              maxLength={240}
              value={values.landing.schools_blurb}
              onChange={(schools_blurb) =>
                setValues({ ...values, landing: { ...values.landing, schools_blurb } })
              }
            />
            <Button
              className="gap-2"
              disabled={busy === "landing"}
              onClick={() => void save("landing", values.landing)}
            >
              {busy === "landing" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Save landing page
            </Button>
          </div>
        </TabsContent>

        {featuresSlot ? (
          <TabsContent value="features" className="mt-4">
            {featuresSlot}
          </TabsContent>
        ) : null}
        {topicsSlot ? (
          <TabsContent value="topics" className="mt-4">
            {topicsSlot}
          </TabsContent>
        ) : null}

        <TabsContent value="support" className="mt-4">
          <div className="glass-card space-y-4 p-5">
            <Field
              id="cms-contact-note"
              label="Contact note"
              hint="Shown at the top of the support page and in Settings → Support."
              multiline
              maxLength={400}
              value={values.support.contact_note}
              onChange={(contact_note) =>
                setValues({ ...values, support: { ...values.support, contact_note } })
              }
            />
            <Button
              className="gap-2"
              disabled={busy === "support"}
              onClick={() => void save("support", values.support)}
            >
              {busy === "support" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Save support note
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
