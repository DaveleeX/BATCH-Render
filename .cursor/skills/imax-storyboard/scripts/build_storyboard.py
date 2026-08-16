#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
分镜表装订器：shots.json -> 单文件 HTML（浏览器打印即 PDF）

只用标准库，无第三方依赖。

用法：
    python3 build_storyboard.py shots.json -o storyboard.html
    python3 build_storyboard.py shots.json -o storyboard.html --embed --columns 3
    python3 build_storyboard.py shots.json --paper a4

特性：
- 画格按真实电影画幅渲染（1.43 / 1.90 / 2.20 / 2.39 ...），
  生成图为 4:3 或 16:9 时由 CSS 居中裁切，不需要手工裁图
- 支持画幅保护框（protect）与运动箭头（arrows，SVG 叠加）
- 缺图渲染为占位框，可以边写边看
- 自动统计段落时长与全片时长
"""

import argparse
import base64
import html
import json
import mimetypes
import os
import sys

PAPER = {
    "a3": ("A3 landscape", 4),
    "a4": ("A4 landscape", 3),
    "letter": ("letter landscape", 3),
}

# 常见画幅的可读名称
ASPECT_LABELS = {
    "1.33": "1.33:1 Academy",
    "1.43": "1.43:1 IMAX 15/70",
    "1.85": "1.85:1 Flat",
    "1.90": "1.90:1 IMAX Digital",
    "2.20": "2.20:1 65mm 5-perf",
    "2.39": "2.39:1 Scope",
}


def parse_aspect(value, default=1.43):
    """把 '1.43' / '2.39:1' / '16:9' / 1.43 统一解析为浮点比值。"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    for sep in (":", "/", "x", "×"):
        if sep in text:
            left, right = text.split(sep, 1)
            try:
                num, den = float(left), float(right)
                if den:
                    return num / den
            except ValueError:
                return default
    try:
        return float(text)
    except ValueError:
        return default


def aspect_label(value):
    if value is None:
        return ""
    key = str(value).strip().replace(":1", "")
    return ASPECT_LABELS.get(key, str(value))


def format_duration(seconds):
    total = int(round(seconds))
    return f"{total // 60}:{total % 60:02d}"


def esc(value):
    return html.escape(str(value if value is not None else ""), quote=True)


def resolve_image(src, base_dir, out_dir, embed):
    """
    返回 (src_for_html, exists)。
    embed=True 时内联为 data URI，输出文件可以单独发给别人。
    """
    if not src:
        return None, False

    if src.startswith(("http://", "https://", "data:")):
        return src, True

    abs_path = src if os.path.isabs(src) else os.path.join(base_dir, src)
    if not os.path.isfile(abs_path):
        return None, False

    if embed:
        mime = mimetypes.guess_type(abs_path)[0] or "image/png"
        with open(abs_path, "rb") as handle:
            payload = base64.b64encode(handle.read()).decode("ascii")
        return f"data:{mime};base64,{payload}", True

    return os.path.relpath(abs_path, out_dir).replace(os.sep, "/"), True


def render_arrows(arrows, frame_aspect):
    """
    运动箭头叠加层。坐标为画面归一化的 0-1。
    viewBox 与画格比例一致，因此箭头不会被拉变形。
    """
    if not arrows:
        return ""

    view_w = 1000.0
    view_h = view_w / frame_aspect if frame_aspect else 1000.0
    parts = []

    for index, arrow in enumerate(arrows):
        try:
            x1, y1 = arrow["from"]
            x2, y2 = arrow["to"]
        except (KeyError, TypeError, ValueError):
            continue

        x1, y1 = float(x1) * view_w, float(y1) * view_h
        x2, y2 = float(x2) * view_w, float(y2) * view_h
        is_subject = str(arrow.get("type", "camera")).lower() == "subject"
        marker = f"arrow{index}"
        dash = ' stroke-dasharray="26 16"' if is_subject else ""

        parts.append(
            f'<defs><marker id="{marker}" viewBox="0 0 10 10" refX="8" refY="5" '
            f'markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
            f'<path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" stroke="#000" '
            f'stroke-width="1"/></marker></defs>'
        )
        # 先画黑色描边再画白线，保证在任何明暗底图上都可读
        parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#000" stroke-width="11" stroke-linecap="round"{dash}/>'
        )
        parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#fff" stroke-width="5" stroke-linecap="round"{dash} '
            f'marker-end="url(#{marker})"/>'
        )

        label = arrow.get("label")
        if label:
            parts.append(
                f'<text x="{(x1 + x2) / 2:.1f}" y="{(y1 + y2) / 2 - 16:.1f}" '
                f'class="arrow-label" text-anchor="middle">{esc(label)}</text>'
            )

    if not parts:
        return ""

    return (
        f'<svg class="arrows" viewBox="0 0 {view_w:.0f} {view_h:.0f}" '
        f'preserveAspectRatio="xMidYMid meet">{"".join(parts)}</svg>'
    )


