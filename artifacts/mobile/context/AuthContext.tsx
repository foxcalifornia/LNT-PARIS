import React, { createContext, useContext, useState } from "react";
import { api } from "@/lib/api";

export type Role = "admin" | "vendeur";

type AuthContextType = {
  role: Role | null;
  standId: number | null;
  standName: string | null;
  standSumupTerminalId: string | null;
  login: (role: Role, password: string) => Promise<boolean>;
  loginStand: (standId: number, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasStand: boolean;
};

const AuthContext = createContext<AuthContextType>({
  role: null,
  standId: null,
  standName: null,
  standSumupTerminalId: null,
  login: async () => false,
  loginStand: async () => false,
  logout: () => {},
  isAuthenticated: false,
  isAdmin: false,
  hasStand: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [standId, setStandId] = useState<number | null>(null);
  const [standName, setStandName] = useState<string | null>(null);
  const [standSumupTerminalId, setStandSumupTerminalId] = useState<string | null>(null);

  const login = async (selectedRole: Role, password: string): Promise<boolean> => {
    try {
      await api.auth.login(selectedRole, password);
      setRole(selectedRole);
      setStandId(null);
      setStandName(null);
      setStandSumupTerminalId(null);
      return true;
    } catch {
      return false;
    }
  };

  const loginStand = async (sid: number, password: string): Promise<boolean> => {
    try {
      const res = await api.stands.login(sid, password);
      if (res.success) {
        setRole("vendeur");
        setStandId(res.stand.id);
        setStandName(res.stand.name);
        setStandSumupTerminalId(res.stand.sumupTerminalId ?? null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setRole(null);
    setStandId(null);
    setStandName(null);
    setStandSumupTerminalId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        role,
        standId,
        standName,
        standSumupTerminalId,
        login,
        loginStand,
        logout,
        isAuthenticated: role !== null,
        isAdmin: role === "admin",
        hasStand: standId !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
