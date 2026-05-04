import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

type DemoProps = {
  vertical?: boolean;
};

const ASSETS = {
  today: "/remotion-public-assets/today-top-jobs.svg",
  jobs: "/remotion-public-assets/today-top-jobs.svg",
  nodebench: "/remotion-public-assets/nodebench-public-research.svg",
  mindmap: "/remotion-public-assets/identity-map.svg",
  trend: "/remotion-public-assets/recruiter-trend.svg",
  audio: "/remotion-generated/gmail-agent-demo-bed.m4a",
};

const metrics = [
  { label: "Local emails", value: "90,142", sub: "indexed from Gmail" },
  { label: "Gmail threads", value: "69,097", sub: "too much for one prompt" },
  { label: "Private body chars", value: "11.9M", sub: "kept local" },
  { label: "Verified claims", value: "241", sub: "promoted with evidence" },
];

const clusters = [
  ["Finance / risk", 44, "#2563eb"],
  ["Career / jobs", 41, "#7c3aed"],
  ["Product design", 21, "#0891b2"],
  ["Software dev", 21, "#059669"],
  ["AI agents", 17, "#d97706"],
  ["Startup builder", 16, "#dc2626"],
] as const;

export const GmailAgentDemo = ({ vertical = false }: DemoProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = vertical || height > width;

  return (
    <AbsoluteFill style={styles.page}>
      <Audio src={staticFile(ASSETS.audio)} volume={0.22} />
      <Background />
      <ProgressBar frame={frame} total={2520} />
      <Sequence from={0} durationInFrames={180}>
        <Opening vertical={isVertical} />
      </Sequence>
      <Sequence from={180} durationInFrames={300}>
        <ScaleScene vertical={isVertical} />
      </Sequence>
      <Sequence from={480} durationInFrames={330}>
        <PipelineScene vertical={isVertical} />
      </Sequence>
      <Sequence from={810} durationInFrames={330}>
        <TopJobsScene vertical={isVertical} />
      </Sequence>
      <Sequence from={1140} durationInFrames={330}>
        <NodeBenchScene vertical={isVertical} />
      </Sequence>
      <Sequence from={1470} durationInFrames={330}>
        <IdentityScene vertical={isVertical} />
      </Sequence>
      <Sequence from={1800} durationInFrames={300}>
        <VerificationScene vertical={isVertical} />
      </Sequence>
      <Sequence from={2100} durationInFrames={420}>
        <ClosingScene vertical={isVertical} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};

function Opening({ vertical }: { vertical: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const screenshot = interpolate(frame, [0, 120], [1.08, 1.0], { extrapolateRight: "clamp" });
  return (
    <SceneShell vertical={vertical}>
      <div style={vertical ? styles.heroVertical : styles.hero}>
        <div style={{ ...styles.copy, transform: `translateY(${(1 - enter) * 26}px)`, opacity: enter }}>
          <Kicker>Gmail Workspace Demo</Kicker>
          <h1 style={vertical ? styles.h1Vertical : styles.h1}>
            Turning inbox chaos into evidence-backed agent memory.
          </h1>
          <p style={styles.lede}>
            A local-private pipeline for 90k emails: ingest, shard, judge, promote, then use the memory for job decisions.
          </p>
        </div>
        <div style={vertical ? styles.heroImageVertical : styles.heroImage}>
          <Img
            src={staticFile(ASSETS.today)}
            style={{
              ...styles.screenshot,
              transform: `scale(${screenshot}) translateY(${vertical ? 0 : 10}px)`,
            }}
          />
          <FloatingBadge style={{ right: 28, top: 28 }}>Raw email stays local</FloatingBadge>
        </div>
      </div>
    </SceneShell>
  );
}

function ScaleScene({ vertical }: { vertical: boolean }) {
  return (
    <SceneShell vertical={vertical}>
      <SectionHeader
        kicker="The hard part"
        title="This is not a clean dataset."
        body="It is years of finance, job searching, GitHub, AI agents, tax/admin, product ideas, personal logistics, and recruiter noise."
      />
      <div style={vertical ? styles.metricGridVertical : styles.metricGrid}>
        {metrics.map((metric, index) => (
          <MetricCard key={metric.label} metric={metric} delay={index * 10} />
        ))}
      </div>
      <div style={vertical ? styles.twoColumnVertical : styles.twoColumn}>
        <InsightCard
          title="Production mistake"
          body="Do not dump the whole inbox into a model. It is private, expensive, hard to verify, and too large."
        />
        <InsightCard
          title="Production answer"
          body="Build a local memory index. Work in bounded shards. Only promote claims that survive evidence judging."
        />
      </div>
    </SceneShell>
  );
}

function PipelineScene({ vertical }: { vertical: boolean }) {
  const nodes = [
    ["Gmail", "full threads"],
    ["Local store", "private bodies"],
    ["Shards", "topic / time / domain"],
    ["LLM judge", "aggregate only"],
    ["Claims", "evidence backed"],
    ["Agent", "daily decisions"],
  ] as const;
  return (
    <SceneShell vertical={vertical}>
      <SectionHeader
        kicker="Architecture"
        title="Memory is a pipeline, not a prompt."
        body="The agent gets verified memory. The model never needs raw inbox access to be useful."
      />
      <div style={vertical ? styles.pipelineVertical : styles.pipeline}>
        {nodes.map((node, index) => (
          <PipelineNode key={node[0]} label={node[0]} sub={node[1]} index={index} vertical={vertical} />
        ))}
      </div>
      <div style={styles.ruleBox}>
        <strong>Privacy boundary:</strong> external judge sees aggregate shard summaries, counts, terms, dates, and evidence IDs only. Raw bodies remain in the local private table.
      </div>
    </SceneShell>
  );
}

function TopJobsScene({ vertical }: { vertical: boolean }) {
  return (
    <SceneShell vertical={vertical}>
      <SplitVisual
        vertical={vertical}
        image={ASSETS.jobs}
        kicker="Daily demo"
        title="Today becomes top jobs, not another wall of mail."
        body="The workspace narrows the inbox to job emails, pinned resume context, fit signals, and next actions."
        bullets={["Pinned artifacts guide ranking", "Private claims inform fit", "Open job email in a focused modal", "Keep the UI one-workspace, not route sprawl"]}
      />
    </SceneShell>
  );
}

function NodeBenchScene({ vertical }: { vertical: boolean }) {
  return (
    <SceneShell vertical={vertical}>
      <SplitVisual
        vertical={vertical}
        image={ASSETS.nodebench}
        kicker="NodeBench bridge"
        title="Public research and private scoring stay separate."
        body="Gmail sends public-safe signals to NodeBench: company, role, sender domain, job URL. It keeps raw email, resume, and private fit scoring local."
        bullets={["Resolve company and role", "Fetch public dossier", "Attach sources and confidence", "Score against private resume locally"]}
        imageOnRight
      />
    </SceneShell>
  );
}

function IdentityScene({ vertical }: { vertical: boolean }) {
  return (
    <SceneShell vertical={vertical}>
      <SectionHeader
        kicker="What we learned"
        title="The mailbox contains an identity arc."
        body="Finance and risk remain the base. The newer layer is software, product, AI agents, and startup-building output."
      />
      <div style={vertical ? styles.identityVertical : styles.identity}>
        <div style={styles.clusterCard}>
          <h3 style={styles.cardTitle}>Durable claim clusters</h3>
          {clusters.map(([name, value, color], index) => (
            <ClusterRow key={name} name={name} value={value} color={color} delay={index * 7} />
          ))}
        </div>
        <Img src={staticFile(ASSETS.mindmap)} style={styles.identityImage} />
      </div>
    </SceneShell>
  );
}

function VerificationScene({ vertical }: { vertical: boolean }) {
  return (
    <SceneShell vertical={vertical}>
      <div style={vertical ? styles.verificationVertical : styles.verification}>
        <div>
          <Kicker>Verification layer</Kicker>
          <h2 style={vertical ? styles.h2Vertical : styles.h2}>The judge is useful because it can say no.</h2>
          <p style={styles.body}>
            Deterministic classifiers find candidates. The judge checks whether each memory claim is supported by aggregate evidence.
          </p>
          <div style={styles.verdictGrid}>
            <VerdictCard label="Supported current shards" value="167" color="#059669" />
            <VerdictCard label="Needs revision" value="8" color="#d97706" />
            <VerdictCard label="Durable claims" value="241" color="#4f46e5" />
          </div>
        </div>
        <div style={styles.evidenceCard}>
          <div style={styles.evidenceLine}><span>Evidence IDs</span><strong>preserved</strong></div>
          <div style={styles.evidenceLine}><span>Body hash</span><strong>invalidates stale shards</strong></div>
          <div style={styles.evidenceLine}><span>Verdict</span><strong>supported / needs revision</strong></div>
          <div style={styles.evidenceLine}><span>Boundary</span><strong>local_private_only</strong></div>
        </div>
      </div>
    </SceneShell>
  );
}

function ClosingScene({ vertical, fps }: { vertical: boolean; fps: number }) {
  const frame = useCurrentFrame();
  const pulse = spring({ frame: frame - 40, fps, config: { damping: 18, stiffness: 70 } });
  return (
    <SceneShell vertical={vertical}>
      <div style={vertical ? styles.closingVertical : styles.closing}>
        <div>
          <Kicker>LinkedIn thesis</Kicker>
          <h2 style={vertical ? styles.h2Vertical : styles.h2}>
            Personal agents need memory. Memory needs evidence.
          </h2>
          <p style={styles.lede}>
            This started as inbox survival. It is becoming a personal operating system for attention, opportunity, and identity over time.
          </p>
        </div>
        <div style={{ ...styles.finalLoop, transform: `scale(${0.96 + pulse * 0.04})` }}>
          <LoopStep label="Inbox" />
          <LoopStep label="Memory" />
          <LoopStep label="Research" />
          <LoopStep label="Decision" />
        </div>
      </div>
    </SceneShell>
  );
}

function SplitVisual({
  vertical,
  image,
  kicker,
  title,
  body,
  bullets,
  imageOnRight = false,
}: {
  vertical: boolean;
  image: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  imageOnRight?: boolean;
}) {
  const copy = (
    <div style={styles.splitCopy}>
      <Kicker>{kicker}</Kicker>
      <h2 style={vertical ? styles.h2Vertical : styles.h2}>{title}</h2>
      <p style={styles.body}>{body}</p>
      <div style={styles.bullets}>
        {bullets.map((bullet, index) => (
          <AnimatedBullet key={bullet} delay={index * 8}>{bullet}</AnimatedBullet>
        ))}
      </div>
    </div>
  );
  const visual = (
    <div style={styles.splitVisual}>
      <Img src={staticFile(image)} style={styles.screenshot} />
    </div>
  );
  if (vertical) {
    return <div style={styles.splitVertical}>{copy}{visual}</div>;
  }
  return <div style={styles.split}>{imageOnRight ? <>{copy}{visual}</> : <>{visual}{copy}</>}</div>;
}

function MetricCard({ metric, delay }: { metric: (typeof metrics)[number]; delay: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 24], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [delay, delay + 24], [18, 0], { extrapolateRight: "clamp" });
  return (
    <div style={{ ...styles.metric, opacity, transform: `translateY(${y}px)` }}>
      <div style={styles.metricLabel}>{metric.label}</div>
      <div style={styles.metricValue}>{metric.value}</div>
      <div style={styles.metricSub}>{metric.sub}</div>
    </div>
  );
}

function PipelineNode({ label, sub, index, vertical }: { label: string; sub: string; index: number; vertical: boolean }) {
  const frame = useCurrentFrame();
  const delay = index * 14;
  const opacity = interpolate(frame, [delay, delay + 22], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(frame, [delay, delay + 22], [vertical ? 0 : -16, 0], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [delay, delay + 22], [vertical ? 16 : 0, 0], { extrapolateRight: "clamp" });
  return (
    <div style={{ ...styles.pipelineNode, opacity, transform: `translate(${x}px, ${y}px)` }}>
      <div style={styles.nodeIndex}>{String(index + 1).padStart(2, "0")}</div>
      <div style={styles.nodeLabel}>{label}</div>
      <div style={styles.nodeSub}>{sub}</div>
    </div>
  );
}

function ClusterRow({ name, value, color, delay }: { name: string; value: number; color: string; delay: number }) {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [delay, delay + 36], [0, value / 44], { extrapolateRight: "clamp" });
  return (
    <div style={styles.clusterRow}>
      <div style={styles.clusterMeta}>
        <span>{name}</span>
        <strong>{value}</strong>
      </div>
      <div style={styles.clusterTrack}>
        <div style={{ ...styles.clusterFill, width: `${width * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function VerdictCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={styles.verdictCard}>
      <div style={{ ...styles.verdictDot, background: color }} />
      <div style={styles.verdictValue}>{value}</div>
      <div style={styles.verdictLabel}>{label}</div>
    </div>
  );
}

function LoopStep({ label }: { label: string }) {
  return <div style={styles.loopStep}>{label}</div>;
}

function AnimatedBullet({ children, delay }: { children: ReactNode; delay: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 18], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ ...styles.bullet, opacity }}>
      <span style={styles.checkmark} />
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div style={styles.sectionHeader}>
      <Kicker>{kicker}</Kicker>
      <h2 style={styles.h2}>{title}</h2>
      <p style={styles.body}>{body}</p>
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div style={styles.kicker}>
      <span style={styles.kickerDot} />
      <span>{children}</span>
    </div>
  );
}

function FloatingBadge({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...styles.floatingBadge, ...style }}>{children}</div>;
}

function SceneShell({ children, vertical }: { children: ReactNode; vertical: boolean }) {
  return <div style={vertical ? styles.sceneVertical : styles.scene}>{children}</div>;
}

function Background() {
  return (
    <AbsoluteFill>
      <div style={styles.gridBg} />
      <div style={styles.topBand} />
      <div style={styles.bottomBand} />
    </AbsoluteFill>
  );
}

function ProgressBar({ frame, total }: { frame: number; total: number }) {
  return (
    <div style={styles.progressTrack}>
      <div style={{ ...styles.progressFill, width: `${Math.min(1, frame / total) * 100}%` }} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    background: "#f7f7f4",
    color: "#0f172a",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  gridBg: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(15,23,42,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    opacity: 0.55,
  },
  topBand: {
    position: "absolute",
    inset: "0 0 auto 0",
    height: 180,
    background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0))",
  },
  bottomBand: {
    position: "absolute",
    inset: "auto 0 0 0",
    height: 220,
    background: "linear-gradient(0deg, rgba(231,229,220,0.78), rgba(255,255,255,0))",
  },
  scene: {
    position: "absolute",
    inset: 0,
    padding: "86px 92px 76px",
  },
  sceneVertical: {
    position: "absolute",
    inset: 0,
    padding: "94px 62px 82px",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "0.86fr 1.14fr",
    gap: 54,
    alignItems: "center",
    height: "100%",
  },
  heroVertical: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 48,
    alignItems: "center",
    height: "100%",
  },
  copy: {
    maxWidth: 660,
  },
  h1: {
    margin: "22px 0 22px",
    fontSize: 82,
    lineHeight: 0.92,
    letterSpacing: "-0.055em",
    fontWeight: 820,
  },
  h1Vertical: {
    margin: "22px 0",
    fontSize: 78,
    lineHeight: 0.94,
    letterSpacing: "-0.05em",
    fontWeight: 820,
  },
  h2: {
    margin: "18px 0 16px",
    fontSize: 62,
    lineHeight: 0.96,
    letterSpacing: "-0.045em",
    fontWeight: 800,
  },
  h2Vertical: {
    margin: "18px 0 16px",
    fontSize: 64,
    lineHeight: 0.98,
    letterSpacing: "-0.045em",
    fontWeight: 800,
  },
  lede: {
    margin: 0,
    color: "#475569",
    fontSize: 26,
    lineHeight: 1.34,
    maxWidth: 690,
  },
  body: {
    margin: 0,
    color: "#475569",
    fontSize: 23,
    lineHeight: 1.38,
    maxWidth: 760,
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    color: "#4338ca",
    fontSize: 17,
    fontWeight: 780,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  kickerDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    background: "#14b8a6",
    boxShadow: "0 0 0 5px rgba(20,184,166,0.14)",
  },
  heroImage: {
    position: "relative",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 28px 80px rgba(15,23,42,0.17)",
    background: "#fff",
  },
  heroImageVertical: {
    position: "relative",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 28px 80px rgba(15,23,42,0.17)",
    background: "#fff",
    alignSelf: "stretch",
  },
  screenshot: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  floatingBadge: {
    position: "absolute",
    padding: "12px 16px",
    borderRadius: 8,
    background: "rgba(15,23,42,0.9)",
    color: "white",
    fontSize: 18,
    fontWeight: 720,
    boxShadow: "0 16px 34px rgba(15,23,42,0.24)",
  },
  sectionHeader: {
    maxWidth: 1080,
    marginBottom: 38,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 20,
  },
  metricGridVertical: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 20,
  },
  metric: {
    background: "rgba(255,255,255,0.86)",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    padding: 28,
    boxShadow: "0 18px 38px rgba(15,23,42,0.08)",
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 18,
    fontWeight: 740,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  metricValue: {
    marginTop: 20,
    fontSize: 58,
    fontWeight: 820,
    letterSpacing: "-0.045em",
  },
  metricSub: {
    marginTop: 8,
    color: "#059669",
    fontSize: 19,
    fontWeight: 620,
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 22,
    marginTop: 28,
  },
  twoColumnVertical: {
    display: "grid",
    gap: 22,
    marginTop: 28,
  },
  ruleBox: {
    marginTop: 38,
    maxWidth: 1220,
    border: "1px solid rgba(20,184,166,0.28)",
    borderLeft: "6px solid #14b8a6",
    borderRadius: 8,
    padding: "22px 26px",
    background: "rgba(240,253,250,0.86)",
    color: "#134e4a",
    fontSize: 22,
    lineHeight: 1.36,
  },
  pipeline: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 16,
    alignItems: "stretch",
  },
  pipelineVertical: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 18,
    alignItems: "stretch",
  },
  pipelineNode: {
    minHeight: 190,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    padding: 22,
    boxShadow: "0 18px 34px rgba(15,23,42,0.08)",
  },
  nodeIndex: {
    color: "#94a3b8",
    fontSize: 18,
    fontWeight: 820,
    letterSpacing: "0.06em",
  },
  nodeLabel: {
    marginTop: 34,
    fontSize: 30,
    fontWeight: 780,
    letterSpacing: "-0.02em",
  },
  nodeSub: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 18,
  },
  split: {
    height: "100%",
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 48,
    alignItems: "center",
  },
  splitVertical: {
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 36,
    alignItems: "center",
  },
  splitVisual: {
    height: "74%",
    minHeight: 540,
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    overflow: "hidden",
    background: "#fff",
    boxShadow: "0 30px 70px rgba(15,23,42,0.15)",
  },
  splitCopy: {
    maxWidth: 700,
  },
  bullets: {
    display: "grid",
    gap: 14,
    marginTop: 28,
  },
  bullet: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    color: "#334155",
    fontSize: 22,
    fontWeight: 650,
  },
  checkmark: {
    width: 16,
    height: 16,
    borderRadius: 16,
    background: "#14b8a6",
    boxShadow: "0 0 0 5px rgba(20,184,166,0.14)",
    flexShrink: 0,
  },
  identity: {
    display: "grid",
    gridTemplateColumns: "0.58fr 1fr",
    gap: 34,
    alignItems: "stretch",
  },
  identityVertical: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 28,
    alignItems: "stretch",
  },
  clusterCard: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    padding: 28,
    boxShadow: "0 18px 38px rgba(15,23,42,0.08)",
  },
  cardTitle: {
    margin: "0 0 28px",
    fontSize: 28,
    letterSpacing: "-0.02em",
  },
  clusterRow: {
    marginBottom: 23,
  },
  clusterMeta: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 20,
    color: "#334155",
  },
  clusterTrack: {
    height: 9,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  },
  clusterFill: {
    height: "100%",
    borderRadius: 999,
  },
  identityImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    boxShadow: "0 20px 48px rgba(15,23,42,0.12)",
    background: "#fff",
  },
  verification: {
    height: "100%",
    display: "grid",
    gridTemplateColumns: "1fr 0.75fr",
    gap: 56,
    alignItems: "center",
  },
  verificationVertical: {
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto auto",
    gap: 44,
    alignItems: "center",
  },
  verdictGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginTop: 34,
  },
  verdictCard: {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15,23,42,0.12)",
    borderRadius: 8,
    padding: 22,
  },
  verdictDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
  },
  verdictValue: {
    marginTop: 20,
    fontSize: 44,
    fontWeight: 830,
    letterSpacing: "-0.04em",
  },
  verdictLabel: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 16,
    fontWeight: 650,
  },
  evidenceCard: {
    background: "#0f172a",
    color: "white",
    borderRadius: 8,
    padding: 36,
    boxShadow: "0 28px 70px rgba(15,23,42,0.22)",
  },
  evidenceLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 22,
    padding: "20px 0",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    fontSize: 20,
    color: "#cbd5e1",
  },
  closing: {
    height: "100%",
    display: "grid",
    gridTemplateColumns: "1fr 0.85fr",
    gap: 70,
    alignItems: "center",
  },
  closingVertical: {
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 58,
    alignItems: "center",
  },
  finalLoop: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },
  loopStep: {
    minHeight: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(15,23,42,0.12)",
    boxShadow: "0 18px 38px rgba(15,23,42,0.08)",
    fontSize: 31,
    fontWeight: 800,
    letterSpacing: "-0.025em",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 6,
    background: "rgba(15,23,42,0.08)",
    zIndex: 20,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #4f46e5, #14b8a6, #f59e0b)",
  },
};

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={styles.metric}>
      <div style={{ ...styles.metricLabel, color: "#4338ca" }}>{title}</div>
      <p style={{ ...styles.body, marginTop: 16, fontSize: 21 }}>{body}</p>
    </div>
  );
}
