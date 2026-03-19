import { prisma } from "./lib/prisma";

async function checkUsers() {
  const users = await prisma.user.findMany({
    where: {
      // aqui você pode filtrar por email ou status
    },
  });
  console.log(JSON.stringify(users, null, 2));
}

checkUsers();
