// /backend/src/controllers/authController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma"; // Aquela instância que criamos
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-04-10" as any,
});
/* const endpoint =
  "whsec_48e96b5a687cb686cf3964b4416aad40c03428183b99f65232028a3f28096e7e"; */

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
          status: user.subscription?.status || "none",
          planType: user.subscription?.billingCycle || "FREE",
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
    const { userId, recoveryQuestion, recoveryHash } = req.body;

    if (!recoveryQuestion || !recoveryHash) {
      return res
        .status(400)
        .json({ error: "Pergunta e Hash são obrigatórios." });
    }

    // Atualizamos apenas os campos de recuperação
    const updatedUser = await prisma.user.update({
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
            planType: cycle,
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
    const planType = session.metadata?.planType || "mensal";

    console.log(`🚀 Checkout Finalizado! User: ${userId} | Plan: ${planType}`);

    if (userId) {
      await prisma.subscription.upsert({
        where: { userId: userId },
        update: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "trialing",
          isPremium: true,
          billingCycle: planType, // Garante que não apareça "FREE" no app
          expiryDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 24h de Trial
          trialEndsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        },
        create: {
          userId: userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: "trialing",
          isPremium: true,
          billingCycle: planType,
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
            planType: sub.billingCycle || "mensal",
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
    const { userId, planType } = req.body;

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
            planType === "anual"
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
          planType: planType,
        },
      },

      // 🔥 redundância segura
      metadata: {
        userId: user.id,
        planType: planType,
      },

      success_url: `passguard://checkout?status=success&planType=${planType}`,
      cancel_url: `passguard://checkout?status=cancel`,
    });

    res.json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("Erro Stripe Checkout:", error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { userId, subscriptionId } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        invoices: {
          orderBy: { date: "desc" },
          take: 15, // Aumentei um pouco para garantir um histórico melhor
        },
      },
    });
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const interval = subscription.items.data[0].price.recurring.interval;

    const billingCycle = interval === "month" ? "mensal" : "anual";

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Calculamos a data de expiração real
    // Se não tiver subscription, usamos null.
    // Se tiver, priorizamos o expiryDate da assinatura.

    const expiryDate = user.subscription?.expiryDate
      ? new Date(user.subscription.expiryDate).getTime()
      : null;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,

        birthYear: user.birthYear,
        masterPassword: user.masterPassword,
        createdAt: user.createdAt,
        billingCycle: billingCycle, // Adicionamos o ciclo de cobrança aqui
        // --- DADOS DE SEGURANÇA ---
        recoveryQuestion: user.recoveryQuestion || null,
        // 🚀 ADICIONE ESTA LINHA AQUI:
        recoveryHash: user.recoveryHash || null,
        // Ou melhor ainda por segurança:
        hasRecoveryHash: !!user.recoveryHash,
        //Auto Login
        allowAutoLogin: user.allowAutoLogin, // A coluna booleana
        settings: user.settings, // O campo JSON (mesmo que seja null)
        // --- DADOS DE PAGAMENTO ---
        isPremium: user.isPremium,
        planType: user.subscription?.billingCycle || "FREE",
        premiumExpiryDate: expiryDate,
        cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd || false,

        // Enviamos o trialEndsAt para o App saber se ainda está no teste
        subscription: {
          status: user.subscription?.status,
          billingCycle: user.subscription?.billingCycle || "FREE",
          trialEndsAt: user.subscription?.trialEndsAt
            ? new Date(user.subscription.trialEndsAt).getTime()
            : null,
        },
        // --- HISTÓRICO DE FATURAS ---
        invoices: user.invoices.map((inv: any) => ({
          id: inv.id,
          date: new Date(inv.date).getTime(),
          amount: inv.amount,
          status: inv.status,
          expiryDate: inv.expiryDate
            ? new Date(inv.expiryDate).getTime()
            : null,

          // 🔥 Campos que estavam faltando e que o App precisa:
          method: inv.method || "Cartão de Crédito",
          planName:
            inv.planName ||
            (billingCycle === "anual" ? "Plano Anual" : "Plano Mensal"),
          stripeSubscriptionId: inv.stripeSubscriptionId || "",

          // 🔥 Garantindo que esses aqui passem:
          hostedInvoiceUrl: inv.hostedInvoiceUrl,
          invoicePdf: inv.invoicePdf,
          stripeInvoiceId: inv.stripeInvoiceId,
        })),
      },
    });
  } catch (error) {
    console.error("Erro getProfile:", error);
    return res.status(500).json({ error: "Erro ao buscar perfil." });
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
  const { subscriptionId } = req.body;

  try {
    const subscription: Stripe.Subscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: true,
      },
    );

    const expiryDate = new Date(
      (subscription as any).current_period_end * 1000,
    );

    await prisma.subscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        cancelAtPeriodEnd: true,
        status: subscription.status,
        expiryDate,
      },
    });

    return res.status(200).send({
      message: "Renovação interrompida.",
      expiresAt: expiryDate,
    });
  } catch (error: any) {
    console.error("Erro ao cancelar:", error.message);
    return res.status(500).send({
      error: "Falha ao processar cancelamento no Stripe.",
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
      planType: sub.billingCycle,
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
