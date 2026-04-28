// /backend/src/controllers/authController.ts
import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma"; // Aquela instância que criamos
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";

import Stripe from "stripe";
import { AlertType, AppAlert } from "../types/auth";
import { SendNotificationRequest } from "../types/sendNotification";

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
        birthYear: user.birthYear,
        masterPassword: user.masterPassword,
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

    // 🧠 calcular dias do trial

    const now = Date.now();
    const alerts: AppAlert[] = [];

    const isEligibleForPromo =
      !user?.isPremium &&
      now - new Date(user.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;

    // 🔐 SECURITY
    if (!user?.recoveryQuestion) {
      alerts.push({
        id: "security",
        type: "SECURITY",
        title: "Segurança ⚠️",
        message:
          "Seu cofre está vulnerável. Configure sua pergunta de recuperação.",
        action: "GO_TO_RECOVERY",
        actionLabel: "CONFIGURAR AGORA",
        icon: "gpp-maybe",
        color: "#ef4444", // Vermelho
        priority: "HIGH",
      });
    }

    // 🧪 TRIAL (baseado em tempo - correto)
    // 🧪 TRIAL (Calculado no Backend)
    const trialEndsAt = Number(user?.subscription?.trialEndsAt);

    if (trialEndsAt && trialEndsAt > now) {
      const diffTime = Math.abs(trialEndsAt - now);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Converte ms para dias

      alerts.push({
        id: "trial",
        type: "TRIAL",
        title: "Período de Teste 🚀",
        message: `Você tem mais ${diffDays} ${diffDays === 1 ? "dia" : "dias"} de acesso PRO. Aproveite todos os recursos!`,
        action: "OPEN_BILLING",
        actionLabel: "VER PLANOS",
        icon: "bolt", // Ícone de raio/energia
        color: "#f59e0b", // Âmbar/Laranja
        priority: "MEDIUM",
        expiresAt: trialEndsAt,
      });
    }

    // 🚀 UPDATE (Controlado por versão)
    const latestVersion = process.env.ANDROID_LATEST_VERSION || "1.0.2";
    const clientVersion = req.headers["x-app-version"] as string;

    if (clientVersion && clientVersion !== latestVersion) {
      alerts.push({
        id: "update",
        type: "UPDATE",
        title: "Atualização Disponível 🚀",
        message: `A versão ${latestVersion} já está disponível com melhorias e correções de segurança.`,
        action: "UPDATE_APP",
        actionLabel: "ATUALIZAR AGORA",
        icon: "system-update", // Ícone de atualização
        color: "#06b6d4", // Ciano (destaque de tecnologia)
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
    if (isEligibleForPromo) {
      alerts.push({
        id: "promo_anual",
        type: "CAMPAIGN",
        title: "Oferta Exclusiva 🎁",
        message: "Ganhe 20% de desconto no plano ANUAL com o cupom QUERO20.",
        action: "OPEN_DESCOUNT",
        actionLabel: "RESGATAR DESCONTO",
        icon: "local-offer", // Nome do ícone do MaterialIcons
        color: "#8b5cf6", // Roxo Violeta
        priority: "HIGH",
        expiresAt: now + 48 * 60 * 60 * 1000,
      });
    }

    // 🔥 ORDENA NO BACKEND (IMPORTANTE)
    const priorityMap = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    alerts.sort((a, b) => priorityMap[b.priority] - priorityMap[a.priority]);

    const validAlerts = alerts.filter((alert) => {
      // ✅ sem expiresAt → passa
      if (alert.expiresAt === undefined || alert.expiresAt === null) {
        return true;
      }

      // 🔒 tenta converter
      const expires = Number(alert.expiresAt);

      // ❌ inválido → REMOVE (evita crash)
      if (isNaN(expires)) {
        console.warn("⚠️ ALERT COM expiresAt INVÁLIDO:", alert);
        return false;
      }

      // ✅ válido
      return expires > now;
    });
    console.log(validAlerts);

    return res.json({ alerts: validAlerts });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar alerts" });
  }
};

export const CreateCampaign = async (req: Request, res: Response) => {
  try {
    const {
      type,
      priority,
      action,
      title,
      message,
      actionLabel,
      actionValue,
      color,
      icon,
      targetAudience,
    } = req.body;

    // Validação rigorosa para não quebrar o carrossel do App
    if (!title || !message || !type || !priority || !action) {
      return res.status(400).json({
        error:
          "Campos obrigatórios ausentes: Título, Mensagem, Tipo, Ação e Prioridade.",
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        type, // Ex: "SECURITY", "DESCOUNT"
        priority, // Ex: "HIGH", "LOW"
        action, // Ex: "OPEN_BILLING"
        title: title.toUpperCase(),
        message,
        actionLabel: actionLabel || "VER DETALHES",
        actionValue: actionValue || "", // URL ou Rota
        color: color || "#8b5cf6",
        icon: icon || "info",
        targetAudience: targetAudience || "ALL",
        isActive: true,
        startsAt: new Date(), // Começa imediatamente
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    });

    return res.status(201).json(campaign);
  } catch (error) {
    console.error("Erro Prisma:", error);
    return res.status(500).json({ error: "Erro ao salvar no banco de dados." });
  }
};

export const AlertsDynamic = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    // 1. Buscamos o usuário com os campos necessários e a relação de subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isPremium: true,
        recoveryQuestion: true,
        subscription: {
          select: {
            trialEndsAt: true,
            status: true,
          },
        },
      },
    });

    if (!user)
      return res.status(404).json({ message: "Usuário não encontrado" });

    const now = new Date();
    const nowTimestamp = now.getTime();

    // 2. Buscamos as campanhas ativas do ecossistema SaaS
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        targetAudience: {
          in: ["ALL", user.isPremium ? "PRO" : "FREE"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Criamos a lista de alertas sistêmicos (Segurança, Trial, etc)
    const systemAlerts: any[] = [];

    // 🔐 ALERTA DE SEGURANÇA
    if (!user.recoveryQuestion) {
      systemAlerts.push({
        id: "security-fix",
        type: "SECURITY",
        title: "Cofre Vulnerável ⚠️",
        message:
          "Configure sua pergunta de recuperação para não perder o acesso.",
        icon: "gpp-maybe",
        color: "#ef4444",
        action: "GO_TO_RECOVERY",
        actionLabel: "CONFIGURAR",
        priority: "HIGH",
        expiresAt: null,
      });
    }

    // 🚀 ALERTA DE TRIAL (Dinâmico)
    const trialDate = user.subscription?.trialEndsAt;
    if (!user.isPremium && trialDate && new Date(trialDate) > now) {
      const diffTime = new Date(trialDate).getTime() - nowTimestamp;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      systemAlerts.push({
        id: "trial-info",
        type: "TRIAL",
        title: "Período Pro 🚀",
        message: `Você tem mais ${diffDays} ${diffDays === 1 ? "dia" : "dias"} de recursos liberados.`,
        icon: "bolt",
        color: "#f59e0b",
        action: "OPEN_PLANS",
        actionLabel: "VER PLANOS",
        priority: "MEDIUM",
        expiresAt: new Date(trialDate).getTime(),
      });
    }

    // 4. Formatamos as campanhas vindas do Dashboard
    const formattedCampaigns = campaigns.map((camp) => ({
      id: camp.id,
      type: camp.type, // Aqui virá "DESCOUNT", "INFO", etc.
      title: camp.title,
      message: camp.message,
      icon: camp.icon,
      color: camp.color,
      action: camp.action,
      actionLabel: camp.actionLabel,
      actionValue: camp.actionValue,
      priority: camp.priority,
      expiresAt: camp.expiresAt ? camp.expiresAt.getTime() : null,
    }));

    // 5. Unificamos tudo em uma única lista para o App
    const allAlerts = [...systemAlerts, ...formattedCampaigns];

    // Ordenação final por prioridade (HIGH > MEDIUM > LOW)
    const priorityScore: any = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    allAlerts.sort(
      (a, b) =>
        (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0),
    );

    return res.json(allAlerts);
  } catch (error) {
    console.error("Erro AlertsDynamic:", error);
    return res.status(500).json({ error: "Erro ao buscar alertas dinâmicos." });
  }
};

