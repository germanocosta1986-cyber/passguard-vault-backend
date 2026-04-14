// /backend/src/controllers/authController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma"; // Aquela instância que criamos
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";

import Stripe from "stripe";
import { AlertType, AppAlert } from "../types/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-04-10" as any,
});

const JWT_SECRET = process.env.JWT_SECRET || "sua_chave_secreta_ultra_segura";

export const debuguser = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();

    if (users.length === 0) {
      return res.status(404).send("Nenhum usuário encontrado.");
    }

    // 1. Criar o cabeçalho do CSV
    const header = "id,name,email,createdAt\n";

    // 2. Mapear os dados para linhas (tratando possíveis vírgulas no nome)
    const rows = users
      .map(
        (user) => `${user.id},"${user.name}","${user.email}",${user.createdAt}`,
      )
      .join("\n");

    const csvContent = header + rows;

    // 3. Configurar os Headers para Forçar o Download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=usuarios_passguard.csv",
    );

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao gerar o arquivo.");
  }
};

//Tela home backend sucesso
export const getHomeResponse = (req: Request, res: Response) => {
  const isDev = process.env.NODE_ENV !== "production";
  const androidVer = process.env.ANDROID_LATEST_VERSION || "Não configurada";
  const iosVer = process.env.IOS_LATEST_VERSION || "Não configurada";

  const html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Backend PassGuard Rodando! 🚀</title>
        

        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f7f6; color: #333; }

            .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; border-top: 5px solid #2ecc71; }

            h1 { color: #2c3e50; margin-bottom: 0.5rem; }
            .status { display: inline-block; padding: 5px 12px; border-radius: 20px; background: #e2f9eb; color: #2ecc71; font-weight: bold; font-size: 0.8rem; margin-bottom: 1rem; }
            .info { text-align: left; background: #f9f9f9; padding: 1rem; border-radius: 8px; font-size: 0.9rem; }
            .tag { font-weight: bold; color: #7f8c8d; }
        </style>
    </head>
    <body>
        <div class="card">
            <title>Passguard API | Status</title>
            <h1>Passguard API 🔐</h1>
            <div class="status">● ONLINE</div>
            <p>O servidor está operando corretamente no Vercel.</p>
            <div class="info">
                <p><span class="tag">Ambiente:</span> ${isDev ? "🛠️ Desenvolvimento" : "🚀 Produção"}</p>
                <p><span class="tag">Android Version:</span> v${androidVer}</p>
                <p><span class="tag">iOS Version:</span> v${iosVer}</p>
            </div>
            <p style="font-size: 0.7rem; color: #bdc3c7; margin-top: 1.5rem;">The Silva Dev © 2026</p>
        </div>
    </body>
    </html>
  `;

  res.send(html);
};

/* login */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, masterPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        subscription: true,
        invoices: {
          orderBy: { date: "desc" },
          take: 10,
        },
      },
    });

    console.log("DADOS BRUTOS LOGIN: ", user);
    if (!user || !(await bcrypt.compare(masterPassword, user.masterPassword))) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.session.create({
      data: {
        token: token,
        userId: user.id,
        expiresAt: expiresAt,
      },
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
        allowAutoLogin: user.allowAutoLogin,
        subscription: {
          status: user.subscription?.status,
          planType: user.subscription?.planType || "FREE",
          billingCycle: user.subscription?.billingCycle || null,
          trialEndsAt: user.subscription?.trialEndsAt
            ? new Date(user.subscription.trialEndsAt).getTime()
            : null,
          premiumExpiryDate: user.subscription?.expiryDate
            ? new Date(user.subscription.expiryDate).getTime()
            : null,
          cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,
        },

        invoices: user.invoices.map((inv: any) => ({
          id: inv.id,
          date: new Date(inv.date).getTime(),
          amount: inv.amount,
          status: inv.status,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Erro no Login:", error);
    return res.status(500).json({ error: "Erro no servidor." });
  }
};

/* criação de usuário */
/* SIGN UP */
export const signUp = async (req: Request, res: Response) => {
  try {
    // Adicionamos os novos campos na desestruturação
    const {
      name,
      email,
      masterPassword,
      birthYear,
      recoveryQuestion,
      recoveryHash,
    } = req.body;

    const userExists = await prisma.user.findUnique({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({ error: "E-mail já cadastrado." });
    }

    const hashedPassword = await bcrypt.hash(masterPassword, 10);

    const newUser = await prisma.user.create({
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
  } catch (error) {
    console.error("❌ Erro no SignUp:", error);
    return res.status(500).json({ error: "Erro ao criar usuário." });
  }
};

// forgotPassword
export const updateRecovery = async (req: Request, res: Response) => {
  try {
    // Pegamos o ID do usuário (geralmente vem do middleware de auth ou do corpo)
    const { userId } = req.body;

    if (!userId.recoveryQuestion || !userId.recoveryHash) {
      return res
        .status(400)
        .json({ error: "Pergunta e Hash são obrigatórios." });
    }

    // Atualizamos apenas os campos de recuperação
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        recoveryQuestion: userId.recoveryQuestion,
        recoveryHash: userId.recoveryHash,
      },
    });

    // Retornamos os dados atualizados para o Zustand atualizar o estado local
    return res.json({
      message: "Segurança atualizada com sucesso!",
      recoveryQuestion: updatedUser.recoveryQuestion,
      hasRecoveryConfigured: !!updatedUser.recoveryHash,
    });
  } catch (error) {
    console.error("❌ Erro ao atualizar recuperação:", error);
    return res
      .status(500)
      .json({ error: "Erro ao salvar dados de recuperação." });
  }
};

//buscar usuário para alterar senha
export const getRecoveryQuestion = async (req: Request, res: Response) => {
  const { email } = req.body;
  console.log("DADOS BRUTOS:", req.body);
  try {
    const user = await prisma.user.findUnique({
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
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar pergunta." });
  }
};

//Resetar senha e alterar
export const resetPassword = async (req: Request, res: Response) => {
  const { email, recoveryHash, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Validação do Hash Soberano
    if (user.recoveryHash !== recoveryHash) {
      return res.status(401).json({ error: "Desafio de segurança incorreto." });
    }

    // Se o hash bater, fazemos o Bcrypt da nova senha
    const hashedMasterPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: { masterPassword: hashedMasterPassword },
    });

    return res.json({ message: "Senha atualizada com sucesso!" });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao redefinir senha." });
  }
};

// Salvar uma nova senha
export const listPasswords = async (req: Request, res: Response) => {
  try {
    // O TS agora sabe que req.userId existe e é string
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const passwords = await prisma.password.findMany({
      where: { userId: userId }, // Sem erro de tipo aqui
      orderBy: { title: "asc" },
    });

    return res.json(passwords);
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
};

// Salvar uma nova senha
export const createPassword = async (req: Request, res: Response) => {
  try {
    const userId = req.userId; // Vem do Token
    const { title, username, encryptedPass, category, icon, strength } =
      req.body;

    if (!userId) return res.status(401).json({ error: "Não autorizado." });

    // Criamos a senha e o LOG em uma única transação do Prisma
    const [newEntry] = await prisma.$transaction([
      // 1. Cria a senha
      prisma.password.create({
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
      prisma.activityLog.create({
        data: {
          action: "CREATE_PASSWORD",
          details: `Adicionou nova credencial: ${title}`,
          userId: String(userId),
        },
      }),
    ]);

    return res.status(201).json(newEntry);
  } catch (error) {
    console.error("❌ Erro ao salvar senha e log:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco." });
  }
};

// Excluir senha
export const deletePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // Vem do middleware

    // req.params.id pode vir como string ou string[]; pegamos um valor simples

    const deleted = await prisma.password.deleteMany({
      where: {
        id: id as string,
        userId: String(userId),
      },
    });

    if (deleted.count === 0) {
      return res
        .status(404)
        .json({ error: "Senha não encontrada ou sem permissão." });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Erro ao excluir." });
  }
};

export const makePremium = async (req: Request, res: Response) => {
  try {
    const { userId, cycle } = req.body; // cycle: 'mensal' | 'anual'

    const durationDays = cycle === "anual" ? 365 : 1;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    const update = await prisma.user.update({
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
            planType: "PRO",
            expiryDate: expiryDate,
          },
        },
      },
      include: { subscription: true, invoices: true },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
};

/* STRIPE WEBHOOK */
export const webhookStripe = async (req: any, res: any) => {
  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (err: any) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- 1. SESSÃO FINALIZADA (O Ponto de Partida) ---
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const billingCycle = session.metadata?.billingCycle || "mensal";

    console.log(
      `🚀 Checkout Finalizado! User: ${userId} | Plan: ${billingCycle}`,
    );

    if (userId) {
      await prisma.subscription.upsert({
        where: { userId: userId },
        update: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "trialing",
          isPremium: true,
          billingCycle: billingCycle, // Garante que não apareça "FREE" no app
          expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 24h de Trial
          trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        },
        create: {
          userId: userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "trialing",
          isPremium: true,
          billingCycle: billingCycle,
          expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true },
      });
    }
  }

  // --- 2. SUCESSO NO PAGAMENTO (A Lógica de Blindagem) ---
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const amountPaid = invoice.amount_paid; // Valor em centavos (ex: 1290)

    // 🛡️ TRAVA: Se pagou R$ 0,00, é apenas a fatura de setup do Trial.
    // Não transformamos em 'active' ainda para não matar o Trial no App.
    const isInitialTrialInvoice = amountPaid === 0;

    let sub = await prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (sub) {
      const periodEnd = invoice.lines.data[0]?.period?.end;
      const expiryDate = periodEnd
        ? new Date(periodEnd * 1000)
        : sub.expiryDate;

      // Só atualizamos para 'active' e limpamos o trial se houve cobrança real (> 0)
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: isInitialTrialInvoice ? "trialing" : "active",
          isPremium: true,
          expiryDate: expiryDate,
          // Se pagou, o trial acabou. Se não, mantém o trialEndsAt original.
          ...(isInitialTrialInvoice ? {} : { trialEndsAt: null }),
        },
      });

      // 📝 Registro de Fatura: Só salvamos no banco se o valor for maior que zero
      // para não poluir o histórico do usuário com "R$ 0,00"
      if (!isInitialTrialInvoice) {
        await prisma.invoice.create({
          data: {
            userId: sub.userId,
            amount: (amountPaid / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
            date: new Date(invoice.created * 1000),
            expiryDate: expiryDate,
            billingCycle: sub.billingCycle || "mensal",
            status: "Paga",
            stripeInvoiceId: invoice.id,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            invoicePdf: invoice.invoice_pdf,
          },
        });
        console.log(`✅ Pagamento real processado para User: ${sub.userId}`);
      } else {
        console.log(
          `ℹ️ Fatura de Trial (R$ 0,00) detectada. Mantendo status 'trialing'.`,
        );
      }
    }
  }

  // --- 3. CANCELAMENTO OU EXPIRAÇÃO ---
  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated" // Adicionado para capturar status 'past_due'
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    // Garantia de tipo

    // Só removemos o premium se o status for realmente de encerramento
    const statusToDowngrade = ["canceled", "unpaid", "incomplete_expired"];

    if (statusToDowngrade.includes(subscription.status)) {
      try {
        const sub = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (sub) {
          // 🔄 Transação atômica: ou atualiza tudo ou nada
          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: sub.id },
              data: {
                status: subscription.status,
                isPremium: false,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
              },
            }),
            prisma.user.update({
              where: { id: sub.userId },
              data: { isPremium: false },
            }),
          ]);

          console.log(
            `📉 Premium removido: Subscription ${subscription.id} (Status: ${subscription.status})`,
          );
        }
      } catch (err) {
        console.error("❌ Erro ao processar downgrade:", err);
      }
    }
  }

  // 🔔 Opcional: Apenas logar falhas de pagamento sem remover o acesso ainda
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn(
      `⚠️ Falha de pagamento para o usuário: ${invoice.customer_email}. O Stripe tentará novamente.`,
    );
  }

  res.json({ received: true });
};

/* STRIPE CHECKOUT SESSION */
export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const { userId, billingCycle } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // 🔥 1. Garantir Customer
    let customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id, // ✔️ importante
        },
      });

      customerId = customer.id;

      // 👉 já salva aqui para garantir vínculo
      await prisma.subscription.upsert({
        where: { userId: user.id },
        update: { stripeCustomerId: customerId },
        create: {
          userId: user.id,
          stripeCustomerId: customerId,
          status: "pending",
        },
      });
    }

    // 🔥 2. Criar sessão corretamente
    const session = await stripe.checkout.sessions.create({
      customer: customerId,

      payment_method_types: ["card"],
      mode: "subscription",

      line_items: [
        {
          price:
            billingCycle === "anual"
              ? "price_1T9bLUIy32epIweEETjJHLUp"
              : "price_1T9b0FIy32epIweEDZuKgvvy",
          quantity: 1,
        },
      ],

      // 🔥 ESSENCIAL
      subscription_data: {
        trial_period_days: 1,
        metadata: {
          userId: user.id,
          billingCycle: billingCycle,
        },
      },

      // 🔥 redundância segura
      metadata: {
        userId: user.id,
        billingCycle: billingCycle,
      },

      success_url: `passguard://checkout?status=success&billingCycle=${billingCycle}`,
      cancel_url: `passguard://checkout?status=cancel`,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("Erro Stripe Checkout:", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getProfile = async (req: any, res: Response) => {
  try {
    // 🛡️ PEGA O ID DO MIDDLEWARE (Como era no antigo)
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Sessão expirada ou inválida." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true, // 💎 Já traz planType e billingCycle do banco
        invoices: {
          orderBy: { date: "desc" },
          take: 15,
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // 🕒 Datas formatadas com segurança
    const premiumExpiry = user.subscription?.expiryDate
      ? new Date(user.subscription.expiryDate).getTime()
      : null;

    const subscription = user.subscription;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        isPremium: user.isPremium,
        premiumExpiryDate: premiumExpiry,
        recoveryQuestion: user.recoveryQuestion,
        hasRecoveryConfigured: !!user.recoveryHash,

        allowAutoLogin: user.allowAutoLogin,
        planType: subscription?.planType ?? "FREE",
        billingCycle:
          subscription?.planType === "PRO"
            ? (subscription.billingCycle ?? null)
            : null,

        subscription: {
          id: subscription?.id,
          planType: subscription?.planType ?? "FREE",
          billingCycle:
            subscription?.planType === "PRO"
              ? (subscription.billingCycle ?? null)
              : null,
          isPremium: subscription?.isPremium ?? false,
          status: subscription?.status ?? "none",

          trialEndsAt: subscription?.trialEndsAt
            ? new Date(subscription.trialEndsAt).getTime()
            : null,

          expiryDate: user.subscription?.expiryDate
            ? new Date(user.subscription.expiryDate).getTime()
            : null,

          premiumExpiryDate: user.subscription?.expiryDate
            ? new Date(user.subscription.expiryDate).getTime()
            : null,

          cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
          stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
        },

        invoices: (user.invoices || []).map((inv: any) => ({
          id: inv.id,
          date: inv.date ? new Date(inv.date).getTime() : Date.now(),
          amount: inv.amount,
          status: inv.status,
          expiryDate: inv.expiryDate
            ? new Date(inv.expiryDate).getTime()
            : null,

          planName:
            inv.planType === "FREE"
              ? "Plano Gratuito"
              : `PassGuard PRO ${inv.billingCycle === "anual" ? "Anual" : "Mensal"}`,

          method: inv.method || "Cartão de Crédito",
          planType: inv.planType ?? "PRO",
          billingCycle: inv.billingCycle ?? null,
          hostedInvoiceUrl: inv.hostedInvoiceUrl || "",
          invoicePdf: inv.invoicePdf || "",
          stripeInvoiceId: inv.stripeInvoiceId || "",
        })),
      },
    });
  } catch (error) {
    console.error("Erro fatal getProfile:", error);
    return res.status(500).json({ error: "Erro interno no servidor." });
  }
};

// autologin Update
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { allowAutoLogin } = req.body;
    const userId = req.userId;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { allowAutoLogin }, // 👈 Certifique-se que o nome da coluna no Prisma é este
    });

    return res.json({
      success: true,
      allowAutoLogin: updatedUser.allowAutoLogin,
    });
  } catch (error) {
    console.error("Erro ao salvar settings:", error);
    return res.status(500).json({ error: "Erro ao atualizar banco" });
  }
};

