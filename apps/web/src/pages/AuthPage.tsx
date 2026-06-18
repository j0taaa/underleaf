import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { authClient } from "../authClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

type AuthMode = "sign-in" | "sign-up";

export function AuthPage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session.data) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim() || email, email, password })
        : await authClient.signIn.email({ email, password });

    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }

    await session.refetch();
    await navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <section className="w-full max-w-sm rounded-md border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Underleaf</h1>
            <p className="text-xs text-muted-foreground">Sign in to your projects</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-md border border-border bg-muted p-1">
          <button
            className={`h-8 rounded-sm text-sm font-medium ${mode === "sign-in" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            type="button"
            onClick={() => setMode("sign-in")}
          >
            Sign in
          </button>
          <button
            className={`h-8 rounded-sm text-sm font-medium ${mode === "sign-up" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            type="button"
            onClick={() => setMode("sign-up")}
          >
            Sign up
          </button>
        </div>

        <form className="grid gap-3" onSubmit={submit}>
          {mode === "sign-up" ? (
            <label className="grid gap-1 text-sm font-medium">
              Name
              <Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm font-medium">
            Email
            <Input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Password
            <Input autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <Button className="mt-2 w-full" disabled={pending} type="submit">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
