import { Outlet } from "react-router-dom";
import { useFactory } from "../../contexts/FactoryContext";
import Navbar from "./Navbar";

export default function AppLayout() {
  const { factoryName } = useFactory();

  return (
    <div className="app-shell">
      <Navbar factoryName={factoryName} />
      <div className="app-shell__content">
        <main className="app-shell__main">
          <div className="page-stack">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
