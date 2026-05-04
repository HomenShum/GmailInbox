"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Edit3, FileText, MessageSquareText, Pin, Plus, ShieldCheck, Star, UploadCloud } from "lucide-react";
import { useCachedJson } from "@/lib/client-cache";
import type {
  PinnedArtifactType,
  PinnedArtifactView,
  PinnedArtifactVisibility,
  PinnedContextSummary,
} from "@/lib/pinned-types";

const artifactTypes: Array<{ value: PinnedArtifactType; label: string }> = [
  { value: "resume", label: "Resume" },
  { value: "story_bank", label: "Story bank" },
  { value: "target_list", label: "Target list" },
  { value: "constraint", label: "Constraint" },
  { value: "portfolio", label: "Portfolio" },
  { value: "note", label: "Note" },
];

export default function PinnedContextManager() {
  const { data, loading, error, refresh } = useCachedJson<PinnedContextSummary>(
    "pinned-context:summary",
    "/api/pinned-artifacts",
    { ttlMs: 60_000 },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [composerMode, setComposerMode] = useState<"file" | "prompt">("file");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    artifact_type: "resume" as PinnedArtifactType,
    local_path: "",
    summary: "",
    tags: "",
    approved_for_matching: true,
    approved_for_external_research: false,
    is_primary: false,
  });

  const artifacts = data?.artifacts ?? [];
  const selected = useMemo(() => {
    if (!artifacts.length) return null;
    return artifacts.find((artifact) => artifact.id === selectedId) ?? data?.primary ?? artifacts[0];
  }, [artifacts, data?.primary, selectedId]);

  async function createArtifact() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/pinned-artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags,
          visibility_policy: form.approved_for_external_research ? "approved_summary_to_nodebench" : "local_summary_only",
        }),
      });
      if (!response.ok) throw new Error("Could not pin artifact");
      setForm({
        name: "",
        artifact_type: "resume",
        local_path: "",
        summary: "",
        tags: "",
        approved_for_matching: true,
        approved_for_external_research: false,
        is_primary: false,
      });
      await refresh(true);
      window.dispatchEvent(new CustomEvent("workspace:pinned-context-refresh"));
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Pinned context updated" } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "err", text: err instanceof Error ? err.message : "Pin failed" } }));
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const selectedFiles = Array.from(files).filter((file) => file.size > 0);
    if (!selectedFiles.length || saving) return;
    setSaving(true);
    try {
      for (const file of selectedFiles) {
        const body = new FormData();
        body.set("file", file);
        body.set("name", form.name.trim() || file.name.replace(/\.[^.]+$/, ""));
        body.set("artifact_type", form.artifact_type);
        body.set("summary", form.summary.trim() || `Pinned local file ${file.name}.`);
        body.set("tags", form.tags.trim() || "uploaded,context");
        body.set("approved_for_matching", String(form.approved_for_matching));
        body.set("approved_for_external_research", String(form.approved_for_external_research));
        body.set("is_primary", String(form.is_primary));
        const response = await fetch("/api/pinned-artifacts", { method: "POST", body });
        if (!response.ok) throw new Error(`Could not pin ${file.name}`);
      }
      setForm((prev) => ({ ...prev, name: "", local_path: "", summary: "", tags: "", is_primary: false }));
      await refresh(true);
      window.dispatchEvent(new CustomEvent("workspace:pinned-context-refresh"));
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: `Pinned ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"}` } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "err", text: err instanceof Error ? err.message : "Upload failed" } }));
    } finally {
      setSaving(false);
      setDragActive(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function patchArtifact(id: string, changes: Partial<Pick<PinnedArtifactView,
    "pinned" | "is_primary" | "approved_for_matching" | "approved_for_external_research" | "visibility_policy"
  >>) {
    const body = {
      id,
      ...changes,
      visibility_policy: changes.visibility_policy ?? (
        changes.approved_for_external_research === true ? "approved_summary_to_nodebench" : undefined
      ),
    };
    await fetch("/api/pinned-artifacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh(true);
    window.dispatchEvent(new CustomEvent("workspace:pinned-context-refresh"));
  }

  async function updateDetails(id: string, changes: Partial<Pick<PinnedArtifactView, "name" | "artifact_type" | "local_path" | "summary" | "tags">>) {
    await fetch("/api/pinned-artifacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    await refresh(true);
    window.dispatchEvent(new CustomEvent("workspace:pinned-context-refresh"));
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Pinned context edited" } }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(440px,1.15fr)_minmax(300px,0.85fr)]">
      <section className="section-frame overflow-hidden">
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-[var(--accent-600)]" />
            <div>
              <div className="text-[13px] font-semibold">Pinned Workspace Context</div>
              <div className="text-[11px] text-[var(--text-dim)]">Visible artifacts the ambient agent can use for matching, briefings, and planning.</div>
            </div>
          </div>
        </div>

        <div className="p-3">
          {loading && !data && <div className="p-4 text-[12px] text-[var(--text-dim)]">Loading pinned context...</div>}
          {error && <div className="p-4 text-[12px] text-[var(--err)]">Pinned context could not load.</div>}
          <div className="plain-list">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                onClick={() => setSelectedId(artifact.id)}
                className={`plain-row w-full p-3 text-left transition-colors hover:bg-[var(--bg-subtle)] ${selected?.id === artifact.id ? "bg-[var(--accent-50)]" : ""}`}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded bg-white text-[var(--accent-600)]">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate text-[13px] font-semibold">{artifact.name}</span>
                      {artifact.is_primary && <Badge tone="accent">Primary</Badge>}
                      {!artifact.exists && artifact.local_path && <Badge tone="warn">Path missing</Badge>}
                    </div>
                    <div className="mt-1 line-clamp-1 text-[11px] text-[var(--text-dim)]">{artifact.preview.headline}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {artifact.tags.slice(0, 5).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <PolicyPill artifact={artifact} />
                  </div>
                </div>
              </button>
            ))}
            {!artifacts.length && (
              <div className="p-5 text-center text-[12px] text-[var(--text-dim)]">No artifacts pinned yet.</div>
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="inspector-panel p-4">
          {selected ? (
            <ArtifactPreview
              artifact={selected}
              onPatch={(changes) => patchArtifact(selected.id, changes)}
              onUpdateDetails={(changes) => updateDetails(selected.id, changes)}
            />
          ) : (
            <div className="text-[12px] text-[var(--text-dim)]">Select a pinned artifact to preview it.</div>
          )}
        </section>

        <section className="inspector-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-[var(--accent-600)]" />
            <div>
              <div className="text-[13px] font-semibold">Pin Local Artifact</div>
              <div className="text-[11px] text-[var(--text-dim)]">Drop a file or write a standing prompt. Raw contents stay local by default.</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setComposerMode("file");
                  setForm((prev) => ({ ...prev, artifact_type: prev.artifact_type === "note" ? "resume" : prev.artifact_type }));
                }}
                className={`h-8 rounded-md border px-3 text-[12px] font-medium ${composerMode === "file" ? "bg-[var(--accent)] text-white" : "text-[var(--text)] hover:bg-[var(--bg-subtle)]"}`}
                style={{ borderColor: "var(--border)" }}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  File
                </span>
              </button>
              <button
                onClick={() => {
                  setComposerMode("prompt");
                  setForm((prev) => ({ ...prev, artifact_type: "note", local_path: "" }));
                }}
                className={`h-8 rounded-md border px-3 text-[12px] font-medium ${composerMode === "prompt" ? "bg-[var(--accent)] text-white" : "text-[var(--text)] hover:bg-[var(--bg-subtle)]"}`}
                style={{ borderColor: "var(--border)" }}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Prompt
                </span>
              </button>
            </div>

            {composerMode === "file" && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  void uploadFiles(event.dataTransfer.files);
                }}
                className={`rounded-lg border border-dashed p-4 text-center transition-colors ${dragActive ? "bg-[var(--accent-50)]" : "bg-[var(--bg-subtle)]"}`}
                style={{ borderColor: dragActive ? "var(--accent)" : "var(--border)" }}
              >
                <UploadCloud className="mx-auto h-5 w-5 text-[var(--accent-600)]" />
                <div className="mt-2 text-[12px] font-medium">Drop a file here</div>
                <div className="mt-1 text-[11px] leading-snug text-[var(--text-dim)]">PDFs, docs, notes, screenshots, or local references are copied into the workspace artifact store.</div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="mt-3 h-8 rounded-md border bg-white px-3 text-[12px] font-medium text-[var(--accent-600)] disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  Choose file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) void uploadFiles(event.target.files);
                  }}
                />
              </div>
            )}

            <LabeledInput label="Name" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} placeholder="FDE resume, story bank, target list..." />
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">Type</span>
              <select
                value={form.artifact_type}
                onChange={(event) => setForm((prev) => ({ ...prev, artifact_type: event.target.value as PinnedArtifactType }))}
                className="h-9 w-full rounded-md border bg-[var(--bg-subtle)] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              >
                {artifactTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            {composerMode === "file" && (
              <LabeledInput label="Local path or reference" value={form.local_path} onChange={(value) => setForm((prev) => ({ ...prev, local_path: value }))} placeholder="Local resume path or document reference" />
            )}
            <LabeledTextarea
              label={composerMode === "prompt" ? "Prompt or standing instruction" : "Preview summary"}
              value={form.summary}
              onChange={(value) => setForm((prev) => ({ ...prev, summary: value }))}
              placeholder={composerMode === "prompt" ? "Always use my FDE resume first when ranking roles..." : "What should the agent know this is for?"}
            />
            <LabeledInput label="Tags" value={form.tags} onChange={(value) => setForm((prev) => ({ ...prev, tags: value }))} placeholder="resume, fde, career, matching" />

            <div className="grid gap-2">
              <ToggleRow
                label="Use for local matching"
                checked={form.approved_for_matching}
                onChange={(checked) => setForm((prev) => ({ ...prev, approved_for_matching: checked }))}
              />
              <ToggleRow
                label="Allow external research summaries"
                checked={form.approved_for_external_research}
                onChange={(checked) => setForm((prev) => ({ ...prev, approved_for_external_research: checked }))}
              />
              <ToggleRow
                label="Make primary lens"
                checked={form.is_primary}
                onChange={(checked) => setForm((prev) => ({ ...prev, is_primary: checked }))}
              />
            </div>

            <button
              onClick={createArtifact}
              disabled={saving || !form.name.trim() || (composerMode === "prompt" && !form.summary.trim())}
              className="h-9 w-full rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {saving ? "Pinning..." : composerMode === "prompt" ? "Pin prompt" : "Pin context"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function ArtifactPreview({ artifact, onPatch, onUpdateDetails }: {
  artifact: PinnedArtifactView;
  onPatch: (changes: Partial<Pick<PinnedArtifactView,
    "pinned" | "is_primary" | "approved_for_matching" | "approved_for_external_research" | "visibility_policy"
  >>) => void;
  onUpdateDetails: (changes: Partial<Pick<PinnedArtifactView, "name" | "artifact_type" | "local_path" | "summary" | "tags">>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: artifact.name,
    summary: artifact.summary ?? artifact.preview.headline,
    tags: artifact.tags.join(", "),
    artifact_type: artifact.artifact_type,
    local_path: artifact.local_path ?? "",
  });
  const nextVisibility: PinnedArtifactVisibility = artifact.approved_for_external_research
    ? "local_summary_only"
    : "approved_summary_to_nodebench";

  useEffect(() => {
    setEditing(false);
    setEditForm({
      name: artifact.name,
      summary: artifact.summary ?? artifact.preview.headline,
      tags: artifact.tags.join(", "),
      artifact_type: artifact.artifact_type,
      local_path: artifact.local_path ?? "",
    });
  }, [artifact.id, artifact.name, artifact.summary, artifact.preview.headline, artifact.tags, artifact.artifact_type, artifact.local_path]);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="meta-label">Preview</div>
          <h2 className="mt-1 text-[16px] font-semibold leading-tight [overflow-wrap:anywhere]">{artifact.name}</h2>
          <div className="mt-1 truncate text-[11px] text-[var(--text-dim)]">{artifact.file_name ?? artifact.local_path ?? artifact.source}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((value) => !value)}
            className="flex h-7 w-7 items-center justify-center rounded-md border hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Edit pinned context"
          >
            <Edit3 className="h-3.5 w-3.5 text-[var(--text-dim)]" />
          </button>
          {artifact.is_primary ? <Star className="h-4 w-4 shrink-0 fill-[var(--accent)] text-[var(--accent)]" /> : null}
        </div>
      </div>

      {editing && (
        <div className="mb-3 rounded-lg border bg-[var(--bg-subtle)] p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold">
            <Edit3 className="h-3.5 w-3.5 text-[var(--accent-600)]" />
            Edit context details
          </div>
          <div className="space-y-2">
            <LabeledInput label="Name" value={editForm.name} onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))} />
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">Type</span>
              <select
                value={editForm.artifact_type}
                onChange={(event) => setEditForm((prev) => ({ ...prev, artifact_type: event.target.value as PinnedArtifactType }))}
                className="h-9 w-full rounded-md border bg-white px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              >
                {artifactTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <LabeledTextarea label="Summary or prompt" value={editForm.summary} onChange={(value) => setEditForm((prev) => ({ ...prev, summary: value }))} />
            <LabeledInput label="Tags" value={editForm.tags} onChange={(value) => setEditForm((prev) => ({ ...prev, tags: value }))} />
            <LabeledInput label="Local path or reference" value={editForm.local_path} onChange={(value) => setEditForm((prev) => ({ ...prev, local_path: value }))} />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditing(false)}
                className="h-8 rounded-md border px-3 text-[12px] font-medium text-[var(--text-dim)]"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdateDetails({
                    name: editForm.name,
                    artifact_type: editForm.artifact_type,
                    local_path: editForm.local_path,
                    summary: editForm.summary,
                    tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                  });
                  setEditing(false);
                }}
                disabled={!editForm.name.trim()}
                className="h-8 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white disabled:opacity-50"
              >
                Save edit
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
        <div className="text-[12px] font-medium leading-relaxed">{artifact.preview.headline}</div>
        <ul className="mt-2 space-y-1 text-[11px] text-[var(--text-dim)]">
          {artifact.preview.bullets.slice(0, 4).map((bullet) => <li key={bullet}>- {bullet}</li>)}
        </ul>
      </div>

      <div className="mt-3">
        <div className="meta-label mb-2">Agent can use this for</div>
        <div className="grid gap-1">
          {artifact.preview.agentUses.map((use) => (
            <div key={use} className="flex items-center gap-2 text-[11px] text-[var(--text-dim)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" />
              <span>{use}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 flex items-center gap-2 text-[12px] font-medium">
          <ShieldCheck className="h-4 w-4 text-[var(--accent-600)]" />
          Policy
        </div>
        <div className="text-[11px] leading-relaxed text-[var(--text-dim)]">{artifact.preview.safety}</div>
      </div>

      <div className="mt-3 grid gap-2">
        <button
          onClick={() => onPatch({ is_primary: true })}
          disabled={artifact.is_primary}
          className="h-8 rounded-md border px-3 text-[12px] font-medium text-[var(--accent-600)] disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          Make primary lens
        </button>
        <button
          onClick={() => onPatch({
            approved_for_external_research: !artifact.approved_for_external_research,
            visibility_policy: nextVisibility,
          })}
          className="h-8 rounded-md border px-3 text-[12px] font-medium text-[var(--text)]"
          style={{ borderColor: "var(--border)" }}
        >
          {artifact.approved_for_external_research ? "Disable external summaries" : "Allow external summaries"}
        </button>
        <button
          onClick={() => onPatch({ pinned: !artifact.pinned })}
          className="h-8 rounded-md border px-3 text-[12px] font-medium text-[var(--err)]"
          style={{ borderColor: "var(--border)" }}
        >
          {artifact.pinned ? "Unpin from workspace" : "Pin to workspace"}
        </button>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border bg-[var(--bg-subtle)] px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--text-dim)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-y rounded-md border bg-[var(--bg-subtle)] px-3 py-2 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <span className="text-[12px] text-[var(--text)]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
    </label>
  );
}

function PolicyPill({ artifact }: { artifact: PinnedArtifactView }) {
  if (artifact.approved_for_external_research) return <Badge tone="warn">External summaries</Badge>;
  if (artifact.approved_for_matching) return <Badge tone="ok">Local matching</Badge>;
  return <Badge tone="muted">Not used</Badge>;
}

function Badge({ children, tone = "muted" }: { children: string; tone?: "muted" | "accent" | "ok" | "warn" }) {
  const styles = {
    muted: "bg-[var(--bg-subtle)] text-[var(--text-dim)]",
    accent: "bg-[var(--accent-50)] text-[var(--accent-600)]",
    ok: "bg-emerald-50 text-[var(--ok)]",
    warn: "bg-amber-50 text-[var(--warn)]",
  }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles}`}>{children}</span>;
}
