import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Garages partenaires de démonstration (Île-de-France), clairement identifiés comme tels.
// Alimentation manuelle en base pour cette version (§2.2 du cahier des charges).
const demoGarages = [
  { id: 'garage-demo-1', name: '[DÉMO] Garage Moto Paris Bastille', address: '12 rue de la Roquette, 75011 Paris', latitude: 48.8566, longitude: 2.3728, phone: '+33100000001', order: 1 },
  { id: 'garage-demo-2', name: '[DÉMO] Garage Moto Boulogne', address: '5 avenue Jean-Baptiste Clément, 92100 Boulogne-Billancourt', latitude: 48.8352, longitude: 2.2401, phone: '+33100000002', order: 2 },
  { id: 'garage-demo-3', name: '[DÉMO] Garage Moto Saint-Denis', address: '20 rue de la République, 93200 Saint-Denis', latitude: 48.9362, longitude: 2.3574, phone: '+33100000003', order: 3 },
];

async function main() {
  const phone = process.env.DRIVER_PHONE ?? '+33600000000';
  await prisma.user.upsert({
    where: { phone },
    update: { role: UserRole.DRIVER, firstName: 'Mehdi' },
    create: { phone, role: UserRole.DRIVER, firstName: 'Mehdi' },
  });
  console.log(`Compte dépanneur prêt : ${phone}`);

  for (const garage of demoGarages) {
    await prisma.garage.upsert({ where: { id: garage.id }, update: garage, create: { ...garage, active: true } });
  }
  console.log(`${demoGarages.length} garages partenaires de démonstration prêts.`);
}

main().finally(() => prisma.$disconnect());
