import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Alert, Platform, ScrollView } from "react-native";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import COLORS from "@/constants/colors";
import { initializeNotifications, scheduleStudyNotifications, clearAllNotifications } from "@/lib/notifications";
import { BubblePressable } from "@/components/BubblePressable";

export default function TestNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [permissionStatus, setPermissionStatus] = useState<string>("unknown");
  const [scheduledCount, setScheduledCount] = useState(0);

  useEffect(() => {
    checkPermissions();
    updateScheduledCount();
  }, []);

  const checkPermissions = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const updateScheduledCount = async () => {
    if (Platform.OS === "web") return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    setScheduledCount(scheduled.length);
  };

  const handleInitialize = async () => {
    await initializeNotifications();
    await checkPermissions();
    Alert.alert("Init", "Notification initialization called.");
  };

  const testImmediate = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Notifications are not supported on web in this setup.");
      return;
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 Test Notification",
        body: "This is a test notification that should appear immediately.",
        sound: true,
      },
      trigger: null, // null means immediate
    });
    Alert.alert("Success", "Immediate notification scheduled.");
  };

  const testDelayed = async () => {
    if (Platform.OS === "web") return;
    
    const triggerDate = new Date(Date.now() + 10000); 
    
    try {
      await scheduleStudyNotifications(
        "Auto-Scheduled Test",
        "Learning",
        triggerDate,
        "manual-test-" + Date.now()
      );
      
      await updateScheduledCount();
      Alert.alert("Scheduled", "Test scheduled for 10 seconds from now. You can close the app or go to background to test.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleClear = async () => {
    await clearAllNotifications();
    updateScheduledCount();
    Alert.alert("Cleared", "All notifications cleared.");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#0A0E1A", "#121828"]} style={StyleSheet.absoluteFill} />
      
      <View style={styles.topBar}>
        <BubblePressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          <Text style={styles.backText}>Back</Text>
        </BubblePressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Ionicons name="notifications" size={48} color={COLORS.primary} />
          <Text style={styles.title}>Notification Test</Text>
          <Text style={styles.subtitle}>Verify the notification system is working 100%.</Text>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>Permission: {permissionStatus.toUpperCase()}</Text>
          <Text style={styles.statusText}>Scheduled Tasks: {scheduledCount}</Text>
        </View>

        <View style={styles.btnGrid}>
          <BubblePressable style={styles.btn} onPress={handleInitialize}>
            <LinearGradient colors={COLORS.gradientPrimary} style={styles.btnGradient}>
              <Text style={styles.btnText}>1. Request Permission</Text>
            </LinearGradient>
          </BubblePressable>

          <BubblePressable style={styles.btn} onPress={testImmediate}>
            <LinearGradient colors={["#4CAF50", "#2E7D32"]} style={styles.btnGradient}>
              <Text style={styles.btnText}>2. Test Immediate (Now)</Text>
            </LinearGradient>
          </BubblePressable>

          <BubblePressable style={styles.btn} onPress={testDelayed}>
            <LinearGradient colors={["#FF9800", "#F57C00"]} style={styles.btnGradient}>
              <Text style={styles.btnText}>3. Test Delayed (5s)</Text>
            </LinearGradient>
          </BubblePressable>

          <BubblePressable style={styles.btn} onPress={handleClear}>
            <LinearGradient colors={["#F44336", "#D32F2F"]} style={styles.btnGradient}>
              <Text style={styles.btnText}>4. Clear All</Text>
            </LinearGradient>
          </BubblePressable>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color={COLORS.textSecondary} />
          <Text style={styles.infoText}>
            On Android, ensure you have a notification channel set up. On iOS, you must allow permissions in the prompt.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontFamily: "Poppins_500Medium", fontSize: 16, color: COLORS.text },
  content: { padding: 20, alignItems: "center" },
  header: { alignItems: "center", marginBottom: 40, marginTop: 20 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 24, color: COLORS.text, marginTop: 10 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  statusBox: { 
    backgroundColor: COLORS.surface, 
    width: "100%", 
    padding: 20, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: COLORS.border,
    marginBottom: 30
  },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.text, marginBottom: 5 },
  btnGrid: { width: "100%", gap: 15 },
  btn: { borderRadius: 12, overflow: "hidden" },
  btnGradient: { paddingVertical: 15, alignItems: "center" },
  btnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.white },
  infoBox: { 
    flexDirection: "row", 
    marginTop: 40, 
    padding: 15, 
    backgroundColor: COLORS.primaryGlow, 
    borderRadius: 12,
    gap: 10,
    alignItems: "center"
  },
  infoText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: COLORS.textSecondary }
});
