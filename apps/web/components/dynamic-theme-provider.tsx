"use client";

import React, { createContext, useContext, useMemo, useCallback, useEffect } from "react";
import { cdn } from "@/lib/cdn";

export interface ThemeColors {
  // Brand colors
  primary: string;
  secondary: string;
  accent: string;
  
  // Landing Page Header
  landingHeaderBg: string;
  landingHeaderText: string;
  landingHeaderHoverText: string;
  landingHeaderButtonBg: string;
  landingHeaderButtonText: string;
  landingHeaderButtonIcon: string;
  landingHeaderMenuIcon: string;
  landingHeaderMenuBg: string;
  landingHeaderMenuBorder: string;
  landingHeaderMenuItemHoverBg: string;

  // Hero Section
  heroBg: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBadgeBg: string;
  heroBadgeText: string;
  heroBadgeIcon: string;
  heroBannerBg: string;
  heroBannerIcon: string;
  heroBannerFlame: string;
  heroBookingBg: string;
  heroBookingBorder: string;
  heroBookingInputBg: string;
  heroBookingInputText: string;
  heroBookingPlaceholder: string;
  heroBookingInputHoverBg: string;
  heroBookingText: string;
  heroBookingAccent: string;
  heroBookingIcon: string;
  heroTrustStarColor: string;
  trustedByBg: string;

  // Page colors
  background: string;
  footer: string;
  headerBg: string;
  logoBg: string;
  logoText: string;
  
  // Text hierarchy
  headingText: string;
  bodyText: string;
  mutedText: string;
  linkText: string;
  
  // UI elements
  buttonBg: string;
  buttonText: string;
  cardBg: string;
  cardBorder: string;
  featureCardBg: string;
  inputBorder: string;
  
  // Badges
  badgeBg: string;
  badgeText: string;
  exclusiveBadgeBg: string;

  // Icons
  iconColor: string;

  // Electric Badges
  electricBadgeBg: string;
  electricBadgeText: string;

  // Testimonial Gradient
  testimonialGradientStart: string;
  testimonialGradientEnd: string;

  // Features Section
  featuresSectionTitle: string;
  featureCardTitle: string;
  featureCardDescription: string;

  // Fleet Section
  fleetSectionTitle: string;
  fleetVehicleCardBg: string;
  fleetVehicleName: string;
  fleetCapacityBadgeBg: string;
  fleetCapacityBadgeText: string;
  fleetIconColor: string;

  // Payment Section
  paymentSectionTitle: string;
  paymentSecurityBadgeBg: string;
  paymentSecurityBadgeText: string;
  paymentIconColor: string;
  paymentExclusiveBadgeIcon: string;
  
  // FAQ Section
  faqTitle: string;
  faqSubtitle: string;
  faqCardBg: string;
  faqCardBorder: string;
  faqQuestionText: string;
  faqAnswerText: string;
  faqIconColor: string;

  // Why Schedule Section
  whyScheduleBg: string;
  whyScheduleTitle: string;
  whyScheduleStatsWrapperBg: string;
  whyScheduleStatsCardBg: string;
  whyScheduleStatsAccent: string;
  whyScheduleStatsText: string;
  whyScheduleFeatureCardBg: string;
  whyScheduleFeatureIconBg: string;
  whyScheduleFeatureIcon: string;
  whyScheduleFeatureText: string;
  whyScheduleResourcesTitle: string;
  whyScheduleResourcesIconBorder: string;
  whyScheduleResourcesIcon: string;
  whyScheduleResourcesText: string;

  // About Us Section
  aboutUsBg: string;
  aboutUsTitle: string;
  aboutUsCardBg: string;
  aboutUsBorder: string;
  aboutUsQuote: string;
  aboutUsText: string;
  aboutUsSignature: string;
  aboutUsGradientStart: string;
  aboutUsGradientEnd: string;

  // Lisbon Banner
  lisbonBannerBg: string;
  lisbonBannerTopFade: string;
  lisbonBannerBottomFade: string;

  // Tours Section
  toursBg: string;
  toursTitle: string;
  toursDescription: string;
  toursFeatureBadgeBg: string;
  toursFeatureBadgeText: string;
  toursFeatureIcon: string;
  toursCardOverlay: string;
  toursCardTitle: string;
  toursCardArrowBg: string;
  toursCardArrowIcon: string;
  toursExploreCardBgStart: string;
  toursExploreCardBgEnd: string;
  toursExploreCardText: string;
  toursDotsActive: string;
  toursDotsInactive: string;
  toursNavButtonBg: string;
  toursNavButtonIcon: string;
  toursCtaBg: string;
  toursCtaText: string;

  // Newsletter Section
  newsletterBg: string;
  newsletterCardBg: string;
  newsletterTitle: string;
  newsletterTitleAccent: string;
  newsletterInputBg: string;
  newsletterInputBorder: string;
  newsletterInputText: string;
  newsletterInputIcon: string;
  newsletterButtonBg: string;
  newsletterButtonText: string;

  // Social Section
  socialBg: string;
  socialTitle: string;
  socialTitleAccent: string;
  socialProfileText: string;
  socialMetaText: string;
  socialFollowButtonBg: string;
  socialFollowButtonText: string;
  socialFollowButtonIcon: string;
  socialNavButtonBg: string;
  socialNavButtonIcon: string;

  // WhatsApp Floating Button
  whatsappFloatBg: string;
  whatsappFloatIcon: string;

  // Checkout - Generic Input Settings (shared across all steps)
  checkoutInputBg: string;
  checkoutInputBorder: string;
  checkoutInputText: string;
  checkoutInputPlaceholder: string;
  checkoutInputIcon: string;
  checkoutInputLabelText: string;

  // Checkout - Primary Button Settings (rounded blue buttons)
  checkoutPrimaryButtonBg: string;
  checkoutPrimaryButtonText: string;
  checkoutPrimaryButtonIcon: string;

  // Checkout - Radio Button Settings
  checkoutRadioSelectedFill: string;

  // Checkout - Trust Banner Settings
  checkoutTrustBannerBg: string;
  checkoutTrustBannerIconBg: string;
  checkoutTrustBannerIcon: string;
  checkoutTrustBannerTitle: string;
  checkoutTrustBannerDescription: string;
  checkoutTrustBannerDotActive: string;
  checkoutTrustBannerDotInactive: string;

  // Checkout - Header Settings
  checkoutHeaderBg: string;
  checkoutHeaderLogoBg: string;
  checkoutHeaderLogoText: string;
  checkoutHeaderLogoBorder: string;
  checkoutStepActiveBg: string;
  checkoutStepActiveText: string;
  checkoutStepInactiveBg: string;
  checkoutStepInactiveText: string;
  checkoutStepConnectorActive: string;
  checkoutStepConnectorInactive: string;

  // Checkout - Vehicle Card Settings
  checkoutVehicleCardBg: string;
  checkoutVehicleCardBorder: string;
  checkoutVehicleCardTitle: string;
  checkoutVehicleCardPrice: string;
  checkoutVehicleCardPriceSubtext: string;
  checkoutVehicleCardBadgeBg: string;
  checkoutVehicleCardBadgeText: string;
  checkoutVehicleCardBadgeIcon: string;
  checkoutVehicleElectricBadgeBg: string;
  checkoutVehicleElectricBadgeText: string;

  // Checkout - Language Switcher Settings
  checkoutLangSwitcherBg: string;
  checkoutLangSwitcherBorder: string;
  checkoutLangSwitcherText: string;
  checkoutLangSwitcherChevron: string;
  checkoutLangSwitcherDropdownBg: string;
  checkoutLangSwitcherDropdownBorder: string;
  checkoutLangSwitcherDropdownHoverBg: string;
  checkoutLangSwitcherCheckIcon: string;

  // Checkout - Page Background
  checkoutPageBg: string;

  // Checkout - Order Summary
  checkoutOrderSummaryBg: string;
  checkoutOrderSummaryTitle: string;
  checkoutOrderSummaryText: string;
  checkoutOrderSummaryMutedText: string;
  checkoutOrderSummaryTotalBg: string;
  checkoutOrderSummaryTotalPrice: string;
  checkoutOrderSummaryBadgeBg: string;
  checkoutOrderSummaryBadgeText: string;
  checkoutOrderSummaryBadgeIcon: string;
  checkoutOrderSummaryAccentPrice: string;
  checkoutOrderSummaryDivider: string;

  // Checkout - Form Card Settings (shared by transfer info, passenger info, etc.)
  checkoutFormCardBg: string;
  checkoutFormCardTitle: string;
  checkoutExperiencesSectionTitle: string;
  checkoutExperiencesSectionSubtitle: string;
  checkoutFormLabelText: string;
  checkoutFormTabActiveBg: string;
  checkoutFormTabActiveText: string;
  checkoutFormTabInactiveBg: string;
  checkoutFormTabInactiveText: string;
  checkoutFormInfoBoxBg: string;
  checkoutFormInfoBoxText: string;
  checkoutFormInfoBoxIcon: string;
  checkoutFormHighlightBg: string;
  checkoutFormHighlightText: string;
  checkoutFormCheckboxBg: string;
  checkoutFormLinkText: string;
  checkoutFormErrorText: string;
  checkoutFormSuccessText: string;

  // Checkout - Counter/Stepper Settings
  checkoutCounterBg: string;
  checkoutCounterBorder: string;
  checkoutCounterButtonBg: string;
  checkoutCounterButtonIcon: string;
  checkoutCounterValueText: string;

  // Checkout - Payment Method Buttons
  checkoutPaymentMethodSelectedBg: string;
  checkoutPaymentMethodSelectedBorder: string;
  checkoutPaymentMethodUnselectedBg: string;
  checkoutPaymentMethodUnselectedBorder: string;
  checkoutPaymentMethodIcon: string;
  checkoutPaymentMethodText: string;

  // Checkout - Insurance Cards
  checkoutInsuranceHeaderBg: string;
  checkoutInsuranceCheckBg: string;
  checkoutInsuranceCheckIcon: string;
  checkoutInsuranceRecommendedBg: string;
  checkoutInsuranceRecommendedText: string;

  // Checkout - Security Banner
  checkoutSecurityBannerBg: string;
  checkoutSecurityBannerBorder: string;
  checkoutSecurityBannerIcon: string;
  checkoutSecurityBannerTitle: string;
  checkoutSecurityBannerText: string;

  // Checkout - Footer Settings
  checkoutFooterBg: string;
  checkoutFooterHeadingText: string;
  checkoutFooterLabelText: string;
  checkoutFooterLinkText: string;
  checkoutFooterCopyrightText: string;
  checkoutFooterSocialIconBg: string;
  checkoutFooterSocialIconColor: string;

  // Legacy (kept for backwards compatibility)
  text: string;
  border: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  borderRadius: number;
  /** Per-partnership theme mode for the whitelabel landing (+ checkout, later):
   *  "switch" shows the light/dark toggle, "dark"/"light" lock it. Default "switch". */
  themeMode?: "switch" | "dark" | "light";
  /** Lead categories this partner offers — these always appear in the partner's
   *  leads dashboard (categories with actual leads show regardless). */
  services?: string[];
}

