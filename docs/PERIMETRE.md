# Périmètre fonctionnel

## Parcours client

1. Splash et présentation
2. Connexion par téléphone et code SMS
3. Autorisation de géolocalisation ou saisie manuelle
4. Accueil / SOS dépannage
5. Choix de la panne, puis, pour batterie/crevaison/chaîne uniquement, choix entre **réparation sur place** (le dépanneur intervient à l'adresse de prise en charge, sans destination) ou **transport** (les autres pannes sont toujours transportées)
6. Informations moto et photos facultatives
7. Adresse de départ préremplie ; pour un transport, destination autocomplétée ou choisie parmi les **garages partenaires** proposés
8. Intervention immédiate ou programmée
9. Devis définitif (calculé et recalculé uniquement côté serveur) et choix entre carte/Apple Pay/Google Pay ou espèces
10. Recherche du dépanneur ; en cas de refus de sa part, proposition d'un créneau ferme (30 min / 1h / 1h30) que le client doit accepter (rendez-vous programmé) ou refuser (annulation complète, remboursement immédiat si déjà payé par carte, aucune nouvelle recherche automatique)
11. Si le dépanneur est déjà engagé sur ce créneau (autre mission programmée/en cours, ou indisponibilité déclarée), message automatique dans la messagerie de la demande, affiché comme venant du dépanneur, invitant le client à indiquer une heure qui lui conviendrait ; le client répond en texte libre dans le chat existant
12. Pour une mission programmée, le client peut proposer un **nouveau créneau** avant l'intervention ; l'ancien rendez-vous reste valable tant que le dépanneur n'a pas accepté ou refusé la proposition
13. Suivi GPS en direct et messagerie
14. Étapes de l'intervention ; après la prise en charge de la moto, le client ne peut plus annuler directement — il **soumet une demande** que le dépanneur accepte (avec une nouvelle destination, facturée selon la grille de suppléments) ou refuse
15. Si le dépanneur applique un supplément en cours de mission (changement de destination, distance supplémentaire, nuit/dimanche/jour férié), le nouveau montant est visible immédiatement, avec le détail du calcul
16. En cas d'espèces insuffisantes à la livraison, **bascule vers un paiement carte** directement dans l'application
17. Fin d'intervention, note et commentaire
18. Facture PDF
19. Historique, profil (motos, notifications), support, FAQ et suppression du compte

Cas gérés : géolocalisation refusée, adresse invalide, paiement refusé, aucun dépanneur disponible, refus du dépanneur avec proposition de créneau, conflit d'horaire signalé automatiquement dans la messagerie, programmation ultérieure, perte de connexion, annulation (à l'avance gratuite, le jour même selon le moyen de paiement), annulation post-prise en charge soumise à validation, absence du client constatée par le dépanneur (frais de 50 % du devis), et réparation sur place qui s'avère finalement impossible (conversion en transport, prix recalculé).

## Parcours dépanneur

1. Connexion au compte professionnel unique
2. Disponibilité en ligne/hors ligne
3. Déclaration de créneaux d'indisponibilité pour des missions prises en dehors de l'application : ponctuels (date/heure de début et de fin) ou récurrents (jour de la semaine + plage horaire, actifs jusqu'à suppression manuelle) ; ces créneaux bloquent l'assignation automatique et déclenchent le même message automatique de conflit que ci-dessus
4. Notification de nouvelle mission
5. Détails, acceptation, ou refus avec proposition d'un créneau ferme (30 min / 1h / 1h30) au client
6. Accueil : bannière si une demande de modification de rendez-vous ou un conflit d'horaire est en attente, avec l'écran de décision correspondant (accepter/refuser)
7. Navigation vers le client via Plans, Google Maps ou Waze
8. Confirmation d'arrivée ; si le client est absent, tentatives de contact tracées (appel/message) puis déclaration d'absence (frais de 50 % du devis, mission annulée automatiquement)
9. Pour une réparation sur place : réussite (clôture directe, sans étape de transport) ou constat d'impossibilité (conversion vers transport, avec choix d'un garage ou d'une adresse et recalcul du prix)
10. Photos facultatives de prise en charge
11. Chargement et transport, avec possibilité d'appliquer un supplément (changement de destination, distance supplémentaire, nuit/dimanche/jour férié) strictement issu de la grille tarifaire, et bannière si le client a soumis une demande d'annulation post-prise en charge
12. Livraison ; photo de livraison obligatoire avant clôture pour un transport (pas pour une réparation sur place, qui n'a pas d'étape de livraison)
13. Compte rendu et clôture (facture générée quel que soit le moyen de paiement)
14. Revenus, historique, statistiques, documents et préférences

## Hors périmètre

- Interface d'administration
- Marketplace avec plusieurs dépanneurs
- Validation automatique des documents professionnels
- Comptabilité et reversement bancaire automatisé au dépanneur
- Suivi d'itinéraire routier réel (distance à vol d'oiseau approximative, sans intégration cartographique de calcul d'itinéraire)

## Questions ouvertes

- **Zone de service pour la destination** : la contrainte « Île-de-France uniquement » s'applique aujourd'hui à la fois à l'adresse de départ et à l'adresse de destination. Faut-il l'assouplir pour la destination (ex. autoriser une livraison hors Île-de-France) ? Décision reportée à plus tard — non traitée dans le cadre du chantier refus/créneaux/indisponibilités.
- **Liste des garages partenaires** : alimentée manuellement (seed / base de données) pour cette version ; pas d'écran d'administration pour les gérer (cohérent avec l'absence d'interface d'administration).
