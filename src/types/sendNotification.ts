export interface SendNotificationRequest {
  target: "FREE" | "PRO" | "ALL" | "SECURITY_VULNERABLE";
  category: string; // Ex: 'PROMO', 'SECURITY_TIP', 'PAYMENT_ISSUE'
  title: string;
  message: string;
  route: string; // A rota que você escolher no Dashboard
}
