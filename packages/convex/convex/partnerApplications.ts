import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { enfileirarLead } from "./lib/pipedriveFila"
import { avisarPedido } from "./lib/avisoPedido"
import { exigirAdmin } from "./lib/admin";

const driverEntry = v.object({
  fullName: v.string(),
  email: v.string(),
  phone: v.string(),
  hasVideo: v.boolean(),
})

const vehicleEntry = v.object({
  make: v.string(),
  model: v.string(),
  licensePlate: v.string(),
  category: v.string(),
})

const statusValidator = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("approved"),
  v.literal("rejected"),
)

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const submit = mutation({
  args: {
    operatingZones: v.array(v.string()),
    driverCount: v.string(),
    driversComfortableWithMobile: v.union(v.literal("yes"), v.literal("no")),

    companyName: v.string(),
    representativeFullName: v.string(),
    representativeEmail: v.string(),
    representativePhone: v.string(),
    representativeWhatsapp: v.string(),

    drivers: v.array(driverEntry),
    vehicles: v.array(vehicleEntry),

    documentLicenseId: v.optional(v.id("_storage")),
    documentAddressProofPrimaryId: v.optional(v.id("_storage")),
    documentAddressProofSecondaryId: v.optional(v.id("_storage")),
    documentLiabilityInsuranceId: v.optional(v.id("_storage")),

    billingAccountHolder: v.string(),
    billingInvoiceName: v.string(),
    billingSwiftBic: v.string(),
    billingIban: v.string(),
    billingTaxId: v.string(),
    billingTaxOffice: v.string(),
    billingAddress: v.string(),
    billingBankProofId: v.optional(v.id("_storage")),

    priceAgreementAcknowledged: v.boolean(),
    termsAccepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const total = await ctx.db.query("partnerApplications").collect()
    const queuePosition = total.length + 1

    const id = await ctx.db.insert("partnerApplications", {
      ...args,
      status: "submitted",
      queuePosition,
      createdAt: Date.now(),
    })

    /* Para o CRM vai só o representante e as contagens — os dados bancários, os
       documentos e os dados dos condutores ficam aqui. Ver `lib/pipedriveMapa`. */
    await enfileirarLead(ctx, "partnerApplications", id)
    await avisarPedido(ctx, "partnerApplications", id)

    return { id, queuePosition }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const applications = await ctx.db
      .query("partnerApplications")
      .withIndex("by_created")
      .collect()
    return applications.reverse()
  },
})

export const get = query({
  args: { id: v.id("partnerApplications") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const application = await ctx.db.get(args.id)
    if (!application) return null

    const fileFields = [
      "documentLicenseId",
      "documentAddressProofPrimaryId",
      "documentAddressProofSecondaryId",
      "documentLiabilityInsuranceId",
      "billingBankProofId",
    ] as const

    const fileUrls: Record<string, string | null> = {}
    for (const field of fileFields) {
      const storageId = application[field]
      fileUrls[field] = storageId ? await ctx.storage.getUrl(storageId) : null
    }

    return { ...application, fileUrls }
  },
})

export const setStatus = mutation({
  args: {
    id: v.id("partnerApplications"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, {
      status: args.status,
      reviewedAt: Date.now(),
    })
  },
})

export const setInternalNotes = mutation({
  args: {
    id: v.id("partnerApplications"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { internalNotes: args.notes })
  },
})

export const remove = mutation({
  args: { id: v.id("partnerApplications") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id)
  },
})