// No seu controller de assinaturas
// Controller de Cancelamento
export const handleStopRenewal = async (req: any, res: any) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Não autorizado." });
    }

    type StripeSubscriptionWithPeriodEnd = Stripe.Subscription & {
      current_period_end: number;
    };

    // 🔍 Busca a subscription do usuário no banco
    const sub = await prisma.subscription.findUnique({
      where: { userId: String(userId) },
      // Para garantir que temos os dados do usuário se precisar logar ou validar algo mais
    });

    if (!sub?.stripeSubscriptionId) {
      return res.status(404).json({
        error: "Assinatura não encontrada.",
      });
    }

    // 🔥 Cancela no fim do período
    const stripeSub = (await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    )) as unknown as StripeSubscriptionWithPeriodEnd; // Garantia de tipo para acessar current_period_end;

    const expiryDate = new Date(stripeSub.current_period_end * 1000);

    if (!stripeSub.current_period_end) {
      throw new Error("Stripe não retornou current_period_end");
    }

    // 💾 Atualiza banco
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: true,
        status: stripeSub.status,
        expiryDate,
      },
    });

    return res.status(200).json({
      message: "Renovação cancelada com sucesso.",
      expiresAt: expiryDate,
    });
  } catch (error: any) {
    console.error("Erro ao cancelar:", error.message);
    return res.status(500).json({
      error: "Erro ao cancelar assinatura.",
    });
  }
};