// ROTA PARA O ADMIN VER TODAS AS CAMPANHAS COM ESTATÍSTICAS DETALHADAS
export const GetAllCampaignsAdmin = async (req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        // Trazemos a contagem detalhada de interações
        _count: {
          select: { Interactions: true },
        },
        // Buscamos os IDs de quem clicou para calcular cliques únicos
        Interactions: {
          distinct: ["userId"],
          select: { userId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = campaigns.map((camp) => {
      // Calculamos o clique único baseado no array de interações
      const uniqueClicksCount = camp.Interactions.length;

      return {
        ...camp,
        expiresAt: camp.expiresAt ? camp.expiresAt.getTime() : null,
        totalClicks: camp.totalClicks, // O contador atômico (rápido)
        uniqueClicks: uniqueClicksCount, // Cliques por pessoas diferentes
        // Opcional: Removemos o array de interações bruto para não pesar o JSON
        interactions: undefined,
      };
    });

    return res.json(formatted);
  } catch (error) {
    console.error("Erro Admin Stats:", error);
    return res
      .status(500)
      .json({ error: "Erro ao listar campanhas para o admin." });
  }
};

// ROTA PARA O ADMIN VER AS ESTATÍSTICAS GLOBAIS DE INTERAÇÃO (CLIQUES, ORIGEM, GRÁFICO DE CLIQUES DIÁRIOS, ETC)
export const GetCampaignGlobalStats = async (req: Request, res: Response) => {
  try {
    // 1. Totais Gerais
    const totalInteractions = await prisma.interaction.count();
    const uniqueUsersInteracted = await prisma.interaction.groupBy({
      by: ["userId"],
    });

    // 2. Cliques por Origem
    const statsBySource = await prisma.interaction.groupBy({
      by: ["source"],
      _count: { id: true },
    });

    // 3. 🔥 AJUSTE: Pegar os últimos 30 dias para um Area Chart mais bonito
    const daysToView = 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToView);

    const dailyClicks = await prisma.interaction.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // 4. 🔥 O PULO DO GATO: Garantir que todos os dias existam no gráfico (mesmo com 0 cliques)
    const chartDataMap: Record<string, number> = {};

    // Inicializa os últimos X dias com zero
    for (let i = 0; i <= daysToView; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      chartDataMap[label] = 0;
    }

    // Preenche com os dados reais do banco
    dailyClicks.forEach((curr) => {
      const dateLabel = curr.createdAt.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      if (chartDataMap[dateLabel] !== undefined) {
        chartDataMap[dateLabel] += 1;
      }
    });

    // Converte para array e garante a ordem cronológica
    const chartArray = Object.entries(chartDataMap)
      .map(([date, clicks]) => ({ date, clicks }))
      .reverse(); // reverse para ir do mais antigo ao mais atual

    // 5. Métrica de Comparativo (Ontem vs Hoje) para o SaaS
    const hoje = chartArray[chartArray.length - 1]?.clicks || 0;
    const ontem = chartArray[chartArray.length - 2]?.clicks || 0;

    return res.json({
      summary: {
        totalClicks: totalInteractions,
        uniqueUsers: uniqueUsersInteracted.length,
        todayClicks: hoje,
        yesterdayClicks: ontem,
        diffPercentage:
          ontem > 0 ? (((hoje - ontem) / ontem) * 100).toFixed(1) : 0,
      },
      sources: statsBySource,
      chart: chartArray,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Erro ao processar estatísticas globais." });
  }
};

//ROTA PATCH PARA LISTAR E REUTILIZAR CAMPANHAS
export const listAllCampaigns = async (req: Request, res: Response) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now(); // Retorna o timestamp em número (milissegundos)

  const formatted = campaigns.map((c) => {
    let status = "ACTIVE";

    // Convertemos os campos do banco para número (getTime) para garantir a comparação
    const expireTime = c.expiresAt ? new Date(c.expiresAt).getTime() : null;
    const startTime = new Date(c.startsAt).getTime();

    if (!c.isActive) {
      status = "PAUSED";
    } else if (expireTime && expireTime < now) {
      // Comparação de Número vs Número (Seguro e rápido)
      status = "EXPIRED";
    } else if (startTime > now) {
      status = "SCHEDULED";
    } else {
      status = "LIVE";
    }

    return { ...c, status };
  });

  return res.json(formatted);
};

export const DeleteCampaign = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.campaign.delete({ where: { id: String(id) } });
    return res.status(204).send();
  } catch (error) {
    return res
      .status(400)
      .json({ error: "Erro ao deletar campanha ou ID inexistente." });
  }
};

