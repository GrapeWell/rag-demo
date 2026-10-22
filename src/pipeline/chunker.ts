const CHUNK_SIZE = 512;   // 基础块长度上限，按 JS 字符串长度计算
const CHUNK_OVERLAP = 64; // 从前一块末尾复制的长度，单位同上
const SEPARATORS = ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''];

export function chunkText(text: string): { text: string; index: number }[] {
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/\0/g, '');
  const chunks = addOverlap(splitRecursive(cleanText, SEPARATORS, CHUNK_SIZE), CHUNK_OVERLAP)
  return chunks.map((value, index) => ({ text: value, index }))
}

/**
 * @param text - 文本
 * @param separators - 标点符号集合
 * @param chunkSize - 块大小
 * @param overlap - 重叠部分大小
 * @returns 
 */
function splitRecursive(text: string, separators: string[], chunkSize: number): string[] {
  // 如果内容长度为0则直接返回空块
  if (text.length === 0) return [];
  
  // 依次从标点符号中取符号进行分割
  const [sep, ...resetSep] = separators

  // 如果说前面的符号都用完了，则根据块大小，硬切割
  if (sep === '') {
    return splitByLength(text, chunkSize)  
  }

  // 按照标点符号切割
  const splits = text.split(sep)
  const result: string[] = []
  let current = ''

  // 处理切割后的块大小
  for (const part of splits) {
    // 如果当前块加第二块加标点的长度大于块长度那么将当前块录入结果
    if (current.length + part.length + sep.length > chunkSize && current.length > 0) {
      result.push(current.trim())
      current = part
    } else {
      current = current ? current + sep + part : part
    }
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  // 对仍然过长的块进行分割
  const final: string[] = []
  for (const chunk of result) {
    if (chunk.length > chunkSize && resetSep.length > 0) {
      final.push(...splitRecursive(chunk, resetSep, chunkSize))
    } else {
      final.push(chunk)
    }
  }

  return final
}

/**
 * @param text - 文本
 * @param size - 块大小
 * @returns 
 */
function splitByLength(text: string, size: number): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length; start+=size) {
    result.push(text.slice(start, start + size))
  }
  return result
}

/**
 * @param chunks - 切块后的集合
 * @param overlapChars - 要重叠的字符长度
 */
function addOverlap(chunks: string[], overlapChars: number): string[] {
  // 如果只有一个切块直接返回
  if (chunks.length <= 1) return chunks

  const result = [chunks[0]]

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const overlap = prev.length > overlapChars ? prev.slice(-overlapChars) : prev
    result.push(overlap + chunks[i])
  }

  return result
}
