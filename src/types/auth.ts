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
