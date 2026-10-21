/**
 * Configurable Notification & Email Service
 * Explicitly reports whether an external email provider is configured.
 * Never claims an email was delivered via SMTP/API when credentials are absent,
 * and never includes passwords, KYC numbers, or full secret codes in email bodies.
 */

export type NotificationTemplateKey =
  | 'registration_welcome'
  | 'kyc_status_update'
  | 'vendor_status_update'
  | 'product_approval_update'
  | 'order_placed'
  | 'payment_submitted'
  | 'payment_decision'
  | 'fulfillment_delivered'
  | 'refund_decision'
  | 'settlement_decision'
  | 'support_reply';

export interface NotificationTemplate {
  key: NotificationTemplateKey;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  allowedPlaceholders: string[];
}

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    key: 'registration_welcome',
    name: 'Customer Welcome & Verification',
    subjectTemplate: 'Welcome to {{marketplaceName}} — Verify Your Account',
    bodyTemplate: 'Namaste {{customerName}}, your account on {{marketplaceName}} is ready. All transactions are processed in NPR.',
    allowedPlaceholders: ['marketplaceName', 'customerName'],
  },
  {
    key: 'kyc_status_update',
    name: 'KYC Verification Decision',
    subjectTemplate: 'KYC Verification Update: {{status}}',
    bodyTemplate: 'Hello {{customerName}}, your KYC application status has been updated to {{status}}. Note: {{reason}}',
    allowedPlaceholders: ['customerName', 'status', 'reason'],
  },
  {
    key: 'vendor_status_update',
    name: 'Vendor Application Status',
    subjectTemplate: 'Vendor Application Status: {{status}}',
    bodyTemplate: 'Hello {{vendorName}}, your merchant store application status is now {{status}}. Remarks: {{reason}}',
    allowedPlaceholders: ['vendorName', 'status', 'reason'],
  },
  {
    key: 'product_approval_update',
    name: 'Product Submission Decision',
    subjectTemplate: 'Product Review ({{productName}}): {{status}}',
    bodyTemplate: 'Your product "{{productName}}" has been marked {{status}} by Product Management. Note: {{reason}}',
    allowedPlaceholders: ['productName', 'status', 'reason'],
  },
  {
    key: 'order_placed',
    name: 'Order Confirmation & Payment Instructions',
    subjectTemplate: 'Order {{orderNumber}} Placed — Complete Manual Payment ({{amountNPR}})',
    bodyTemplate: 'Thank you for your order {{orderNumber}} totaling {{amountNPR}}. Please complete manual payment and submit your transaction reference in your dashboard.',
    allowedPlaceholders: ['orderNumber', 'amountNPR'],
  },
  {
    key: 'payment_submitted',
    name: 'Payment Proof Received',
    subjectTemplate: 'Payment Reference Received for {{orderNumber}}',
    bodyTemplate: 'We have received your payment reference {{referenceMasked}} for order {{orderNumber}} ({{amountNPR}}). Our Payment Verification Admin will verify it against merchant records shortly.',
    allowedPlaceholders: ['orderNumber', 'referenceMasked', 'amountNPR'],
  },
  {
    key: 'payment_decision',
    name: 'Payment Verification Decision',
    subjectTemplate: 'Payment {{status}} for Order {{orderNumber}}',
    bodyTemplate: 'Your payment for order {{orderNumber}} ({{amountNPR}}) has been marked {{status}}. Note: {{reason}}',
    allowedPlaceholders: ['orderNumber', 'amountNPR', 'status', 'reason'],
  },
  {
    key: 'fulfillment_delivered',
    name: 'Order Manually Fulfilled',
    subjectTemplate: 'Order {{orderNumber}} Delivered — Reference {{deliveryReference}}',
    bodyTemplate: 'Your order {{orderNumber}} has been manually fulfilled (Delivery Ref: {{deliveryReference}}). If your purchase includes a protected code, sign in to your Customer Dashboard to reveal it securely.',
    allowedPlaceholders: ['orderNumber', 'deliveryReference'],
  },
  {
    key: 'refund_decision',
    name: 'Refund Request Update',
    subjectTemplate: 'Refund Request for {{orderNumber}}: {{status}}',
    bodyTemplate: 'Your refund request for order {{orderNumber}} ({{amountNPR}}) is now {{status}}. Decision note: {{reason}}',
    allowedPlaceholders: ['orderNumber', 'amountNPR', 'status', 'reason'],
  },
  {
    key: 'settlement_decision',
    name: 'Vendor Settlement Update',
    subjectTemplate: 'Settlement Request {{settlementId}}: {{status}}',
    bodyTemplate: 'Your settlement request {{settlementId}} for {{amountNPR}} is now {{status}}. Payout Ref: {{payoutReference}}',
    allowedPlaceholders: ['settlementId', 'amountNPR', 'status', 'payoutReference'],
  },
  {
    key: 'support_reply',
    name: 'Support Ticket Update',
    subjectTemplate: 'Support Ticket {{ticketNumber}} Updated',
    bodyTemplate: 'A new reply has been posted on your support ticket {{ticketNumber}} ({{subject}}). View it in your dashboard.',
    allowedPlaceholders: ['ticketNumber', 'subject'],
  },
];

export function renderNotificationTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>
): { subject: string; body: string } {
  let subject = template.subjectTemplate;
  let body = template.bodyTemplate;
  for (const key of template.allowedPlaceholders) {
    const safeVal = (variables[key] || '').replace(/[<>]/g, '');
    subject = subject.replaceAll(`{{${key}}}`, safeVal);
    body = body.replaceAll(`{{${key}}}`, safeVal);
  }
  return { subject, body };
}

export function isEmailProviderConfigured(): boolean {
  return Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM);
}
