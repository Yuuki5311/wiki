# 服务器部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 wiki-server 完整部署到 Ubuntu 24.04 服务器（124.71.66.20），全部服务用 Docker Compose 管理，对外暴露 :3000。

**Architecture:** 新建生产 Dockerfile（多阶段构建，编译 TS 后只保留 dist/），扩展 docker-compose.yml 加入 wiki-server 和 wiki-worker 服务，Embedding 改用 SiliconFlow BAAI/bge-large-zh-v1.5，LLM 继续用 DeepSeek。代码用 rsync 同步到服务器，服务器上 docker compose up --build -d 启动。

**Tech Stack:** Docker, Docker Compose, Node.js 20, TypeScript, SiliconFlow API, DeepSeek API

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `wiki-server/Dockerfile` | 新建（生产多阶段构建） |
| `wiki-server/docker-compose.yml` | 修改（加入 server/worker，调整端口暴露） |
| `wiki-server/.env.server` | 新建（服务器专用环境变量，不提交） |
| `wiki-server/.gitignore` 或 `.dockerignore` | 新建（排除 node_modules/dist/.env） |

---

### Task 1: 新建生产 Dockerfile

**Files:**
- Create: `wiki-server/Dockerfile`
- Create: `wiki-server/.dockerignore`

- [ ] **Step 1: 新建 `.dockerignore`**

```
node_modules
dist
.env
.env.*
```

- [ ] **Step 2: 新建 `wiki-server/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: 验证本地能构建成功**

```bash
cd wiki-server
docker build -t wiki-server:test .
```

Expected：最后一行显示 `Successfully built` 或 `writing image sha256:...`，无报错。

---

### Task 2: 扩展 docker-compose.yml 加入 server 和 worker

**Files:**
- Modify: `wiki-server/docker-compose.yml`

- [ ] **Step 1: 将 `docker-compose.yml` 替换为以下内容**

```yaml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/wiki-storage
      "

  qdrant:
    image: qdrant/qdrant
    volumes:
      - qdrant-data:/qdrant/storage

  redis:
    image: redis:7-alpine

  wiki-server:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      minio:
        condition: service_healthy
      qdrant:
        condition: service_started
      redis:
        condition: service_started
    restart: unless-stopped

  wiki-worker:
    build: .
    command: node dist/queue/worker.js
    env_file: .env
    depends_on:
      minio:
        condition: service_healthy
      qdrant:
        condition: service_started
      redis:
        condition: service_started
    restart: unless-stopped

volumes:
  minio-data:
  qdrant-data:
```

注意：MinIO :9000 不再对外暴露（只在内网），Qdrant :6333 和 Redis :6379 同样不暴露。

- [ ] **Step 2: 验证 docker-compose 语法**

```bash
cd wiki-server
docker compose config --quiet
```

Expected：无报错输出。

---

### Task 3: 新建服务器专用 .env.server

**Files:**
- Create: `wiki-server/.env.server`

- [ ] **Step 1: 新建 `wiki-server/.env.server`**

```bash
# ── 存储 ────────────────────────────────────────
STORAGE_BACKEND=s3
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=wiki-storage

# ── 向量数据库 ────────────────────────────────────
QDRANT_URL=http://qdrant:6333

# ── LLM ─────────────────────────────────────────
DEEPSEEK_API_KEY=sk-e686b61052044ea8aeb993106d67519a
LLM_MODEL=deepseek-v4-flash

# ── Embedding（SiliconFlow） ───────────────────────
OPENAI_API_KEY=sk-bodjpqmmnvnnoljqrtalabugtvubknzmedzyzzgpgnhwcgeh
EMBEDDING_BASE_URL=https://api.siliconflow.cn
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5

# ── 认证 ─────────────────────────────────────────
JWT_SECRET=da68afc4cc6b350d85b2c2f88257dd0d61424933787d7f7319d64f45ad66b9a7
WIKI_MCP_API_KEY=wk_d10038af87fb98523001c2aed5d07750

