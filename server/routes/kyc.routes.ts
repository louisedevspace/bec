import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { adminNotificationService } from "../services/admin-notification.service";

export default function registerKycRoutes(app: Express) {
  // POST /api/kyc/submit
  app.post("/api/kyc/submit", requireAuth, async (req, res) => {
    try {
      const { fullName, ssn, address, frontIdUrl, backIdUrl, selfieWithIdUrl } = req.body;
      const userId = req.user.id;

      if (!fullName || !ssn || !address || !frontIdUrl || !backIdUrl || !selfieWithIdUrl) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check for existing pending/approved KYC
      const { data: existingKYC, error: existingError } = await supabaseAdmin
        .from("kyc_verifications")
        .select("status")
        .eq("user_id", userId)
        .in("status", ["pending", "approved"])
        .single();

      if (existingError && existingError.code !== "PGRST116") {
        return res.status(500).json({ message: "Database error" });
      }

      if (existingKYC) {
        return res.status(400).json({
          message:
            existingKYC.status === "approved"
              ? "You are already verified"
              : "You already have a pending KYC request",
        });
      }

      const { data: newKYC, error: createError } = await supabaseAdmin
        .from("kyc_verifications")
        .insert([
          {
            user_id: userId,
            full_name: fullName,
            ssn,
            address,
            front_id_url: frontIdUrl,
            back_id_url: backIdUrl,
            selfie_with_id_url: selfieWithIdUrl,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ message: "Failed to submit KYC request", error: createError.message });
      }

      // Admin notification
      try {
        await adminNotificationService.notifyKycSubmission(userId, req.user?.email);
      } catch {}

      res.json({ message: "KYC verification request submitted successfully", kycId: newKYC.id });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/admin/kyc-requests
  app.get("/api/admin/kyc-requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: kycRequests, error: kycError } = await supabaseAdmin
        .from("kyc_verifications")
        .select("*");

      if (kycError) {
        return res.status(500).json({ message: "Failed to fetch KYC requests", details: kycError.message });
      }

      const sortedKyc = (kycRequests || []).slice().sort((a, b) => {
        const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        return bt - at;
      });

      const kycRequestsWithUserDetails = await Promise.all(
        sortedKyc.map(async (kyc) => {
          try {
            const { data: user, error: userError } = await supabaseAdmin
              .from("users")
              .select("email, full_name")
              .eq("id", kyc.user_id)
              .single();

            return { ...kyc, user: userError ? null : user };
          } catch {
            return { ...kyc, user: null };
          }
        })
      );

      res.json(kycRequestsWithUserDetails || []);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/kyc-review
  app.post("/api/admin/kyc-review", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { kycId, action, reason } = req.body;

      if (!kycId || !action || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Invalid input parameters" });
      }

      const { data: kycRequest, error: kycError } = await supabaseAdmin
        .from("kyc_verifications")
        .select("*")
        .eq("id", kycId)
        .single();

      if (kycError || !kycRequest) {
        return res.status(404).json({ message: "KYC request not found" });
      }

      const updateData: any = {
        status: action === "approve" ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
      };

      if (action === "reject" && reason) {
        updateData.rejection_reason = reason;
      }

      const { error: updateError } = await supabaseAdmin
        .from("kyc_verifications")
        .update(updateData)
        .eq("id", kycId);

      if (updateError) {
        return res.status(500).json({ message: "Failed to update KYC request" });
      }

      // Update user verification status
      const verificationStatus = action === "approve" ? true : false;
      await supabaseAdmin
        .from("users")
        .update({ is_verified: verificationStatus })
        .eq("id", kycRequest.user_id);

      res.json({
        message: `KYC request ${action}d successfully`,
        status: action === "approve" ? "approved" : "rejected",
        userVerified: verificationStatus,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/reset-kyc
  app.post("/api/admin/reset-kyc", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const { data: deleteResult, error: deleteError } = await supabaseAdmin
        .from("kyc_verifications")
        .delete()
        .eq("user_id", userId)
        .select();

      if (deleteError) {
        return res.status(500).json({ message: "Failed to delete KYC records" });
      }

      await supabaseAdmin
        .from("users")
        .update({ is_verified: false })
        .eq("id", userId);

      res.json({
        message: "KYC reset successfully",
        deletedRecords: deleteResult?.length || 0,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });
}