export const defaultTheme: ThemeConfig = {
  colors: {
    // Brand
    primary: "#27C7FF",
    secondary: "#0E4659",
    accent: "#FBB03B",
    
    // Landing Header
    landingHeaderBg: "#FFFFFF",
    landingHeaderText: "#222222",
    landingHeaderHoverText: "#27C7FF",
    landingHeaderButtonBg: "#27C7FF",
    landingHeaderButtonText: "#FFFFFF",
    landingHeaderButtonIcon: "#FFFFFF",
    landingHeaderMenuIcon: "#27C7FF",
    landingHeaderMenuBg: "#FFFFFF",
    landingHeaderMenuBorder: "#E5E7EB",
    landingHeaderMenuItemHoverBg: "rgba(0, 0, 0, 0.05)",

    // Hero
    heroBg: "#FFFFFF",
    heroTitle: "#1A1A1A",
    heroSubtitle: "#4B5563",
    heroBadgeBg: "#E0F7FF",
    heroBadgeText: "#0B3B55",
    heroBadgeIcon: "#29C5F6",
    heroBannerBg: "#FFFFFF",
    heroBannerIcon: "#9CA3AF",
    heroBannerFlame: "#F97316",
    heroBookingBg: "#FFFFFF",
    heroBookingBorder: "#F3F4F6",
    heroBookingInputBg: "#FFFFFF",
    heroBookingInputText: "#1A1A1A",
    heroBookingPlaceholder: "#9CA3AF",
    heroBookingInputHoverBg: "rgba(0, 0, 0, 0.02)",
    heroBookingText: "#4B5563",
    heroBookingAccent: "#27C7FF",
    heroBookingIcon: "#27C7FF",
    heroTrustStarColor: "#00B67A",
    trustedByBg: "#FFFFFF",

    // Page
    background: "#FFFFFF",
    footer: "#0E4659",
    headerBg: "#FFFFFF",
    logoBg: "#000000",
    logoText: "#FBB03B",
    
    // Text hierarchy
    headingText: "#222222",
    bodyText: "#4B5563",
    mutedText: "#9CA3AF",
    linkText: "#27C7FF",
    
    // UI elements
    buttonBg: "#27C7FF",
    buttonText: "#FFFFFF",
    cardBg: "#FFFFFF",
    cardBorder: "#E5E7EB",
    featureCardBg: "#E6F7FF",
    inputBorder: "#D1D5DB",
    
    // Badges
    badgeBg: "#E0F7FF",
    badgeText: "#0E4659",
    exclusiveBadgeBg: "#0E4659",

    // Icons
    iconColor: "#27C7FF",

    // Electric Badges
    electricBadgeBg: "#D1FAE5",
    electricBadgeText: "#065F46",

    // Testimonial Gradient
    testimonialGradientStart: "#FFFFFF",
    testimonialGradientEnd: "#F0F9FF",

    // Features Section
    featuresSectionTitle: "#222222",
    featureCardTitle: "#222222",
    featureCardDescription: "#4B5563",

    // Fleet Section
    fleetSectionTitle: "#222222",
    fleetVehicleCardBg: "#FFFFFF",
    fleetVehicleName: "#222222",
    fleetCapacityBadgeBg: "#E0F7FF",
    fleetCapacityBadgeText: "#0E4659",
    fleetIconColor: "#27C7FF",

    // Payment Section
    paymentSectionTitle: "#222222",
    paymentSecurityBadgeBg: "#E0F7FF",
    paymentSecurityBadgeText: "#0E4659",
    paymentIconColor: "#27C7FF",
    paymentExclusiveBadgeIcon: "#27C7FF",
    
    // FAQ Section
    faqTitle: "#222222",
    faqSubtitle: "#27C7FF",
    faqCardBg: "#FFFFFF",
    faqCardBorder: "#E5E7EB",
    faqQuestionText: "#222222",
    faqAnswerText: "#64748B",
    faqIconColor: "#27C7FF",

    // Why Schedule Section
    whyScheduleBg: "#FFFFFF",
    whyScheduleTitle: "#222222",
    whyScheduleStatsWrapperBg: "#0A3542",
    whyScheduleStatsCardBg: "#0D4A5C",
    whyScheduleStatsAccent: "#27C7FF",
    whyScheduleStatsText: "#FFFFFF",
    whyScheduleFeatureCardBg: "#BCEEFF",
    whyScheduleFeatureIconBg: "#27C7FF",
    whyScheduleFeatureIcon: "#FFFFFF",
    whyScheduleFeatureText: "#0E4659",
    whyScheduleResourcesTitle: "#222222",
    whyScheduleResourcesIconBorder: "#27C7FF",
    whyScheduleResourcesIcon: "#27C7FF",
    whyScheduleResourcesText: "#0E4659",

    // About Us Section
    aboutUsBg: "#FFFFFF",
    aboutUsTitle: "#222222",
    aboutUsCardBg: "#FFFFFF",
    aboutUsBorder: "rgba(14,70,89,0.2)",
    aboutUsQuote: "#0E4659",
    aboutUsText: "#404040",
    aboutUsSignature: "#404040",
    aboutUsGradientStart: "#0E4659",
    aboutUsGradientEnd: "#27C7FF",

    // Lisbon Banner
    lisbonBannerBg: "#FFFFFF",
    lisbonBannerTopFade: "#FFFFFF",
    lisbonBannerBottomFade: "#FFFFFF",

    // Tours Section
    toursBg: "#FFFFFF",
    toursTitle: "#222222",
    toursDescription: "#222222",
    toursFeatureBadgeBg: "#D5F6EA",
    toursFeatureBadgeText: "#008354",
    toursFeatureIcon: "#008354",
    toursCardOverlay: "rgba(0,0,0,0.7)",
    toursCardTitle: "#FFFFFF",
    toursCardArrowBg: "#FFFFFF",
    toursCardArrowIcon: "#222222",
    toursExploreCardBgStart: "#27C7FF",
    toursExploreCardBgEnd: "#0E9FD8",
    toursExploreCardText: "#FFFFFF",
    toursDotsActive: "#27C7FF",
    toursDotsInactive: "#27C7FF",
    toursNavButtonBg: "#EBEBEB",
    toursNavButtonIcon: "#222222",
    toursCtaBg: "#27C7FF",
    toursCtaText: "#FFFFFF",

    // Newsletter Section
    newsletterBg: "#FFFFFF",
    newsletterCardBg: "#0E4659",
    newsletterTitle: "#FFFFFF",
    newsletterTitleAccent: "#27C7FF",
    newsletterInputBg: "#FFFFFF",
    newsletterInputBorder: "#D1D5DB",
    newsletterInputText: "#222222",
    newsletterInputIcon: "#808080",
    newsletterButtonBg: "#27C7FF",
    newsletterButtonText: "#FFFFFF",

    // Social Section
    socialBg: "#FFFFFF",
    socialTitle: "#222222",
    socialTitleAccent: "#27C7FF",
    socialProfileText: "#000000",
    socialMetaText: "#65758B",
    socialFollowButtonBg: "#27C7FF",
    socialFollowButtonText: "#161616",
    socialFollowButtonIcon: "#161616",
    socialNavButtonBg: "#FFFFFF",
    socialNavButtonIcon: "#000000",

    // WhatsApp Floating Button
    whatsappFloatBg: "#27C7FF",
    whatsappFloatIcon: "#FFFFFF",

    // Checkout - Generic Input Settings
    checkoutInputBg: "#FFFFFF",
    checkoutInputBorder: "#E5E7EB",
    checkoutInputText: "#222222",
    checkoutInputPlaceholder: "#9CA3AF",
    checkoutInputIcon: "#27C7FF",
    checkoutInputLabelText: "#222222",

    // Checkout - Primary Button Settings
    checkoutPrimaryButtonBg: "#27C7FF",
    checkoutPrimaryButtonText: "#FFFFFF",
    checkoutPrimaryButtonIcon: "#FFFFFF",

    // Checkout - Radio Button Settings
    checkoutRadioSelectedFill: "#27C7FF",

    // Checkout - Trust Banner Settings
    checkoutTrustBannerBg: "#0E4659",
    checkoutTrustBannerIconBg: "#FFFFFF",
    checkoutTrustBannerIcon: "#0E4659",
    checkoutTrustBannerTitle: "#FFFFFF",
    checkoutTrustBannerDescription: "#FFFFFFB3",
    checkoutTrustBannerDotActive: "#27C7FF",
    checkoutTrustBannerDotInactive: "#FFFFFF80",

    // Checkout - Header Settings
    checkoutHeaderBg: "#27C7FF",
    checkoutHeaderLogoBg: "#000000",
    checkoutHeaderLogoText: "#FFFFFF",
    checkoutHeaderLogoBorder: "#FBB03B",
    checkoutStepActiveBg: "#0E4659",
    checkoutStepActiveText: "#FFFFFF",
    checkoutStepInactiveBg: "#FFFFFF",
    checkoutStepInactiveText: "#6B7280",
    checkoutStepConnectorActive: "#0E4659",
    checkoutStepConnectorInactive: "#9CA3AF",

    // Checkout - Vehicle Card Settings
    checkoutVehicleCardBg: "#FFFFFF",
    checkoutVehicleCardBorder: "#DEDEDE",
    checkoutVehicleCardTitle: "#222222",
    checkoutVehicleCardPrice: "#000000",
    checkoutVehicleCardPriceSubtext: "#A0A0A0",
    checkoutVehicleCardBadgeBg: "#E9F9FF",
    checkoutVehicleCardBadgeText: "#0E4659",
    checkoutVehicleCardBadgeIcon: "#0E4659",
    checkoutVehicleElectricBadgeBg: "#ABEDD5",
    checkoutVehicleElectricBadgeText: "#008354",

    // Checkout - Language Switcher Settings
    checkoutLangSwitcherBg: "#FFFFFF",
    checkoutLangSwitcherBorder: "#E5E7EB",
    checkoutLangSwitcherText: "#374151",
    checkoutLangSwitcherChevron: "#27C7FF",
    checkoutLangSwitcherDropdownBg: "#FFFFFF",
    checkoutLangSwitcherDropdownBorder: "#F3F4F6",
    checkoutLangSwitcherDropdownHoverBg: "#F3F4F6",
    checkoutLangSwitcherCheckIcon: "#27C7FF",

    // Checkout - Page Background
    checkoutPageBg: "#F5F5F5",

    // Checkout - Order Summary
    checkoutOrderSummaryBg: "#FFFFFF",
    checkoutOrderSummaryTitle: "#222222",
    checkoutOrderSummaryText: "#222222",
    checkoutOrderSummaryMutedText: "#808080",
    checkoutOrderSummaryTotalBg: "#F3F4F4",
    checkoutOrderSummaryTotalPrice: "#222222",
    checkoutOrderSummaryBadgeBg: "#E9F9FF",
    checkoutOrderSummaryBadgeText: "#0E4659",
    checkoutOrderSummaryBadgeIcon: "#0E4659",
    checkoutOrderSummaryAccentPrice: "#27C7FF",
    checkoutOrderSummaryDivider: "#E0E0E0",

    // Checkout - Form Card Settings
    checkoutFormCardBg: "#FFFFFF",
    checkoutFormCardTitle: "#222222",
    checkoutExperiencesSectionTitle: "#222222",
    checkoutExperiencesSectionSubtitle: "#222222",
    checkoutFormLabelText: "#222222",
    checkoutFormTabActiveBg: "#27C7FF",
    checkoutFormTabActiveText: "#FFFFFF",
    checkoutFormTabInactiveBg: "#F7F7F7",
    checkoutFormTabInactiveText: "#222222",
    checkoutFormInfoBoxBg: "#F5F5F5",
    checkoutFormInfoBoxText: "#404040",
    checkoutFormInfoBoxIcon: "#27C7FF",
    checkoutFormHighlightBg: "#DFF7FF",
    checkoutFormHighlightText: "#0E4659",
    checkoutFormCheckboxBg: "#F7F7F7",
    checkoutFormLinkText: "#27C7FF",
    checkoutFormErrorText: "#D60510",
    checkoutFormSuccessText: "#27C7FF",

    // Checkout - Counter/Stepper Settings
    checkoutCounterBg: "#FFFFFF",
    checkoutCounterBorder: "#E5E7EB",
    checkoutCounterButtonBg: "#27C7FF",
    checkoutCounterButtonIcon: "#FFFFFF",
    checkoutCounterValueText: "#222222",

    // Checkout - Payment Method Buttons
    checkoutPaymentMethodSelectedBg: "#E9F9FF",
    checkoutPaymentMethodSelectedBorder: "#27C7FF",
    checkoutPaymentMethodUnselectedBg: "#FFFFFF",
    checkoutPaymentMethodUnselectedBorder: "#E0E0E0",
    checkoutPaymentMethodIcon: "#222222",
    checkoutPaymentMethodText: "#222222",

    // Checkout - Insurance Cards
    checkoutInsuranceHeaderBg: "#48D9A4",
    checkoutInsuranceCheckBg: "#48D9A4",
    checkoutInsuranceCheckIcon: "#FFFFFF",
    checkoutInsuranceRecommendedBg: "#48D9A4",
    checkoutInsuranceRecommendedText: "#FFFFFF",

    // Checkout - Security Banner
    checkoutSecurityBannerBg: "#E9F9FF",
    checkoutSecurityBannerBorder: "#1D95BF",
    checkoutSecurityBannerIcon: "#0E4659",
    checkoutSecurityBannerTitle: "#0E4659",
    checkoutSecurityBannerText: "#177799",

    // Checkout - Footer Settings
    checkoutFooterBg: "#27C7FF",
    checkoutFooterHeadingText: "#003554",
    checkoutFooterLabelText: "#003554",
    checkoutFooterLinkText: "#003554",
    checkoutFooterCopyrightText: "#003554",
    checkoutFooterSocialIconBg: "#222222",
    checkoutFooterSocialIconColor: "#27C7FF",

    // Legacy
    text: "#222222",
    border: "#DEDEDE",
  },
  borderRadius: 8,
};

interface DynamicThemeContextType {
  theme: ThemeConfig;
  setTheme?: (theme: ThemeConfig) => void;
  isPreviewMode: boolean;
  onElementClick?: (colorType: string) => void;
  logoUrl?: string | null;
}

const DynamicThemeContext = createContext<DynamicThemeContextType>({
  theme: defaultTheme,
  isPreviewMode: false,
});

export const useDynamicTheme = () => useContext(DynamicThemeContext);