//REATIVAÇÃO DE ASSINATURA
export const handleResumeRenewal = async (req: any, res: any) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Não autorizado." });
    }

    const sub = await prisma.subscription.findUnique({
      where: { userId: String(userId) },
    });

    if (!sub?.stripeSubscriptionId) {
      return res.status(404).json({
        error: "Assinatura não encontrada.",
      });
    }

    // 🔥 REATIVA no Stripe
    const stripeSub = (await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      {
        cancel_at_period_end: false,
      },
    )) as unknown as Stripe.Subscription;

    // 💾 Atualiza banco
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        cancelAtPeriodEnd: false,
        status: stripeSub.status,
      },
    });

    return res.status(200).json({
      message: "Renovação reativada com sucesso.",
    });
  } catch (error: any) {
    console.error("Erro ao reativar:", error.message);
    return res.status(500).json({
      error: "Erro ao reativar assinatura.",
    });
  }
};

export const updateMasterPassword = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // 1. Validar se a senha atual está correta
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.masterPassword,
    );
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Senha atual incorreta." });
    }

    // 2. Gerar hash da nova senha
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword.trim(), salt);

    // 3. Atualizar no banco
    await prisma.user.update({
      where: { id: userId },
      data: { masterPassword: hashedNewPassword },
    });

    return res.json({ message: "Senha atualizada com sucesso!" });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar senha." });
  }
};