def render_protect(protect, frame_aspect):
    """画幅保护框：标出需要保住构图的内嵌区域。"""
    if not protect:
        return ""

    protect_aspect = parse_aspect(protect, 0)
    if not protect_aspect or not frame_aspect:
        return ""

    if protect_aspect >= frame_aspect:
        height = frame_aspect / protect_aspect * 100.0
        style = f"width:100%;height:{height:.2f}%"
    else:
        width = protect_aspect / frame_aspect * 100.0
        style = f"width:{width:.2f}%;height:100%"

    return (
        f'<div class="protect" style="{style}">'
        f'<span class="protect-tag">{esc(protect)}</span></div>'
    )


def meta_row(label, value):
    if not value:
        return ""
    return (
        f'<div class="row"><span class="k">{esc(label)}</span>'
        f'<span class="v">{esc(value)}</span></div>'
    )


def render_shot(shot, seq, base_dir, out_dir, embed):
    aspect_value = shot.get("aspect") or seq.get("aspect") or "1.43"
    frame_aspect = parse_aspect(aspect_value)
    src, found = resolve_image(shot.get("image"), base_dir, out_dir, embed)

    if found:
        frame_inner = f'<img src="{esc(src)}" alt="{esc(shot.get("id", ""))}">'
    else:
        missing = "图片缺失" if shot.get("image") else "待绘制"
        frame_inner = f'<div class="placeholder"><span>{missing}</span></div>'

    duration = shot.get("duration")
    duration_text = f"{duration}s" if duration not in (None, "") else ""

    badges = " ".join(
        f'<span class="badge">{esc(text)}</span>'
        for text in (shot.get("size"), aspect_value, duration_text)
        if text
    )

    dialogue = shot.get("dialogue")
    dialogue_block = (
        f'<div class="dialogue">{esc(dialogue)}</div>' if dialogue else ""
    )

    rows = "".join(
        [
            meta_row("镜头", shot.get("lens")),
            meta_row("运动", shot.get("movement")),
            meta_row("光", shot.get("light")),
            meta_row("声音", shot.get("sound")),
            meta_row("实拍", shot.get("practical")),
            meta_row("备注", shot.get("notes")),
        ]
    )

    transition = shot.get("transition")
    transition_block = (
        f'<div class="transition">{esc(transition)}</div>' if transition else ""
    )

    return f"""
      <figure class="panel">
        <div class="panel-head">
          <span class="shot-id">{esc(shot.get("id", "—"))}</span>
          <span class="slug">{esc(shot.get("slug", seq.get("title", "")))}</span>
          <span class="badges">{badges}</span>
        </div>
        <div class="frame" style="aspect-ratio:{frame_aspect:.4f}">
          {frame_inner}
          {render_protect(shot.get("protect"), frame_aspect)}
          {render_arrows(shot.get("arrows"), frame_aspect)}
        </div>
        <figcaption>
          <div class="action">{esc(shot.get("action", ""))}</div>
          {dialogue_block}
          {rows}
        </figcaption>
        {transition_block}
      </figure>"""


def sequence_runtime(seq):
    total = 0.0
    for shot in seq.get("shots", []):
        try:
            total += float(shot.get("duration") or 0)
        except (TypeError, ValueError):
            continue
    return total


