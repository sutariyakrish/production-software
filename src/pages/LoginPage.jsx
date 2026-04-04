import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import PageCard from "../components/ui/PageCard";
import StatusMessage from "../components/ui/StatusMessage";
import { auth } from "../lib/firebase";

function validateCredentials({ email, password }) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return "Email is required.";
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  if (!isValidEmail) {
    return "Enter a valid email address.";
  }

  if (!password) {
    return "Password is required.";
  }

  return "";
}

function getFriendlyAuthError(loginError) {
  const code = loginError?.code || "";

  if (code.includes("invalid") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Invalid email or password.";
  }

  if (code.includes("network") || code.includes("request-failed") || code.includes("unavailable")) {
    return "Network error. Check your connection and try again.";
  }

  return "Login failed. Please try again.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateCredentials({ email, password });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEmail("");
      setPassword("");
      navigate("/factories", { replace: true });
    } catch (loginError) {
      console.error(loginError);
      setError(getFriendlyAuthError(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <PageCard className="login-card">
        <form className="stack-form" onSubmit={handleSubmit} noValidate>
          <FormField label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              value={email}
              placeholder="name@factory.com"
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isSubmitting}
            />
          </FormField>

          <FormField label="Password" htmlFor="password">
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="Enter your password"
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </FormField>

          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

          <Button type="submit" block loading={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </Button>
        </form>
      </PageCard>
    </div>
  );
}
