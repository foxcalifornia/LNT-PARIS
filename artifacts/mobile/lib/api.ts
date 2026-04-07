const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (() => {
  throw new Error("EXPO_PUBLIC_API_URL environment variable is required");
})();

export { BASE_URL };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}/api${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur réseau" }));
    throw new Error(error.error ?? "Erreur inconnue");
  }

  return response.json();
}

export type Session = {
  id: number;
  date: string;
  heure: string;
  localisation: string | null;
  typePaiement: string | null;
  heureFermeture: string | null;
  fondCaisseOuverture: number | null;
  fondCaisseFermeture: number | null;
  commentaireFermeture: string | null;
  createdAt: string;
};

export type Collection = {
  id: number;
  nom: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export type Produit = {
  id: number;
  collectionId: number;
  couleur: string;
  quantite: number;
  stockReserve: number;
  prixCentimes: number;
  stockMinimum: number;
  imageUrl: string | null;
  createdAt: string;
};

export type CollectionWithProduits = Collection & {
  produits: Produit[];
};

export type Vente = {
  id: number;
  produitId: number;
  quantiteVendue: number;
  typePaiement: string;
  montantCentimes: number;
  remiseCentimes: number;
  remiseType: string | null;
  commentaire: string | null;
  groupKey: string | null;
  createdAt: string;
};

export type LigneVente = {
  collection: string;
  couleur: string;
  quantite: number;
  montantCentimes: number;
  prixUnitaireCentimes: number;
  typePaiement: string;
};

export type JourReport = {
  date: string;
  totalCentimes: number;
  totalArticles: number;
  cashCentimes: number;
  carteCentimes: number;
  articlesParJour: LigneVente[];
};

export type WeekdayProduit = {
  collection: string;
  couleur: string;
  quantite: number;
};

export type WeekdayReport = {
  dayIndex: number;
  dayName: string;
  topProduits: WeekdayProduit[];
};

export type HebdoReport = {
  weekKey: string;
  label: string;
  totalCentimes: number;
  cashCentimes: number;
  carteCentimes: number;
  articles: number;
};

export type MensuelReport = {
  monthKey: string;
  label: string;
  totalCentimes: number;
  cashCentimes: number;
  carteCentimes: number;
  articles: number;
  evolution: number | null;
};

export type TopProduit = {
  produitId: number;
  collection: string;
  couleur: string;
  quantite: number;
  montantCentimes: number;
};

export type VenteTransaction = {
  heure: string;
  typePaiement: "CASH" | "CARTE";
  montantCentimes: number;
  sumupTransactionId?: string | null;
  refunded?: boolean;
  cancelled?: boolean;
  cancelledAt?: string | null;
  saleReference?: string | null;
  groupKey: string;
  firstVenteId: number;
  venteIds: number[];
  articles: {
    produitId: number;
    couleur: string;
    collectionNom: string;
    quantiteVendue: number;
    montantCentimes: number;
  }[];
};

export type VentesJour = {
  transactions: VenteTransaction[];
  totalCash: number;
  totalCarte: number;
  total: number;
};

export type Consommable = {
  id: number;
  nom: string;
  quantite: number;
  stockMinimum: number;
  createdAt: string;
};

export type Boite = {
  id: number;
  nom: string;
  quantite: number;
  createdAt: string;
};

export type MouvementStock = {
  id: number;
  produitId: number;
  typeMouvement: "vente" | "reappro" | "annulation" | "transfert" | "ajustement";
  quantite: number;
  stockBoutiqueAvant: number;
  stockBoutiqueApres: number;
  stockReserveAvant: number;
  stockReserveApres: number;
  commentaire: string | null;
  createdAt: string;
  couleur: string;
  collectionNom: string;
};

export type VenteOpts = {
  remiseCentimes?: number;
  remiseType?: string;
  commentaire?: string;
  groupKey?: string;
  montantCashCentimes?: number;
};

export function formatPrix(centimes: number): string {
  return `€${(centimes / 100).toFixed(2).replace(".", ",")}`;
}

export function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export const api = {
  caisse: {
    getSessions: () => request<Session[]>("/caisse/sessions"),
    createSession: (data: { date: string; heure: string; localisation?: string | null; typePaiement?: string | null }) =>
      request<Session>("/caisse/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    fermerSession: (id: number, data: { fondCaisseFermeture?: number; commentaireFermeture?: string; heureFermeture?: string }) =>
      request<Session>(`/caisse/sessions/${id}/fermeture`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getVentesJour: () => request<VentesJour>("/caisse/today"),
    cancelLastVente: () =>
      request<{ cancelled: number; message: string; refund?: { success: boolean; refundId?: string; error?: string } | null }>("/caisse/ventes/last", { method: "DELETE" }),
    cancelVente: (venteId: number) =>
      request<{ cancelled: number; message: string; refund?: { success: boolean; refundId?: string; error?: string; noRefundNeeded?: boolean } | null }>("/caisse/ventes/cancel", {
        method: "POST",
        body: JSON.stringify({ venteId }),
      }),
  },
  inventory: {
    getCollections: () => request<CollectionWithProduits[]>("/collections"),
    createCollection: (data: { nom: string; description?: string | null }) =>
      request<Collection>("/collections", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateCollection: (id: number, data: { imageUrl?: string | null }) =>
      request<Collection>(`/collections/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteCollection: (id: number) =>
      request<{ message: string }>(`/collections/${id}`, { method: "DELETE" }),
    createProduit: (data: { collectionId: number; couleur: string; quantite: number; prixCentimes: number }) =>
      request<Produit>("/produits", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateProduit: (id: number, data: { quantite?: number; couleur?: string; prixCentimes?: number; stockMinimum?: number; stockReserve?: number; imageUrl?: string | null }) =>
      request<Produit>(`/produits/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteProduit: (id: number) =>
      request<{ message: string }>(`/produits/${id}`, { method: "DELETE" }),
    reapprovisionnement: (id: number, quantite: number) =>
      request<Produit>(`/produits/${id}/reappro`, {
        method: "POST",
        body: JSON.stringify({ quantite }),
      }),
    ajusterBoutique: (id: number, nouvelleQuantite: number) =>
      request<Produit>(`/produits/${id}/ajuster-boutique`, {
        method: "PUT",
        body: JSON.stringify({ nouvelleQuantite }),
      }),
    ajusterReserve: (id: number, nouvelleQuantite: number) =>
      request<Produit>(`/produits/${id}/ajuster-reserve`, {
        method: "PUT",
        body: JSON.stringify({ nouvelleQuantite }),
      }),
    transfertStock: (id: number, data: { quantite: number; direction: "boutique_to_reserve" | "reserve_to_boutique"; commentaire?: string }) =>
      request<Produit>(`/produits/${id}/transfert`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    createVente: (data: { produitId: number; quantiteVendue: number; typePaiement: string }) =>
      request<Vente>("/ventes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    batchVente: (data: { items: { produitId: number; quantite: number }[]; typePaiement: "CASH" } & VenteOpts) =>
      request<{ message: string; totalArticles: number }>("/ventes/batch", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    batchVenteMixte: (data: { items: { produitId: number; quantite: number }[]; montantCashCentimes: number } & VenteOpts) =>
      request<{ message: string; totalArticles: number; montantCashCentimes: number; montantCarteCentimes: number }>("/ventes/batch-mixte", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getConsommables: () => request<Consommable[]>("/consommables"),
    updateConsommable: (id: number, data: { quantite?: number; stockMinimum?: number }) =>
      request<Consommable>(`/consommables/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getBoites: () => request<Boite[]>("/boites"),
    createBoite: (nom: string) =>
      request<Boite>("/boites", {
        method: "POST",
        body: JSON.stringify({ nom }),
      }),
    updateBoite: (id: number, data: { quantite?: number; nom?: string }) =>
      request<Boite>(`/boites/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteBoite: (id: number) =>
      request<{ message: string }>(`/boites/${id}`, { method: "DELETE" }),
    getMouvements: (params?: { produitId?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.produitId) qs.set("produitId", String(params.produitId));
      if (params?.limit) qs.set("limit", String(params.limit));
      const q = qs.toString();
      return request<MouvementStock[]>(`/stock/mouvements${q ? `?${q}` : ""}`);
    },
  },
  reporting: {
    getDaily: () => request<JourReport[]>("/reporting/daily"),
    getByWeekday: (days?: number) =>
      request<WeekdayReport[]>(`/reporting/by-weekday${days ? `?days=${days}` : ""}`),
    getHebdo: (weeks?: number) =>
      request<HebdoReport[]>(`/reporting/hebdo${weeks ? `?weeks=${weeks}` : ""}`),
    getMensuel: (months?: number) =>
      request<MensuelReport[]>(`/reporting/mensuel${months ? `?months=${months}` : ""}`),
    getTopProduits: (days?: number) =>
      request<TopProduit[]>(`/reporting/top-produits${days ? `?days=${days}` : ""}`),
  },
  payments: {
    create: (data: {
      montantCentimes: number;
      description?: string;
      items: { produitId: number; quantite: number }[];
    }) =>
      request<{ saleReference: string; checkoutId: string; readerEnvoyé: boolean }>(
        "/payments/create",
        { method: "POST", body: JSON.stringify(data) }
      ),
    getStatus: (saleReference: string) =>
      request<{ status: "PENDING" | "PAID" | "FAILED" | "CANCELLED"; saleReference: string }>(
        `/payments/status/${encodeURIComponent(saleReference)}`,
        { cache: "no-store" }
      ),
    confirm: (data: {
      saleReference: string;
      items: { produitId: number; quantite: number }[];
      forceConfirm?: boolean;
    } & VenteOpts) =>
      request<{ message: string; saleReference: string }>(
        "/payments/confirm",
        { method: "POST", body: JSON.stringify(data) }
      ),
    cancel: (saleReference: string) =>
      request<{ message: string; saleReference: string }>(
        "/payments/cancel",
        { method: "POST", body: JSON.stringify({ saleReference }) }
      ),
  },

  auth: {
    login: (role: "admin" | "vendeur", password: string) =>
      request<{ success: boolean; role: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ role, password }),
      }),
  },

  settings: {
    get: () => request<Record<string, string>>(`/settings?_t=${Date.now()}`),
    update: (updates: Record<string, string>) =>
      request<{ success: boolean }>("/settings", {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
    updatePassword: (data: { role: "admin" | "vendeur"; newPassword: string; confirmPassword: string }) =>
      request<{ success: boolean }>("/settings/password", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};
