import { AssistantChat } from "@/components/console/assistant-chat";
import { gatewayConfigured } from "@/lib/ai/gateway";

/**
 * Console — Nova, the AI operations assistant. A real agentic assistant:
 * she searches the live platform (topics, notes, questions, users, news,
 * stats), plans multi-step work, and proposes changes the operator approves
 * in-place before they execute for real.
 */
export default function ConsoleAssistantPage() {
  const configured = gatewayConfigured();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">AI assistant</h1>
        <p className="text-muted-foreground text-sm">
          Nova knows the full platform blueprint — every school, unit, topic, note, question, news
          article and user. Ask her to check anything; when she changes something, you approve it
          first and watch it execute.
        </p>
      </header>

      {configured ? (
        <AssistantChat />
      ) : (
        <div className="glass-card text-muted-foreground space-y-2 p-6 text-sm">
          <p className="text-foreground font-medium">The AI gateway is not configured</p>
          <p>
            Set <span className="font-mono">AEVIBRON_GATEWAY_URL</span> and{" "}
            <span className="font-mono">AEVIBRON_API_KEY</span> in the deployment environment, then
            reload this page.
          </p>
        </div>
      )}
    </div>
  );
}
