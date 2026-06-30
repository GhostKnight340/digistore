# Plan d'implémentation — Système d'emails transactionnels ghost.ma

Statut : **plan uniquement** (aucun code écrit pour l'instant). Fournisseur d'envoi : **à décider plus tard** — les templates seront construits de façon agnostique du fournisseur.

## Contexte / état actuel

- Le projet **n'envoie aucun email aujourd'hui** : aucune dépendance (`nodemailer`/`resend`/SMTP), aucun code d'envoi. Les commandes stockent `customerEmail` mais rien n'est expédié.
- Les pages légales et l'UI promettent pourtant « vous recevez vos codes par email » → cet écart doit être comblé.
- Les maquettes fournies (zip + HTML) sont des **mockups de design** (div + flexbox, 0 `<table>`). Elles ne sont **pas** envoyables telles quelles (Outlook/Gmail cassent flexbox/grid). Elles doivent être reconstruites en HTML compatible email.
- Les maquettes portent encore la marque « Karta » → à passer en **ghost.ma** (logos déjà fournis : `ghost-ma-logo-above.png`, `ghost-ma-logo-below.png`).

## Langage visuel à respecter (extrait du handoff)

- Largeur : conteneur **600px**, padding latéral **40px**.
- Couleurs : corps `#0A0B0F` sur canvas `#09090B`, accent `#3E7BFA`.
- Police : **Geist** avec fallback `system-ui` (les emails ne chargent pas de webfont de façon fiable → la fallback doit être propre).
- Seules **la couleur du badge, l'icône hero et la couleur de l'alerte** changent entre les états ; la mise en page ne bouge pas.

## Architecture proposée (agnostique du fournisseur)

```
src/lib/email/
  render.ts          // rend un template React Email → { html, text, subject }
  send.ts            // interface sendEmail() + provider "noop" par défaut
  providers/
    noop.ts          // log uniquement (dev / clé absente) — défaut sûr
    (resend.ts)      // ajouté plus tard si Resend
    (smtp.ts)        // ajouté plus tard si Nodemailer
  templates/
    _Layout.tsx      // wrapper 600px, surface sombre, footer
    _components.tsx  // StatusBadge, HeroIcon, ProductCard, CodeDeliveryCard,
                     // OrderSummary, PaymentCard, Timeline, AlertBox, Button
    OrderUpdate.tsx        // Template 2
    ActionRequired.tsx     // Template 3
    Delivery.tsx           // Template 4
    SupportRefund.tsx      // Template 5
    AccountSecurity.tsx    // Template 1
```

- `send.ts` expose `sendEmail({ to, template, data })`. Tant qu'aucun fournisseur n'est configuré, il utilise le provider **noop** (log en console) → le build et le dev ne cassent jamais, et on branche un vrai fournisseur plus tard sans toucher au reste.
- Les `{{placeholder}}` deviennent des **props typées** des composants (ex. `delivery_code` → `code: string`).

## Dépendances à ajouter (rendu uniquement, pas d'envoi)

- `@react-email/components` + `react-email` (rendu HTML compatible email + serveur de preview local).
- Aucun SDK d'envoi pour l'instant (décision fournisseur reportée).

## Les 5 templates → cycle de vie de la commande

Statuts réels en base : `pending_payment`, `payment_submitted`, `payment_confirmed`, `payment_issue`, `payment_rejected`, `delivered`, `refunded`, `rejected`, `cancelled`.

| Template | Déclencheur (transition de statut) | Badge | Contenu clé |
| --- | --- | --- | --- |
| Order Update | `pending_payment` → `payment_submitted` | Awaiting Payment / Payment Received | récap commande, statut, lien suivi |
| Action Required | passage en vérification / `payment_issue` | Verification | ce qui est demandé (preuve de paiement), CTA |
| Delivery | `payment_confirmed` / `delivered` | Delivered | `CodeDeliveryCard` + étapes d'utilisation + rappel sécurité |
| Support & Refund | `refunded` / `rejected` / `cancelled` | Refunded / Rejected | explication, montant, prochaines étapes |
| Account Security | création de compte / réinitialisation | Account | lien d'action, expiration |

## Données injectées (sources existantes)

- **Commande / produit / code** : `src/lib/db/orders.ts`, `fulfillment.ts` (numéro, produit, variante, montant, code livré).
- **Support** (`{{support_email}}`, `{{support_whatsapp}}`) : table `SupportConfig` existante.
- **Marque / liens légaux** : `StoreSettings` (logoText = ghost.ma, liens `/terms`, `/privacy`, `/refunds`).

## Points d'accroche (wiring) — quand l'envoi sera activé

- `src/app/actions/orders.ts` et `src/lib/db/fulfillment.ts` : aux transitions de statut, appeler `sendEmail(...)`.
- Idempotence : ne pas renvoyer le même email deux fois pour la même transition (un flag/log d'envoi sur la commande).

## Configuration & sécurité (pour la phase d'envoi)

- Variable d'env du fournisseur (ex. `RESEND_API_KEY` ou identifiants SMTP) — **non requise** pour la phase templates.
- Fallback **noop** si la clé est absente → jamais de crash en build/CI/dev.
- Domaine `ghost.ma` à vérifier (SPF/DKIM) côté fournisseur avant tout envoi réel.
- Lien de désabonnement uniquement pour les emails non transactionnels.

## Découpage en lots

1. **Lot 1 — Templates (sans envoi).** Dépendances rendu + `_Layout` + composants + 5 templates rebrandés ghost.ma + route de preview locale. Aucun envoi, aucun risque. ✅ correspond à « build templates only ».
2. **Lot 2 — Couche d'envoi.** `send.ts` + provider choisi + variables d'env + fallback noop.
3. **Lot 3 — Wiring cycle de vie.** Appels aux transitions de statut + idempotence + tests.

## Vérification

- `react-email` dev server pour prévisualiser chaque template avec des données factices.
- Test de rendu : HTML basé sur tables, styles inline, dégradé propre sans webfont.
- `next build` doit rester vert (le provider noop garantit l'absence de dépendance d'envoi obligatoire).

## Décisions en attente

- **Fournisseur d'envoi** : Resend + React Email (recommandé) vs SMTP/Nodemailer — reporté.
- Confirmer le mapping exact statut → template (tableau ci-dessus) avant le Lot 3.
