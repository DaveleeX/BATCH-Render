# -*- coding: utf-8 -*-
"""
Jaguar Type T Concept —— 正交四视图对齐
---------------------------------------------------------
把 views/ 里四张正交视图（侧、前、后、顶）抠底、统一比例、对齐到同一张画布，
输出可以直接拖进 Blender 当背景参考图的透明 PNG，外加一张带网格和标注的蓝图。

比例是这么统一的：
- 侧视图定基准，车长缩放到 TARGET_LENGTH_PX
- 顶视图按"车长相同"缩放
- 前后视图按"车高相同"缩放
- 侧、前、后三张共用同一条地平线，顶视图垂直居中

四张输出画布尺寸完全一致，所以在 Blender 里给四个 Empty 设成同样的 size，
它们的车身就是对齐的。

用法：
    python3 ortho/build_ortho_sheet.py
    python3 ortho/build_ortho_sheet.py --length 4.62   # 换一个假定车长重算标注
"""

import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

FONT_EN = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
FONT_EN_BOLD = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
FONT_ZH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"

CANVAS_W = 2400
CANVAS_H = 1200
GROUND_Y = 1100
TARGET_LENGTH_PX = 2040

# 抠底：从四角往里漫水填充，阈值是三通道差值之和
FLOOD_THRESHOLD = 70
MAGIC = (255, 0, 255)

SHEET_BG = (17, 19, 18)
GRID = (38, 42, 40)
GUIDE = (200, 180, 137)
LABEL = (238, 235, 228)
DIM_TEXT = (150, 156, 154)

VIEWS = [
    ("side", "SIDE ELEVATION", "侧视图"),
    ("top", "PLAN VIEW", "顶视图"),
    ("front", "FRONT ELEVATION", "前视图"),
    ("rear", "REAR ELEVATION", "后视图"),
]


def log(message):
    print(f"[Info] {message}", flush=True)


def fail(message):
    raise SystemExit(f"[Error Log] {message}")


def cut_out(path):
    """从四角漫水填充去掉平底色，返回带 alpha 的 RGBA 图。

    用漫水而不是全图颜色阈值，是因为车身内部也有接近底色的浅色区域
    （米金轮辐、车头灯、车窗高光），只有从画面外围连通进来的才算背景。
    """
    image = Image.open(path).convert("RGB")
    width, height = image.size

    probe = image.copy()
    for corner in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        if probe.getpixel(corner) == MAGIC:
            continue
        ImageDraw.floodfill(probe, corner, MAGIC, thresh=FLOOD_THRESHOLD)

    pixels = np.array(probe)
    background = np.all(pixels == np.array(MAGIC, dtype=pixels.dtype), axis=-1)

    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8), mode="L")
    # 羽化一档再拉回硬边，抠出来才不是锯齿
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    alpha = alpha.point(lambda v: 0 if v < 96 else (255 if v > 176 else (v - 96) * 3))

    result = image.convert("RGBA")
    result.putalpha(alpha)
    return result


def content_box(rgba):
    """车身的外接框。"""
    box = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        fail("抠底之后是空图，检查底色是否够干净。")
    return box


def place(rgba, box, size, anchor):
    """
    把车身缩放到指定的像素尺寸后贴到统一画布上。
    anchor="ground" 表示车底贴地平线，"middle" 表示垂直居中。
    """
    cropped = rgba.crop(box)
    width, height = (max(1, round(v)) for v in size)
    cropped = cropped.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - width) // 2
    y = GROUND_Y - height if anchor == "ground" else (CANVAS_H - height) // 2
    canvas.alpha_composite(cropped, (x, y))
    return canvas, (x, y, width, height)


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        fail(f"字体加载失败：{path}")


def draw_grid(sheet):
    """蓝图底纹。"""
    drawer = ImageDraw.Draw(sheet)
    step = 60
    for x in range(0, sheet.width, step):
        drawer.line([(x, 0), (x, sheet.height)], fill=GRID, width=1)
    for y in range(0, sheet.height, step):
        drawer.line([(0, y), (sheet.width, y)], fill=GRID, width=1)


