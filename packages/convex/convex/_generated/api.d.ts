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
import type * as artigos from "../artigos.js";
import type * as avaliacoes from "../avaliacoes.js";
import type * as avisoPedidos from "../avisoPedidos.js";
import type * as blogAutomation from "../blogAutomation.js";
import type * as blogs from "../blogs.js";
import type * as candidaturas from "../candidaturas.js";
import type * as catalogoCorporate from "../catalogoCorporate.js";
import type * as catalogoEventos from "../catalogoEventos.js";
import type * as catalogoExtras from "../catalogoExtras.js";
import type * as catalogoTours from "../catalogoTours.js";
import type * as contactQuotes from "../contactQuotes.js";
import type * as contactSubmissions from "../contactSubmissions.js";
import type * as contactos from "../contactos.js";
import type * as contadores from "../contadores.js";
import type * as convites from "../convites.js";
import type * as corporateExperiences from "../corporateExperiences.js";
import type * as corporateRequests from "../corporateRequests.js";
import type * as crons from "../crons.js";
import type * as definicoes from "../definicoes.js";
import type * as disponibilidade from "../disponibilidade.js";
import type * as driverApplications from "../driverApplications.js";
import type * as drivers from "../drivers.js";
import type * as emailVerification from "../emailVerification.js";
import type * as equipa from "../equipa.js";
import type * as estatistica from "../estatistica.js";
import type * as events from "../events.js";
import type * as flights from "../flights.js";
import type * as fotosExtras from "../fotosExtras.js";
import type * as functions from "../functions.js";
import type * as funis from "../funis.js";
import type * as googleReviews from "../googleReviews.js";
import type * as http from "../http.js";
import type * as imagensBunny from "../imagensBunny.js";
import type * as inicio from "../inicio.js";
import type * as instagram from "../instagram.js";
import type * as lib_addons from "../lib/addons.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_adminAccao from "../lib/adminAccao.js";
import type * as lib_aeroportos from "../lib/aeroportos.js";
import type * as lib_avisoPedido from "../lib/avisoPedido.js";
import type * as lib_bibliotecaFotos from "../lib/bibliotecaFotos.js";
import type * as lib_blogPrompts from "../lib/blogPrompts.js";
import type * as lib_boardFilters from "../lib/boardFilters.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_candidaturasContactos from "../lib/candidaturasContactos.js";
import type * as lib_catalogTranslations from "../lib/catalogTranslations.js";
import type * as lib_contactFacts from "../lib/contactFacts.js";
import type * as lib_contactos from "../lib/contactos.js";
import type * as lib_convites from "../lib/convites.js";
import type * as lib_corporateExperienceTranslations from "../lib/corporateExperienceTranslations.js";
import type * as lib_displayedReviewStats from "../lib/displayedReviewStats.js";
import type * as lib_frota from "../lib/frota.js";
import type * as lib_funilEntrada from "../lib/funilEntrada.js";
import type * as lib_funilEstado from "../lib/funilEstado.js";
import type * as lib_funis from "../lib/funis.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_imagens from "../lib/imagens.js";
import type * as lib_inviteEmail from "../lib/inviteEmail.js";
import type * as lib_list from "../lib/list.js";
import type * as lib_markdownToTiptap from "../lib/markdownToTiptap.js";
import type * as lib_notificar from "../lib/notificar.js";
import type * as lib_openai from "../lib/openai.js";
import type * as lib_orderFacts from "../lib/orderFacts.js";
import type * as lib_orderLabels from "../lib/orderLabels.js";
import type * as lib_orderList from "../lib/orderList.js";
import type * as lib_orderStats from "../lib/orderStats.js";
import type * as lib_ownerProfiles from "../lib/ownerProfiles.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_parceriaPorSlug from "../lib/parceriaPorSlug.js";
import type * as lib_perfilMotorista from "../lib/perfilMotorista.js";
import type * as lib_permissoes from "../lib/permissoes.js";
import type * as lib_pipedriveFila from "../lib/pipedriveFila.js";
import type * as lib_pipedriveMapa from "../lib/pipedriveMapa.js";
import type * as lib_precoTours from "../lib/precoTours.js";
import type * as lib_precoTransfer from "../lib/precoTransfer.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_pricingSnapshot from "../lib/pricingSnapshot.js";
import type * as lib_quote from "../lib/quote.js";
import type * as lib_referral from "../lib/referral.js";
import type * as lib_requests from "../lib/requests.js";
import type * as lib_saidas from "../lib/saidas.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_stripeCheckout from "../lib/stripeCheckout.js";
import type * as lib_tabelasImagens from "../lib/tabelasImagens.js";
import type * as lib_triggers from "../lib/triggers.js";
import type * as lib_upsellTranslations from "../lib/upsellTranslations.js";
import type * as lib_utils from "../lib/utils.js";
import type * as lib_vPerna from "../lib/vPerna.js";
import type * as marketingStats from "../marketingStats.js";
import type * as migracaoBunny from "../migracaoBunny.js";
import type * as migracaoTextoBunny from "../migracaoTextoBunny.js";
import type * as newsletterSubscriptions from "../newsletterSubscriptions.js";
import type * as notificacoes from "../notificacoes.js";
import type * as orderFacts from "../orderFacts.js";
import type * as orders from "../orders.js";
import type * as parceiros from "../parceiros.js";
import type * as partnerApplications from "../partnerApplications.js";
import type * as partnerLeads from "../partnerLeads.js";
import type * as partnerships from "../partnerships.js";
import type * as pastExperiences from "../pastExperiences.js";
import type * as payments from "../payments.js";
import type * as pedidos from "../pedidos.js";
import type * as perfis from "../perfis.js";
import type * as pipedrive from "../pipedrive.js";
import type * as portefolio from "../portefolio.js";
import type * as pricingReport from "../pricingReport.js";
import type * as procurar from "../procurar.js";
import type * as recompressao from "../recompressao.js";
import type * as reservas from "../reservas.js";
import type * as saidas from "../saidas.js";
import type * as schoolQuoteSubmissions from "../schoolQuoteSubmissions.js";
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
import type * as traducaoAutomatica from "../traducaoAutomatica.js";
import type * as universalAddons from "../universalAddons.js";
import type * as upsells from "../upsells.js";
import type * as vehicleCategories from "../vehicleCategories.js";
import type * as vehicles from "../vehicles.js";
import type * as veiculos from "../veiculos.js";
import type * as vigilancia from "../vigilancia.js";
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
  artigos: typeof artigos;
  avaliacoes: typeof avaliacoes;
  avisoPedidos: typeof avisoPedidos;
  blogAutomation: typeof blogAutomation;
  blogs: typeof blogs;
  candidaturas: typeof candidaturas;
  catalogoCorporate: typeof catalogoCorporate;
  catalogoEventos: typeof catalogoEventos;
  catalogoExtras: typeof catalogoExtras;
  catalogoTours: typeof catalogoTours;
  contactQuotes: typeof contactQuotes;
  contactSubmissions: typeof contactSubmissions;
  contactos: typeof contactos;
  contadores: typeof contadores;
  convites: typeof convites;
  corporateExperiences: typeof corporateExperiences;
  corporateRequests: typeof corporateRequests;
  crons: typeof crons;
  definicoes: typeof definicoes;
  disponibilidade: typeof disponibilidade;
  driverApplications: typeof driverApplications;
  drivers: typeof drivers;
  emailVerification: typeof emailVerification;
  equipa: typeof equipa;
  estatistica: typeof estatistica;
  events: typeof events;
  flights: typeof flights;
  fotosExtras: typeof fotosExtras;
  functions: typeof functions;
  funis: typeof funis;
  googleReviews: typeof googleReviews;
  http: typeof http;
  imagensBunny: typeof imagensBunny;
  inicio: typeof inicio;
  instagram: typeof instagram;
  "lib/addons": typeof lib_addons;
  "lib/admin": typeof lib_admin;
  "lib/adminAccao": typeof lib_adminAccao;
  "lib/aeroportos": typeof lib_aeroportos;
  "lib/avisoPedido": typeof lib_avisoPedido;
  "lib/bibliotecaFotos": typeof lib_bibliotecaFotos;
  "lib/blogPrompts": typeof lib_blogPrompts;
  "lib/boardFilters": typeof lib_boardFilters;
  "lib/bunny": typeof lib_bunny;
  "lib/candidaturasContactos": typeof lib_candidaturasContactos;
  "lib/catalogTranslations": typeof lib_catalogTranslations;
  "lib/contactFacts": typeof lib_contactFacts;
  "lib/contactos": typeof lib_contactos;
  "lib/convites": typeof lib_convites;
  "lib/corporateExperienceTranslations": typeof lib_corporateExperienceTranslations;
  "lib/displayedReviewStats": typeof lib_displayedReviewStats;
  "lib/frota": typeof lib_frota;
  "lib/funilEntrada": typeof lib_funilEntrada;
  "lib/funilEstado": typeof lib_funilEstado;
  "lib/funis": typeof lib_funis;
  "lib/geo": typeof lib_geo;
  "lib/imagens": typeof lib_imagens;
  "lib/inviteEmail": typeof lib_inviteEmail;
  "lib/list": typeof lib_list;
  "lib/markdownToTiptap": typeof lib_markdownToTiptap;
  "lib/notificar": typeof lib_notificar;
  "lib/openai": typeof lib_openai;
  "lib/orderFacts": typeof lib_orderFacts;
  "lib/orderLabels": typeof lib_orderLabels;
  "lib/orderList": typeof lib_orderList;
  "lib/orderStats": typeof lib_orderStats;
  "lib/ownerProfiles": typeof lib_ownerProfiles;
  "lib/pagination": typeof lib_pagination;
  "lib/parceriaPorSlug": typeof lib_parceriaPorSlug;
  "lib/perfilMotorista": typeof lib_perfilMotorista;
  "lib/permissoes": typeof lib_permissoes;
  "lib/pipedriveFila": typeof lib_pipedriveFila;
  "lib/pipedriveMapa": typeof lib_pipedriveMapa;
  "lib/precoTours": typeof lib_precoTours;
  "lib/precoTransfer": typeof lib_precoTransfer;
  "lib/pricing": typeof lib_pricing;
  "lib/pricingSnapshot": typeof lib_pricingSnapshot;
  "lib/quote": typeof lib_quote;
  "lib/referral": typeof lib_referral;
  "lib/requests": typeof lib_requests;
  "lib/saidas": typeof lib_saidas;
  "lib/storage": typeof lib_storage;
  "lib/stripeCheckout": typeof lib_stripeCheckout;
  "lib/tabelasImagens": typeof lib_tabelasImagens;
  "lib/triggers": typeof lib_triggers;
  "lib/upsellTranslations": typeof lib_upsellTranslations;
  "lib/utils": typeof lib_utils;
  "lib/vPerna": typeof lib_vPerna;
  marketingStats: typeof marketingStats;
  migracaoBunny: typeof migracaoBunny;
  migracaoTextoBunny: typeof migracaoTextoBunny;
  newsletterSubscriptions: typeof newsletterSubscriptions;
  notificacoes: typeof notificacoes;
  orderFacts: typeof orderFacts;
  orders: typeof orders;
  parceiros: typeof parceiros;
  partnerApplications: typeof partnerApplications;
  partnerLeads: typeof partnerLeads;
  partnerships: typeof partnerships;
  pastExperiences: typeof pastExperiences;
  payments: typeof payments;
  pedidos: typeof pedidos;
  perfis: typeof perfis;
  pipedrive: typeof pipedrive;
  portefolio: typeof portefolio;
  pricingReport: typeof pricingReport;
  procurar: typeof procurar;
  recompressao: typeof recompressao;
  reservas: typeof reservas;
  saidas: typeof saidas;
  schoolQuoteSubmissions: typeof schoolQuoteSubmissions;
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
  traducaoAutomatica: typeof traducaoAutomatica;
  universalAddons: typeof universalAddons;
  upsells: typeof upsells;
  vehicleCategories: typeof vehicleCategories;
  vehicles: typeof vehicles;
  veiculos: typeof veiculos;
  vigilancia: typeof vigilancia;
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