export const listAllUsers = async (req: Request, res: Response) => {
  console.log("[BACKEND] Tentando buscar lista de usuários...");

  try {
    const users = await prisma.user.findMany({
      // Remova o select temporariamente se suspeitar que algum campo está errado
      include: {
        subscription: true, // Garante que traga a relação
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(`[BACKEND] Sucesso! Encontrados ${users.length} usuários.`);

    // Se o array vier vazio, o problema pode ser no banco/conexão
    if (!users || users.length === 0) {
      console.warn("[BACKEND] Aviso: O banco retornou um array vazio.");
    }

    return res.status(200).json(users);
  } catch (error: any) {
    console.error("[BACKEND] Erro Crítico no Prisma:", error.message);
    return res.status(500).json({
      error: "Erro interno ao buscar usuários",
      details: error.message,
    });
  }
};

// Middleware para verificar se o usuário é admin
export const adminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = (req as any).user; // Pegando do seu middleware de auth comum

  if (!user.isAdmin) {
    return res
      .status(403)
      .json({ error: "Acesso negado. Apenas administradores." });
  }

  next();
};
export const GetFinanceStats = async (req: Request, res: Response) => {
  try {
    // 1. Faturamento Total (Soma de todas as assinaturas ativas)
    // Supondo que você tenha o valor do plano no banco ou conte assinaturas
    const activeSubscriptions = await prisma.subscription.count({
      where: { status: "active" },
    });

    // 2. Novos Assinantes nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newSubscribers = await prisma.subscription.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: "active",
      },
    });

    // 3. Busca as últimas transações para a tabela do SaaS
    const recentTransactions = await prisma.subscription.findMany({
      take: 10,
      orderBy: {
        createdAt: "desc", // 👈 O segredo é estar AQUI, no nível da Subscription
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            // Se você incluir 'subscription' aqui dentro de novo,
            // cria um loop desnecessário de dados.
          },
        },
      },
    });

    return res.json({
      metrics: {
        totalActive: activeSubscriptions,
        monthlyGrowth: newSubscribers,
        estimatedMRR: activeSubscriptions * 19.9, // Exemplo de valor do seu plano
      },
      transactions: recentTransactions,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar dados financeiros." });
  }
};

