import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";
import { callAI, buildSystemPrompt } from "@/lib/ai";
import { LibraryItem } from "@/lib/storage";
import MathRender from "@/components/MathRender";

type Mode = "notes" | "summary" | "flashcards";
type Difficulty = "Easy" | "Medium" | "Hard";
type Length = "Short" | "Medium" | "Long";
type Tone = "Simple" | "Academic" | "Exam-Ready";
type SummaryType =
  | "ultra_quick"
  | "exam_oriented"
  | "concept_breakdown"
  | "weakness_based"
  | "crash_sheet"
  | "formula_extraction"
  | "definition_mode"
  | "memory_trigger";

interface Flashcard {
  concept: string;
  details: string;
  formula?: string;
}

const SUMMARY_TYPES: { id: SummaryType; label: string; icon: string; color: string; statKey: string }[] = [
  { id: "ultra_quick", label: "Ultra Quick Revision", icon: "flash", color: "#FF6B35", statKey: "quickRevisions" },
  { id: "exam_oriented", label: "Exam-Oriented", icon: "school", color: COLORS.primary, statKey: "" },
  { id: "concept_breakdown", label: "Concept Breakdown", icon: "git-network", color: "#7B5EF8", statKey: "conceptBreakdowns" },
  { id: "weakness_based", label: "Weakness-Based", icon: "alert-circle", color: "#FF4D6A", statKey: "weaknessSummaries" },
  { id: "crash_sheet", label: "Crash Sheet", icon: "newspaper", color: COLORS.accent, statKey: "" },
  { id: "formula_extraction", label: "Formula Extraction", icon: "calculator", color: COLORS.gold, statKey: "formulaExtractions" },
  { id: "definition_mode", label: "Definition Mode", icon: "book", color: COLORS.danger, statKey: "definitionSets" },
  { id: "memory_trigger", label: "Memory Trigger", icon: "bulb", color: "#7B5EF8", statKey: "memoryTriggers" },
];