export declare const components: {
  orderFacts: {
    btree: {
      aggregateBetween: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any },
        { count: number; sum: number }
      >;
      aggregateBetweenBatch: FunctionReference<
        "query",
        "internal",
        { queries: Array<{ k1?: any; k2?: any; namespace?: any }> },
        Array<{ count: number; sum: number }>
      >;
      atNegativeOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffset: FunctionReference<
        "query",
        "internal",
        { k1?: any; k2?: any; namespace?: any; offset: number },
        { k: any; s: number; v: any }
      >;
      atOffsetBatch: FunctionReference<
        "query",
        "internal",
        {
          queries: Array<{
            k1?: any;
            k2?: any;
            namespace?: any;
            offset: number;
          }>;
        },
        Array<{ k: any; s: number; v: any }>
      >;
      get: FunctionReference<
        "query",
        "internal",
        { key: any; namespace?: any },
        null | { k: any; s: number; v: any }
      >;
      offset: FunctionReference<
        "query",
        "internal",
        { k1?: any; key: any; namespace?: any },
        number
      >;
      offsetUntil: FunctionReference<
        "query",
        "internal",
        { k2?: any; key: any; namespace?: any },
        number
      >;
      paginate: FunctionReference<
        "query",
        "internal",
        {
          cursor?: string;
          k1?: any;
          k2?: any;
          limit: number;
          namespace?: any;
          order: "asc" | "desc";
        },
        {
          cursor: string;
          isDone: boolean;
          page: Array<{ k: any; s: number; v: any }>;
        }
      >;
      paginateNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string; limit: number },
        { cursor: string; isDone: boolean; page: Array<any> }
      >;
      validate: FunctionReference<
        "query",
        "internal",
        { namespace?: any },
        any
      >;
    };
    inspect: {
      display: FunctionReference<"query", "internal", { namespace?: any }, any>;
      dump: FunctionReference<"query", "internal", { namespace?: any }, string>;
      inspectNode: FunctionReference<
        "query",
        "internal",
        { namespace?: any; node?: string },
        null
      >;
      listTreeNodes: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          aggregate?: { count: number; sum: number };
          items: Array<{ k: any; s: number; v: any }>;
          subtrees: Array<string>;
        }>
      >;
      listTrees: FunctionReference<
        "query",
        "internal",
        { take?: number },
        Array<{
          _creationTime: number;
          _id: string;
          maxNodeSize: number;
          namespace?: any;
          root: string;
        }>
      >;
    };
    public: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      delete_: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        null
      >;
      deleteIfExists: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any },
        any
      >;
      init: FunctionReference<
        "mutation",
        "internal",
        { maxNodeSize?: number; namespace?: any; rootLazy?: boolean },
        null
      >;
      insert: FunctionReference<
        "mutation",
        "internal",
        { key: any; namespace?: any; summand?: number; value: any },
        null
      >;
      makeRootLazy: FunctionReference<
        "mutation",
        "internal",
        { namespace?: any },
        null
      >;
      replace: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        null
      >;
      replaceOrInsert: FunctionReference<
        "mutation",
        "internal",
        {
          currentKey: any;
          namespace?: any;
          newKey: any;
          newNamespace?: any;
          summand?: number;
          value: any;
        },
        any
      >;
    };
  };
};
