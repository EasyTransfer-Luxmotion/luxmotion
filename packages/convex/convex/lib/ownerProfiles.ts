import type { QueryCtx } from "../_generated/server";
import { urlDaImagem } from "./imagens";

/* Photo URLs of owners without a member row, by email. Owners with a member
   row keep their photo there (colaboradores.photo). */
export async function ownerPhotoUrls(ctx: QueryCtx, emails: string[]): Promise<Map<string, string | null>> {
  const rows = await Promise.all(
    emails.map(async (email) => {
      const p = await ctx.db
        .query("ownerProfiles")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      return [email, p?.photo ? await urlDaImagem(ctx, p.photo) : null] as const;
    }),
  );
  return new Map(rows);
}
