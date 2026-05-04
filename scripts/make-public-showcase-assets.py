from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "demo"
WIDTH, HEIGHT = 960, 540
FPS = 10


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


F = {
    "xs": font(11),
    "sm": font(14),
    "body": font(17),
    "body_b": font(17, True),
    "h3": font(21, True),
    "h2": font(28, True),
    "h1": font(38, True),
    "metric": font(32, True),
}


def rect(draw, box, fill, outline="#d9e2ef", radius=14, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, fill="#111827", f="body", anchor=None):
    draw.text(xy, value, fill=fill, font=F[f], anchor=anchor)


def line(draw, points, fill="#94a3b8", width=3):
    draw.line(points, fill=fill, width=width)


def base(title, subtitle):
    img = Image.new("RGB", (WIDTH, HEIGHT), "#f8fafc")
    draw = ImageDraw.Draw(img)
    for x in range(0, WIDTH, 32):
        draw.line((x, 0, x, HEIGHT), fill="#eef2f7")
    for y in range(0, HEIGHT, 32):
        draw.line((0, y, WIDTH, y), fill="#eef2f7")
    text(draw, (42, 38), title, f="h2")
    text(draw, (42, 76), subtitle, fill="#64748b", f="sm")
    return img, draw


def badge(draw, xy, value, fill="#eef2ff", color="#4f46e5"):
    x, y = xy
    w = max(86, int(len(value) * 8.2) + 24)
    rect(draw, (x, y, x + w, y + 30), fill, outline=fill, radius=9)
    text(draw, (x + 12, y + 8), value, fill=color, f="xs")


def save_gif(path, frames):
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
    )
    frames[0].save(path.with_suffix(".poster.png"))
    print(f"wrote {path}")
    print(f"wrote {path.with_suffix('.poster.png')}")


def magic_resend_frame(step):
    img, draw = base("Gmail Magic Resend", "Draft, QA, and resend-like follow-up flow without sending externally.")
    rect(draw, (42, 112, 366, 470), "#ffffff", radius=18)
    text(draw, (68, 142), "Original job thread", f="h3")
    rows = [
        ("Recruiter", "Can you share a quick fit summary?"),
        ("You", "Pinned resume and story bank are available."),
        ("Agent", "Suggested follow-up is ready for review."),
    ]
    for i, (speaker, body) in enumerate(rows):
        y = 188 + i * 78
        fill = "#eef2ff" if i == min(step, 2) else "#f8fafc"
        rect(draw, (68, y, 340, y + 54), fill, outline="#dbe4f0", radius=12)
        text(draw, (86, y + 11), speaker, fill="#4f46e5" if i == 2 else "#0f172a", f="body_b")
        text(draw, (86, y + 32), body, fill="#475569", f="xs")

    rect(draw, (396, 112, 918, 470), "#ffffff", radius=18)
    text(draw, (424, 142), "QA dogfood checklist", f="h3")
    checks = [
        ("1. Private context pinned", "resume + target role"),
        ("2. NodeBench public check", "company + role dossier"),
        ("3. Draft produced", "short, specific, no hallucinated facts"),
        ("4. Send gate", "user approval required"),
    ]
    for i, (name, sub) in enumerate(checks):
        y = 188 + i * 54
        active = i <= step % 4
        color = "#10b981" if active else "#cbd5e1"
        draw.ellipse((424, y, 446, y + 22), fill=color)
        if active:
            text(draw, (430, y + 3), "✓", fill="#ffffff", f="xs")
        text(draw, (462, y - 1), name, f="body_b")
        text(draw, (462, y + 23), sub, fill="#64748b", f="sm")
    rect(draw, (424, 414, 894, 456), "#111827" if step >= 3 else "#eef2ff", outline="#111827" if step >= 3 else "#c7d2fe", radius=12)
    text(draw, (448, 427), "Ready for human approval" if step >= 3 else "Generating review-safe draft...", fill="#ffffff" if step >= 3 else "#4338ca", f="body_b")
    return img


def workflow_lanes_frame(step):
    img, draw = base("One Workspace, Clear Lanes", "Every view maps to a job-to-be-done, not another pile of blocks.")
    lanes = [
        ("Today", "Top jobs", "#4f46e5"),
        ("Inbox", "Read + reply", "#0891b2"),
        ("Calendar", "Time blocks", "#059669"),
        ("Goals", "Week / month", "#d97706"),
    ]
    for i, (lane, job, color) in enumerate(lanes):
        x = 46 + i * 226
        rect(draw, (x, 124, x + 196, 392), "#ffffff", outline="#cbd5e1", radius=18)
        draw.ellipse((x + 22, 148, x + 38, 164), fill=color)
        text(draw, (x + 48, 143), lane, f="h3")
        text(draw, (x + 22, 184), job, fill="#475569", f="body")
        for j in range(3):
            y = 232 + j * 44
            active = (step + i + j) % 4 == 0
            rect(draw, (x + 20, y, x + 176, y + 30), "#eef2ff" if active else "#f8fafc", outline="#dbe4f0", radius=9)
            label = ["Rank", "Open", "Schedule", "Track"][(i + j) % 4]
            text(draw, (x + 34, y + 8), label, fill=color if active else "#475569", f="xs")
    line(draw, (152, 420, 806, 420), fill="#94a3b8", width=4)
    for x in [152, 378, 604, 806]:
        draw.ellipse((x - 8, 412, x + 8, 428), fill="#4f46e5")
    text(draw, (480, 452), "A single command center: decide -> read -> schedule -> track.", fill="#0f172a", f="body_b", anchor="mm")
    return img


