import type { Express } from "express";
import { requireAuth, requireAdmin, requireVerifiedUser, supabaseAdmin } from "./middleware";
import { insertLoanApplicationSchema } from "@shared/schema";
import { z } from "zod";
import { storage } from "../storage";
import multer from "multer";
import supabase from "../supabaseClient";
import { logFinancialOperation, getClientIP, getUserAgent, logAuditEvent } from "../utils/security";
import { adminNotificationService } from "../services/admin-notification.service";

const upload = multer({ storage: multer.memoryStorage() });

export default function registerLoansRoutes(app: Express) {
  // POST /api/loans — create loan application
  app.post("/api/loans", requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const validatedData = insertLoanApplicationSchema.parse(req.body);
      const application = await storage.createLoanApplication(validatedData);

      // Admin notification
      try {
        await adminNotificationService.notifyLoanApplication(application, req.user?.email);
      } catch {}

      res.json(application);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loan application data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create loan application" });
    }
  });

  // GET /api/loans/:userId
  app.get("/api/loans/:userId", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      const currentUserId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!userId) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // SECURITY FIX: Check if user is authorized to view these loans
      // Users can only view their own loans, admins can view anyone's
      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const isAdmin = currentUser?.role === "admin";

      if (!isAdmin && userId !== currentUserId) {
        await logAuditEvent({
          userId: currentUserId,
          action: 'LOAN_ACCESS_DENIED',
          details: { attemptedUserId: userId },
          ipAddress,
          userAgent,
          status: 'failure',
        });
        return res.status(403).json({ message: "Access denied - you can only view your own loans" });
      }

      const applications = await storage.getLoanApplications(userId);
      res.json(applications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch loan applications" });
    }
  });

  // GET /api/loans/check-reminders — admin only
  app.get("/api/loans/check-reminders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: loansDueTomorrow, error } = await supabaseAdmin
        .from("loan_applications")
        .select(`id, user_id, amount, loan_pay_date, users!inner(email, full_name)`)
        .eq("status", "approved")
        .eq("loan_status", "active")
        .eq("is_reminder_sent", false)
        .lte("loan_pay_date", tomorrow.toISOString())
        .gte("loan_pay_date", today.toISOString());

      if (error) {
        return res.status(500).json({ error: "Failed to fetch loans" });
      }

      res.json({ loans: loansDueTomorrow || [], count: loansDueTomorrow?.length || 0 });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/loans/mark-reminder-sent/:loanId — admin only
  app.post("/api/loans/mark-reminder-sent/:loanId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { loanId } = req.params;

      const { error } = await supabaseAdmin
        .from("loan_applications")
        .update({ is_reminder_sent: true })
        .eq("id", loanId);

      if (error) {
        return res.status(500).json({ error: "Failed to update reminder status" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/loans/pay/:loanId
  app.post("/api/loans/pay/:loanId", requireAuth, async (req, res) => {
    try {
      const { loanId } = req.params;
      const userId = req.user.id;

      const { data: loan, error: loanError } = await supabaseAdmin
        .from("loan_applications")
        .select("*")
        .eq("id", loanId)
        .eq("user_id", userId)
        .single();

      if (loanError || !loan) {
        return res.status(404).json({ error: "Loan not found" });
      }
      if (loan.status !== "approved") {
        return res.status(400).json({ error: "Loan is not approved" });
      }

      const { data: portfolio, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      if (portfolioError || !portfolio) {
        return res.status(404).json({ error: "USDT portfolio not found" });
      }

      const availableBalance = parseFloat(portfolio.available);
      const loanAmount = parseFloat(loan.amount.toString());

      if (availableBalance < loanAmount) {
        return res.status(400).json({
          error: "Insufficient balance",
          required: loanAmount,
          available: availableBalance,
          shortfall: loanAmount - availableBalance,
        });
      }

      const newBalance = (availableBalance - loanAmount).toString();

      const { error: updatePortfolioError } = await supabaseAdmin
        .from("portfolios")
        .update({ available: newBalance })
        .eq("user_id", userId)
        .eq("symbol", "USDT");

      if (updatePortfolioError) {
        return res.status(500).json({ error: "Failed to update portfolio balance" });
      }

      const { error: updateLoanError } = await supabaseAdmin
        .from("loan_applications")
        .update({ loan_status: "paid", reviewed_at: new Date().toISOString() })
        .eq("id", loanId);

      if (updateLoanError) {
        // Revert portfolio balance
        await supabaseAdmin
          .from("portfolios")
          .update({ available: portfolio.available })
          .eq("user_id", userId)
          .eq("symbol", "USDT");
        return res.status(500).json({ error: "Failed to update loan status" });
      }

      // Transaction record
      await supabaseAdmin.from("transactions").insert({
        user_id: userId,
        type: "loan_payment",
        amount: loanAmount.toString(),
        symbol: "USDT",
        status: "completed",
        created_at: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "Loan payment successful",
        newBalance,
        paidAmount: loanAmount,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/loan/submit — loan with file upload
  app.post("/api/loan/submit", requireAuth, multer().array("documents"), async (req, res) => {
    try {
      const { amount, purpose, duration, monthly_income } = req.body;
      const files = (req.files as Express.Multer.File[]) || [];
      const userId = req.user!.id;

      if (!amount || !purpose || !duration) {
        return res.status(400).json({ message: "Amount, purpose, and duration are required" });
      }

      const durationNum = parseInt(duration);
      if (isNaN(durationNum) || durationNum < 7 || durationNum > 90) {
        return res.status(400).json({ message: "Loan duration must be between 7 and 90 days" });
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Invalid loan amount" });
      }

      // Upload documents
      const documentUrls: string[] = [];
      for (const file of files) {
        const fileName = `${userId}/${Date.now()}_${file.originalname}`;
        const { data, error } = await supabaseAdmin.storage
          .from("loan-documents")
          .upload(fileName, file.buffer, { contentType: file.mimetype });

        if (error) {
          return res.status(500).json({ message: "Failed to upload document" });
        }
        documentUrls.push(data.path);
      }

      const loanData = {
        user_id: userId,
        amount: amountNum,
        purpose,
        duration: durationNum,
        monthly_income: monthly_income ? parseFloat(monthly_income) : null,
        documents: documentUrls.length > 0 ? { urls: documentUrls } : null,
        status: "pending",
      };

      let { data: insertResult, error } = await supabaseAdmin
        .from("loan_applications")
        .insert(loanData)
        .select();

      // Handle duplicate key
      if (error && error.code === "23505") {
        const { data: maxIdResult } = await supabaseAdmin
          .from("loan_applications")
          .select("id")
          .order("id", { ascending: false })
          .limit(1);

        const maxId = maxIdResult && maxIdResult.length > 0 ? maxIdResult[0].id : 0;
        const retryResponse = await supabaseAdmin
          .from("loan_applications")
          .insert({ ...loanData, id: maxId + 1 })
          .select();

        insertResult = retryResponse.data;
        error = retryResponse.error;
      }

      if (error) {
        return res.status(500).json({ message: "Failed to submit loan application", error: error.message });
      }

      // Admin notification
      try {
        const loanRecord = insertResult && insertResult.length > 0 ? insertResult[0] : { amount: amountNum, user_id: userId };
        await adminNotificationService.notifyLoanApplication(loanRecord, req.user?.email);
      } catch {}

      res.json({ message: "Loan application submitted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // POST /api/upload-loan-doc
  app.post("/api/upload-loan-doc", requireAuth, requireVerifiedUser, upload.single("file"), async (req, res) => {
    const file = req.file;
    const userId = req.body.userId;
    if (!file || !userId) return res.status(400).json({ message: "No file or userId provided" });

    const filePath = `${userId}/${Date.now()}-${file.originalname}`;
    const { error } = await supabase.storage
      .from("loan-documents")
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (error) return res.status(500).json({ message: "Upload failed", error });

    const { data: publicUrlData } = supabase.storage.from("loan-documents").getPublicUrl(filePath);
    res.json({ url: publicUrlData.publicUrl });
  });
}