def paste_view(sheet, layer, placement, scale, left, top):
    """
    把归一化画布里的车身裁出来，按统一比例贴到蓝图的指定位置。
    返回车身在蓝图上的矩形，方便后面画标注。
    """
    x, y, width, height = placement
    crop = layer.crop((x, y, x + width, y + height))
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    crop = crop.resize(target, Image.LANCZOS)
    sheet.alpha_composite(crop, (left, top))
    return left, top, left + target[0], top + target[1]


def outline(drawer, rect, centre_line=True):
    """虚线外接框 + 竖直中线。"""
    left, top, right, bottom = rect
    dash(drawer, (left, top), (right, top))
    dash(drawer, (left, bottom), (right, bottom))
    dash(drawer, (left, top), (left, bottom))
    dash(drawer, (right, top), (right, bottom))
    if centre_line:
        centre = (left + right) // 2
        drawer.line([(centre, top - 16), (centre, bottom + 16)], fill=GRID, width=1)


def caption(drawer, fonts, origin, label_en, label_zh):
    """视图标题。"""
    x, y = origin
    drawer.text((x, y), label_en, font=fonts["en"], fill=LABEL)
    drawer.text((x, y + 26), label_zh, font=fonts["zh"], fill=GUIDE)


def dimension(drawer, fonts, start, end, text, vertical=False):
    """带端点短横的尺寸线。"""
    drawer.line([start, end], fill=GUIDE, width=1)
    tick = 6
    for point in (start, end):
        if vertical:
            drawer.line(
                [(point[0] - tick, point[1]), (point[0] + tick, point[1])],
                fill=GUIDE, width=1,
            )
        else:
            drawer.line(
                [(point[0], point[1] - tick), (point[0], point[1] + tick)],
                fill=GUIDE, width=1,
            )

    mid = ((start[0] + end[0]) // 2, (start[1] + end[1]) // 2)
    box = drawer.textbbox((0, 0), text, font=fonts["dim"])
    width = box[2] - box[0]
    height = box[3] - box[1]
    if vertical:
        drawer.rectangle(
            [mid[0] - width - 14, mid[1] - height, mid[0] - 6, mid[1] + height],
            fill=SHEET_BG,
        )
        drawer.text((mid[0] - width - 10, mid[1] - height // 2 - 2), text,
                    font=fonts["dim"], fill=DIM_TEXT)
    else:
        drawer.rectangle(
            [mid[0] - width // 2 - 8, mid[1] - height - 6,
             mid[0] + width // 2 + 8, mid[1] + height + 2],
            fill=SHEET_BG,
        )
        drawer.text((mid[0] - width // 2, mid[1] - height // 2 - 3), text,
                    font=fonts["dim"], fill=DIM_TEXT)


def dash(drawer, start, end, length=12, gap=9):
    """虚线，PIL 没有内置。"""
    x0, y0 = start
    x1, y1 = end
    span = max(abs(x1 - x0), abs(y1 - y0))
    if span == 0:
        return
    steps = int(span // (length + gap)) + 1
    for index in range(steps):
        a = index * (length + gap) / span
        b = min(1.0, (index * (length + gap) + length) / span)
        drawer.line(
            [
                (x0 + (x1 - x0) * a, y0 + (y1 - y0) * a),
                (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b),
            ],
            fill=GUIDE,
            width=1,
        )


def main():
    parser = argparse.ArgumentParser(description="正交四视图对齐与蓝图输出")
    parser.add_argument("--views-dir", default=os.path.join(HERE, "views"))
    parser.add_argument("--out-dir", default=os.path.join(HERE, "out"))
    parser.add_argument(
        "--length", type=float, default=4.70,
        help="假定的整车长度（米），只用来换算标注上的尺寸",
    )
    parser.add_argument(
        "--fit", choices=("both", "height", "width"), default="both",
        help="前后视图对齐方式：both 非等比拉到车宽车高都对上，height/width 保持原比例",
    )
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    cut = {}
    boxes = {}
    for name, _, _ in VIEWS:
        path = os.path.join(args.views_dir, f"{name}.png")
        if not os.path.isfile(path):
            fail(f"缺少视图：{path}")
        cut[name] = cut_out(path)
        boxes[name] = content_box(cut[name])
        box = boxes[name]
        log(f"{name}: 车身外接框 {box[2] - box[0]}x{box[3] - box[1]}")

    # 三个共享尺寸：侧视图给出车长和车高，顶视图给出车宽
    side_length = boxes["side"][2] - boxes["side"][0]
    base = TARGET_LENGTH_PX / side_length
    length_px = TARGET_LENGTH_PX
    height_px = (boxes["side"][3] - boxes["side"][1]) * base
    width_px = (boxes["top"][3] - boxes["top"][1]) * (
        TARGET_LENGTH_PX / (boxes["top"][2] - boxes["top"][0])
    )

    targets = {
        "side": (length_px, height_px),
        "top": (length_px, width_px),
        "front": fit_size(boxes["front"], width_px, height_px, args.fit),
        "rear": fit_size(boxes["rear"], width_px, height_px, args.fit),
    }

    for name in ("front", "rear"):
        box = boxes[name]
        native = (box[2] - box[0]) / (box[3] - box[1])
        wanted = width_px / height_px
        log(
            f"{name}: 原图宽高比 {native:.2f}，目标 {wanted:.2f}，"
            f"横向修正 {targets[name][0] / (box[2] - box[0]) / (targets[name][1] / (box[3] - box[1])):.3f}"
        )

    layers = {}
    placements = {}
    for name, _, _ in VIEWS:
        anchor = "middle" if name == "top" else "ground"
        layers[name], placements[name] = place(
            cut[name], boxes[name], targets[name], anchor
        )
        layers[name].save(os.path.join(args.out_dir, f"type_t_ortho_{name}.png"))

    metres_per_px = args.length / TARGET_LENGTH_PX
    log(
        f"按车长 {args.length:.2f} m 换算："
        f"车高 {height_px * metres_per_px:.2f} m，"
        f"车宽 {width_px * metres_per_px:.2f} m"
    )

    build_sheet(layers, placements, args, metres_per_px, height_px, width_px)
    log("全部完成。")


def fit_size(box, width_px, height_px, mode):
    """前后视图怎么套到目标车宽车高上。"""
    native_w = box[2] - box[0]
    native_h = box[3] - box[1]
    if mode == "height":
        scale = height_px / native_h
        return native_w * scale, height_px
    if mode == "width":
        scale = width_px / native_w
        return width_px, native_h * scale
    # both：非等比拉到车宽车高都对上。生成图的比例本来就不是工程精度，
    # 与其保留原比例，不如让四张图在同一套尺寸上闭合，建模起稿才对得上。
    return width_px, height_px


def build_sheet(layers, placements, args, metres_per_px, height_px, width_px):
    """
    拼一张深色蓝图：顶视图、侧视图各占一行，前后视图并排一行。
    四个视图共用同一个比例，所以图上量出来的长宽高是自洽的。
    """
    margin = 90
    header = 176
    gap = 96
    caption_h = 56

    scale = 1800 / TARGET_LENGTH_PX
    length_s = round(TARGET_LENGTH_PX * scale)
    height_s = round(height_px * scale)
    width_s = round(width_px * scale)

    sheet_w = length_s + margin * 2
    sheet_h = (
        header
        + caption_h + width_s + gap
        + caption_h + height_s + gap
        + caption_h + height_s
        + margin + 150
    )

    sheet = Image.new("RGBA", (sheet_w, sheet_h), SHEET_BG + (255,))
    draw_grid(sheet)
    drawer = ImageDraw.Draw(sheet)

    fonts = {
        "en": load_font(FONT_EN_BOLD, 20),
        "zh": load_font(FONT_ZH, 16),
        "title": load_font(FONT_EN_BOLD, 38),
        "title_zh": load_font(FONT_ZH, 21),
        "dim": load_font(FONT_EN, 16),
    }

    drawer.text((margin, 54), "JAGUAR TYPE T CONCEPT", font=fonts["title"], fill=LABEL)
    drawer.text(
        (margin, 104), "正交四视图 · ORTHOGRAPHIC GENERAL ARRANGEMENT",
        font=fonts["title_zh"], fill=GUIDE,
    )

    cursor = header

    # 顶视图
    caption(drawer, fonts, (margin, cursor), "PLAN VIEW", "顶视图")
    rect = paste_view(
        sheet, layers["top"], placements["top"], scale, margin, cursor + caption_h
    )
    outline(drawer, rect, centre_line=False)
    drawer.line(
        [(rect[0] - 26, (rect[1] + rect[3]) // 2), (rect[2] + 26, (rect[1] + rect[3]) // 2)],
        fill=GRID, width=1,
    )
    dimension(
        drawer, fonts, (rect[2] + 46, rect[1]), (rect[2] + 46, rect[3]),
        f"{width_px * metres_per_px:.2f} m", vertical=True,
    )
    cursor += caption_h + width_s + gap

    # 侧视图，与顶视图共用同一条车长基准
    caption(drawer, fonts, (margin, cursor), "SIDE ELEVATION", "侧视图")
    rect = paste_view(
        sheet, layers["side"], placements["side"], scale, margin, cursor + caption_h
    )
    outline(drawer, rect, centre_line=False)
    ground(drawer, rect, margin, sheet_w)
    dimension(
        drawer, fonts, (rect[0], rect[3] + 44), (rect[2], rect[3] + 44),
        f"{args.length:.2f} m",
    )
    dimension(
        drawer, fonts, (rect[2] + 46, rect[1]), (rect[2] + 46, rect[3]),
        f"{height_px * metres_per_px:.2f} m", vertical=True,
    )
    cursor += caption_h + height_s + gap

    # 前后视图并排，同一比例、同一条地平线
    caption(drawer, fonts, (margin, cursor), "FRONT ELEVATION", "前视图")
    caption(
        drawer, fonts, (margin + length_s // 2 + 40, cursor), "REAR ELEVATION", "后视图"
    )
    for index, name in enumerate(("front", "rear")):
        slot_left = margin + index * (length_s // 2 + 40)
        slot_width = length_s // 2
        left = slot_left + (slot_width - width_s) // 2
        rect = paste_view(
            sheet, layers[name], placements[name], scale, left, cursor + caption_h
        )
        outline(drawer, rect)
        if index == 0:
            ground(drawer, rect, margin, sheet_w)
            dimension(
                drawer, fonts, (rect[0], rect[3] + 44), (rect[2], rect[3] + 44),
                f"{width_px * metres_per_px:.2f} m",
            )

    footer = sheet_h - margin + 20
    drawer.text(
        (margin, footer - 30),
        f"assumed overall length {args.length:.2f} m   ·   "
        f"height {height_px * metres_per_px:.2f} m   ·   "
        f"width {width_px * metres_per_px:.2f} m   ·   "
        f"all four views share one scale",
        font=fonts["dim"], fill=DIM_TEXT,
    )
    drawer.text(
        (margin, footer - 4),
        "四视图同比例；尺寸由假定车长推算，仅供建模起稿参考",
        font=fonts["zh"], fill=DIM_TEXT,
    )

    target = os.path.join(args.out_dir, "type_t_ortho_blueprint.png")
    sheet.convert("RGB").save(target)
    log(f"蓝图：{target}")


def ground(drawer, rect, margin, sheet_w):
    """贯穿整幅的地平线。"""
    drawer.line(
        [(margin - 30, rect[3]), (sheet_w - margin + 30, rect[3])],
        fill=(58, 62, 60), width=1,
    )


if __name__ == "__main__":
    main()