export function detectColorType(element: HTMLElement): string | null {
  const computedStyle = window.getComputedStyle(element);
  const tagName = element.tagName.toLowerCase();

  const classNameStr = typeof element.className === 'string'
    ? element.className
    : (element.className as any)?.baseVal || '';

  // Explicit mapping wins over heuristic detection.
  const explicitColorElement = element.closest('[data-theme-color]') as HTMLElement | null;
  const explicitColor = explicitColorElement?.dataset.themeColor;
  if (explicitColor) {
    return explicitColor;
  }

  const experiencesStep = element.closest('.checkout-experiences-step');
  if (experiencesStep) {
    if (tagName === 'h1') {
      return 'checkoutExperiencesSectionTitle';
    }
    if (tagName === 'h2' || tagName === 'h3') {
      return 'checkoutExperiencesSectionSubtitle';
    }
  }

  const checkoutHeader = element.closest('.checkout-header');
  if (checkoutHeader) {
    if (element.closest('.checkout-header-logo')) {
      return null;
    }
    
    const stepButton = element.closest('button');
    if (stepButton) {
      const stepCircle = element.closest('.rounded-full');
      if (stepCircle) {
        const bgColor = window.getComputedStyle(stepCircle).backgroundColor;
        if (bgColor.includes('14, 70, 89') || classNameStr.includes('active')) {
          if (tagName === 'span' || classNameStr.includes('text')) return 'checkoutStepActiveText';
          return 'checkoutStepActiveBg';
        }
        return 'checkoutStepInactiveBg';
      }
      if (tagName === 'span' || tagName === 'div') {
        return 'checkoutStepActiveText';
      }
    }
    
    if (classNameStr.includes('w-12') || classNameStr.includes('w-8') || element.closest('.w-12')) {
      return 'checkoutStepConnectorInactive';
    }
    
    if (element.closest('.bg-\\[\\#4A5568\\]') || classNameStr.includes('4A5568')) {
      return 'checkoutHeaderBg';
    }
    
    return 'checkoutHeaderBg';
  }

  const langSwitcher = element.closest('.checkout-lang-switcher');
    if (langSwitcher) {
    // Dropdown menu
    if (element.closest('.absolute.top-full')) {
      if (tagName === 'svg' || element.closest('svg')) return 'checkoutLangSwitcherCheckIcon';
      if (tagName === 'span') return 'checkoutLangSwitcherText';
      return 'checkoutLangSwitcherDropdownBg';
    }
    
    // Chevron icon
    if (tagName === 'svg' || element.closest('svg')) {
      return 'checkoutLangSwitcherChevron';
    }
    
    // Text
    if (tagName === 'span') {
      return 'checkoutLangSwitcherText';
    }
    
    // Button/container
    return 'checkoutLangSwitcherBg';
  }

  // Trust Banner Detection (checkout)
  const trustBanner = element.closest('.checkout-trust-banner');
  if (trustBanner) {
    // Icon background
    if (classNameStr.includes('rounded-lg') && classNameStr.includes('p-3')) {
      if (tagName === 'svg' || element.closest('svg')) return 'checkoutTrustBannerIcon';
      return 'checkoutTrustBannerIconBg';
    }
    
    // Icons
    if (tagName === 'svg' || element.closest('svg')) {
      return 'checkoutTrustBannerIcon';
    }
    
    // Title text
    if (tagName === 'h3' || element.closest('h3')) {
      return 'checkoutTrustBannerTitle';
    }
    
    // Description text
    if (tagName === 'p' || element.closest('p')) {
      return 'checkoutTrustBannerDescription';
    }
    
    // Carousel dots
    if (classNameStr.includes('rounded-full') && (classNameStr.includes('w-2') || classNameStr.includes('w-3'))) {
      return 'checkoutTrustBannerDotActive';
    }
    
    return 'checkoutTrustBannerBg';
  }

  // Vehicle Card Detection
  const vehicleCard = element.closest('.checkout-vehicle-card');
  if (vehicleCard) {
    // Electric badge
    if (element.closest('.electric-badge') || classNameStr.includes('electric-badge')) {
      if (tagName === 'svg' || element.closest('svg') || tagName === 'span') {
        return 'checkoutVehicleElectricBadgeText';
      }
      return 'checkoutVehicleElectricBadgeBg';
    }
    
    // Info badges (passengers, luggage)
    const badgeContainer = element.closest('.rounded-full');
    if (badgeContainer && (classNameStr.includes('bg-') || badgeContainer.querySelector('svg'))) {
      if (tagName === 'svg' || element.closest('svg')) return 'checkoutVehicleCardBadgeIcon';
      if (tagName === 'span') return 'checkoutVehicleCardBadgeText';
      return 'checkoutVehicleCardBadgeBg';
    }
    
    // Vehicle title
    if (tagName === 'h3' || element.closest('h3')) {
      return 'checkoutVehicleCardTitle';
    }
    
    // Price
    if (classNameStr.includes('text-3xl') || classNameStr.includes('font-bold')) {
      if (element.textContent?.includes('€') || element.textContent?.includes('$')) {
        return 'checkoutVehicleCardPrice';
      }
    }
    
    // Price subtext
    if (classNameStr.includes('text-sm') && classNameStr.includes('text-')) {
      return 'checkoutVehicleCardPriceSubtext';
    }
    
    // Select button
    if (tagName === 'button' || element.closest('button')) {
      const btn = (element.closest('button') || element) as HTMLElement;
      if (btn.textContent?.toLowerCase().includes('select') || btn.textContent?.toLowerCase().includes('selecionar')) {
        if (tagName === 'svg' || element.closest('svg')) return 'checkoutPrimaryButtonIcon';
        if (tagName === 'span') return 'checkoutPrimaryButtonText';
        return 'checkoutPrimaryButtonBg';
      }
    }
    
    // Card border/background
    if (classNameStr.includes('border') || element === vehicleCard) {
      return 'checkoutVehicleCardBg';
    }
    
    return 'checkoutVehicleCardBg';
  }

  // Checkout Input Detection
  const checkoutInput = element.closest('.checkout-input');
  if (checkoutInput) {
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return 'checkoutInputText';
    }
    if (tagName === 'label') {
      return 'checkoutInputLabelText';
    }
    if (tagName === 'svg' || element.closest('svg')) {
      return 'checkoutInputIcon';
    }
    return 'checkoutInputBg';
  }

  // Checkout Primary Button Detection
  const primaryButton = element.closest('.checkout-primary-button');
  if (primaryButton) {
    if (tagName === 'svg' || element.closest('svg')) return 'checkoutPrimaryButtonIcon';
    if (tagName === 'span') return 'checkoutPrimaryButtonText';
    return 'checkoutPrimaryButtonBg';
  }

  // Checkout Order Summary Detection
  const checkoutOrderSummary = element.closest('.checkout-order-summary');
  if (checkoutOrderSummary) {
    // Accent price (blue)
    const elementColor = window.getComputedStyle(element).color;
    if (elementColor.includes('39, 199, 255') || elementColor.includes('rgb(39, 199, 255)')) {
      return 'checkoutOrderSummaryAccentPrice';
    }

    // Title text (h2, h3)
    if (tagName === 'h2' || tagName === 'h3' || element.closest('h2') || element.closest('h3')) {
      return 'checkoutOrderSummaryTitle';
    }

    // Badges
    const badge = element.closest('.rounded-full');
    if (badge) {
      const bgColor = window.getComputedStyle(badge).backgroundColor;
      if (bgColor.includes('233, 249, 255') || bgColor.includes('rgb(233, 249, 255)')) {
        if (tagName === 'svg' || element.closest('svg')) return 'checkoutOrderSummaryBadgeIcon';
        if (tagName === 'span' || tagName === 'p') return 'checkoutOrderSummaryBadgeText';
        return 'checkoutOrderSummaryBadgeBg';
      }
    }

    // Total box
    const totalBox = element.closest('.rounded-xl');
    if (totalBox) {
      const bgColor = window.getComputedStyle(totalBox).backgroundColor;
      if (bgColor.includes('243, 244, 244') || bgColor.includes('rgb(243, 244, 244)')) {
        // Large price in total box
        if (classNameStr.includes('text-[32px]') || classNameStr.includes('text-[36px]')) {
          return 'checkoutOrderSummaryTotalPrice';
        }
        return 'checkoutOrderSummaryTotalBg';
      }
    }

    // Dividers
    if (element.style.borderTop || classNameStr.includes('border-t')) {
      return 'checkoutOrderSummaryDivider';
    }

    // Muted text
    const textColor = window.getComputedStyle(element).color;
    if (textColor.includes('128, 128, 128') || textColor.includes('rgb(128, 128, 128)')) {
      return 'checkoutOrderSummaryMutedText';
    }

    // Regular text
    if (tagName === 'p' || tagName === 'span') {
      return 'checkoutOrderSummaryText';
    }

    // Default - card background
    return 'checkoutOrderSummaryBg';
  }

  // Checkout Form Card Detection
  const checkoutFormCard = element.closest('.checkout-form-card');
  if (checkoutFormCard) {
    // Error/Success messages
    if (classNameStr.includes('text-[#D60510]') || classNameStr.includes('text-red')) {
      return 'checkoutFormErrorText';
    }
    if (classNameStr.includes('text-[#27c7ff]') && tagName !== 'button' && !element.closest('button')) {
      return 'checkoutFormSuccessText';
    }

    // Tab buttons
    const isTabButton = element.closest('button')?.parentElement?.classList.contains('flex') &&
                        element.closest('button')?.parentElement?.classList.contains('gap-3');
    if (isTabButton) {
      const button = element.closest('button') as HTMLElement;
      const bgColor = window.getComputedStyle(button).backgroundColor;
      if (bgColor.includes('39, 199, 255') || bgColor.includes('rgb(39, 199, 255)')) {
        return 'checkoutFormTabActiveBg';
      }
      return 'checkoutFormTabInactiveBg';
    }

    // Card title (h2)
    if (tagName === 'h2' || element.closest('h2')) {
      return 'checkoutFormCardTitle';
    }

    // Labels
    if (tagName === 'label' || element.closest('label')) {
      return 'checkoutFormLabelText';
    }

    // Info boxes
    const infoBox = element.closest('.rounded-lg');
    if (infoBox) {
      const bgColor = window.getComputedStyle(infoBox).backgroundColor;
      // Info box (gray)
      if (bgColor.includes('245, 245, 245') || bgColor.includes('rgb(245, 245, 245)')) {
        if (tagName === 'svg' || element.closest('svg')) return 'checkoutFormInfoBoxIcon';
        if (tagName === 'p') return 'checkoutFormInfoBoxText';
        return 'checkoutFormInfoBoxBg';
      }
      // Highlight box (light blue)
      if (bgColor.includes('223, 247, 255') || bgColor.includes('rgb(223, 247, 255)')) {
        if (tagName === 'p' || tagName === 'label') return 'checkoutFormHighlightText';
        return 'checkoutFormHighlightBg';
      }
      // Checkbox background (light gray)
      if (bgColor.includes('247, 247, 247') || bgColor.includes('rgb(247, 247, 247)') ||
          bgColor.includes('248, 249, 250') || bgColor.includes('rgb(248, 249, 250)')) {
        return 'checkoutFormCheckboxBg';
      }
    }

    // Links (add stop, etc.)
    if (tagName === 'button' && !element.closest('.checkout-primary-button') && !element.closest('.checkout-counter')) {
      const color = window.getComputedStyle(element).color;
      if (color.includes('39, 199, 255') || color.includes('rgb(39, 199, 255)')) {
        return 'checkoutFormLinkText';
      }
    }

    // Counter/Stepper detection
    const counter = element.closest('.checkout-counter');
    if (counter) {
      // Counter button
      if (tagName === 'button' || element.closest('button')) {
        if (tagName === 'svg' || element.closest('svg')) return 'checkoutCounterButtonIcon';
        return 'checkoutCounterButtonBg';
      }
      // Value text
      if (tagName === 'span' && classNameStr.includes('font-bold')) {
        return 'checkoutCounterValueText';
      }
      // Counter container
      return 'checkoutCounterBg';
    }

    // Error message detection
    if (classNameStr.includes('error-message') || classNameStr.includes('text-[#D60510]') || classNameStr.includes('text-red')) {
      return 'checkoutFormErrorText';
    }

    // Success message detection
    if (classNameStr.includes('success-message')) {
      return 'checkoutFormSuccessText';
    }

    // Primary button within form
    if (element.closest('.checkout-primary-button')) {
      if (tagName === 'svg' || element.closest('svg')) return 'checkoutPrimaryButtonIcon';
      return 'checkoutPrimaryButtonBg';
    }

    // Radio button detection
    if (classNameStr.includes('checkout-radio-fill')) {
      return 'checkoutRadioSelectedFill';
    }
    if (classNameStr.includes('checkout-radio-selected')) {
      return 'checkoutRadioSelectedFill';
    }
    if (classNameStr.includes('checkout-radio-unselected')) {
      return 'checkoutInputBorder';
    }
    const radioLabel = element.closest('.checkout-radio');
    if (radioLabel) {
      // Radio fill
      if (classNameStr.includes('checkout-radio-fill')) return 'checkoutRadioSelectedFill';
      // Selected radio border
      if (element.closest('.checkout-radio-selected')) return 'checkoutRadioSelectedFill';
      // Unselected radio border
      if (element.closest('.checkout-radio-unselected')) return 'checkoutInputBorder';
      // Radio label text
      if (tagName === 'span') return 'checkoutFormLabelText';
    }

    // Payment Method Button detection
    const paymentMethodButton = element.closest('.checkout-payment-method-button');
    if (paymentMethodButton) {
      const isSelected = paymentMethodButton.classList.contains('checkout-payment-method-selected');
      // Icon
      if (tagName === 'svg' || element.closest('svg') || classNameStr.includes('checkout-payment-method-icon')) {
        return 'checkoutPaymentMethodIcon';
      }
      // Text
      if (classNameStr.includes('checkout-payment-method-text')) {
        return 'checkoutPaymentMethodText';
      }
      // Button background/border (selected or unselected)
      if (isSelected) {
        return 'checkoutPaymentMethodSelectedBg';
      }
      return 'checkoutPaymentMethodUnselectedBg';
    }

    // Insurance Card detection
    const insuranceCard = element.closest('.checkout-insurance-card');
    if (insuranceCard) {
      // Recommended badge
      if (classNameStr.includes('checkout-insurance-recommended')) {
        return 'checkoutInsuranceRecommendedBg';
      }
      // Check icon background
      if (classNameStr.includes('checkout-insurance-check')) {
        if (tagName === 'svg' || element.closest('svg')) return 'checkoutInsuranceCheckIcon';
        return 'checkoutInsuranceCheckBg';
      }
      // Header background
      if (classNameStr.includes('checkout-insurance-header')) {
        return 'checkoutInsuranceHeaderBg';
      }
    }

    // Security Banner detection
    const securityBanner = element.closest('.checkout-security-banner');
    if (securityBanner) {
      // Icon
      if (classNameStr.includes('checkout-security-banner-icon') || (tagName === 'svg' || element.closest('svg'))) {
        return 'checkoutSecurityBannerIcon';
      }
      // Title
      if (classNameStr.includes('checkout-security-banner-title')) {
        return 'checkoutSecurityBannerTitle';
      }
      // Text
      if (classNameStr.includes('checkout-security-banner-text')) {
        return 'checkoutSecurityBannerText';
      }
      // Background
      return 'checkoutSecurityBannerBg';
    }

    // Input field detection
    const inputField = element.closest('.checkout-input-field');
    if (inputField) {
      // Icon inside input
      if (tagName === 'svg' || element.closest('svg') || classNameStr.includes('checkout-input-icon')) {
        return 'checkoutInputIcon';
      }
      // Placeholder text
      if (classNameStr.includes('checkout-input-placeholder')) {
        return 'checkoutInputPlaceholder';
      }
      // Input container (border and background)
      return 'checkoutInputBg';
    }

    // Input label detection
    if (classNameStr.includes('checkout-input-label')) {
      return 'checkoutFormLabelText';
    }

    // Required asterisk
    if (classNameStr.includes('checkout-required-asterisk')) {
      return 'checkoutFormErrorText';
    }

    // Section title (h3)
    if (classNameStr.includes('checkout-section-title') || tagName === 'h3') {
      return 'checkoutFormLabelText';
    }

    // Muted text
    if (classNameStr.includes('checkout-muted-text')) {
      return 'checkoutOrderSummaryMutedText';
    }

    // Divider
    if (classNameStr.includes('checkout-divider')) {
      return 'checkoutOrderSummaryDivider';
    }

    // Info icon (the "i" circle)
    if (classNameStr.includes('checkout-info-icon')) {
      return 'checkoutInputBorder';
    }

    // Default - card background
    return 'checkoutFormCardBg';
  }

  // Checkout Footer Detection
  const checkoutFooter = element.closest('.checkout-footer');
  if (checkoutFooter) {
    // Social icons
    if (tagName === 'svg' || element.closest('svg')) {
      const svgElement = (tagName === 'svg' ? element : element.closest('svg')) as HTMLElement;
      const computedBg = window.getComputedStyle(svgElement).backgroundColor;
      // If SVG has a background color, clicking should target the icon background
      if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
        return 'checkoutFooterSocialIconBg';
      }
      return 'checkoutFooterSocialIconColor';
    }

    // Heading (h3 "Contact")
    if (tagName === 'h3' || element.closest('h3')) {
      return 'checkoutFooterHeadingText';
    }

    // Links (email, phone)
    if (tagName === 'a' || element.closest('a')) {
      return 'checkoutFooterLinkText';
    }

    // Labels (p tags with "Social:", "Email:", "Phones:")
    if (tagName === 'p') {
      const text = element.textContent || '';
      // Copyright text is in the center div
      if (element.closest('.text-center')) {
        return 'checkoutFooterCopyrightText';
      }
      // Label text
      return 'checkoutFooterLabelText';
    }

    // Footer background
    return 'checkoutFooterBg';
  }

  // Checkout Page Background Detection
  const checkoutMain = element.closest('main');
  if (checkoutMain && document.querySelector('.checkout-header')) {
    // If clicking on main background area (not on specific components)
    if (!element.closest('.checkout-trust-banner') &&
        !element.closest('.checkout-vehicle-card') &&
        !element.closest('.checkout-footer') &&
        !element.closest('.checkout-header') &&
        (tagName === 'main' || tagName === 'div')) {
      return 'checkoutPageBg';
    }
  }

  if (tagName === 'header' || element.closest('header')) {
    const header = element.closest('header');

    if (element.textContent === 'LOGOMARCA' || tagName === 'img' || element.closest('img')) {
       return 'logoBg';
    }

    if (tagName === 'button' || element.closest('button')) {
      const button = element.closest('button');

      if (button?.textContent?.toLowerCase().includes('book') || button?.textContent?.toLowerCase().includes('agende')) {
        if (tagName === 'span' || tagName === 'p' || (tagName === 'button' && !element.querySelector('span'))) return 'landingHeaderButtonText';
        if (tagName === 'svg' || element.closest('svg')) return 'landingHeaderButtonIcon';
        return 'landingHeaderButtonBg';
      }

      if (button?.classList.contains('bg-white') || button?.classList.contains('hover:bg-gray-50') || element.closest('.language-switcher')) {
         if (tagName === 'svg' || element.closest('svg')) return 'landingHeaderMenuIcon';
         return 'landingHeaderMenuBg';
      }

      if (button?.getAttribute('aria-label')?.includes('menu') || element.closest('[aria-label*="menu"]')) return 'landingHeaderMenuIcon';

      if (tagName === 'svg' || element.closest('svg')) return 'landingHeaderButtonIcon';
      return 'landingHeaderButtonBg';
    }

    if (tagName === 'svg' || element.closest('svg')) {
       if (element.closest('.language-switcher')) return 'landingHeaderMenuIcon';
       return 'landingHeaderButtonIcon';
    }

    if (tagName === 'a' || tagName === 'p' || tagName === 'span' || tagName === 'div') {
      if (classNameStr.includes('border-b') || classNameStr.includes('border-gray-100') || classNameStr.includes('border-black/5')) return 'landingHeaderMenuBorder';

      if (classNameStr.includes('hover:')) return 'landingHeaderHoverText';
      if (classNameStr.includes('text-gray-400') || classNameStr.includes('text-zinc-400')) return 'landingHeaderHoverText';
      return 'landingHeaderText';
    }

    return 'landingHeaderBg';
  }

  const heroSection = element.closest('.hero-section');
  if (heroSection) {
    if (element.closest('.hero-badge')) {
      if (tagName === 'svg' || element.closest('svg')) return 'heroBadgeIcon';
      if (tagName === 'span' || tagName === 'p') return 'heroBadgeText';
      return 'heroBadgeBg';
    }

    if (element.closest('.travelers-banner')) {
      if (tagName === 'svg' || element.closest('svg')) {
        if (classNameStr.includes('Flame') || classNameStr.includes('orange')) return 'heroBannerFlame';
        return 'heroBannerIcon';
      }
      if (tagName === 'span' && (element.classList.contains('font-bold') || element.closest('.font-bold'))) return 'heroTitle';
      if (tagName === 'span' || tagName === 'p') return 'heroSubtitle';
      return 'heroBannerBg';
    }

    if (element.closest('.bg-white.rounded-2xl.shadow-') || element.closest('[class*="BookingWidget"]') || element.closest('.relative.z-20.max-w-7xl')) {
      if (classNameStr.includes('border') || computedStyle.borderWidth !== '0px') {
         if (tagName !== 'button' && tagName !== 'input') return 'heroBookingBorder';
      }

      if (element.closest('[class*="TrustBanner"]') || element.closest('.shadow-\\[0_8px_24px_rgba')) {
        if (tagName === 'svg' || element.closest('svg')) {
           if (element.closest('.flex.gap-0\\.5') || classNameStr.includes('Star')) return 'heroTrustStarColor';
           return 'heroBookingIcon';
        }
        if (tagName === 'span' || tagName === 'p') return 'heroBookingText';
        return 'heroBookingBg';
      }

      if (tagName === 'button' || element.closest('button')) {
        const btn = element.closest('button');
        if (btn?.classList.contains('bg-[#29C5F6]') || btn?.textContent?.toLowerCase().includes('continue')) {
           if (tagName === 'svg' || element.closest('svg')) return 'heroBookingText';
           return 'heroBookingAccent';
        }
        if (btn?.textContent?.toLowerCase().includes('add') || btn?.textContent?.toLowerCase().includes('remove')) {
           return 'heroBookingText';
        }
      }

      if (element.closest('.relative.flex-1') || element.closest('.relative.flex') || element.closest('.relative.min-w-\\[140px\\]') || element.closest('[ref*="passengersRef"]') || element.closest('.calendar-arrow-icon')) {
        if (tagName === 'svg' || element.closest('svg') || element.classList.contains('calendar-arrow-icon') || element.closest('.calendar-arrow-icon')) return 'heroBookingIcon';
        if (tagName === 'input') return 'heroBookingInputText';
        if (tagName === 'span' || tagName === 'div') {
           if (classNameStr.includes('text-gray-400') || classNameStr.includes('placeholder')) return 'heroBookingPlaceholder';
           if (computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && computedStyle.backgroundColor !== 'transparent') return 'heroBookingInputHoverBg';
           return 'heroBookingInputText';
        }
      }

      if (tagName === 'label' || element.closest('label')) {
        if (element.classList.contains('rounded-full') || element.closest('.rounded-full')) return 'heroBookingAccent';
        return 'heroBookingText';
      }

      return 'heroBookingBg';
    }

    if (tagName === 'h1' || element.closest('h1')) return 'heroTitle';
    if (tagName === 'p' || element.closest('p')) return 'heroSubtitle';

    return 'heroBg';
  }

  if ((tagName === 'footer' || element.closest('footer')) && !element.closest('.checkout-footer')) {
    return 'footer';
  }

  const inPaymentSection = element.closest('section.payment-section');
  if (!element.closest('section#fleet') && !inPaymentSection && (tagName === 'svg' || element.closest('svg') || classNameStr.includes('icon') || element.closest('.calendar-arrow-icon'))) {
    return 'iconColor';
  }

  if (classNameStr.includes('electric-badge') || element.closest('.electric-badge')) {
    if (tagName === 'span' || tagName === 'p' || tagName === 'div' || tagName === 'svg' || element.closest('svg')) return 'electricBadgeText';
    return 'electricBadgeBg';
  }

  const inPaymentSectionExclusive = element.closest('section')?.classList.contains('payment-section');
  if (!inPaymentSectionExclusive && (classNameStr.includes('exclusive-badge') || element.closest('.exclusive-badge'))) {
    if (tagName === 'span' || tagName === 'p' || tagName === 'div') {
       return 'buttonText';
    }
    return 'exclusiveBadgeBg';
  }

  const button = element.closest('button') || (element.getAttribute('role') === 'button' ? element : null) as HTMLElement | null;

  if (element.textContent === 'LOGOMARCA' || tagName === 'img' || element.closest('img')) {
    if (element.textContent === 'LOGOMARCA') {
      if (tagName === 'span' || tagName === 'p' || tagName === 'div') return 'logoText';
      return 'logoBg';
    }
  }

  if (button && !element.closest('section#fleet')) {
    const buttonBgColor = window.getComputedStyle(button).backgroundColor;
    if (buttonBgColor && buttonBgColor !== 'rgba(0, 0, 0, 0)' && buttonBgColor !== 'transparent') {
      return 'buttonBg';
    }
    return 'buttonText';
  }

  const bgColor = computedStyle.backgroundColor;

  if (classNameStr.includes('27C7FF') || classNameStr.includes('29C5F6') || classNameStr.includes('48CAE4') || classNameStr.includes('cyan') || classNameStr.includes('sky')) {
    if (tagName === 'button' || element.getAttribute('role') === 'button' || classNameStr.includes('bg-')) {
      return 'buttonBg';
    }
    return 'linkText';
  }

  if (classNameStr.includes('FBB03B') || classNameStr.includes('orange') || classNameStr.includes('00C569') || classNameStr.includes('emerald') || classNameStr.includes('00B67A') || classNameStr.includes('emerald-700')) {
    return 'accent';
  }

  if (classNameStr.includes('0E4659') || classNameStr.includes('0e4659')) {
    return 'secondary';
  }

  if (element.closest('section#reviews')) {
    if (element.closest('.rounded-2xl.p-6.shadow-lg')) {
      if (tagName === 'h3' || element.closest('h3')) return 'headingText';
      if (classNameStr.includes('text-xs') || classNameStr.includes('text-gray-400')) return 'mutedText';
      if (tagName === 'p' && !element.closest('h3')) return 'bodyText';
      if (tagName === 'svg' || element.closest('svg')) return 'primary';
      return 'cardBg';
    }
    const bgContainer = element.closest('.rounded-3xl.relative');
    if (bgContainer && (element === bgContainer || bgContainer.contains(element))) {
      return 'testimonialGradientStart';
    }
    if (tagName === 'button' || element.closest('button')) {
      if (tagName === 'svg' || element.closest('svg')) return 'buttonText';
      return 'buttonBg';
    }
    return 'background';
  }

  const featuresSection = element.closest('section')?.querySelector('h2');
  if (featuresSection && (featuresSection.textContent?.includes('agendar') || featuresSection.textContent?.includes('schedule') || featuresSection.textContent?.includes('Why'))) {
    const section = element.closest('section');
    if (section && !element.closest('header') && !element.closest('footer') && !element.closest('.hero-section')) {
      if (element.closest('.rounded-xl.p-6')) {
        if (tagName === 'svg' || element.closest('svg')) return 'iconColor';
        if (tagName === 'h3' || element.closest('h3')) return 'featureCardTitle';
        if (tagName === 'p' || element.closest('p')) return 'featureCardDescription';
        return 'featureCardBg';
      }
      if (tagName === 'h2' || element.closest('h2')) return 'featuresSectionTitle';
      return 'background';
    }
  }

  if (element.closest('section#fleet')) {
    if (element.closest('.electric-badge')) {
      if (tagName === 'svg' || element.closest('svg') || tagName === 'span') return 'electricBadgeText';
      return 'electricBadgeBg';
    }
    if (element.closest('.rounded-2xl.p-6')) {
      if (element.closest('.rounded-full') && element.closest('.px-4.py-2')) {
        if (tagName === 'svg' || element.closest('svg')) return 'fleetIconColor';
        if (tagName === 'span') return 'fleetCapacityBadgeText';
        return 'fleetCapacityBadgeBg';
      }
      if (tagName === 'h3' || element.closest('h3')) return 'fleetVehicleName';
      return 'fleetVehicleCardBg';
    }
    if (tagName === 'h2' || element.closest('h2')) return 'fleetSectionTitle';
    if (tagName === 'button' || element.closest('button')) {
      if (tagName === 'svg' || element.closest('svg')) return 'buttonText';
      return 'buttonBg';
    }
    return 'background';
  }

  if (element.closest('section.payment-section')) {
    if (element.closest('.exclusive-badge')) {
      if (tagName === 'svg' || element.closest('svg')) return 'paymentExclusiveBadgeIcon';
      if (tagName === 'span' || tagName === 'p' || tagName === 'div') return 'buttonText';
      return 'exclusiveBadgeBg';
    }
    if (element.closest('.rounded-full') && (element.closest('.px-5.py-3') || element.closest('.inline-flex.items-center.gap-2'))) {
      if (tagName === 'svg' || element.closest('svg')) return 'paymentIconColor';
      if (tagName === 'span') return 'paymentSecurityBadgeText';
      return 'paymentSecurityBadgeBg';
    }
    if (tagName === 'h2' || element.closest('h2')) return 'paymentSectionTitle';
    if (tagName === 'p' && !element.closest('.rounded-full') && !element.closest('.exclusive-badge')) return 'secondary';
    return 'background';
  }

  if (element.closest('section#faq')) {
    if (element.closest('.border.rounded-lg')) {
      if (element.closest('button')) {
        if (tagName === 'svg' || element.closest('svg')) return 'faqIconColor';
        if (tagName === 'span') return 'faqQuestionText';
        return 'faqCardBg';
      }
      if (tagName === 'div' && !element.closest('button')) return 'faqAnswerText';
      return 'faqCardBorder';
    }
    if (tagName === 'h2' || element.closest('h2')) return 'faqTitle';
    if (tagName === 'p' && element.closest('.mb-12')) return 'faqSubtitle';
    return 'background';
  }

  if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
    return 'headingText';
  }
  
  if (tagName === 'a') {
    return 'linkText';
  }
  
  if (tagName === 'button' || element.getAttribute('role') === 'button') {
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return 'buttonBg';
    }
    return 'buttonText';
  }
  
  if (tagName === 'p' || tagName === 'span' || tagName === 'div' || tagName === 'label') {
    if (classNameStr.includes('text-gray-400') || classNameStr.includes('text-slate-400') || classNameStr.includes('text-zinc-400') || classNameStr.includes('text-gray-300')) {
      return 'mutedText';
    }
    
    if (classNameStr.includes('font-bold') || classNameStr.includes('text-gray-900') || classNameStr.includes('text-slate-900')) {
      return 'headingText';
    }

    const fontSize = parseFloat(computedStyle.fontSize);
    if (fontSize < 14) {
      return 'mutedText';
    }
    
    if (tagName === 'p') {
       return 'bodyText';
    }
  }

  if (classNameStr.includes('card') || (classNameStr.includes('rounded-') && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent')) {
    if (element.closest('section') && element.closest('section')?.querySelector('h2')?.textContent?.includes('Porque agendar connosco?')) {
        return 'featureCardBg';
    }
    if (classNameStr.includes('badge') || classNameStr.includes('rounded-full') || (element.offsetWidth < 150 && element.offsetHeight < 40)) {
        if (element.closest('.exclusive-badge')) return 'secondary';
        return 'badgeBg';
    }
    return 'cardBg';
  }

  return 'bodyText';
}