//delete account user
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { password } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado." });

    // 1. Confirmação de segurança
    const isPasswordValid = await bcrypt.compare(password, user.masterPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Senha incorreta." });
    }

    // 2. Cancelar no Stripe usando o ID que agora temos no banco
    if (user.subscription?.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(
          user.subscription.stripeSubscriptionId,
        );
      } catch (e) {
        console.error("Erro Stripe:", e);
      }
    }

    // 3. Delete Cascade (Apaga User, Subscription e Senhas)
    await prisma.user.delete({ where: { id: userId } });

    return res.json({ success: true, message: "Conta excluída!" });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao excluir conta." });
  }
};

export const verifyMasterPassword = async (req: Request, res: Response) => {
  try {
    const userId = req.userId; // ID vindo do seu JWT middleware
    const { password } = req.body;

    // Buscamos o hash direto do banco
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { masterPassword: true }, // Buscamos apenas o necessário
    });

    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // Comparação feita no servidor (muito mais rápido)
    const isValid = await bcrypt.compare(password, user.masterPassword);

    return res.json({ isValid });
  } catch (error) {
    return res.status(500).json({ error: "Erro na verificação" });
  }
};

export const checkSubscription = async (req: Request, res: Response) => {
  try {
    const userId = req.userId; // Certifica-te que o middleware de auth passa o userId

    const sub = await prisma.subscription.findUnique({
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
      billingCycle: sub.billingCycle,
    });
  } catch (error) {
    console.error("❌ Erro no CheckSubscription:", error);
    return res.status(500).json({ error: "Erro ao verificar assinatura." });
  }
};