def render_cover(project, sequences):
    shot_count = sum(len(seq.get("shots", [])) for seq in sequences)
    runtime = sum(sequence_runtime(seq) for seq in sequences)

    policy_rows = ""
    for entry in project.get("format_policy", []) or []:
        if isinstance(entry, dict):
            policy_rows += (
                f"<tr><td>{esc(aspect_label(entry.get('aspect')))}</td>"
                f"<td>{esc(entry.get('format', ''))}</td>"
                f"<td>{esc(entry.get('usage', ''))}</td></tr>"
            )

    policy_table = ""
    if policy_rows:
        policy_table = f"""
        <h2>格式策略</h2>
        <table class="policy">
          <thead><tr><th>画幅</th><th>格式</th><th>用途</th></tr></thead>
          <tbody>{policy_rows}</tbody>
        </table>"""

    facts = "".join(
        meta_row(label, value)
        for label, value in [
            ("导演", project.get("director")),
            ("摄影", project.get("dp")),
            ("版本", project.get("version")),
            ("日期", project.get("date")),
            ("色彩", project.get("palette")),
            ("胶片", project.get("stock")),
            ("备注", project.get("notes")),
        ]
    )

    logline = project.get("logline")
    logline_block = f'<p class="logline">{esc(logline)}</p>' if logline else ""

    return f"""
    <section class="page cover">
      <div class="cover-title">
        <h1>{esc(project.get("title", "未命名"))}</h1>
        <p class="subtitle">{esc(project.get("subtitle", "分镜表 / STORYBOARD"))}</p>
      </div>
      {logline_block}
      <div class="stats">
        <div><b>{len(sequences)}</b><span>段落</span></div>
        <div><b>{shot_count}</b><span>镜头</span></div>
        <div><b>{format_duration(runtime)}</b><span>预估时长</span></div>
      </div>
      <div class="cover-meta">{facts}</div>
      {policy_table}
    </section>"""


def render_shot_list(sequences):
    rows = ""
    for seq in sequences:
        rows += (
            f'<tr class="seq-row"><td colspan="8">'
            f'{esc(seq.get("id", ""))} · {esc(seq.get("title", ""))}'
            f"</td></tr>"
        )
        for shot in seq.get("shots", []):
            duration = shot.get("duration")
            rows += (
                "<tr>"
                f'<td class="mono">{esc(shot.get("id", ""))}</td>'
                f'<td>{esc(shot.get("slug", ""))}</td>'
                f'<td class="mono">{esc(shot.get("aspect") or seq.get("aspect", ""))}</td>'
                f'<td class="mono">{esc(shot.get("size", ""))}</td>'
                f'<td>{esc(shot.get("lens", ""))}</td>'
                f'<td>{esc(shot.get("movement", ""))}</td>'
                f'<td class="mono">{esc(f"{duration}s" if duration else "")}</td>'
                f'<td>{esc(shot.get("transition", ""))}</td>'
                "</tr>"
            )

    return f"""
    <section class="page">
      <h2 class="page-title">SHOT LIST</h2>
      <table class="shotlist">
        <thead><tr>
          <th>镜号</th><th>场景</th><th>画幅</th><th>景别</th>
          <th>镜头</th><th>运动</th><th>时长</th><th>转场</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </section>"""


