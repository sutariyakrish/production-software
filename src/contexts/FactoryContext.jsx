import { createContext, useContext, useState } from "react";

const FactoryContext = createContext(null);

function getStoredFactory() {
  return {
    id: sessionStorage.getItem("factoryId") || "",
    name: sessionStorage.getItem("factoryName") || "",
  };
}

export function FactoryProvider({ children }) {
  const [factory, setFactory] = useState(getStoredFactory);

  function selectFactory(nextFactory) {
    const normalizedFactory = {
      id: nextFactory?.id || "",
      name: nextFactory?.name || "",
    };

    setFactory(normalizedFactory);

    if (normalizedFactory.id) {
      sessionStorage.setItem("factoryId", normalizedFactory.id);
      sessionStorage.setItem("factoryName", normalizedFactory.name);
      return;
    }

    sessionStorage.removeItem("factoryId");
    sessionStorage.removeItem("factoryName");
  }

  function clearFactorySelection() {
    selectFactory(null);
  }

  return (
    <FactoryContext.Provider
      value={{
        factoryId: factory.id,
        factoryName: factory.name,
        selectFactory,
        clearFactorySelection,
      }}
    >
      {children}
    </FactoryContext.Provider>
  );
}

export function useFactory() {
  const context = useContext(FactoryContext);

  if (!context) {
    throw new Error("useFactory must be used inside FactoryProvider");
  }

  return context;
}