//notifications

export const sendExpoPush = async (
  tokens: string[],
  title: string,
  message: string,
  router: string,
  category: string,
) => {
  if (tokens.length === 0) return;

  // 1. Estruturar as notificações para o formato que o Expo exige
  const notifications = tokens.map((token) => ({
    to: token,
    title: title,
    body: message,
    sound: "default",
    priority: "high",
    data: {
      route: router,
      category: category,
      project: "PassGuard",
      origin: "PUSH_NOTIFICATION",
    },
  }));

  try {
    // 2. Disparo direto para a API do Expo via HTTP POST
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notifications),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Erro na API do Expo:", result);
      throw new Error("Falha ao comunicar com servidor de notificações.");
    }

    console.log("✅ Notificações enviadas via Fetch:", result);
    return result;
  } catch (error: any) {
    console.error("❌ Erro fatal no disparo:", error.message);
    throw new Error(`Erro no Fetch: ${error.message}`);
  }
};
export const sendDynamicNotification = async (req: Request, res: Response) => {
  const { target, title, message, category, router } =
    req.body as SendNotificationRequest;

  console.log("🚀 Iniciando Disparo Silva Dev:", { target, category, router });

  try {
    // 1. Definição do filtro de público
    let queryFilter = {};

    switch (target) {
      case "FREE":
        queryFilter = { isPremium: false };
        break;
      case "PRO":
        queryFilter = { isPremium: true };
        break;
      case "ALL":
        queryFilter = {}; // Sem filtro, pega todos
        break;
      default:
        return res.status(400).json({ error: "Target inválido" });
    }

    // 2. Busca usuários no banco
    const users = await prisma.user.findMany({
      where: {
        pushToken: {
          not: null,
          startsWith: "ExponentPushToken",
        },
        ...queryFilter,
      },
      select: { id: true, pushToken: true },
    });

    // 3. Validação de segurança Silva Dev
    const regexPro = /\bpro\b/i;

    if (target === "FREE" && regexPro.test(title)) {
      return res.status(400).json({
        error:
          "⚠️ Bloqueio: Você não pode usar a palavra 'PRO' em campanhas para usuários FREE.",
      });
    }

    // 3. 🔥 O PULO DO GATO: Salvar no Banco de Dados para o Inbox do App
    // Usamos o createMany para ser performático e salvar para todos os usuários de uma vez
    const notificationsToSave = users.map((user) => ({
      userId: user.id,
      title: title,
      message: message,
      category: category,
      route: router || null, // 👈 Aqui: 'route' é o nome no Model, 'router' vem do seu body
      isRead: false,
      // Interactions não entra aqui, o Prisma ignora relações no createMany
    }));

    try {
      await prisma.notification.createMany({
        data: notificationsToSave,
        skipDuplicates: true, // Segurança Silva Dev para evitar erros de constraint
      });
    } catch (error) {
      console.error("❌ Erro no Prisma createMany:", error);
      // Se der erro aqui, o 400 vem daqui
    }

    // 4. 🔥 SOLUÇÃO PARA DUPLICADOS: Criar lista de tokens ÚNICOS
    // O Set remove automaticamente strings repetidas
    const allTokens = users.map((u) => u.pushToken as string);
    const uniqueTokens = Array.from(new Set(allTokens));

    if (uniqueTokens.length === 0) {
      return res.status(404).json({
        message: "Nenhum token válido encontrado para este alvo.",
      });
    }

    // 5. Disparo via Expo (usando a lista limpa)
    const result = await sendExpoPush(
      uniqueTokens,
      title,
      message,
      router,
      category,
    );

    return res.status(200).json({
      success: true,
      message: `Disparo ${category} enviado com sucesso.`,
      stats: {
        totalUsersFound: allTokens.length,
        uniqueDevicesNotified: uniqueTokens.length, // Quantos celulares realmente apitaram
      },
      result,
    });
  } catch (error: any) {
    console.error("❌ Erro no Controller de Notificação:", error.message);
    return res.status(500).json({
      message: "Erro interno no servidor",
      details: error.message,
    });
  }
};
// Lista de Notificações para o Admin (Dashboard)
export const listNotifications = async (req: Request, res: Response) => {
  const userId = req.userId;
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(notifications);
  } catch (error) {
    console.error("Erro ao listar notificações:", error);

    return res.status(500).json({ error: "Erro ao buscar notificações." });
  }
};
export const markAsRead = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.userId; // Importante para segurança

  try {
    await prisma.notification.update({
      where: {
        id: id as unknown as string, // Força o tipo para string
        userId: userId, // Garante que o usuário só mude as dele
      },
      data: { isRead: true },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao atualizar banco" });
  }
};

// Rota para Notification click
export const trackInteraction = async (req: Request, res: Response) => {
  const { notificationId, campaignId, type, source } = req.body;
  const userId = req.userId;

  try {
    await prisma.$transaction([
      // 1. Registra a interação detalhada
      prisma.interaction.create({
        data: { userId, notificationId, campaignId, type, source },
      }),
      // 2. Incrementa o contador rápido na tabela de origem (Atomic increment)
      ...(campaignId
        ? [
            prisma.campaign.update({
              where: { id: campaignId },
              data: { totalClicks: { increment: 1 } },
            }),
          ]
        : []),
      ...(notificationId
        ? [
            prisma.notification.update({
              where: { id: notificationId },
              data: { isRead: true }, // Se for clique em notificação, já marca como lida
            }),
          ]
        : []),
    ]);

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao processar clique" });
  }
};

//buscando pushToken user
export const updatePushToken = async (req: Request, res: Response) => {
  const { pushToken } = req.body;
  const userId = req.userId; // ID vindo do token JWT no middleware de autenticação

  if (!pushToken) {
    return res.status(400).json({ error: "Token não fornecido." });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { pushToken },
    });

    return res
      .status(200)
      .json({ message: "Push token atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar push token:", error);
    return res.status(500).json({ error: "Erro interno ao salvar token." });
  }
};
