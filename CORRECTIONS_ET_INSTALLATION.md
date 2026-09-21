# Correctif du devis et du paiement en espèces — Mehdi Dépannage

Ce correctif concerne l'écran « Votre devis » qui montrait une distance de 11 189,7 km, gardait « Calcul du montant… » et désactivait le bouton de confirmation.

## Causes identifiées

- Le simulateur peut fournir une position hors Île-de-France (par exemple, sa position iOS par défaut aux États-Unis). L'application acceptait cette position sans vérification et calculait une distance énorme.
- L'API refusait alors le devis (distance supérieure à 300 km) ; le code de l'écran ne gérait pas le rejet de la promesse. Le prix restait nul, ce qui désactivait la confirmation, y compris pour les espèces.
- En l'absence de clé Google Maps, toutes les adresses de démonstration étaient en réalité géocodées au même point, alors que l'application prétendait avoir validé le trajet.

## Corrections

- Vérification approximative de la zone desservie côté application et côté API, et refus des GPS de simulateur hors zone.
- Recalcul du trajet à partir des deux positions choisies, plutôt que d'une distance mémorisée qui pouvait être périmée.
- Gestion des erreurs d'estimation : explication visible, « Corriger le trajet » ou « Réessayer le calcul ». Plus de promesse rejetée silencieusement.
- Bouton de confirmation activé seulement lorsque le devis est disponible et le trajet cohérent. Le paiement en espèces ne sollicite pas Stripe.
- Message spécifique « aucune préautorisation bancaire » en espèces.
- Les photos facultatives qui échouent à l'envoi ne bloquent plus une demande déjà créée.
- Mode démo sans Google Maps : trois lieux d'exemple fixes avec coordonnées différentes et étiquetés « démo », au lieu d'adresses saisies faussement validées.

**Limites :** la distance reste une approximation (distance à vol d'oiseau × 1,25, minimum 2 km), pas un itinéraire routier réel. Le rectangle géographique est une vérification grossière, pas une validation exacte des frontières de l'Île-de-France. Pour de vraies adresses et distances routières, intégrer et configurer une API géocodage/itinéraire avant la mise en production. Les flux de paiement réels et l'application complète doivent aussi être testés sur le Mac.

## Installation : ZIP « correctif-mehdi-v3.zip »

1. Laisser Docker/PostgreSQL actif. Arrêter temporairement les deux Terminaux Node.js et Expo avec `Ctrl + C` dans chacun.
2. Télécharger `correctif-mehdi-v3.zip` dans le dossier Téléchargements de votre Mac.
3. Dans un Terminal, **à la racine du dossier d'origine** (celui contenant `apps`, `package.json` et `docker-compose.yml`), exécuter :

```bash
cd "/Users/walid/Desktop/mehdi mobile v3"
unzip -o ~/Downloads/correctif-mehdi-v3.zip -d .
```

Si le ZIP est téléchargé ailleurs ou renommé, remplacer son chemin par le chemin exact. Le correctif contient uniquement les fichiers de code, documentation et exemples de configuration changés : il ne contient aucun `.env` réel, fichier `node_modules`, sauvegarde PostgreSQL ou donnée utilisateur et ne remplace pas la configuration Docker locale.

4. Vérifier que `apps/api/.env` utilise toujours `localhost:5435` pour `DATABASE_URL`, **sans partager son contenu**. Votre `docker-compose.yml` local doit toujours publier `5435:5432`.
5. Redémarrer l'API, depuis le dossier du projet :

```bash
npm run dev:api
```

6. Dans un autre Terminal, au même endroit :

```bash
npm --workspace @mehdi/mobile run start -- --clear
```

7. Quand Expo est prêt, appuyer sur `i` si le simulateur n'a pas déjà relancé l'application.

**Pas besoin** de réexécuter les migrations Prisma, de supprimer les volumes PostgreSQL, de réinstaller toutes les dépendances ni de recréer la base pour ce correctif. Ne lancez pas `docker compose down -v` : cela supprimerait le volume de la base de ce projet.

## Scénario de test

- Lancer une demande en mode client et choisir « Trajet de la moto ».
- Si le simulateur propose un GPS hors Île-de-France, l'application doit afficher un message et vous permettre de choisir manuellement les lieux.
- Sans clé Google Maps, taper trois caractères pour afficher les **lieux de démonstration** ; sélectionner par exemple « Place de la République, Paris (démo) » au départ et « Château de Vincennes, Vincennes (démo) » à l'arrivée.
- Poursuivre jusqu'au devis : un prix doit apparaître, puis choisir « Espèces ». Le bouton « Confirmer et payer en espèces » devient cliquable lorsque les données du devis sont valides.
- Si l'API est indisponible, le devis affiche un message d'erreur et un bouton « Réessayer le calcul », au lieu de rester sur « Calcul du montant… ».

## Tests automatisés du calcul / contrôle de zone

```bash
npm run test:route
```

Ces tests ciblent les calculs de distance et la vérification grossière de zone ; ils ne remplacent pas une campagne de tests iOS, backend/PostgreSQL, Stripe et GPS réelle.