CSS = """
:root {
  --ink: #14161a;
  --muted: #6b7280;
  --line: #d7dae0;
  --paper: #f4f4f2;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #8b8d92;
  color: var(--ink);
  font-family: "Helvetica Neue", Helvetica, "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
  font-size: 11px;
  line-height: 1.5;
}
.page {
  background: var(--paper);
  width: __PAGE_W__;
  min-height: __PAGE_H__;
  margin: 18px auto;
  padding: 16mm 14mm;
  box-shadow: 0 3px 18px rgba(0,0,0,.35);
}
.page-title {
  font-size: 15px; letter-spacing: .22em; text-transform: uppercase;
  border-bottom: 2px solid var(--ink); padding-bottom: 6px; margin: 0 0 12px;
}

/* 封面 */
.cover-title h1 { font-size: 40px; margin: 0; letter-spacing: -.01em; }
.cover .subtitle { letter-spacing: .3em; color: var(--muted); margin: 6px 0 0;
  text-transform: uppercase; }
.logline { max-width: 62ch; font-size: 13px; margin: 22px 0; }
.stats { display: flex; gap: 34px; margin: 26px 0; border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line); padding: 14px 0; }
.stats b { display: block; font-size: 26px; font-weight: 600; }
.stats span { color: var(--muted); letter-spacing: .14em; text-transform: uppercase;
  font-size: 9px; }
.cover-meta { max-width: 60ch; }
table.policy, table.shotlist { width: 100%; border-collapse: collapse; margin-top: 8px; }
table.policy th, table.policy td, table.shotlist th, table.shotlist td {
  border-bottom: 1px solid var(--line); padding: 5px 7px; text-align: left;
  vertical-align: top;
}
table.shotlist th, table.policy th {
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
}
.seq-row td { background: #e6e7e4; font-weight: 600; letter-spacing: .08em; }
.mono { font-family: "SF Mono", Menlo, Consolas, monospace; }

/* 段落头 */
.seq-head { border-bottom: 2px solid var(--ink); margin-bottom: 12px; padding-bottom: 7px; }
.seq-head h2 { margin: 0; font-size: 16px; letter-spacing: .04em; }
.seq-head .seq-meta { color: var(--muted); margin-top: 4px; }
.seq-head .seq-meta span { margin-right: 16px; }
.seq-synopsis { margin: 8px 0 0; max-width: 80ch; }

/* 分镜格 */
.grid { display: grid; grid-template-columns: repeat(__COLS__, 1fr); gap: 11px; }
.panel {
  margin: 0; border: 1px solid var(--line); background: #fff;
  display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid;
}
.panel-head {
  display: flex; align-items: baseline; gap: 7px;
  padding: 5px 7px; background: var(--ink); color: #fff;
}
.shot-id { font-weight: 700; font-family: "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: .05em; }
.slug { flex: 1; font-size: 9.5px; opacity: .82; text-transform: uppercase;
  letter-spacing: .05em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  border: 1px solid rgba(255,255,255,.45); border-radius: 2px;
  padding: 0 4px; font-size: 8.5px; margin-left: 3px; white-space: nowrap;
}
.frame { position: relative; width: 100%; background: #101215; overflow: hidden; }
.frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #6a6f78; letter-spacing: .2em; font-size: 10px;
  background:
    repeating-linear-gradient(45deg, #16191d 0 9px, #101215 9px 18px);
}
.protect {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  border: 1px dashed rgba(255,255,255,.55); pointer-events: none;
}
.protect-tag {
  position: absolute; top: 2px; left: 3px; font-size: 7.5px;
  color: rgba(255,255,255,.75); letter-spacing: .1em;
}
.arrows { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.arrow-label {
  font-size: 26px; fill: #fff; stroke: #000; stroke-width: 4px;
  paint-order: stroke fill; font-family: Helvetica, Arial, sans-serif; font-weight: 700;
}
figcaption { padding: 6px 7px; flex: 1; }
.action { margin-bottom: 5px; }
.dialogue {
  border-left: 2px solid var(--ink); padding: 2px 0 2px 6px; margin: 0 0 6px;
  font-style: italic;
}
.row { display: flex; gap: 6px; border-top: 1px dotted var(--line); padding: 2px 0; }
.row .k {
  flex: 0 0 34px; color: var(--muted); font-size: 9px; letter-spacing: .08em;
  text-transform: uppercase; padding-top: 1px;
}
.row .v { flex: 1; }
.transition {
  text-align: right; padding: 3px 7px; border-top: 1px solid var(--line);
  font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9px;
  letter-spacing: .14em; color: var(--muted);
}

@media print {
  body { background: #fff; }
  .page { box-shadow: none; margin: 0; width: auto; min-height: 0; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  @page { size: __PAPER__; margin: 10mm; }
}
"""


