import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router, Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const success = await login(email.trim(), password);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/");
      } else {
        Alert.alert("Login Failed", "Invalid email or password");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient colors={["#0A0E1A", "#121828"]} style={StyleSheet.absoluteFill} />
      
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60 }]}>
        <View style={styles.header}>
          <LinearGradient colors={COLORS.gradientPrimary} style={styles.logoContainer}>
            <View style={styles.logoInner}>
              <Ionicons name="school" size={40} color={COLORS.white} />
            </View>
          </LinearGradient>
          <Text style={styles.title}>LearnovaX <Text style={{ color: COLORS.primary }}>v1</Text></Text>
          <Text style={styles.subtitle}>NEURAL LEARNING INTERFACE</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>IDENTIFICATION</Text>
            <View style={[styles.inputWrapper, email ? styles.inputWrapperActive : null]}>
              <Ionicons name="mail-outline" size={20} color={email ? COLORS.primary : COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="email@terminal.com"
                placeholderTextColor={COLORS.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ACCESS CODE</Text>
            <View style={[styles.inputWrapper, password ? styles.inputWrapperActive : null]}>
              <Ionicons name="lock-closed-outline" size={20} color={password ? COLORS.primary : COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.loginBtn, isLoading && styles.disabledBtn]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <LinearGradient colors={COLORS.gradientPrimary} style={styles.btnGradient}>
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="power" size={20} color={COLORS.white} />
                  <Text style={styles.loginBtnText}>INITIALIZE SESSION</Text>
                </View>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Link href="/signup" asChild>
              <Pressable>
                <Text style={styles.signupLink}>Sign Up</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { alignItems: "center", marginBottom: 40 },
  logoContainer: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 16, padding: 2 },
  logoInner: { width: "100%", height: "100%", borderRadius: 20, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 28, color: COLORS.text, marginBottom: 4, letterSpacing: 1 },
  subtitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: COLORS.primary, letterSpacing: 2, opacity: 0.8 },
  form: { gap: 20 },
  inputGroup: { gap: 10 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: COLORS.textMuted, marginLeft: 4, letterSpacing: 1 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(28, 34, 64, 0.5)",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 60,
  },
  inputWrapperActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(79, 142, 247, 0.05)",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: "100%", color: COLORS.text, fontFamily: "Poppins_400Regular", fontSize: 15 },
  eyeIcon: { padding: 8 },
  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 10, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  disabledBtn: { opacity: 0.7 },
  btnGradient: { height: 60, alignItems: "center", justifyContent: "center" },
  loginBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: COLORS.white, letterSpacing: 1 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footerText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary },
  signupLink: { fontFamily: "Poppins_700Bold", fontSize: 14, color: COLORS.primary },
});
