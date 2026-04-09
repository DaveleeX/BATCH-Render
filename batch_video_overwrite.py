# -*- coding: utf-8 -*-
"""
批量视频替换并渲染（输入素材固定在 videos 文件夹）
---------------------------------------------------------
目录约定：
- root_path（当前 .blend 所在目录）
  - Untitled.blend
  - batch_video_overwrite.py
  - videos/                 <-- 用户把待替换原视频放这里
      - video1.mp4
      - video2.mp4
  - render_video1.mp4       <-- 输出在 root_path 根目录
  - render_video2.mp4

功能说明：
1) 自动识别当前 .blend 所在目录为 root_path
2) 仅遍历 root_path/videos 下的 .mp4 素材（不再扫描根目录）
3) 找到材质球 "video" 中的 TEX_IMAGE 节点并替换
4) 执行 bpy.ops.image.match_movie_length()（失败会提示，不中断）
5) 开启 auto_refresh
6) 渲染输出 MP4（MPEG-4 + H.264）
7) 渲染帧数锁定为工程原始帧范围（例如 1~100，不被视频时长改写）
"""

import os
import bpy
import traceback

# 是否锁定为工程原始帧范围（建议 True）
LOCK_TO_PROJECT_FRAME_RANGE = True


def get_root_path():
    """获取根目录：当前 .blend 所在目录。"""
    blend_path = bpy.data.filepath
    if blend_path:
        return os.path.dirname(os.path.abspath(blend_path))
    print("[Warning] 当前 .blend 未保存，root_path 使用当前工作目录。")
    return os.path.abspath(os.getcwd())


def get_videos_dir(root_path):
    """输入素材目录：root_path/videos"""
    return os.path.join(root_path, "videos")


def collect_input_mp4_files(videos_dir):
    """
    收集 videos 目录中的 mp4 文件（不递归子目录）。
    如果你希望递归子目录，可把 os.listdir 改为 os.walk。
    """
    inputs = []
    try:
        for name in os.listdir(videos_dir):
            full_path = os.path.join(videos_dir, name)
            if os.path.isfile(full_path) and name.lower().endswith(".mp4"):
                inputs.append(full_path)
    except Exception as e:
        print(f"[Error Log] 遍历 videos 目录失败: {e}")

    inputs.sort()
    return inputs


def find_video_tex_node():
    """查找材质球 'video' 中的 TEX_IMAGE 节点。"""
    mat = bpy.data.materials.get("video")
    if mat is None:
        print("[Error Log] 未找到材质球 'video'。")
        return None, None

    if mat.node_tree is None:
        print("[Error Log] 材质 'video' 没有节点树。")
        return mat, None

    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            return mat, node

    print("[Error Log] 材质 'video' 中未找到 TEX_IMAGE 节点。")
    return mat, None


def set_engine(scene):
    """设置渲染引擎，优先 EEVEE Next。"""
    try:
        engine_ids = {
            item.identifier
            for item in scene.render.bl_rna.properties["engine"].enum_items
        }
    except Exception:
        engine_ids = set()

    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        if engine in engine_ids:
            scene.render.engine = engine
            print(f"[Info] 渲染引擎: {engine}")
            return

    print("[Warning] 未找到预期渲染引擎，保持当前设置。")


def set_enum_if_exists(rna_obj, prop_name, preferred_values):
    """安全设置枚举属性，避免 Blender 版本差异导致报错。"""
    try:
        prop = rna_obj.bl_rna.properties[prop_name]
        valid_ids = {it.identifier for it in prop.enum_items}
    except Exception:
        return False

    for v in preferred_values:
        if v in valid_ids:
            setattr(rna_obj, prop_name, v)
            return True
    return False


