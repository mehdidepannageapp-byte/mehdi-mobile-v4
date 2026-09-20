import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.DRIVER_PHONE ?? '+33600000000';
  await prisma.user.upsert({
    where: { phone },
    update: { role: UserRole.DRIVER, firstName: 'Mehdi' },
    create: { phone, role: UserRole.DRIVER, firstName: 'Mehdi' },
  });
  console.log(`Compte dépanneur prêt : ${phone}`);
}

main().finally(() => prisma.$disconnect());
