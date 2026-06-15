---
title: 图谱边权重系统设计（子项目 1）
date: 2026-06-15
status: approved
---

# 图谱边权重系统设计

## 背景与目标

当前图谱的边只有 `source`/`target`/`relation`/`sourceType` 四个字段，边与边之间没有强弱之分。索引页（"知识库1.0索引"）虽然以表格形式列出了其他页面的标题，但由于不包含标准 Markdown 链接，`link-extractor` 无法识别，导致该页孤立无连接。

本设计目标：
1. 支持 `[[wikilink]]` 语法，使 `[[标题]]` / `[[路径]]` 格式的内链被正确解析为图谱边
2. 引入 4 信号权重模型，量化两节点间的关联强度
3. 权重用于后续的阈值过滤、排序优先级和搜索上下文截断（子项目 2）

本文档覆盖子项目 1：边数据结构、wikilink 解析、权重计算、集成方式。

---

## 1. 数据结构变更

### `GraphEdge`（`graph-store.ts`）

```typescript
export interface GraphEdge {
  source: string
  target: string
  relation: string
  sourceType: 'llm' | 'link'
  weight?: number        // 新增：关联强度，undefined 表示未计算
}
```

`weight` 为可选字段，向后兼容——历史数据中没有该字段的边仍可正常读取和显示。

`WikiGraph` / `GraphNode` / `GraphStore` 接口不变。

---

## 2. `[[wikilink]]` 解析

### 语法支持

| 写法 | 含义 |
|------|------|
| `[[标题]]` | 按标题匹配 |
| `[[wiki/path/page.md]]` | 按路径匹配 |
| `[[目标\|别名]]` | 带显示别名，目标部分同上 |

### 实现位置

扩展 `graph/link-extractor.ts`，在现有 Markdown 链接正则之后，新增 wikilink 正则：

```typescript
const WIKI_LINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
```

提取 target 部分后，调用 `resolveTarget(target, knownPages)`。

### `resolveTarget(target, knownPages)`

```typescript
function resolveTarget(target: string, knownPages: string[]): string | null
```

匹配策略（按顺序）：

1. **路径精确匹配**：`target` 在 `knownPages` 中直接存在 → 返回 target
2. **标题归一化匹配**：`normalize(target)` 与 `normalize(page 的文件名去扩展名)` 相等 → 返回该页路径
   - `normalize(s) = s.toLowerCase().replace(/[\s\-_]/g, '')`
3. 无匹配 → 返回 `null`，该 wikilink 被静默丢弃（不报错）

`knownPages` 从 `graph-extraction-handler.ts` 中已有的 `wikiStore.listPages()` 调用获取，无需额外 I/O。

---

## 3. 权重计算

### 模块：`graph/graph-relevance.ts`（新文件）

```typescript
export async function computePageWeights(
  wikiId: string,
  pageId: string,
  edges: GraphEdge[],
  graph: WikiGraph,
  store: WikiStore,
): Promise<GraphEdge[]>
```

只重算涉及当前 `pageId` 的边，不触碰全图其他边。

### 4 信号模型

**信号 1：直接链接（×3.0）**

- 检查 `edges` 中是否存在 `source=A→target=B` 的 link 类型边
- A→B 单向：+3.0
- B→A 也存在（即 graph 中已有该方向边）：额外 +3.0（双向最高 +6.0）

**信号 2：共享原文件（×4.0）**

- 读取当前页 frontmatter 中的 `source_file` 字段
- 读取目标页 frontmatter 中的 `source_file` 字段
- 每个共同的 `source_file` 值贡献 +4.0

frontmatter 通过 `store.readPage(wikiId, pageId)` 获取，解析 `---` 块中的 `source_file: xxx` 行。

**信号 3：Adamic-Adar（×1.5）**

- 找出 A 和 B 的公共邻居集合 `C`
- 每个公共邻居 `c` 贡献 `1 / log(degree(c))`（degree = 节点在图中的总出度+入度）
- 总贡献 × 1.5

**信号 4：类型亲和（×1.0）**

- 当前版本节点无类型字段，固定贡献 +1.0（作为基础分，确保所有边至少有最小权重）
- 待后续引入节点 `type` 字段后按类型矩阵调整

### 最终 weight

```
weight = signal1 + signal2 + signal3 + signal4
```

写回对应 edge 的 `weight` 字段。

---

## 4. 集成（`graph-extraction-handler.ts`）

处理链变更如下：

```
现有：
  extractLinks() + extractRelations() → updatePageInGraph()

改造后：
  extractLinks()      ← 新增 [[wikilink]] 解析
  extractRelations()
  → computePageWeights(wikiId, pageId, edges, graph, store)   ← 新增
  → updatePageInGraph()  ← edges 已含 weight
```

具体步骤：

1. `extractLinks(pageId, content, knownPages)` — 新增 `knownPages` 参数，用于 `resolveTarget`
2. 并行运行 `extractLinks` 和 `extractRelations`（现有逻辑保持不变）
3. 合并 edges 后，调用 `computePageWeights`
4. 把带 `weight` 的 edges 传给 `updatePageInGraph`

`computePageWeights` 需要读取当前完整图来计算 Adamic-Adar（读一次，不加锁，允许轻微的读旧）。

---

## 5. 文件改动清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `graph/graph-store.ts` | 修改 | `GraphEdge` 加 `weight?: number` |
| `graph/link-extractor.ts` | 修改 | 新增 wikilink 正则 + `resolveTarget()` + `knownPages` 参数 |
| `graph/graph-relevance.ts` | 新建 | `computePageWeights()` 4信号实现 |
| `queue/graph-extraction-handler.ts` | 修改 | 调用 `computePageWeights`，传 `knownPages` 给 `extractLinks` |

不涉及 API、存储格式（JSON 向后兼容）、前端任何改动。

---

## 6. 边界条件

- **目标页不存在**：`resolveTarget` 返回 null，edge 被丢弃。不创建悬空边。
- **frontmatter 无 `source_file`**：信号 2 贡献 0，不报错。
- **孤立节点（无邻居）**：信号 3 贡献 0，Adamic-Adar 分母不存在。
- **degree ≤ 1**：`log(1) = 0` 导致除零，跳过该公共邻居（`degree >= 2` 才计算）。
- **历史边无 weight**：展示层和搜索层按 `weight ?? 0` 处理，不影响现有功能。

---

## 7. 不在本子项目范围内

- 搜索层如何利用 weight（阈值过滤、上下文截断）→ 子项目 2
- 前端图谱根据 weight 调整边的视觉粗细 → 子项目 2 或更晚
- 节点 `type` 字段的引入 → 未排期
