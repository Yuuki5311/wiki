import type { GraphEdge } from './graph-store'

interface LLMRelation {
  target: string
  relation: string
}

const SYSTEM_PROMPT = `你是知识图谱提取助手。从页面内容中提取与其他页面的明确关系。
只提取明确提到的关系，不要过度推断。
target 必须是已知页面列表中的某个路径（如 wiki/xxx.md），不能是自由文本标题。
返回 JSON 数组格式：[{"target":"wiki/页面路径.md","relation":"关系描述"}]
如果没有明确关系，返回空数组 []。
只输出 JSON，不要任何解释。`

export async function extractRelations(
  pageId: string,
  title: string,
  content: string,
  knownPages: string[] = [],
): Promise<GraphEdge[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.LLM_MODEL ?? 'deepseek-chat'

  if (!apiKey) return []

  const userMsg = `页面标题：${title}\n页面路径：${pageId}\n\n已知页面列表：\n${knownPages.filter(p => p !== pageId).join('\n')}\n\n页面内容：${content.slice(0, 1000)}`

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    })

    if (!res.ok) {
      console.warn(`[llm-extractor] API 返回 ${res.status}，跳过`)
      return []
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const text = data.choices[0]?.message?.content?.trim() ?? '[]'

    const parsed = JSON.parse(text) as LLMRelation[]
    return parsed
      .filter(r => r.target && r.relation && knownPages.includes(r.target))
      .map(r => ({
        source: pageId,
        target: r.target,
        relation: r.relation,
        sourceType: 'llm' as const,
      }))
  } catch (err) {
    console.warn('[llm-extractor] 提取失败，跳过:', (err as Error).message)
    return []
  }
}
