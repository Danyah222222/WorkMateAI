import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const token = localStorage.getItem("wm_token");
      if (!token) { setLoading(false); return; }

      // Retry a couple of times so transient 502s during container warm-up
      // don't sign the user out.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await api.get("/auth/me");
          if (!cancelled) setUser(r.data);
          break;
        } catch (err) {
          const status = err.response?.status;
          if (status === 401) {
            // Token is truly invalid/expired -> clear it.
            localStorage.removeItem("wm_token");
            break;
          }
          // Network error or 5xx -> keep token, retry with backoff.
          if (attempt === 2) break;
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
      if (!cancelled) setLoading(false);
    };

    bootstrap();

    // Global handler: if any API call returns 401, clear session and force re-login.
    // EXCEPT: endpoints where 401 legitimately means "wrong password entered in a form",
    // not "session invalid" — those must stay signed in so the user can retry.
    const SKIP_AUTO_LOGOUT = [
      "/auth/change-password",
      "/profile/email/request-change",
      "/auth/login", // login failure is not a session invalidation
    ];
    const interceptorId = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const url = err.config?.url || "";
        const isFormAuth = SKIP_AUTO_LOGOUT.some((p) => url.endsWith(p) || url.includes(p));
        if (err.response?.status === 401 && !isFormAuth && localStorage.getItem("wm_token")) {
          localStorage.removeItem("wm_token");
          setUser(null);
        }
        return Promise.reject(err);
      }
    );

    return () => {
      cancelled = true;
      api.interceptors.response.eject(interceptorId);
    };
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("wm_token", res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  };

  const setUserAfterAuth = (u) => setUser(u);

  const logout = () => {
    localStorage.removeItem("wm_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, setUserAfterAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
