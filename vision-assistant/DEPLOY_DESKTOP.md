# 用自己的台式机当服务器（测 Demo）

域名先不用管，电脑能跑起来、手机能打开页面最重要。

## 方案怎么选

| 场景 | 做法 | 摄像头 |
| --- | --- | --- |
| 手机和电脑同一 WiFi，先跑通 | 本机启动，手机访问 `http://192.168.x.x:3000` | 部分手机会拦（非 HTTPS） |
| 想外网 / HTTPS / 绑 daveleex.top | 本机启动 + **cpolar 内网穿透**（国内好用） | ✅ |
| 以后正式上线 | 再换香港轻量服务器 | ✅ |

测 Demo 推荐：**本机 Docker/Node + cpolar**。

---

## 一、电脑上启动览界

### 1. 安装其一
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)（推荐），或
- [Node.js 22+](https://nodejs.org/)

### 2. 拿到代码
把仓库放到电脑，进入：

```text
BATCH-Render/vision-assistant
```

### 3. 填写密钥
复制 `.env.example` → `.env`，最少填：

```env
AI_PROVIDER=doubao
ARK_API_KEY=你的豆包Key
DOUBAO_MODEL=doubao-seed-2-0-lite-260428
AMAP_WEB_KEY=你的高德Web服务Key
```

### 4. 启动

**Windows：** 双击

```text
deploy\desktop\start-windows.bat
```

**Mac / Linux：**

```bash
chmod +x deploy/desktop/start-mac-linux.sh
./deploy/desktop/start-mac-linux.sh
```

本机打开：http://127.0.0.1:3000  
健康检查：http://127.0.0.1:3000/api/health  
应看到 `"provider":"doubao"`

### 5. 查电脑局域网 IP（同一 WiFi 手机访问）

**Windows PowerShell：**

```powershell
ipconfig | findstr IPv4
```

**Mac：**

```bash
ipconfig getifaddr en0
```

手机浏览器打开：`http://192.168.x.x:3000`  
（电脑防火墙需允许 3000 端口）

> 若手机打不开摄像头：正常，因为不是 HTTPS。继续看第二节。

---

## 二、国内免 VPN + HTTPS（推荐 cpolar）

1. 注册并安装 [cpolar](https://www.cpolar.com/)（国内内网穿透）
2. 电脑上览界已在 `3000` 端口运行
3. cpolar 建立隧道，指向 `127.0.0.1:3000`
4. 会得到一个 `https://xxxx.cpolar.cn` 公网地址  
   - 国内一般 **不用挂 VPN**
   - 自带 HTTPS，手机摄像头可用

### 可选：绑到 daveleex.top

在 cpolar 控制台把自定义域名指到隧道（按 cpolar 文档做 CNAME/A）。  
或等你有固定公网 IP/云服务器后再把 `daveleex.top` A 记录指过去。

---

## 三、防火墙（Windows）

若手机同一 WiFi 访问不了，管理员 PowerShell：

```powershell
New-NetFirewallRule -DisplayName "Lanjie 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## 四、你现在只要做

1. 台式机启动服务（上面第一节）
2. 本机打开 `/api/health` 确认豆包是 live
3. 需要手机摄像头时，装 cpolar 开一条 HTTPS 隧道

如果你愿意，下一步可以把：
- 系统是 Windows 还是 Mac
- 本机 `http://127.0.0.1:3000/api/health` 返回内容

发我，我按你的环境往下盯。
