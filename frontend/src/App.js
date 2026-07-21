import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AcceptInvite from "@/pages/AcceptInvite";
import AdminDashboard from "@/pages/AdminDashboard";
import EmployeeChat from "@/pages/EmployeeChat";

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
        Loading your workspace…
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // /admin is for owner/admin/manager only. Employees get redirected to /chat.
  if (role === "admin_area" && user.role === "employee") {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="App">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/accept-invite/:token" element={<AcceptInvite />} />
              <Route path="/admin/*" element={<Protected role="admin_area"><AdminDashboard /></Protected>} />
              <Route path="/chat" element={<Protected>{<EmployeeChat />}</Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
