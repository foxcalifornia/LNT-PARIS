# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Application de gestion de stock pour LNT Paris (magasin de lunettes).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native) with Expo Router

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (caisse, inventory, ventes)
│   └── mobile/             # Expo React Native app (LNT Paris)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## App Features (LNT Paris - Gestion de Stock)

### Double Inventaire Boutique / Réserve
- **DB** : champ `stock_reserve` ajouté à la table `produits` + nouvelle table `mouvements_stock` (traçabilité complète)
- **Ventes** : décrément uniquement du stock boutique (`quantite`) — la réserve n'est pas touchée
- **Réapprovisionnement** : `POST /api/produits/:id/reappro` — transfert réserve → boutique avec enregistrement mouvement
- **Historique** : `GET /api/mouvements` — liste des mouvements (vente, reappro, annulation) avec avant/après pour les deux stocks
- **Interface inventaire** :
  - Stats header : Collections / Boutique total / Réserve total
  - 3 onglets : Stock (édition inline B/R/Min), Alertes (vue manque avec bouton reappro direct), Historique
  - Sur chaque produit : pillules **B** (boutique) et **R** (réserve) cliquables pour édition, icône ⬆ reappro, icône cible min
  - Modal `ReapproModal` : sélecteur quantité, aperçu avant/après, validation stock réserve max

### Système d'Authentification
- Écran de connexion au lancement avec choix de profil : **Admin** (mot de passe `1234`) ou **Vendeur** (mot de passe `5678`)
- Contexte global `AuthContext` (no persistence — login requis à chaque lancement)
- Badge de rôle affiché dans le menu principal + bouton "Se déconnecter"
- **Admin** : accès complet (Caisse, Inventaire, Rapports), bypass de la restriction horaire en mode consultation
- **Vendeur** : accès uniquement à la Caisse, routes Inventaire/Reporting protégées
- Protection côté composant : `useEffect` → `router.back()` si rôle insuffisant

### Caisse — Modes selon rôle
- **Vendeur** : logique inchangée (blocage hors 10h-20h, ouverture obligatoire)
- **Admin hors horaires** : état `admin_view` (consultation uniquement — ventes du jour, stock, pas de vente)
- **Admin en horaires** : peut ouvrir la caisse normalement

### Caisse
- Choix du mode de paiement : Cash ou Carte Bancaire (SumUp Terminal)
- Enregistrement des sessions avec date, heure et localisation GPS
- Affichage du stock en temps réel
- Enregistrement rapide des ventes (- 1 paire) ou via modal

### SumUp Terminal Payments
- OAuth 2.0 client_credentials (SUMUP_CLIENT_ID, SUMUP_CLIENT_SECRET dans env vars)
- Credentials: Application "LNT" id CCCYRSG47
- DB tables: sumup_checkouts, payment_logs (traçabilité complète)
- Routes: POST /api/payments/create, GET /api/payments/status/:ref, POST /api/payments/confirm, POST /api/payments/cancel
- SUMUP_READER_ID (env var, vide par défaut) → à configurer avec le serial du terminal physique
- Polling frontend toutes les 3s, timeout 3 minutes

### Inventaire
- Gestion des collections (Santorini, Riviera, etc.)
- Gestion des produits par couleur dans chaque collection
- Modification des quantités
- Suppression de collections et produits
- Statistiques (total collections, produits, paires)

### Gestion du Stock
- Soustraction automatique lors de chaque vente
- Indicateurs visuels : vert (OK), orange (stock bas ≤2), rouge (vide)

## Database Schema

- `sessions_caisse` — sessions d'ouverture de caisse (date, heure, localisation, type_paiement)
- `collections` — collections de lunettes (nom, description)
- `produits` — produits par collection (couleur, quantite)
- `ventes` — historique des ventes (produit_id, quantite_vendue, type_paiement)

## API Endpoints

- `GET/POST /api/caisse/sessions` — sessions de caisse
- `GET/POST /api/collections` — collections d'inventaire
- `DELETE /api/collections/:id` — supprimer une collection
- `POST /api/produits` — ajouter un produit
- `PUT /api/produits/:id` — modifier quantité/couleur
- `DELETE /api/produits/:id` — supprimer un produit
- `POST /api/ventes` — enregistrer une vente (soustrait le stock)

## Production Architecture (lntparis.replit.app)

### Routing en production
Tout le trafic externe (`lntparis.replit.app`) passe par `serve.js` (port 18115) qui est un **TCP forwarder** vers Express (port 8080).

```
Client → Replit CDN → serve.js:18115 (TCP forwarder) → Express:8080
```

Express (port 8080) gère **tout** :
- Routes API `/api/*`
- OAuth SumUp : `/auth/sumup`, `/callback`, `/api/auth/sumup`, `/api/callback`
- Landing page Expo Go (`/` sans header expo-platform)
- Manifests Expo Go (`/` ou `/manifest` avec header `expo-platform: ios/android`)
- Fichiers statiques du build mobile (`/[timestamp]/_expo/static/js/...`)

### Rebuild du build mobile pour la production
```bash
# Depuis la racine du workspace
cd artifacts/mobile && REPLIT_INTERNAL_APP_DOMAIN=lntparis.replit.app node scripts/build.js
```

### Rebuild du dist Express
```bash
cd artifacts/api-server && node build.mjs
```

## Settings & Context

- **SettingsContext** (`artifacts/mobile/context/SettingsContext.tsx`): Provides `promoEnabled`, `cardPaymentEnabled`, `openHour`, `closeHour`, `sumupReaderId`. Loaded from API at app start, call `refetch()` after saving.
- **Promo gating**: `VenteModal` computes promo only when `promoEnabled=true`; falls back to zero discount.
- **Carte gating**: Carte SumUp button hidden/disabled when `cardPaymentEnabled=false`.
- **Parametres** (`artifacts/mobile/app/parametres/`): Stack layout with sub-screen `acces.tsx` for password management. Reader ID field added to Paiements section. Settings save calls `settingsCtx.refetch()`.
- **Reporting punctuality**: `parsePunctuality` now accepts `openHour` from settings instead of hardcoded `10`.
- **Inventaire price editing**: Product bottom sheet includes "Modifier le prix" expandable row via `prixMutation`.

## Password

Le mot de passe pour accéder à la caisse et à l'inventaire est : **1234** (Admin), **5678** (Vendeur)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with routes for caisse, inventory, and ventes.

### `artifacts/mobile` (`@workspace/mobile`)

Expo React Native app for LNT Paris stock management.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec and Orval codegen config.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.
