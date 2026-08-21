# -*- coding: utf-8 -*-
"""
Jaguar Type T Concept —— 车拍短片合成
---------------------------------------------------------
把 frames/ 里的静帧按 storyboard.json 的分镜表做成一条成片：
展厅陈列 -> 驶出大门 -> 北欧小镇石板街巡游。

流程：
1) 逐镜头渲染：裁成 2.35:1 宽银幕，用 zoompan 做推、拉、横移的运镜
2) 章节字幕：在对应镜头上叠中英文小标题（淡入淡出）
3) 片头片尾卡：纯合成的标题卡，风格对齐概念车海报
4) 剪辑：xfade 溶接串起所有片段，加颗粒、暗角、首尾黑场
5) 配乐：ambient_score 现场合成一段 pad，长度与成片对齐
6) 输出：1920x1080 宽银幕横版 + 1080x1920 竖版社交剪辑

目录约定：
- carfilm/
  - frames/            <-- 分镜静帧
  - storyboard.json    <-- 分镜表
  - work/              <-- 中间片段（可删）
  - out/               <-- 成片

用法：
    python3 carfilm/build_car_film.py
    python3 carfilm/build_car_film.py --preview        # 半分辨率快速预览
    python3 carfilm/build_car_film.py --no-audio       # 不合成配乐
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

FONT_EN = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
FONT_EN_BOLD = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
FONT_ZH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"

GOLD = "0xC8B489"
WARM_WHITE = "0xF2EFE8"
MUTED = "0x9AA0A0"

# 第一幕收在这里，之后用黑场溶接把观众带出展厅；其余镜头之间用普通叠化
FADE_TO_BLACK_AFTER = {"shot04"}


def log(message):
    print(f"[Info] {message}", flush=True)


def fail(message):
    print(f"[Error Log] {message}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def run_ffmpeg(args, description):
    """执行 ffmpeg，失败时把 stderr 尾部打出来方便定位。"""
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + args
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        tail = "\n".join(result.stderr.strip().splitlines()[-25:])
        fail(f"{description} 失败：\n{tail}")
    return result


def check_fonts():
    for path in (FONT_EN, FONT_EN_BOLD, FONT_ZH):
        if not os.path.isfile(path):
            fail(f"缺少字体文件：{path}")


def write_text(work_dir, name, text):
    """drawtext 用 textfile 读取，省去一堆转义麻烦。"""
    path = os.path.join(work_dir, f"text_{name}.txt")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return path


def escape_path(path):
    """filtergraph 里的路径需要转义冒号。"""
    return path.replace("\\", "\\\\").replace(":", "\\:")


def kenburns_filter(shot, out_w, out_h, fps, super_scale=2):
    """
    单张静帧的运镜：先裁成宽银幕，再放大到超采样尺寸喂给 zoompan。
    放大是为了让 zoompan 的整数取整误差不至于在慢速运动里抖动。
    """
    frames = max(2, int(round(shot["duration"] * fps)))
    z0, z1 = shot["zoom"]
    (px0, py0), (px1, py1) = shot["pan"]
    bias = shot.get("crop_bias", 0.5)

    progress = f"(on/{frames - 1})"
    z_expr = f"{z0:.5f}+({z1 - z0:.5f})*{progress}"
    x_expr = f"(iw-iw/zoom)*({px0:.4f}+({px1 - px0:.4f})*{progress})"
    y_expr = f"(ih-ih/zoom)*({py0:.4f}+({py1 - py0:.4f})*{progress})"

    sup_w = out_w * super_scale
    sup_h = out_h * super_scale

    return frames, (
        # 先按目标宽银幕比例裁切，crop_bias 控制保留画面的上下位置
        f"crop=w=in_w:h=floor(in_w*{out_h}/{out_w}/2)*2:x=0:y=(in_h-out_h)*{bias},"
        f"scale={sup_w}:{sup_h}:flags=lanczos,setsar=1,"
        f"zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}'"
        f":d={frames}:s={out_w}x{out_h}:fps={fps},"
        # 统一的胶片化调色：轻微提对比、压一点伽马、四角压暗
        f"eq=contrast=1.06:saturation=1.04:gamma=0.98,"
        f"vignette=angle=PI/5.2,"
        f"format=yuv420p"
    )


def chapter_filter(shot, work_dir, out_w, out_h, scale):
    """章节小标题：左下角一行英文一行中文，淡入淡出。"""
    chapter = shot.get("chapter")
    if not chapter:
        return ""

    appear, hold, fade = 0.6, 2.6, 0.7
    alpha = (
        f"if(lt(t,{appear}),0,"
        f"if(lt(t,{appear + fade}),(t-{appear})/{fade},"
        f"if(lt(t,{appear + fade + hold}),1,"
        f"if(lt(t,{appear + fade + hold + fade}),"
        f"({appear + fade + hold + fade}-t)/{fade},0))))"
    )

    en_file = escape_path(write_text(work_dir, f"{shot['id']}_en", chapter["en"]))
    zh_file = escape_path(write_text(work_dir, f"{shot['id']}_zh", chapter["zh"]))

    margin = int(96 * scale)
    en_size = max(10, int(23 * scale))
    zh_size = max(12, int(31 * scale))
    en_y = out_h - int(172 * scale)
    zh_y = out_h - int(132 * scale)

    return (
        f",drawtext=fontfile={escape_path(FONT_EN)}:textfile={en_file}"
        f":fontcolor={GOLD}:fontsize={en_size}:x={margin}:y={en_y}"
        f":alpha='{alpha}':shadowcolor=black@0.6:shadowx=0:shadowy=2"
        f",drawtext=fontfile={escape_path(FONT_ZH)}:textfile={zh_file}"
        f":fontcolor={WARM_WHITE}:fontsize={zh_size}:x={margin}:y={zh_y}"
        f":alpha='{alpha}':shadowcolor=black@0.6:shadowx=0:shadowy=2"
    )


def render_shot(shot, frames_dir, work_dir, out_w, out_h, fps, scale):
    """渲染单个镜头片段。"""
    source = os.path.join(frames_dir, shot["file"])
    if not os.path.isfile(source):
        fail(f"找不到分镜静帧：{source}")

    frames, motion = kenburns_filter(shot, out_w, out_h, fps)
    filter_chain = motion + chapter_filter(shot, work_dir, out_w, out_h, scale)
    target = os.path.join(work_dir, f"{shot['id']}.mp4")

    run_ffmpeg(
        [
            "-i", source,
            "-filter_complex", f"[0:v]{filter_chain}[v]",
            "-map", "[v]",
            "-frames:v", str(frames),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "medium", "-crf", "14",
            "-pix_fmt", "yuv420p",
            target,
        ],
        f"渲染镜头 {shot['id']}",
    )
    return target, frames / fps


def render_card(card, name, work_dir, out_w, out_h, fps, scale):
    """片头 / 片尾标题卡：纯色底 + 排版文字，整卡靠 xfade 淡入淡出。"""
    duration = card["duration"]
    en_file = escape_path(write_text(work_dir, f"{name}_en", card["line_en"]))
    zh_file = escape_path(write_text(work_dir, f"{name}_zh", card["line_zh"]))
    sub_file = escape_path(write_text(work_dir, f"{name}_sub", card["line_sub"]))

    center = out_h / 2.0
    en_size = max(14, int(50 * scale))
    zh_size = max(12, int(38 * scale))
    sub_size = max(9, int(19 * scale))
    rule_w = int(300 * scale)
    rule_h = max(1, int(2 * scale))

    filter_chain = (
        # 不用纯黑，留一点点冷灰更像放映画面
        f"drawbox=x=0:y=0:w={out_w}:h={out_h}:color=0x0B0D0C:t=fill,"
        f"drawtext=fontfile={escape_path(FONT_EN_BOLD)}:textfile={en_file}"
        f":fontcolor={WARM_WHITE}:fontsize={en_size}"
        f":x=(w-text_w)/2:y={int(center - 118 * scale)},"
        f"drawbox=x=(iw-{rule_w})/2:y={int(center - 26 * scale)}"
        f":w={rule_w}:h={rule_h}:color={GOLD}@0.85:t=fill,"
        f"drawtext=fontfile={escape_path(FONT_ZH)}:textfile={zh_file}"
        f":fontcolor={GOLD}:fontsize={zh_size}"
        f":x=(w-text_w)/2:y={int(center + 8 * scale)},"
        f"drawtext=fontfile={escape_path(FONT_EN)}"
        f":textfile={sub_file}:fontcolor={MUTED}:fontsize={sub_size}"
        f":x=(w-text_w)/2:y={int(center + 92 * scale)},"
        f"vignette=angle=PI/4.4,format=yuv420p"
    )

    target = os.path.join(work_dir, f"{name}.mp4")
    run_ffmpeg(
        [
            "-f", "lavfi",
            "-i", f"color=c=0x0B0D0C:s={out_w}x{out_h}:r={fps}:d={duration}",
            "-filter_complex", f"[0:v]{filter_chain}[v]",
            "-map", "[v]",
            "-frames:v", str(int(round(duration * fps))),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "medium", "-crf", "14",
            "-pix_fmt", "yuv420p",
            target,
        ],
        f"渲染标题卡 {name}",
    )
    return target, duration


def build_xfade_graph(segments, default_transition):
    """把所有片段用 xfade 串起来，返回 (滤镜串, 最终标签, 总时长)。"""
    steps = []
    label = "0:v"
    running = segments[0]["duration"]

    for index in range(1, len(segments)):
        segment = segments[index]
        transition = segment.get("transition", "fade")
        duration = segment.get("transition_duration", default_transition)
        offset = running - duration
        out_label = f"x{index}"
        steps.append(
            f"[{label}][{index}:v]xfade=transition={transition}"
            f":duration={duration}:offset={offset:.3f}[{out_label}]"
        )
        label = out_label
        running = running + segment["duration"] - duration

    return steps, label, running


def assemble(segments, work_dir, default_transition, fps):
    """输出无黑边的宽银幕母版，横版竖版都从它派生。"""
    steps, label, total = build_xfade_graph(segments, default_transition)

    grade = (
        f"[{label}]noise=alls=5:allf=t+u,"
        f"eq=contrast=1.02:saturation=1.02,"
        f"fade=t=in:st=0:d=1.4,"
        f"fade=t=out:st={max(0.0, total - 1.8):.3f}:d=1.8,"
        f"format=yuv420p[master]"
    )

    inputs = []
    for segment in segments:
        inputs += ["-i", segment["path"]]

    target = os.path.join(work_dir, "master_scope.mp4")
    run_ffmpeg(
        inputs
        + [
            "-filter_complex", ";".join(steps + [grade]),
            "-map", "[master]",
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "slow", "-crf", "16",
            "-pix_fmt", "yuv420p",
            target,
        ],
        "剪辑宽银幕母版",
    )
    return target, total


def deliver_landscape(master, out_dir, audio, out_w, out_h, full_h, fps):
    """横版交付：把宽银幕母版补成 16:9，上下加黑边。"""
    pad_y = int((full_h - out_h) / 2)
    target = os.path.join(out_dir, "jaguar_type_t_nordic_drive_16x9.mp4")

    args = ["-i", master]
    if audio:
        args += ["-i", audio]

    args += [
        "-filter_complex",
        f"[0:v]pad={out_w}:{full_h}:0:{pad_y}:color=black,format=yuv420p[v]",
        "-map", "[v]",
    ]
    if audio:
        args += ["-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]

    args += [
        "-r", str(fps),
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        target,
    ]
    run_ffmpeg(args, "输出横版成片")
    return target


def deliver_vertical(master, out_dir, audio, fps, scale, master_w, master_h):
    """竖版交付：模糊背景 + 居中画面，适合手机端观看。"""
    width = max(2, int(1080 * scale) // 2 * 2)
    height = max(2, int(1920 * scale) // 2 * 2)
    # 中间画面比整宽再放大一点（横向裁掉一些），减少上下留白的空洞感
    inner_w = int(width * 1.2) // 2 * 2
    inner_h = int(inner_w * master_h / master_w) // 2 * 2

    target = os.path.join(out_dir, "jaguar_type_t_nordic_drive_9x16.mp4")
    args = ["-i", master]
    if audio:
        args += ["-i", audio]

    args += [
        "-filter_complex",
        (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},gblur=sigma=42,"
            f"eq=brightness=-0.16:saturation=1.15[blurred];"
            f"[fg]scale={inner_w}:{inner_h}:flags=lanczos,"
            f"crop={width}:{inner_h}[centre];"
            f"[blurred][centre]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]"
        ),
        "-map", "[v]",
    ]
    if audio:
        args += ["-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]

    args += [
        "-r", str(fps),
        "-c:v", "libx264", "-preset", "slow", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        target,
    ]
    run_ffmpeg(args, "输出竖版成片")
    return target


def build_score(duration, work_dir):
    """合成配乐，长度比画面略长一点，交给 -shortest 去截。"""
    sys.path.insert(0, HERE)
    import ambient_score

    log(f"合成配乐：{duration:.1f}s")
    samples = ambient_score.render_score(duration + 1.0)
    return ambient_score.write_wav(os.path.join(work_dir, "score.wav"), samples)


def build_contact_sheet(segments, out_dir, work_dir):
    """把每个镜头的中间帧拼成一张分镜预览图，方便快速检查构图。"""
    shots = [s for s in segments if s.get("is_shot")]
    tiles = []
    for index, segment in enumerate(shots):
        tile = os.path.join(work_dir, f"tile_{index:02d}.png")
        midpoint = max(0.1, segment["duration"] / 2.0)
        run_ffmpeg(
            ["-ss", f"{midpoint:.2f}", "-i", segment["path"], "-frames:v", "1",
             "-vf", "scale=480:-2", tile],
            "抽取分镜预览帧",
        )
        tiles.append(tile)

    columns = 3
    rows = (len(tiles) + columns - 1) // columns
    target = os.path.join(out_dir, "storyboard_contact_sheet.jpg")
    # 所有 tile 尺寸一致，直接当作图片序列喂给 tile 滤镜最省事
    run_ffmpeg(
        [
            "-framerate", "1",
            "-pattern_type", "glob",
            "-i", os.path.join(work_dir, "tile_*.png"),
            "-vf", f"tile={columns}x{rows}:margin=8:padding=8:color=0x111312",
            "-frames:v", "1",
            "-q:v", "3",
            target,
        ],
        "拼接分镜预览图",
    )
    return target


def main():
    parser = argparse.ArgumentParser(description="Jaguar Type T 概念车车拍短片合成")
    parser.add_argument("--storyboard", default=os.path.join(HERE, "storyboard.json"))
    parser.add_argument("--frames-dir", default=os.path.join(HERE, "frames"))
    parser.add_argument("--work-dir", default=os.path.join(HERE, "work"))
    parser.add_argument("--out-dir", default=os.path.join(HERE, "out"))
    parser.add_argument("--preview", action="store_true", help="半分辨率快速预览")
    parser.add_argument("--no-audio", action="store_true", help="不合成配乐")
    parser.add_argument("--no-vertical", action="store_true", help="不输出竖版")
    parser.add_argument("--keep-work", action="store_true", help="保留中间片段")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None:
        fail("未找到 ffmpeg，请先安装。")
    check_fonts()

    with open(args.storyboard, encoding="utf-8") as handle:
        board = json.load(handle)

    scale = 0.5 if args.preview else 1.0
    fps = board["fps"]
    full_w = int(board["width"] * scale) // 2 * 2
    full_h = int(board["height"] * scale) // 2 * 2
    scope_h = int(board["letterbox_height"] * scale) // 2 * 2
    transition = board["transition_duration"]

    os.makedirs(args.work_dir, exist_ok=True)
    os.makedirs(args.out_dir, exist_ok=True)

    log(f"母版尺寸 {full_w}x{scope_h}（交付 {full_w}x{full_h}），{fps}fps")

    segments = []

    path, duration = render_card(
        board["title_card"], "title_card", args.work_dir, full_w, scope_h, fps, scale
    )
    segments.append({"path": path, "duration": duration})

    total_shots = len(board["shots"])
    previous_id = None
    for index, shot in enumerate(board["shots"], 1):
        log(f"({index}/{total_shots}) 渲染 {shot['id']} · {shot['note']}")
        path, duration = render_shot(
            shot, args.frames_dir, args.work_dir, full_w, scope_h, fps, scale
        )
        # 转场归属于"进入这一段"的那次溶接，所以看的是上一个镜头的编号
        act_break = previous_id in FADE_TO_BLACK_AFTER
        segments.append(
            {
                "path": path,
                "duration": duration,
                "is_shot": True,
                "transition": "fadeblack" if act_break else "fade",
                "transition_duration": transition + 0.4 if act_break else transition,
            }
        )
        previous_id = shot["id"]

    path, duration = render_card(
        board["end_card"], "end_card", args.work_dir, full_w, scope_h, fps, scale
    )
    segments.append(
        {"path": path, "duration": duration, "transition": "fadeblack",
         "transition_duration": 1.0}
    )

    log("剪辑母版")
    master, total = assemble(segments, args.work_dir, transition, fps)
    log(f"成片时长 {total:.1f}s")

    audio = None
    if not args.no_audio:
        audio = build_score(total, args.work_dir)

    landscape = deliver_landscape(
        master, args.out_dir, audio, full_w, scope_h, full_h, fps
    )
    log(f"横版成片：{landscape}")

    if not args.no_vertical:
        vertical = deliver_vertical(
            master, args.out_dir, audio, fps, scale, full_w, scope_h
        )
        log(f"竖版成片：{vertical}")

    sheet = build_contact_sheet(segments, args.out_dir, args.work_dir)
    log(f"分镜预览图：{sheet}")

    if not args.keep_work:
        for name in os.listdir(args.work_dir):
            if name.startswith("tile_") or name.startswith("text_"):
                os.remove(os.path.join(args.work_dir, name))

    log("全部完成。")


if __name__ == "__main__":
    main()
