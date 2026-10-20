export function buildChatMessages(contexts: string[], question: string) {
  return [
    {
      role: 'system',
      content: `你是一个基于文档检索的助手。请仅使用提供的参考资料回答问题。
如果资料不足，请如实说明。不要编造。
回答时使用 Markdown 格式：代码用 \`\`\` 包裹，标题用 ##，列表用 - 或数字。`,
    },
    {
      role: 'user',
      content: `参考资料：${contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}
      问题：${question}`
    }
  ]
}