//cancelamento de plano em trial
// Exemplo do que deve ter no seu backend
// No seu controller do Node.js
export const createPortalSession = async (req: Request, res: Response) => {
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
    const userWithSub = await prisma.user.findUnique({
      where: { id: String(userId) }, // Forçamos string para evitar erro de tipo
      include: { subscription: true },
    });

    // 2. Acessa o ID que está dentro de subscription (stripeCustomerId)
    const customerId = userWithSub?.subscription?.stripeCustomerId;

    if (!customerId) {
      console.log(
        "Aviso: Usuário encontrado, mas sem stripeCustomerId no banco.",
      );
      return res.status(400).json({
        error: "Você ainda não possui um histórico de faturamento no Stripe.",
      });
    }

    // 3. Cria a sessão do portal (Aqui o Stripe gera o link de cancelamento/gestão)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "passguard://cancelTransition", // Deep link para voltar ao seu app
    });

    console.log("Portal Session criada com sucesso:", session.url);
    return res.json({ url: session.url });
  } catch (error: any) {
    console.error("Erro no Portal Stripe:", error.message);
    return res
      .status(500)
      .json({ error: "Erro interno ao gerar portal de faturamento." });
  }
};

export const getVersionResponse = async (req: Request, res: Response) => {
  try {
    const platform = req.headers["x-platform"] || "android";
    const isDev = process.env.NODE_ENV !== "production";

    const config = {
      android: {
        latestVersion: process.env.ANDROID_LATEST_VERSION || "1.0.2",
        minimumVersion: process.env.ANDROID_MIN_VERSION || "1.0.1",
        storeUrl:
          "https://play.google.com/store/apps/details?id=com.silvadev.passguard",
      },
      ios: {
        latestVersion: process.env.IOS_LATEST_VERSION || "1.0.2",
        minimumVersion: process.env.IOS_MIN_VERSION || "1.0.1",
        storeUrl: "https://apps.apple.com/app/idSEU_APP_ID",
      },
    };

    const selected = config[platform as "android" | "ios"] || config.android;

    // 1. Identifica a versão e formata a chave (Ex: 1.0.1 -> 1_0_1)
    const versionKey = selected.latestVersion.replace(/\./g, "_");

    // 2. Busca a string do .env correspondente
    const rawChangelog =
      process.env[`CHANGELOG_${versionKey}`] ||
      "Melhorias gerais de segurança🚀";

    // 3. Transforma em Array (separa pelo ponto e vírgula)
    const changelogArray = rawChangelog.split(";").map((item) => item.trim());

    const latestVersion = selected.latestVersion;
    const minimumVersion = isDev ? "1.0.0" : selected.minimumVersion;
    const forceUpdate = !isDev && process.env.FORCE_UPDATE === "true";

    return res.json({
      latestVersion,
      minimumVersion,
      forceUpdate,
      hasOptionalUpdate: latestVersion !== minimumVersion,
      storeUrl: isDev ? "" : selected.storeUrl,
      changelog: changelogArray, // 👈 Agora retorna um array de strings
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao obter versão." });
  }
};

//Dados de banner para enviar ao frontend
export const PassguardAlert = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    const now = Date.now();
    const alerts: AppAlert[] = [];

    // 🔐 SECURITY
    if (!user?.recoveryQuestion) {
      alerts.push({
        id: "security",
        type: "SECURITY",
        title: "Segurança em risco ⚠️",
        message: "Adicione uma pergunta de recuperação.",
        action: "GO_TO_RECOVERY",
        priority: "HIGH",
      });
    }

    // 🧪 TRIAL (baseado em tempo - correto)
    const trialEndsAt = Number(user?.subscription?.trialEndsAt);

    if (trialEndsAt && trialEndsAt > Date.now()) {
      alerts.push({
        id: "trial",
        type: "TRIAL",
        title: "Período de teste ativo 🚀",
        message: "Aproveite os benefícios do plano PRO.",
        action: "OPEN_BILLING",
        priority: "MEDIUM",
      });
    }

    // 🚀 UPDATE (controlado por versão)
    const latestVersion = process.env.ANDROID_LATEST_VERSION || "1.0.2";
    const clientVersion = req.headers["x-app-version"] as string;

    if (clientVersion && clientVersion !== latestVersion) {
      alerts.push({
        id: "update",
        type: "UPDATE",
        title: "Nova versão disponível 🚀",
        message: "Atualize o app para melhor performance.",
        action: "UPDATE_APP",
        priority: "LOW",
      });
    }

    // 📘 FAQ (sempre disponível)
    alerts.push({
      id: "faq",
      type: "FAQ",
      title: "Central de Ajuda",
      message: "Aprenda a usar o Passguard",
      action: "OPEN_FAQ",
      priority: "LOW",
    });

    // Campanha PRO
    if (!user?.isPremium) {
      alerts.push({
        id: "promo_pro",
        type: "CAMPAIGN",
        title: "🔥 50% OFF no PRO",
        message: "Aproveite hoje e desbloqueie tudo.",
        action: "OPEN_BILLING",
        priority: "MEDIUM",
      });
    }

    alerts.push({
      id: "zap",
      type: "CAMPAIGN",
      title: " Chama no Whatsapp",
      message: "Nossa equipe esta prepara para atender",
      actionLabel: "Não deixe sua dúvida para depois!",
      action: "OPEN_COMPAIGN",
      priority: "LOW",
      expiresAt: now + 100 * 60 * 60 * 1,
    });

    // 🔥 ORDENA NO BACKEND (IMPORTANTE)
    const priorityMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    alerts.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);

    return res.json({ alerts });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar alerts" });
  }
};
