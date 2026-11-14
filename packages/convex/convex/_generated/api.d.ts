/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acesso from "../acesso.js";
import type * as addonImages from "../addonImages.js";
import type * as avisoPedidos from "../avisoPedidos.js";
import type * as blogAutomation from "../blogAutomation.js";
import type * as blogs from "../blogs.js";
import type * as catalogoTours from "../catalogoTours.js";
import type * as contactQuotes from "../contactQuotes.js";
import type * as contactSubmissions from "../contactSubmissions.js";
import type * as contadores from "../contadores.js";
import type * as corporateExperiences from "../corporateExperiences.js";
import type * as corporateRequests from "../corporateRequests.js";
import type * as crons from "../crons.js";
import type * as driverApplications from "../driverApplications.js";
import type * as drivers from "../drivers.js";
import type * as emailVerification from "../emailVerification.js";
import type * as events from "../events.js";
import type * as flights from "../flights.js";
import type * as googleReviews from "../googleReviews.js";
import type * as http from "../http.js";
import type * as imagensBunny from "../imagensBunny.js";
import type * as inicio from "../inicio.js";
import type * as instagram from "../instagram.js";
import type * as lib_addons from "../lib/addons.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_avisoPedido from "../lib/avisoPedido.js";
import type * as lib_blogPrompts from "../lib/blogPrompts.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_catalogTranslations from "../lib/catalogTranslations.js";
import type * as lib_corporateExperienceTranslations from "../lib/corporateExperienceTranslations.js";
import type * as lib_displayedReviewStats from "../lib/displayedReviewStats.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_imagens from "../lib/imagens.js";
import type * as lib_markdownToTiptap from "../lib/markdownToTiptap.js";
import type * as lib_openai from "../lib/openai.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_pipedriveFila from "../lib/pipedriveFila.js";
import type * as lib_pipedriveMapa from "../lib/pipedriveMapa.js";
import type * as lib_precoTours from "../lib/precoTours.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_referral from "../lib/referral.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_stripeCheckout from "../lib/stripeCheckout.js";
import type * as lib_tabelasImagens from "../lib/tabelasImagens.js";
import type * as lib_upsellTranslations from "../lib/upsellTranslations.js";
import type * as lib_utils from "../lib/utils.js";
import type * as marketingStats from "../marketingStats.js";
import type * as migracaoBunny from "../migracaoBunny.js";
import type * as migracaoTextoBunny from "../migracaoTextoBunny.js";
import type * as newsletterSubscriptions from "../newsletterSubscriptions.js";
import type * as orders from "../orders.js";
import type * as partnerApplications from "../partnerApplications.js";
import type * as partnerLeads from "../partnerLeads.js";
import type * as partnerships from "../partnerships.js";
import type * as pastExperiences from "../pastExperiences.js";
import type * as payments from "../payments.js";
import type * as pipedrive from "../pipedrive.js";
import type * as procurar from "../procurar.js";
import type * as recompressao from "../recompressao.js";
import type * as reservas from "../reservas.js";
import type * as schoolQuoteSubmissions from "../schoolQuoteSubmissions.js";
import type * as seedReviews from "../seedReviews.js";
import type * as siteSettings from "../siteSettings.js";
import type * as stripe from "../stripe.js";
import type * as teamMembers from "../teamMembers.js";
import type * as tourAddons from "../tourAddons.js";
import type * as tourBookings from "../tourBookings.js";
import type * as tourInquiries from "../tourInquiries.js";
import type * as tourReviews from "../tourReviews.js";
import type * as tourScarcity from "../tourScarcity.js";
import type * as tourSchedules from "../tourSchedules.js";
import type * as tourStops from "../tourStops.js";
import type * as tours from "../tours.js";
import type * as universalAddons from "../universalAddons.js";
import type * as upsells from "../upsells.js";
import type * as vehicles from "../vehicles.js";
import type * as veiculos from "../veiculos.js";
import type * as webhooks from "../webhooks.js";
import type * as weddingQuoteSubmissions from "../weddingQuoteSubmissions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acesso: typeof acesso;
  addonImages: typeof addonImages;
  avisoPedidos: typeof avisoPedidos;
  blogAutomation: typeof blogAutomation;
  blogs: typeof blogs;
  catalogoTours: typeof catalogoTours;
  contactQuotes: typeof contactQuotes;
  contactSubmissions: typeof contactSubmissions;
  contadores: typeof contadores;
  corporateExperiences: typeof corporateExperiences;
  corporateRequests: typeof corporateRequests;
  crons: typeof crons;
  driverApplications: typeof driverApplications;
  drivers: typeof drivers;
  emailVerification: typeof emailVerification;
  events: typeof events;
  flights: typeof flights;
  googleReviews: typeof googleReviews;
  http: typeof http;
  imagensBunny: typeof imagensBunny;
  inicio: typeof inicio;
  instagram: typeof instagram;
  "lib/addons": typeof lib_addons;
  "lib/admin": typeof lib_admin;
  "lib/avisoPedido": typeof lib_avisoPedido;
  "lib/blogPrompts": typeof lib_blogPrompts;
  "lib/bunny": typeof lib_bunny;
  "lib/catalogTranslations": typeof lib_catalogTranslations;
  "lib/corporateExperienceTranslations": typeof lib_corporateExperienceTranslations;
  "lib/displayedReviewStats": typeof lib_displayedReviewStats;
  "lib/geo": typeof lib_geo;
  "lib/imagens": typeof lib_imagens;
  "lib/markdownToTiptap": typeof lib_markdownToTiptap;
  "lib/openai": typeof lib_openai;
  "lib/pagination": typeof lib_pagination;
  "lib/pipedriveFila": typeof lib_pipedriveFila;
  "lib/pipedriveMapa": typeof lib_pipedriveMapa;
  "lib/precoTours": typeof lib_precoTours;
  "lib/pricing": typeof lib_pricing;
  "lib/referral": typeof lib_referral;
  "lib/storage": typeof lib_storage;
  "lib/stripeCheckout": typeof lib_stripeCheckout;
  "lib/tabelasImagens": typeof lib_tabelasImagens;
  "lib/upsellTranslations": typeof lib_upsellTranslations;
  "lib/utils": typeof lib_utils;
  marketingStats: typeof marketingStats;
  migracaoBunny: typeof migracaoBunny;
  migracaoTextoBunny: typeof migracaoTextoBunny;
  newsletterSubscriptions: typeof newsletterSubscriptions;
  orders: typeof orders;
  partnerApplications: typeof partnerApplications;
  partnerLeads: typeof partnerLeads;
  partnerships: typeof partnerships;
  pastExperiences: typeof pastExperiences;
  payments: typeof payments;
  pipedrive: typeof pipedrive;
  procurar: typeof procurar;
  recompressao: typeof recompressao;
  reservas: typeof reservas;
  schoolQuoteSubmissions: typeof schoolQuoteSubmissions;
  seedReviews: typeof seedReviews;
  siteSettings: typeof siteSettings;
  stripe: typeof stripe;
  teamMembers: typeof teamMembers;
  tourAddons: typeof tourAddons;
  tourBookings: typeof tourBookings;
  tourInquiries: typeof tourInquiries;
  tourReviews: typeof tourReviews;
  tourScarcity: typeof tourScarcity;
  tourSchedules: typeof tourSchedules;
  tourStops: typeof tourStops;
  tours: typeof tours;
  universalAddons: typeof universalAddons;
  upsells: typeof upsells;
  vehicles: typeof vehicles;
  veiculos: typeof veiculos;
  webhooks: typeof webhooks;
  weddingQuoteSubmissions: typeof weddingQuoteSubmissions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
