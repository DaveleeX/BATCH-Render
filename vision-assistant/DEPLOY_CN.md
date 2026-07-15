# 国内免 VPN 使用说明

## 为什么现在必须挂 VPN？

当前公网地址是 **Vercel（海外）**：
`https://vision-assistant.vercel.app`

浏览器要先下载网页 / JS，这个域名在大陆经常打不开。  
即便后端用的是 **豆包 + 高德**（都是国内服务），**页面本身出不来**，整站就用不了。

另外旧版还加载了 Google Fonts，国内也会卡住。现已改为系统中文字体，不再请求 Google。

## 正确做法：把站点也放到国内

只要网页托管在国内云（或已备案域名反代到国内机器），再配合豆包/高德，就可以免 VPN。

### 推荐部署位置（任选）

1. **火山引擎**（和豆包同一家，最顺）
2. **阿里云** 容器服务 / 函数计算 / ECS
3. **腾讯云** 云托管 / CFS / 轻量应用服务器

### 一键 Docker（任意国内机器）

```bash
cd vision-assistant
cp .env.example .env
# 填写：
# AI_PROVIDER=doubao
# ARK_API_KEY=你的ark密钥
# DOUBAO_MODEL=ep-你的接入点
# AMAP_WEB_KEY=高德Web服务Key

docker compose up -d --build
```

浏览器访问：`http://服务器公网IP:3000`  
摄像头需要 **HTTPS**，所以生产请绑域名并开免费证书（阿里云/腾讯云都可一键申请）。

### 环境变量（国内最小集）

| 变量 | 说明 |
| --- | --- |
| `AI_PROVIDER=doubao` | 强制豆包 |
| `ARK_API_KEY` | 火山方舟 API Key |
| `DOUBAO_MODEL` | 接入点 `ep-xxxx` 或已开通模型 ID |
| `AMAP_WEB_KEY` | 高德 **Web服务** Key |

不要再依赖 Gemini / OpenAI / Vercel，即可纯国内链路。

### 域名与摄像头

手机摄像头在多数浏览器要求：

1. **HTTPS**（或 localhost）
2. 用户手动授权

建议：

- 买一个国内可备案域名（若用大陆服务器）
- 证书用 Let's Encrypt / 云厂商免费证书
- 解析到上述容器的 443

### 临时对比

| 方式 | 国内免 VPN |
| --- | --- |
| Vercel 现址 | ❌ 通常不行 |
| 国内 ECS + Docker | ✅ |
| 火山引擎容器 | ✅ |
| 仅换豆包/高德 Key 但仍用 Vercel | ❌ 网页仍可能打不开 |

把国内服务器的 IP / 登录方式（或火山引擎部署权限）发我后，我可以继续帮你把镜像发布上去。
