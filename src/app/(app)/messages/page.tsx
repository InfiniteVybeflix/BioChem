import type { Metadata } from "next";
import { MessagesHome } from "@/components/messages/messages-home";

export const metadata: Metadata = {
  title: "Messages",
  description: "Encrypted realtime chats — direct messages, study groups and the community lounge.",
};

/**
 * Messages home. Data loads client-side (the user's Supabase session
 * scopes everything through RLS) and updates live via realtime.
 */
export default function MessagesPage() {
  return <MessagesHome />;
}
