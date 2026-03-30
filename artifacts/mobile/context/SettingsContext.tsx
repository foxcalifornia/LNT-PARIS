import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

type AppSettings = {
  promoEnabled: boolean;
  cardPaymentEnabled: boolean;
  openHour: number;
  closeHour: number;
  sumupReaderId: string | null;
  loaded: boolean;
};

type SettingsContextType = AppSettings & {
  refetch: () => Promise<void>;
};

const DEFAULT: AppSettings = {
  promoEnabled: true,
  cardPaymentEnabled: true,
  openHour: 10,
  closeHour: 20,
  sumupReaderId: null,
  loaded: false,
};

const SettingsContext = createContext<SettingsContextType>({
  ...DEFAULT,
  refetch: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT);

  const refetch = useCallback(async () => {
    try {
      const data = await api.settings.get();
      setSettings({
        promoEnabled: data.promo_2plus1_enabled !== "false",
        cardPaymentEnabled: data.card_payment_enabled !== "false",
        openHour: parseInt(data.caisse_open_hour ?? "10", 10) || 10,
        closeHour: parseInt(data.caisse_close_hour ?? "20", 10) || 20,
        sumupReaderId: data.sumup_reader_id ?? null,
        loaded: true,
      });
    } catch {
      setSettings((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <SettingsContext.Provider value={{ ...settings, refetch }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
