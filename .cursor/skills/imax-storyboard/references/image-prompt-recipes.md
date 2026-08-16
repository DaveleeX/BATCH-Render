# 出图配方：把镜头信息翻译成提示词

图像模型不懂"诺兰风格"。它懂**镜头、光源、材质、颗粒、构图**。这份文档把分镜字段翻译成模型能执行的描述。

## 1. 三种画风寄存器

先和用户确认用哪一种，整册只用一种。

| 寄存器 | 适用 | 风格描述块（直接粘进提示词） |
| --- | --- | --- |
| **A. 生产分镜（推荐）** | 进组用、迭代快、看得清调度 | `black and white storyboard panel, graphite and charcoal drawing on toned paper, confident gestural line work, grey marker wash for values, minimal detail on faces, clear silhouettes and staging, professional film production storyboard` |
| **B. 概念分镜** | 提案、给投资人看 | `monochrome cinematic concept frame, painterly chiaroscuro, heavy atmospheric perspective, charcoal and ink wash, dramatic value structure, film production art` |
| **C. 摄影级 previz** | 定光定色、视觉开发 | `photorealistic film still, shot on 65mm Kodak color negative, fine film grain, natural highlight rolloff, shadows retain detail, photochemical color` |

寄存器 A 是**分镜的默认答案**。分镜的功能是沟通调度，不是好看；线稿画得快、改得快，一眼能看清人在哪、机器在哪。只有用户明确要"成片感画面"时才用 C。

## 2. 提示词结构

固定八段，顺序不要变：

```
[风格块] +
[画幅] +
[景别 + 焦距特性] +
[主体与动作] +
[机位与运动] +
[光源与氛围] +
[色彩与胶片] +
[构图指令] +
[排除项]
```

### 各段的写法

**画幅**：`framed for 1.43:1 IMAX aspect ratio, near-square tall frame`（模型不会精确执行比例，但它会影响构图的竖向分布，有用）

**景别 + 焦距特性**：不要写"80mm 镜头"——模型不理解 IMAX 焦距。写它的**视觉后果**：

| 想要的 | 写法 |
| --- | --- |
| IMAX 50mm 广角 | `wide angle, natural perspective, no barrel distortion, environment surrounds the subject` |
| IMAX 80mm 特写 | `close-up shot from close physical distance with a normal lens, face fills much of the frame while surrounding environment remains visible, natural undistorted perspective` |
| 大画幅浅景深 | `extremely shallow depth of field, eyelashes sharp, ears already falling out of focus, creamy background falloff` |
| 深焦 | `deep focus, foreground and distant background both sharp` |

**光源**：永远指名道姓。`single tungsten desk lamp camera-left, unfilled shadow side` 好过 `dramatic lighting`。

**色彩与胶片**：`Kodak 65mm negative, fine grain, muted desaturated palette of slate blue and sand, shadows retain detail, soft highlight rolloff`

**构图指令**：`low horizon line, figure small against vast sky, upper half of frame filled with overcast cloud`

**排除项**（每次都带上）：

```
no anamorphic lens flare, no teal-and-orange grading, no HDR, no oversaturation,
no digital over-sharpening, no fisheye distortion, no lens flare streaks,
no text, no watermark, no logos, no UI overlays, no 3D render look
```

## 3. Style Plate 协议

**第一格单独画，用来定全册的调子。**

1. 从 shot list 里挑一格最能代表全片调性的（通常是主角在主场景里的中近景）
2. 用完整的八段提示词生成
3. 给用户看，改到满意为止——这一步的迭代成本远低于后面 60 格
4. 保存为 `panels/_styleplate.png`
5. **之后每一格生成时，把它作为参考图传入**（`reference_image_paths`），并在提示词里加：
   `match the drawing style, line weight, value range and grain of the reference image exactly`

跳过这一步，60 格会长出 6 种画风，然后只能全部重画。

## 4. 一致性控制

| 要保持一致的 | 做法 |
| --- | --- |
| 画风 | style plate 作参考图 + 风格块逐格复用（原样复制，不要改写） |
| 角色 | 建一份**角色描述块**（发型、脸型、衣着、年龄、体型），每次原样粘贴；有角色定妆图就一并作参考图传入 |
| 场景 | 建**场景描述块**（建筑材质、色调、光的方向和时间）；同一场戏的所有镜头复用 |
| 时间与天气 | 写死在场景块里（`overcast late afternoon, flat shadowless grey light`），不要让每格自己发挥 |
| 画幅 | 同一段落所有镜头用同一个生成比例 |

**描述块要原样复制粘贴，不要每次重写一遍**。重写就是漂移的来源。

