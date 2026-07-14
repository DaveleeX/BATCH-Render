# 览界（LanJie）— 视觉语音助手 Demo

手机端 Web Demo，验证「摄像头画面 + 语音多轮对话 + 地理 + 高德周边推荐 + opt-in 识人」这一智能眼镜前序能力。

## 能力

- 全屏摄像头；按住说话（Web Speech）或多轮文字输入
- 每轮自动抓帧，结合对话历史与 GPS
- 高德周边搜索（50m）；扫街榜实时人数目前**无公开 API**，使用热度适配层/演示数据
- 「我的身份」：上传人脸 + 职业，开启可发现后，他人可问「这是谁」

## 本地运行

```bash
cd vision-assistant
cp .env.example .env.local
# 填入 GOOGLE_GENERATIVE_AI_API_KEY 或 OPENAI_API_KEY
# 可选：AMAP_WEB_KEY
npm install
npm run dev
```

手机访问电脑局域网 IP 的 `http://host:3000`。**摄像头通常要求 HTTPS**；公网部署后更稳。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 推荐，Gemini 2.0 Flash 视觉快 |
| `OPENAI_API_KEY` | 备选 gpt-4o-mini |
| `AMAP_WEB_KEY` | 高德 Web 服务 Key；缺省用演示 POI |
| `FORCE_MOCK=1` | 强制演示数据 |

未配置 Key 时应用仍可跑，进入 DEMO 模式。

## 扫街榜说明

高德「扫街榜」与店内实时人数目前不是开放平台标准能力。本项目预留 `scanstreet-adapter`，现用周边搜索 + 评分衍生热度估算，拿到商务接口后可替换 `src/lib/amap.ts`。

## 部署

可部署到 Vercel，并配置上述环境变量。摄像头/麦克风/定位需用户授权；iOS Safari 对语音识别支持较弱，可用文字输入兜底。
