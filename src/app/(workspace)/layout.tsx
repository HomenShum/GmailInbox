import Sidebar from "@/components/shell/Sidebar";
import TopBar from "@/components/shell/TopBar";
import AgentRail from "@/components/shell/AgentRail";
import WorkspaceClient from "@/components/shell/WorkspaceClient";
import type { ReactNode } from "react";
import { resolveModel, hasAnyKey } from "@/lib/models";

export const dynamic = "force-dynamic";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const cfg = resolveModel();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <WorkspaceClient />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0" style={{ marginLeft: 220 }}>
        <TopBar />
        <main className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 overflow-auto min-w-0">{children}</div>
          <AgentRail
            modelConfig={{
              provider: cfg.provider,
              model: cfg.model,
              keyVar: cfg.apiKeyVar,
              hasKey: hasAnyKey(),
            }}
          />
        </main>
      </div>
    </div>
  );
}
