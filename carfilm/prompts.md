# 分镜生成描述词

`frames/` 里 12 张静帧的原始生成描述词，全部 16:9。

## 一致性做法

先只生成 shot01，确认车型、配色、轮辐、比例都对之后，把它作为参考图
（reference image）传给后面 11 张。所以每条描述词里都有一句
`the same deep British racing green concept coupe from the reference image`，
用来把车锁死，剩下的篇幅全部留给环境、光线和机位。

车型锁定的关键词：deep British racing green（英国赛车绿）、glossy black roof、
vertical cream-gold stripe on the door（车门米金竖条纹）、cream-and-black
multi-spoke wheels、oval mesh grille、T-shaped rear lighting signature
（T 形尾灯签名，magenta-red 细线）。

每条都以 `no people, no text` 结尾——画面里出现人或文字都会破坏概念车影像的
纯净感，而且生成的文字通常是乱码。

---

## 第一幕 · 室内陈列

### shot01 展厅英雄镜头

> Cinematic automotive photograph, 16:9. A low-slung modern Jaguar-style concept
> coupe in deep British racing green with a glossy black roof and black hood
> section, a vertical cream-gold stripe on the door, cream-and-black multi-spoke
> wheels, long bonnet, muscular rear haunches, thin chrome-gold accent lines,
> oval mesh grille. It sits on a polished light grey floor inside a minimalist
> white studio hall with a soft horizon-less cyclorama background, subtle
> gradient lighting from above, soft reflections under the car. Three-quarter
> front view from a low camera angle, shallow depth of field, ultra-realistic
> product render, clean and elegant, no text, no people.

唯一一条把车从零描述清楚的，后面全部靠它当参考图。

### shot02 格栅特写

> Cinematic automotive detail photograph, 16:9. Extreme close-up of the front of
> the same deep British racing green concept coupe from the reference image:
> oval black mesh grille with a thin chrome-gold surround, slim horizontal LED
> headlight blades, glossy green paint reflecting a soft studio strip light.
> Dark moody studio, black background, single soft key light raking across the
> bonnet, deep shadows, high-end car commercial lighting, ultra realistic,
> no people, no text.

`single soft key light raking across the bonnet` 是这张的重点，侧掠光才能把
机盖的曲面拉出来。

### shot03 车尾三分之四

> Cinematic automotive photograph, 16:9. Rear three-quarter view of the same deep
> British racing green concept coupe from the reference image, glossy black roof
> and fastback tail, cream-gold vertical stripe on the door, cream-and-black
> wheels. Its T-shaped rear lighting signature glows in a thin magenta-red line
> across the tail. Dark minimalist studio with a black floor and a faint horizon
> gradient, dramatic overhead lighting, reflections on the polished floor,
> museum-like display, ultra realistic render, no people, no text.

`museum-like display` 用来强化"陈列品"这层意思。

### shot04 侧身细节

> Cinematic automotive detail photograph, 16:9. Tight side detail of the same
> deep British racing green concept coupe from the reference image: the
> cream-gold vertical racing stripe on the door, the muscular rear haunch, and
> the cream-and-black multi-spoke wheel. Soft studio reflections curve along the
> glossy green body, light grey polished floor, minimal white studio, shallow
> depth of field, ultra realistic, no people, no text.

---

## 第二幕 · 驶出展厅

### shot05 展厅大门

> Cinematic photograph, 16:9. Interior of a minimalist white exhibition hall; the
> same deep British racing green concept coupe from the reference image stands in
> silhouette facing a huge open glass door. Beyond the doorway, daylight floods
> in revealing a cozy Nordic town street with colorful wooden houses in mustard
> yellow and deep red, cobblestones and light snow. The car is backlit, its
> headlights just switched on, long reflections on the hall floor. Moody contrast
> between the cool white gallery and the warm town outside, ultra realistic,
> no people, no text.

整条片子的转折点，所以描述词里同时装了两个世界：冷白展厅和门外的暖色小镇，
靠 `moody contrast between the cool white gallery and the warm town outside`
把两者的关系说清楚。

---

## 第三幕 · 小镇巡游

### shot06 石板街正面跟拍

