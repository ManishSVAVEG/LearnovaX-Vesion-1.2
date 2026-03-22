import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { AppProvider } from "@/contexts/AppContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { initializeNotifications } from "@/lib/notifications";

import * as ScreenCapture from "expo-screen-capture";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  useEffect(() => {
    // Prevent screenshots and screen recording for maximum data security
    ScreenCapture.preventScreenCaptureAsync();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="onboarding" options={{ presentation: "modal" }} />
      <Stack.Screen name="api-setup" options={{ presentation: "modal" }} />
      <Stack.Screen name="test-notifications" options={{ presentation: "modal" }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="library" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="badges" />
      <Stack.Screen name="plan" />
      <Stack.Screen name="weakness" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      initializeNotifications();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RootLayoutNav />
        </SafeAreaProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
