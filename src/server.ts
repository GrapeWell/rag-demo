import express from 'express';
import path from 'path';

// 清除系统代理环境变量（避免 transformers.js 下载时走死代理）
for (const v of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy', 'CDNURL', 'MIRROR']) {
  process.env[v] = '';
}

import healthRouter from './routes/health';
import documentsRouter from './routes/documents';
import uploadRouter from './routes/upload';
import chatRouter from './routes/chat';
import { initEmbedder } from './pipeline/embedder';
import { startGenerator, stopGenerator } from './pipeline/generator';

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/lib', express.static(path.resolve(process.cwd(), 'node_modules/marked/lib')));

app.use('/api', healthRouter);
app.use('/api', documentsRouter);
app.use('/api', uploadRouter);
app.use('/api', chatRouter);

app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

async function main() {
  try { await initEmbedder(); } catch (err) { console.error('Embedding 加载失败:', err); }
  try { await startGenerator(); } catch (err) { console.error('LLM 启动失败:', err); }

  const server = app.listen(PORT, () => {
    console.log(`\n=== RAG 本地 Demo 已启动 ===`);
    console.log(`访问: http://localhost:${PORT}`);
    console.log(`==========================\n`);
  });

  const shutdown = () => {
    console.log('\n[Server] 关闭中...');
    stopGenerator();
    server.close(() => { process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用。用 set PORT=8080 && npm start 换端口。`);
      process.exit(1);
    }
  });
}

main().catch((err) => { console.error('启动失败:', err); process.exit(1); });
