"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

/**
 * BioChem markdown renderer: GFM tables/lists + LaTeX math via KaTeX.
 * Raw HTML is intentionally NOT enabled — content is stored as markdown and
 * rendered as React elements, which keeps XSS impossible by construction.
 */

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        // Typography tuned for study reading.
        "text-foreground/90 max-w-none space-y-4 text-[15px] leading-7",
        // Headings
        "[&_h1]:font-heading [&_h1]:mt-8 [&_h1]:scroll-m-20 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight",
        "[&_h2]:font-heading [&_h2]:mt-8 [&_h2]:scroll-m-20 [&_h2]:text-xl [&_h2]:font-semibold",
        "[&_h3]:mt-6 [&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_h4]:mt-4 [&_h4]:font-semibold",
        // Paragraphs and links
        "[&_p]:leading-7",
        "[&_a]:text-primary [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4",
        // Lists
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6",
        "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6",
        "[&_li]:leading-6",
        // Blockquote
        "[&_blockquote]:border-primary/40 [&_blockquote]:bg-muted/40 [&_blockquote]:border-l-2 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:italic",
        // Code
        "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
        "[&_pre]:bg-muted [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Tables
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border-border [&_th]:bg-muted/60 [&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border-border [&_td]:border [&_td]:px-3 [&_td]:py-2",
        // Horizontal rule
        "[&_hr]:border-border [&_hr]:my-8",
        // KaTeX display equations: scrollable on mobile, centred on desktop
        "[&_.katex-display]:my-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2",
        "[&_.katex]:text-[1.05em]",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