const { width } = Dimensions.get("window");

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const { aiConfig, userProfile, addLibraryItem, incrementStat, checkAndAwardBadges, trackSummaryType } = useApp();
  
  const [mode, setMode] = useState<Mode>("notes");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState(userProfile?.subjects?.[0] || "");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [length, setLength] = useState<Length>("Medium");
  const [tone, setTone] = useState<Tone>("Exam-Ready");
  const [summaryType, setSummaryType] = useState<SummaryType>("exam_oriented");
  
  const [result, setResult] = useState("");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const generateContent = async () => {
    if (!topic.trim() || !aiConfig) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);
    setResult("");
    setFlashcards([]);
    setSaved(false);
    setCurrentCardIndex(0);
    setIsFlipped(false);

    try {
      const systemPrompt = userProfile ? buildSystemPrompt(userProfile) : "You are a study assistant.";
      let userPrompt = "";
      
      if (mode === "notes") {
        userPrompt = `Generate premium study notes on: "${topic}" for ${subject}.
STYLE:
- Use clear **Bold Headers** for sections.
- **Bold** all important terms, definitions, and laws.
- Use LaTeX for math ($x^2$).
- Avoid unnecessary symbols or emojis. Keep it clean and professional.
- Include: Definitions, Key Principles, Derivations, Applications, Exam Focus.
Difficulty: ${difficulty}. Tone: ${tone}.`;
      } else if (mode === "flashcards") {
        // ... (flashcards prompt unchanged in logic but included for context)
        userPrompt = `Generate exactly 10 high-quality flashcards for "${topic}" focused on CONCEPT MAPPING.
        
        STRICT RULES:
        - DO NOT include formulas.
        - Focus on "concept": (The Core Topic)
        - Focus on "details": (How it connects to other topics, its importance, and its core logic).
        
        FORMAT (STRICT JSON ARRAY):
        [
          {
            "concept": "Topic Name",
            "details": "Clear explanation of the concept's relationship and mapping."
          }
        ]
        
        CRITICAL: Return ONLY a JSON ARRAY. No preamble or post-text.`;
      } else {
        const typePrompts: Record<SummaryType, string> = {
          ultra_quick: `Create an ULTRA QUICK Revision Summary of "${topic}". NO SYMBOLS. Use **Bold Headers**. Bold all critical facts. Include 5 Critical Facts, 3 Key Terms, 1 Exam Alert.`,
          exam_oriented: `Create an Exam-Oriented Summary of "${topic}". Clean formatting. Bold important topics and examiner tips.`,
          concept_breakdown: `Concept Breakdown of "${topic}". Use bold for key mechanisms and logical flow.`,
          weakness_based: `Weakness Remediation Plan for "${topic}". Bold common traps and their corrections.`,
          crash_sheet: `Crash Sheet for "${topic}". Absolute essentials only. Use bold for the "must-know" terms.`,
          formula_extraction: `Extract Formulas for "${topic}". List formula (LaTeX), variables, and application. Bold the formula names.`,
          definition_mode: `Definitions Glossary for "${topic}". Format: **Term**: Definition. Ensure clean list formatting.`,
          memory_trigger: `Memory Triggers/Mnemonics for "${topic}". Bold the acronyms and hooks.`,
        };
        userPrompt = typePrompts[summaryType];
      }

      const response = await callAI(
        aiConfig,
        [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
      );

      if (mode === "flashcards") {
        // Robust JSON extraction
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const cards = JSON.parse(jsonMatch[0]);
            if (Array.isArray(cards) && cards.length > 0) {
              setFlashcards(cards);
            } else {
              throw new Error("No cards found in JSON.");
            }
          } catch (e) {
            console.error("Flashcard Parse Error:", e, response);
            // Fallback attempt: Try to clean the string
            try {
               const cleaned = jsonMatch[0].replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
               setFlashcards(JSON.parse(cleaned));
            } catch {
               throw new Error("AI returned invalid data format. Please try again.");
            }
          }
        } else {
          throw new Error("AI did not return a valid flashcard format.");
        }
      } else {
        setResult(response);
      }

      if (mode === "notes") await incrementStat("notesGenerated");
      else if (mode === "summary") {
        await incrementStat("summariesGenerated");
        await trackSummaryType(summaryType);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await checkAndAwardBadges();
    } catch (err: any) {
      Alert.alert("Generation Error", err?.message || "Generation failed.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveToLibrary = async () => {
    if ((mode !== "flashcards" && !result) || (mode === "flashcards" && flashcards.length === 0)) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const item: LibraryItem = {
      id: Crypto.randomUUID(),
      type: mode === "notes" ? "note" : "summary", // Flashcards stored as summary for now or notes
      title: `${topic} — ${mode === "notes" ? "Notes" : mode === "flashcards" ? "Flashcards" : SUMMARY_TYPES.find(s => s.id === summaryType)?.label}`,
      content: mode === "flashcards" ? JSON.stringify(flashcards) : result,
      subject: subject || "General",
      createdAt: new Date().toISOString(),
      metadata: { difficulty, length, tone, summaryType: mode === "summary" ? summaryType : undefined },
    };
    await addLibraryItem(item);
    setSaved(true);
    await checkAndAwardBadges();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const downloadFlashcards = async () => {
    if (flashcards.length === 0) return;
    try {
      const html = `
        <html>
          <head>
            <style>
              body { font-family: sans-serif; padding: 20px; }
              .card { border: 2px solid #000; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; border-radius: 10px; }
              .concept { font-size: 24px; font-weight: bold; color: #333; margin-bottom: 10px; }
              .details { font-size: 16px; color: #666; margin-bottom: 15px; }
              .formula { background: #f0f0f0; padding: 10px; font-family: monospace; border-radius: 5px; }
            </style>
          </head>
          <body>
            <h1>Flashcards: ${topic}</h1>
            ${flashcards.map(c => `
              <div class="card">
                <div class="concept">${c.concept}</div>
                <div class="details">${c.details}</div>
                ${c.formula ? `<div class="formula">${c.formula.replace(/\$/g, '')}</div>` : ''}
              </div>
            `).join('')}
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
      Alert.alert("Error", "Failed to generate PDF");
    }
  };

  if (!aiConfig) {
    return (
      <View style={[styles.container, { paddingTop: topPad, justifyContent: "center", alignItems: "center" }]}>
        <LinearGradient colors={["#0A0E1A", "#121828"]} style={StyleSheet.absoluteFill} />
        <Ionicons name="key" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No AI Provider</Text>
        <Text style={styles.emptyText}>Set up your API key to generate content</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0A0E1A", "#0A0E1A"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Study Generator</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeToggle}>
          {(["notes", "summary", "flashcards"] as Mode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => { setMode(m); setResult(""); setFlashcards([]); setSaved(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        <View style={styles.inputSection}>
          <Text style={styles.label}>Topic</Text>
          <TextInput
            style={styles.topicInput}
            placeholder={mode === "flashcards" ? "e.g. Organic Chemistry Reactions" : "e.g. Newton's Laws"}
            placeholderTextColor={COLORS.textMuted}
            value={topic}
            onChangeText={setTopic}
          />
        </View>

        {mode === "notes" && (
          <View style={styles.optionsSection}>
             <Text style={styles.label}>Tone & Difficulty</Text>
             <View style={styles.optionRow}>
                <Pressable onPress={() => setDifficulty("Hard")} style={[styles.optionBtn, difficulty === "Hard" && styles.optionBtnActive]}><Text style={[styles.optionText, difficulty === "Hard" && styles.optionTextActive]}>Hard</Text></Pressable>
                <Pressable onPress={() => setTone("Exam-Ready")} style={[styles.optionBtn, tone === "Exam-Ready" && styles.optionBtnActive]}><Text style={[styles.optionText, tone === "Exam-Ready" && styles.optionTextActive]}>Exam-Ready</Text></Pressable>
             </View>
          </View>
        )}

        {mode === "summary" && (
          <View style={styles.summaryTypesSection}>
            <Text style={styles.label}>Summary Type</Text>
            <View style={styles.summaryGrid}>
              {SUMMARY_TYPES.map((st) => (
                <Pressable
                  key={st.id}
                  style={[styles.summaryTypeCard, summaryType === st.id && { borderColor: st.color, backgroundColor: st.color + "15" }]}
                  onPress={() => setSummaryType(st.id)}
                >
                  <Ionicons name={st.icon as any} size={18} color={st.color} />
                  <Text style={[styles.summaryTypeText, summaryType === st.id && { color: st.color }]}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Pressable
          style={[styles.generateBtn, (!topic.trim() || isGenerating) && styles.generateBtnDisabled]}
          onPress={generateContent}
          disabled={!topic.trim() || isGenerating}
        >
          <LinearGradient colors={topic.trim() ? COLORS.gradientPrimary : ["#2A3560", "#2A3560"]} style={styles.generateBtnGradient}>
            {isGenerating ? <ActivityIndicator color={COLORS.white} /> : (
              <>
                <Ionicons name="sparkles" size={20} color={COLORS.white} />
                <Text style={styles.generateBtnText}>Generate {mode === "flashcards" ? "Cards" : mode}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {mode === "flashcards" && flashcards.length > 0 ? (
          <View style={styles.flashcardContainer}>
             <View style={styles.cardHeader}>
                <Text style={styles.cardCounter}>Card {currentCardIndex + 1} / {flashcards.length}</Text>
                <Pressable onPress={downloadFlashcards} style={styles.downloadBtn}>
                  <Ionicons name="download-outline" size={20} color={COLORS.primary} />
                </Pressable>
             </View>
             
             <Pressable 
                style={styles.card} 
                onPress={() => { setIsFlipped(!isFlipped); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
             >
                <LinearGradient colors={isFlipped ? ["#1A1F2B", "#121828"] : ["#FF4D6A", "#FF6B35"]} style={styles.cardGradient}>
                  <View style={styles.cardContent}>
                    {isFlipped ? (
                       <>
                         <View style={styles.cardBack}>
                           <Text style={styles.cardDetails}>{flashcards[currentCardIndex].details}</Text>
                         </View>
                       </>
                    ) : (
                       <>
                         <Ionicons name="school-outline" size={48} color="rgba(255,255,255,0.8)" style={{marginBottom: 20}} />
                         <Text style={styles.cardTitle}>{flashcards[currentCardIndex].concept}</Text>
                         <Text style={styles.tapHint}>Tap to flip</Text>
                       </>
                    )}
                  </View>
                </LinearGradient>
             </Pressable>

             <View style={styles.cardControls}>
                <Pressable 
                  style={[styles.navBtn, currentCardIndex === 0 && styles.navBtnDisabled]}
                  onPress={() => { if(currentCardIndex > 0) { setCurrentCardIndex(curr => curr - 1); setIsFlipped(false); } }}
                >
                  <Ionicons name="chevron-back" size={24} color={COLORS.white} />
                </Pressable>
                <Pressable 
                  style={[styles.navBtn, currentCardIndex === flashcards.length - 1 && styles.navBtnDisabled]}
                  onPress={() => { if(currentCardIndex < flashcards.length - 1) { setCurrentCardIndex(curr => curr + 1); setIsFlipped(false); } }}
                >
                   <Ionicons name="chevron-forward" size={24} color={COLORS.white} />
                </Pressable>
             </View>
          </View>
        ) : null}

        {(mode !== "flashcards" && result) ? (
          <View style={styles.resultContainer}>
             <MathRender content={result} style={styles.resultText} fontSize={14} />
             <Pressable style={styles.saveBtn} onPress={saveToLibrary}>
                <Text style={styles.saveBtnText}>{saved ? "Saved" : "Save to Library"}</Text>
             </Pressable>
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text, marginBottom: 10 },
  modeToggle: { flexDirection: "row", gap: 8 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  modeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeBtnText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: COLORS.textSecondary },
  modeBtnTextActive: { color: COLORS.white },
  inputSection: { marginTop: 20 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
  topicInput: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  optionsSection: { marginBottom: 20 },
  optionRow: { flexDirection: "row", gap: 10 },
  optionBtn: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  optionBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "20" },
  optionText: { color: COLORS.text, fontFamily: "Poppins_500Medium" },
  optionTextActive: { color: COLORS.primary },
  summaryTypesSection: { marginBottom: 20 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryTypeCard: { width: "48%", backgroundColor: COLORS.surface, padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border },
  summaryTypeText: { fontSize: 11, color: COLORS.text, fontFamily: "Poppins_500Medium", flex: 1 },
  generateBtn: { borderRadius: 16, overflow: "hidden", marginBottom: 30 },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnGradient: { padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  generateBtnText: { color: COLORS.white, fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  
  // Flashcards
  flashcardContainer: { alignItems: "center", width: "100%" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginBottom: 10, paddingHorizontal: 10 },
  cardCounter: { color: COLORS.textMuted, fontFamily: "Poppins_600SemiBold" },
  downloadBtn: { padding: 4 },
  card: { width: "100%", height: 350, borderRadius: 24, overflow: "hidden", marginBottom: 20 },
  cardGradient: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  cardContent: { alignItems: "center", width: "100%" },
  cardLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Poppins_700Bold", marginBottom: 10, letterSpacing: 1 },
  cardTitle: { color: COLORS.white, fontSize: 28, fontFamily: "Poppins_700Bold", textAlign: "center", marginBottom: 10 },
  cardDetails: { color: COLORS.white, fontSize: 16, fontFamily: "Poppins_500Medium", textAlign: "center", marginBottom: 20, lineHeight: 24 },
  cardBack: { alignItems: "center", justifyContent: "center" },
  formulaBox: { backgroundColor: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 12, minWidth: "80%", alignItems: "center" },
  tapHint: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 20 },
  cardControls: { flexDirection: "row", gap: 20 },
  navBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  navBtnDisabled: { opacity: 0.3 },

  resultContainer: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  resultText: { color: COLORS.text, lineHeight: 24 },
  saveBtn: { marginTop: 16, alignItems: "center", padding: 12, backgroundColor: COLORS.primary + "20", borderRadius: 12 },
  saveBtnText: { color: COLORS.primary, fontFamily: "Poppins_600SemiBold" },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text, marginTop: 16 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary },
});
