import fs from "fs/promises";
import path from "path";
import { Router } from "express";
import { deleteDocument, getDocumentStats } from "../store/vector-db";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");
const router = Router();

router.get("/documents", async (_req, res) => {
  try {
    const docs = await getDocumentStats();
    res.json({ documents: docs });
  } catch (error) {
    res.status(500).json({ error: "获取文档列表失败" });
  }
});

router.delete("/documents/:docId", async (req, res) => {
  try {
    await deleteDocument(req.params.docId);

    const files = await fs.readdir(UPLOAD_DIR);
    for (const file of files) {
      if (file.includes(req.params.docId)) {
        await fs.unlink(path.join(UPLOAD_DIR, file));
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "删除文档失败" });
  }
});

export default router
