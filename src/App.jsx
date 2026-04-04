import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import LoadingScreen from "./components/ui/LoadingScreen";
import { useAuth } from "./contexts/AuthContext";
import { useFactory } from "./contexts/FactoryContext";

const BeamsPage = lazy(() => import("./pages/BeamsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const FactoriesPage = lazy(() => import("./pages/FactoriesPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ProductionPage = lazy(() => import("./pages/ProductionPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const WorkersPage = lazy(() => import("./pages/WorkersPage"));

function PageLoader() {
  return <LoadingScreen label="Loading page..." />;
}

function renderPage(PageComponent) {
  return (
    <Suspense fallback={<PageLoader />}>
      <PageComponent />
    </Suspense>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen label="Loading LoomTrack..." />;
  }

  return user ? <Outlet /> : <Navigate to="/" replace />;
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  const { factoryId } = useFactory();

  if (loading) {
    return <LoadingScreen label="Loading LoomTrack..." />;
  }

  if (user) {
    return <Navigate to={factoryId ? "/dashboard" : "/factories"} replace />;
  }

  return children;
}

function FactoryRoute() {
  const { factoryId } = useFactory();

  return factoryId ? <Outlet /> : <Navigate to="/factories" replace />;
}

function AppRedirect() {
  const { user, loading } = useAuth();
  const { factoryId } = useFactory();

  if (loading) {
    return <LoadingScreen label="Loading LoomTrack..." />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={factoryId ? "/dashboard" : "/factories"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            {renderPage(LoginPage)}
          </PublicOnlyRoute>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route path="/factories" element={renderPage(FactoriesPage)} />

        <Route element={<FactoryRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={renderPage(DashboardPage)} />
            <Route path="/workers" element={renderPage(WorkersPage)} />
            <Route path="/beams" element={renderPage(BeamsPage)} />
            <Route path="/production" element={renderPage(ProductionPage)} />
            <Route path="/reports" element={renderPage(ReportsPage)} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<AppRedirect />} />
    </Routes>
  );
}