建议在 `shots.json` 同级维护一个 `style.md`，存放风格块、角色块、场景块，出图时直接取用。

## 5. 生成比例映射

图像工具只提供固定比例。选最接近的，装订时由 `build_storyboard.py` 用 CSS 居中裁切到真实画幅：

| 目标画幅 | 生成比例 | 装订裁切（上下各） |
| --- | --- | --- |
| 1.43:1 IMAX | `4:3` | 3.4% |
| 1.90:1 数字 IMAX | `16:9` | 3.2% |
| 2.20:1 5-perf 65mm | `16:9` | 9.6% |
| 2.39:1 变形宽银幕 | `16:9` | 12.8% |

**重要**：因为要被裁，构图时把关键信息放在中央，不要顶到上下边缘。

图像工具**不保证**严格按请求的比例出图（要 4:3 经常给 3:2）。这不影响结果——画格按 `shots.json` 里的 `aspect` 渲染，来什么比例都会被居中裁到位。上面的百分比只是让你心里有数会裁掉多少，不需要手工对齐。

## 6. 运动箭头不要交给模型画

图像模型画箭头的结果通常是乱涂。正确做法是**在装订层叠加**：在 `shots.json` 的镜头里写 `arrows`，`build_storyboard.py` 会用 SVG 画出规范的箭头（摄影机运动为实线，主体运动为虚线），坐标用画面归一化的 0–1：

```json
"arrows": [
  {"type": "camera",  "from": [0.5, 0.8], "to": [0.5, 0.35], "label": "PUSH IN"},
  {"type": "subject", "from": [0.2, 0.6], "to": [0.75, 0.6], "label": "士兵横穿"}
]
```

这样箭头永远干净、可读、可改，而且不占用生成额度。

## 7. 完整示例

### 示例一：1.43 大远景（寄存器 A）

> black and white storyboard panel, graphite and charcoal drawing on toned paper, confident gestural line work, grey marker wash for values, minimal detail on faces, clear silhouettes and staging, professional film production storyboard —— framed for 1.43:1 IMAX aspect ratio, near-square tall frame —— extreme wide shot, wide angle with natural undistorted perspective —— a single soldier stands alone on a vast empty beach, back to camera, tiny against the scale of the shoreline —— static camera at eye level —— flat shadowless overcast light, no visible sun, no cast shadows —— muted grey value range, heavy paper grain —— horizon line low in the lower third, upper two thirds of the frame filled with dense overcast sky, figure placed slightly off-center —— no anamorphic lens flare, no teal-and-orange grading, no HDR, no oversaturation, no digital over-sharpening, no fisheye distortion, no text, no watermark, no 3D render look

### 示例二：1.43 逼视特写（寄存器 A）

> ［同一风格块］—— framed for 1.43:1 IMAX aspect ratio, near-square tall frame —— close-up shot taken from very close physical distance with a normal lens, the face fills much of the frame while the room behind remains visible, natural undistorted perspective, extremely shallow depth of field with the eyes sharp and the ears already soft —— a man in his forties, gaunt, hollow-eyed, staring directly into the lens, jaw tight —— static camera, slightly below eye level —— single tungsten desk lamp camera-left, the opposite side of the face falling into unfilled shadow —— deep blacks that still hold detail, fine grain —— face centered and low in the frame, large empty ceiling space above the head —— ［同一排除项］

### 示例三：2.20:1 对白中景（寄存器 C）

> photorealistic film still, shot on 65mm Kodak color negative, fine film grain, natural highlight rolloff, shadows retain detail, photochemical color —— framed for 2.20:1 widescreen —— medium shot, normal lens, shallow but controlled depth of field —— two men on opposite sides of a bare wooden table in a small hearing room, one leaning forward —— static camera, eye level, slightly off-axis —— hard daylight through a single window camera-right cutting a bright wedge across the table, the rest of the room in falloff —— warm tungsten and daylight mix, desaturated browns and greys —— symmetrical composition on the table's centerline, low ceiling visible and pressing down —— ［同一排除项］

## 8. 出图后的检查

每格生成后过一遍，不合格就重生成，不要将就：

- [ ] 光源方向和分镜写的一致吗？
- [ ] 景别对吗？（模型经常把特写画成中景）
- [ ] 画风和 style plate 一致吗？
- [ ] 角色长得和上一格是同一个人吗？
- [ ] 关键信息在中央安全区内（能扛住裁切）吗？
- [ ] 有没有混进变形宽银幕光斑、霓虹青橙、数字锐化？
- [ ] 手、脸、道具有没有明显崩坏？
- [ ] 画面里有没有混进文字、水印、UI？

重生成时**只改出问题的那一段**，其余段原样保留——整段重写会引入新的漂移。
