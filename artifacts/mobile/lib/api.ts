const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

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
  createdAt: string;
};

export type Collection = {
  id: number;
  nom: string;
  description: string | null;
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

export type VenteTransaction = {
  heure: string;
  typePaiement: "CASH" | "CARTE";
  montantCentimes: number;
  articles: {
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

export type MouvementStock = {
  id: number;
  typeMouvement: "vente" | "reappro" | "annulation";
  quantite: number;
  stockBoutiqueAvant: number;
  stockBoutiqueApres: number;
  stockReserveAvant: number;
  stockReserveApres: number;
  createdAt: string;
  couleur: string;
  collectionNom: string;
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
    getVentesJour: () => request<VentesJour>("/caisse/today"),
    cancelLastVente: () =>
      request<{ cancelled: number; message: string }>("/caisse/ventes/last", { method: "DELETE" }),
  },
  inventory: {
    getCollections: () => request<CollectionWithProduits[]>("/collections"),
    createCollection: (data: { nom: string; description?: string | null }) =>
      request<Collection>("/collections", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deleteCollection: (id: number) =>
      request<{ message: string }>(`/collections/${id}`, { method: "DELETE" }),
    createProduit: (data: { collectionId: number; couleur: string; quantite: number; prixCentimes: number }) =>
      request<Produit>("/produits", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateProduit: (id: number, data: { quantite?: number; couleur?: string; prixCentimes?: number; stockMinimum?: number; stockReserve?: number }) =>
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
    createVente: (data: { produitId: number; quantiteVendue: number; typePaiement: string }) =>
      request<Vente>("/ventes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    batchVente: (data: { items: { produitId: number; quantite: number }[]; typePaiement: "CASH" }) =>
      request<{ message: string; totalArticles: number }>("/ventes/batch", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getConsommables: () => request<Consommable[]>("/consommables"),
    updateConsommable: (id: number, data: { quantite?: number; stockMinimum?: number }) =>
      request<Consommable>(`/consommables/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getMouvements: () => request<MouvementStock[]>("/mouvements"),
  },
  reporting: {
    getDaily: () => request<JourReport[]>("/reporting/daily"),
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
        `/payments/status/${encodeURIComponent(saleReference)}`
      ),
    confirm: (data: {
      saleReference: string;
      items: { produitId: number; quantite: number }[];
    }) =>
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
};
