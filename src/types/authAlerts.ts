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
