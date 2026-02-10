import { AppShell, Burger, Group, NavLink, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconHome, IconSearch, IconSettings, IconListDetails } from "@tabler/icons-react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";
import { NotFound } from "./pages/NotFound";

const navItems = [
  { label: "Dashboard", to: "/", icon: IconHome },
  { label: "Search", to: "/search", icon: IconSearch },
  { label: "Settings", to: "/settings", icon: IconSettings },
  { label: "Logs", to: "/logs", icon: IconListDetails }
];

export default function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();

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
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
