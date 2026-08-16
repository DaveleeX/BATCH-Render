#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Blender IMAX previz：由 shots.json 建立物理正确的大画幅摄像机阵列

用法：
    blender -b scene.blend -P imax_previz.py -- --shots shots.json
    blender scene.blend -P imax_previz.py -- --shots shots.json          # 带界面
    blender -b scene.blend -P imax_previz.py -- --shots shots.json --render out/previz.mp4
    blender -b -P imax_previz.py -- --shots shots.json --report-only     # 只打印视野报告

它做什么：
- 按真实感光面尺寸建摄像机（IMAX 15/70 = 70.41 × 52.63 mm），
  水平视野因此是物理正确的——这是纸面分镜回答不了的问题
- 每个镜头一台摄像机，焦距取自 shot list
- 按 24fps 和各镜时长在时间轴上排好摄像机标记
- 打印视野报告：每个焦距等效于全画幅多少毫米

为什么所有镜头共用一个渲染画幅（container）：
  这正是实拍做法——按较窄的画幅构图，保护画框之外的部分。
  摄像机 sensor_fit 设为 HORIZONTAL，水平视野只由焦距和感光面宽度决定，
  与渲染分辨率无关；容器比画幅高时，多出来的上下部分就是保护区。

幂等：重复运行会更新已存在的同名摄像机，不改动它们已有的位置和朝向。
"""

import json
import math
import os
import sys

try:
    import bpy
except ImportError:  # pragma: no cover - 只有在 Blender 外运行才会走到
    bpy = None

FPS = 24

# 画幅 -> (感光面宽 mm, 感光面高 mm, 格式名)
FORMATS = {
    "1.43": (70.41, 52.63, "IMAX 15/70"),
    "1.90": (70.41, 52.63, "IMAX Digital（同机身裁切）"),
    "2.20": (52.48, 23.01, "65mm 5-perf"),
    "2.39": (24.89, 18.66, "35mm 变形宽银幕"),
    "1.85": (24.89, 13.45, "35mm Flat"),
    "1.33": (24.89, 18.72, "Academy"),
}
DEFAULT_FORMAT = (70.41, 52.63, "IMAX 15/70")

FULL_FRAME_HALF_WIDTH = 18.0  # 全画幅感光面宽 36mm 的一半，用于折算等效焦距


def parse_args(argv):
    import argparse

    parser = argparse.ArgumentParser(
        prog="imax_previz.py", description="由 shots.json 建立 IMAX previz 摄像机"
    )
    parser.add_argument("--shots", required=True, help="shots.json 路径")
    parser.add_argument(
        "--container",
        default="1.43",
        help="渲染容器画幅，比所有镜头画幅都高为宜（默认 1.43）",
    )
    parser.add_argument(
        "--width", type=int, default=2048, help="渲染宽度像素（默认 2048）"
    )
    parser.add_argument("--render", help="渲染 previz 到该 mp4 路径")
    parser.add_argument(
        "--collection", default="PREVIZ", help="摄像机所在集合名（默认 PREVIZ）"
    )
    parser.add_argument(
        "--spacing", type=float, default=3.0, help="新建摄像机的排列间距（米）"
    )
    parser.add_argument(
        "--report-only", action="store_true", help="只打印视野报告，不修改场景"
    )
    return parser.parse_args(argv)


def aspect_key(value, default="1.43"):
    if value is None:
        return default
    return str(value).strip().replace(":1", "") or default


def aspect_value(value, default=1.43):
    key = aspect_key(value)
    try:
        if ":" in key:
            num, den = key.split(":", 1)
            return float(num) / float(den)
        return float(key)
    except (ValueError, ZeroDivisionError):
        return default


def parse_focal(lens_text, default=50.0):
    """从 'IMAX 80mm T2.0' 里取出 80。"""
    if not lens_text:
        return default
    digits = ""
    for index, char in enumerate(str(lens_text)):
        if char.isdigit() or char == ".":
            digits += char
        elif digits:
            if str(lens_text)[index:].lower().startswith("mm"):
                try:
                    return float(digits)
                except ValueError:
                    return default
            digits = ""
    try:
        return float(digits) if digits else default
    except ValueError:
        return default


def horizontal_fov(focal, sensor_width):
    return 2.0 * math.degrees(math.atan(sensor_width / (2.0 * focal)))


def full_frame_equivalent(focal, sensor_width):
    half = math.radians(horizontal_fov(focal, sensor_width) / 2.0)
    return FULL_FRAME_HALF_WIDTH / math.tan(half) if half else focal


def iter_shots(data):
    for seq in data.get("sequences", []):
        for shot in seq.get("shots", []):
            yield seq, shot


def shot_duration(shot, default=3.0):
    try:
        value = float(shot.get("duration") or 0)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def print_report(data):
    """打印视野报告：每个镜头的水平视野，以及它等效于全画幅多少毫米。"""
    print("\n=== 视野报告 / FIELD OF VIEW ===")
    print(
        f"{'SHOT':<8}{'ASPECT':<8}{'LENS':>8}{'SENSOR':>10}"
        f"{'H-FOV':>8}{'≈FF':>8}  FORMAT"
    )
    print("-" * 74)

    for seq, shot in iter_shots(data):
        key = aspect_key(shot.get("aspect") or seq.get("aspect"))
        sensor_w, _, format_name = FORMATS.get(key, DEFAULT_FORMAT)
        focal = parse_focal(shot.get("lens"))
        print(
            f"{str(shot.get('id', '?')):<8}"
            f"{key:<8}"
            f"{focal:>6.0f}mm"
            f"{sensor_w:>8.2f}mm"
            f"{horizontal_fov(focal, sensor_w):>7.1f}°"
            f"{full_frame_equivalent(focal, sensor_w):>6.0f}mm"
            f"  {format_name}"
        )
    print()


def get_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def set_enum_if_exists(rna_obj, prop_name, preferred_values):
    """安全设置枚举属性，避免 Blender 版本差异导致报错。"""
    try:
        valid = {
            item.identifier for item in rna_obj.bl_rna.properties[prop_name].enum_items
        }
    except Exception:
        return False
    for value in preferred_values:
        if value in valid:
            setattr(rna_obj, prop_name, value)
            return True
    return False


def setup_camera(shot, seq, collection, index, spacing):
    name = f"CAM_{shot.get('id', index)}"
    key = aspect_key(shot.get("aspect") or seq.get("aspect"))
    sensor_w, sensor_h, format_name = FORMATS.get(key, DEFAULT_FORMAT)
    focal = parse_focal(shot.get("lens"))

    data = bpy.data.cameras.get(name)
    if data is None:
        data = bpy.data.cameras.new(name)

    data.lens = focal
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = sensor_w
    data.sensor_height = sensor_h
    data.show_name = True
    data.show_passepartout = True
    data.passepartout_alpha = 0.9
    data.display_size = 0.6

    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "CAMERA":
        obj = bpy.data.objects.new(name, data)
        # 新摄像机排成一列并水平朝前，等待美术/摄影调位
        obj.location = (index * spacing, -8.0, 1.6)
        obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    else:
        # 已存在则只更新镜头参数，保留已有的位置与朝向
        obj.data = data

    if obj.name not in collection.objects:
        for other in list(obj.users_collection):
            other.objects.unlink(obj)
        collection.objects.link(obj)

    obj["shot_id"] = str(shot.get("id", ""))
    obj["slug"] = str(shot.get("slug", ""))
    obj["size"] = str(shot.get("size", ""))
    obj["movement"] = str(shot.get("movement", ""))
    obj["aspect"] = key
    obj["format"] = format_name
    obj["lens_note"] = str(shot.get("lens", ""))

    return obj


def setup_scene(data, args):
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0

    container = aspect_value(args.container)
    scene.render.resolution_x = args.width
    scene.render.resolution_y = int(round(args.width / container))
    scene.render.resolution_percentage = 100

    collection = get_collection(args.collection)

    # 清掉上一次运行留下的摄像机标记，避免重复堆积
    for marker in list(scene.timeline_markers):
        if marker.name.startswith("SH_"):
            scene.timeline_markers.remove(marker)

    frame = 1
    count = 0
    for index, (seq, shot) in enumerate(iter_shots(data)):
        obj = setup_camera(shot, seq, collection, index, args.spacing)
        marker = scene.timeline_markers.new(f"SH_{shot.get('id', index)}", frame=frame)
        marker.camera = obj
        frame += max(1, int(round(shot_duration(shot) * FPS)))
        count += 1

    scene.frame_start = 1
    scene.frame_end = max(1, frame - 1)
    if count:
        first = scene.timeline_markers[0] if scene.timeline_markers else None
        if first and first.camera:
            scene.camera = first.camera

    return count, scene.frame_end, container


def setup_render_output(scene, output_path):
    if not output_path.lower().endswith(".mp4"):
        output_path += ".mp4"

    directory = os.path.dirname(os.path.abspath(output_path))
    if directory:
        os.makedirs(directory, exist_ok=True)

    image_settings = scene.render.image_settings
    media_ok = set_enum_if_exists(image_settings, "media_type", ["VIDEO"])
    ffmpeg_ok = set_enum_if_exists(image_settings, "file_format", ["FFMPEG"])
    if not (media_ok or ffmpeg_ok):
        raise RuntimeError("当前 Blender 构建不支持视频输出（VIDEO/FFMPEG 均不可用）。")

    set_enum_if_exists(scene.render.ffmpeg, "format", ["MPEG4"])
    set_enum_if_exists(scene.render.ffmpeg, "codec", ["H264"])
    set_enum_if_exists(scene.render.ffmpeg, "audio_codec", ["NONE", "AAC"])

    set_enum_if_exists(
        scene.render, "engine", ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"]
    )
    scene.render.filepath = output_path
    return output_path


def main():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    args = parse_args(argv)

    if not os.path.isfile(args.shots):
        print(f"[Error Log] 找不到 {args.shots}")
        return 1

    with open(args.shots, encoding="utf-8") as handle:
        try:
            data = json.load(handle)
        except json.JSONDecodeError as error:
            print(f"[Error Log] {args.shots} 不是合法 JSON：{error}")
            return 1

    print_report(data)

    if args.report_only:
        return 0

    if bpy is None:
        print("[Error Log] 需要在 Blender 里运行：blender -b -P imax_previz.py -- ...")
        print("[提示] 只想看视野报告的话，加 --report-only 可以直接用 python3 运行。")
        return 1

    count, last_frame, container = setup_scene(data, args)
    scene = bpy.context.scene

    print(f"[Info] 集合 {args.collection}：建立/更新 {count} 台摄像机")
    print(
        f"[Info] 渲染容器 {container:.2f}:1 "
        f"（{scene.render.resolution_x} × {scene.render.resolution_y}）"
    )
    print(f"[Info] 帧范围 1 ~ {last_frame}（{FPS}fps，约 {last_frame / FPS:.1f} 秒）")
    print("[Info] 画幅比容器窄的镜头，上下多出来的部分即为保护区")

    if args.render:
        output = setup_render_output(scene, args.render)
        print(f"[Info] 开始渲染 previz: {output}")
        bpy.ops.render.render(animation=True)
        print(f"[Info] 渲染完成: {output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
