# 服务器部署设计

**目标：** 将 online-wiki/wiki-server 部署到 Ubuntu 24.04 服务器（124.71.66.20，2核2G），全部服务用 Docker Compose 管理。

**架构：** 5 个容器共用一个 Docker 内部网络，对外只暴露 :3000（API）和可选的 :9001（MinIO 控制台）。Embedding 使用 DeepSeek API，不在服务器上运行 Ollama。

---

## 容器清单

| 容器 | 镜像 | 对外端口 | 说明 |
|------|------|----------|------|
| minio | minio/minio | 9000, 9001 | 文件存储 |
| minio-init | minio/mc | - | 创建 bucket，运行后退出 |
| qdrant | qdrant/qdrant | - | 向量数据库（内网） |
| redis | redis:7-alpine | - | 队列与分布式锁（内网） |
| wiki-server | 本地构建 | 3000 | HTTP API + WebSocket |
| wiki-worker | 本地构建（同镜像） | - | 后台 ingest worker |

## 镜像构建

生产 Dockerfile（多阶段）：

- Stage 1（builder）：安装全部依赖，`npm run build` 编译 TypeScript 到 `dist/`
- Stage 2（runtime）：仅安装 production 依赖，复制 `dist/`，`node dist/index.js` 启动

wiki-worker 复用同一镜像，docker-compose 里用不同 `command` 覆盖（`node dist/queue/worker.js`）。

## 环境变量（服务器）

相对本地开发的主要变化：

| 变量 | 本地值 | 服务器值 |
|------|--------|----------|
| S3_ENDPOINT | http://localhost:9000 | http://minio:9000 |
| QDRANT_URL | http://localhost:6333 | http://qdrant:6333 |
| REDIS_URL | redis://localhost:6379 | redis://redis:6379 |
| EMBEDDING_BASE_URL | http://localhost:11434 | https://api.deepseek.com |
| EMBEDDING_MODEL | nomic-embed-text | deepseek-embedding-2 |
| OPENAI_API_KEY | ollama | （DeepSeek API Key） |

服务器专用配置保存在 `wiki-server/.env.server`，不提交到版本控制。

## 代码传输

本机用 rsync 将 `wiki-server/` 同步到服务器，排除 `node_modules/`、`dist/`、`.env`。

## 部署流程

1. 服务器安装 Docker 和 Docker Compose
2. rsync 同步代码
3. 上传 `.env.server` 到服务器，重命名为 `.env`
4. `docker compose up --build -d`
5. 验证 `curl http://124.71.66.20:3000/health`

## 安全考量

- Qdrant（:6333）和 Redis（:6379）不对外暴露，仅 Docker 内网访问
- MinIO :9000 不对外暴露；:9001 控制台按需开放
- `.env.server` 含密钥，不进版本控制
- 生产环境应修改 `JWT_SECRET` 和 `WIKI_MCP_API_KEY`
