import React, { createContext, useContext, useState } from "react";
import { api } from "@/lib/api";

export type Role = "admin" | "vendeur";

type AuthContextType = {
  role: Role | null;
  login: (role: Role, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType>({
  role: null,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);

  const login = async (selectedRole: Role, password: string): Promise<boolean> => {
    try {
      await api.auth.login(selectedRole, password);
      setRole(selectedRole);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        role,
        login,
        logout,
        isAuthenticated: role !== null,
        isAdmin: role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
