# 阿里云域名 + 国内服务器（免 VPN）部署指南

可以。把站点从 **Vercel（海外）** 迁到 **阿里云中国区机器 + 你的域名**，豆包/高德都能直连，一般就不用挂 VPN 了。

> 手机摄像头需要 **HTTPS**。下面方案用 Caddy 自动申请证书。

## 你需要准备

1. **阿里云域名**（已申请）
2. **一台国内服务器**（推荐「轻量应用服务器」或 ECS，地域选离你近的，如华北/华东）
   - 系统：Ubuntu 22.04
   - 建议配置：2 核 2G 及以上
3. **安全组/防火墙**放行：`22`（SSH）、`80`、`443`
4. 仍使用现有 Key：
   - `ARK_API_KEY`（豆包）
   - `DOUBAO_MODEL=doubao-seed-2-0-lite-260428`
   - `AMAP_WEB_KEY`（高德 **Web服务** Key）

### 关于备案（重要）

| 情况 | 说明 |
| --- | --- |
| 域名要指到**中国内地** ECS | 通常需要 **ICP 备案** 完成才能用 80/443 对外提供网站 |
| 还没备案 | 可选：先用 **香港地域** ECS（一般免备案，多数国内网络可直连，偶发卡顿） |
| 已备案 | 直接用内地节点，体验最好 |

## 10 分钟上线步骤

### 1. 买/打开轻量应用服务器

阿里云控制台 → 轻量应用服务器 → 创建实例（Ubuntu）。

记下：**公网 IP**。

### 2. 域名解析

域名控制台 → 解析设置：

- 类型：`A`
- 主机记录：`@` 或 `www` / `lanjie`（你想用的前缀）
- 记录值：服务器公网 IP

例如最终访问：`https://lanjie.你的域名.com`

### 3. 上传代码并配置

SSH 登录服务器后：

```bash
# 安装 git（若没有）
sudo apt update && sudo apt install -y git

# 拉取代码（把仓库地址换成你的）
git clone https://github.com/DaveleeX/BATCH-Render.git
cd BATCH-Render/vision-assistant

cp .env.example .env
nano .env
```

`.env` 最少填写：

```env
AI_PROVIDER=doubao
ARK_API_KEY=你的豆包Key
DOUBAO_MODEL=doubao-seed-2-0-lite-260428
AMAP_WEB_KEY=你的高德Web服务Key
```

### 4. 一键部署

```bash
chmod +x deploy/aliyun/deploy.sh
sudo ./deploy/aliyun/deploy.sh lanjie.你的域名.com
```

脚本会：

- 安装 Docker（如需要）
- 构建 Next.js 镜像
- 用 **Caddy** 反代并自动签发 HTTPS 证书

### 5. 验证

- 打开 `https://你的域名/api/health`
- 应看到 `"provider":"doubao"`
- 手机 Safari/Chrome 打开域名，点「开启摄像头」

## 我可以代你部署吗？

可以。把下面信息发我即可继续：

1. **完整域名**（例如 `lanjie.xxx.com`）
2. 服务器 **公网 IP**
3. SSH 登录方式（密码或私钥；建议临时账号）
4. 域名是否 **已备案**（是/否；否的话服务器是否在香港区）

我拿到后会把服务拉起来，并把健康检查地址发你。

## 和 Vercel 的关系

- 迁到阿里云后，**不必再依赖 Vercel**
- Vercel 链接可保留作海外备份，也可之后下线

## 常见问题

**Q: 只有域名，没有服务器？**  
需要再买一台轻量/ECS。域名本身不能跑 Next.js 后端。

**Q: 必须备案吗？**  
指内地服务器：要。香港服务器：通常不要，但请确认你的业务合规需求。

**Q: 摄像头仍黑屏？**  
必须是 `https://` 打开；系统浏览器授权相机；不要用微信内置浏览器优先测试。
