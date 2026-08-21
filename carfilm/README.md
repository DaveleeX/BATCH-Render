# Jaguar Type T Concept · 车拍短片

一条约 48 秒的概念车短片：车不只是停在展厅里被围观，它推开展厅大门，
开进北欧小镇的石板街，最后停在街角咖啡馆的暖灯下。

成片由脚本从静帧合成，没有依赖任何剪辑软件——运镜、转场、字幕、调色、
配乐全部在 `ffmpeg` 和 `numpy` 里完成，改一行分镜表就能重新出片。

## 目录

```
carfilm/
├── frames/            12 张分镜静帧（1536x1024）
├── prompts.md         每张静帧的生成描述词
├── storyboard.json    分镜表：时长、运镜、裁切、章节字幕
├── build_car_film.py  合成主程序
├── ambient_score.py   配乐合成器（纯 numpy）
├── work/              中间片段，可随时删
└── out/               成片输出
```

## 出片

```bash
python3 carfilm/build_car_film.py                 # 完整出片（约 3~4 分钟）
python3 carfilm/build_car_film.py --preview       # 半分辨率快速预览（约 1 分钟）
python3 carfilm/build_car_film.py --no-audio      # 只出画面
python3 carfilm/build_car_film.py --keep-work     # 保留中间片段方便排查
```

输出：

| 文件 | 规格 | 用途 |
| --- | --- | --- |
| `out/jaguar_type_t_nordic_drive_16x9.mp4` | 1920×1080，2.4:1 宽银幕黑边，30fps | 主片 |
| `out/jaguar_type_t_nordic_drive_9x16.mp4` | 1080×1920，模糊底 + 居中画面 | 手机端 / 社交平台 |
| `out/storyboard_contact_sheet.jpg` | 3×4 拼图 | 分镜构图速查 |

依赖：`ffmpeg`（含 libx264、drawtext）、`python3`、`numpy`。
字幕用到 Inter 与文泉驿微米黑，缺字体时脚本会直接报错并指出路径。

## 结构

短片分三幕，幕与幕之间用黑场断开：

| 幕 | 镜头 | 内容 |
| --- | --- | --- |
| 第一幕 · 室内陈列 | shot01–04 | 白色展厅里的英雄镜头、格栅特写、T 形尾灯、侧身细节 |
| 第二幕 · 驶出展厅 | shot05 | 展厅大门敞开，门外就是小镇街道，车灯亮起 |
| 第三幕 · 小镇巡游 | shot06–12 | 石板街跟拍、贴地轮组、运河石桥、街角咖啡馆、路灯蓝调、俯瞰全景 |

## 分镜表怎么改

`storyboard.json` 里每个镜头都是一组可调参数：

```json
{
  "id": "shot06",
  "file": "shot06_town_street_front.jpg",
  "duration": 4.4,
  "move": "push_in",
  "zoom": [1.06, 1.15],
  "pan": [[0.46, 0.52], [0.52, 0.5]],
  "crop_bias": 0.58,
  "chapter": { "en": "...", "zh": "第三幕 · 小镇巡游" }
}
```

- `zoom`：镜头起止的推拉倍率，`[1.0, 1.1]` 是缓推，`[1.14, 1.04]` 是后拉
- `pan`：起止的取景中心，`[x, y]` 都是 0~1 的归一化坐标
- `crop_bias`：静帧裁成宽银幕时保留哪一段高度，车在画面偏下就调大
- `chapter`：只有需要打章节字幕的镜头才写

`move` 字段只是给人看的说明，实际运动完全由 `zoom` 和 `pan` 决定。

## 实现要点

- **运镜**：静帧先裁成宽银幕再放大到两倍尺寸喂给 `zoompan`，超采样是为了
  避免慢速推拉时出现整数取整造成的抖动
- **剪辑**：所有片段用 `xfade` 串联，转场时长和类型逐段可配，偏移量按累计
  时长推算，幕间用 `fadeblack`
- **配乐**：A 小调 i–VI–III–VII 走向的 pad，每个音由三个失谐正弦叠加，
  低频衬底跟根音走，最后与指数衰减噪声做 FFT 卷积得到混响
- **调色**：轻微提对比 + 四角压暗 + 时域颗粒，颗粒放在剪辑之后加，
  保证跨越转场时噪点是连续的

## 素材说明

`frames/` 里的静帧是为这条片子生成的概念渲染图，造型参考 Gabriel Brando
Naretto 的 Jaguar Type T Concept，仅作影像练习使用。生成用的描述词都记在
`prompts.md` 里，想换季节、换城市或者换配色，改那份文件重新出图即可。
