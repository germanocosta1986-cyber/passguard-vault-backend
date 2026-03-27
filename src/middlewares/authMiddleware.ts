import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

// Estendendo a tipagem do Express para aceitar o userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_ultra_segura";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    // ... erro check ...
    const payload = decoded as any;

    console.log("-----------------------------------------");
    console.log("JWT DECODIFICADO:", payload); // VEJA O QUE APARECE AQUI NO LOG DA VERCEL

    // Tente capturar das duas formas para garantir:
    const idToUse = payload.userId || payload.id || payload.sub;

    if (!idToUse) {
      console.log("❌ NENHUM ID ENCONTRADO NO PAYLOAD");
      return res.status(401).json({ error: "Token sem ID" });
    }

    req.userId = String(idToUse);
    console.log("✅ userId injetado no req:", req.userId);

    return next();
  });
};
