from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "demo" / "gmail-workspace-public-demo.gif"
POSTER = ROOT / "public" / "demo" / "gmail-workspace-public-demo-poster.png"
WIDTH, HEIGHT = 960, 540
FPS = 10
FRAMES_PER_SCENE = 14


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
    "xs": font(10),
    "sm": font(13),
    "body": font(16),
    "body_b": font(16, True),
    "h2": font(24, True),
    "h1": font(33, True),
    "metric": font(34, True),
}


def rect(draw, box, fill, outline="#d8dee8", radius=14, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, fill="#111827", f="body", anchor=None):
    draw.text(xy, value, fill=fill, font=F[f], anchor=anchor)


def progress(draw, frame, total):
    pct = min(1, frame / max(1, total - 1))
    draw.rectangle((0, 0, WIDTH, 5), fill="#e5e7eb")
    draw.rectangle((0, 0, int(WIDTH * pct), 5), fill="#4f46e5")


def shell(draw):
    for x in range(0, WIDTH, 32):
        draw.line((x, 0, x, HEIGHT), fill="#eef2f7")
    for y in range(0, HEIGHT, 32):
        draw.line((0, y, WIDTH, y), fill="#eef2f7")
    rect(draw, (38, 44, 190, 500), "#ffffff", radius=18)
    text(draw, (58, 76), "gmail/workspace", f="body_b")
    text(draw, (58, 102), "public-safe demo", fill="#64748b", f="xs")
    nav = ["Today", "Inbox", "Calendar", "Goals", "Settings"]
    for i, label in enumerate(nav):
        y = 154 + i * 44
        if i == 0:
            rect(draw, (54, y - 12, 174, y + 20), "#eef2ff", outline="#eef2ff", radius=9)
            text(draw, (74, y + 8), label, fill="#4f46e5", f="sm")
        else:
            text(draw, (74, y + 8), label, fill="#334155", f="sm")


def job_cards(draw, phase):
    rect(draw, (220, 66, 900, 462), "#ffffff", radius=18)
    text(draw, (250, 110), "Today: top job emails", f="h2")
    text(draw, (552, 116), "ranked by pinned context", fill="#64748b", f="sm")
    metrics = [("Top fit", "92%"), ("Needs reply", "7"), ("NodeBench checks", "14")]
    for i, (label, value) in enumerate(metrics):
        x = 250 + i * 210
        rect(draw, (x, 150, x + 178, 236), "#f8fafc", radius=13)
        text(draw, (x + 18, 178), label.upper(), fill="#64748b", f="xs")
        text(draw, (x + 18, 198), value, f="metric")
    rows = [
        ("Forward Deployed Engineer - AI Platform", "High confidence", "#059669"),
        ("Agentic workflow role - remote", "Needs reply", "#d97706"),
        ("Company context pack ready", "Sourced", "#4f46e5"),
    ]
    for i, (title, label, color) in enumerate(rows):
        y = 264 + i * 70
        outline = "#c7d2fe" if i == phase % 3 else "#d8dee8"
        rect(draw, (250, y, 850, y + 54), "#ffffff", outline=outline, radius=13, width=2 if i == phase % 3 else 1)
        text(draw, (272, y + 22), title, f="body_b")
        text(draw, (652, y + 22), label, fill=color, f="body_b")


def pipeline(draw, phase):
    rect(draw, (220, 66, 900, 462), "#ffffff", radius=18)
    text(draw, (250, 108), "Private memory pipeline", f="h2")
    text(draw, (250, 138), "raw inbox stays local, agents get evidence", fill="#64748b", f="sm")
    nodes = [
        ("Gmail", "threads"),
        ("Local DB", "private bodies"),
        ("Shards", "bounded context"),
        ("Judge", "claim support"),
        ("Agent", "daily decisions"),
    ]
    for i, (label, sub) in enumerate(nodes):
        x = 252 + i * 124
        y = 238
        fill = "#eef2ff" if i <= phase % 5 else "#ffffff"
        rect(draw, (x, y, x + 96, y + 82), fill, outline="#c7d2fe", radius=14)
        text(draw, (x + 14, y + 34), label, f="body_b", fill="#312e81")
        text(draw, (x + 14, y + 58), sub, f="xs", fill="#64748b")
        if i < len(nodes) - 1:
            draw.line((x + 102, y + 41, x + 118, y + 41), fill="#94a3b8", width=3)
            draw.polygon([(x + 118, y + 41), (x + 108, y + 35), (x + 108, y + 47)], fill="#94a3b8")
    text(draw, (250, 382), "Model sees aggregate summaries, not raw email bodies.", fill="#0f172a", f="body_b")
    text(draw, (250, 412), "Evidence IDs and hashes keep the memory auditable.", fill="#64748b", f="sm")


