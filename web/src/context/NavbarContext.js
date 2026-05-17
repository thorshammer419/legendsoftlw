import { createContext, useContext, useState } from 'react';

const NavbarContext = createContext(null);

export function NavbarProvider({ children }) {
  const [centerContent, setCenterContent] = useState(null);
  return (
    <NavbarContext.Provider value={{ centerContent, setCenterContent }}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbar() {
  return useContext(NavbarContext);
}
