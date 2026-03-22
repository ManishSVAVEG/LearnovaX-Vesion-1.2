import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";
import { callAI, buildSystemPrompt } from "@/lib/ai";
import { ExamResult, storage } from "@/lib/storage";
import MathRender from "@/components/MathRender";

type ExamMode = "standard" | "jee-advanced";
type ExamState = "setup" | "taking" | "evaluating" | "done";

interface Explanation {
  steps: string[];
  common_mistake: string;
  key_concept: string;
}

interface Question {
  id: string;
  subject?: string;
  concepts?: string[];
  question: string;
  options?: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer?: string;
  explanation?: string | Explanation;
  marks: number;
  userAnswer: string;
}

interface ParsedQuestion {
  id?: string;
  subject?: string;
  concepts?: string[];
  question: string;
  options?: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer?: string;
  correct_answer?: string;
  explanation?: string | Explanation;
  marks?: number;
}

export default function PracticeScreen() {
  const insets = useSafeAreaInsets();
  const { aiConfig, userProfile, addExamResult, incrementStat, updateStats, checkAndAwardBadges } = useApp();

  const [examMode, setExamMode] = useState<ExamMode>("standard");
  const [examState, setExamState] = useState<ExamState>("setup");
  const [subject, setSubject] = useState(userProfile?.subjects?.[0] || "");
  const [topic, setTopic] = useState("");
  const [targetTotalMarks, setTargetTotalMarks] = useState(20);
  const [totalMCQs, setTotalMCQs] = useState(75);
  const [pCount, setPCount] = useState(25);
  const [cCount, setCCount] = useState(25);
  const [mCount, setMCount] = useState(25);
  const [qCounts, setQCounts] = useState({ m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 });
  const [m4CaseBased, setM4CaseBased] = useState(false);
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [timerMinutes, setTimerMinutes] = useState("15");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const isJEEValid = examMode === "jee-advanced" && totalMCQs > 0 && (pCount + cCount + mCount) === totalMCQs;

  const uniqueId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const submitExam = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!aiConfig) return;
    setExamState("evaluating");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const maxTime = (parseInt(timerMinutes) || 15) * 60;
    const isSpeedExam = timeSpent < maxTime / 2;

    try {
      let evaluated;
      if (examMode === "jee-advanced") {
        // Direct evaluation for MCQs
        evaluated = questions.map(q => {
          const isCorrect = q.userAnswer === q.correctAnswer;
          const score = isCorrect ? 4 : (q.userAnswer ? -1 : 0); // +4 for correct, -1 for wrong, 0 for unattempted
          
          let modelAns = "N/A";
          if (q.correctAnswer && q.options) {
            modelAns = `${q.correctAnswer}) ${q.options[q.correctAnswer as keyof typeof q.options] || ""}`;
          }

          return {
            question: q.question || "No question text",
            userAnswer: q.userAnswer || "(No answer given)",
            correctAnswer: modelAns,
            score: score,
            maxScore: 4,
            explanation: q.explanation || "No explanation available.",
            subject: q.subject,
            concepts: q.concepts
          };
        });
      } else {
        const systemPrompt = userProfile ? buildSystemPrompt(userProfile) : "You are an expert exam evaluator.";
        const evalPrompt = `Evaluate these exam answers for the topic "${topic}" in ${subject}:

${questions.map((q, i) => `Q${i + 1} (${q.marks} marks): ${q.question}
Student Answer: ${q.userAnswer || "(No answer given)"}`).join("\n\n")}

CRITICAL EVALUATION GUIDELINES:
- Be strict and fair. Compare the student answer against factual, board-standard knowledge.
- Assign a score from 0 up to the "maxScore" (the marks for that question).
- Give 0 marks for empty, irrelevant, or factually incorrect answers.
- Give partial marks for partially correct or incomplete answers.
- For 4-5 mark questions, look for depth, explanation, and key points.
- Provide a clear, comprehensive model answer for the student to learn from.
- Provide constructive feedback in the "explanation" field.

RETURN ONLY A JSON ARRAY. Format:
[
  {
    "question": "question text",
    "userAnswer": "student answer",
    "correctAnswer": "comprehensive model answer",
    "score": 2.5,
    "maxScore": 4,
    "explanation": "Why did the student get this score? What was missing or incorrect?"
  }
]`;

        const evalResponse = await callAI(aiConfig, [
          { role: "system", content: systemPrompt },
          { role: "user", content: evalPrompt },
        ]);

        try {
          const jsonMatch = evalResponse.match(/\[[\s\S]*\]/);
          if (!jsonMatch) throw new Error("Could not find JSON in response");
          evaluated = JSON.parse(jsonMatch[0]);
        } catch {
          console.error("AI Parse Error:", evalResponse);
          throw new Error("The AI response was not in a valid format. Please try submitting again.");
        }
      }

      if (!evaluated || !Array.isArray(evaluated)) {
        throw new Error("Evaluation failed to produce a valid result.");
      }

      const totalScored = evaluated.reduce((sum: number, q: any) => sum + (Number(q.score) || 0), 0);
      const totalPossible = evaluated.reduce((sum: number, q: any) => sum + (Number(q.maxScore) || 0), 0);
      const accuracy = totalPossible > 0 ? Math.round((totalScored / totalPossible) * 100) : 0;

      const examResult: ExamResult = {
        id: uniqueId(),
        subject: subject || (examMode === "jee-advanced" ? "JEE Advanced" : "General"),
        topic: topic || (examMode === "jee-advanced" ? "Multi-concept MCQs" : ""),
        totalMarks: totalPossible,
        scoredMarks: totalScored,
        totalQuestions: questions.length,
        timeSpent,
        completedAt: new Date().toISOString(),
        questions: evaluated,
      };

      setResult(examResult);
      setExamState("done");

      await addExamResult(examResult);
      await incrementStat("examsCompleted");

      const stats = await storage.getStats();
      const newAccuracy = Math.round((stats.accuracy * stats.examsCompleted + accuracy) / (stats.examsCompleted + 1));
      await updateStats({ accuracy: newAccuracy });

      if (accuracy === 100) await updateStats({ perfectScores: stats.perfectScores + 1 });
      if (accuracy >= 90) await updateStats({ highScores: stats.highScores + 1 });
      if (isSpeedExam) await updateStats({ speedExams: stats.speedExams + 1 });

      await checkAndAwardBadges();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("Submit Exam Error:", err);
      Alert.alert("Evaluation Error", err?.message || "Failed to evaluate. Your answers are saved.");
      setExamState("taking");
    }
  }, [aiConfig, userProfile, topic, subject, questions, timerMinutes, examMode, addExamResult, incrementStat, updateStats, checkAndAwardBadges]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (examState === "taking" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            submitExam();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examState, timeLeft, submitExam]);

  const currentTotal = qCounts.m1 * 1 + qCounts.m2 * 2 + qCounts.m3 * 3 + qCounts.m4 * 4 + qCounts.m5 * 5;
  const remainingMarks = targetTotalMarks - currentTotal;
  const isTargetMet = currentTotal === targetTotalMarks;

  const updateCount = (key: keyof typeof qCounts, delta: number) => {
    const val = parseInt(key.substring(1));
    if (delta > 0 && currentTotal + val > targetTotalMarks) return;
    setQCounts(prev => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta)
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const generateExam = async () => {
    if (examMode === "standard" && (!topic.trim() || !aiConfig || !isTargetMet)) return;
    if (examMode === "jee-advanced" && !aiConfig) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGenerating(true);

    try {
      if (!aiConfig) throw new Error("AI provider configuration is missing.");
      const systemPrompt = userProfile ? buildSystemPrompt(userProfile) : "You are an exam generator.";
      let prompt = "";

      if (examMode === "jee-advanced") {
        prompt = `You are a ruthless JEE ADVANCED Paper Setter and a Senior Teacher.
Role: Create an EXTREMELY DIFFICULT, UNIQUE, and CONCEPT-HEAVY exam paper.

🔴 PART 1: QUESTION DESIGN
Generate a JEE Advanced level practice paper with a total of ${totalMCQs} multi-concept MCQs.
DISTRIBUTION:
- Physics: ${pCount} questions
- Chemistry: ${cCount} questions
- Mathematics: ${mCount} questions
${topic ? `- Focus Topic (if any): ${topic}` : ""}

RULES:
1. **MULTI-CONCEPT:** Each question MUST combine 4-5 different concepts. (e.g., Electrostatics + Rotation + SHM + Calculus).
2. **UNIQUE:** Create BRAND NEW questions. Do not copy from past years.
3. **DIFFICULTY:** "Topper Level" - Extreme difficulty.
4. **TEACHER-LEVEL EXPLANATION:** The "steps" in the explanation MUST be extremely detailed. Show EVERY calculation, including basic arithmetic (e.g., "Now add $15 + 27 = 42$"). No skipping steps.
5. **MATH RENDERING:** ALL math must be in LaTeX format ($x^2$, $\\int$, etc.).
6. **OPTIONS:** Use LaTeX for options too. Options must be close and confusing.

🔴 PART 2: OUTPUT FORMAT (STRICT)
Return ONLY valid JSON. No text outside JSON.
Format:
{
  "questions": [
    {
      "subject": "Physics",
      "concepts": ["Concept1", "Concept2", "Concept3", "Concept4"],
      "question": "Full question text with LaTeX math like $E=mc^2$",
      "options": {
        "A": "Option A text with LaTeX",
        "B": "Option B text with LaTeX",
        "C": "Option C text with LaTeX",
        "D": "Option D text with LaTeX"
      },
      "correct_answer": "A",
      "difficulty": "Extreme",
      "explanation": {
        "steps": ["Step 1: Write all given values with units...", "Step 2: Substitution into formula...", "Step 3: Intermediate arithmetic step (e.g., $25 \\times 4 = 100$)...", "Step 4: Final calculation..."],
        "common_mistake": "Detailed explanation of where students fail...",
        "key_concept": "Deep dive into the core concept"
      }
    }
  ]
}`;
      } else {
        const structure = [
          qCounts.m1 > 0 ? `${qCounts.m1} questions of 1 mark each` : "",
          qCounts.m2 > 0 ? `${qCounts.m2} questions of 2 marks each` : "",
          qCounts.m3 > 0 ? `${qCounts.m3} questions of 3 marks each` : "",
          qCounts.m4 > 0 ? `${qCounts.m4} questions of 4 marks each (${m4CaseBased ? "ALL must be Case-Based/Source-Based" : "standard questions"})` : "",
          qCounts.m5 > 0 ? `${qCounts.m5} questions of 5 marks each` : "",
        ].filter(Boolean).join(", ");

        prompt = `Generate an exam paper for ${subject || "General"} on the topic: "${topic}".

STRICT STRUCTURE:
- Total marks: ${targetTotalMarks}
- Questions required: ${structure}
- Difficulty: ${difficulty}
- FORMAT: Use LaTeX for ALL math expressions ($x^2$).

CRITICAL: Return ONLY a JSON array with no other text. Format:
[
  {"question": "Question text with LaTeX?", "marks": 4},
  {"question": "Another question?", "marks": 2}
]

Ensure questions are syllabus-aligned and matching the requested marks exactly.`;
      }

      const response = await callAI(aiConfig, [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Could not parse exam questions from AI response.");

      let parsed: ParsedQuestion[] = [];
      try {
        const rawData = JSON.parse(jsonMatch[0]);
        if (examMode === "jee-advanced" && rawData.questions) {
          parsed = rawData.questions;
        } else {
          parsed = Array.isArray(rawData) ? rawData : (rawData.questions || []);
        }
      } catch (e) {
        console.error("JSON Parse Error:", e);
        throw new Error("AI response was not valid JSON. Please try again.");
      }

      setQuestions(parsed.map((q) => ({ 
        id: q.id || uniqueId(),
        ...q, 
        correctAnswer: q.correct_answer || q.correctAnswer || "A",
        marks: q.marks || 4,
        userAnswer: "" 
      })));
      
      if (examMode === "jee-advanced") {
        setTargetTotalMarks(parsed.length * 4);
        setTimerMinutes((parsed.length * 4).toString()); // 4 mins per question for Hard JEE
      }

      setTimeLeft(parseInt(timerMinutes) * 60);
      startTimeRef.current = Date.now();
      setExamState("taking");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("Generation Error", err?.message || "Failed to generate exam. Try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const timerColor = timeLeft < 60 ? COLORS.danger : timeLeft < 180 ? COLORS.warning : COLORS.success;

  if (!aiConfig) {
    return (
      <View style={[styles.container, { paddingTop: topPad, justifyContent: "center", alignItems: "center" }]}>
        <LinearGradient colors={["#0A0E1A", "#121828"]} style={StyleSheet.absoluteFill} />
        <Ionicons name="key" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No AI Provider</Text>
        <Text style={styles.emptyText}>Set up your API key to take exams</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0A0E1A", "#0A0E1A"]} style={StyleSheet.absoluteFill} />

      {examState === "setup" && (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Exam Generator</Text>
            <View style={styles.headerBadge}>
              <Ionicons name="school" size={16} color={COLORS.danger} />
              <Text style={styles.headerBadgeText}>AI-Powered</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            
            <View style={styles.modeToggleContainer}>
              <Pressable 
                style={[styles.modeToggleBtn, examMode === "standard" && styles.modeToggleBtnActive]} 
                onPress={() => { setExamMode("standard"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.modeToggleText, examMode === "standard" && styles.modeToggleTextActive]}>Standard</Text>
              </Pressable>
              <Pressable 
                style={[styles.modeToggleBtn, examMode === "jee-advanced" && styles.modeToggleBtnActive]} 
                onPress={() => { setExamMode("jee-advanced"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.modeToggleText, examMode === "jee-advanced" && styles.modeToggleTextActive]}>JEE Advanced</Text>
              </Pressable>
            </View>

            {examMode === "jee-advanced" ? (
              <>
                <View style={styles.masterMarksHeader}>
                  <View style={styles.masterMarksBox}>
                    <Text style={styles.masterLabel}>Total MCQs Goal</Text>
                    <View style={styles.marksInputRow}>
                      <TextInput 
                        style={styles.masterMarksInput}
                        value={totalMCQs.toString()}
                        onChangeText={(val) => {
                          const num = parseInt(val) || 0;
                          setTotalMCQs(num);
                          setPCount(0);
                          setCCount(0);
                          setMCount(0);
                        }}
                        keyboardType="numeric"
                        placeholder="75"
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <View style={styles.marksSelectorSmall}>
                        {[50, 75, 100].map(m => (
                          <Pressable 
                            key={m} 
                            style={[styles.markOptionSmall, totalMCQs === m && styles.markOptionActiveSmall]}
                            onPress={() => { setTotalMCQs(m); setPCount(0); setCCount(0); setMCount(0); }}
                          >
                            <Text style={[styles.markOptionTextSmall, totalMCQs === m && styles.markOptionTextActiveSmall]}>{m}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View style={styles.statusBox}>
                    <Text style={styles.statusLabel}>{(totalMCQs - (pCount + cCount + mCount)) === 0 ? "Perfect" : "Remaining"}</Text>
                    <Text style={[styles.statusValue, { color: (totalMCQs - (pCount + cCount + mCount)) === 0 ? COLORS.success : (totalMCQs - (pCount + cCount + mCount)) < 0 ? COLORS.danger : COLORS.warning }]}>
                      {totalMCQs - (pCount + cCount + mCount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.questionConfig}>
                  <Text style={styles.configTitle}>Subject Distribution</Text>
                  
                  {[
                    { label: "Physics", key: "p", val: pCount, set: setPCount },
                    { label: "Chemistry", key: "c", val: cCount, set: setCCount },
                    { label: "Mathematics", key: "m", val: mCount, set: setMCount }
                  ].map(sub => (
                    <View key={sub.label} style={styles.qRow}>
                      <View style={styles.qInfo}>
                        <Text style={styles.qMarks}>{sub.label}</Text>
                      </View>
                      <View style={styles.counter}>
                        <Pressable style={styles.countBtn} onPress={() => { sub.set(Math.max(0, sub.val - 1)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                          <Ionicons name="remove" size={18} color={COLORS.text} />
                        </Pressable>
                        <Text style={styles.countText}>{sub.val}</Text>
                        <Pressable 
                          style={[styles.countBtn, (pCount + cCount + mCount) >= totalMCQs && styles.countBtnDisabled]} 
                          onPress={() => { 
                            if ((pCount + cCount + mCount) < totalMCQs) {
                              sub.set(sub.val + 1);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                          }}
                          disabled={(pCount + cCount + mCount) >= totalMCQs}
                        >
                          <Ionicons name="add" size={18} color={(pCount + cCount + mCount) >= totalMCQs ? COLORS.textMuted : COLORS.text} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                <Text style={styles.label}>Topic (Optional)</Text>
                <TextInput style={styles.topicInput} placeholder="e.g. Physics Complete Syllabus" placeholderTextColor={COLORS.textMuted} value={topic} onChangeText={setTopic} />
                
                <Text style={styles.infoText}>Manual Distribution Mode: Assign questions to each subject. Total must match your MCQ goal.</Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>Subject</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {(userProfile?.subjects || ["General"]).map((s) => (
                    <Pressable key={s} style={[styles.chip, subject === s && styles.chipActive]} onPress={() => { setSubject(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                      <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Topic</Text>
                <TextInput style={styles.topicInput} placeholder="e.g. Thermodynamics" placeholderTextColor={COLORS.textMuted} value={topic} onChangeText={setTopic} />

                <View style={styles.masterMarksHeader}>
                  <View style={styles.masterMarksBox}>
                    <Text style={styles.masterLabel}>Total Marks Goal</Text>
                    <View style={styles.marksInputRow}>
                      <TextInput 
                        style={styles.masterMarksInput}
                        value={targetTotalMarks.toString()}
                        onChangeText={(val) => {
                          const num = parseInt(val) || 0;
                          setTargetTotalMarks(num);
                          setQCounts({ m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 });
                        }}
                        keyboardType="numeric"
                        placeholder="20"
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <View style={styles.marksSelectorSmall}>
                        {[20, 50, 100].map(m => (
                          <Pressable 
                            key={m} 
                            style={[styles.markOptionSmall, targetTotalMarks === m && styles.markOptionActiveSmall]}
                            onPress={() => { setTargetTotalMarks(m); setQCounts({ m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 }); }}
                          >
                            <Text style={[styles.markOptionTextSmall, targetTotalMarks === m && styles.markOptionTextActiveSmall]}>{m}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View style={styles.statusBox}>
                    <Text style={styles.statusLabel}>{remainingMarks === 0 ? "Perfect" : "Remaining"}</Text>
                    <Text style={[styles.statusValue, { color: remainingMarks === 0 ? COLORS.success : remainingMarks < 0 ? COLORS.danger : COLORS.warning }]}>
                      {remainingMarks}
                    </Text>
                  </View>
                </View>

                <View style={styles.questionConfig}>
                  <Text style={styles.configTitle}>Question Distribution</Text>
                  
                  {[1, 2, 3, 4, 5].map(m => (
                    <View key={m} style={styles.qRow}>
                      <View style={styles.qInfo}>
                        <Text style={styles.qMarks}>{m} Mark{m > 1 ? "s" : ""}</Text>
                        {m === 4 && (
                          <Pressable 
                            style={[styles.caseBtn, m4CaseBased && styles.caseBtnActive]} 
                            onPress={() => setM4CaseBased(!m4CaseBased)}
                          >
                            <Text style={[styles.caseText, m4CaseBased && styles.caseTextActive]}>
                              {m4CaseBased ? "Case-Based" : "Standard"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={styles.counter}>
                        <Pressable style={styles.countBtn} onPress={() => updateCount(`m${m}` as any, -1)}>
                          <Ionicons name="remove" size={18} color={COLORS.text} />
                        </Pressable>
                        <Text style={styles.countText}>{qCounts[`m${m}` as keyof typeof qCounts]}</Text>
                        <Pressable 
                          style={[styles.countBtn, currentTotal + m > targetTotalMarks && styles.countBtnDisabled]} 
                          onPress={() => updateCount(`m${m}` as any, 1)}
                          disabled={currentTotal + m > targetTotalMarks}
                        >
                          <Ionicons name="add" size={18} color={currentTotal + m > targetTotalMarks ? COLORS.textMuted : COLORS.text} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.settingsRow}>
              <View style={[styles.settingBox, { flex: 1 }]}>
                <Text style={styles.settingLabel}>Timer (min)</Text>
                <TextInput style={styles.settingInput} value={timerMinutes} onChangeText={setTimerMinutes} keyboardType="numeric" placeholder="15" placeholderTextColor={COLORS.textMuted} />
              </View>
              <View style={[styles.settingBox, { flex: 2 }]}>
                <Text style={styles.settingLabel}>Difficulty</Text>
                <View style={styles.difficultyInner}>
                  {(["Easy", "Medium", "Hard"] as const).map((d) => (
                    <Pressable key={d} style={[styles.diffBtn, difficulty === d && styles.diffBtnActive]} onPress={() => setDifficulty(d)}>
                      <Text style={[styles.diffText, difficulty === d && styles.diffTextActive]}>{d[0]}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Pressable 
              style={[styles.generateBtn, (examMode === "standard" && (!topic.trim() || !isTargetMet) || (examMode === "jee-advanced" && !isJEEValid) || isGenerating) && styles.generateBtnDisabled]} 
              onPress={generateExam} 
              disabled={(examMode === "standard" && (!topic.trim() || !isTargetMet)) || (examMode === "jee-advanced" && !isJEEValid) || isGenerating}
            >
              <LinearGradient colors={isJEEValid || (topic.trim() && isTargetMet) ? ["#FF4D6A", "#FF6B35"] : ["#2A3560", "#2A3560"]} style={styles.generateBtnGradient}>
                {isGenerating ? <ActivityIndicator color={COLORS.white} /> : (
                  <>
                    <Ionicons name="flash" size={20} color={COLORS.white} />
                    <Text style={styles.generateBtnText}>
                      {examMode === "standard" && !isTargetMet ? `Add ${remainingMarks} marks to start` : 
                       examMode === "jee-advanced" && !isJEEValid ? `Distribute ${totalMCQs - (pCount + cCount + mCount)} more` :
                       "Generate AI Exam"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent Results</Text>
            </View>
          </ScrollView>
        </>
      )}

      {examState === "taking" && (
        <>
          <View style={styles.timerTopContainer}>
            <View style={[styles.timerBox, { backgroundColor: timerColor + "20", borderColor: timerColor }]}>
              <Ionicons name="timer" size={18} color={timerColor} />
              <Text style={[styles.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
            </View>
          </View>

          <View style={styles.examSubHeader}>
            <Text style={styles.examHeaderTitle} numberOfLines={1}>{topic}</Text>
            <Text style={styles.examHeaderSub}>{subject} · {questions.length} questions · {targetTotalMarks} marks</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            {questions.map((q, i) => (
              <View key={i} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <View style={styles.questionNum}>
                    <Text style={styles.questionNumText}>Q{i + 1}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {q.subject && (
                      <View style={[styles.badge, { backgroundColor: COLORS.primaryGlow }]}>
                        <Text style={[styles.badgeText, { color: COLORS.primary }]}>{q.subject}</Text>
                      </View>
                    )}
                    <Text style={styles.questionMarks}>{q.marks} mark{q.marks > 1 ? "s" : ""}</Text>
                  </View>
                </View>
                
                {q.concepts && q.concepts.length > 0 && (
                  <View style={styles.conceptsRow}>
                    {q.concepts.map((c, ci) => (
                      <View key={ci} style={styles.conceptTag}>
                        <Text style={styles.conceptTagText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <MathRender content={q.question} style={{ marginBottom: 12 }} fontSize={15} />
                
                {q.options ? (
                  <View style={styles.optionsContainer}>
                    {(Object.entries(q.options) as [string, string][]).map(([key, text]) => (
                      <Pressable 
                        key={key} 
                        style={[styles.optionItem, q.userAnswer === key && styles.optionItemActive]} 
                        onPress={() => {
                          setQuestions((prev) => prev.map((pq, pi) => pi === i ? { ...pq, userAnswer: key } : pq));
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <View style={[styles.optionKey, q.userAnswer === key && styles.optionKeyActive]}>
                          <Text style={[styles.optionKeyText, q.userAnswer === key && styles.optionKeyTextActive]}>{key}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <MathRender 
                            content={text} 
                            style={[styles.qOptionText, q.userAnswer === key && styles.qOptionTextActive]} 
                            textColor={q.userAnswer === key ? COLORS.primary : COLORS.text}
                            fontSize={14}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <TextInput
                    style={styles.answerInput}
                    placeholder="Type your answer here..."
                    placeholderTextColor={COLORS.textMuted}
                    value={q.userAnswer}
                    onChangeText={(t) => setQuestions((prev) => prev.map((pq, pi) => pi === i ? { ...pq, userAnswer: t } : pq))}
                    multiline
                    textAlignVertical="top"
                  />
                )}
              </View>
            ))}

            <Pressable style={styles.submitBtn} onPress={submitExam}>
              <LinearGradient colors={["#FF4D6A", "#FF6B35"]} style={styles.submitBtnGradient}>
                <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
                <Text style={styles.submitBtnText}>Submit Exam</Text>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </>
      )}

      {examState === "evaluating" && (
        <View style={styles.evaluatingContainer}>
          <LinearGradient colors={COLORS.gradientPrimary} style={styles.evalIcon}>
            <ActivityIndicator color={COLORS.white} size="large" />
          </LinearGradient>
          <Text style={styles.evalTitle}>AI is Evaluating...</Text>
          <Text style={styles.evalText}>Analyzing your answers and calculating scores</Text>
        </View>
      )}

      {examState === "done" && result && (
        <>
          <View style={styles.header}>
            <Pressable onPress={() => { setExamState("setup"); setResult(null); setQuestions([]); setTopic(""); }} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Exam Results</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
            <View style={styles.scoreCard}>
              <LinearGradient
                colors={(result?.scoredMarks || 0) / (result?.totalMarks || 1) >= 0.8 ? ["#22D46E20", "#22D46E10"] : (result?.scoredMarks || 0) / (result?.totalMarks || 1) >= 0.5 ? ["#FFB34020", "#FFB34010"] : ["#FF4D6A20", "#FF4D6A10"]}
                style={styles.scoreCardGradient}
              >
                <Text style={styles.scoreLabel}>{result?.topic}</Text>
                <Text style={[styles.scoreValue, {
                  color: (result?.scoredMarks || 0) / (result?.totalMarks || 1) >= 0.8 ? COLORS.success : (result?.scoredMarks || 0) / (result?.totalMarks || 1) >= 0.5 ? COLORS.warning : COLORS.danger
                }]}>
                  {result?.scoredMarks}/{result?.totalMarks}
                </Text>
                <Text style={styles.scorePercent}>
                  {Math.round(((result?.scoredMarks || 0) / (result?.totalMarks || 1)) * 100)}% · {result?.subject}
                </Text>
                <Text style={styles.scoreTime}>
                  Completed in {Math.floor((result?.timeSpent || 0) / 60)}m {(result?.timeSpent || 0) % 60}s
                </Text>
              </LinearGradient>
            </View>

            {examMode === "jee-advanced" && result?.questions && (
              <View style={styles.subjectBreakdown}>
                <Text style={styles.breakdownTitle}>Subject Breakdown</Text>
                <View style={styles.breakdownRow}>
                  {["Physics", "Chemistry", "Mathematics"].map(sub => {
                    const subQuestions = (result?.questions || []).filter(q => q.subject === sub);
                    const subScored = subQuestions.reduce((sum, q) => sum + (q.score || 0), 0);
                    const subTotal = subQuestions.length * 4;
                    const subPercent = subTotal > 0 ? Math.round((subScored / subTotal) * 100) : 0;
                    return (
                      <View key={sub} style={styles.subCard}>
                        <Text style={styles.subLabel}>{sub}</Text>
                        <Text style={[styles.subValue, { color: subScored > 0 ? COLORS.success : subScored < 0 ? COLORS.danger : COLORS.text }]}>
                          {subScored}/{subTotal}
                        </Text>
                        <Text style={styles.subPercent}>{subPercent}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {(result?.questions || []).map((q, i) => {
              const pct = (q.maxScore || 0) > 0 ? (q.score || 0) / (q.maxScore || 1) : 0;
              const color = pct >= 0.8 ? COLORS.success : pct >= 0.5 ? COLORS.warning : COLORS.danger;
              return (
                <View key={i} style={[styles.resultQuestion, { borderColor: color + "30" }]}>
                  <View style={styles.resultQuestionHeader}>
                    <View>
                      <Text style={styles.resultQuestionNum}>Q{i + 1}</Text>
                      {q.subject && (
                        <Text style={[styles.resultSubLabel, { color: COLORS.textMuted }]}>{q.subject}</Text>
                      )}
                    </View>
                    <Text style={[styles.resultQuestionScore, { color }]}>
                      {(q.score || 0) > 0 ? `+${q.score}` : q.score}/{q.maxScore}
                    </Text>
                  </View>
                  
                  {q.concepts && q.concepts.length > 0 && (
                    <View style={styles.conceptsRow}>
                      {q.concepts.map((c, ci) => (
                        <View key={ci} style={styles.conceptTag}>
                          <Text style={styles.conceptTagText}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <MathRender content={q.question} style={{ marginBottom: 10 }} fontSize={14} />
                  <View style={styles.resultAnswerSection}>
                    <Text style={styles.resultAnswerLabel}>Your Answer</Text>
                    <MathRender content={q.userAnswer || "(No answer)"} style={styles.resultAnswerText} fontSize={13} textColor={COLORS.textSecondary} />
                  </View>
                  <View style={[styles.resultCorrectSection, { backgroundColor: color + "10" }]}>
                    <Text style={[styles.resultAnswerLabel, { color }]}>Correct Answer</Text>
                    <MathRender content={q.correctAnswer || ""} style={styles.resultAnswerText} fontSize={13} textColor={COLORS.text} />
                  </View>
                  
                  {q.explanation && (
                    <View style={styles.explanationSection}>
                      <View style={styles.explanationHeader}>
                        <Ionicons name="bulb" size={16} color={COLORS.warning} />
                        <Text style={styles.explanationHeaderTitle}>Detailed Solution</Text>
                      </View>
                      
                      {typeof q.explanation === "object" && q.explanation !== null ? (
                        <View style={styles.structuredExpl}>
                          <View style={styles.explBlock}>
                            <Text style={styles.explSubTitle}>Key Concept</Text>
                            <MathRender content={(q.explanation as Explanation).key_concept} style={styles.explText} fontSize={13} textColor={COLORS.textSecondary} />
                          </View>
                          
                          <View style={styles.explBlock}>
                            <Text style={styles.explSubTitle}>Step-by-Step Solution</Text>
                            {(q.explanation as Explanation).steps.map((step: string, si: number) => (
                              <View key={si} style={styles.stepRow}>
                                <Text style={styles.stepNum}>{si + 1}.</Text>
                                <MathRender content={step} style={{ flex: 1 }} fontSize={13} textColor={COLORS.textSecondary} />
                              </View>
                            ))}
                          </View>
                          
                          <View style={[styles.explBlock, styles.pitfallBlock]}>
                            <Text style={[styles.explSubTitle, { color: COLORS.danger }]}>Common Pitfalls</Text>
                            <MathRender content={(q.explanation as Explanation).common_mistake} style={styles.explText} fontSize={13} textColor={COLORS.textSecondary} />
                          </View>
                        </View>
                      ) : (
                        <MathRender content={String(q.explanation || "No explanation available")} style={styles.explanationText} fontSize={12} textColor={COLORS.textMuted} />
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            <Pressable style={styles.newExamBtn} onPress={() => { setExamState("setup"); setResult(null); setQuestions([]); setTopic(""); }}>
              <LinearGradient colors={COLORS.gradientPrimary} style={styles.newExamBtnGradient}>
                <Ionicons name="add-circle" size={20} color={COLORS.white} />
                <Text style={styles.newExamBtnText}>New Exam</Text>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text },
  headerBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.dangerGlow, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  headerBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: COLORS.danger },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  label: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  chipActive: { backgroundColor: COLORS.primaryGlow, borderColor: COLORS.primary },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary },
  topicInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontFamily: "Poppins_400Regular", fontSize: 15, color: COLORS.text, marginBottom: 16 },

  settingsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  settingBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12, alignItems: "center" },
  settingLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  settingInput: { fontFamily: "Poppins_700Bold", fontSize: 20, color: COLORS.text, textAlign: "center", minWidth: 40 },

  optionRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  optionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  optionBtnActive: { backgroundColor: COLORS.dangerGlow, borderColor: COLORS.danger },
  optionText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: COLORS.textSecondary },
  optionTextActive: { color: COLORS.danger },

  generateBtn: { borderRadius: 16, overflow: "hidden", marginBottom: 24 },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  generateBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.white },

  recentHeader: { marginTop: 4 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.text, marginBottom: 12 },

  examHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  timerTopContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border + "40" },
  examSubHeader: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.surface + "50" },
  examHeaderTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.text, textAlign: "center" },
  examHeaderSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  timerText: { fontFamily: "Poppins_700Bold", fontSize: 18 },

  questionCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 16, minHeight: 120 },
  questionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  questionNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primaryGlow, alignItems: "center", justifyContent: "center" },
  questionNumText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: COLORS.primary },
  questionMarks: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: COLORS.textSecondary },
  questionText: { marginBottom: 16 },
  answerInput: { backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.text, minHeight: 100 },

  submitBtn: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  submitBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  submitBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.white },

  evaluatingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  evalIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  evalTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text },
  evalText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },

  scoreCard: { borderRadius: 20, overflow: "hidden", marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  scoreCardGradient: { padding: 24, alignItems: "center", gap: 8 },
  scoreLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.text },
  scoreValue: { fontFamily: "Poppins_700Bold", fontSize: 48 },
  scorePercent: { fontFamily: "Poppins_500Medium", fontSize: 15, color: COLORS.textSecondary },
  scoreTime: { fontFamily: "Poppins_400Regular", fontSize: 12, color: COLORS.textMuted },

  resultQuestion: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12, minHeight: 100 },
  resultQuestionHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  resultQuestionNum: { fontFamily: "Poppins_700Bold", fontSize: 14, color: COLORS.textSecondary },
  resultQuestionScore: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  resultQuestionText: { marginBottom: 12 },
  resultAnswerSection: { marginBottom: 8 },
  resultAnswerLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  resultAnswerText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  resultCorrectSection: { borderRadius: 10, padding: 10, marginBottom: 8 },
  explanationSection: { marginTop: 12, backgroundColor: COLORS.bgSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  explanationHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border + "40", paddingBottom: 6 },
  explanationHeaderTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: COLORS.warning },
  explanationText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  
  structuredExpl: { gap: 12 },
  explBlock: { gap: 4 },
  explSubTitle: { fontFamily: "Poppins_700Bold", fontSize: 11, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  explText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  stepRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  stepNum: { fontFamily: "Poppins_700Bold", fontSize: 13, color: COLORS.primary, minWidth: 20 },
  stepText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  pitfallBlock: { backgroundColor: COLORS.danger + "08", padding: 8, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.danger },

  newExamBtn: { borderRadius: 16, overflow: "hidden", marginTop: 8, marginBottom: 20 },
  newExamBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  newExamBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.white },

  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text, marginTop: 16 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary },

  masterMarksHeader: { flexDirection: "row", gap: 12, marginBottom: 20 },
  masterMarksBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  masterLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: COLORS.textMuted, marginBottom: 8, textTransform: "uppercase" },
  marksSelector: { flexDirection: "row", gap: 6 },
  markOption: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.bg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  markOptionActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  markOptionText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: COLORS.textSecondary },
  markOptionTextActive: { color: COLORS.white },

  marksInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  masterMarksInput: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, fontFamily: "Poppins_700Bold", fontSize: 16, color: COLORS.text, width: 60, textAlign: "center" },
  marksSelectorSmall: { flexDirection: "row", gap: 4, flex: 1 },
  markOptionSmall: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: COLORS.bg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  markOptionActiveSmall: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  markOptionTextSmall: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: COLORS.textSecondary },
  markOptionTextActiveSmall: { color: COLORS.white },
  
  statusBox: { width: 80, backgroundColor: COLORS.surface, borderRadius: 16, padding: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  statusLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 2 },
  statusValue: { fontFamily: "Poppins_700Bold", fontSize: 24 },

  questionConfig: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  configTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: COLORS.text, marginBottom: 16 },
  qRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border + "40" },
  qInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  qMarks: { fontFamily: "Poppins_500Medium", fontSize: 14, color: COLORS.text },
  caseBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  caseBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  caseText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: COLORS.textMuted },
  caseTextActive: { color: COLORS.white },
  
  counter: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.bg, borderRadius: 10, padding: 4 },
  countBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  countBtnDisabled: { opacity: 0.3 },
  countText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: COLORS.text, minWidth: 20, textAlign: "center" },
  
  difficultyInner: { flexDirection: "row", gap: 4, marginTop: 4 },
  diffBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.bg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  diffBtnActive: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  diffText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: COLORS.textSecondary },
  diffTextActive: { color: COLORS.white },

  modeToggleContainer: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  modeToggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  modeToggleBtnActive: { backgroundColor: COLORS.bg },
  modeToggleText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: COLORS.textMuted },
  modeToggleTextActive: { color: COLORS.primary },

  mcqSelector: { flexDirection: "row", gap: 10, marginBottom: 16 },
  mcqOption: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  mcqOptionActive: { backgroundColor: COLORS.primaryGlow, borderColor: COLORS.primary },
  mcqOptionText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.textSecondary },
  mcqOptionTextActive: { color: COLORS.primary },

  infoText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: COLORS.textMuted, marginBottom: 20, fontStyle: "italic", lineHeight: 18 },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },

  conceptsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  conceptTag: { backgroundColor: COLORS.bgSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
  conceptTagText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: COLORS.textMuted },

  optionsContainer: { gap: 10, marginTop: 12 },
  optionItem: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, gap: 12 },
  optionItemActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryGlow + "10" },
  optionKey: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  optionKeyActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionKeyText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: COLORS.textSecondary },
  optionKeyTextActive: { color: COLORS.white },
  qOptionText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: COLORS.text, flex: 1 },
  qOptionTextActive: { color: COLORS.primary, fontFamily: "Poppins_600SemiBold" },

  subjectBreakdown: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  breakdownTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 12 },
  breakdownRow: { flexDirection: "row", gap: 8 },
  subCard: { flex: 1, backgroundColor: COLORS.bgSecondary, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  subLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: COLORS.textMuted, marginBottom: 4 },
  subValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: COLORS.text },
  subPercent: { fontFamily: "Poppins_500Medium", fontSize: 9, color: COLORS.textMuted },
  resultSubLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, marginTop: 2 },
});
