export interface SendNotificationRequest {
  target: "FREE" | "PRO" | "ALL";
  category: string; // Ex: 'PROMO', 'SECURITY_TIP', 'PAYMENT_ISSUE'
  title: string;
  message: string;
  router: string; // A rota que você escolher no Dashboard
}
