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
  typePaiement: string;
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
  prixCentimes: number;
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

export function formatPrix(centimes: number): string {
  return `€${(centimes / 100).toFixed(2).replace(".", ",")}`;
}

export const api = {
  caisse: {
    getSessions: () => request<Session[]>("/caisse/sessions"),
    createSession: (data: { date: string; heure: string; localisation?: string | null; typePaiement: string }) =>
      request<Session>("/caisse/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
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
    updateProduit: (id: number, data: { quantite?: number; couleur?: string; prixCentimes?: number }) =>
      request<Produit>(`/produits/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteProduit: (id: number) =>
      request<{ message: string }>(`/produits/${id}`, { method: "DELETE" }),
    createVente: (data: { produitId: number; quantiteVendue: number; typePaiement: string }) =>
      request<Vente>("/ventes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
