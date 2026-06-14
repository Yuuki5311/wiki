# Local Dev Setup (Infra in Docker, App on Host) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `.env` 配置问题，使三个基础设施服务（MinIO/Qdrant/Redis）通过 Docker 运行，server 和 worker 在本机用 `npm run dev` / `npm run worker` 分两个终端启动。

**Architecture:** 现有 `docker-compose.yml` 已只含基础设施，无需改动。只需修复 `.env` 中的两处问题：`DEEPSEEK_API_KEY` 前导空格导致 API 调用 401，以及显式补充 `REDIS_URL`（虽有代码默认值，但显式声明更可维护）。

**Tech Stack:** Docker Compose, Node.js/TypeScript, MinIO, Qdrant, Redis, DeepSeek API, Ollama

---

### Task 1: 修复 `.env` 文件

**Files:**
- Modify: `wiki-server/.env`

- [ ] **Step 1: 修复 DEEPSEEK_API_KEY 前导空格**

将：
```
DEEPSEEK_API_KEY= sk-e686b61052044ea8aeb993106d67519a
```
改为：
```
DEEPSEEK_API_KEY=sk-e686b61052044ea8aeb993106d67519a
```

- [ ] **Step 2: 补充显式 REDIS_URL**

在 Redis 相关配置区域（文件末尾 `# ── 其他` 前）添加：
```
# ── Redis ────────────────────────────────────────
REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3: 验证文件无误**

```bash
grep "DEEPSEEK_API_KEY" wiki-server/.env
grep "REDIS_URL" wiki-server/.env
```

Expected：
```
DEEPSEEK_API_KEY=sk-e686b61052044ea8aeb993106d67519a
REDIS_URL=redis://localhost:6379
```
注意：`DEEPSEEK_API_KEY=` 后面紧跟 key，无空格。

---

### Task 2: 启动基础设施并验证

**Files:** 无代码改动

- [ ] **Step 1: 拉起三个容器**

```bash
cd wiki-server
docker compose up -d
```

Expected 输出（每个容器 Started 或 Running）：
```
✔ Container wiki-server-redis-1   Started
✔ Container wiki-server-minio-1   Started
✔ Container wiki-server-qdrant-1  Started
✔ Container wiki-server-minio-init-1  Started
```

- [ ] **Step 2: 验证容器健康**

```bash
docker compose ps
```

Expected：minio、qdrant、redis 三个容器 Status 均为 `running`（minio-init 会自动退出，状态为 `exited 0`，正常）。

- [ ] **Step 3: 验证 MinIO bucket 已创建**

```bash
docker compose logs minio-init
```

Expected 包含：
```
Bucket created successfully `local/wiki-storage`.
```
或 `Bucket `local/wiki-storage` already exists.`

---

### Task 3: 启动本机服务并验证

**Files:** 无代码改动

- [ ] **Step 1: 确认 Ollama 已运行并有 nomic-embed-text 模型**

```bash
curl http://localhost:11434/api/tags
```

Expected：JSON 响应中包含 `nomic-embed-text`。若无，先执行 `ollama pull nomic-embed-text`。

- [ ] **Step 2: 终端 1 — 启动 HTTP 服务**

```bash
cd wiki-server
npm run dev
```

Expected：
```
服务启动: http://localhost:3000
WebSocket: ws://localhost:3000/ws/chat?token=<jwt>
MCP: http://localhost:3000/mcp  (X-API-Key)
```

- [ ] **Step 3: 终端 2 — 启动 Worker**

```bash
cd wiki-server
npm run worker
```

Expected：
```
[worker] 启动，等待任务...
```

- [ ] **Step 4: 验证 health endpoint**

```bash
curl http://localhost:3000/health
```

Expected：
```json
{"status":"ok"}
```

---