export function DynamicThemeProvider({
  children,
  theme: customTheme,
  setTheme,
  isPreviewMode = false,
  logoUrl,
}: {
  children: React.ReactNode;
  theme?: Partial<ThemeConfig>;
  setTheme?: (theme: ThemeConfig) => void;
  isPreviewMode?: boolean;
  logoUrl?: string | null;
}) {
  const theme = useMemo(() => ({
    ...defaultTheme,
    ...customTheme,
    colors: {
      ...defaultTheme.colors,
      ...(customTheme?.colors || {})
    }
  }), [customTheme]);

  const cssVariables = useMemo(() => {
    const { colors, borderRadius } = theme;
    return {
      "--theme-primary": colors.primary,
      "--theme-secondary": colors.secondary,
      "--theme-accent": colors.accent,
      "--theme-landing-header-bg": colors.landingHeaderBg,
      "--theme-landing-header-text": colors.landingHeaderText,
      "--theme-landing-header-hover-text": colors.landingHeaderHoverText,
      "--theme-landing-header-button-bg": colors.landingHeaderButtonBg,
      "--theme-landing-header-button-text": colors.landingHeaderButtonText,
      "--theme-landing-header-button-icon": colors.landingHeaderButtonIcon,
      "--theme-landing-header-menu-icon": colors.landingHeaderMenuIcon,
      "--theme-landing-header-menu-bg": colors.landingHeaderMenuBg,
      "--theme-landing-header-menu-border": colors.landingHeaderMenuBorder,
      "--theme-landing-header-menu-item-hover-bg": colors.landingHeaderMenuItemHoverBg,
      "--theme-hero-bg": colors.heroBg,
      "--theme-hero-title": colors.heroTitle,
      "--theme-hero-subtitle": colors.heroSubtitle,
      "--theme-hero-badge-bg": colors.heroBadgeBg,
      "--theme-hero-badge-text": colors.heroBadgeText,
      "--theme-hero-badge-icon": colors.heroBadgeIcon,
      "--theme-hero-banner-bg": colors.heroBannerBg,
      "--theme-hero-banner-icon": colors.heroBannerIcon,
      "--theme-hero-banner-flame": colors.heroBannerFlame,
      "--theme-hero-booking-bg": colors.heroBookingBg,
      "--theme-hero-booking-border": colors.heroBookingBorder,
      "--theme-hero-booking-input-bg": colors.heroBookingInputBg,
      "--theme-hero-booking-input-text": colors.heroBookingInputText,
      "--theme-hero-booking-placeholder": colors.heroBookingPlaceholder,
      "--theme-hero-booking-input-hover-bg": colors.heroBookingInputHoverBg,
      "--theme-hero-booking-text": colors.heroBookingText,
      "--theme-hero-booking-accent": colors.heroBookingAccent,
      "--theme-hero-booking-icon": colors.heroBookingIcon,
      "--theme-hero-trust-star-color": colors.heroTrustStarColor,
      "--theme-trusted-by-bg": colors.trustedByBg,
      "--theme-background": colors.background,
      "--theme-footer": colors.footer,
      "--theme-header-bg": colors.headerBg,
      "--theme-logo-bg": colors.logoBg,
      "--theme-logo-text": colors.logoText,
      "--theme-heading-text": colors.headingText,
      "--theme-body-text": colors.bodyText,
      "--theme-muted-text": colors.mutedText,
      "--theme-link-text": colors.linkText,
      "--theme-button-bg": colors.buttonBg,
      "--theme-button-text": colors.buttonText,
      "--theme-card-bg": colors.cardBg,
      "--theme-card-border": colors.cardBorder,
      "--theme-feature-card-bg": colors.featureCardBg,
      "--theme-input-border": colors.inputBorder,
      "--theme-badge-bg": colors.badgeBg,
      "--theme-badge-text": colors.badgeText,
      "--theme-exclusive-badge-bg": colors.exclusiveBadgeBg,
      "--theme-icon-color": colors.iconColor,
      "--theme-electric-badge-bg": colors.electricBadgeBg,
      "--theme-electric-badge-text": colors.electricBadgeText,
      "--theme-testimonial-gradient-start": colors.testimonialGradientStart,
      "--theme-testimonial-gradient-end": colors.testimonialGradientEnd,
      "--theme-features-section-title": colors.featuresSectionTitle,
      "--theme-feature-card-title": colors.featureCardTitle,
      "--theme-feature-card-description": colors.featureCardDescription,
      "--theme-fleet-section-title": colors.fleetSectionTitle,
      "--theme-fleet-vehicle-card-bg": colors.fleetVehicleCardBg,
      "--theme-fleet-vehicle-name": colors.fleetVehicleName,
      "--theme-fleet-capacity-badge-bg": colors.fleetCapacityBadgeBg,
      "--theme-fleet-capacity-badge-text": colors.fleetCapacityBadgeText,
      "--theme-fleet-icon-color": colors.fleetIconColor,
      "--theme-payment-section-title": colors.paymentSectionTitle,
      "--theme-payment-security-badge-bg": colors.paymentSecurityBadgeBg,
      "--theme-payment-security-badge-text": colors.paymentSecurityBadgeText,
      "--theme-payment-icon-color": colors.paymentIconColor,
      "--theme-payment-exclusive-badge-icon": colors.paymentExclusiveBadgeIcon,
      "--theme-faq-title": colors.faqTitle,
      "--theme-faq-subtitle": colors.faqSubtitle,
      "--theme-faq-card-bg": colors.faqCardBg,
      "--theme-faq-card-border": colors.faqCardBorder,
      "--theme-faq-question-text": colors.faqQuestionText,
      "--theme-faq-answer-text": colors.faqAnswerText,
      "--theme-faq-icon-color": colors.faqIconColor,
      "--theme-why-schedule-bg": colors.whyScheduleBg,
      "--theme-why-schedule-title": colors.whyScheduleTitle,
      "--theme-why-schedule-stats-wrapper-bg": colors.whyScheduleStatsWrapperBg,
      "--theme-why-schedule-stats-card-bg": colors.whyScheduleStatsCardBg,
      "--theme-why-schedule-stats-accent": colors.whyScheduleStatsAccent,
      "--theme-why-schedule-stats-text": colors.whyScheduleStatsText,
      "--theme-why-schedule-feature-card-bg": colors.whyScheduleFeatureCardBg,
      "--theme-why-schedule-feature-icon-bg": colors.whyScheduleFeatureIconBg,
      "--theme-why-schedule-feature-icon": colors.whyScheduleFeatureIcon,
      "--theme-why-schedule-feature-text": colors.whyScheduleFeatureText,
      "--theme-why-schedule-resources-title": colors.whyScheduleResourcesTitle,
      "--theme-why-schedule-resources-icon-border": colors.whyScheduleResourcesIconBorder,
      "--theme-why-schedule-resources-icon": colors.whyScheduleResourcesIcon,
      "--theme-why-schedule-resources-text": colors.whyScheduleResourcesText,
      "--theme-about-us-bg": colors.aboutUsBg,
      "--theme-about-us-title": colors.aboutUsTitle,
      "--theme-about-us-card-bg": colors.aboutUsCardBg,
      "--theme-about-us-border": colors.aboutUsBorder,
      "--theme-about-us-quote": colors.aboutUsQuote,
      "--theme-about-us-text": colors.aboutUsText,
      "--theme-about-us-signature": colors.aboutUsSignature,
      "--theme-about-us-gradient-start": colors.aboutUsGradientStart,
      "--theme-about-us-gradient-end": colors.aboutUsGradientEnd,
      "--theme-lisbon-banner-bg": colors.lisbonBannerBg,
      "--theme-lisbon-banner-top-fade": colors.lisbonBannerTopFade,
      "--theme-lisbon-banner-bottom-fade": colors.lisbonBannerBottomFade,
      "--theme-tours-bg": colors.toursBg,
      "--theme-tours-title": colors.toursTitle,
      "--theme-tours-description": colors.toursDescription,
      "--theme-tours-feature-badge-bg": colors.toursFeatureBadgeBg,
      "--theme-tours-feature-badge-text": colors.toursFeatureBadgeText,
      "--theme-tours-feature-icon": colors.toursFeatureIcon,
      "--theme-tours-card-overlay": colors.toursCardOverlay,
      "--theme-tours-card-title": colors.toursCardTitle,
      "--theme-tours-card-arrow-bg": colors.toursCardArrowBg,
      "--theme-tours-card-arrow-icon": colors.toursCardArrowIcon,
      "--theme-tours-explore-card-bg-start": colors.toursExploreCardBgStart,
      "--theme-tours-explore-card-bg-end": colors.toursExploreCardBgEnd,
      "--theme-tours-explore-card-text": colors.toursExploreCardText,
      "--theme-tours-dots-active": colors.toursDotsActive,
      "--theme-tours-dots-inactive": colors.toursDotsInactive,
      "--theme-tours-nav-button-bg": colors.toursNavButtonBg,
      "--theme-tours-nav-button-icon": colors.toursNavButtonIcon,
      "--theme-tours-cta-bg": colors.toursCtaBg,
      "--theme-tours-cta-text": colors.toursCtaText,
      "--theme-newsletter-bg": colors.newsletterBg,
      "--theme-newsletter-card-bg": colors.newsletterCardBg,
      "--theme-newsletter-title": colors.newsletterTitle,
      "--theme-newsletter-title-accent": colors.newsletterTitleAccent,
      "--theme-newsletter-input-bg": colors.newsletterInputBg,
      "--theme-newsletter-input-border": colors.newsletterInputBorder,
      "--theme-newsletter-input-text": colors.newsletterInputText,
      "--theme-newsletter-input-icon": colors.newsletterInputIcon,
      "--theme-newsletter-button-bg": colors.newsletterButtonBg,
      "--theme-newsletter-button-text": colors.newsletterButtonText,
      "--theme-social-bg": colors.socialBg,
      "--theme-social-title": colors.socialTitle,
      "--theme-social-title-accent": colors.socialTitleAccent,
      "--theme-social-profile-text": colors.socialProfileText,
      "--theme-social-meta-text": colors.socialMetaText,
      "--theme-social-follow-button-bg": colors.socialFollowButtonBg,
      "--theme-social-follow-button-text": colors.socialFollowButtonText,
      "--theme-social-follow-button-icon": colors.socialFollowButtonIcon,
      "--theme-social-nav-button-bg": colors.socialNavButtonBg,
      "--theme-social-nav-button-icon": colors.socialNavButtonIcon,
      "--theme-whatsapp-float-bg": colors.whatsappFloatBg,
      "--theme-whatsapp-float-icon": colors.whatsappFloatIcon,
      // Checkout - Generic Input Settings
      "--theme-checkout-input-bg": colors.checkoutInputBg,
      "--theme-checkout-input-border": colors.checkoutInputBorder,
      "--theme-checkout-input-text": colors.checkoutInputText,
      "--theme-checkout-input-placeholder": colors.checkoutInputPlaceholder,
      "--theme-checkout-input-icon": colors.checkoutInputIcon,
      "--theme-checkout-input-label-text": colors.checkoutInputLabelText,
      // Checkout - Primary Button Settings
      "--theme-checkout-primary-button-bg": colors.checkoutPrimaryButtonBg,
      "--theme-checkout-primary-button-text": colors.checkoutPrimaryButtonText,
      "--theme-checkout-primary-button-icon": colors.checkoutPrimaryButtonIcon,
      // Checkout - Radio Button Settings
      "--theme-checkout-radio-selected-fill": colors.checkoutRadioSelectedFill,
      // Checkout - Trust Banner Settings
      "--theme-checkout-trust-banner-bg": colors.checkoutTrustBannerBg,
      "--theme-checkout-trust-banner-icon-bg": colors.checkoutTrustBannerIconBg,
      "--theme-checkout-trust-banner-icon": colors.checkoutTrustBannerIcon,
      "--theme-checkout-trust-banner-title": colors.checkoutTrustBannerTitle,
      "--theme-checkout-trust-banner-description": colors.checkoutTrustBannerDescription,
      "--theme-checkout-trust-banner-dot-active": colors.checkoutTrustBannerDotActive,
      "--theme-checkout-trust-banner-dot-inactive": colors.checkoutTrustBannerDotInactive,
      // Checkout - Header Settings
      "--theme-checkout-header-bg": colors.checkoutHeaderBg,
      "--theme-checkout-header-logo-bg": colors.checkoutHeaderLogoBg,
      "--theme-checkout-header-logo-text": colors.checkoutHeaderLogoText,
      "--theme-checkout-header-logo-border": colors.checkoutHeaderLogoBorder,
      "--theme-checkout-step-active-bg": colors.checkoutStepActiveBg,
      "--theme-checkout-step-active-text": colors.checkoutStepActiveText,
      "--theme-checkout-step-inactive-bg": colors.checkoutStepInactiveBg,
      "--theme-checkout-step-inactive-text": colors.checkoutStepInactiveText,
      "--theme-checkout-step-connector-active": colors.checkoutStepConnectorActive,
      "--theme-checkout-step-connector-inactive": colors.checkoutStepConnectorInactive,
      // Checkout - Vehicle Card Settings
      "--theme-checkout-vehicle-card-bg": colors.checkoutVehicleCardBg,
      "--theme-checkout-vehicle-card-border": colors.checkoutVehicleCardBorder,
      "--theme-checkout-vehicle-card-title": colors.checkoutVehicleCardTitle,
      "--theme-checkout-vehicle-card-price": colors.checkoutVehicleCardPrice,
      "--theme-checkout-vehicle-card-price-subtext": colors.checkoutVehicleCardPriceSubtext,
      "--theme-checkout-vehicle-card-badge-bg": colors.checkoutVehicleCardBadgeBg,
      "--theme-checkout-vehicle-card-badge-text": colors.checkoutVehicleCardBadgeText,
      "--theme-checkout-vehicle-card-badge-icon": colors.checkoutVehicleCardBadgeIcon,
      "--theme-checkout-vehicle-electric-badge-bg": colors.checkoutVehicleElectricBadgeBg,
      "--theme-checkout-vehicle-electric-badge-text": colors.checkoutVehicleElectricBadgeText,
      // Checkout - Language Switcher Settings
      "--theme-checkout-lang-switcher-bg": colors.checkoutLangSwitcherBg,
      "--theme-checkout-lang-switcher-border": colors.checkoutLangSwitcherBorder,
      "--theme-checkout-lang-switcher-text": colors.checkoutLangSwitcherText,
      "--theme-checkout-lang-switcher-chevron": colors.checkoutLangSwitcherChevron,
      "--theme-checkout-lang-switcher-dropdown-bg": colors.checkoutLangSwitcherDropdownBg,
      "--theme-checkout-lang-switcher-dropdown-border": colors.checkoutLangSwitcherDropdownBorder,
      "--theme-checkout-lang-switcher-dropdown-hover-bg": colors.checkoutLangSwitcherDropdownHoverBg,
      "--theme-checkout-lang-switcher-check-icon": colors.checkoutLangSwitcherCheckIcon,
      // Checkout - Page Background
      "--theme-checkout-page-bg": colors.checkoutPageBg,
      // Checkout - Order Summary
      "--theme-checkout-order-summary-bg": colors.checkoutOrderSummaryBg,
      "--theme-checkout-order-summary-title": colors.checkoutOrderSummaryTitle,
      "--theme-checkout-order-summary-text": colors.checkoutOrderSummaryText,
      "--theme-checkout-order-summary-muted-text": colors.checkoutOrderSummaryMutedText,
      "--theme-checkout-order-summary-total-bg": colors.checkoutOrderSummaryTotalBg,
      "--theme-checkout-order-summary-total-price": colors.checkoutOrderSummaryTotalPrice,
      "--theme-checkout-order-summary-badge-bg": colors.checkoutOrderSummaryBadgeBg,
      "--theme-checkout-order-summary-badge-text": colors.checkoutOrderSummaryBadgeText,
      "--theme-checkout-order-summary-badge-icon": colors.checkoutOrderSummaryBadgeIcon,
      "--theme-checkout-order-summary-accent-price": colors.checkoutOrderSummaryAccentPrice,
      "--theme-checkout-order-summary-divider": colors.checkoutOrderSummaryDivider,
      // Checkout - Form Card Settings
      "--theme-checkout-form-card-bg": colors.checkoutFormCardBg,
      "--theme-checkout-form-card-title": colors.checkoutFormCardTitle,
      "--theme-checkout-experiences-section-title": colors.checkoutExperiencesSectionTitle,
      "--theme-checkout-experiences-section-subtitle": colors.checkoutExperiencesSectionSubtitle,
      "--theme-checkout-form-label-text": colors.checkoutFormLabelText,
      "--theme-checkout-form-tab-active-bg": colors.checkoutFormTabActiveBg,
      "--theme-checkout-form-tab-active-text": colors.checkoutFormTabActiveText,
      "--theme-checkout-form-tab-inactive-bg": colors.checkoutFormTabInactiveBg,
      "--theme-checkout-form-tab-inactive-text": colors.checkoutFormTabInactiveText,
      "--theme-checkout-form-info-box-bg": colors.checkoutFormInfoBoxBg,
      "--theme-checkout-form-info-box-text": colors.checkoutFormInfoBoxText,
      "--theme-checkout-form-info-box-icon": colors.checkoutFormInfoBoxIcon,
      "--theme-checkout-form-highlight-bg": colors.checkoutFormHighlightBg,
      "--theme-checkout-form-highlight-text": colors.checkoutFormHighlightText,
      "--theme-checkout-form-checkbox-bg": colors.checkoutFormCheckboxBg,
      "--theme-checkout-form-link-text": colors.checkoutFormLinkText,
      "--theme-checkout-form-error-text": colors.checkoutFormErrorText,
      "--theme-checkout-form-success-text": colors.checkoutFormSuccessText,
      // Checkout - Counter/Stepper Settings
      "--theme-checkout-counter-bg": colors.checkoutCounterBg,
      "--theme-checkout-counter-border": colors.checkoutCounterBorder,
      "--theme-checkout-counter-button-bg": colors.checkoutCounterButtonBg,
      "--theme-checkout-counter-button-icon": colors.checkoutCounterButtonIcon,
      "--theme-checkout-counter-value-text": colors.checkoutCounterValueText,
      // Checkout - Payment Method Buttons
      "--theme-checkout-payment-method-selected-bg": colors.checkoutPaymentMethodSelectedBg,
      "--theme-checkout-payment-method-selected-border": colors.checkoutPaymentMethodSelectedBorder,
      "--theme-checkout-payment-method-unselected-bg": colors.checkoutPaymentMethodUnselectedBg,
      "--theme-checkout-payment-method-unselected-border": colors.checkoutPaymentMethodUnselectedBorder,
      "--theme-checkout-payment-method-icon": colors.checkoutPaymentMethodIcon,
      "--theme-checkout-payment-method-text": colors.checkoutPaymentMethodText,
      // Checkout - Insurance Cards
      "--theme-checkout-insurance-header-bg": colors.checkoutInsuranceHeaderBg,
      "--theme-checkout-insurance-check-bg": colors.checkoutInsuranceCheckBg,
      "--theme-checkout-insurance-check-icon": colors.checkoutInsuranceCheckIcon,
      "--theme-checkout-insurance-recommended-bg": colors.checkoutInsuranceRecommendedBg,
      "--theme-checkout-insurance-recommended-text": colors.checkoutInsuranceRecommendedText,
      // Checkout - Security Banner
      "--theme-checkout-security-banner-bg": colors.checkoutSecurityBannerBg,
      "--theme-checkout-security-banner-border": colors.checkoutSecurityBannerBorder,
      "--theme-checkout-security-banner-icon": colors.checkoutSecurityBannerIcon,
      "--theme-checkout-security-banner-title": colors.checkoutSecurityBannerTitle,
      "--theme-checkout-security-banner-text": colors.checkoutSecurityBannerText,
      // Checkout - Footer Settings
      "--theme-checkout-footer-bg": colors.checkoutFooterBg,
      "--theme-checkout-footer-heading-text": colors.checkoutFooterHeadingText,
      "--theme-checkout-footer-label-text": colors.checkoutFooterLabelText,
      "--theme-checkout-footer-link-text": colors.checkoutFooterLinkText,
      "--theme-checkout-footer-copyright-text": colors.checkoutFooterCopyrightText,
      "--theme-checkout-footer-social-icon-bg": colors.checkoutFooterSocialIconBg,
      "--theme-checkout-footer-social-icon-color": colors.checkoutFooterSocialIconColor,
      "--theme-text": colors.text,
      "--theme-border": colors.border,
      "--theme-radius": `${borderRadius}px`,
    } as React.CSSProperties;
  }, [theme]);

  const handleElementClick = useCallback((colorType: string) => {
    if (isPreviewMode && window.parent !== window) {
      window.parent.postMessage({
        type: "THEME_ELEMENT_CLICKED",
        colorType,
      }, "*");
    }
  }, [isPreviewMode]);

  useEffect(() => {
    if (!isPreviewMode) return;

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rawTarget = e.target as EventTarget | null;
      const target =
        rawTarget instanceof HTMLElement
          ? rawTarget
          : rawTarget instanceof SVGElement
            ? (rawTarget as unknown as HTMLElement)
            : (rawTarget as Node | null)?.parentElement;
      if (!target) return;
      const colorType = detectColorType(target);

      if (colorType) {
        handleElementClick(colorType);

        target.style.outline = '2px solid #27C7FF';
        target.style.outlineOffset = '2px';
        setTimeout(() => {
          target.style.outline = '';
          target.style.outlineOffset = '';
        }, 500);
      }
    };

    document.body.style.cursor = 'pointer';
    document.addEventListener('click', handleClick, true);

    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('click', handleClick, true);
    };
  }, [isPreviewMode, handleElementClick]);

  const staticColorOverrides = `
    /* Button backgrounds */
    [data-theme-provider] button[class*="bg-"][class*="29C5F6"],
    [data-theme-provider] button[class*="bg-"][class*="27C7FF"],
    [data-theme-provider] button[class*="bg-"][class*="00a3d9"],
    [data-theme-provider] [class*="bg-"][class*="29C5F6"]:not(footer):not(footer *),
    [data-theme-provider] [class*="bg-"][class*="27C7FF"]:not(footer):not(footer *),
    [data-theme-provider] [class*="bg-"][class*="00a3d9"]:not(footer):not(footer *) {
      background-color: var(--theme-button-bg) !important;
      color: var(--theme-button-text) !important;
    }
    
    [data-theme-provider] button[class*="hover:bg-"]:hover {
      filter: brightness(0.9);
    }

    [data-theme-provider] button svg:not(header svg) {
      color: inherit !important;
      stroke: inherit !important;
    }

    /* Counter button icons - override with explicit CSS variable */
    [data-theme-provider] .checkout-counter button svg,
    .checkout-counter button svg {
      color: var(--theme-checkout-counter-button-icon, #FFFFFF) !important;
      stroke: var(--theme-checkout-counter-button-icon, #FFFFFF) !important;
    }

    /* Checkbox checkmark icons - keep white on colored background */
    [data-theme-provider] [data-slot="checkbox"] svg,
    [data-slot="checkbox"] svg,
    [data-theme-provider] .checkbox-custom svg,
    .checkbox-custom svg {
      color: white !important;
      stroke: white !important;
    }

    /* Buttons/links with explicit cyan color - preserve icon color */
    [data-theme-provider] button.text-\[\#27c7ff\] svg,
    [data-theme-provider] button.text-\[\#27C7FF\] svg,
    [data-theme-provider] a.text-\[\#27c7ff\] svg,
    [data-theme-provider] a.text-\[\#27C7FF\] svg,
    button.text-\[\#27c7ff\] svg,
    button.text-\[\#27C7FF\] svg {
      color: currentColor !important;
      stroke: currentColor !important;
    }

    /* Link-style buttons in checkout (Add stop, etc.) */
    [data-theme-provider] .checkout-link-button svg,
    .checkout-link-button svg {
      color: var(--theme-checkout-form-link-text, #27C7FF) !important;
      stroke: var(--theme-checkout-form-link-text, #27C7FF) !important;
    }

    /* Booking widget Continue button icon */
    [data-theme-provider] .booking-continue-button svg,
    .booking-continue-button svg {
      color: #0E4659 !important;
      stroke: #0E4659 !important;
    }

    /* Link/text colors */
    [data-theme-provider] [class*="text-"][class*="27C7FF"],
    [data-theme-provider] [class*="text-"][class*="29C5F6"],
    [data-theme-provider] [class*="text-"][class*="48CAE4"],
    [data-theme-provider] [class*="text-"][class*="00a3d9"],
    [data-theme-provider] [class*="text-"][class*="cyan"],
    [data-theme-provider] [class*="text-"][class*="sky"] {
      color: var(--theme-link-text) !important;
    }
    
    /* Borders */
    [data-theme-provider] [class*="border-"][class*="27C7FF"],
    [data-theme-provider] [class*="border-"][class*="29C5F6"],
    [data-theme-provider] [class*="border-"][class*="48CAE4"],
    [data-theme-provider] [class*="border-"][class*="00a3d9"],
    [data-theme-provider] [class*="border-"][class*="cyan"],
    [data-theme-provider] [class*="border-"][class*="sky"] {
      border-color: var(--theme-primary) !important;
    }

    /* Target specifically icons in the booking form that might be wrapped in divs */
    [data-theme-provider] .BookingWidget .absolute.left-4.top-1/2 svg,
    [data-theme-provider] .BookingWidget .flex.items-center.gap-2 svg:not(.TrustBanner svg) {
      color: var(--theme-hero-booking-icon) !important;
      stroke: var(--theme-hero-booking-icon) !important;
    }

    [data-theme-provider] svg[class*="text-"]:not(.text-white):not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] svg[class*="29C5F6"]:not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] svg[class*="48CAE4"]:not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] svg[class*="00a3d9"]:not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] svg[class*="cyan"]:not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] svg[class*="sky"]:not(header svg):not(footer svg):not(.BookingWidget svg),
    [data-theme-provider] [class*="text-"][class*="29C5F6"]:not(.text-white):not(header *):not(footer *):not(.BookingWidget *) svg,
    [data-theme-provider] [class*="text-"][class*="48CAE4"]:not(.text-white):not(header *):not(footer *):not(.BookingWidget *) svg,
    [data-theme-provider] [class*="text-"][class*="00a3d9"]:not(.text-white):not(header *):not(footer *):not(.BookingWidget *) svg {
      color: var(--theme-icon-color) !important;
      stroke: var(--theme-icon-color) !important;
    }

    /* Header Link Hovers */
    [data-theme-provider] header nav a:hover,
    [data-theme-provider] header nav button:hover,
    [data-theme-provider] .mobile-menu nav a:hover {
      color: var(--theme-landing-header-hover-text) !important;
    }

    [data-theme-provider] header svg {
       transition: color 0.2s, stroke 0.2s;
    }

    [data-theme-provider] header button:hover svg {
       color: var(--theme-landing-header-hover-text) !important;
       stroke: var(--theme-landing-header-hover-text) !important;
    }

    /* Hero Badges */
    [data-theme-provider] .hero-badge,
    [data-theme-provider] .inline-flex.items-center.gap-2.bg-\\[\\#E0F7FF\\] {
      background-color: var(--theme-hero-badge-bg) !important;
    }
    [data-theme-provider] .hero-badge span,
    [data-theme-provider] .inline-flex.items-center.gap-2.bg-\\[\\#E0F7FF\\] span {
      color: var(--theme-hero-badge-text) !important;
    }
    [data-theme-provider] .hero-badge svg,
    [data-theme-provider] .inline-flex.items-center.gap-2.bg-\\[\\#E0F7FF\\] svg {
      color: var(--theme-hero-badge-icon) !important;
      stroke: var(--theme-hero-badge-icon) !important;
    }

    /* Hero Title & Subtitle */
    [data-theme-provider] .hero-section h1 {
      color: var(--theme-hero-title) !important;
    }
    [data-theme-provider] .hero-section p:not(.travelers-banner *) {
      color: var(--theme-hero-subtitle) !important;
    }

    /* Hero Travelers Banner */
    [data-theme-provider] .travelers-banner {
      background-color: var(--theme-hero-banner-bg) !important;
    }
    [data-theme-provider] .travelers-banner p {
      color: var(--theme-hero-subtitle) !important;
    }
    [data-theme-provider] .travelers-banner .font-bold,
    [data-theme-provider] .travelers-banner span.font-bold {
      color: var(--theme-hero-title) !important;
    }
    [data-theme-provider] .travelers-banner svg:not(.text-orange-500):not([class*="orange"]):not(.Flame) {
      color: var(--theme-hero-banner-icon) !important;
      stroke: var(--theme-hero-banner-icon) !important;
    }

    [data-theme-provider] .travelers-banner svg.text-orange-500,
    [data-theme-provider] .travelers-banner svg[class*="orange"],
    [data-theme-provider] .travelers-banner .Flame,
    [data-theme-provider] .travelers-banner svg.Flame {
      color: var(--theme-hero-banner-flame) !important;
      stroke: var(--theme-hero-banner-flame) !important;
      fill: var(--theme-hero-banner-flame) !important;
    }

    /* Booking Widget Trip Types */
    [data-theme-provider] .booking-widget-trip-types label span,
    [data-theme-provider] .flex.flex-wrap.gap-3.mb-2 label span {
      color: var(--theme-hero-booking-text) !important;
    }
    [data-theme-provider] .booking-widget-trip-types label div[class*="border-"],
    [data-theme-provider] .flex.flex-wrap.gap-3.mb-2 label div[class*="border-"] {
      border-color: var(--theme-hero-booking-accent) !important;
    }
    [data-theme-provider] .booking-widget-trip-types label div div[class*="bg-"],
    [data-theme-provider] .flex.flex-wrap.gap-3.mb-2 label div div[class*="bg-"] {
      background-color: var(--theme-hero-booking-accent) !important;
    }

    /* Booking Widget Inputs & Placeholder */
    [data-theme-provider] .BookingWidget input,
    [data-theme-provider] .BookingWidget .DateTimePicker button,
    [data-theme-provider] .BookingWidget .GooglePlacesInput input,
    [data-theme-provider] .BookingWidget .booking-section {
      background-color: var(--theme-hero-booking-input-bg) !important;
      color: var(--theme-hero-booking-input-text) !important;
    }
    
    [data-theme-provider] .BookingWidget input::placeholder,
    [data-theme-provider] .BookingWidget .placeholder-gray-400 {
      color: var(--theme-hero-booking-placeholder) !important;
    }

    [data-theme-provider] .BookingWidget .hover\:bg-gray-50:hover,
    [data-theme-provider] .BookingWidget .booking-section:hover {
      background-color: var(--theme-hero-booking-input-hover-bg) !important;
    }

    /* Hero Trust Star */
    [data-theme-provider] .TrustBanner .Star,
    [data-theme-provider] .TrustBanner svg[class*="Star"] {
      fill: var(--theme-hero-trust-star-color) !important;
      stroke: var(--theme-hero-trust-star-color) !important;
      color: var(--theme-hero-trust-star-color) !important;
    }

    /* Trust Banner Text */
    [data-theme-provider] .TrustBanner span,
    [data-theme-provider] .TrustBanner p {
      color: var(--theme-hero-booking-text) !important;
    }

    /* Target specifically icons in the booking form that might be wrapped in divs */
    [data-theme-provider] .BookingWidget .absolute.left-4.top-1/2 svg,
    [data-theme-provider] .BookingWidget .flex.items-center.gap-2 svg:not(.TrustBanner svg):not(.BadgeCheck):not(.Plus):not(.CircleMinus),
    [data-theme-provider] .BookingWidget button:not([class*="bg-"]) svg {
      color: var(--theme-hero-booking-icon) !important;
      stroke: var(--theme-hero-booking-icon) !important;
    }

    /* Icons that should match booking text color */
    [data-theme-provider] .BookingWidget .BadgeCheck,
    [data-theme-provider] .BookingWidget .Plus,
    [data-theme-provider] .BookingWidget .CircleMinus {
      color: var(--theme-hero-booking-text) !important;
      stroke: var(--theme-hero-booking-text) !important;
    }

    [data-theme-provider] .BookingWidget .booking-section svg,
    [data-theme-provider] .BookingWidget .booking-section .calendar-arrow-icon {
      color: var(--theme-hero-booking-icon) !important;
      stroke: var(--theme-hero-booking-icon) !important;
    }

    /* Target specific users icon in fleet section */
    [data-theme-provider] section#fleet svg {
      color: var(--theme-fleet-icon-color) !important;
      stroke: var(--theme-fleet-icon-color) !important;
    }

    /* Flame icon and special accents */
    [data-theme-provider] .text-orange-500:not(footer *),
    [data-theme-provider] .fill-orange-500:not(footer *),
    [data-theme-provider] [class*="text-"][class*="orange-500"]:not(footer *) {
      color: var(--theme-accent) !important;
      fill: var(--theme-accent) !important;
    }
    
    /* Secondary/Dark teal */
    [data-theme-provider] [class*="bg-"][class*="0E4659"]:not(footer):not(footer *),
    [data-theme-provider] [class*="bg-"][class*="0e4659"]:not(footer):not(footer *),
    [data-theme-provider] [class*="bg-"][class*="003d5c"]:not(footer):not(footer *) {
      background-color: var(--theme-secondary) !important;
    }
    [data-theme-provider] [class*="text-"][class*="0E4659"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="0e4659"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="003d5c"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="003554"]:not(footer *) {
      color: var(--theme-secondary) !important;
    }
    
    /* Accent/Yellow-Orange */
    [data-theme-provider] [class*="text-"][class*="FBB03B"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="00B67A"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="emerald-700"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="orange-500"]:not(footer *) {
      color: var(--theme-accent) !important;
    }
    [data-theme-provider] [class*="bg-"][class*="FBB03B"]:not(footer *),
    [data-theme-provider] [class*="bg-"][class*="00B67A"]:not(footer *),
    [data-theme-provider] [class*="bg-"][class*="emerald-100"]:not(footer *),
    [data-theme-provider] [class*="bg-"][class*="orange-500"]:not(footer *) {
      background-color: var(--theme-accent) !important;
    }
    [data-theme-provider] [class*="fill-"][class*="00B67A"]:not(footer *),
    [data-theme-provider] [class*="fill-"][class*="FBB03B"]:not(footer *),
    [data-theme-provider] [class*="fill-"][class*="orange-500"]:not(footer *) {
      fill: var(--theme-accent) !important;
    }
    
    /* Green accent */
    [data-theme-provider] [class*="bg-"][class*="00C569"]:not(footer *),
    [data-theme-provider] [class*="text-"][class*="00C569"]:not(footer *) {
      background-color: var(--theme-accent) !important;
      color: var(--theme-accent) !important;
    }
    
    /* Heading text colors */
    [data-theme-provider] h1:not(footer *):not(.hero-section *):not(#fleet *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] h2:not(footer *):not(#fleet *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] h3:not(footer *):not(#fleet *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] h4:not(footer *):not(#fleet *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] h5:not(footer *):not(#fleet *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] h6:not(footer *):not(#fleet *):not(.payment-section *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-900:not(footer *):not(#fleet *):not(.payment-section *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-slate-900:not(footer *):not(#fleet *):not(.payment-section *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .font-bold:not(button):not(a):not(.badge *):not(footer *):not(.hero-section *):not(.travelers-banner *):not(#fleet *):not(.payment-section *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not(.checkout-experiences-step *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-heading-text) !important;
    }
    
    /* Fleet-specific heading colors */
    [data-theme-provider] section#fleet h2 {
      color: var(--theme-fleet-section-title) !important;
    }
    [data-theme-provider] section#fleet h3 {
      color: var(--theme-fleet-vehicle-name) !important;
    }
    
    /* Payment-specific heading colors */
    [data-theme-provider] section.payment-section h2.text-4xl.md\:text-5xl.font-bold.text-center.mb-16,
    [data-theme-provider] section.payment-section h2.text-4xl.font-bold.text-center,
    [data-theme-provider] section.payment-section h2.font-bold.text-center.mb-16,
    [data-theme-provider] section.payment-section h2.text-4xl.font-bold,
    [data-theme-provider] section.payment-section h2.font-bold.text-center,
    [data-theme-provider] section.payment-section h2.font-bold,
    [data-theme-provider] section.payment-section h2.text-center,
    [data-theme-provider] section.payment-section h2,
    [data-theme-provider] section.payment-section > div > div > h2,
    [data-theme-provider] .payment-section h2 {
      color: var(--theme-payment-section-title) !important;
    }
    
    /* Payment description text */
    [data-theme-provider] section.payment-section p.text-lg,
    [data-theme-provider] section.payment-section p:not(.rounded-full *):not(.exclusive-badge *),
    [data-theme-provider] section.payment-section > div > div p,
    [data-theme-provider] .payment-section p.text-lg {
      color: var(--theme-secondary) !important;
    }
    
    /* FAQ-specific colors */
    [data-theme-provider] section#faq h2.text-5xl.font-bold,
    [data-theme-provider] section#faq h2.font-bold.mb-2,
    [data-theme-provider] section#faq h2 {
      color: var(--theme-faq-title) !important;
    }
    
    [data-theme-provider] section#faq p.text-2xl.font-bold,
    [data-theme-provider] section#faq p.font-bold,
    [data-theme-provider] section#faq > div > div.mb-12 > p {
      color: var(--theme-faq-subtitle) !important;
    }
    
    [data-theme-provider] section#faq .border.rounded-lg {
      background-color: var(--theme-faq-card-bg) !important;
      border-color: var(--theme-faq-card-border) !important;
    }
    
    [data-theme-provider] section#faq .border.rounded-lg button span,
    [data-theme-provider] section#faq .border.rounded-lg span.font-medium {
      color: var(--theme-faq-question-text) !important;
    }
    
    [data-theme-provider] section#faq .border.rounded-lg div.p-5.pt-0,
    [data-theme-provider] section#faq .border.rounded-lg .leading-relaxed {
      color: var(--theme-faq-answer-text) !important;
    }
    
    [data-theme-provider] section#faq .border.rounded-lg svg,
    [data-theme-provider] section#faq svg {
      color: var(--theme-faq-icon-color) !important;
      stroke: var(--theme-faq-icon-color) !important;
    }
    
    /* Body text */
    [data-theme-provider] p:not(footer p):not(.hero-section *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-500:not(footer *):not(.hero-section *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-600:not(footer *):not(.hero-section *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-700:not(footer *):not(.hero-section *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-slate-500:not(footer *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-slate-600:not(footer *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-slate-700:not(footer *):not(.payment-section *):not(#faq *):not(.checkout-trust-banner *):not(.checkout-vehicle-card *):not(.checkout-footer *):not(.checkout-form-card *):not(.checkout-order-summary *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-body-text) !important;
    }
    
    /* Muted text */
    [data-theme-provider] .text-gray-400:not(footer *),
    [data-theme-provider] .text-slate-400:not(footer *),
    [data-theme-provider] .text-zinc-400:not(footer *),
    [data-theme-provider] .text-gray-300:not(footer *) {
      color: var(--theme-muted-text) !important;
    }

    /* Features Section */
    [data-theme-provider] section:not(#reviews):not(#fleet):not(#faq):not(.hero-section) .rounded-xl.p-6 h3 {
      color: var(--theme-feature-card-title) !important;
    }
    [data-theme-provider] section:not(#reviews):not(#fleet):not(#faq):not(.hero-section) .rounded-xl.p-6 p {
      color: var(--theme-feature-card-description) !important;
    }
    [data-theme-provider] section:not(#reviews):not(#fleet):not(#faq):not(.hero-section):not(.payment-section) > div > h2.text-4xl.text-center {
      color: var(--theme-features-section-title) !important;
    }
    [data-theme-provider] section:not(#reviews):not(#fleet):not(#faq):not(.hero-section):not(.payment-section) h2.text-center.mb-16 {
      color: var(--theme-features-section-title) !important;
    }

    /* Radio button active state labels and specific trip types */
    [data-theme-provider] label span.text-gray-900:not(footer *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-900:not(footer *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-heading-text) !important;
    }
    
    /* Specific check for active trip type labels */
    [data-theme-provider] label[class*="cursor-pointer"] span[class*="text-gray-900"]:not(footer *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-primary) !important;
    }
    
    /* Radio button dots */
    [data-theme-provider] [class*="bg-"][class*="29C5F6"].rounded-full:not(footer *) {
      background-color: var(--theme-primary) !important;
    }
    
    /* Trust banner specifically */
    [data-theme-provider] .font-bold.text-gray-900:not(footer *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-heading-text) !important;
    }
    [data-theme-provider] .text-gray-600.text-xs:not(footer *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *),
    [data-theme-provider] .text-gray-500:not(footer *):not(.hero-section *):not([data-theme-color="whyScheduleBg"] *):not([data-theme-color="aboutUsBg"] *):not([data-theme-color="toursBg"] *):not([data-theme-color="newsletterBg"] *):not([data-theme-color="socialBg"] *) {
      color: var(--theme-body-text) !important;
    }

    /* Target the calendar arrow right image if possible */
    [data-theme-provider] .calendar-arrow-icon {
      background-color: var(--theme-hero-booking-icon) !important;
      -webkit-mask-image: url("${cdn("/shared/icons/calendar-arrow-right.svg")}");
      mask-image: url("${cdn("/shared/icons/calendar-arrow-right.svg")}");
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
    }
    
    /* Footer (landing page only - not checkout footer) */
    [data-theme-provider] footer:not(.checkout-footer),
    [data-theme-provider] footer:not(.checkout-footer) [class*="bg-"][class*="0E4659"],
    [data-theme-provider] footer:not(.checkout-footer) [class*="bg-"][class*="27C7FF"],
    [data-theme-provider] footer.bg-\\[\\#0E4659\\]:not(.checkout-footer),
    [data-theme-provider] footer.bg-\\[\\#27C7FF\\]:not(.checkout-footer) {
      background-color: var(--theme-footer) !important;
    }

    /* Footer text elements should adapt to footer background (landing page only) */
    [data-theme-provider] footer:not(.checkout-footer) h3,
    [data-theme-provider] footer:not(.checkout-footer) p,
    [data-theme-provider] footer:not(.checkout-footer) a {
      color: var(--theme-link-text) !important;
      opacity: 0.9;
    }
    [data-theme-provider] footer:not(.checkout-footer) a:hover {
      opacity: 1;
    }
    
    /* Badge backgrounds and text */
    [data-theme-provider] [class*="bg-"][class*="E0F7FF"]:not(#fleet *):not(.payment-section *),
    [data-theme-provider] [class*="bg-"][class*="emerald-100"]:not(#fleet *):not(.payment-section *),
    [data-theme-provider] .bg-blue-50:not(#fleet *):not(.payment-section *),
    [data-theme-provider] .bg-cyan-50:not(#fleet *):not(.payment-section *),
    [data-theme-provider] .bg-emerald-100:not(#fleet *):not(.payment-section *) {
      background-color: var(--theme-badge-bg) !important;
    }
    
    [data-theme-provider] [class*="text-"][class*="0B3B55"]:not(#fleet *):not(.payment-section *),
    [data-theme-provider] [class*="text-"][class*="emerald-700"]:not(#fleet *):not(.payment-section *),
    [data-theme-provider] .text-emerald-700:not(#fleet *):not(.payment-section *) {
      color: var(--theme-badge-text) !important;
    }
    
    /* Fleet-specific capacity badge backgrounds and text */
    [data-theme-provider] section#fleet .rounded-full.px-4 {
      background-color: var(--theme-fleet-capacity-badge-bg) !important;
    }
    [data-theme-provider] section#fleet .rounded-full.px-4 span {
      color: var(--theme-fleet-capacity-badge-text) !important;
    }
    
    /* Payment-specific security badge backgrounds and text */
    [data-theme-provider] section.payment-section .inline-flex.rounded-full.px-5,
    [data-theme-provider] section.payment-section .rounded-full.px-5,
    [data-theme-provider] .payment-section .rounded-full.px-5 {
      background-color: var(--theme-payment-security-badge-bg) !important;
    }
    [data-theme-provider] section.payment-section .rounded-full.px-5 span.font-medium,
    [data-theme-provider] section.payment-section .rounded-full.px-5 span,
    [data-theme-provider] .payment-section .rounded-full.px-5 span {
      color: var(--theme-payment-security-badge-text) !important;
    }
    [data-theme-provider] section.payment-section .rounded-full.px-5 svg.size-8,
    [data-theme-provider] section.payment-section .rounded-full.px-5 svg,
    [data-theme-provider] .payment-section .rounded-full.px-5 svg {
      color: var(--theme-payment-icon-color) !important;
      stroke: var(--theme-payment-icon-color) !important;
    }
    
    /* Payment exclusive badge icon */
    [data-theme-provider] section.payment-section .exclusive-badge svg.size-6,
    [data-theme-provider] section.payment-section .exclusive-badge svg,
    [data-theme-provider] .payment-section .exclusive-badge svg {
      color: var(--theme-payment-exclusive-badge-icon) !important;
      stroke: var(--theme-payment-exclusive-badge-icon) !important;
    }
    
    /* Payment exclusive badge background */
    [data-theme-provider] section.payment-section .exclusive-badge,
    [data-theme-provider] .payment-section .exclusive-badge {
      background-color: var(--theme-exclusive-badge-bg) !important;
    }
    
    /* Payment exclusive badge text */
    [data-theme-provider] section.payment-section .exclusive-badge div,
    [data-theme-provider] .payment-section .exclusive-badge .font-bold {
      color: var(--theme-button-text) !important;
    }
    
    /* Support for background with opacity - uses primary color */
    [data-theme-provider] [class*="bg-"][class*="48CAE4"] {
      background-color: var(--theme-primary) !important;
    }
    
    /* Card backgrounds */
    [data-theme-provider] .bg-gray-50:not(#fleet *),
    [data-theme-provider] .bg-slate-50:not(#fleet *),
    [data-theme-provider] .bg-zinc-50:not(#fleet *),
    [data-theme-provider] [class*="bg-white"].rounded-2xl:not(#fleet *) {
      background-color: var(--theme-card-bg) !important;
    }
    
    /* Fleet-specific card backgrounds */
    [data-theme-provider] section#fleet .rounded-2xl.p-6 {
      background-color: var(--theme-fleet-vehicle-card-bg) !important;
    }
    
    /* Card borders */
    [data-theme-provider] .border-gray-200,
    [data-theme-provider] .border-slate-200,
    [data-theme-provider] .border-zinc-200 {
      border-color: var(--theme-card-border) !important;
    }
    
    /* Input borders */
    [data-theme-provider] input,
    [data-theme-provider] select,
    [data-theme-provider] textarea {
      border-color: var(--theme-input-border) !important;
    }

    [data-theme-provider] [data-theme-color="whyScheduleTitle"] {
      color: var(--theme-why-schedule-title) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleStatsText"] {
      color: var(--theme-why-schedule-stats-text) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleStatsAccent"] {
      color: var(--theme-why-schedule-stats-accent) !important;
      fill: var(--theme-why-schedule-stats-accent) !important;
      stroke: var(--theme-why-schedule-stats-accent) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleFeatureText"],
    [data-theme-provider] [data-theme-color="whyScheduleFeatureText"] *:not([data-theme-color]) {
      color: var(--theme-why-schedule-feature-text) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleFeatureIcon"] {
      color: var(--theme-why-schedule-feature-icon) !important;
      fill: var(--theme-why-schedule-feature-icon) !important;
      stroke: var(--theme-why-schedule-feature-icon) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleResourcesIcon"] {
      color: var(--theme-why-schedule-resources-icon) !important;
      fill: var(--theme-why-schedule-resources-icon) !important;
      stroke: var(--theme-why-schedule-resources-icon) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleResourcesTitle"] {
      color: var(--theme-why-schedule-resources-title) !important;
    }
    [data-theme-provider] [data-theme-color="whyScheduleResourcesText"] {
      color: var(--theme-why-schedule-resources-text) !important;
    }
    [data-theme-provider] [data-theme-color="aboutUsTitle"] {
      color: var(--theme-about-us-title) !important;
    }
    [data-theme-provider] [data-theme-color="aboutUsQuote"] {
      color: var(--theme-about-us-quote) !important;
      fill: var(--theme-about-us-quote) !important;
      stroke: var(--theme-about-us-quote) !important;
    }
    [data-theme-provider] [data-theme-color="aboutUsText"],
    [data-theme-provider] [data-theme-color="aboutUsText"] *:not([data-theme-color]) {
      color: var(--theme-about-us-text) !important;
    }
    [data-theme-provider] [data-theme-color="aboutUsSignature"] {
      color: var(--theme-about-us-signature) !important;
    }
    [data-theme-provider] [data-theme-color="toursTitle"] {
      color: var(--theme-tours-title) !important;
    }
    [data-theme-provider] [data-theme-color="toursDescription"],
    [data-theme-provider] [data-theme-color="toursDescription"] *:not([data-theme-color]) {
      color: var(--theme-tours-description) !important;
    }
    [data-theme-provider] [data-theme-color="toursFeatureBadgeText"] {
      color: var(--theme-tours-feature-badge-text) !important;
    }
    [data-theme-provider] [data-theme-color="toursFeatureIcon"] {
      color: var(--theme-tours-feature-icon) !important;
      fill: var(--theme-tours-feature-icon) !important;
      stroke: var(--theme-tours-feature-icon) !important;
    }
    [data-theme-provider] [data-theme-color="toursCardTitle"] {
      color: var(--theme-tours-card-title) !important;
    }
    [data-theme-provider] [data-theme-color="toursCardArrowIcon"] {
      color: var(--theme-tours-card-arrow-icon) !important;
      fill: var(--theme-tours-card-arrow-icon) !important;
      stroke: var(--theme-tours-card-arrow-icon) !important;
    }
    [data-theme-provider] [data-theme-color="toursExploreCardText"] {
      color: var(--theme-tours-explore-card-text) !important;
    }
    [data-theme-provider] [data-theme-color="toursNavButtonIcon"] {
      color: var(--theme-tours-nav-button-icon) !important;
      fill: var(--theme-tours-nav-button-icon) !important;
      stroke: var(--theme-tours-nav-button-icon) !important;
    }
    [data-theme-provider] [data-theme-color="toursCtaText"] {
      color: var(--theme-tours-cta-text) !important;
    }
    [data-theme-provider] [data-theme-color="newsletterTitle"] {
      color: var(--theme-newsletter-title) !important;
    }
    [data-theme-provider] [data-theme-color="newsletterTitleAccent"] {
      color: var(--theme-newsletter-title-accent) !important;
    }
    [data-theme-provider] [data-theme-color="newsletterInputText"] {
      color: var(--theme-newsletter-input-text) !important;
    }
    [data-theme-provider] [data-theme-color="newsletterInputIcon"] {
      color: var(--theme-newsletter-input-icon) !important;
      fill: var(--theme-newsletter-input-icon) !important;
      stroke: var(--theme-newsletter-input-icon) !important;
    }
    [data-theme-provider] [data-theme-color="newsletterButtonText"] {
      color: var(--theme-newsletter-button-text) !important;
    }
    [data-theme-provider] [data-theme-color="heroBookingIcon"] {
      color: var(--theme-hero-booking-icon) !important;
      fill: none !important;
      stroke: var(--theme-hero-booking-icon) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutFormCardTitle"],
    [data-theme-provider] [data-theme-color="checkoutFormCardTitle"] *:not([data-theme-color]) {
      color: var(--theme-checkout-form-card-title) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutExperiencesSectionTitle"],
    [data-theme-provider] [data-theme-color="checkoutExperiencesSectionTitle"] *:not([data-theme-color]) {
      color: var(--theme-checkout-experiences-section-title) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutExperiencesSectionSubtitle"],
    [data-theme-provider] [data-theme-color="checkoutExperiencesSectionSubtitle"] *:not([data-theme-color]) {
      color: var(--theme-checkout-experiences-section-subtitle) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutFormLinkText"],
    [data-theme-provider] [data-theme-color="checkoutFormLinkText"] *:not([data-theme-color]) {
      color: var(--theme-checkout-form-link-text) !important;
      stroke: var(--theme-checkout-form-link-text) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutFormInfoBoxIcon"],
    [data-theme-provider] [data-theme-color="checkoutFormInfoBoxIcon"] *:not([data-theme-color]) {
      color: var(--theme-checkout-form-info-box-icon) !important;
      stroke: var(--theme-checkout-form-info-box-icon) !important;
      fill: none !important;
    }
    [data-theme-provider] [data-theme-color="checkoutPrimaryButtonIcon"],
    [data-theme-provider] [data-theme-color="checkoutPrimaryButtonIcon"] *:not([data-theme-color]) {
      color: var(--theme-checkout-primary-button-icon) !important;
      fill: var(--theme-checkout-primary-button-icon) !important;
      stroke: var(--theme-checkout-primary-button-icon) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutPrimaryButtonText"],
    [data-theme-provider] [data-theme-color="checkoutPrimaryButtonText"] *:not([data-theme-color]) {
      color: var(--theme-checkout-primary-button-text) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutCounterButtonIcon"],
    [data-theme-provider] [data-theme-color="checkoutCounterButtonIcon"] *:not([data-theme-color]) {
      color: var(--theme-checkout-counter-button-icon) !important;
      fill: none !important;
      stroke: var(--theme-checkout-counter-button-icon) !important;
    }
    [data-theme-provider] [data-theme-color="checkoutCounterButtonBg"] {
      background-color: var(--theme-checkout-counter-button-bg) !important;
    }
    [data-theme-provider] [data-theme-color="trustedByBg"] {
      background-color: var(--theme-trusted-by-bg) !important;
    }
    [data-theme-provider] [data-theme-color="socialTitle"] {
      color: var(--theme-social-title) !important;
    }
    [data-theme-provider] [data-theme-color="socialTitleAccent"] {
      color: var(--theme-social-title-accent) !important;
    }
    [data-theme-provider] [data-theme-color="socialProfileText"] {
      color: var(--theme-social-profile-text) !important;
    }
    [data-theme-provider] [data-theme-color="socialMetaText"] {
      color: var(--theme-social-meta-text) !important;
    }
    [data-theme-provider] [data-theme-color="socialFollowButtonText"] {
      color: var(--theme-social-follow-button-text) !important;
    }
    [data-theme-provider] [data-theme-color="socialFollowButtonIcon"] {
      color: var(--theme-social-follow-button-icon) !important;
      fill: var(--theme-social-follow-button-icon) !important;
      stroke: var(--theme-social-follow-button-icon) !important;
    }
    [data-theme-provider] [data-theme-color="socialNavButtonIcon"] {
      color: var(--theme-social-nav-button-icon) !important;
      fill: var(--theme-social-nav-button-icon) !important;
      stroke: var(--theme-social-nav-button-icon) !important;
    }
    [data-theme-provider] [data-theme-color="whatsappFloatIcon"] {
      color: var(--theme-whatsapp-float-icon) !important;
      fill: var(--theme-whatsapp-float-icon) !important;
      stroke: var(--theme-whatsapp-float-icon) !important;
    }
  `;

  return (
    <DynamicThemeContext.Provider value={{ theme, setTheme, isPreviewMode, onElementClick: handleElementClick, logoUrl }}>
      <div style={cssVariables} className="contents" data-theme-provider>
        <style>{staticColorOverrides}</style>
        {isPreviewMode && (
          <style>{`
            [data-theme-provider] [data-theme-color],
            [data-theme-provider] [data-theme-color] * {
              pointer-events: auto !important;
              cursor: pointer !important;
            }
            [data-theme-provider] * {
              transition: outline 0.2s ease-out !important;
            }
            [data-theme-provider] *:hover {
              outline: 1px dashed rgba(39, 199, 255, 0.5) !important;
              outline-offset: 2px !important;
            }
          `}</style>
        )}
        {children}
      </div>
    </DynamicThemeContext.Provider>
  );
}
