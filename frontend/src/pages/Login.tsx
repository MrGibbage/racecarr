import { useState } from "react";
import { Alert, Button, Checkbox, Paper, PasswordInput, Stack, Title } from "@mantine/core";
import { API_BASE } from "../api";

export function Login() {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, remember_me: remember }),
      });
      if (res.status === 401) {
        setError("Invalid password");
        return;
      }
      if (!res.ok) throw new Error(`Login failed (${res.status})`);
      setPassword("");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack align="center" mt="xl">
      <Paper withBorder p="lg" miw={360} maw={420}>
        <Stack gap="sm">
          <Title order={3}>Login</Title>
          {error && <Alert color="red" title="Error">{error}</Alert>}
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Checkbox
            label="Remember me"
            checked={remember}
            onChange={(e) => setRemember(e.currentTarget.checked)}
          />
          <Button onClick={submit} loading={loading} disabled={!password}>
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
