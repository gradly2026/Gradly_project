import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="iniciosesion" />
      <Stack.Screen name="registro" />
      <Stack.Screen name="action" />
    </Stack>
  );
}
