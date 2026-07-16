# Ghost.ma — Manual Test Checklist (for the owner)

Plain-language walkthrough to run on **staging** (`staging.ghost.ma`) before a
launch or a big change. You don't need to understand the code — just follow the
steps and tick each box. Use short staging expiry timers where mentioned so you
don't have to wait long. Report anything that looks wrong.

> On staging you should see the **orange "STAGING — données et paiements de test"
> banner** at the top. If you don't, stop — you might be on the real site.

## Account
1. [ ] Create a new test customer (use your own email or a test address).
2. [ ] Open the verification email and verify the account. _(On staging, email only arrives if your address is on the allowlist; otherwise check the admin email log shows "simulated".)_
3. [ ] Log in and out.

## Browse & product
4. [ ] Search for a product (try "PSN", "Steam", "Netflix"). Results look relevant.
5. [ ] Open a product; choose a region and a denomination. Price shows in **DH**.
6. [ ] Add the product to your wishlist, then remove it.
7. [ ] Use the Share button; the copied link opens the same product.

## Cart, promo, credit
8. [ ] Add the product to the cart; the total is correct.
9. [ ] Apply a **percentage** promo code — discount applies.
10. [ ] Apply a **fixed-amount** promo code — discount applies.
11. [ ] Apply a **Ghost Credit** promo (if configured) — credit is granted.
12. [ ] Use wallet credit at checkout — the amount to pay drops accordingly.

## Orders & credit locking
13. [ ] Create an order but don't pay yet.
14. [ ] Confirm the "locked" Ghost Credit is tied to **this exact order** (in your account wallet).
15. [ ] Cancel the order — the locked credit is restored to your balance.
16. [ ] Create another unpaid order and let the short staging expiry release it automatically — credit and promo come back.

## Payment (sandbox)
17. [ ] Pay one order with **sandbox PayPal** — it completes and the order is marked paid.
18. [ ] Pay another with a **manual/bank proof** — upload an image, admin approves it.
19. [ ] Fulfil a paid order via **Reloadly sandbox** — a code is delivered.
20. [ ] You receive the relevant order emails (or they show as sent/simulated in admin).
21. [ ] The delivered order appears in your account, with the code on the secure delivery page (not in the email).

## Support & feedback
22. [ ] Submit a support request; it appears in admin.
23. [ ] Submit feedback via "Votre avis"; it appears in admin.

## Admin
24. [ ] Find your test customer in admin — orders, payments, wallet ledger all look right.
25. [ ] Review the wallet ledger entries (grants, locks, refunds).

## Mobile & environment
26. [ ] Repeat steps 4–12 on a narrow phone screen — nothing is cut off or unreachable.
27. [ ] Confirm the **staging banner** is visible and that no real customer received a staging email.

---

**If anything charges real money, emails a real customer, or the staging banner
is missing — stop and report it.** Those are launch blockers.
