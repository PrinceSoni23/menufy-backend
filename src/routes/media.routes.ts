import { Router } from "express";
import { proxyMedia } from "../controllers/media.controller";

const router = Router();

// GET /api/media/proxy?url=<encoded_url>
router.get("/proxy", proxyMedia);

export default router;
