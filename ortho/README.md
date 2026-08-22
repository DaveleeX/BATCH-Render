# Jaguar Type T Concept · 正交四视图

侧、顶、前、后四张正交视图，抠了底、统一了比例，可以直接拖进 Blender
当背景参考图起稿。

## 目录

```
ortho/
├── views/                  4 张原始正交视图（1536x1024 / 1456x1456）
├── build_ortho_sheet.py    抠底、比例对齐、蓝图排版
└── out/                    输出（已 gitignore）
```

## 出图

```bash
python3 ortho/build_ortho_sheet.py
python3 ortho/build_ortho_sheet.py --length 4.62    # 换一个假定车长重算标注
python3 ortho/build_ortho_sheet.py --fit height     # 前后视图保持原比例
```

输出：

| 文件 | 内容 |
| --- | --- |
| `out/type_t_ortho_side.png` | 侧视图，2400×1200 透明底 |
| `out/type_t_ortho_top.png` | 顶视图，同上 |
| `out/type_t_ortho_front.png` | 前视图，同上 |
| `out/type_t_ortho_rear.png` | 后视图，同上 |
| `out/type_t_ortho_blueprint.png` | 四视图合成的蓝图，带网格、外接框和尺寸标注 |

依赖：`python3`、`numpy`、`Pillow`。标注用到 Inter 与文泉驿微米黑。

## 比例是怎么统一的

生成出来的四张图各画各的，尺度并不一致，直接拿去建模会对不上。脚本按三个
共享尺寸把它们闭合起来：

- **车长** 由侧视图给出，缩放到 2040 px，顶视图按同一车长对齐
- **车高** 由侧视图给出，前后视图按同一车高对齐
- **车宽** 由顶视图给出，前后视图按同一车宽对齐

前后视图同时受车宽和车高约束，如果原图比例不对就会被非等比拉伸。脚本会把
修正系数打出来，例如：

```
[Info] front: 原图宽高比 1.93，目标 1.51，横向修正 0.785
[Info] rear:  原图宽高比 1.67，目标 1.51，横向修正 0.905
```

不想要这个拉伸就加 `--fit height` 或 `--fit width`，保持原比例，代价是四视图
之间对不齐。

抠底用的是从四角漫水填充，而不是全图颜色阈值——车身内部也有接近底色的浅色
区域（米金轮辐、车头灯、车窗高光），只有从画面外围连通进来的才算背景。

## 在 Blender 里怎么用

四张 PNG 画布尺寸完全一致（2400×1200），同一个比例，侧/前/后共用一条地平线
（y = 1100），顶视图垂直居中。所以：

1. 建四个 Empty，类型选 Image，`size` 设成同一个值
2. 分别沿 -Y、+X、-X、+Z 摆放并加载对应的图
3. 车身自然对齐，不需要再单独缩放某一张

标注上的米制尺寸是按假定车长 4.70 m 推算的，只是给一个起稿量级，不是工程
尺寸。想按别的车长换算就改 `--length`。

## 素材说明

`views/` 里的四张图是为建模参考生成的概念渲染，造型参考 Gabriel Brando
Naretto 的 Jaguar Type T Concept。生成时强调了"零透视、水平视线、左右对称"，
但生成模型做不到真正的正交投影，成图仍带轻微的透视残留，精确建模请以实际
工程数据为准。
