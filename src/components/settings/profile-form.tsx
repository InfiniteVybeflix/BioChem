"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Save, UploadCloud, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupNotice } from "@/components/common/setup-notice";
import { useUser } from "@/hooks/use-user";

/** Fallback timezone list when Intl.supportedValuesOf is unavailable. */
const FALLBACK_TIMEZONES = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Africa/Accra",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

function timezoneOptions(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch {
    // Older engines — fall through to the curated list.
  }
  return FALLBACK_TIMEZONES;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function initialsOf(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "??";
}

/**
 * Profile settings: name, avatar (uploaded to the public `avatars` bucket
 * under the user's own folder) and timezone. Saved to the caller's own
 * profiles row via their RLS-scoped client.
 */
export function ProfileForm({
  initialFullName,
  initialAvatarUrl,
  initialTimezone,
}: {
  initialFullName: string;
  initialAvatarUrl: string | null;
  initialTimezone: string;
}) {
  const { supabase, userId, refresh } = useUser();
  const [fullName, setFullName] = useState(initialFullName);
  const [timezone, setTimezone] = useState(initialTimezone || "Africa/Nairobi");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const zones = useMemo(() => timezoneOptions(), []);
  const zoneValue = zones.includes(timezone) ? timezone : "Africa/Nairobi";

  if (!supabase || !userId) {
    return <SetupNotice missing="app" compact />;
  }

  const uploadAvatar = async (file: File) => {
    const extension = IMAGE_EXTENSIONS[file.type] ?? file.name.split(".").pop()?.toLowerCase();
    if (!extension || !(file.type in IMAGE_EXTENSIONS)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Avatar must be 2 MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const path = `${userId}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        toast.error("Couldn't upload the avatar", { description: uploadError.message });
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (updateError) {
        toast.error("Uploaded, but couldn't update your profile", {
          description: updateError.message,
        });
        return;
      }
      setAvatarUrl(publicUrl);
      await refresh();
      toast.success("Avatar updated");
    } finally {
      setUploading(false);
    }
  };

  const onFilePicked = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void uploadAvatar(file);
  };

  const save = async () => {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      toast.error("Tell us your name (at least 2 characters)");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmedName, timezone, avatar_url: avatarUrl })
        .eq("id", userId);
      if (error) {
        toast.error("Couldn't save your profile", { description: error.message });
        return;
      }
      await refresh();
      toast.success("Profile saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          id="profile-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={120}
          placeholder="Your display name"
          className="max-w-md"
        />
        <p className="text-muted-foreground text-xs">
          Shown on your contributions and the leaderboard.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Avatar</Label>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="border-border size-16 border">
            <AvatarImage src={avatarUrl ?? undefined} alt="Your avatar" />
            <AvatarFallback>
              <UserRound className="text-muted-foreground size-6" aria-hidden />
            </AvatarFallback>
          </Avatar>
          <label
            className={`focus-ring flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm transition-all ${
              dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFilePicked(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => onFilePicked(event.target.files)}
            />
            {uploading ? (
              <Loader2 className="text-primary size-4 animate-spin" aria-hidden />
            ) : (
              <UploadCloud className="text-primary size-4" aria-hidden />
            )}
            {uploading ? "Uploading…" : "Drop an image here or click to browse"}
          </label>
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPEG, WebP or GIF · up to 2 MB.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-timezone">Timezone</Label>
        <Select value={zoneValue} onValueChange={setTimezone}>
          <SelectTrigger
            id="profile-timezone"
            className="w-full max-w-md"
            aria-label="Choose your timezone"
          >
            <SelectValue placeholder="Choose your timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectGroup>
              {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Used for streak timing, reminders and quiet hours for notifications.
        </p>
      </div>

      <Button
        type="button"
        onClick={() => void save()}
        disabled={saving || uploading}
        className="focus-ring"
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Save className="size-4" aria-hidden />
        )}
        {saving ? "Saving…" : "Save profile"}
      </Button>
    </div>
  );
}
