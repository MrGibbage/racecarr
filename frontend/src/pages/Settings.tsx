import { Title, Text, Stack, Paper } from "@mantine/core";

export function Settings() {
  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Paper withBorder p="md">
        <Text>Configure indexers, downloaders, paths, notifications, and profiles.</Text>
      </Paper>
    </Stack>
  );
}
