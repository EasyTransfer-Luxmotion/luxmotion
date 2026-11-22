import { v } from "convex/values";
import { action } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { internal } from "./_generated/api";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "LuxMotion <onboarding@resend.dev>";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const storeCode = internalMutation({
  args: { email: v.string(), code: v.string(), expiresAt: v.number() },
  handler: async (ctx, { email, code, expiresAt }) => {
    const normalized = normalizeEmail(email);
    const now = Date.now();
    const existing = await ctx.db
      .query("emailVerifications")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { code, expiresAt, attempts: 0, createdAt: now });
    } else {
      await ctx.db.insert("emailVerifications", {
        email: normalized,
        code,
        expiresAt,
        attempts: 0,
        createdAt: now,
      });
    }
  },
});

export const send = action({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ ok: boolean }> => {
    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes("@")) {
      throw new Error("invalid_email");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + CODE_TTL_MS;

    await ctx.runMutation(internal.emailVerification.storeCode, {
      email: normalized,
      code,
      expiresAt,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("email_not_configured");
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: [normalized],
        subject: "LuxMotion — Verification code",
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1b18">
            <p style="font-size:14px;color:#696969;margin:0 0 16px">Your LuxMotion verification code is:</p>
            <p style="font-size:34px;font-weight:700;letter-spacing:8px;color:#9a7535;margin:0 0 16px">${code}</p>
            <p style="font-size:13px;color:#999;margin:0">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      // Surface the real Resend rejection in the Convex logs — the client only
      // gets a generic reason, so this is the only place to see WHY it failed
      // (unverified sending domain, bad API key, rate limit, etc.).
      const detail = await response.text().catch(() => "");
      console.error(`Resend send failed (${response.status}): ${detail}`);
      throw new Error("send_failed");
    }

    return { ok: true };
  },
});

export const verify = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    { email, code },
  ): Promise<{ ok: boolean; reason?: "not_found" | "expired" | "too_many" | "mismatch" }> => {
    const normalized = normalizeEmail(email);
    const record = await ctx.db
      .query("emailVerifications")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();

    if (!record) return { ok: false, reason: "not_found" };

    if (Date.now() > record.expiresAt) {
      await ctx.db.delete(record._id);
      return { ok: false, reason: "expired" };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await ctx.db.delete(record._id);
      return { ok: false, reason: "too_many" };
    }

    if (record.code !== code.trim()) {
      await ctx.db.patch(record._id, { attempts: record.attempts + 1 });
      return { ok: false, reason: "mismatch" };
    }

    await ctx.db.delete(record._id);
    return { ok: true };
  },
});
