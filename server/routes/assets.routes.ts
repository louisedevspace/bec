import type { Express } from "express";
import crypto from "crypto";
import supabase from "../supabaseClient";
import { createSupabaseStorageObjectRef } from "../../shared/supabase-storage";

export default function registerAssetRoutes(app: Express) {
  app.get("/api/assets/image", async (req, res) => {
    const bucket = String(req.query.bucket || "").trim();
    const path = String(req.query.path || "").trim();

    if (!bucket || !path) {
      return res.status(400).json({ message: "bucket and path are required" });
    }

    try {
      const storageRef = createSupabaseStorageObjectRef(bucket, path);
      const { data, error } = await supabase.storage
        .from(storageRef.bucket)
        .download(storageRef.path);

      if (error || !data) {
        return res.status(404).json({ message: "Image not found" });
      }

      const imageBuffer = Buffer.from(await data.arrayBuffer());
      
      // Generate ETag from content hash for conditional requests
      const etag = `"${crypto.createHash('md5').update(imageBuffer).digest('hex')}"`;
      
      // Support conditional requests (If-None-Match → 304 Not Modified)
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        return res.status(304).end();
      }

      // Set optimized caching headers
      res.set({
        "Content-Type": data.type || "application/octet-stream",
        "Content-Length": String(imageBuffer.length),
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=604800, immutable", // 7 days for profile pics
        "Vary": "Accept-Encoding",
        "ETag": etag,
      });

      return res.status(200).send(imageBuffer);
    } catch (error) {
      console.error("Asset proxy error:", error);
      return res.status(500).json({ message: "Failed to load image asset" });
    }
  });
}