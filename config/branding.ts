export interface BrandingConfig {
  marketplaceName: string;
  shortName: string;
  tagline: string;
  currencyCode: 'NPR';
  currencySymbol: 'Rs.';
  timezone: 'Asia/Kathmandu';
  contactEmail: string;
  supportPhone: string;
  headquartersAddress: string;
  registrationNumber: string;
  panVatNumber: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    surface: string;
    canvas: string;
  };
  socialLinks: {
    viber: string;
    whatsapp: string;
    facebook: string;
    instagram: string;
  };
  promotionalBanner: {
    enabled: boolean;
    text: string;
    code: string;
    linkText: string;
  };
  footer: {
    copyrightText: string;
    complianceNote: string;
    operatingHours: string;
  };
  legalPages: Record<
    string,
    {
      slug: string;
      title: string;
      lastUpdated: string;
      summary: string;
      sections: Array<{ heading: string; body: string }>;
    }
  >;
}

export const DEFAULT_BRANDING_CONFIG: BrandingConfig = {
  marketplaceName: 'Mandala Digital Bazaar',
  shortName: 'Mandala Digital',
  tagline: 'Verified Digital Goods, Game Top-Ups, Software Licenses & Recharge Marketplace for Nepal',
  currencyCode: 'NPR',
  currencySymbol: 'Rs.',
  timezone: 'Asia/Kathmandu',
  contactEmail: 'support@mandaladigital.com.np',
  supportPhone: '+977-01-4589210 / +977-9801234567',
  headquartersAddress: 'Level 4, Trade Tower Business Center, Thapathali, Kathmandu 44600, Nepal',
  registrationNumber: 'OCR-NP-2081-094812',
  panVatNumber: 'PAN 609841235',
  colors: {
    primary: '#0F172A',
    secondary: '#1E293B',
    accent: '#C2410C',
    surface: '#FFFFFF',
    canvas: '#F8FAFC',
  },
  socialLinks: {
    viber: 'viber://chat?number=9779801234567',
    whatsapp: 'https://wa.me/9779801234567',
    facebook: 'https://facebook.com/mandaladigitalnp',
    instagram: 'https://instagram.com/mandaladigitalnp',
  },
  promotionalBanner: {
    enabled: true,
    text: 'New Customer Offer: Save 10% up to Rs. 350 on verified digital top-ups and software subscriptions with code',
    code: 'NEPAL10',
    linkText: 'View Eligible Offers',
  },
  footer: {
    copyrightText: '© 2026 Mandala Digital Bazaar Pvt. Ltd. All rights reserved. Registered in Kathmandu, Nepal.',
    complianceNote:
      'All digital products are sold exclusively by verified, authorized resellers. Manual payment verification and manual delivery protections apply to every order.',
    operatingHours: 'Sunday – Friday, 08:00 AM – 09:00 PM NPT (Asia/Kathmandu)',
  },
  legalPages: {
    'about-us': {
      slug: 'about-us',
      title: 'About Mandala Digital Bazaar',
      lastUpdated: '2026-10-15',
      summary:
        'Mandala Digital Bazaar is Nepal’s structured multi-vendor marketplace for authorized game currencies, gift cards, productivity software, and telecom recharge packages.',
      sections: [
        {
          heading: '01. Built for Authorized Digital Commerce in Nepal',
          body: 'We connect Nepali consumers and teams with vetted local merchants offering authorized digital licenses, gaming top-ups, and telecom packages priced transparently in Nepalese Rupees (NPR / Rs.). Every merchant undergoes business and identity verification before listing products.',
        },
        {
          heading: '02. Manual Payment Verification & Protected Fulfillment',
          body: 'To eliminate payment fraud and unauthorized chargebacks, every order is reconciled against verified bank transfers, ConnectIPS, or Nepal QR merchant statements before fulfillment is unlocked. Delivery references and encrypted license keys are logged in an auditable trail.',
        },
        {
          heading: '03. Strict Reseller Authorization Policy',
          body: 'We strictly prohibit stolen accounts, shared credentials, counterfeit codes, or unauthorized grey-market keys. Vendors must submit distributor authorization proof prior to product publication.',
        },
      ],
    },
    'how-to-order': {
      slug: 'how-to-order',
      title: 'How to Order & Receive Delivery',
      lastUpdated: '2026-10-15',
      summary: 'Step-by-step workflow from selecting your digital package to verified manual delivery.',
      sections: [
        {
          heading: '01. Select an Approved Product & Package',
          body: 'Browse verified products by category or search. Select the specific variant or denomination and provide required fulfillment details (such as Game Player UID, Server Region, Ncell/NTC mobile number, or recipient email for software licenses).',
        },
        {
          heading: '02. Confirm Critical Identifiers & Place Order',
          body: 'Verify your Player UID, mobile number, or license email on the pre-checkout confirmation screen. The server generates a unique Order Number (e.g., ORD-NP-20261020-1001) and locks the purchase-time price in NPR.',
        },
        {
          heading: '03. Complete Manual Payment & Upload Reference',
          body: 'Transfer the exact NPR total using ConnectIPS, NepalPay QR, eSewa/Khalti merchant transfer, or bank deposit. Submit your unique transaction reference ID and receipt evidence in your dashboard.',
        },
        {
          heading: '04. Payment Verification & Manual Fulfillment',
          body: 'Our Payment Verification Admin validates the transaction against official merchant bank/wallet statements. Once marked Approved, the assigned vendor or fulfillment specialist manually executes delivery and records the official delivery reference or encrypted code.',
        },
      ],
    },
    'payment-instructions': {
      slug: 'payment-instructions',
      title: 'Official Manual Payment Instructions',
      lastUpdated: '2026-10-15',
      summary: 'How to pay safely in NPR and submit your transaction reference for rapid verification.',
      sections: [
        {
          heading: '01. Enter Your Exact Order Number in Remarks',
          body: 'When transferring funds via ConnectIPS, Fonepay QR, eSewa, Khalti, or commercial bank transfer, always enter your Order Number (ORD-NP-...) in the transaction remarks field.',
        },
        {
          heading: '02. Unique Transaction Reference Requirement',
          body: 'Each payment submission requires the authoritative transaction reference number issued by your bank or wallet. Duplicate payment reference numbers are automatically blocked by database constraints.',
        },
        {
          heading: '03. Screenshots Alone Are Not Confirmation',
          body: 'Uploaded receipts assist our finance team in locating your transfer, but payment approval is strictly based on actual settled funds in our official merchant statement.',
        },
      ],
    },
    faq: {
      slug: 'faq',
      title: 'Frequently Asked Questions',
      lastUpdated: '2026-10-15',
      summary: 'Answers regarding manual delivery timelines, KYC requirements, refunds, and vendor onboarding.',
      sections: [
        {
          heading: '01. Why are payments and deliveries verified manually?',
          body: 'Manual verification protects customers and vendors from counterfeit receipts, mistyped game UIDs, and unauthorized account charges. Most payments are verified within 10–30 minutes during operating hours (08:00 AM – 09:00 PM NPT).',
        },
        {
          heading: '02. Do I need KYC verification for every purchase?',
          body: 'Standard purchases under Rs. 15,000 do not require customer KYC. High-value orders (Rs. 15,000+) or risk-flagged gift card purchases require approved Nepali Citizenship, Passport, or National ID verification.',
        },
        {
          heading: '03. Will you ever ask for my game password or OTP?',
          body: 'Never. Mandala Digital Bazaar and its vendors never ask for your account password, two-factor code, or OTP. Game top-ups use your public Player UID and Server ID only.',
        },
      ],
    },
    'terms-and-conditions': {
      slug: 'terms-and-conditions',
      title: 'Terms and Conditions of Service',
      lastUpdated: '2026-10-15',
      summary: 'Governing rules for purchasing digital goods on Mandala Digital Bazaar in Nepal.',
      sections: [
        {
          heading: '01. Lawful Digital Goods Only',
          body: 'Customers and vendors may only transact authorized digital products compliant with the Electronic Transactions Act of Nepal and publisher terms of service.',
        },
        {
          heading: '02. Accuracy of Customer Delivery Identifiers',
          body: 'Customers are responsible for confirming Game UIDs, telecom phone numbers, and license assignment emails before checkout. Orders fulfilled to an incorrectly supplied UID that exists on the publisher server cannot be reversed once top-up is completed.',
        },
      ],
    },
    'privacy-policy': {
      slug: 'privacy-policy',
      title: 'Privacy & Data Protection Policy',
      lastUpdated: '2026-10-15',
      summary: 'How we protect personal data, KYC documents, and payment receipts.',
      sections: [
        {
          heading: '01. Private Object Storage & Short-Lived Signed Links',
          body: 'Identity documents and payment receipts are never stored in public folders. Access is restricted to authorized KYC and Payment Verification administrators via short-lived signed URLs and logged in the security audit trail.',
        },
        {
          heading: '02. Data Minimization & Retention',
          body: 'We collect only necessary identity and transaction details required for tax, anti-fraud, and financial reconciliation compliance in Nepal.',
        },
      ],
    },
    'refund-policy': {
      slug: 'refund-policy',
      title: 'Refund and Cancellation Policy',
      lastUpdated: '2026-10-15',
      summary: 'Transparent rules for order cancellations, failed fulfillments, and disputed digital deliveries.',
      sections: [
        {
          heading: '01. Eligible Refund Scenarios',
          body: 'Full refunds are approved when: (a) an order cannot be fulfilled within the promised window and the customer requests cancellation prior to delivery, (b) a delivered license or voucher is proven defective or invalid upon verification by staff, or (c) a telecom/game top-up fails at the operator level.',
        },
        {
          heading: '02. Refund Review & Financial Reversal',
          body: 'Delivered digital goods are not automatically classified as non-refundable. Every refund claim is reviewed by Order & Finance Administrators with evidence inspection, and approved reversals adjust the financial ledger and vendor settlement balance atomically.',
        },
      ],
    },
    'vendor-terms': {
      slug: 'vendor-terms',
      title: 'Vendor Partnership Terms & Code of Conduct',
      lastUpdated: '2026-10-15',
      summary: 'Requirements for merchants selling digital goods on Mandala Digital Bazaar.',
      sections: [
        {
          heading: '01. Mandatory Authorization & KYC/KYB',
          body: 'Vendors must provide valid Nepali PAN/VAT registration, business ownership documentation, and distributor authorization before any product is approved for public sale.',
        },
        {
          heading: '02. Commissions, Escrow & Settlement Schedule',
          body: 'Vendor earnings remain in Pending Earnings until order completion and dispute clearance. Available Earnings can be requested for payout once the minimum threshold (Rs. 2,500) is met.',
        },
      ],
    },
    'contact-us': {
      slug: 'contact-us',
      title: 'Contact & Customer Support Center',
      lastUpdated: '2026-10-15',
      summary: 'Reach our Kathmandu support desk via authenticated support tickets, phone, or email.',
      sections: [
        {
          heading: '01. Kathmandu Operations Desk',
          body: 'Location: Level 4, Trade Tower Business Center, Thapathali, Kathmandu 44600, Nepal. Phone: +977-01-4589210. Support Email: support@mandaladigital.com.np. Operating Hours: Sunday to Friday, 08:00 AM – 09:00 PM NPT.',
        },
      ],
    },
  },
};
