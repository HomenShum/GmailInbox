"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PinnedContextManager from "@/components/context/PinnedContextManager";

interface ModelChoice { provider: string; model: string; free: boolean }

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  accounts: Array<{ account_email: string; connected_at: number; last_sync_at: number | null }>;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: string;
  actions: string;
  enabled: number;
  updated_at: number;
}

type SettingsPayload = {
  account?: AccountSettings;
  model?: { provider?: string; model?: string };
  privacy?: PrivacySettings;
};

type AccountSettings = {
  displayName: string;
  email: string;
  timezone: string;
  language: string;
};

type PrivacySettings = {
  storeEmailContent: boolean;
  modelImprovement: boolean;
  autoDeleteAfterYear: boolean;
  approvalRequired: boolean;
};

const tabs = ["account", "context", "gmail", "automations", "models", "privacy"] as const;
const defaultAccount: AccountSettings = {
  displayName: "Local User",
  email: "Connect Gmail to populate",
  timezone: "America/Los_Angeles",
  language: "English",
};
const defaultPrivacy: PrivacySettings = {
  storeEmailContent: true,
  modelImprovement: false,
  autoDeleteAfterYear: false,
  approvalRequired: true,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("account");
  const [modelConfig, setModelConfig] = useState<{ provider: string; model: string; keyVar: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [modelChoices, setModelChoices] = useState<ModelChoice[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [account, setAccount] = useState<AccountSettings>(defaultAccount);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultPrivacy);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [gmail, setGmail] = useState<GmailStatus>({ configured: false, connected: false, accounts: [] });
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestResult, setIngestResult] = useState<string>("");
  const [oauthMessage, setOauthMessage] = useState<string>("");

  const selectedModelChoice = useMemo(() => (
    modelChoices.find((choice) => `${choice.provider}:${choice.model}` === selectedModel) ?? modelChoices[0]
  ), [modelChoices, selectedModel]);

  const reloadGmail = useCallback(() => {
    fetch("/api/auth/google/status").then((r) => r.json()).then(setGmail).catch(() => {});
  }, []);

  const reloadAutomations = useCallback(() => {
    fetch("/api/automations").then((r) => r.json()).then((payload) => {
      setRules(Array.isArray(payload.rules) ? payload.rules : []);
    }).catch(() => setRules([]));
  }, []);

  const reloadConfig = useCallback(() => {
    fetch("/api/config").then((r) => r.json()).then((payload) => {
      const choices: ModelChoice[] = [...(payload.free ?? []), ...(payload.paid ?? [])];
      const settings = (payload.settings ?? {}) as SettingsPayload;
      setModelConfig(payload.current ?? null);
      setIsConnected(!!payload.hasKey);
      setModelChoices(choices);
      setAccount({ ...defaultAccount, ...(settings.account ?? {}) });
      setPrivacy(normalizePrivacy(settings.privacy));
      const savedModel = settings.model?.provider && settings.model?.model
        ? `${settings.model.provider}:${settings.model.model}`
        : payload.current
          ? `${payload.current.provider}:${payload.current.model}`
          : choices[0]
            ? `${choices[0].provider}:${choices[0].model}`
            : "";
      setSelectedModel(savedModel);
    }).catch(() => setIsConnected(false));
  }, []);

  useEffect(() => {
    reloadConfig();
    reloadAutomations();
    reloadGmail();

    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    const tab = params.get("tab");
    if (status === "connected") setOauthMessage(`Connected ${params.get("email") ?? ""}`);
    else if (status === "error") setOauthMessage(`Connection failed: ${params.get("msg") ?? "unknown"}`);
    if (status) {
      setActiveTab("gmail");
      window.history.replaceState({}, "", "/settings");
    } else if (tab && tabs.includes(tab as (typeof tabs)[number])) {
      setActiveTab(tab as (typeof tabs)[number]);
    }
  }, [reloadAutomations, reloadConfig, reloadGmail]);

  async function saveSettings(key: "account" | "model" | "privacy") {
    setSavingKey(key);
    const body: SettingsPayload = {};
    if (key === "account") body.account = account;
    if (key === "privacy") body.privacy = privacy;
    if (key === "model" && selectedModelChoice) body.model = { provider: selectedModelChoice.provider, model: selectedModelChoice.model };
    try {
      const payload = await fetch("/api/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (payload.current) setModelConfig(payload.current);
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Settings saved" } }));
    } catch {
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "err", text: "Could not save settings" } }));
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleRule(rule: AutomationRule) {
    setSavingKey(rule.id);
    setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: item.enabled ? 0 : 1 } : item));
    try {
      const payload = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      }).then((r) => r.json());
      if (Array.isArray(payload.rules)) setRules(payload.rules);
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: `${rule.name} ${rule.enabled ? "paused" : "enabled"}` } }));
    } catch {
      reloadAutomations();
      window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "err", text: "Could not update automation" } }));
    } finally {
      setSavingKey(null);
    }
  }

  async function disconnect(email: string) {
    await fetch("/api/auth/google/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    reloadGmail();
  }

  async function ingestNow(full = false) {
    setIngestBusy(true);
    setIngestResult("");
    try {
      const result = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "ingest_inbox",
          args: full ? { max_pages: 50, page_size: 500 } : { max_pages: 5, page_size: 100 },
        }),
      }).then((r) => r.json());
      if (result.ok) {
        const more = result.has_more ? " More messages remain after the safety cap." : " Mailbox page range complete.";
        const automation = result.automations ? ` Automations: ${result.automations.matched} matched, ${result.automations.actions} actions.` : "";
        setIngestResult(`Fetched ${result.fetched}, inserted ${result.inserted}, classified ${result.classified} in ${result.duration_ms}ms.${automation}${more}`);
        window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: `Synced ${result.fetched} emails` } }));
      } else {
        setIngestResult(`Error: ${result.error}`);
        window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "err", text: result.error } }));
      }
    } finally {
      setIngestBusy(false);
    }
  }

  return (
    <div className="workspace-page space-y-4 p-4 xl:p-5" data-testid="settings-view">
      <div className="workspace-hero flex flex-wrap items-center gap-2 p-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-[13px] font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-subtle)] text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="max-w-5xl space-y-4">
        {activeTab === "account" && (
          <section className="section-frame p-6">
            <SectionTitle title="Account Settings" detail="These preferences persist locally and guide the workspace shell." />
            <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.8fr)_minmax(280px,0.55fr)]">
              <div className="max-w-md space-y-4">
                <TextField label="Display name" value={account.displayName} onChange={(value) => setAccount((current) => ({ ...current, displayName: value }))} />
                <TextField label="Email" value={account.email} onChange={(value) => setAccount((current) => ({ ...current, email: value }))} />
                <SelectField
                  label="Timezone"
                  value={account.timezone}
                  options={["America/Los_Angeles", "America/Denver", "America/New_York", "UTC"]}
                  onChange={(value) => setAccount((current) => ({ ...current, timezone: value }))}
                />
                <SelectField
                  label="Language"
                  value={account.language}
                  options={["English", "Spanish", "French"]}
                  onChange={(value) => setAccount((current) => ({ ...current, language: value }))}
                />
                <PrimaryButton loading={savingKey === "account"} onClick={() => saveSettings("account")}>Save account</PrimaryButton>
              </div>
              <div className="rounded-md border bg-[var(--bg-subtle)] p-4" style={{ borderColor: "var(--border-muted)" }}>
                <div className="mb-3 text-[12px] font-semibold">Workspace behavior</div>
                <div className="space-y-3 text-[12px]">
                  <SettingFact label="Mailbox actions" value={privacy.approvalRequired ? "Approval required" : "Autopilot allowed"} />
                  <SettingFact label="Pinned context" value="Visible in top bar" />
                  <SettingFact label="Agent mode" value={isConnected ? "Connected" : "Demo until API key"} />
                  <SettingFact label="Data location" value="Local workspace" />
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "context" && <PinnedContextManager />}

        {activeTab === "gmail" && (
          <section className="section-frame p-6">
            <SectionTitle title="Gmail Connection" detail="Connect, sync, and classify Gmail from the same local workflow." />
            {oauthMessage && (
              <div className="mb-4 rounded-lg p-3 text-[12px]" style={{
                background: oauthMessage.startsWith("Connected") ? "#ecfdf5" : "#fef2f2",
                color: oauthMessage.startsWith("Connected") ? "var(--ok)" : "var(--err)",
              }}>{oauthMessage}</div>
            )}
            {!gmail.configured && (
              <div className="mb-4 rounded-lg p-3 text-[12px]" style={{ background: "#fffbeb", color: "var(--warn)" }}>
                <code className="font-mono">GOOGLE_CLIENT_ID</code> / <code className="font-mono">GOOGLE_CLIENT_SECRET</code> are missing in <code className="font-mono">.env.local</code>.
              </div>
            )}
            <div className="max-w-2xl space-y-3">
              {gmail.accounts.length === 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-dashed p-4" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <div className="text-[13px] font-medium">No Gmail account connected</div>
                    <div className="mt-1 text-[11px] text-[var(--text-dim)]">Read-only plus label-modify scopes. Mailbox changes still require approval.</div>
                  </div>
                  <a
                    href="/api/auth/google/init"
                    className={`whitespace-nowrap rounded-md px-4 py-2 text-[13px] font-medium text-white ${gmail.configured ? "" : "pointer-events-none opacity-40"}`}
                    style={{ background: "var(--accent)" }}
                  >
                    Connect Gmail
                  </a>
                </div>
              ) : gmail.accounts.map((acc) => (
                <div key={acc.account_email} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--ok)", background: "#ecfdf5" }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: "var(--ok)" }} />
                      <span className="text-[13px] font-medium">{acc.account_email}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-dim)]">
                      Connected {new Date(acc.connected_at * 1000).toLocaleString()}
                      {acc.last_sync_at && ` - Last sync ${new Date(acc.last_sync_at * 1000).toLocaleString()}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <SecondaryButton disabled={ingestBusy} onClick={() => ingestNow(false)}>{ingestBusy ? "Syncing..." : "Sync now"}</SecondaryButton>
                    <PrimaryButton loading={ingestBusy} onClick={() => ingestNow(true)}>Full sync</PrimaryButton>
                    <SecondaryButton onClick={() => disconnect(acc.account_email)}>Disconnect</SecondaryButton>
                  </div>
                </div>
              ))}
              {ingestResult && (
                <div className="rounded-lg bg-[var(--bg-subtle)] p-3 font-mono text-[12px] text-[var(--text-dim)]">{ingestResult}</div>
              )}
            </div>
          </section>
        )}

        {activeTab === "automations" && (
          <section className="section-frame p-6">
            <SectionTitle title="Automation Rules" detail="Rules are live. Toggles persist and affect autopilot matching after the next run." />
            <div className="grid gap-3 md:grid-cols-2">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-md border bg-white p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium [overflow-wrap:anywhere]">{rule.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-[var(--text-dim)] [overflow-wrap:anywhere]">{rule.description ?? rule.trigger}</div>
                    </div>
                    <Toggle checked={!!rule.enabled} disabled={savingKey === rule.id} onChange={() => toggleRule(rule)} />
                  </div>
                  <div className="mt-3 grid gap-2 text-[10px] text-[var(--text-dim)]">
                    <SettingFact label="Trigger" value={rule.trigger} />
                    <SettingFact label="Updated" value={new Date(rule.updated_at * 1000).toLocaleDateString()} />
                  </div>
                </div>
              ))}
              {rules.length === 0 && <div className="rounded-md border p-4 text-[12px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>No automation rules loaded.</div>}
            </div>
          </section>
        )}

        {activeTab === "models" && (
          <section className="section-frame p-6">
            <SectionTitle title="AI Model Settings" detail="The selected model is persisted and used by model resolution when the provider key is available." />
            <div className="max-w-2xl space-y-4">
              <div className="rounded-lg bg-[var(--accent-50)] p-3 text-[11px] text-[var(--accent-600)]">
                Current: <span className="font-medium">{modelConfig?.model ?? "(loading...)"}</span> (Provider: {modelConfig?.provider ?? "-"})
              </div>
              <SelectField
                label="Default model"
                value={selectedModel}
                options={modelChoices.map((choice) => `${choice.provider}:${choice.model}`)}
                labels={Object.fromEntries(modelChoices.map((choice) => [`${choice.provider}:${choice.model}`, `${choice.model} (${choice.provider}${choice.free ? ", free" : ", paid"})`]))}
                onChange={setSelectedModel}
              />
              <div className="rounded-md border bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--text-dim)]" style={{ borderColor: "var(--border-muted)" }}>
                API keys stay in environment variables. This screen stores only provider and model preference.
              </div>
              <PrimaryButton loading={savingKey === "model"} onClick={() => saveSettings("model")}>Save model</PrimaryButton>
            </div>
          </section>
        )}

        {activeTab === "privacy" && (
          <section className="section-frame p-6">
            <SectionTitle title="Privacy & Data" detail="These choices are saved locally and used to explain agent behavior." />
            <div className="max-w-xl space-y-3">
              <ToggleRow label="Store email content locally" checked={privacy.storeEmailContent} onChange={(value) => setPrivacy((current) => ({ ...current, storeEmailContent: value }))} />
              <ToggleRow label="Share data for model improvement" checked={privacy.modelImprovement} onChange={(value) => setPrivacy((current) => ({ ...current, modelImprovement: value }))} />
              <ToggleRow label="Automated deletion after 1 year" checked={privacy.autoDeleteAfterYear} onChange={(value) => setPrivacy((current) => ({ ...current, autoDeleteAfterYear: value }))} />
              <ToggleRow label="Require approval before mailbox changes" checked={privacy.approvalRequired} onChange={(value) => setPrivacy((current) => ({ ...current, approvalRequired: value }))} />
              <PrimaryButton loading={savingKey === "privacy"} onClick={() => saveSettings("privacy")}>Save privacy</PrimaryButton>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-5">
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="mt-1 text-[11px] text-[var(--text-dim)]">{detail}</div>
    </div>
  );
}

function normalizePrivacy(value: unknown): PrivacySettings {
  if (!value || typeof value !== "object") return defaultPrivacy;
  const privacy = value as Partial<PrivacySettings> & {
    storeEmailContentLocally?: boolean;
    shareDataForModelImprovement?: boolean;
    autoDeleteAfterOneYear?: boolean;
  };
  return {
    storeEmailContent: privacy.storeEmailContent ?? privacy.storeEmailContentLocally ?? defaultPrivacy.storeEmailContent,
    modelImprovement: privacy.modelImprovement ?? privacy.shareDataForModelImprovement ?? defaultPrivacy.modelImprovement,
    autoDeleteAfterYear: privacy.autoDeleteAfterYear ?? privacy.autoDeleteAfterOneYear ?? defaultPrivacy.autoDeleteAfterYear,
    approvalRequired: privacy.approvalRequired ?? defaultPrivacy.approvalRequired,
  };
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--text-dim)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border bg-[var(--bg-subtle)] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50"
        style={{ borderColor: "var(--border)" }}
      />
    </label>
  );
}

function SelectField({ label, value, options, labels, onChange }: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--text-dim)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border bg-[var(--bg-subtle)] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        {options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3" style={{ borderColor: "var(--border)" }}>
      <div className="text-[12px]">{label}</div>
      <Toggle checked={checked} onChange={() => onChange(!checked)} />
    </div>
  );
}

function Toggle({ checked, disabled = false, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="relative h-5 w-9 rounded-full transition disabled:opacity-50"
      style={{ background: checked ? "var(--ok)" : "var(--border)" }}
      aria-pressed={checked}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full border bg-white transition"
        style={{ left: checked ? 18 : 2, borderColor: "var(--border)" }}
      />
    </button>
  );
}

function PrimaryButton({ children, loading = false, onClick }: { children: ReactNode; loading?: boolean; onClick: () => void }) {
  return (
    <button disabled={loading} onClick={onClick} className="rounded-md bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50">
      {loading ? "Saving..." : children}
    </button>
  );
}

function SecondaryButton({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className="rounded-md bg-[var(--bg-subtle)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] disabled:opacity-50">
      {children}
    </button>
  );
}

function SettingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="rounded bg-white px-2 py-1 text-[11px] font-medium text-[var(--text)] [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}
