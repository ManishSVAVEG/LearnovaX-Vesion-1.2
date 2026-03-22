import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";

import * as Device from "expo-device";
import { Alert } from "react-native";

export default function IndexScreen() {
  const { isLoading, isLoggedIn, isOnboarded, hasAIConfig } = useApp();

  useEffect(() => {
    if (isLoading) return;

    // Root/Jailbreak Detection for Security Rating
    const checkSecurity = async () => {
      const isRooted = await Device.isRootedExperimentalAsync();
      if (isRooted) {
        Alert.alert(
          "Security Warning",
          "This device appears to be rooted or jailbroken. For your data security, some features may be restricted.",
          [{ text: "I Understand" }]
        );
      }
    };
    checkSecurity();

    if (!isLoggedIn) {
      router.replace("/login");
    } else if (!isOnboarded) {
      router.replace("/onboarding");
    } else if (!hasAIConfig) {
      router.replace("/api-setup");
    } else {
      router.replace("/(tabs)");
    }
  }, [isLoading, isLoggedIn, isOnboarded, hasAIConfig]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}
