"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortalSession = exports.checkSubscription = exports.verifyMasterPassword = exports.deleteAccount = exports.updateMasterPassword = exports.getProfile = exports.createCheckoutSession = exports.webhookStripe = exports.makePremium = exports.deletePassword = exports.createPassword = exports.listPasswords = exports.resetPassword = exports.getRecoveryQuestion = exports.updateRecovery = exports.signUp = exports.login = void 0;
const prisma_1 = require("../lib/prisma/prisma"); // Aquela instância que criamos
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
require("dotenv/config");
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
});
/* const endpoint =
  "whsec_48e96b5a687cb686cf3964b4416aad40c03428183b99f65232028a3f28096e7e"; */
const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_ultra_segura";
/* login */
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const { email, masterPassword } = req.body;
        const user = yield prisma_1.prisma.user.findUnique({
            where: { email },
            include: {
                subscription: true,
                invoices: {
                    orderBy: { date: "desc" },
                    take: 10,
                },
            },
        });
        console.log("DADOS BRUTOS DO BANCO:", user);
        if (!user || !(yield bcryptjs_1.default.compare(masterPassword, user.masterPassword))) {
            return res.status(401).json({ error: "Credenciais inválidas" });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, {
            expiresIn: "7d",
        });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                birthYear: user.birthYear,
                // --- NOVOS CAMPOS NO LOGIN ---
                recoveryQuestion: user.recoveryQuestion,
                hasRecoveryConfigured: !!user.recoveryHash, // Facilita o check no Front
                // ------------------------------
                createdAt: user.createdAt,
                isPremium: user.isPremium,
                subscription: {
                    status: ((_a = user.subscription) === null || _a === void 0 ? void 0 : _a.status) || "none",
                    planType: ((_b = user.subscription) === null || _b === void 0 ? void 0 : _b.billingCycle) || "FREE",
                    trialEndsAt: ((_c = user.subscription) === null || _c === void 0 ? void 0 : _c.trialEndsAt)
                        ? new Date(user.subscription.trialEndsAt).getTime()
                        : null,
                    premiumExpiryDate: ((_d = user.subscription) === null || _d === void 0 ? void 0 : _d.expiryDate)
                        ? new Date(user.subscription.expiryDate).getTime()
                        : null,
                    cancelAtPeriodEnd: ((_e = user.subscription) === null || _e === void 0 ? void 0 : _e.cancelAtPeriodEnd) || false,
                },
                invoices: user.invoices.map((inv) => ({
                    id: inv.id,
                    date: new Date(inv.date).getTime(),
                    amount: inv.amount,
                    status: inv.status,
                })),
            },
        });
    }
    catch (error) {
        console.error("❌ Erro no Login:", error);
        return res.status(500).json({ error: "Erro no servidor." });
    }
});
exports.login = login;
/* criação de usuário */
/* SIGN UP */
const signUp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Adicionamos os novos campos na desestruturação
        const { name, email, masterPassword, birthYear, recoveryQuestion, recoveryHash, } = req.body;
        const userExists = yield prisma_1.prisma.user.findUnique({
            where: { email },
        });
        if (userExists) {
            return res.status(400).json({ error: "E-mail já cadastrado." });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(masterPassword, 10);
        const newUser = yield prisma_1.prisma.user.create({
            data: {
                name,
                email,
                masterPassword: hashedPassword,
                birthYear: Number(birthYear),
                // --- SALVANDO DADOS DE RECUPERAÇÃO ---
                recoveryQuestion: recoveryQuestion || null,
                recoveryHash: recoveryHash || null,
                // -------------------------------------
                isPremium: false,
                subscription: {
                    create: {
                        planType: "FREE",
                        isPremium: false,
                        status: "none",
                    },
                },
            },
            // Incluímos a assinatura no retorno para manter consistência
            include: { subscription: true },
        });
        return res.status(201).json(newUser);
    }
    catch (error) {
        console.error("❌ Erro no SignUp:", error);
        return res.status(500).json({ error: "Erro ao criar usuário." });
    }
});
exports.signUp = signUp;
// forgotPassword
const updateRecovery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Pegamos o ID do usuário (geralmente vem do middleware de auth ou do corpo)
        const { userId, recoveryQuestion, recoveryHash } = req.body;
        if (!recoveryQuestion || !recoveryHash) {
            return res
                .status(400)
                .json({ error: "Pergunta e Hash são obrigatórios." });
        }
        // Atualizamos apenas os campos de recuperação
        const updatedUser = yield prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                recoveryQuestion: recoveryQuestion,
                recoveryHash: recoveryHash,
            },
        });
        // Retornamos os dados atualizados para o Zustand atualizar o estado local
        return res.json({
            message: "Segurança atualizada com sucesso!",
            recoveryQuestion: updatedUser.recoveryQuestion,
            hasRecoveryConfigured: !!updatedUser.recoveryHash,
        });
    }
    catch (error) {
        console.error("❌ Erro ao atualizar recuperação:", error);
        return res
            .status(500)
            .json({ error: "Erro ao salvar dados de recuperação." });
    }
});
exports.updateRecovery = updateRecovery;
//buscar usuário para alterar senha
const getRecoveryQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    try {
        const user = yield prisma_1.prisma.user.findUnique({
            where: { email },
            select: { recoveryQuestion: true }, // Buscamos APENAS a pergunta
        });
        console.log("DADOS BRUTO RECOVERY: ", user);
        if (!user || !user.recoveryQuestion) {
            return res.status(404).json({
                error: "Pergunta de segurança não configurada para este e-mail.",
            });
        }
        return res.json({ question: user.recoveryQuestion });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao buscar pergunta." });
    }
});
exports.getRecoveryQuestion = getRecoveryQuestion;
//Resetar senha e alterar
const resetPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, recoveryHash, newPassword } = req.body;
    try {
        const user = yield prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }
        // Validação do Hash Soberano
        if (user.recoveryHash !== recoveryHash) {
            return res.status(401).json({ error: "Desafio de segurança incorreto." });
        }
        // Se o hash bater, fazemos o Bcrypt da nova senha
        const hashedMasterPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma_1.prisma.user.update({
            where: { email },
            data: { masterPassword: hashedMasterPassword },
        });
        return res.json({ message: "Senha atualizada com sucesso!" });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao redefinir senha." });
    }
});
exports.resetPassword = resetPassword;
// Salvar uma nova senha
const listPasswords = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // O TS agora sabe que req.userId existe e é string
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: "Não autorizado" });
        }
        const passwords = yield prisma_1.prisma.password.findMany({
            where: { userId: userId }, // Sem erro de tipo aqui
            orderBy: { title: "asc" },
        });
        return res.json(passwords);
    }
    catch (error) {
        return res.status(500).json({ error: "Erro interno" });
    }
});
exports.listPasswords = listPasswords;
// Salvar uma nova senha
const createPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId; // Vem do Token
        const { title, username, encryptedPass, category, icon, strength } = req.body;
        if (!userId)
            return res.status(401).json({ error: "Não autorizado." });
        // Criamos a senha e o LOG em uma única transação do Prisma
        const [newEntry] = yield prisma_1.prisma.$transaction([
            // 1. Cria a senha
            prisma_1.prisma.password.create({
                data: {
                    title,
                    username,
                    encryptedPass,
                    category: category || "Geral",
                    icon: icon || "key",
                    strength: strength || "medium",
                    userId: String(userId),
                    createdAt: new Date().toISOString(),
                },
            }),
            // 2. Cria o Log de Atividade
            prisma_1.prisma.activityLog.create({
                data: {
                    action: "CREATE_PASSWORD",
                    details: `Adicionou nova credencial: ${title}`,
                    userId: String(userId),
                },
            }),
        ]);
        return res.status(201).json(newEntry);
    }
    catch (error) {
        console.error("❌ Erro ao salvar senha e log:", error);
        return res.status(500).json({ error: "Erro ao salvar no banco." });
    }
});
exports.createPassword = createPassword;
// Excluir senha
const deletePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const userId = req.userId; // Vem do middleware
        // req.params.id pode vir como string ou string[]; pegamos um valor simples
        const deleted = yield prisma_1.prisma.password.deleteMany({
            where: {
                id: id,
                userId: String(userId),
            },
        });
        if (deleted.count === 0) {
            return res
                .status(404)
                .json({ error: "Senha não encontrada ou sem permissão." });
        }
        return res.status(204).send();
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao excluir." });
    }
});
exports.deletePassword = deletePassword;
const makePremium = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, cycle } = req.body; // cycle: 'mensal' | 'anual'
        const durationDays = cycle === "anual" ? 365 : 30;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        const update = yield prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                isPremium: true,
                subscription: {
                    upsert: {
                        create: {
                            planType: "PRO",
                            billingCycle: cycle,
                            isPremium: true,
                            expiryDate,
                        },
                        update: {
                            planType: "PRO",
                            billingCycle: cycle,
                            isPremium: true,
                            expiryDate,
                            cancelAtPeriodEnd: false,
                        },
                    },
                },
                invoices: {
                    create: {
                        amount: cycle === "anual" ? "R$ 99,90" : "R$ 12,90",
                        planType: cycle,
                        expiryDate: expiryDate,
                    },
                },
            },
            include: { subscription: true, invoices: true },
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao atualizar usuário." });
    }
});
exports.makePremium = makePremium;
/* STRIPE WEBHOOK */
const webhookStripe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const signature = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    // 1. O usuário finalizou o checkout com sucesso (Início do Trial)
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        const userId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId;
        const planType = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.planType;
        if (userId) {
            // Buscamos os detalhes da assinatura para saber quando o trial acaba
            const subscription = yield stripe.subscriptions.retrieve(subscriptionId);
            yield prisma_1.prisma.subscription.upsert({
                where: { userId },
                create: {
                    userId,
                    stripeSubscriptionId: subscriptionId,
                    stripeCustomerId: customerId,
                    planType: "PRO",
                    status: "trialing", // Define como em teste
                    isPremium: true, // Já libera o acesso
                    billingCycle: planType,
                    trialEndsAt: new Date(subscription.trial_end * 1000), // Converte timestamp do Stripe
                },
                update: {
                    stripeSubscriptionId: subscriptionId,
                    stripeCustomerId: customerId,
                    planType: "PRO",
                    status: "trialing",
                    isPremium: true,
                    billingCycle: planType,
                    trialEndsAt: new Date(subscription.trial_end * 1000),
                },
            });
            // Atualiza o campo rápido no User
            yield prisma_1.prisma.user.update({
                where: { id: userId },
                data: { isPremium: true },
            });
        }
    }
    // 2. O Trial acabou e a primeira cobrança foi feita (ou renovação mensal)
    if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        // Buscamos a assinatura vinculada a este Customer do Stripe
        const sub = yield prisma_1.prisma.subscription.findUnique({
            where: { stripeCustomerId: customerId },
        });
        if (sub) {
            yield prisma_1.prisma.subscription.update({
                where: { id: sub.id },
                data: {
                    status: "active",
                    isPremium: true,
                },
            });
            // Aproveitamos para criar o registro na sua tabela de Invoice (Fatura)
            // para o histórico que você mostra no App
            yield prisma_1.prisma.invoice.create({
                data: {
                    amount: (invoice.amount_paid / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                    }),
                    date: new Date(),
                    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Exemplo: +30 dias
                    planType: sub.billingCycle || "mensal",
                    status: "Paga",
                    userId: sub.userId,
                },
            });
        }
    }
    // 3. O pagamento falhou ou a assinatura foi cancelada
    if (event.type === "customer.subscription.deleted" ||
        event.type === "invoice.payment_failed") {
        const subscription = event.data.object;
        const sub = yield prisma_1.prisma.subscription.update({
            where: { stripeSubscriptionId: subscription.id },
            data: {
                status: "canceled",
                isPremium: false,
                planType: "FREE",
            },
        });
        yield prisma_1.prisma.user.update({
            where: { id: sub.userId },
            data: { isPremium: false },
        });
    }
    res.json({ received: true });
});
exports.webhookStripe = webhookStripe;
/* STRIPE CHECKOUT SESSION */
const createCheckoutSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { userId, planType } = req.body; // 'mensal' ou 'anual'
        // 1. Buscar o usuário para pegar o e-mail (Stripe precisa para criar o Customer)
        const user = yield prisma_1.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true },
        });
        if (!user)
            return res.status(404).json({ error: "Usuário não encontrado" });
        // 2. Criar ou recuperar Customer no Stripe
        let customerId = (_a = user.subscription) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        if (!customerId) {
            const customer = yield stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: { userId: user.id },
            });
            customerId = customer.id;
        }
        // 3. Criar a sessão de ASSINATURA com TRIAL
        const session = yield stripe.checkout.sessions.create({
            customer: customerId,
            /* payment_method_options: {
              pix: { expires_after_seconds: 600 },
            }, */
            payment_method_types: ["card"],
            mode: "subscription", // OBRIGATÓRIO para trial e recorrente
            line_items: [
                {
                    // Usamos o ID que você criou para manter o histórico e relatórios limpos
                    price: planType === "anual"
                        ? "price_1T9bLUIy32epIweEETjJHLUp"
                        : "price_1T9b0FIy32epIweEDZuKgvvy",
                    quantity: 1,
                },
            ],
            subscription_data: {
                trial_period_days: 7, // 👈 Seus 7 dias de teste grátis aqui!
            },
            success_url: `passguard-vault://checkout?status=success`,
            cancel_url: `passguard-vault://checkout?status=cancel`,
            metadata: {
                userId: userId,
                planType: planType,
            },
        });
        res.json({ id: session.id, url: session.url });
    }
    catch (error) {
        console.error("Erro Stripe Checkout:", error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.createCheckoutSession = createCheckoutSession;
const getProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const userId = req.userId; // Vem do seu authMiddleware
        const user = yield prisma_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                subscription: true,
                invoices: {
                    orderBy: { date: "desc" },
                    take: 10,
                },
            },
        });
        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }
        // Retornamos o mesmo formato que o Login para a Store não bugar
        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                birthYear: user.birthYear,
                masterPassword: user.masterPassword,
                createdAt: user.createdAt,
                isPremium: user.isPremium,
                planType: ((_a = user.subscription) === null || _a === void 0 ? void 0 : _a.billingCycle) || null,
                premiumExpiryDate: ((_b = user.subscription) === null || _b === void 0 ? void 0 : _b.expiryDate)
                    ? new Date(user.subscription.expiryDate).getTime()
                    : null,
                cancelAtPeriodEnd: ((_c = user.subscription) === null || _c === void 0 ? void 0 : _c.cancelAtPeriodEnd) || false,
                invoices: user.invoices.map((inv) => ({
                    id: inv.id,
                    date: new Date(inv.date).getTime(),
                    amount: inv.amount,
                    status: inv.status,
                })),
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao buscar perfil." });
    }
});
exports.getProfile = getProfile;
const updateMasterPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const { currentPassword, newPassword } = req.body;
        const user = yield prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: "Usuário não encontrado" });
        // 1. Validar se a senha atual está correta
        const isPasswordValid = yield bcryptjs_1.default.compare(currentPassword, user.masterPassword);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Senha atual incorreta." });
        }
        // 2. Gerar hash da nova senha
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedNewPassword = yield bcryptjs_1.default.hash(newPassword.trim(), salt);
        // 3. Atualizar no banco
        yield prisma_1.prisma.user.update({
            where: { id: userId },
            data: { masterPassword: hashedNewPassword },
        });
        return res.json({ message: "Senha atualizada com sucesso!" });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao atualizar senha." });
    }
});
exports.updateMasterPassword = updateMasterPassword;
//delete account user
const deleteAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = req.userId;
        const { password } = req.body;
        const user = yield prisma_1.prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true },
        });
        if (!user)
            return res.status(404).json({ error: "Usuário não encontrado." });
        // 1. Confirmação de segurança
        const isPasswordValid = yield bcryptjs_1.default.compare(password, user.masterPassword);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Senha incorreta." });
        }
        // 2. Cancelar no Stripe usando o ID que agora temos no banco
        if ((_a = user.subscription) === null || _a === void 0 ? void 0 : _a.stripeSubscriptionId) {
            try {
                yield stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
            }
            catch (e) {
                console.error("Erro Stripe:", e);
            }
        }
        // 3. Delete Cascade (Apaga User, Subscription e Senhas)
        yield prisma_1.prisma.user.delete({ where: { id: userId } });
        return res.json({ success: true, message: "Conta excluída!" });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro ao excluir conta." });
    }
});
exports.deleteAccount = deleteAccount;
const verifyMasterPassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId; // ID vindo do seu JWT middleware
        const { password } = req.body;
        // Buscamos o hash direto do banco
        const user = yield prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { masterPassword: true }, // Buscamos apenas o necessário
        });
        if (!user)
            return res.status(404).json({ error: "Usuário não encontrado" });
        // Comparação feita no servidor (muito mais rápido)
        const isValid = yield bcryptjs_1.default.compare(password, user.masterPassword);
        return res.json({ isValid });
    }
    catch (error) {
        return res.status(500).json({ error: "Erro na verificação" });
    }
});
exports.verifyMasterPassword = verifyMasterPassword;
const checkSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId; // Certifica-te que o middleware de auth passa o userId
        const sub = yield prisma_1.prisma.subscription.findUnique({
            where: { userId: String(userId) },
        });
        if (!sub) {
            return res.json({
                status: "none",
                isPro: false,
                trialEndsAt: null,
            });
        }
        // Lógica SilvaDev: Se está em trial ou ativo, ele é PRO
        const isPro = sub.status === "active" || sub.status === "trialing";
        return res.json({
            status: sub.status, // "trialing", "active", "canceled", etc
            trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : null,
            isPro: isPro,
            planType: sub.billingCycle,
        });
    }
    catch (error) {
        console.error("❌ Erro no CheckSubscription:", error);
        return res.status(500).json({ error: "Erro ao verificar assinatura." });
    }
});
exports.checkSubscription = checkSubscription;
//cancelamento de plano em trial
// Exemplo do que deve ter no seu backend
// No seu controller do Node.js
const createPortalSession = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // No seu projeto, o ID vem de req.userId (conforme listPasswords)
        const userId = req.userId;
        console.log("Iniciando busca de faturamento para o ID:", userId);
        if (!userId) {
            return res
                .status(401)
                .json({ error: "Usuário não identificado na sessão." });
        }
        // 1. Busca o usuário incluindo a relação de subscription
        const userWithSub = yield prisma_1.prisma.user.findUnique({
            where: { id: String(userId) }, // Forçamos string para evitar erro de tipo
            include: { subscription: true },
        });
        // 2. Acessa o ID que está dentro de subscription (stripeCustomerId)
        const customerId = (_a = userWithSub === null || userWithSub === void 0 ? void 0 : userWithSub.subscription) === null || _a === void 0 ? void 0 : _a.stripeCustomerId;
        if (!customerId) {
            console.log("Aviso: Usuário encontrado, mas sem stripeCustomerId no banco.");
            return res.status(400).json({
                error: "Você ainda não possui um histórico de faturamento no Stripe.",
            });
        }
        // 3. Cria a sessão do portal (Aqui o Stripe gera o link de cancelamento/gestão)
        const session = yield stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: "passguard-vault://dashboardScreen", // Deep link para voltar ao seu app
        });
        console.log("Portal Session criada com sucesso:", session.url);
        return res.json({ url: session.url });
    }
    catch (error) {
        console.error("Erro no Portal Stripe:", error.message);
        return res
            .status(500)
            .json({ error: "Erro interno ao gerar portal de faturamento." });
    }
});
exports.createPortalSession = createPortalSession;
//# sourceMappingURL=authController.js.map