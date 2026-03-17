"use strict";
// /backend/src/server.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const authController_js_1 = require("../src/controllers/authController.js");
const authMiddleware_js_1 = require("./middlewares/authMiddleware.js");
const app = (0, express_1.default)();
// 1. Middlewares Globais Iniciais
app.use((0, cors_1.default)());
// 2. ROTA DO WEBHOOK (Deve vir ANTES do express.json())
// Usamos o express.raw apenas para esta rota específica
app.post("/api/app-stripe-webhook", express_1.default.raw({ type: "application/json" }), authController_js_1.webhookStripe);
// 3. Agora sim, ativamos o JSON para todas as outras rotas abaixo
app.use(express_1.default.json());
// Rota de Teste
app.get("/health", (req, res) => res.send("Backend PassGuard Online! ✅"));
app.get("/api", (req, res) => res.send("Backend PassGuard Rodando! 🚀"));
// Rotas de Auth (agora protegidas pelo express.json() acima)
app.post("/api/login", authController_js_1.login);
app.post("/api/signup", authController_js_1.signUp);
app.patch("/api/update-recovery", authController_js_1.updateRecovery);
app.post("/api/auth/recovery-question", authController_js_1.getRecoveryQuestion);
app.patch("/api/auth/reset-password", authController_js_1.resetPassword);
// Passwords e Profile
app.post("/api/passwords", authMiddleware_js_1.authMiddleware, authController_js_1.createPassword);
app.get("/api/passwords", authMiddleware_js_1.authMiddleware, authController_js_1.listPasswords);
app.delete("/api/passwords/:id", authMiddleware_js_1.authMiddleware, authController_js_1.deletePassword);
app.post("/api/make-premium", authMiddleware_js_1.authMiddleware, authController_js_1.makePremium);
app.get("/api/me", authMiddleware_js_1.authMiddleware, authController_js_1.getProfile);
app.post("/api/verify-master-password", authMiddleware_js_1.authMiddleware, authController_js_1.verifyMasterPassword);
app.put("/api/update-password", authMiddleware_js_1.authMiddleware, authController_js_1.updateMasterPassword);
app.post("/api/delete-account", authMiddleware_js_1.authMiddleware, authController_js_1.deleteAccount);
app.get("/api/check-subscription", authMiddleware_js_1.authMiddleware, authController_js_1.checkSubscription);
// Rota de Checkout
app.post("/api/create-checkout-session", authMiddleware_js_1.authMiddleware, authController_js_1.createCheckoutSession);
app.post("/api/billing/portal", authMiddleware_js_1.authMiddleware, authController_js_1.createPortalSession);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://192.168.0.26:${PORT}`);
});
//# sourceMappingURL=server.js.map