> Cinematic rolling car photography, 16:9. The same deep British racing green
> concept coupe from the reference image drives along a narrow cobblestone street
> of a cozy Nordic old town. On both sides stand small wooden houses painted
> mustard yellow, deep red and cream white, with white window frames, warm
> glowing windows, flower boxes and a few patches of snow on the pavement.
> Overcast soft Scandinavian afternoon light, damp cobblestones reflecting the
> car, slight motion blur on the ground and wheels, panning shot from the front
> three-quarter, ultra realistic, cinematic color grade, no people, no text.

`rolling car photography` 是车拍行话，比写 "driving shot" 更容易出跟拍的味道；
`slight motion blur on the ground and wheels` 负责把静止的渲染变成在动的车。

### shot07 车尾跟拍

> Cinematic tracking car photography, 16:9. Rear three-quarter view of the same
> deep British racing green concept coupe from the reference image driving away
> down a cobbled Nordic town lane, its thin magenta-red T-shaped taillight
> signature glowing. Colorful old wooden houses line the lane, a white church
> spire and a small town square appear ahead in soft mist. Overcast Scandinavian
> daylight, wet cobblestones, gentle motion blur, cinematic film grain,
> ultra realistic, no people, no text.

### shot08 贴地轮组

> Cinematic low-angle rig shot, 16:9. Wheel-level camera close to wet
> cobblestones, following the cream-and-black wheel and low green flank of the
> same concept coupe from the reference image as it rolls slowly through a Nordic
> old town alley. Strong motion blur on the cobblestones, sharp wheel,
> reflections of warm shop windows on the glossy green paint, shallow depth of
> field, dramatic perspective, ultra realistic, cinematic, no people, no text.

`rig shot` 指车身吸盘炮架拍出来的效果；`strong motion blur on the cobblestones,
sharp wheel` 这组对比是速度感的来源——地面糊、轮子实。

### shot09 运河石桥

> Cinematic wide car photography, 16:9. The same deep British racing green
> concept coupe from the reference image crosses a small stone bridge over a calm
> canal in a Nordic harbour town. Along the waterfront stand narrow wooden
> warehouse houses in ochre, red and white, small wooden boats moored below,
> still water mirroring the buildings and the car. Soft overcast light with a
> hint of late afternoon gold, distant hills, ultra realistic, cinematic color
> grade, no people, no text.

### shot10 街角咖啡馆

> Cinematic photograph, 16:9. The same deep British racing green concept coupe
> from the reference image is parked at the kerb beside a cozy corner café in a
> Nordic old town. Warm string lights and lanterns hang above small wooden tables
> and chairs on the cobblestones, the café windows glow amber, a chalkboard menu
> leans by the door, potted evergreens and a little snow at the edges. Blue hour
> dusk, warm-cool color contrast, the car's magenta-red T-shaped taillight
> signature glowing softly, reflections on wet stone, ultra realistic, cinematic,
> no people, no readable text.

全片最温馨的一幕，暖光元素堆得最密：串灯、灯笼、暖黄窗、小黑板菜单。
这里写的是 `no readable text`——黑板和店招需要存在，只是不要出现乱码文字。

### shot11 路灯下的蓝调时刻

> Cinematic photograph, 16:9. High three-quarter view looking down a quiet Nordic
> town street at blue hour: the same deep British racing green concept coupe from
> the reference image stands alone on damp cobblestones under an old iron street
> lamp, warm amber light pooling around it. Colorful wooden houses with glowing
> windows recede into a soft snowy haze, faint snowflakes in the air, a church
> spire silhouetted against a deep blue sky. Peaceful, warm and cinematic,
> ultra realistic, no people, no text.

### shot12 俯瞰全景

> Cinematic wide establishing photograph, 16:9. Distant elevated view of a cozy
> Nordic town at dusk with colorful wooden houses, snow-dusted roofs and warm
> glowing windows; a narrow cobblestone street winds through the town and the
> same deep British racing green concept coupe from the reference image is a
> small elegant shape driving along it, headlights on. Deep blue evening sky with
> soft clouds, mountains and a fjord in the background, warm town lights,
> tranquil and filmic, ultra realistic, no people, no text.

收尾镜头，车退成 `a small elegant shape`，主角让位给小镇本身。
