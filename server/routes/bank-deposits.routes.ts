import type { Express } from "express";
import { requireAuth, requireAdmin, requireUnlockedWallet, supabaseAdmin } from "./middleware";
import { updatePortfolioBalance } from "./helpers";
import { adminNotificationService } from "../services/admin-notification.service";

async function getOrCreateBankDepositSettings() {
  const { data, error } = await supabaseAdmin
    .from("bank_deposit_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabaseAdmin
    .from("bank_deposit_settings")
    .insert({ id: 1 })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

export default function registerBankDepositsRoutes(app: Express) {
  // ===== USER-FACING =====

  // GET /api/bank-deposits/status — public, no auth. Lets the wallet page
  // decide whether to show the "Bank Transfer" deposit option at all.
  app.get("/api/bank-deposits/status", async (_req, res) => {
    try {
      const settings = await getOrCreateBankDepositSettings();
      res.json({ isEnabled: !!settings.is_enabled });
    } catch (error) {
      console.error("Failed to load bank-deposit status:", error);
      res.json({ isEnabled: false });
    }
  });

  // GET /api/bank-deposits/merchant-accounts — active accounts, for the user's
  // country picker + account details display. The distinct countries here ARE
  // the country picker's option list (a user can only pick a country the
  // admin has actually configured an account for).
  app.get("/api/bank-deposits/merchant-accounts", requireAuth, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("bank_merchant_accounts")
        .select("id, country, bank_name, account_name, account_number, routing_info, instructions")
        .eq("is_active", true)
        .order("country")
        .order("sort_order");

      if (error) {
        return res.status(500).json({ message: "Failed to load merchant accounts" });
      }

      res.json({ accounts: data || [] });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/bank-deposits/submit
  app.post("/api/bank-deposits/submit", requireAuth, requireUnlockedWallet, async (req, res) => {
    try {
      const userId = req.user.id;
      const country = typeof req.body?.country === "string" ? req.body.country.trim() : "";
      const bankName = typeof req.body?.bankName === "string" ? req.body.bankName.trim() : "";
      const amountUsd = parseFloat(req.body?.amountUsd);
      const merchantAccountId = req.body?.merchantAccountId != null ? parseInt(req.body.merchantAccountId, 10) : null;

      if (!country || !bankName) {
        return res.status(400).json({ message: "Country and bank name are required" });
      }
      if (isNaN(amountUsd) || amountUsd <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      const { data: bankRequest, error: insertError } = await supabaseAdmin
        .from("bank_deposit_requests")
        .insert({
          user_id: userId,
          country,
          amount_usd: amountUsd.toFixed(2),
          bank_name: bankName,
          merchant_account_id: merchantAccountId,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ message: "Failed to submit bank deposit request" });
      }

      try {
        await adminNotificationService.notifyDepositRequest(
          { id: bankRequest.id, user_id: userId, symbol: `Bank/${country}`, amount: amountUsd },
          req.user?.email
        );
      } catch {}

      res.json({ message: "Bank deposit request submitted successfully", request: bankRequest });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/bank-deposits/my-requests
  app.get("/api/bank-deposits/my-requests", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("bank_deposit_requests")
        .select("*")
        .eq("user_id", req.user.id)
        .order("submitted_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch bank deposit requests" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ADMIN: SETTINGS TOGGLE =====

  app.get("/api/admin/bank-deposit-settings", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const settings = await getOrCreateBankDepositSettings();
      res.json({ isEnabled: !!settings.is_enabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to load bank-deposit settings" });
    }
  });

  app.put("/api/admin/bank-deposit-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { isEnabled } = req.body;

      const { data, error } = await supabaseAdmin
        .from("bank_deposit_settings")
        .upsert({
          id: 1,
          is_enabled: !!isEnabled,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update bank-deposit settings" });
      }

      res.json({ isEnabled: !!data.is_enabled });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ADMIN: MERCHANT ACCOUNTS =====

  app.get("/api/admin/bank-merchant-accounts", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("bank_merchant_accounts")
        .select("*")
        .order("country")
        .order("sort_order");

      if (error) {
        return res.status(500).json({ message: "Failed to fetch merchant accounts" });
      }

      res.json({ accounts: data || [] });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/bank-merchant-accounts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { country, bankName, accountName, accountNumber, routingInfo, instructions, isActive, sortOrder } = req.body;

      if (!country?.trim() || !bankName?.trim() || !accountName?.trim() || !accountNumber?.trim()) {
        return res.status(400).json({ message: "Country, bank name, account name, and account number are required" });
      }

      const { data, error } = await supabaseAdmin
        .from("bank_merchant_accounts")
        .insert({
          country: country.trim(),
          bank_name: bankName.trim(),
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
          routing_info: routingInfo?.trim() || null,
          instructions: instructions?.trim() || null,
          is_active: isActive !== undefined ? !!isActive : true,
          sort_order: sortOrder != null ? parseInt(sortOrder, 10) : 0,
          updated_by: req.user.id,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to create merchant account" });
      }

      res.json({ account: data });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/bank-merchant-accounts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { country, bankName, accountName, accountNumber, routingInfo, instructions, isActive, sortOrder } = req.body;

      if (!country?.trim() || !bankName?.trim() || !accountName?.trim() || !accountNumber?.trim()) {
        return res.status(400).json({ message: "Country, bank name, account name, and account number are required" });
      }

      const { data, error } = await supabaseAdmin
        .from("bank_merchant_accounts")
        .update({
          country: country.trim(),
          bank_name: bankName.trim(),
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
          routing_info: routingInfo?.trim() || null,
          instructions: instructions?.trim() || null,
          is_active: isActive !== undefined ? !!isActive : true,
          sort_order: sortOrder != null ? parseInt(sortOrder, 10) : 0,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update merchant account" });
      }

      res.json({ account: data });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/bank-merchant-accounts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin.from("bank_merchant_accounts").delete().eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to delete merchant account" });
      }

      res.json({ message: "Merchant account deleted" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ADMIN: REQUEST REVIEW QUEUE =====

  app.get("/api/admin/bank-deposit-requests", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data: requests, error } = await supabaseAdmin
        .from("bank_deposit_requests")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch bank deposit requests" });
      }

      const userIds = Array.from(new Set((requests || []).map((r: any) => r.user_id).filter(Boolean)));
      let usersById = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id, email, full_name, display_id")
          .in("id", userIds);
        usersById = new Map((users || []).map((u: any) => [u.id, u]));
      }

      const merged = (requests || []).map((r: any) => ({
        ...r,
        users: usersById.get(r.user_id) || null,
      }));

      res.json(merged);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/bank-deposit-requests/:requestId/review", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { action, adminNotes, rejectionReason } = req.body;
      const currentUserId = req.user.id;

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
      }

      const { data: bankRequest, error: fetchError } = await supabaseAdmin
        .from("bank_deposit_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (fetchError || !bankRequest) {
        return res.status(404).json({ message: "Bank deposit request not found" });
      }
      if (bankRequest.status !== "pending") {
        return res.status(400).json({ message: "This request has already been reviewed" });
      }

      const updateData: any = {
        status: action === "approve" ? "approved" : "rejected",
        admin_notes: adminNotes || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUserId,
      };
      if (action === "reject") {
        updateData.rejection_reason = rejectionReason || null;
      }

      const { data: updatedRequest, error: updateError } = await supabaseAdmin
        .from("bank_deposit_requests")
        .update(updateData)
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ message: "Failed to update bank deposit request" });
      }

      if (action === "approve") {
        const amount = parseFloat(bankRequest.amount_usd || "0");

        const { data: existingPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", bankRequest.user_id)
          .eq("symbol", "USDT")
          .maybeSingle();

        const currentAvailable = existingPortfolio ? parseFloat(existingPortfolio.available) || 0 : 0;
        await updatePortfolioBalance(bankRequest.user_id, "USDT", (currentAvailable + amount).toString());

        await supabaseAdmin.from("transactions").insert({
          user_id: bankRequest.user_id,
          type: "deposit",
          symbol: "USDT",
          amount: amount.toFixed(8),
          status: "completed",
          address: `Bank transfer — ${bankRequest.country} / ${bankRequest.bank_name}`,
        });
      }

      res.json({ message: `Bank deposit request ${action}d successfully`, request: updatedRequest });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
