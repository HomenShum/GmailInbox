export type PinnedArtifactType = "resume" | "story_bank" | "target_list" | "constraint" | "portfolio" | "note";

export type PinnedArtifactVisibility =
  | "local_only"
  | "local_summary_only"
  | "approved_summary_to_nodebench"
  | "approved_full_text";

export interface PinnedArtifactPreview {
  headline: string;
  bullets: string[];
  signals: string[];
  agentUses: string[];
  safety: string;
  needsExtraction?: boolean;
}

export interface PinnedArtifactView {
  id: string;
  name: string;
  artifact_type: PinnedArtifactType;
  local_path: string | null;
  file_name: string | null;
  source: string;
  summary: string | null;
  preview: PinnedArtifactPreview;
  tags: string[];
  visibility_policy: PinnedArtifactVisibility;
  approved_for_matching: boolean;
  approved_for_external_research: boolean;
  pinned: boolean;
  is_primary: boolean;
  exists: boolean;
  updated_at: number;
  created_at: number;
}

export interface PinnedContextSummary {
  artifacts: PinnedArtifactView[];
  primary: PinnedArtifactView | null;
  count: number;
  matchingCount: number;
  externalResearchCount: number;
}
