# Lancer Mehdi Dépannage sur Mac

## 1. Préparer les logiciels

Installez et ouvrez :

- Docker Desktop ;
- Node.js 22 ou une version plus récente ;
- Xcode avec un simulateur iPhone ;
- Android Studio uniquement si vous souhaitez aussi tester Android.

## 2. Ouvrir le projet

Décompressez le dossier, puis ouvrez Terminal dans le dossier `mehdi-depannage`.

## 3. Préparer les fichiers de configuration

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Les clés externes peuvent rester vides pour le premier lancement. L’application utilisera les données et paiements de démonstration.

Sur le Mac où les ports PostgreSQL 5432 et 5433 sont déjà occupés par d'autres projets, cet exemple utilise le port **5434** côté Mac (`5434:5432` dans Docker). `apps/api/.env` doit employer `localhost:5434` pour sa `DATABASE_URL`.

## 4. Démarrer PostgreSQL

Vérifiez que Docker Desktop affiche « Engine running », puis :

```bash
docker compose up -d
```

## 5. Installer et préparer la base

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

Validez le nom de migration proposé par Prisma si le terminal le demande.

## 6. Lancer le serveur Node.js

Dans le premier terminal :

```bash
npm run dev:api
```

Laissez ce terminal ouvert. Il doit afficher l’adresse `http://localhost:4000`.

## 7. Lancer l’application iPhone

Dans un second terminal, toujours à la racine du projet :

```bash
npm run dev:mobile
```

Quand Expo est prêt, appuyez sur `i` pour ouvrir le simulateur iPhone.

Pour Stripe, Apple Pay et les modules natifs définitifs :

```bash
cd apps/mobile
npx expo prebuild
npx expo run:ios
```

Cette commande crée automatiquement le projet Xcode. Il n’est pas nécessaire d’ouvrir manuellement un fichier avant cette étape.

## Connexion de démonstration

Sur l’écran de connexion :

- « Entrer comme client » ouvre l’espace client ;
- « Entrer comme dépanneur » ouvre le compte professionnel unique ;
- le code SMS local est `000000`.

Pour simuler l’affectation d’une mission, mettez d’abord le compte dépanneur « En ligne », puis créez une demande côté client.

Si le simulateur se géolocalise hors Île-de-France, sélectionnez une adresse francilienne manuellement ; sans clé Google Maps, le menu propose trois lieux explicitement marqués « démo ». Le tarif kilométrique est basé sur une distance approximative, non sur un itinéraire routier vérifié.

## Tester sur un véritable téléphone

`localhost` représente le téléphone lui-même. Remplacez donc `EXPO_PUBLIC_API_URL` dans `apps/mobile/.env` par l’adresse IP locale du Mac, par exemple :

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:4000
```

Le Mac et le téléphone doivent être connectés au même Wi-Fi.
