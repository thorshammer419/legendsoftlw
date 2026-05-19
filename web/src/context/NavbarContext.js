import { createContext, useContext, useState } from 'react';

const NavbarContext = createContext(null);

export function NavbarProvider({ children }) {
  const [centerContent, setCenterContent] = useState(null);
  const [pendingRerollRequest, setPendingRerollRequest] = useState(null);
  const [backOverride, setBackOverride] = useState(null);
  return (
    <NavbarContext.Provider value={{ centerContent, setCenterContent, pendingRerollRequest, setPendingRerollRequest, backOverride, setBackOverride }}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbar() {
  return useContext(NavbarContext);
}
