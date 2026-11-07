import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { enfileirarLead } from "./lib/pipedriveFila"
import { avisarPedido } from "./lib/avisoPedido"
import { exigirAdmin } from "./lib/admin";

const languageEntry = v.object({
  code: v.string(),
  level: v.union(
    v.literal("survival"),
    v.literal("intermediate"),
    v.literal("fluent"),
  ),
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
    operatingZone: v.string(),

    fullName: v.string(),
    email: v.string(),
    representativeEmail: v.string(),
    phone: v.string(),
    whatsapp: v.string(),
    languages: v.array(languageEntry),
    referral: v.string(),

    vehicleCategory: v.string(),
    vehicleBrand: v.string(),
    vehicleModel: v.string(),
    vehiclePlate: v.string(),
    vehicleColor: v.string(),
    vehicleYear: v.string(),
    vehicleOwnership: v.string(),
    vehiclePassengerCapacity: v.string(),
    vehicleLuggageCapacity: v.string(),
    vehicleTvdeLicensed: v.string(),
    vehicleInteriorPhotoIds: v.array(v.id("_storage")),
    vehicleExteriorPhotoIds: v.array(v.id("_storage")),
    childSeatBaby: v.number(),
    childSeatChild: v.number(),
    childSeatBooster: v.number(),
    surfboardRack: v.boolean(),
    amenities: v.array(v.string()),

    professionalPhotoId: v.optional(v.id("_storage")),
    professionalLicenseId: v.optional(v.id("_storage")),
    vehicleInsuranceId: v.optional(v.id("_storage")),
    proofOfAddressId: v.optional(v.id("_storage")),

    billingAccountHolder: v.string(),
    billingInvoiceName: v.string(),
    billingSwiftBic: v.string(),
    billingIban: v.string(),
    billingNif: v.string(),
    billingTaxOffice: v.string(),
    billingAddress: v.string(),
    billingBankProofId: v.optional(v.id("_storage")),

    availabilityDays: v.array(v.string()),
    availabilityShifts: v.array(v.string()),

    introVideoId: v.optional(v.id("_storage")),

    termsAccepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const total = await ctx.db.query("driverApplications").collect()
    const queuePosition = total.length + 1

    const id = await ctx.db.insert("driverApplications", {
      ...args,
      status: "submitted",
      queuePosition,
      createdAt: Date.now(),
    })

    /* Para o CRM vai só o contacto e a viatura — IBAN, NIF, documentos e
       matrícula ficam aqui. Ver `lib/pipedriveMapa`. */
    await enfileirarLead(ctx, "driverApplications", id)
    await avisarPedido(ctx, "driverApplications", id)

    return { id, queuePosition }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const applications = await ctx.db
      .query("driverApplications")
      .withIndex("by_created")
      .collect()
    return applications.reverse()
  },
})

export const get = query({
  args: { id: v.id("driverApplications") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const application = await ctx.db.get(args.id)
    if (!application) return null

    const singleFileFields = [
      "professionalPhotoId",
      "professionalLicenseId",
      "vehicleInsuranceId",
      "proofOfAddressId",
      "billingBankProofId",
      "introVideoId",
    ] as const

    const fileUrls: Record<string, string | null> = {}
    for (const field of singleFileFields) {
      const storageId = application[field]
      fileUrls[field] = storageId ? await ctx.storage.getUrl(storageId) : null
    }

    const interiorPhotoUrls = await Promise.all(
      application.vehicleInteriorPhotoIds.map((sid) => ctx.storage.getUrl(sid)),
    )
    const exteriorPhotoUrls = await Promise.all(
      application.vehicleExteriorPhotoIds.map((sid) => ctx.storage.getUrl(sid)),
    )

    return {
      ...application,
      fileUrls,
      interiorPhotoUrls,
      exteriorPhotoUrls,
    }
  },
})

export const setStatus = mutation({
  args: {
    id: v.id("driverApplications"),
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
    id: v.id("driverApplications"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { internalNotes: args.notes })
  },
})

export const remove = mutation({
  args: { id: v.id("driverApplications") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id)
  },
})
