import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BioChem — Biochemistry Study Platform",
    short_name: "BioChem",
    description:
      "Exam zones, AI tutor, spaced-repetition flashcards, mock exams, encrypted messaging, planner, community and jobs for university biochemistry. Built by Aevibron.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#10192b",
    theme_color: "#0d9488",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    share_target: {
      action: "/share-target",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
    shortcuts: [
      {
        name: "Flashcards review",
        short_name: "Flashcards",
        url: "/flashcards",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Question of the Day",
        short_name: "Daily Qs",
        url: "/ai/daily",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Nova (AI Tutor)",
        short_name: "Tutor",
        url: "/ai/tutor",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