def build(data, base_dir, out_dir, columns, paper, embed, title_override):
    project = dict(data.get("project", {}))
    if title_override:
        project["title"] = title_override
    sequences = data.get("sequences", [])

    pages = [render_cover(project, sequences)]

    for seq in sequences:
        panels = "".join(
            render_shot(shot, seq, base_dir, out_dir, embed)
            for shot in seq.get("shots", [])
        )
        meta_bits = [
            ("时间线", seq.get("timeline")),
            ("地点", seq.get("location")),
            ("画幅", aspect_label(seq.get("aspect"))),
            ("镜头数", len(seq.get("shots", []))),
            ("时长", format_duration(sequence_runtime(seq))),
        ]
        meta = "".join(
            f"<span><b>{esc(label)}</b> {esc(value)}</span>"
            for label, value in meta_bits
            if value
        )
        synopsis = seq.get("synopsis")
        synopsis_block = (
            f'<p class="seq-synopsis">{esc(synopsis)}</p>' if synopsis else ""
        )

        pages.append(
            f"""
    <section class="page">
      <header class="seq-head">
        <h2>{esc(seq.get("id", ""))} · {esc(seq.get("title", ""))}</h2>
        <div class="seq-meta">{meta}</div>
        {synopsis_block}
      </header>
      <div class="grid">{panels}</div>
    </section>"""
        )

    pages.append(render_shot_list(sequences))

    page_size, _ = PAPER[paper]
    page_w, page_h = ("420mm", "297mm") if paper == "a3" else ("297mm", "210mm")
    css = (
        CSS.replace("__COLS__", str(columns))
        .replace("__PAPER__", page_size)
        .replace("__PAGE_W__", page_w)
        .replace("__PAGE_H__", page_h)
    )

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(project.get("title", "分镜表"))} — 分镜表</title>
<style>{css}</style>
</head>
<body>
{"".join(pages)}
</body>
</html>
"""


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="把 shots.json 装订成可打印的分镜表 HTML"
    )
    parser.add_argument("shots", help="shots.json 路径")
    parser.add_argument("-o", "--output", help="输出 HTML（默认与输入同名）")
    parser.add_argument(
        "-c", "--columns", type=int, help="每行画格数（默认按纸张：A3=4，A4=3）"
    )
    parser.add_argument(
        "-p", "--paper", choices=sorted(PAPER), default="a3", help="打印纸张（默认 a3）"
    )
    parser.add_argument(
        "--embed", action="store_true", help="把图片内联为 data URI，产出单一可分发文件"
    )
    parser.add_argument("--title", help="覆盖封面标题")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.shots):
        parser.error(f"找不到 {args.shots}")

    with open(args.shots, encoding="utf-8") as handle:
        try:
            data = json.load(handle)
        except json.JSONDecodeError as error:
            parser.error(f"{args.shots} 不是合法 JSON：{error}")

    if not data.get("sequences"):
        parser.error("shots.json 缺少 sequences，至少要有一个段落")

    base_dir = os.path.dirname(os.path.abspath(args.shots))
    output = args.output or os.path.splitext(os.path.abspath(args.shots))[0] + ".html"
    out_dir = os.path.dirname(os.path.abspath(output)) or "."
    os.makedirs(out_dir, exist_ok=True)

    columns = args.columns or PAPER[args.paper][1]
    markup = build(
        data, base_dir, out_dir, columns, args.paper, args.embed, args.title
    )

    with open(output, "w", encoding="utf-8") as handle:
        handle.write(markup)

    sequences = data["sequences"]
    shot_count = sum(len(seq.get("shots", [])) for seq in sequences)
    runtime = sum(sequence_runtime(seq) for seq in sequences)
    missing = sum(
        1
        for seq in sequences
        for shot in seq.get("shots", [])
        if not resolve_image(shot.get("image"), base_dir, out_dir, False)[1]
    )

    print(f"[OK] {output}")
    print(
        f"     {len(sequences)} 段落 / {shot_count} 镜头 / "
        f"预估 {format_duration(runtime)}"
    )
    if missing:
        print(f"[提示] {missing} 格尚无画面，已渲染为占位框")
    return 0


if __name__ == "__main__":
    sys.exit(main())