def boundary(draw, phase):
    rect(draw, (220, 66, 900, 462), "#ffffff", radius=18)
    text(draw, (250, 108), "Public research boundary", f="h2")
    text(draw, (250, 138), "Gmail scores privately. NodeBench stores public facts.", fill="#64748b", f="sm")
    left = (250, 208, 512, 368)
    right = (596, 208, 858, 368)
    rect(draw, left, "#f8fafc", outline="#d8dee8", radius=16)
    rect(draw, right, "#eef2ff" if phase % 2 == 0 else "#f8fafc", outline="#c7d2fe", radius=16)
    text(draw, (276, 248), "Local Gmail workspace", f="body_b")
    text(draw, (276, 282), "SQLite, pinned files, fit scores", fill="#64748b", f="sm")
    text(draw, (276, 314), "raw bodies stay private", fill="#059669", f="body_b")
    text(draw, (624, 248), "NodeBench public layer", f="body_b")
    text(draw, (624, 282), "Render MCP + Convex ledger", fill="#64748b", f="sm")
    text(draw, (624, 314), "sourced dossiers only", fill="#4f46e5", f="body_b")
    draw.line((526, 288, 582, 288), fill="#94a3b8", width=4)
    draw.polygon([(582, 288), (568, 280), (568, 296)], fill="#94a3b8")
    text(draw, (508, 408), "company + role + domain", fill="#64748b", f="sm", anchor="mm")


def ascii_summary(draw, phase):
    rect(draw, (220, 66, 900, 462), "#ffffff", radius=18)
    text(draw, (250, 106), "Runtime at a glance", f="h2")
    code = [
        "+---- USER / BROWSER ----+",
        "| Next.js workspace UI   |",
        "+-----------+------------+",
        "            | fetch / REST",
        "+-----------v------------+",
        "| Next API runtime       |",
        "+-----+-------------+----+",
        "      | sqlite      | MCP",
        "+-----v-----+  +----v----+",
        "| Local DB  |  | NodeBench|",
        "| private   |  | public   |",
        "+-----+-----+  +----+-----+",
        "      | claims     | packs",
        "+-----v-----------v------+",
        "| Agent / model layer    |",
        "+------------------------+",
    ]
    y = 148
    for i, line in enumerate(code):
        fill = "#4f46e5" if i == (phase % len(code)) else "#0f172a"
        text(draw, (278, y + i * 17), line, fill=fill, f="sm")
    text(draw, (590, 262), "Vercel: web/API", fill="#0f172a", f="body_b")
    text(draw, (590, 296), "Render: NodeBench MCP", fill="#0f172a", f="body_b")
    text(draw, (590, 330), "Convex: public ledger", fill="#0f172a", f="body_b")
    text(draw, (590, 364), "SQLite: private memory", fill="#0f172a", f="body_b")


SCENES = [job_cards, pipeline, boundary, ascii_summary]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    total = len(SCENES) * FRAMES_PER_SCENE
    for frame in range(total):
        scene_index = frame // FRAMES_PER_SCENE
        phase = frame % FRAMES_PER_SCENE
        img = Image.new("RGB", (WIDTH, HEIGHT), "#f8fafc")
        draw = ImageDraw.Draw(img)
        shell(draw)
        SCENES[scene_index](draw, phase)
        progress(draw, frame, total)
        text(draw, (238, 494), "public-safe GIF: synthetic data only", fill="#64748b", f="sm")
        frames.append(img)
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / FPS),
        loop=0,
        optimize=True,
    )
    frames[0].save(POSTER)
    print(f"wrote {OUT}")
    print(f"wrote {POSTER}")


if __name__ == "__main__":
    main()