def qa_snapshot():
    img, draw = base("QA Dogfood: Snapshot Corrections", "Every visible change gets a before, finding, and after artifact.")
    columns = [
        ("Before", "Route sprawl", "empty space + repeated blocks", "#ef4444"),
        ("Dogfood Finding", "Action unclear", "no proof the feature works", "#d97706"),
        ("After", "Top jobs + modal", "visible context + proof", "#10b981"),
    ]
    for i, (title, body, subline, color) in enumerate(columns):
        x = 42 + i * 306
        rect(draw, (x, 122, x + 276, 410), "#ffffff", outline="#cbd5e1", radius=18)
        badge(draw, (x + 22, 146), title, fill="#fee2e2" if i == 0 else "#fef3c7" if i == 1 else "#dcfce7", color=color)
        text(draw, (x + 22, 198), body, fill="#0f172a", f="body_b")
        text(draw, (x + 22, 224), subline, fill="#64748b", f="sm")
        for j in range(4):
            y = 256 + j * 34
            width = [200, 140, 228, 166][(i + j) % 4]
            rect(draw, (x + 22, y, x + 22 + width, y + 18), "#eef2ff" if i == 2 else "#f1f5f9", outline="#e2e8f0", radius=6)
        if i == 1:
            text(draw, (x + 22, 356), "Rule: prove visually.", fill=color, f="body_b")
        else:
            text(draw, (x + 22, 356), "Stored as public-safe artifact.", fill="#64748b", f="sm")
    return img


def person_state_matrix():
    img, draw = base("User States x Person States", "The same workspace should support different people without changing the core lanes.")
    users = ["Job seeker", "Recruiter", "Student", "Operator"]
    states = ["Need reply", "Need context", "Need schedule", "Need proof"]
    x0, y0 = 210, 138
    for i, state in enumerate(states):
        text(draw, (x0 + i * 170, 112), state, fill="#475569", f="sm", anchor="mm")
    for r, user in enumerate(users):
        y = y0 + r * 78
        text(draw, (56, y + 22), user, f="body_b")
        for c, state in enumerate(states):
            x = x0 + c * 170 - 70
            color = ["#4f46e5", "#0891b2", "#059669", "#d97706"][(r + c) % 4]
            rect(draw, (x, y, x + 140, y + 46), "#ffffff", outline="#dbe4f0", radius=12)
            text(draw, (x + 16, y + 14), ["Reply", "Research", "Block", "Verify"][(r + c) % 4], fill=color, f="body_b")
    rect(draw, (42, 476, 918, 512), "#111827", outline="#111827", radius=12)
    text(draw, (66, 486), "Design rule: lanes stay stable; copy, defaults, and artifacts adapt to the person state.", fill="#ffffff", f="body_b")
    return img


def remotion_storyboard():
    img, draw = base("Remotion End-to-End Storyboard", "A public video is generated from sanitized SVGs and scene contracts.")
    scenes = [
        ("1", "Scale", "90k emails cannot be one prompt"),
        ("2", "Memory", "local ingest -> shards -> judge"),
        ("3", "Today", "top jobs from pinned context"),
        ("4", "NodeBench", "public research only"),
        ("5", "Identity", "domain clusters + trend"),
        ("6", "Proof", "QA snapshots + evidence"),
    ]
    for i, (num, title, sub) in enumerate(scenes):
        x = 58 + (i % 3) * 292
        y = 128 + (i // 3) * 142
        rect(draw, (x, y, x + 250, y + 102), "#ffffff", outline="#dbe4f0", radius=16)
        draw.ellipse((x + 18, y + 18, x + 48, y + 48), fill="#4f46e5")
        text(draw, (x + 28, y + 24), num, fill="#ffffff", f="body_b")
        text(draw, (x + 66, y + 20), title, f="h3")
        text(draw, (x + 20, y + 66), sub, fill="#64748b", f="sm")
    rect(draw, (58, 446, 902, 494), "#eef2ff", outline="#c7d2fe", radius=14)
    text(draw, (84, 462), "Commands: npm run demo:video  |  npm run demo:video:vertical", fill="#4338ca", f="body_b")
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    save_gif(OUT / "gmail-magic-resend.gif", [magic_resend_frame(i // 5) for i in range(40)])
    save_gif(OUT / "workflow-lanes-demo.gif", [workflow_lanes_frame(i // 5) for i in range(40)])
    qa_snapshot().save(OUT / "qa-dogfood-snapshots.png")
    person_state_matrix().save(OUT / "person-state-matrix.png")
    remotion_storyboard().save(OUT / "remotion-workflow-storyboard.png")
    print(f"wrote {OUT / 'qa-dogfood-snapshots.png'}")
    print(f"wrote {OUT / 'person-state-matrix.png'}")
    print(f"wrote {OUT / 'remotion-workflow-storyboard.png'}")


if __name__ == "__main__":
    main()
