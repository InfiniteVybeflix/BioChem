"use client";

import { Bot, BookOpen, ExternalLink, User } from "lucide-react";
import { Markdown } from "@/components/markdown/markdown";
import { cn } from "@/lib/utils";

/**
 * A single tutor-chat bubble: user messages right-aligned on primary,
 * assistant replies left in glass with markdown + LaTeX rendering.
 *
 * Assistant replies may carry a `<!--BCMEDIA:{…}-->` footer (persisted)
 * or an attached live `media` payload with real images from Wikimedia
 * Commons (attributed) and reference links — both render under the
 * answer, never inside it.
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
const LIVE_MARKER_RE = /\[\[(?:MEDIA|LINKS):[^\]]*\]?/g;

/** Splits a stored reply into its text and persisted media footer. */
export function parseStoredMedia(content: string): { text: string; media: TutorMedia | null } {
  const match = content.match(MEDIA_FOOTER_RE);
  if (!match) return { text: content, media: null };
  try {
    const parsed = JSON.parse(match[1].replace(/-- >/g, "-->")) as TutorMedia;
    return {
      text: content.replace(MEDIA_FOOTER_RE, ""),
      media: parsed && (parsed.images?.length || parsed.links?.length) ? parsed : null,
    };
  } catch {
    return { text: content, media: null };
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

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const stored = isUser ? null : parseStoredMedia(message.content);
  const text = stored ? stored.text : message.content;
  const media = message.media ?? stored?.media ?? null;

  return (
    <div className={cn("flex w-full gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span
          className="bg-primary/10 text-primary mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
          aria-hidden
        >
          <Bot className="size-4" />
        </span>
      ) : null}
      <div
        className={cn(
          "focus-ring max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]",
          isUser ? "bg-primary text-primary-foreground rounded-br-md" : "glass-card rounded-bl-md",
        )}
      >
        <span className="sr-only">{isUser ? "You said:" : "AI tutor replied:"}</span>
        {isUser ? (
          <p className="text-sm leading-6 break-words whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <Markdown>{text}</Markdown>
            {media ? <MediaBlock media={media} /> : null}
          </>
        )}
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
 * pulsing cursor while the tutor is still typing. Media/link markers
 * the model emits near the end are hidden until they resolve into
 * real resources.
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
        <span className="sr-only">AI tutor is replying…</span>
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
