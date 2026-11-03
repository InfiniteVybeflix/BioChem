"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Navigation,
  Pencil,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { cn } from "@/lib/utils";
import { parseStoredActions, stripStoredActions } from "@/lib/ai/nova/actions";
import type { NovaAction } from "@/lib/ai/nova/facts";

/**
 * A single Nova chat bubble: user messages right-aligned on primary,
 * Nova's replies left in glass with markdown + LaTeX rendering.
 *
 * Assistant replies may carry persisted footers:
 *  - `<!--BCACTIONS:[…]-->` — validated real page actions, rendered as
 *    clickable chips (and auto-executed live by the chat container);
 *  - `<!--BCMEDIA:{…}-->` — resolved Wikimedia images + reference links.
 * User messages get copy + edit; Nova's last reply gets regenerate.
 */

export interface TutorMediaImage {
  url: string;
  alt: string;
  credit: string;
  license: string;
  source: string;
  pageUrl: string;
}

export interface TutorMediaLink {
  title: string;
  url: string;
  snippet: string;
}

export interface TutorMedia {
  images: TutorMediaImage[];
  links: TutorMediaLink[];
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
  media?: TutorMedia | null;
}

const MEDIA_FOOTER_RE = /\n*<!--BCMEDIA:(.*?)-->\s*$/s;
const LIVE_MARKER_RE = /\[\[(?:MEDIA|LINKS|ACTION):[^\]]*\]?/g;

/** Splits a stored reply into its text, persisted media and actions. */
export function parseStoredReply(content: string): {
  text: string;
  media: TutorMedia | null;
  actions: NovaAction[];
} {
  const actions = parseStoredActions(content);
  const withoutActions = stripStoredActions(content);
  const match = withoutActions.match(MEDIA_FOOTER_RE);
  if (!match) return { text: withoutActions, media: null, actions };
  try {
    const parsed = JSON.parse(match[1].replace(/-- >/g, "-->")) as TutorMedia;
    return {
      text: withoutActions.replace(MEDIA_FOOTER_RE, ""),
      media: parsed && (parsed.images?.length || parsed.links?.length) ? parsed : null,
      actions,
    };
  } catch {
    return { text: withoutActions.replace(MEDIA_FOOTER_RE, ""), media: null, actions };
  }
}

