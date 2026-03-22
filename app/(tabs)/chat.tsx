import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Keyboard,
  Linking,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApp } from "@/contexts/AppContext";
import COLORS from "@/constants/colors";
import { callAI, buildSystemPrompt } from "@/lib/ai";
import { ChatMessage } from "@/lib/storage";
import { formatInlineMarkdown } from "@/lib/markdown";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

let msgCounter = 0;
function uniqueId() {
  msgCounter++;
  return `msg-${Date.now()}-${msgCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleContainer, styles.bubbleContainerLeft]}>
      <View style={[styles.bubble, styles.bubbleLeft, styles.sciFiBubble]}>
        <View style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { opacity: 0.4 + i * 0.2 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);
  
  // Extract links from the message if it's from assistant and has a Sources section
  const hasSources = !isUser && message.content.includes("### SOURCES:");
  const parts = message.content.split("### SOURCES:");
  const mainContent = parts[0].trim();
  const sourcesContent = parts[1] || "";
  
  const formattedParts = formatInlineMarkdown(mainContent);

  const handleLinkPress = (url: string) => {
    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  const renderSources = () => {
    if (!sourcesContent) return null;
    const sourceLines = sourcesContent.trim().split("\n").filter(line => line.includes("http"));
    
    return (
      <View style={styles.sourcesContainer}>
        <Pressable 
          onPress={() => {
            setShowSources(!showSources);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }} 
          style={styles.sourcesBtn}
        >
          <Ionicons name={showSources ? "chevron-up" : "link"} size={14} color={COLORS.primary} />
          <Text style={styles.sourcesBtnText}>{showSources ? "Hide Sources" : "Show Sources & Links"}</Text>
        </Pressable>
        
        {showSources && (
          <View style={styles.sourcesList}>
            {sourceLines.map((line, idx) => {
              const urlMatch = line.match(/https?:\/\/[^\s]+/) || [""];
              const url = urlMatch[0];
              const platformMatch = line.match(/\[(.*?)\]/) || ["", "Source"];
              const platform = platformMatch[1];

              return (
                <Pressable key={idx} onPress={() => handleLinkPress(url)} style={styles.sourceItem}>
                  <Ionicons name="globe-outline" size={12} color={COLORS.primary} />
                  <Text style={styles.sourcePlatform}>{platform}: </Text>
                  <Text style={styles.sourceUrl} numberOfLines={1}>{url}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.bubbleContainer, isUser ? styles.bubbleContainerRight : styles.bubbleContainerLeft]}>
      {!isUser && (
        <View style={styles.avatarBg}>
          <Ionicons name="sparkles" size={14} color={COLORS.primary} />
        </View>
      )}
      <View style={[
        styles.bubble, 
        isUser ? styles.bubbleRight : styles.bubbleLeft,
        !isUser && styles.sciFiBubble
      ]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextRight : styles.bubbleTextLeft]}>
          {formattedParts && formattedParts.length > 0 ? (
            formattedParts.map((part, i) => {
              if (typeof part === "string") return <Text key={i}>{part}</Text>;
              if (part.type === "bold") {
                return (
                  <Text key={i} style={[styles.boldText, isUser ? styles.boldTextRight : styles.boldTextLeft]}>
                    {part.content}
                  </Text>
                );
              }
              return <Text key={i}>{part.content}</Text>;
            })
          ) : (
            <Text>{mainContent}</Text>
          )}
        </Text>
        
        {!isUser && hasSources && renderSources()}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { 
    aiConfig, userProfile, chatHistory, setChatHistory, 
    incrementStat, checkAndAwardBadges, updateStats,
    chatSessions, currentSessionId, createNewChat, switchChat, deleteChat
  } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    setMessages(chatHistory);
  }, [chatHistory]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !aiConfig) return;
    const text = input.trim();
    setInput("");
    inputRef.current?.focus();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If no session exists, create one
    if (!currentSessionId) {
      await createNewChat(text.substring(0, 30));
    }

    const currentMessages = [...messages];
    const userMsg: ChatMessage = {
      id: uniqueId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setIsStreaming(true);
    
    if (isSearchMode) {
      setIsSearching(true);
    } else {
      setShowTyping(true);
    }

    try {
      await incrementStat("chatMessages");

      const systemPrompt = userProfile ? buildSystemPrompt(userProfile) : "You are a helpful study assistant.";
      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      let fullContent = "";
      let assistantAdded = false;
      const assistantId = uniqueId();

      await callAI(aiConfig, apiMessages, (chunk) => {
        fullContent += chunk;
        if (!assistantAdded) {
          setShowTyping(false);
          setIsSearching(false);
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: "assistant", content: fullContent, timestamp: new Date().toISOString() },
          ]);
          assistantAdded = true;
        } else {
          setMessages((prev) => {
            const up = [...prev];
            up[up.length - 1] = { ...up[up.length - 1], content: fullContent };
            return up;
          });
        }
      }, isSearchMode);

      const finalMessages = [
        ...updated,
        { id: assistantId, role: "assistant" as const, content: fullContent, timestamp: new Date().toISOString() },
      ];
      await setChatHistory(finalMessages);
      await checkAndAwardBadges();

      const hour = new Date().getHours();
      if (hour < 8) await updateStats({ earlyBirdSessions: 1 });
      if (hour >= 22) await updateStats({ nightOwlSessions: 1 });
    } catch (err: any) {
      setShowTyping(false);
      setIsSearching(false);
      const errMsg: ChatMessage = {
        id: uniqueId(),
        role: "assistant",
        content: `Error: ${err?.message || "Something went wrong. Check your API key and try again."}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
      setIsSearching(false);
    }
  }, [input, isStreaming, aiConfig, messages, userProfile, currentSessionId, createNewChat, incrementStat, setChatHistory, checkAndAwardBadges, updateStats, isSearchMode]);

  const handleNewChat = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newId = await createNewChat();
      setMessages([]); // Immediately clear local messages
      setShowSidebar(false);
      console.log("New chat created:", newId);
    } catch (err) {
      console.error("Failed to create new chat:", err);
    }
  };

  const handleSwitchChat = async (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await switchChat(id);
      setShowSidebar(false);
    } catch (err) {
      console.error("Failed to switch chat:", err);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await deleteChat(id);
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const reversedMessages = [...messages].reverse();

  if (!aiConfig) {
    return (
      <View style={[styles.container, { paddingTop: topPad, justifyContent: "center", alignItems: "center" }]}>
        <LinearGradient colors={["#0A0E1A", "#121828"]} style={StyleSheet.absoluteFill} />
        <Ionicons name="key" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>No AI Provider</Text>
        <Text style={styles.emptyText}>Set up your API key to start chatting</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0A0E1A", "#0A0E1A"]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => setShowSidebar(true)} style={styles.menuBtn}>
              <Ionicons name="menu" size={24} color={COLORS.text} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>AI Assistant</Text>
              <Text style={styles.headerSub}>Syllabus-aligned responses</Text>
            </View>
          </View>
          <Pressable onPress={handleNewChat} style={styles.clearBtn}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <LinearGradient colors={COLORS.gradientPrimary} style={styles.emptyIcon}>
                <Ionicons name="chatbubbles" size={36} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Ask Me Anything</Text>
              <Text style={styles.emptyText}>
                I&apos;m aligned to {userProfile?.board || "your curriculum"} for {userProfile?.grade || "your grade"}
              </Text>
              <View style={styles.suggestionsContainer}>
                {[
                  "Explain Newton's laws of motion",
                  "Help me with quadratic equations",
                  "What is photosynthesis?",
                  "Summarize the causes of WW1",
                ].map((s) => (
                  <Pressable
                    key={s}
                    style={styles.suggestion}
                    onPress={() => { setInput(s); inputRef.current?.focus(); }}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={reversedMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageBubble message={item} />}
              inverted={messages.length > 0}
              ListHeaderComponent={
                isSearching ? (
                  <View style={styles.searchingStatus}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.searchingText}>Searching Google for real-time info...</Text>
                  </View>
                ) : showTyping ? <TypingIndicator /> : null
              }
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={[
          styles.inputContainer, 
          { 
            paddingBottom: keyboardVisible 
              ? (Platform.OS === "ios" ? 10 : 10) 
              : (Platform.OS === "android" ? 110 : insets.bottom + 90),
          }
        ]}>
          <View style={styles.inputRow}>
            {/* 🌐 Search Toggle on the LEFT side */}
            <Pressable 
              onPress={() => {
                setIsSearchMode(!isSearchMode);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }} 
              style={[
                styles.leftActionBtn, 
                isSearchMode && styles.leftActionBtnActive
              ]}
            >
              <Ionicons 
                name={isSearchMode ? "globe" : "globe-outline"} 
                size={22} 
                color={isSearchMode ? COLORS.primary : COLORS.textMuted} 
              />
            </Pressable>

            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={isSearchMode ? "Ask Google..." : "Ask anything..."}
              placeholderTextColor={COLORS.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              blurOnSubmit={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              textAlignVertical="center"
            />

            <Pressable
              style={[styles.sendBtn, (!input.trim() || isStreaming) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="send" size={20} color={COLORS.white} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Sidebar Overlay */}
      {showSidebar && (
        <View style={styles.sidebarOverlay}>
          <Pressable style={styles.overlayPressable} onPress={() => setShowSidebar(false)} />
          <View style={[styles.sidebar, { paddingTop: topPad }]}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Chat History</Text>
              <Pressable onPress={() => setShowSidebar(false)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <Pressable style={styles.newChatSidebarBtn} onPress={handleNewChat}>
              <Ionicons name="add" size={20} color={COLORS.white} />
              <Text style={styles.newChatSidebarText}>New Chat</Text>
            </Pressable>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
              {chatSessions && chatSessions.length > 0 ? (
                chatSessions.map((session) => (
                  <View key={session.id} style={styles.sessionItemContainer}>
                    <Pressable 
                      onPress={() => handleSwitchChat(session.id)}
                      style={[
                        styles.sessionItem,
                        currentSessionId === session.id && styles.sessionItemActive
                      ]}
                    >
                      <Ionicons 
                        name="chatbubble-outline" 
                        size={18} 
                        color={currentSessionId === session.id ? COLORS.primary : COLORS.textSecondary} 
                      />
                      <Text 
                        style={[
                          styles.sessionItemText,
                          currentSessionId === session.id && styles.sessionItemTextActive
                        ]}
                        numberOfLines={1}
                      >
                        {session.title || "New Chat"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteChat(session.id)} style={styles.sessionDeleteBtn}>
                      <Ionicons name="trash-outline" size={16} color={COLORS.danger + "80"} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: COLORS.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>
                    No recent chats
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: COLORS.text },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: COLORS.textSecondary },
  clearBtn: { padding: 8 },

  searchingStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    alignSelf: "center",
  },
  searchingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: COLORS.text },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  suggestionsContainer: { width: "100%", gap: 8, marginTop: 16 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  suggestionText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: COLORS.textSecondary, flex: 1 },

  bubbleContainer: { marginVertical: 4, maxWidth: "85%", flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleContainerLeft: { alignSelf: "flex-start" },
  bubbleContainerRight: { alignSelf: "flex-end" },
  avatarBg: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primaryGlow, alignItems: "center", justifyContent: "center" },
  bubble: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "100%" },
  bubbleLeft: { backgroundColor: COLORS.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  bubbleRight: { borderBottomRightRadius: 4, backgroundColor: COLORS.primary },
  sciFiBubble: {
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  bubbleText: { fontFamily: "Poppins_400Regular", fontSize: 15, lineHeight: 22 },
  bubbleTextLeft: { color: COLORS.text },
  bubbleTextRight: { color: COLORS.white },
  boldText: { fontFamily: "Poppins_700Bold" },
  boldTextLeft: { color: COLORS.primary },
  boldTextRight: { color: COLORS.white },

  typingDots: { flexDirection: "row", gap: 4, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textSecondary },

  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
  },
  inputRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 120,
    minHeight: 48,
  },
  leftActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  leftActionBtnActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { 
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },

  sourcesContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "40",
  },
  sourcesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  sourcesBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: COLORS.primary,
  },
  sourcesList: {
    marginTop: 8,
    gap: 6,
  },
  sourceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg + "80",
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  sourcePlatform: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: COLORS.text,
  },
  sourceUrl: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: COLORS.primary,
    textDecorationLine: "underline",
    flex: 1,
  },

  // Sidebar Styles
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 1000,
  },
  overlayPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  sidebar: {
    width: SCREEN_WIDTH * 0.8,
    height: "100%",
    backgroundColor: COLORS.bgSecondary,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: 20,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 20,
  },
  sidebarTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: COLORS.text,
  },
  newChatSidebarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  newChatSidebarText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: COLORS.white,
  },
  sessionItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sessionItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sessionItemActive: {
    backgroundColor: COLORS.primaryGlow,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  sessionItemText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  sessionItemTextActive: {
    color: COLORS.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  sessionDeleteBtn: {
    padding: 10,
  },
});