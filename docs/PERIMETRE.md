# Périmètre fonctionnel

## Parcours client

1. Splash et présentation
2. Connexion par téléphone et code SMS
3. Autorisation de géolocalisation ou saisie manuelle
4. Accueil / SOS dépannage
5. Choix de la panne
6. Informations moto et photos facultatives
7. Adresse de départ préremplie et destination autocomplétée
8. Intervention immédiate ou programmée
9. Devis automatique et choix entre carte/Apple Pay/Google Pay ou espèces
10. Recherche du dépanneur ; en cas de refus de sa part, proposition d'un créneau ferme (30 min / 1h / 1h30) que le client doit accepter (rendez-vous programmé) ou refuser (annulation complète, remboursement immédiat si déjà payé par carte, aucune nouvelle recherche automatique)
11. Si le dépanneur est déjà engagé sur ce créneau (autre mission programmée/en cours, ou indisponibilité déclarée), message automatique dans la messagerie de la demande, affiché comme venant du dépanneur, invitant le client à indiquer une heure qui lui conviendrait ; le client répond en texte libre dans le chat existant
12. Suivi GPS en direct et messagerie
13. Étapes de l'intervention
14. Fin d'intervention, note et commentaire
15. Facture PDF
16. Historique, profil, support, FAQ et suppression du compte

Cas gérés : géolocalisation refusée, adresse invalide, paiement refusé, aucun dépanneur disponible, refus du dépanneur avec proposition de créneau, conflit d'horaire signalé automatiquement dans la messagerie, programmation ultérieure, perte de connexion et annulation.

## Parcours dépanneur

1. Connexion au compte professionnel unique
2. Disponibilité en ligne/hors ligne
3. Déclaration de créneaux d'indisponibilité pour des missions prises en dehors de l'application : ponctuels (date/heure de début et de fin) ou récurrents (jour de la semaine + plage horaire, actifs jusqu'à suppression manuelle) ; ces créneaux bloquent l'assignation automatique et déclenchent le même message automatique de conflit que ci-dessus
4. Notification de nouvelle mission
5. Détails, acceptation, ou refus avec proposition d'un créneau ferme (30 min / 1h / 1h30) au client
6. Navigation vers le client via Plans, Google Maps ou Waze
7. Confirmation d'arrivée
8. Photos facultatives de prise en charge
9. Chargement et transport
10. Livraison
11. Photos finales facultatives, compte rendu et clôture
12. Revenus, historique, statistiques, documents et préférences

## Hors périmètre

- Interface d'administration
- Marketplace avec plusieurs dépanneurs
- Validation automatique des documents professionnels
- Comptabilité et reversement bancaire automatisé au dépanneur

## Questions ouvertes

- **Zone de service pour la destination** : la contrainte « Île-de-France uniquement » s'applique aujourd'hui à la fois à l'adresse de départ et à l'adresse de destination. Faut-il l'assouplir pour la destination (ex. autoriser une livraison hors Île-de-France) ? Décision reportée à plus tard — non traitée dans le cadre du chantier refus/créneaux/indisponibilités.
