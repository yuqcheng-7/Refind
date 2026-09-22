# 托管 platform-parser（阿里云轻量 · 香港）

> 目标：公网提供 `/health` `/parse` `/login*`，供 `www.refind.cloud` 使用。  
> 当前机器示例：`47.243.250.188`（中国香港 · Ubuntu 24.04 · 2c2G）  
> 建议域名：`parser.refind.cloud` → 该公网 IP（Cloudflare DNS，可先灰云再开橙云）

## 0. 控制台（你先做）

1. 轻量服务器 → 防火墙：放行 **22 / 80 / 443 / 8787**（TCP）
2. **设置密码**，并能「远程连接」登录
3. Cloudflare → `refind.cloud` → DNS：加 **A 记录**  
   - 名称：`parser`  
   - IPv4：`47.243.250.188`  
   - 代理：先 **仅 DNS（灰云）**，通了再改橙云

## 1. 机器上安装（SSH 登录后执行）

```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git

# 代码：用 git clone 你的仓库，或 scp 上传 tools/platform-parser
cd ~
git clone https://github.com/yuqcheng-7/Refind.git
cd Refind/tools/platform-parser

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m playwright install --with-deps chromium

# MediaCrawler（可选，推荐）
# ../MediaCrawler 若在仓库 submodule：按 setup_medicrawler.sh
```

## 2. 后台常驻（systemd）

```bash
sudo tee /etc/systemd/system/refind-parser.service >/dev/null <<'EOF'
[Unit]
Description=Refind platform-parser
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/Refind/tools/platform-parser
Environment=PLATFORM_PARSER_HOST=0.0.0.0
Environment=PLATFORM_PARSER_PORT=8787
ExecStart=/root/Refind/tools/platform-parser/.venv/bin/python3 server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now refind-parser
sudo systemctl status refind-parser --no-pager
```

探测：

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS http://47.243.250.188:8787/health
```

## 3. 前端环境变量（Cloudflare Pages）

Production：

- `VITE_PLATFORM_PARSER_URL=https://parser.refind.cloud`  
  （若暂时只有 IP：`http://47.243.250.188:8787`，仅联调用；上线应用 HTTPS）

重新部署 Pages。

## 4. 网页扫码（产品改造 · 进行中）

本机弹窗登录**不能**给外网用户用。下一步要把二维码展示到 `www.refind.cloud` 设置页。  
在改造完成前：即使 parser 已公网，外网用户点「连接」仍可能看不到扫码窗。

## 5. 安全提醒

- 8787 公网裸奔有被刷风险；上线后应加简单鉴权 / 仅允许来自网站的 Origin，或经 Cloudflare 反代 443。
- 勿把 SSH 密码发到聊天里；IP 可发。
