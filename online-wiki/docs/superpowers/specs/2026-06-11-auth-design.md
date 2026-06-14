# Wiki Web 密码认证设计文档

## 背景

Wiki Web 界面目前完全公开，任何人都可以读取和修改内容。需要加一个简单的固定密码保护，阻止外部人员访问。

## 目标

- 访问 `http://124.71.66.20/` 时显示登录页，输入正确密码后进入
- 密码错误则拒绝访问
- 登录状态持久化（关闭浏览器再打开不需要重新登录，7天有效）
- 密码可通过服务器环境变量修改，无需改代码

## 架构

### 后端改动（wiki-server）

**修改 `src/routes/auth.ts`：**
- 移除原有的多用户邮箱/密码逻辑
- 改为单一密码校验：`POST /auth/login` 接收 `{ password: string }`
- 与环境变量 `WIKI_PASSWORD` 对比，匹配则用 `signToken` 签发 JWT（有效期 7 天）
- 不匹配返回 `401 { error: '密码错误' }`

**修改 `src/index.ts`：**
- `/api/wiki` 路由恢复 `requireAuth` 中间件（从 Task 1 的公开改回需要认证）

**环境变量：**
- 云服务器 `/root/wiki-server/.env` 新增 `WIKI_PASSWORD=123456`

### 前端改动（wiki-web）

**新增 `src/stores/auth-store.ts`：**
- 用 Zustand 管理认证状态
- `token: string | null`，初始值从 `localStorage.getItem('wiki_token')` 读取
- `login(password)` → 调用 `POST http://124.71.66.20:3000/auth/login`，成功后存 token 到 `localStorage`
- `logout()` → 清除 token

**新增 `src/api/auth-api.ts`：**
- `loginWithPassword(password)` → `POST /auth/login`，返回 token

**修改 `src/api/wiki-api.ts` 和 `src/api/graph-api.ts`：**
- 所有 fetch 请求加上 `Authorization: Bearer <token>` header
- token 从 `auth-store` 读取

**新增 `src/components/auth/login-page.tsx`：**
- 居中密码输入框 + 登录按钮
- 输入错误显示"密码错误"提示
- 登录成功后 auth-store 里 token 有值，App.tsx 自动切换到主界面

**修改 `src/App.tsx`：**
- 读取 `auth-store` 的 token
- token 为 null → 显示 `<LoginPage />`
- token 有值 → 显示正常界面

## 文件清单

**后端（wiki-server）：**
- Modify: `src/routes/auth.ts`
- Modify: `src/index.ts`
- Modify: `.env`（云服务器上）

**前端（wiki-web）：**
- Create: `src/api/auth-api.ts`
- Create: `src/stores/auth-store.ts`
- Create: `src/components/auth/login-page.tsx`
- Modify: `src/api/wiki-api.ts`
- Modify: `src/api/graph-api.ts`
- Modify: `src/App.tsx`

## 部署

1. 后端改动编译后同步到服务器，重建 Docker 镜像重启
2. 前端 `npm run build` 后上传 `dist/` 覆盖服务器 `wiki-web-dist/`
3. nginx 无需改动
