import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import { parseDocument, SUPPORTED_EXTENSIONS } from "../pipeline/parser";
import { chunkText } from "../pipeline/chunker";
import { embed } from "../pipeline/embedder";
import { addChunks } from "../store/vector-db";
import type { ChunkRecord, UploadResult } from "../types";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function fixFilename(raw: string): string {
  try {
    return Buffer.from(raw, "latin1").toString("utf8");
  } catch {
    return raw;
  }
}

const ALLOWED_EXTENSIONS = SUPPORTED_EXTENSIONS.map((e) => e.toLowerCase());

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeName = fixFilename(file.originalname).replace(
      /[/\\:*?"<>|]/g,
      "_",
    );

    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName}`,
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(fixFilename(file.originalname)).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`));
    }
  },
});
const route = Router();

route.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "请选择要上传的文件" });
      return;
    }

    const originalName = req.file.filename;
    const ext = path.extname(originalName).toLowerCase();

    // 解析文件为纯文本
    let text;

    try {
      text = await parseDocument(req.file.path, ext);
    } catch {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: "文档解析失败，请确认文件未被加密或损坏" });
      return;
    }

    if (!text || !text.trim()) {
      await fs.unlink(req.file.path).catch(() => {});
      res
        .status(400)
        .json({ error: "无法从文档中提取文本内容（扫描版 PDF 不支持）" });
      return;
    }

    // 切分为小块
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: "无法从文档中提取文本内容" });
      return;
    }

    // 向量化
    const vectors = await embed(chunks.map((c) => c.text));

    // 写入数据库
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();
    const records: ChunkRecord[] = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      text: chunk.text,
      vector: vectors[i],
      docId,
      docName: originalName,
      chunkIndex: chunk.index,
      createdAt: now,
    }));

    await addChunks(records);

    const result: UploadResult = {
      docId,
      docName: originalName,
      chunkCount: chunks.length,
    };
    res.json(result);
  } catch (error) {
    console.error("[Upload] 错误:", error);
    res.status(500).json({ error: "文件处理失败" });
  }
});

export default route;
