# Mehdi Dépannage

Application mobile React Native iOS/Android réunissant deux espaces :

- **Client** : demande immédiate ou programmée, réparation sur place ou transport, géolocalisation, devis, paiement (carte ou espèces, avec bascule vers la carte en cours de mission), suivi temps réel, messagerie, modification de rendez-vous, demande d'annulation après prise en charge, facture et avis.
- **Dépanneur** : disponibilité, indisponibilités déclarées, réception de la mission, navigation Plans/Waze, conversion réparation sur place → transport, suppléments tarifaires, gestion des absences client, traitement des demandes de modification/annulation, suivi des étapes, messagerie, historique et revenus.

Le projet contient un backend Node.js/Express, une base PostgreSQL/Prisma et une application Expo React Native. Il n'inclut volontairement aucune interface d'administration ni de marketplace multi-dépanneurs (un seul compte professionnel).

## Démarrage rapide

Prérequis : Node.js 22+, Docker Desktop, Xcode pour iOS et Android Studio pour Android.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

Dans un second terminal :

```bash
npm run dev:mobile
```

L'application démarre en **mode démonstration** même sans clés Stripe, Google Maps ou Twilio. Sur l'écran de connexion, les boutons « Démo client » et « Démo dépanneur » permettent de parcourir les deux espaces.

Pour compiler nativement avec Apple Pay, Google Pay, les notifications et les cartes :

```bash
cd apps/mobile
npx expo prebuild
npx expo run:ios
```

## Comptes de démonstration

- Client : bouton **Démo client**
- Dépanneur unique : bouton **Démo dépanneur**
- Code OTP local : `000000`

Le seed crée le compte dépanneur `+33600000000`. Changez ce numéro dans `apps/api/prisma/seed.ts` avant une mise en production.

## Configuration externe

Les variables documentées dans les fichiers `.env.example` activent :

- Stripe et la préautorisation avant intervention, avec paiement en espèces également disponible ;
- Twilio pour les SMS et le code OTP ;
- Google Places pour valider/autocompléter les adresses ;
- Expo Push pour les notifications ;
- SMTP pour l'envoi des factures PDF.

## Tarification

La grille initiale est centralisée dans `apps/api/src/config/pricing.ts` : un forfait de départ selon la panne, un prix au kilomètre et des suppléments de nuit et de week-end, calculés côté serveur à la création de la demande (le mobile ne fait qu'afficher le détail, jamais recalculer).

Une fois la mission acceptée, une grille **de suppléments** distincte (même fichier, `surchargeGrid`) encadre les ajustements que le dépanneur peut appliquer en cours de route : changement de destination, distance supplémentaire, nuit/dimanche/jour férié. Chaque supplément est tracé (`Surcharge`, montant, total avant/après) et ne peut jamais dépasser ce que la grille autorise. Les règles d'annulation (gratuite à l'avance, 50 % le jour même par carte, gratuite en espèces) et d'absence client (50 % du devis) vivent dans `apps/api/src/services/cancellation.ts`. Toutes les sommes sont en centimes d'euro.

## Tests et vérifications

```bash
npm run typecheck
npm test
```

Recette complète bout-en-bout (démarre son propre serveur, exerce carte/espèces, réparation sur place/transport, immédiat/programmé et tous les nouveaux flux — conversion transport, modification de rendez-vous, supplément, absence, annulation post-prise en charge, bascule de paiement — contre la vraie base Postgres locale, déjà migrée) :

```bash
npm --workspace @mehdi/api run recipe
```

Voir aussi [docs/PERIMETRE.md](docs/PERIMETRE.md) pour l'inventaire des écrans et [docs/MISE_EN_PRODUCTION.md](docs/MISE_EN_PRODUCTION.md) avant publication.

Pour un lancement guidé sur Mac et Xcode, suivez [LANCEMENT_SUR_MAC.md](LANCEMENT_SUR_MAC.md).
