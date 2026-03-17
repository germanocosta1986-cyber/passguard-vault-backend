"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
require("dotenv/config");
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_ultra_segura";
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    // 1. Verifica se o header existe
    if (!authHeader) {
        return res.status(401).json({ error: "Token não fornecido" });
    }
    const parts = authHeader.split(" ");
    // 2. Verifica se tem duas partes (Bearer + Token)
    if (parts.length !== 2) {
        return res.status(401).json({ error: "Erro no formato do token" });
    }
    const [scheme, token] = parts;
    // 3. Valida o esquema Bearer
    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: "Token malformatado" });
    }
    // 4. Validação Real do JWT
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log("❌ Erro JWT no Middleware:", err.message);
            return res.status(401).json({ error: "Token inválido ou expirado" });
        }
        const payload = decoded;
        // --- CORREÇÃO CRÍTICA AQUI ---
        // Você usou 'userId' no controller, então aqui deve ser 'userId'
        if (!payload || !payload.userId) {
            console.log("⚠️ Payload inválido decodificado:", payload);
            return res
                .status(401)
                .json({ error: "Token não contém identificação do usuário" });
        }
        // Injeta o ID na requisição para os controllers usarem
        req.userId = String(payload.userId);
        return next();
    });
};
exports.authMiddleware = authMiddleware;
//# sourceMappingURL=authMiddleware.js.map