import { get } from "node:http";
import "dotenv/config";
import express from "express";
import cors from "cors";
// 1. Removido o .js e corrigido o caminho relativo
import {
  AlertsDynamic,
  checkSubscription,
  CreateCampaign,
  createCheckoutSession,
  createPassword,
  createPortalSession,
  debuguser,
  deleteAccount,
  DeleteCampaign,
  deletePassword,
  GetAllCampaignsAdmin,
  GetCampaignGlobalStats,
  GetFinanceStats,
  getHomeResponse,
  getProfile,
  getRecoveryQuestion,
  getVersionResponse,
  handleResumeRenewal,
  handleStopRenewal,
  listAllCampaigns,
  listAllUsers,
  listNotifications,
  listPasswords,
  login,
  makePremium,
  markAsRead,
  PassguardAlert,
  resetPassword,
  sendDynamicNotification,
  signUp,
  trackInteraction,
  updateMasterPassword,
  updatePushToken,
  updateRecovery,
  updateSettings,
  verifyMasterPassword,
  webhookStripe,
} from "./controllers/authController";
import { authMiddleware } from "./middlewares/authMiddleware";
import { adminAuth } from "./middlewares/adminAuth";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Lista de origens permitidas
      const allowedOrigins = [
        "http://localhost:3000", // Porta do seu Admin atual de disparos/stats
        "http://localhost:3001", // Porta antiga que você usava
      ];

      // Se a requisição não tiver origem (como o app mobile nativo ou Insomnia/Postman), libera
      if (!origin) {
        callback(null, true);
        return;
      }

      // Se a origem estiver na lista ou se for um localhost dinâmico, libera
      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Bloqueado pelo CORS do Passguard"));
      }
    },
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-admin-key",
      "x-admin-token",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  }),
);

// ROTA DO WEBHOOK (Mantida antes do express.json)
app.post(
  "/api/app-stripe-webhook",
  express.raw({ type: "application/json" }),
  webhookStripe,
);

app.use(express.json());

// Rota de Teste
app.get("/heath", (req, res) => res.send("Backend PassGuard Online! ✅"));
app.get("/", getHomeResponse);

// Suas rotas de API (Mantenha como estão)
// Rota para listar usuários de teste (apenas para desenvolvimento)
app.get("/api/debug-users", debuguser);
// Rota para login de usuários
app.post("/api/login", login);
// Rota para atualizar as configurações do usuário (apenas para usuários premium)
app.patch("/api/settings", authMiddleware, updateSettings);
// Rota para cadastro de novos usuários
app.post("/api/signup", signUp);
// Rota para atualizar as informações de recuperação (pergunta e resposta)
app.patch("/api/update-recovery", updateRecovery);
// Rota para obter a pergunta de recuperação com base no email fornecido
app.post("/api/auth/recovery-question", getRecoveryQuestion);
// Rota para resetar a senha usando a resposta da pergunta de recuperação
app.patch("/api/auth/reset-password", resetPassword);
// Rota para criar uma nova senha (apenas para usuários premium)
app.post("/api/passwords", authMiddleware, createPassword);
// Rota para listar todas as senhas do usuário
app.get("/api/passwords", authMiddleware, listPasswords);
// Rota para deletar uma senha específica
app.delete("/api/passwords/:id", authMiddleware, deletePassword);
// Rota para tornar o usuário premium (inicia o processo de assinatura)
app.post("/api/make-premium", authMiddleware, makePremium);
// Rota para obter o perfil do usuário (inclui informações como email, tipo de conta, etc.)
app.get("/api/me", authMiddleware, getProfile);
// Rota para verificar a senha mestra (usada no login e para ações sensíveis)
app.post("/api/verify-master-password", authMiddleware, verifyMasterPassword);
// Rota para atualizar a senha mestra (apenas para usuários premium)
app.put("/api/update-password", authMiddleware, updateMasterPassword);
// Rota para deletar conta (deleta o usuário e todos os dados relacionados)
app.post("/api/delete-account", authMiddleware, deleteAccount);
// Rota para cancelar assinatura (para o usuário cancelar a renovação automática)
app.post("/api/cancel-subscription", authMiddleware, handleStopRenewal);
// Rota para reativar assinatura (reativa a assinatura do usuário)
app.post("/api/renew-subscription", authMiddleware, handleResumeRenewal); // Reativa a assinatura
// Rota para obter a versão do aplicativo
app.get("/api/get-version", getVersionResponse); // atualização de app
// Rota para listar alertas dinâmicos (inativa por enquanto, pois depende do sistema de campanhas)
app.get("/api/alerts", authMiddleware, PassguardAlert);
// Rota para verificar status da assinatura
app.get("/api/check-subscription", authMiddleware, checkSubscription);
// Rota para criar sessão do Stripe Checkout
app.post("/api/create-checkout-session", authMiddleware, createCheckoutSession);
// Rota para criar sessão do portal de faturamento
app.post("/api/billing/portal", authMiddleware, createPortalSession);

//rota campaigns do Saas Passguard
//Rota para listar campanhas ativas para o usuário
app.get("/api/alerts/campaigns", authMiddleware, AlertsDynamic);
//Rota para listar todas as campanhas (apenas admin)
app.get("/api/admin/campaigns", adminAuth, GetAllCampaignsAdmin);
//Rota para atualizar status da campanha (apenas admin)
app.patch("/api/admin/campaigns/status", adminAuth, listAllCampaigns);
//Rota para criar campanha (apenas admin);
app.post("/api/campaigns", adminAuth, CreateCampaign);
//Rota para deletar campanha (apenas admin)
app.delete("/api/campaigns/:id", DeleteCampaign);

//rota para listar todos os usuários (apenas para admin)
app.get("/api/admin/users", adminAuth, listAllUsers);
//rota para enviar notificação dinâmica
app.post("/api/admin/notifications/send", adminAuth, sendDynamicNotification);
//rota para atualizar o push token do usuário
app.patch("/api/users/push-token", authMiddleware, updatePushToken);
//rota para listar as notificações do usuário
app.get("/api/notifications", authMiddleware, listNotifications);
//rota para marcar a notificação como lida
app.patch("/api/notifications/:id/read", authMiddleware, markAsRead);
//rota para registrar o clique na notificação
app.post("/api/interactions", authMiddleware, trackInteraction);
app.get("/api/campaigns/stats", adminAuth, GetCampaignGlobalStats);
app.get("/api/admin/finance/stats", adminAuth, GetFinanceStats);

// 2. IMPORTANTE: Envolva o listen em um condicional
// Isso evita que a Vercel tente abrir portas desnecessárias

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando localmente na porta ${PORT}`);
  });
}

// 3. ESSENCIAL PARA VERCEL:
export default app;
