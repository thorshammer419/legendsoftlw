import { createContext, useContext, useState } from 'react';

const NavbarContext = createContext(null);

export function NavbarProvider({ children }) {
  const [centerContent, setCenterContent] = useState(null);
  const [pendingRerollRequest, setPendingRerollRequest] = useState(null);
  return (
    <NavbarContext.Provider value={{ centerContent, setCenterContent, pendingRerollRequest, setPendingRerollRequest }}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbar() {
  return useContext(NavbarContext);
}