# ── Redis ─────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── 其他 ─────────────────────────────────────────
PORT=3000
ALLOWED_ORIGIN=*
```

- [ ] **Step 2: 确认 .env.server 不会被提交**

检查 `wiki-server/` 目录下是否有 `.gitignore`，如果没有则新建，确保包含：

```
.env
.env.*
node_modules/
dist/
```

---

### Task 4: 在服务器上安装 Docker

**Files:** 无代码变更

- [ ] **Step 1: SSH 登录服务器**

```bash
ssh root@124.71.66.20
# 密码: p6LyzXRSnwMvMM8OQo6
```

- [ ] **Step 2: 安装 Docker**

```bash
curl -fsSL https://get.docker.com | sh
```

Expected：最后输出 `Docker version xx.xx.xx` 类似内容。

- [ ] **Step 3: 验证 Docker 安装成功**

```bash
docker --version
docker compose version
```

Expected：
```
Docker version 27.x.x, build ...
Docker Compose version v2.x.x
```

---

### Task 5: 同步代码到服务器并部署

**Files:** 无代码变更

- [ ] **Step 1: 在本机，将 .env.server 复制为服务器部署用的 .env**

在本机执行（不要覆盖本地 .env）：

```bash
# 直接 scp 上传，在服务器上命名为 .env
scp wiki-server/.env.server root@124.71.66.20:/root/wiki-server/.env
```

- [ ] **Step 2: 用 rsync 同步代码（排除无关文件）**

```bash
rsync -avz --exclude='node_modules' --exclude='dist' --exclude='.env' --exclude='.env.*' \
  wiki-server/ root@124.71.66.20:/root/wiki-server/
```

Expected：显示传输的文件列表，最后 `sent xxx bytes`。

- [ ] **Step 3: SSH 到服务器，构建并启动**

```bash
ssh root@124.71.66.20
cd /root/wiki-server
docker compose up --build -d
```

Expected：6 个服务依次 Started（minio-init 会自动退出，状态 exited 0 正常）。

- [ ] **Step 4: 验证所有容器正常运行**

```bash
docker compose ps
```

Expected：wiki-server、wiki-worker、minio、qdrant、redis 均为 `running`。

- [ ] **Step 5: 验证 health endpoint**

```bash
curl http://localhost:3000/health
```

Expected：
```json
{"status":"ok"}
```

- [ ] **Step 6: 从本机外网验证**

在本机终端执行：

```bash
curl http://124.71.66.20:3000/health
```

Expected：
```json
{"status":"ok"}
```

---

### Task 6: 端到端验证（Ingest + 搜索）

**Files:** 无代码变更

- [ ] **Step 1: 登录拿 Token**

```bash
TOKEN=$(curl -s -X POST http://124.71.66.20:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"demo-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo $TOKEN
```

Expected：输出 JWT token 字符串。

- [ ] **Step 2: 提交 Ingest 任务**

```bash
JOB=$(curl -s -X POST http://124.71.66.20:3000/api/wiki/my-wiki/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceFileName":"deploy-test.md","sourceContent":"# 部署测试\n\n这是服务器部署后的第一次测试文档。\n\n## 功能验证\n\n确认 ingest、向量存储、搜索全链路正常工作。","sourceMimeType":"text/plain"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
echo "JOB: $JOB"
```

- [ ] **Step 3: 轮询任务状态直到完成**

```bash
for i in $(seq 1 24); do
  STATUS=$(curl -s "http://124.71.66.20:3000/api/wiki/my-wiki/jobs/$JOB" \
    -H "Authorization: Bearer $TOKEN")
  echo "[$i] $STATUS"
  echo $STATUS | python3 -c "import sys,json; s=json.load(sys.stdin); exit(0 if s['status'] in ('done','error') else 1)" 2>/dev/null && break
  sleep 5
done
```

Expected：最终看到 `"status":"done","pagesWritten":[...]`。

- [ ] **Step 4: 验证搜索**

```bash
curl -s "http://124.71.66.20:3000/api/wiki/my-wiki/search?q=%E9%83%A8%E7%BD%B2%E6%B5%8B%E8%AF%95" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected：返回包含相关页面的 results 数组，score > 0。
