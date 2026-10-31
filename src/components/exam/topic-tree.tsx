import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Database, ExamZone } from "@/types/domain";

type TopicRow = Database["public"]["Tables"]["topics"]["Row"];
export type NestedTopic = TopicRow & { children: TopicRow[] };

/**
 * Collapsible topic tree for one exam zone. Parent topics expand to reveal
 * child chips; every topic links to `?topic=slug` on the zone page.
 * Server-renderable — the Collapsible primitives manage their own state.
 */
export function TopicTree({
  nodes,
  zone,
  activeSlug,
}: {
  nodes: NestedTopic[];
  zone: ExamZone;
  activeSlug: string | null;
}) {
  if (nodes.length === 0) {
    return (
      <p className="glass-card text-muted-foreground p-6 text-sm">
        No topics have been added to this zone yet — check back soon.
      </p>
    );
  }

  return (
    <nav aria-label={`Topics in ${zone}`} className="glass-card divide-border/60 divide-y">
      {nodes.map((node) => (
        <TopicTreeItem key={node.id} node={node} zone={zone} activeSlug={activeSlug} />
      ))}
    </nav>
  );
}

function TopicTreeItem({
  node,
  zone,
  activeSlug,
}: {
  node: NestedTopic;
  zone: ExamZone;
  activeSlug: string | null;
}) {
  const isActive = node.slug === activeSlug;
  const hasActiveChild = node.children.some((child) => child.slug === activeSlug);
  const href = `/zones/${zone}?topic=${node.slug}`;

  const chipClasses = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-all focus-ring",
      active
        ? "border-primary/50 bg-primary/15 text-primary"
        : "border-border/70 bg-card/50 text-foreground/80 hover:border-primary/30 hover:text-foreground",
    );

  if (node.children.length === 0) {
    return (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "focus-ring flex min-h-11 items-center gap-2 p-4 text-sm font-semibold transition-colors",
          isActive ? "text-primary" : "hover:text-primary",
        )}
      >
        {node.title}
        {isActive ? (
          <span className="bg-primary/15 text-primary ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold">
            Viewing
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Collapsible defaultOpen={isActive || hasActiveChild}>
      <div className="flex items-center gap-1 p-4 pb-0">
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "font-heading focus-ring flex min-h-11 flex-1 items-center rounded-lg px-2 text-sm font-semibold transition-colors",
            isActive ? "text-primary" : "hover:text-primary",
          )}
        >
          {node.title}
        </Link>
        <CollapsibleTrigger
          className="group text-muted-foreground hover:bg-accent hover:text-foreground focus-ring flex size-11 items-center justify-center rounded-lg transition-colors"
          aria-label={`Show topics under ${node.title}`}
        >
          <ChevronDown
            className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="flex flex-wrap gap-2 p-4 pt-3">
          {node.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/zones/${zone}?topic=${child.slug}`}
                aria-current={child.slug === activeSlug ? "page" : undefined}
                className={chipClasses(child.slug === activeSlug)}
              >
                {child.title}
              </Link>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
