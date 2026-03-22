import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";
import { callAI, buildSystemPrompt } from "@/lib/ai";

interface SubjectPerformance {
  subject: string;
  totalExams: number;
  avgScore: number;
  lowestScore: number;
  highestScore: number;
  trend: "improving" | "declining" | "stable";
}

interface WeakTopic {
  question: string;
  subject: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export default function WeaknessScreen() {
  const insets = useSafeAreaInsets();
  const { examResults, userProfile, aiConfig, stats } = useApp();
  const [studyPlan, setStudyPlan] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const subjectPerformance = useMemo<SubjectPerformance[]>(() => {
    if (!examResults || !Array.isArray(examResults)) return [];
    const map = new Map<string, { scores: number[]; dates: string[] }>();
    examResults.forEach((exam) => {
      const pct = exam.totalMarks > 0 ? Math.round((exam.scoredMarks / exam.totalMarks) * 100) : 0;
      const existing = map.get(exam.subject) || { scores: [], dates: [] };
      existing.scores.push(pct);
      existing.dates.push(exam.completedAt);
      map.set(exam.subject, existing);
    });

    return Array.from(map.entries()).map(([subject, data]) => {
      const { scores } = data;
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const half = Math.floor(scores.length / 2);
      const recentAvg = scores.slice(half).reduce((a, b) => a + b, 0) / (scores.length - half || 1);
      const oldAvg = scores.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
      const trend: "improving" | "declining" | "stable" =
        recentAvg > oldAvg + 5 ? "improving" : recentAvg < oldAvg - 5 ? "declining" : "stable";

      return {
        subject,
        totalExams: scores.length,
        avgScore: avg,
        lowestScore: Math.min(...scores),
        highestScore: Math.max(...scores),
        trend,
      };
    }).sort((a, b) => a.avgScore - b.avgScore);
  }, [examResults]);

  const weakTopics = useMemo<WeakTopic[]>(() => {
    const topics: WeakTopic[] = [];
    examResults.slice(0, 10).forEach((exam) => {
      exam.questions.forEach((q) => {
        const pct = q.maxScore > 0 ? q.score / q.maxScore : 0;
        if (pct < 0.6) {
          topics.push({
            question: q.question,
            subject: exam.subject,
            score: q.score,
            maxScore: q.maxScore,
            explanation: q.explanation,
          });
        }
      });
    });
    return topics.sort((a, b) => (a.score / a.maxScore) - (b.score / b.maxScore)).slice(0, 15);
  }, [examResults]);

  const weakSubjects = subjectPerformance.filter(s => s.avgScore < 70).slice(0, 3);
  const strongSubjects = subjectPerformance.filter(s => s.avgScore >= 80).slice(0, 3);

  const generateStudyPlan = async () => {
    if (!aiConfig) {
      Alert.alert("No AI Provider", "Please set up your API key first.");
      return;
    }
    if (examResults.length === 0) {
      Alert.alert("No Data", "Complete some exams first to generate a personalized study plan.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);
    setStudyPlan("");

    try {
      const systemPrompt = userProfile ? buildSystemPrompt(userProfile) : "You are an expert study coach.";
      const weakData = weakSubjects.map(s =>
        `${s.subject}: avg ${s.avgScore}%, ${s.totalExams} exams, trend: ${s.trend}`
      ).join("; ");
      const strongData = strongSubjects.map(s =>
        `${s.subject}: avg ${s.avgScore}%`
      ).join("; ");
      const weakTopicsData = weakTopics.slice(0, 5).map(t =>
        `"${t.question.slice(0, 80)}" in ${t.subject} (${t.score}/${t.maxScore})`
      ).join("\n");

      const prompt = `As a personalized AI study coach, create a premium WEAKNESS IMPROVEMENT PLAN based on this student's performance data.

STUDENT DATA:
WEAK AREAS: ${weakData || "None identified"}
STRONG AREAS: ${strongData || "None identified"}
RECENT FAILURES:
${weakTopicsData || "No data"}

FORMATTING MANDATES:
- NO HASHTAGS (# or ##).
- Use **BOLD UPPERCASE TEXT** on its own line for headers.
- Use simple bullet points (•).
- Do not use messy markdown symbols.

STRUCTURE:
**PRIORITY FOCUS AREAS**
**2-WEEK SYSTEMATIC SCHEDULE**
**LOGICAL REVISION STRATEGIES**
**DAILY TIME ALLOCATION**
**CONFIDENCE MILESTONES**`;

      await callAI(
        aiConfig,
        [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
        (chunk) => setStudyPlan((prev) => prev + chunk)
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to generate study plan.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getScoreColor = (score: number) =>
    score >= 80 ? COLORS.success : score >= 60 ? COLORS.warning : COLORS.danger;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0A0E1A", "#0A0E1A"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Neural Analysis</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>

        {examResults.length === 0 ? (
          <View style={styles.emptyState}>
            <LinearGradient colors={["#FF4D6A20", "#FF4D6A10"]} style={styles.emptyIcon}>
              <Ionicons name="fitness" size={40} color={COLORS.danger} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No Neural Data</Text>
            <Text style={styles.emptyText}>Complete exams to analyze sectors.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push("/(tabs)/practice")}>
              <LinearGradient colors={["#FF4D6A", "#FF6B35"]} style={styles.emptyBtnGradient}>
                <Ionicons name="school" size={18} color={COLORS.white} />
                <Text style={styles.emptyBtnText}>Begin Scan</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <LinearGradient colors={["#1A1F2B", "#0D1117"]} style={styles.summaryGradient}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: COLORS.danger }]}>{weakSubjects.length}</Text>
                    <Text style={styles.summaryLabel}>WEAK{"\n"}SECTORS</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: COLORS.warning }]}>{weakTopics.length}</Text>
                    <Text style={styles.summaryLabel}>SYSTEM{"\n"}ANOMALIES</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: COLORS.success }]}>{strongSubjects.length}</Text>
                    <Text style={styles.summaryLabel}>OPTIMAL{"\n"}SECTORS</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.analysisHeader}>
              <Text style={styles.sectionTitle}>PERFORMANCE SPECTRUM</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            {subjectPerformance.length === 0 ? (
              <Text style={styles.noDataText}>NO DATA INGESTED</Text>
            ) : (
              subjectPerformance.map((sp) => (
                <View key={sp.subject} style={styles.subjectCard}>
                  <View style={styles.subjectHeader}>
                    <View style={styles.subjectLeft}>
                      <View style={[styles.subjectDot, { backgroundColor: getScoreColor(sp.avgScore) }]} />
                      <Text style={styles.subjectName}>{sp.subject.toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.subjectScore, { color: getScoreColor(sp.avgScore) }]}>
                      {sp.avgScore}%
                    </Text>
                  </View>

                  <View style={styles.subjectBar}>
                    <View style={[styles.subjectBarFill, { width: `${sp.avgScore}%` as any, backgroundColor: getScoreColor(sp.avgScore) }]} />
                  </View>

                  <View style={styles.subjectStats}>
                    <Text style={styles.subjectStat}>TREND: {sp.trend.toUpperCase()}</Text>
                    <Text style={styles.subjectStat}>PEAK: {sp.highestScore}%</Text>
                  </View>
                </View>
              ))
            )}

            {weakTopics.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>CRITICAL FAILURES</Text>
                {weakTopics.slice(0, 5).map((topic, i) => {
                  const pct = topic.maxScore > 0 ? Math.round((topic.score / topic.maxScore) * 100) : 0;
                  return (
                    <View key={i} style={styles.weakCard}>
                      <View style={styles.weakHeader}>
                        <Text style={styles.weakSubject}>{topic.subject.toUpperCase()}</Text>
                        <Text style={[styles.weakScoreText, { color: COLORS.danger }]}>{pct}%</Text>
                      </View>
                      <Text style={styles.weakQuestion} numberOfLines={2}>{topic.question}</Text>
                    </View>
                  );
                })}
              </>
            )}

            <Pressable
              style={[styles.planBtn, isGenerating && { opacity: 0.7 }]}
              onPress={generateStudyPlan}
              disabled={isGenerating}
            >
              <LinearGradient colors={["#7B5EF8", "#4F8EF7"]} style={styles.planBtnGradient}>
                {isGenerating ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="analytics" size={20} color={COLORS.white} />
                    <Text style={styles.planBtnText}>GENERATE NEURAL FIX</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            {studyPlan ? (
              <View style={styles.planCard}>
                <View style={styles.planCardHeader}>
                  <Text style={styles.planCardTitle}>OPTIMIZATION PROTOCOL</Text>
                </View>
                <Text style={styles.planCardText}>{studyPlan}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderRadius: 20 },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 18, color: COLORS.text, textAlign: "center", letterSpacing: 1 },

  emptyState: { alignItems: "center", paddingTop: 60, gap: 16 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: COLORS.text },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  emptyBtn: { borderRadius: 12, overflow: "hidden" },
  emptyBtnGradient: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 24 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: COLORS.white },

  summaryCard: { borderRadius: 20, overflow: "hidden", marginTop: 8, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border },
  summaryGradient: { paddingVertical: 24, paddingHorizontal: 10 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  summaryItem: { alignItems: "center", width: "30%" },
  summaryValue: { fontFamily: "Poppins_700Bold", fontSize: 32, letterSpacing: -1 },
  summaryLabel: { fontFamily: "Poppins_700Bold", fontSize: 10, color: COLORS.textMuted, textAlign: "center", marginTop: 4, lineHeight: 14 },
  summaryDivider: { width: 1, height: 30, backgroundColor: COLORS.border + "40" },

  analysisHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 13, color: COLORS.textSecondary, letterSpacing: 1.5 },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.danger + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.danger },
  liveText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: COLORS.danger },

  subjectCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  subjectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  subjectLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  subjectDot: { width: 8, height: 8, borderRadius: 4 },
  subjectName: { fontFamily: "Poppins_700Bold", fontSize: 14, color: COLORS.text, letterSpacing: 0.5 },
  subjectScore: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  subjectBar: { height: 4, backgroundColor: COLORS.border + "40", borderRadius: 2, marginBottom: 10 },
  subjectBarFill: { height: 4, borderRadius: 2 },
  subjectStats: { flexDirection: "row", justifyContent: "space-between" },
  subjectStat: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: COLORS.textMuted },

  weakCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: COLORS.danger },
  weakHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  weakSubject: { fontFamily: "Poppins_700Bold", fontSize: 11, color: COLORS.textMuted },
  weakScoreText: { fontFamily: "Poppins_700Bold", fontSize: 11 },
  weakQuestion: { fontFamily: "Poppins_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 20 },

  planBtn: { borderRadius: 16, overflow: "hidden", marginTop: 12, marginBottom: 20 },
  planBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  planBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: COLORS.white, letterSpacing: 1 },

  planCard: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary + "30", marginBottom: 30 },
  planCardHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  planCardTitle: { fontFamily: "Poppins_700Bold", fontSize: 14, color: COLORS.primary, letterSpacing: 1 },
  planCardText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.text, lineHeight: 24, padding: 16 },
  noDataText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: COLORS.textMuted, textAlign: "center", marginTop: 4, lineHeight: 14 },
});
