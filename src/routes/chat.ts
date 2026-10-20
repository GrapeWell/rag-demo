import { Router } from 'express'
import { hasDocuments } from '../store/vector-db';
import { retrieve } from '../pipeline/retriever';
import { buildChatMessages } from '../prompt';
import { Source } from '../types';
import { generateStream } from '../pipeline/generator';

const route = Router();

route.post('/chat', async (req, res) => {
  try {
    const { question } = req.body || {}
    if (!question || typeof question !== 'string' || !question.trim() ) {
      res.status(400).json({ error: '问题不能为空' })
      return;
    }

    if (!(await hasDocuments())) {
      res.status(400).json({ error: '请先上传文档' });
      return;
    }

    // 检索片段
    const results = await retrieve(question.trim(), 5)
    if (results.length === 0) {
      res.json({ answer: '未找到相关文档段落，请尝试上传更多相关文件或换个问题。', sources: [] });
      return;
    }

    // 拼接prompt
    const contexts = results.map((c) => c.text)
    const messages = buildChatMessages(contexts, question.trim());
    const sources: Source[] = results.map((r) => ({
      docName: r.docName, text: r.text, chunkIndex: r.chunkIndex
    }))

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      "Cache-Control": 'no-cache',
      Connection: 'keep-alive',
    })

    try {
      await generateStream(messages, {
        onToken(token) { res.write(`data: ${JSON.stringify({ token })}\n\n`); },
        onDone() { res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`); res.end(); },
        onError(err) { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); },
      });
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: 'LLM 生成失败' })}\n\n`);
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: '处理请求失败' });
    }
  }
})

export default route