def setup_mp4_output(scene, output_path):
    """
    配置 MP4 输出：
    - 新版：media_type = VIDEO
    - 旧版：file_format = FFMPEG
    - 容器：MPEG4
    - 编码：H264
    - 音频：NONE（无音频）
    """
    image_settings = scene.render.image_settings
    ffmpeg = scene.render.ffmpeg

    media_ok = set_enum_if_exists(image_settings, "media_type", ["VIDEO"])
    ffmpeg_ok = set_enum_if_exists(image_settings, "file_format", ["FFMPEG"])

    if not (media_ok or ffmpeg_ok):
        raise RuntimeError("当前 Blender 构建不支持视频输出（VIDEO/FFMPEG 均不可用）。")

    set_enum_if_exists(ffmpeg, "format", ["MPEG4"])
    set_enum_if_exists(ffmpeg, "codec", ["H264"])
    if not set_enum_if_exists(ffmpeg, "audio_codec", ["NONE"]):
        set_enum_if_exists(ffmpeg, "audio_codec", ["AAC"])  # 兜底

    if not output_path.lower().endswith(".mp4"):
        output_path += ".mp4"

    scene.render.filepath = output_path


def sync_movie_length_then_fix_range(image_obj, project_start, project_end):
    """
    按要求尝试执行 match_movie_length，
    但最终可锁定工程帧范围，防止渲染帧数被视频长度拉长。
    """
    scene = bpy.context.scene

    # 执行要求中的 operator（后台模式下可能报上下文警告，属于正常）
    try:
        bpy.ops.image.match_movie_length()
    except Exception as e:
        print(f"[Warning] match_movie_length 调用失败（后台模式常见）: {e}")

    if LOCK_TO_PROJECT_FRAME_RANGE:
        scene.frame_start = project_start
        scene.frame_end = project_end
        print(f"[Info] 使用工程帧范围: {project_start} ~ {project_end}")
    else:
        duration = int(getattr(image_obj, "frame_duration", 0))
        if duration > 0:
            scene.frame_start = 1
            scene.frame_end = duration
            print(f"[Info] 使用视频帧范围: 1 ~ {duration}")
        else:
            print("[Error Log] 无法读取 frame_duration，帧范围保持不变。")


def process_one_video(video_path, tex_node, root_path, project_start, project_end):
    """处理单个视频：替换纹理 -> 设置输出 -> 渲染。"""
    scene = bpy.context.scene
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    output_mp4 = os.path.join(root_path, f"render_{base_name}.mp4")

    print(f"\n[Info] 开始处理: {video_path}")
    print(f"[Info] 输出文件: {output_mp4}")

    try:
        img = bpy.data.images.load(video_path, check_existing=True)
        img.source = "MOVIE"

        tex_node.image = img
        tex_node.image_user.use_auto_refresh = True
        tex_node.image_user.frame_start = 1
        tex_node.image_user.frame_offset = 0

        sync_movie_length_then_fix_range(img, project_start, project_end)
        setup_mp4_output(scene, output_mp4)

        print(f"[Info] 开始渲染: {base_name}")
        bpy.ops.render.render(animation=True)
        print(f"[Info] 渲染完成: {output_mp4}")

    except Exception as e:
        print(f"[Error Log] 处理失败: {video_path}")
        print(f"[Error Log] 异常信息: {e}")
        traceback.print_exc()


def main():
    print("[Info] 批量任务启动。")

    root_path = get_root_path()
    videos_dir = get_videos_dir(root_path)

    print(f"[Info] root_path = {root_path}")
    print(f"[Info] videos_dir = {videos_dir}")

    # 检查 videos 目录是否存在
    if not os.path.isdir(videos_dir):
        print("[Error Log] 未找到 videos 文件夹。请在 .blend 同级目录创建 videos 并放入原视频。")
        return

    # 记录工程原始帧范围（防止被视频时长覆盖）
    scene = bpy.context.scene
    project_start = int(scene.frame_start)
    project_end = int(scene.frame_end)
    print(f"[Info] 工程原始帧范围: {project_start} ~ {project_end}")

    # 收集输入视频
    input_videos = collect_input_mp4_files(videos_dir)
    if not input_videos:
        print("[Error Log] videos 文件夹中未找到 .mp4 文件。")
        return

    # 查找材质与纹理节点
    _, tex_node = find_video_tex_node()
    if tex_node is None:
        return

    set_engine(scene)

    total = len(input_videos)
    print(f"[Info] 检测到待替换视频数量: {total}，将渲染 {total} 个输出。")

    for idx, video_path in enumerate(input_videos, 1):
        print(f"[Progress] ({idx}/{total})")
        process_one_video(video_path, tex_node, root_path, project_start, project_end)

    print("\n[Info] 全部任务完成。")


if __name__ == "__main__":
    main()