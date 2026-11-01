"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Atom,
  BookOpen,
  BrainCircuit,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Settings,
  Sparkles,
  Trophy,
  Briefcase,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Atom;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Study",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Exam Zones", href: "/zones", icon: Layers },
      { label: "Outcomes", href: "/outcomes", icon: CalendarCheck },
      { label: "Question Bank", href: "/questions", icon: ClipboardCheck },
      { label: "Past Papers", href: "/past-papers", icon: FileText },
    ],
  },
  {
    title: "Practice",
    items: [
      { label: "Mock Exams", href: "/mocks", icon: GraduationCap },
      { label: "Flashcards", href: "/flashcards", icon: Atom },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "AI Tutor", href: "/ai/tutor", icon: BrainCircuit },
      { label: "AI Practice", href: "/ai/practice", icon: ClipboardCheck },
      { label: "Question of the Day", href: "/ai/daily", icon: Sparkles },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "News & updates", href: "/news", icon: Newspaper },
      { label: "Discussions", href: "/community", icon: MessagesSquare },
      { label: "Messages", href: "/messages", icon: MessageCircle },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      { label: "Job Board", href: "/jobs", icon: Briefcase },
    ],
  },
  {
    title: "You",
    items: [
      { label: "Planner", href: "/planner", icon: Calendar },
      { label: "Contribute", href: "/submit", icon: BookOpen },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Support", href: "/support", icon: LifeBuoy },
    ],
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, profile } = useUser();

  const sections: NavSection[] = [...SECTIONS];
  if (can("view_class_analytics")) {
    sections.push({
      title: "Staff",
      items: [{ label: "Lecturer Panel", href: "/lecturer", icon: GraduationCap }],
    });
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-5 px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-muted-foreground/70 mb-1.5 px-3 text-[11px] font-semibold tracking-widest uppercase">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-ring flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/12 text-primary"
                        : "text-foreground/75 hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {profile ? (
        <p className="text-muted-foreground/60 mt-auto px-3 text-[11px]">
          Signed in as {profile.full_name} · {profile.role}
        </p>
      ) : null}
    </nav>
  );
}
