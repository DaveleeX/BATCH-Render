# 览界（LanJie）— 视觉语音助手 Demo

手机端 Web Demo，验证「摄像头画面 + 语音多轮对话 + 地理 + 高德周边推荐 + opt-in 识人」这一智能眼镜前序能力。

## 线上地址

> **注意：Vercel 在大陆常需 VPN。** 要用豆包+高德免 VPN，请把站点部署到国内云，见 [`DEPLOY_CN.md`](./DEPLOY_CN.md)。

海外临时地址（可能需 VPN）：

**https://vision-assistant.vercel.app**

手机浏览器打开后，点「点击开启摄像头」，再按住说话或打字提问。

### 高德 Key 重要说明

当前控制台里的 Key 绑定的是 **Web端（JS API）**，服务端周边搜索需要 **Web服务** Key。  
请在同一应用点「添加 Key」，服务平台勾选 **Web服务**，把新 Key 配到 `AMAP_WEB_KEY`。  
仅有 Web 端 Key 时，附近推荐会退回演示数据。

## 能力

- 全屏摄像头；按住说话（Web Speech）或多轮文字输入
- 每轮自动抓帧，结合对话历史与 GPS
- 多模型：通义千问（DashScope）/ 豆包（火山方舟）/ Gemini / OpenAI
- 高德周边搜索（50m）；扫街榜实时人数目前**无公开 API**，使用热度适配层/演示数据
- 「我的身份」：上传人脸 + 职业，开启可发现后，他人可问「这是谁」

## 本地运行

```bash
cd vision-assistant
cp .env.example .env.local
# 推荐国内：DASHSCOPE_API_KEY + QWEN_MODEL=qwen-vl-plus
# 或豆包：ARK_API_KEY + DOUBAO_MODEL=ep-xxxx
npm install
npm run dev
```

手机访问电脑局域网 IP 的 `http://host:3000`。**摄像头通常要求 HTTPS**；公网部署后更稳。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `AI_PROVIDER` | `qwen` / `doubao` / `gemini` / `openai`；不填则自动选择 |
| `DASHSCOPE_API_KEY` | 通义千问 DashScope Key |
| `QWEN_MODEL` | 默认 `qwen-vl-plus`（视觉） |
| `ARK_API_KEY` | 豆包 / 火山方舟 Key |
| `DOUBAO_MODEL` | 方舟接入点 ID，如 `ep-xxxx` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| `OPENAI_API_KEY` | OpenAI |
| `AMAP_WEB_KEY` | 高德 Web 服务 Key；缺省用演示 POI |

自动优先级：**通义 > 豆包 > Gemini > OpenAI**。

## 扫街榜说明

高德「扫街榜」与店内实时人数目前不是开放平台标准能力。本项目预留 `scanstreet-adapter`，现用周边搜索 + 评分衍生热度估算，拿到商务接口后可替换 `src/lib/amap.ts`。

## 部署到 Vercel（获得稳定公网链接）

### 在 Cursor 里授权 Vercel MCP（推荐）
1. 打开 Cursor Desktop → **Settings → MCP**
2. 找到 **Vercel**，状态若为 needsAuth / Connect，点击 **Authenticate / Connect**
3. 浏览器完成 Vercel 账号登录与授权
4. 回来后告诉 Agent「已授权 Vercel」，即可代为 `vercel link` + 部署并写入环境变量

### 或给你自己的 Token
1. 打开 https://vercel.com/account/tokens 创建 Token
2. 在对话里私密提供（或加入 Cursor Cloud Environment secrets）
3. Agent 可用 `vercel --token ...` 部署 `vision-assistant/`

需要写入的环境变量（按你选的模型）：
- `DASHSCOPE_API_KEY` + `QWEN_MODEL=qwen-vl-plus`，或
- `ARK_API_KEY` + `DOUBAO_MODEL=ep-xxxx`，或
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `AMAP_WEB_KEY`（必须是 Web 服务类型）
