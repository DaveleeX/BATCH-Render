# 交付规范

## 1. 目录结构

```
项目名/
├── shots.json          # 唯一数据源
├── style.md            # 风格块 / 角色块 / 场景块（出图时复制粘贴用）
├── panels/
│   ├── _styleplate.jpg # 画风基准
│   ├── 1A.jpg
│   ├── 1B.jpg
│   └── ...
└── storyboard.html     # 装订产物（打印即 PDF）
```

`shots.json` 是唯一数据源。分镜表、shot list、previz 全部由它生成——**不要维护第二份镜头清单**，会立刻不同步。

## 2. shots.json 结构

```json
{
  "project": {
    "title": "片名",
    "subtitle": "分镜表 / STORYBOARD",
    "director": "导演",
    "dp": "摄影指导",
    "version": "v1",
    "date": "2026-08-16",
    "logline": "一句话故事",
    "palette": "色彩方案",
    "stock": "胶片方案",
    "notes": "全局约束",
    "format_policy": [
      { "aspect": "1.43", "format": "IMAX 15/70", "usage": "什么时候用它" }
    ]
  },
  "sequences": [
    {
      "id": "SEQ01",
      "title": "段落名",
      "timeline": "所属时间线",
      "location": "INT./EXT. 地点",
      "aspect": "1.43",
      "synopsis": "这段用什么结构模板、为什么",
      "shots": []
    }
  ]
}
```

### 镜头字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 镜号。用 `12A / 12B / 12C`，同场不同机位递增字母 |
| `slug` | ✅ | 场景条：`INT./EXT. 地点 — 时间` |
| `aspect` | | 画幅。省略则继承所属段落 |
| `size` | ✅ | 景别：`EWS/WS/FS/MS/MCU/CU/ECU/INS` |
| `lens` | ✅ | 焦距与光圈，如 `IMAX 80mm T2.0` |
| `movement` | ✅ | `STATIC / HANDHELD / PUSH IN / DOLLY L / CRANE UP / PAN R ...` |
| `action` | ✅ | 画面里发生什么。**写可见的东西**，不写心理活动 |
| `dialogue` | | 台词。无台词就留空 |
| `sound` | | 声音设计提示 |
| `light` | ✅ | 光源与方向。必须能指认来源 |
| `duration` | ✅ | 秒。用于节奏核算与 previz |
| `transition` | | `CUT / MATCH CUT / INTERCUT / J-CUT / L-CUT / FADE / CUT TO BLACK` |
| `protect` | | 画幅保护框，如 `2.39`。装订时画成虚线内框 |
| `image` | | 画面文件路径，相对 `shots.json` |
| `arrows` | | 运动箭头，见下 |
| `practical` | | 实拍方案：怎么真拍出来 |
| `notes` | | 给摄影/美术/特效的备注 |

### 箭头

坐标为画面归一化的 `0–1`（左上为原点）。`camera` 画实线，`subject` 画虚线。

```json
"arrows": [
  { "type": "camera",  "from": [0.5, 0.88], "to": [0.5, 0.40], "label": "PUSH IN" },
  { "type": "subject", "from": [0.20, 0.12], "to": [0.34, 0.60], "label": "落尘" }
]
```

## 3. 装订

```bash
python3 scripts/build_storyboard.py shots.json -o storyboard.html
```

| 参数 | 作用 |
| --- | --- |
| `-o, --output` | 输出路径 |
| `-c, --columns` | 每行画格数（默认 A3=4，A4=3） |
| `-p, --paper` | `a3` / `a4` / `letter` |
| `--embed` | 图片内联为 data URI，产出可单独分发的单一文件 |
| `--title` | 覆盖封面标题 |

产物包含封面（含格式策略与时长统计）、逐段分镜格页、SHOT LIST 总表。浏览器打印导出 PDF。

**画幅裁切是自动的**：生成图是什么比例都不要紧，画格按 `aspect` 渲染，CSS 居中裁切。所以构图时把关键信息放中央，别顶边。

## 4. Blender previz（可选）

```bash
blender -b scene.blend -P scripts/imax_previz.py -- --shots shots.json
blender -b scene.blend -P scripts/imax_previz.py -- --shots shots.json --render out/previz.mp4
```

按 IMAX 15/70 真实感光面（70.41 × 52.63 mm）建摄像机，每个镜头一台，焦距、时长、画幅全部对应 shot list，并按 24fps 排上时间轴标记。

用途：**核对"50mm 到底有多广"**。这是纸面分镜无法回答的问题——大画幅的视野和景深靠想象经常错得离谱。

## 5. 验收标准

一册分镜合格，要同时满足：

**完整性**
- [ ] 每个镜头 `id / slug / size / lens / movement / action / light / duration` 齐全
- [ ] 每个段落写了 `synopsis`，说明用的是哪个结构模板
- [ ] `format_policy` 说明了每种画幅什么时候用

**技术一致性**
- [ ] IMAX 焦距都在 50 / 80mm，例外有书面理由
- [ ] 每格光源可指认
- [ ] 画幅切换都有叙事理由
- [ ] 轴线没有无意破坏
- [ ] 匹配剪辑的两格构图确实匹配（相邻镜的 `action` 能对上）

**视觉一致性**
- [ ] 全册用同一张 style plate 作参考
- [ ] 角色在不同格里是同一个人
- [ ] 同一场戏的光的方向和时间一致

**可拍性**
- [ ] 复杂效果镜写了 `practical` 实拍方案
- [ ] 没有物理上不可能的机位
- [ ] 手持镜考虑了大画幅机器的重量（约 50 磅）

**可用性**
- [ ] `build_storyboard.py` 能跑通且无缺图警告
- [ ] 段落时长与节奏设计吻合
- [ ] 打印出来在 A3 上字看得清

## 6. 版本管理

- 改动记在 `project.version`（`v1` → `v2`），并在 `project.notes` 里写一句改了什么
- 重画某格时**保留原文件名**，避免 `shots.json` 里的路径失效
- 删镜头不要重排编号；标 `OMITTED` 更安全，剪辑和场记靠编号对话
