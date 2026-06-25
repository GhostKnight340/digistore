-- Karta dev seed — run in Supabase SQL editor
-- Safe to run multiple times (ON CONFLICT DO UPDATE)

-- ── 1. Parent products ────────────────────────────────────────────────────────

INSERT INTO "ParentProduct" (slug, name, category, brand, region, "deliveryType", description, "shortDescription", "longDescription", instructions, active)
VALUES
  (
    'steam-wallet', 'Steam Wallet', 'steam', 'Valve', 'Maroc / Global',
    'Code numérique instantané',
    'Rechargez votre portefeuille Steam pour acheter jeux, DLC et contenus en jeu.',
    'Rechargez votre Steam Wallet et accédez à des milliers de jeux.',
    'Avec une carte Steam Wallet, rechargez votre compte Steam et accédez à des milliers de jeux, DLC, extensions et contenus en jeu. Compatible avec tous les comptes Steam actifs. Les fonds sont crédités immédiatement et n''expirent pas.',
    E'1. Ouvrez Steam et connectez-vous à votre compte.\n2. Cliquez sur votre nom en haut à droite, puis sur "Utiliser un code produit Steam".\n3. Saisissez votre code et cliquez sur "Continuer".\n4. Les fonds seront ajoutés immédiatement à votre portefeuille Steam.',
    true
  ),
  (
    'playstation-store', 'PlayStation Store', 'playstation', 'Sony', 'Maroc',
    'Code numérique instantané',
    'Rechargez votre portefeuille PlayStation Store pour acheter jeux, extensions et abonnements.',
    'Rechargez votre PSN pour jeux, extensions et PS Plus.',
    'Carte PlayStation Store valable pour acheter des jeux PS4/PS5, du contenu additionnel, des abonnements PS Plus et des films. Région Maroc — utilisez-la uniquement avec un compte PSN créé au Maroc.',
    E'1. Connectez-vous au PlayStation Store depuis votre console ou navigateur.\n2. Accédez à "Ajouter des fonds" dans votre portefeuille PSN.\n3. Sélectionnez "Utiliser un code de téléchargement PSN".\n4. Saisissez le code à 12 chiffres et confirmez l''ajout.',
    true
  ),
  (
    'xbox-gift-card', 'Xbox Gift Card', 'xbox', 'Microsoft', 'Maroc / Global',
    'Code numérique instantané',
    'Utilisez cette carte sur Microsoft Store et Xbox pour acheter jeux, applications et divertissement.',
    'Créditez votre compte Xbox et Microsoft Store.',
    'Carte Xbox Gift Card valable sur le Microsoft Store, Xbox Game Pass, et pour l''achat de jeux et contenus Xbox. Fonctionne sur Xbox Series X/S, Xbox One et PC Windows.',
    E'1. Connectez-vous à votre compte Microsoft sur xbox.com ou votre console.\n2. Accédez à "Utiliser un code" dans le Microsoft Store.\n3. Saisissez le code à 25 caractères et validez.\n4. Le montant sera immédiatement crédité sur votre compte Microsoft.',
    true
  ),
  (
    'nintendo-eshop', 'Nintendo eShop', 'nintendo', 'Nintendo', 'Maroc / EU',
    'Code numérique instantané',
    'Ajoutez des fonds à votre compte Nintendo pour acheter jeux Switch et contenus depuis le Nintendo eShop.',
    'Fonds pour vos achats sur le Nintendo eShop.',
    'Carte Nintendo eShop utilisable pour acheter des jeux Nintendo Switch, des DLC, des applications et du contenu additionnel. Fonds disponibles immédiatement sur votre compte Nintendo.',
    E'1. Depuis votre Nintendo Switch, ouvrez le Nintendo eShop.\n2. Sélectionnez votre compte et accédez à "Saisir un code de téléchargement".\n3. Entrez le code à 16 chiffres et confirmez.\n4. Les fonds sont instantanément disponibles dans l''eShop.',
    true
  ),
  (
    'roblox', 'Roblox Gift Card', 'roblox', 'Roblox Corporation', 'Global',
    'Code numérique instantané',
    'Échangez cette carte contre des Robux ou un abonnement Premium sur Roblox.',
    'Obtenez des Robux ou Premium sur Roblox.',
    'Carte Roblox à échanger contre des Robux ou des jours d''abonnement Roblox Premium. Les Robux vous permettent d''acheter des accessoires, avatars, passes de jeu et objets exclusifs dans l''univers Roblox.',
    E'1. Rendez-vous sur roblox.com/upgrades/redeem.\n2. Connectez-vous à votre compte Roblox.\n3. Saisissez le code de la carte-cadeau et cliquez sur "Redeem".\n4. Vos Robux ou jours Premium seront ajoutés instantanément à votre compte.',
    true
  ),
  (
    'valorant-points', 'Valorant Points', 'valorant', 'Riot Games', 'MENA',
    'Code numérique instantané',
    'Échangez des Valorant Points pour skins, passes de combat et agents.',
    'Achetez des VP pour skins et passes de combat Valorant.',
    'Carte Valorant Points pour la région MENA. Utilisez vos VP pour acheter des skins d''armes, des passes de combat, des cartes de visite et des agents dans Valorant. Les VP sont crédités instantanément sur votre compte Riot Games.',
    E'1. Connectez-vous sur playvalorant.com ou ouvrez le client Valorant.\n2. Accédez au Store, puis à "Acheter des VP".\n3. Sélectionnez "Utiliser un code prépayé Riot".\n4. Saisissez votre code et confirmez pour recevoir vos VP.',
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  category         = EXCLUDED.category,
  brand            = EXCLUDED.brand,
  region           = EXCLUDED.region,
  "deliveryType"   = EXCLUDED."deliveryType",
  description      = EXCLUDED.description,
  "shortDescription" = EXCLUDED."shortDescription",
  "longDescription"  = EXCLUDED."longDescription",
  instructions     = EXCLUDED.instructions,
  active           = EXCLUDED.active,
  "updatedAt"      = NOW();

-- ── 2. Variants (Product rows) ────────────────────────────────────────────────

INSERT INTO "Product" (slug, name, "parentSlug", category, "priceMad", "faceValue", "faceCurrency", region, "deliveryType", active, featured, "stockControl")
VALUES
  -- Steam Wallet
  ('steam-50',  'Steam Wallet 5 EUR',  'steam-wallet', 'steam', 60,  5,   'EUR', 'Maroc / Global', 'Code numérique instantané', true, true,  'manual'),
  ('steam-100', 'Steam Wallet 10 EUR', 'steam-wallet', 'steam', 120, 10,  'EUR', 'Maroc / Global', 'Code numérique instantané', true, true,  'manual'),
  ('steam-200', 'Steam Wallet 20 EUR', 'steam-wallet', 'steam', 240, 20,  'EUR', 'Maroc / Global', 'Code numérique instantané', true, false, 'manual'),

  -- PlayStation Store
  ('psn-100', 'PlayStation Store 100 MAD', 'playstation-store', 'playstation', 100, 100, 'MAD', 'Maroc', 'Code numérique instantané', true, true,  'manual'),
  ('psn-250', 'PlayStation Store 250 MAD', 'playstation-store', 'playstation', 250, 250, 'MAD', 'Maroc', 'Code numérique instantané', true, false, 'manual'),

  -- Xbox
  ('xbox-100', 'Xbox Gift Card 100 MAD', 'xbox-gift-card', 'xbox', 100, 100, 'MAD', 'Maroc / Global', 'Code numérique instantané', true, true,  'manual'),
  ('xbox-200', 'Xbox Gift Card 200 MAD', 'xbox-gift-card', 'xbox', 200, 200, 'MAD', 'Maroc / Global', 'Code numérique instantané', true, false, 'manual'),

  -- Nintendo
  ('nintendo-150', 'Nintendo eShop 150 MAD', 'nintendo-eshop', 'nintendo', 150, 150, 'MAD', 'Maroc / EU', 'Code numérique instantané', true, false, 'manual'),

  -- Roblox
  ('roblox-100', 'Roblox Gift Card 100 MAD', 'roblox', 'roblox', 100, 100, 'MAD', 'Global', 'Code numérique instantané', true, true,  'manual'),
  ('roblox-200', 'Roblox Gift Card 200 MAD', 'roblox', 'roblox', 200, 200, 'MAD', 'Global', 'Code numérique instantané', true, false, 'manual'),

  -- Valorant
  ('valorant-100', 'Valorant Points 100 MAD', 'valorant-points', 'valorant', 100, 100, 'MAD', 'MENA', 'Code numérique instantané', true, true,  'manual'),
  ('valorant-200', 'Valorant Points 200 MAD', 'valorant-points', 'valorant', 200, 200, 'MAD', 'MENA', 'Code numérique instantané', true, false, 'manual')
ON CONFLICT (slug) DO UPDATE SET
  name           = EXCLUDED.name,
  "parentSlug"   = EXCLUDED."parentSlug",
  category       = EXCLUDED.category,
  "priceMad"     = EXCLUDED."priceMad",
  "faceValue"    = EXCLUDED."faceValue",
  "faceCurrency" = EXCLUDED."faceCurrency",
  region         = EXCLUDED.region,
  "deliveryType" = EXCLUDED."deliveryType",
  active         = EXCLUDED.active,
  featured       = EXCLUDED.featured,
  "updatedAt"    = NOW();

-- ── 3. Sample digital codes ───────────────────────────────────────────────────

INSERT INTO "DigitalCode" ("productId", code, status)
SELECT p.id, c.code, 'unused'
FROM (VALUES
  ('steam-50',      'STEAM-TEST-50-001'),
  ('steam-50',      'STEAM-TEST-50-002'),
  ('steam-100',     'STEAM-TEST-100-001'),
  ('steam-100',     'STEAM-TEST-100-002'),
  ('steam-100',     'STEAM-TEST-100-003'),
  ('steam-200',     'STEAM-TEST-200-001'),
  ('steam-200',     'STEAM-TEST-200-002'),
  ('psn-100',       'PSN-TEST-100-001'),
  ('psn-100',       'PSN-TEST-100-002'),
  ('psn-250',       'PSN-TEST-250-001'),
  ('xbox-100',      'XBOX-TEST-100-001'),
  ('xbox-100',      'XBOX-TEST-100-002'),
  ('xbox-200',      'XBOX-TEST-200-001'),
  ('nintendo-150',  'NINTENDO-TEST-150-001'),
  ('roblox-100',    'ROBLOX-TEST-100-001'),
  ('roblox-100',    'ROBLOX-TEST-100-002'),
  ('roblox-200',    'ROBLOX-TEST-200-001'),
  ('valorant-100',  'VALORANT-TEST-100-001'),
  ('valorant-100',  'VALORANT-TEST-100-002'),
  ('valorant-200',  'VALORANT-TEST-200-001')
) AS c(slug, code)
JOIN "Product" p ON p.slug = c.slug
ON CONFLICT ("productId", code) DO NOTHING;
