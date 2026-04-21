export const adminAuth = (req, res, next) => {
  const token = req.headers["x-admin-key"];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    // Verifique se a chave é fixa ou um JWT
    if (token === process.env.ADMIN_SECRET) {
      return next();
    }
    // Se for JWT:
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.adminId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
};
