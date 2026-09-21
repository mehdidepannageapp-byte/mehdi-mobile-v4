# Mise en production

Avant publication, remplacer les éléments provisoires suivants :

1. logo, icône et visuels officiels ;
2. grille tarifaire définitive ;
3. informations légales, coordonnées et numérotation des factures ;
4. clés Stripe, Twilio, Google Maps/Places, SMTP et Expo ;
5. numéro du dépanneur unique ;
6. URL HTTPS de l'API et politique de conservation des photos ;
7. CGU, politique de confidentialité et procédure de suppression des données.

Effectuer ensuite des tests réels sur iPhone et Android : paiement, SMS, notifications en arrière-plan, permissions GPS, suivi temps réel, liens Waze/Plans et génération de facture.

Avant cette campagne manuelle, faire passer la recette complète scriptée (`npm --workspace @mehdi/api run recipe`, voir [README.md](../README.md)) contre un environnement de pré-production : elle vérifie en quelques secondes l'ensemble des parcours serveur (carte/espèces, réparation sur place/transport, immédiat/programmé, modification de rendez-vous, supplément, absence, annulation post-prise en charge, bascule de paiement) sans remplacer les tests manuels sur appareil réel.
