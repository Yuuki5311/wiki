# 同步到服务器

## 第一步：同步代码

```bash
rsync -avz --exclude='node_modules' --exclude='dist' --exclude='.env' --exclude='.env.*' /Users/l/Desktop/wiki/online-wiki/wiki-server/ root@124.71.66.20:/root/wiki-server/
```

密码：`p6LyzXRSnwMvMM8OQo6`

## 第二步：SSH 登录服务器

```bash
ssh root@124.71.66.20
```

密码：`p6LyzXRSnwMvMM8OQo6`

## 第三步：重新构建并启动容器

```bash
cd /root/wiki-server && docker compose up --build -d
```

## 第四步：验证服务正常

```bash
curl http://localhost:3000/health
```
出现
Expected: `{"status":"ok"}`

