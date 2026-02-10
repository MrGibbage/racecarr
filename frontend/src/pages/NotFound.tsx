import { Title, Text, Stack } from "@mantine/core";

export function NotFound() {
  return (
    <Stack>
      <Title order={2}>Not Found</Title>
      <Text>The page you are looking for does not exist.</Text>
    </Stack>
  );
}
