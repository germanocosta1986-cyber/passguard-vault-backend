import { get } from "node:http";
import "dotenv/config";
import express from "express";
import cors from "cors";
// 1. Removido o .js e corrigido o caminho relativo
import {
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
  PassguardAlert,
  resetPassword,
  sendDynamicNotification,
  signUp,
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
    origin: "http://localhost:3001",
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
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
app.get("/api/debug-users", debuguser);
app.post("/api/login", login);
app.patch("/api/settings", authMiddleware, updateSettings);
app.post("/api/signup", signUp);
app.patch("/api/update-recovery", updateRecovery);
app.post("/api/auth/recovery-question", getRecoveryQuestion);
app.patch("/api/auth/reset-password", resetPassword);
app.post("/api/passwords", authMiddleware, createPassword);
app.get("/api/passwords", authMiddleware, listPasswords);
app.delete("/api/passwords/:id", authMiddleware, deletePassword);
app.post("/api/make-premium", authMiddleware, makePremium);
app.get("/api/me", authMiddleware, getProfile);
app.post("/api/verify-master-password", authMiddleware, verifyMasterPassword);
app.put("/api/update-password", authMiddleware, updateMasterPassword);

app.post("/api/delete-account", authMiddleware, deleteAccount);
app.post("/api/cancel-subscription", authMiddleware, handleStopRenewal);
app.post("/api/renew-subscription", authMiddleware, handleResumeRenewal); // Reativa a assinatura

app.get("/api/get-version", getVersionResponse); // atualização de app
app.get("/api/alerts", authMiddleware, PassguardAlert);

app.get("/api/check-subscription", authMiddleware, checkSubscription);

app.post("/api/create-checkout-session", authMiddleware, createCheckoutSession);
app.post("/api/billing/portal", authMiddleware, createPortalSession);

//rota campaigns do Saas Passguard
//app.get("/api/alerts/campaigns", authMiddleware, AlertsDynamic);
app.get("/api/admin/campaigns", adminAuth, GetAllCampaignsAdmin);
app.patch("/api/admin/campaigns/status", adminAuth, listAllCampaigns);
//app.post("/api/admin/campaigns", adminAuth, GetAllCampaignsAdmin);
app.post("/api/campaigns", adminAuth, CreateCampaign);
app.delete("/api/campaigns/:id", DeleteCampaign);
app.get("/api/notifications", authMiddleware, listNotifications);
app.get("/api/notifications/:id/read", authMiddleware, listNotifications);

app.get("/api/admin/users", adminAuth, listAllUsers);
app.post("/api/admin/notifications/send", adminAuth, sendDynamicNotification);
app.patch("/api/users/push-token", authMiddleware, updatePushToken);
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
