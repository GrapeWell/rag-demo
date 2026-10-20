import fs from 'fs/promises'

type ParserFn = (filePath: string) => Promise<string>;

// 解析pdf
async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const buffer = await fs.readFile(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

// 解析word
async function parseDocx(filePath: string): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

// 解析md
async function parseMarkdown(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8')
  const { marked } = await import('marked')
  const html = await marked(content)
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const PARSERS: Record<string, ParserFn> = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.md': parseMarkdown,
  '.txt': async (filePath: string) => fs.readFile(filePath, 'utf-8')
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt'];

export async function parseDocument(filePath: string, ext: string): Promise<string> {
  const parser = PARSERS[ext.toLowerCase()]
  if (!parser) {
    throw new Error(`不支持的文件格式：${ext}`)
  }

  return parser(filePath)
}