function MediaBlock({ media }: { media: TutorMedia }) {
  return (
    <div className="mt-3 space-y-3">
      {media.images.map((image, index) => (
        <figure
          key={`${image.url}-${index}`}
          className="border-border/60 overflow-hidden rounded-xl border"
        >
          <img
            src={image.url}
            alt={image.alt}
            loading="lazy"
            className="max-h-80 w-full bg-white object-contain"
            referrerPolicy="no-referrer"
          />
          <figcaption className="text-muted-foreground bg-muted/40 px-3 py-2 text-[11px] leading-relaxed">
            {image.alt} · {image.credit} · {image.license} ·{" "}
            <a
              href={image.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {image.source}
            </a>
          </figcaption>
        </figure>
      ))}
      {media.links.length > 0 ? (
        <div className="border-border/60 rounded-xl border p-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
            <BookOpen className="size-3.5" aria-hidden /> Further reading
          </p>
          <ul className="mt-2 space-y-1.5">
            {media.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5 text-sm underline-offset-2 hover:underline"
                >
                  <ExternalLink
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">{link.title}</span>
                    {link.snippet ? (
                      <span className="text-muted-foreground block text-xs">{link.snippet}</span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Real, clickable chips for Nova's executed page actions. */
export function ActionChips({ actions }: { actions: NovaAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Pages Nova opened">
      {actions.map((action) => (
        <a
          key={`${action.kind}-${action.path}`}
          href={action.path}
          className="focus-ring border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          {...(action.kind === "open_tab"
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {action.kind === "open_tab" ? (
            <ExternalLink className="size-3" aria-hidden />
          ) : (
            <Navigation className="size-3" aria-hidden />
          )}
          {action.kind === "open_tab" ? "Opened in new tab" : "Opened"}: {action.title}
        </a>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  icon,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  tone?: "neutral" | "primary";
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "focus-ring text-muted-foreground hover:text-foreground size-7 rounded-full",
        tone === "primary" && "text-primary hover:text-primary",
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </Button>
  );
}

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Edit + regenerate controls (only offered where meaningful). */
  onEdit?: (messageId: string, content: string) => void;
  onRegenerate?: () => void;
  showEdit?: boolean;
  showRegenerate?: boolean;
  busy?: boolean;
}

export function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  showEdit = false,
  showRegenerate = false,
  busy = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const parsed = isUser ? null : parseStoredReply(message.content);
  const text = parsed ? parsed.text : message.content;
  const media = message.media ?? parsed?.media ?? null;
  const actions = parsed?.actions ?? [];

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.setSelectionRange(editValue.length, editValue.length);
    }
  }, [editing, editValue.length]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — your browser blocked clipboard access");
    }
  };

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed.length === 0) {
      toast.error("The message cannot be empty");
      return;
    }
    if (trimmed === message.content) {
      setEditing(false);
      return;
    }
    if (onEdit) {
      setEditing(false);
      onEdit(message.id, trimmed);
    }
  };

  return (
    <div className={cn("group flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span
          className="bg-primary/10 text-primary mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
          aria-hidden
        >
          <Bot className="size-4" />
        </span>
      ) : null}
      <div className="flex max-w-[85%] flex-col sm:max-w-[75%]">
        <div
          className={cn(
            "focus-ring rounded-2xl px-4 py-3",
            isUser ? "bg-primary text-primary-foreground rounded-br-md" : "glass-card rounded-bl-md",
          )}
        >
          <span className="sr-only">{isUser ? "You said:" : "Nova replied:"}</span>
          {isUser ? (
            editing ? (
              <div className="space-y-2">
                <Textarea
                  ref={editRef}
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      saveEdit();
                    }
                    if (event.key === "Escape") setEditing(false);
                  }}
                  rows={3}
                  className="bg-background text-foreground focus-ring min-h-20 text-sm"
                  aria-label="Edit your message"
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="focus-ring h-8"
                    onClick={() => {
                      setEditValue(message.content);
                      setEditing(false);
                    }}
                  >
                    <X className="size-3.5" aria-hidden /> Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="focus-ring h-8"
                    onClick={saveEdit}
                    disabled={busy}
                  >
                    Save &amp; resend
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 break-words whitespace-pre-wrap">{message.content}</p>
            )
          ) : (
            <>
              <Markdown>{text}</Markdown>
              {media ? <MediaBlock media={media} /> : null}
            </>
          )}
        </div>

        {actions.length > 0 ? <ActionChips actions={actions} /> : null}

        {/* Hover toolbar */}
        {!editing ? (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <IconButton
              label={copied ? "Copied" : "Copy message"}
              onClick={() => void copy()}
              icon={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            />
            {isUser && showEdit && onEdit ? (
              <IconButton
                label="Edit and resend"
                onClick={() => setEditing(true)}
                icon={<Pencil className="size-3.5" aria-hidden />}
              />
            ) : null}
            {!isUser && showRegenerate && onRegenerate ? (
              <IconButton
                label="Regenerate answer"
                onClick={onRegenerate}
                icon={<RefreshCw className="size-3.5" aria-hidden />}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {isUser ? (
        <span
          className="bg-muted text-muted-foreground mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
          aria-hidden
        >
          <User className="size-4" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The live streaming bubble: deltas appended as they arrive, with a
 * pulsing cursor while Nova is still typing. Media/action/link markers
 * are hidden until they resolve into real resources.
 */
export function StreamingBubble({ text }: { text: string }) {
  const visible = text.replace(LIVE_MARKER_RE, "");
  return (
    <div className="flex w-full gap-2.5" aria-live="polite">
      <span
        className="bg-primary/10 text-primary mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
        aria-hidden
      >
        <Bot className="size-4" />
      </span>
      <div className="glass-card focus-ring max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 sm:max-w-[75%]">
        <span className="sr-only">Nova is replying…</span>
        {visible.trim().length > 0 ? (
          <div className="break-words">
            <Markdown>{visible}</Markdown>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Thinking…</p>
        )}
        <span
          className="bg-primary mt-1 inline-block h-4 w-2 animate-pulse rounded-sm motion-reduce:animate-none"
          aria-hidden
        />
      </div>
    </div>
  );
}
