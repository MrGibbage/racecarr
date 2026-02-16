import { AppShell, Burger, Group, NavLink, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconHome, IconSearch, IconSettings, IconListDetails, IconClockHour4 } from "@tabler/icons-react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";
import { NotFound } from "./pages/NotFound";
import { Login } from "./pages/Login";
import { Scheduler } from "./pages/Scheduler";
import { apiFetch, API_BASE } from "./api";

const navItems = [
  { label: "Dashboard", to: "/", icon: IconHome },
  { label: "Manual Search", to: "/search", icon: IconSearch },
  { label: "Scheduler", to: "/scheduler", icon: IconClockHour4 },
  { label: "Settings", to: "/settings", icon: IconSettings },
  { label: "Logs", to: "/logs", icon: IconListDetails }
];

export default function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    if (location.pathname === "/login") {
      setAuthChecked(false);
      setIsAuthed(false);
      return;
    }

    setAuthChecked(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    fetch(`${API_BASE}/auth/me`, { credentials: "include", signal: controller.signal })
      .then((res) => {
        if (res.status === 401) {
          setIsAuthed(false);
          navigate("/login", { replace: true });
          return;
        }
        if (res.ok) {
          setIsAuthed(true);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return; // timed out; keep current page
        // Network/backend error: stay on page to avoid redirect loops and let user retry
        console.warn("auth probe failed", err);
      })
      .finally(() => {
        setAuthChecked(true);
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [location.pathname, navigate]);

  if (location.pathname === "/login") {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (!authChecked && !isAuthed) {
    return null; // wait for auth probe to finish to avoid flicker/loops
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <span>Racecarr</span>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <ScrollArea>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname === item.to || (item.to === "/" && location.pathname === "")}
              onClick={close}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/scheduler" element={<Scheduler />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
