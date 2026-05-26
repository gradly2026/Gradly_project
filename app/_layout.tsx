import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ThemeProvider as GradlyThemeProvider } from "../src/context/ThemeContext";
import { TranslationProvider } from "../src/context/TranslationContext";

import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <GradlyThemeProvider>
        <TranslationProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="iniciosesion" options={{ headerShown: false }} />
            <Stack.Screen name="registro" options={{ headerShown: false }} />
            <Stack.Screen
              name="dashboard-admin"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="dashboard-universidad"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="dashboard-joventalento"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="dashboard-estudiante"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="dashboard-empresa"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="modal"
              options={{ presentation: "modal", title: "Modal" }}
            />
          </Stack>
        </TranslationProvider>
      </GradlyThemeProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
