import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const BIN_DIR = path.resolve(process.cwd(), 'bin');
const LLM_DIR = path.resolve(process.cwd(), 'models', 'llm');
const MODEL_FILE = 'qwen2.5-0.5b-q4_k_m.gguf';
const LLAMA_PORT = 8080;

let childProcess: ChildProcess | null = null;
let isLoaded = false;

function findLlamaServer(): string {
  const candidates = fs.readdirSync(BIN_DIR);
  const match = candidates.find(
    (f) => f.toLowerCase().includes('llama-server') && f.endsWith('.exe')
  )
  if (!match) throw new Error('未找到 llama-server.exe, 请先运行 npm run setup');

  return path.join(BIN_DIR, match)
}

async function waitForReady(timeoutMs = 120000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.01:${LLAMA_PORT}/health`);
      if (res.ok) {
        isLoaded = true;
        console.log('[LLM] llama-server 就绪');
        return;
      }
    } catch{}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('llama-server 启动超时');
}

export function getGeneratorStatus() {
  return { ready: isLoaded, error: null }
}

// 启动 llama-server子进程
export async function startGenerator(): Promise<void> {
  if (isLoaded || childProcess) return;

  const serverExe = findLlamaServer();
  const modelPath = path.join(LLM_DIR, MODEL_FILE);
  if (!fs.existsSync(modelPath)) {
    throw new Error('模型文件不存在，请先运行 npm run setup')
  }

  childProcess = spawn(serverExe, [
    '-m', modelPath,
    '--port', String(LLAMA_PORT),
    '--host', '127.0.0.1',
    '-ngl', '0', // 0表示纯CPU，99表示全部GPU
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  childProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes('error')) console.log('[LLM]', msg.trim())
  });

  childProcess.on('exit', (code) => {
    console.log(`[LLM] llama-server 退出 (code=${code})`);
    isLoaded = false;
    childProcess = null;
  })

  await waitForReady()
}

// 关闭 llama-server
export function stopGenerator(): void {
  if (childProcess) {
    childProcess.kill('SIGTERM');
    const forceTimeout = setTimeout(() => {
      if (childProcess) { childProcess.kill('SIGKILL') }
    }, 5000);
    childProcess.on('exit', () => {
      clearTimeout(forceTimeout);
      childProcess = null;
      isLoaded = false;
    })
  }
}

// 流式调用 LLM
export async function generateStream(
  messages: Array<{ role: string; content: string }>,
  opts: { onToken: (t: string) => void; onDone: () => void; onError: (e: Error) => void }
): Promise<void> {
  if (!isLoaded) await startGenerator();

  const response = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 512,
      stop: ['<|endoftext|>', '<|im_end|>'],
    })
  })

  if (!response.ok) {
    throw new Error(`LLM API 错误: ${response.status}`)
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取SSE流');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while(true) {
      const { done, value } = await reader.read()
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) opts.onToken(content);
          } catch{}
        }
      }
    }
  } finally {
    reader.releaseLock();
    opts.onDone();
  }
}
