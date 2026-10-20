import { marked } from '/lib/marked.esm.js';
import {
  chatInput, sendBtn, addUserMessage, createAssistantMessage,
  finalizeAssistantMessage, showToast,
} from './ui.js';

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || sendBtn.disabled) return;

  chatInput.value = '';
  sendBtn.disabled = true;
  addUserMessage(question);

  const assistantEl = createAssistantMessage();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const err = await response.json();
      assistantEl.textContent = err.error || '请求失败';
      assistantEl.classList.remove('typing-cursor');
      showToast(err.error || '请求失败', true);
      sendBtn.disabled = false;
      return;
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      assistantEl.innerHTML = marked.parse(data.answer);
      finalizeAssistantMessage(assistantEl, data.sources || []);
      sendBtn.disabled = false;
      return;
    }

    // SSE 流式
    const reader = response.body?.getReader();
    if (!reader) { assistantEl.textContent = '无法读取响应'; assistantEl.classList.remove('typing-cursor'); sendBtn.disabled = false; return; }

    const decoder = new TextDecoder();
    let buffer = '', answerText = '', sources = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) { assistantEl.textContent = answerText || data.error; assistantEl.classList.remove('typing-cursor'); showToast(data.error, true); sendBtn.disabled = false; return; }
            if (data.token) { answerText += data.token; assistantEl.textContent = answerText; }
            if (data.done) { sources = data.sources || []; }
          } catch {}
        }
      }
      assistantEl.innerHTML = marked.parse(answerText);
      finalizeAssistantMessage(assistantEl, sources);
    } finally { reader.releaseLock(); }
  } catch {
    assistantEl.textContent = '连接中断，请重试';
    assistantEl.classList.remove('typing-cursor');
    showToast('连接中断', true);
  }
  sendBtn.disabled = false;
}
