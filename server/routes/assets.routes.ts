import type { Express } from "express";
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

      res.setHeader("Content-Type", data.type || "application/octet-stream");
      res.setHeader("Content-Length", String(imageBuffer.length));
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

      return res.status(200).send(imageBuffer);
    } catch (error) {
      console.error("Asset proxy error:", error);
      return res.status(500).json({ message: "Failed to load image asset" });
    }
  });
}