// Entidade de Usuário vinda do Banco
export interface User {
  id: string;
  name: string;
  email: string;
  birthYear: number;
  isPremium?: boolean;
  subscription?: {
    planType: "FREE" | "PRO";
    isPremium: boolean;
  };
}

// Resposta do Login
export interface LoginResponse {
  token: string;
  user: User;
}

// Payload do Token JWT (o que o Backend decodifica)
export interface JWTPayload {
  userId: string;
  iat: number;
  exp: number;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  planType: "FREE" | "PRO";
  billingCycle: "mensal" | "anual";
  expiryDate: Date;
  current_period_end: number; // Timestamp do Stripe
  status: "Paga" | "Cancelada";
  createdAt: Date;
  updatedAt: Date;
}

export interface AppVersionResponse {
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  storeUrl: string;
  changelog?: string;
}

export type AlertType =
  | "SECURITY"
  | "TRIAL"
  | "UPDATE"
  | "FAQ"
  | "CAMPAIGN"
  | "INFO"
  | "DESCOUNT";

export type AlertPriority = "HIGH" | "MEDIUM" | "LOW";

export interface AppAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  icon?: any; // Nome do ícone (MaterialIcons)
  color?: string; // Cor principal (ex: "#8b5cf6")
  actionLabel?: string;
  action?:
    | "GO_TO_RECOVERY"
    | "OPEN_BILLING"
    | "OPEN_DESCOUNT"
    | "UPDATE_APP"
    | "OPEN_FAQ"
    | "OPEN_COMPAIGN"
    | "OPEN_SUPPORTING";
  priority: "HIGH" | "MEDIUM" | "LOW";
  expiresAt?: number;
}
