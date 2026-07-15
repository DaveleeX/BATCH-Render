# 阿里云域名 + 国内/香港服务器（免 VPN）部署指南

当前项目域名：**daveleex.top**

> 只做测试 Demo：建议用 **香港轻量应用服务器**（通常免备案）。  
> 不要先走内地备案，费时且对 Demo 不必要。

## 你现在缺的只有「一台服务器」

域名 `daveleex.top` 已经够用。还需要：

1. 阿里云 **轻量应用服务器（香港）**
2. 把域名 **A 记录** 指到服务器公网 IP
3. 把 IP + SSH 密码发我（或你自己跑部署脚本）

## 最短路径（推荐）

### 1. 开通香港轻量

阿里云控制台 → **轻量应用服务器** → 创建实例：

- 地域：**香港**
- 镜像：**Ubuntu 22.04**
- 套餐：最便宜的测 Demo 即可（约 2核2G）

创建后在实例页能看到：

- **公网 IP** ← 这就是「在哪里获得」
- **重置密码** ← SSH 密码在这里设，设完就能连

本机连接：

```bash
ssh root@你的公网IP
```

### 2. 域名解析（daveleex.top）

阿里云 → **域名** → `daveleex.top` → **解析设置** → 添加：

| 类型 | 主机记录 | 记录值 |
| --- | --- | --- |
| A | `@` | 服务器公网 IP |
| A | `www` | 服务器公网 IP |

（可先只加 `@`）

### 3. 安全组

轻量实例防火墙 / 安全组放行：**22、80、443**

### 4. 部署

把下面两项发我，我可以继续代你部署：

1. 公网 IP  
2. SSH 密码（或密钥）

或你自己在服务器执行：

```bash
git clone https://github.com/DaveleeX/BATCH-Render.git
cd BATCH-Render/vision-assistant
cp .env.example .env
# 编辑 .env：填入豆包 ARK_API_KEY、DOUBAO_MODEL、高德 AMAP_WEB_KEY
chmod +x deploy/aliyun/deploy.sh
sudo ./deploy/aliyun/deploy.sh daveleex.top
```

完成后访问：

- https://daveleex.top  
- https://daveleex.top/api/health

## 备案还要钱吗？

- **测 Demo：不必备案**（用香港节点）
- 备案本身通常不向工信部另收费，但内地网站上线要材料+等待，不适合现在

## 和之前的 onaliyun.com

`*.onaliyun.com` 是平台默认测试域，可以忽略。  
正式测就用你的 **daveleex.top**。
