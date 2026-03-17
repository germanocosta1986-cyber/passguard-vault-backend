// /backend/src/server.ts

import express from "express";
import cors from "cors";
import {
  checkSubscription,
  createCheckoutSession,
  createPassword,
  createPortalSession,
  deleteAccount,
  deletePassword,
  getProfile,
  getRecoveryQuestion,
  listPasswords,
  login,
  makePremium,
  resetPassword,
  signUp,
  updateMasterPassword,
  updateRecovery,
  verifyMasterPassword,
  webhookStripe,
} from "../src/controllers/authController.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";

const app = express();

// 1. Middlewares Globais Iniciais
app.use(cors());

// 2. ROTA DO WEBHOOK (Deve vir ANTES do express.json())
// Usamos o express.raw apenas para esta rota específica
app.post(
  "/api/app-stripe-webhook",
  express.raw({ type: "application/json" }),
  webhookStripe,
);

// 3. Agora sim, ativamos o JSON para todas as outras rotas abaixo
app.use(express.json());

// Rota de Teste
app.get("/health", (req, res) => res.send("Backend PassGuard Online! ✅"));
app.get("/api", (req, res) => res.send("Backend PassGuard Rodando! 🚀"));

// Rotas de Auth (agora protegidas pelo express.json() acima)
app.post("/api/login", login);
app.post("/api/signup", signUp);
app.patch("/api/update-recovery", updateRecovery);
app.post("/api/auth/recovery-question", getRecoveryQuestion);
app.patch("/api/auth/reset-password", resetPassword);

// Passwords e Profile
app.post("/api/passwords", authMiddleware, createPassword);
app.get("/api/passwords", authMiddleware, listPasswords);
app.delete("/api/passwords/:id", authMiddleware, deletePassword);
app.post("/api/make-premium", authMiddleware, makePremium);
app.get("/api/me", authMiddleware, getProfile);
app.post("/api/verify-master-password", authMiddleware, verifyMasterPassword);
app.put("/api/update-password", authMiddleware, updateMasterPassword);
app.post("/api/delete-account", authMiddleware, deleteAccount);
app.get("/api/check-subscription", authMiddleware, checkSubscription);
// Rota de Checkout
app.post("/api/create-checkout-session", authMiddleware, createCheckoutSession);
app.post("/api/billing/portal", authMiddleware, createPortalSession);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://192.168.0.26:${PORT}`);
});
