import { Platform } from "react-native";
import { fetch } from "expo/fetch";
import { AIConfig } from "./storage";
import { validateAPIKeyFormat, maskAPIKey, sanitizeErrorMessage } from "./encryption";
import { logError, retryWithBackoff, handleAPIError, parseErrorResponse } from "./error-handler";

export interface AIModel {
  id: string;
  displayName: string;
  description: string;
}

export const AI_PROVIDERS = {
  openai: {
    name: "OpenAI",
    icon: "logo-github",
    color: "#10A37F",
    status: "coming_soon",
    models: [
      { id: "gpt-5.3-instant", displayName: "GPT-5.3 Instant", description: "Latest flagship, human-like tone & reasoning" },
      { id: "gpt-5.2-pro", displayName: "GPT-5.2 Pro", description: "Smarter, more precise flagship" },
      { id: "gpt-5.2", displayName: "GPT-5.2", description: "Standard flagship for agentic tasks" },
      { id: "o3", displayName: "OpenAI o3", description: "Deep reasoning for complex science/math" },
      { id: "gpt-5.3-codex", displayName: "GPT-5.3 Codex", description: "Specialized for advanced coding" },
      { id: "gpt-5-mini", displayName: "GPT-5 Mini", description: "Cost-efficient, fast performance" },
      { id: "gpt-5-nano", displayName: "GPT-5 Nano", description: "Ultra-lightweight on-device tasks" },
      { id: "gpt-4o", displayName: "GPT-4o", description: "Legacy balanced performance" },
    ] as AIModel[],
  },
  gemini: {
    name: "Google Gemini",
    icon: "logo-google",
    color: "#4285F4",
    status: "coming_soon",
    models: [
      { id: "gemini-3.1-pro", displayName: "Gemini 3.1 Pro", description: "Most intelligent flagship model" },
      { id: "gemini-3-deep-think", displayName: "Gemini 3 Deep Think", description: "Extreme reasoning & math focus" },
      { id: "gemini-3.1-flash", displayName: "Gemini 3.1 Flash", description: "Fast, efficient, long context" },
      { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite", description: "Ultra-fast, low latency responses" },
      { id: "gemini-2.5-flash-live", displayName: "Gemini 2.5 Flash Live", description: "Real-time bidirectional response" },
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", description: "Stable legacy flagship" },
      { id: "nano-banana-2", displayName: "Nano Banana 2", description: "SOTA Image generation & editing" },
    ] as AIModel[],
  },
  groq: {
    name: "Groq",
    icon: "flash",
    color: "#F55036",
    status: "active",
    models: [
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", displayName: "Llama 4 Scout (17B)", description: "Latest Flagship (Fast)" },
      { id: "meta-llama/llama-4-tiny-3b-instruct", displayName: "Llama 4 Tiny (3B)", description: "Ultra-Edge Model" },
      { id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", description: "Balanced / Production" },
      { id: "llama-3.3-70b-specdec", displayName: "Llama 3.3 70B SpecDec", description: "Speculative (High Speed)" },
      { id: "llama-3.1-405b-reasoning", displayName: "Llama 3.1 405B", description: "Heavy Research Grade" },
      { id: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B", description: "Legacy Speed King" },
      { id: "openai/gpt-oss-120b", displayName: "GPT-OSS 120B", description: "High-Reasoning Open Weight" },
      { id: "openai/gpt-oss-20b", displayName: "GPT-OSS 20B", description: "Efficient Reasoning" },
      { id: "mistralai/mistral-large-v26", displayName: "Mistral Large v26", description: "Enterprise Standard" },
      { id: "mixtral-8x22b-latest", displayName: "Mixtral 8x22B", description: "Context Window Specialist" },
      { id: "google/gemma-3-27b-it", displayName: "Gemma 3 27B", description: "Google's Latest Open Model" },
      { id: "google/gemma-3-2b-it", displayName: "Gemma 3 2B", description: "Super Lightweight" },
      { id: "qwen/qwen3-72b-instruct", displayName: "Qwen 3 72B", description: "Logic & Multilingual" },
      { id: "qwen/qwen-qwq-32b", displayName: "Qwen QwQ 32B", description: "Thinking Model (CoT)" },
      { id: "qwen/qwen-2.5-coder-72b", displayName: "Qwen 2.5 Coder 72B", description: "Heavy Coding Tasks" },
      { id: "deepseek/deepseek-v3-chat", displayName: "DeepSeek V3 Chat", description: "Analytical Chat" },
      { id: "deepseek/deepseek-v3-70b", displayName: "DeepSeek V3 70B", description: "Coding & Reasoning" },
      { id: "microsoft/phi-4-mini-instruct", displayName: "Phi-4 Mini", description: "Small but Mighty Logic" },
      { id: "nousresearch/hermes-4-llama-4-8b", displayName: "Hermes 4 Llama 4 8B", description: "Fine-tuned for Roleplay/Chat" },
      { id: "liquid/lfm-70b-v1", displayName: "Liquid LFM 70B", description: "Liquid Neural Network (Fast)" },
      { id: "cohere/command-r-02-2026", displayName: "Command R (02-2026)", description: "RAG & Tool Use Specialist" },
      { id: "01-ai/yi-lightning-v2", displayName: "Yi Lightning v2", description: "Speed-optimized Creative Text" },
      { id: "tii/falcon-3-40b-instruct", displayName: "Falcon 3 40B", description: "Structured Output Expert" },
      { id: "moonshotai/kimi-k2-instruct-0905", displayName: "Kimi K2", description: "Massive 256k Context" },
      { id: "llama-guard-4-11b", displayName: "Llama Guard 4 11B", description: "Input/Output Safety Filter" },
    ] as AIModel[],
  },
  anthropic: {
    name: "Anthropic Claude",
    icon: "sparkles",
    color: "#CC785C",
    status: "coming_soon",
    models: [
      { id: "claude-3-5-opus-20240229", displayName: "Claude Opus 4.6", description: "Top intelligence, best for coding" },
      { id: "claude-3-5-sonnet-20241022", displayName: "Claude Sonnet 4.6", description: "Perfect balance of speed & smarts" },
      { id: "claude-3-5-haiku-20241022", displayName: "Claude Haiku 4.5", description: "Near-frontier smarts, ultra fast" },
      { id: "claude-4-opus-thinking", displayName: "Claude 4 Opus (Thinking)", description: "Deep reasoning with extended logic" },
      { id: "claude-4-6-adaptive", displayName: "Claude 4.6 Adaptive", description: "Adjusts reasoning based on task" },
    ] as AIModel[],
  },
};

export type ProviderKey = keyof typeof AI_PROVIDERS;

async function callOpenAI(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
  const stream = !!onChunk;
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      const friendly = parseErrorResponse(new Error(errorMsg));
      throw new Error(friendly.message);
    }

    if (!stream) {
      const data = await response.json() as { choices: { message: { content: string } }[] };
      const content = data.choices[0]?.message?.content || "";
      if (!content) throw new Error("Empty response from OpenAI");
      return content;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as { choices: { delta: { content?: string } }[] };
          const chunk = parsed.choices[0]?.delta?.content || "";
          if (chunk) {
            fullContent += chunk;
            onChunk!(chunk);
          }
        } catch {
          // Ignore parsing errors for individual chunks
        }
      }
    }
    
    if (!fullContent) {
      throw new Error("Empty response from OpenAI");
    }
    
    return fullContent;
  } catch (error) {
    const sanitized = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    logError(error, { provider: "openai", maskedKey: maskAPIKey(config.apiKey) });
    throw new Error(`OpenAI Error: ${sanitized}`);
  }
}

async function callGemini(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const geminiMessages = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const endpoint = onChunk
    ? `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}&alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

  const body: Record<string, unknown> = {
    contents: geminiMessages,
    generationConfig: { maxOutputTokens: 4096 },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    const friendly = parseErrorResponse(new Error(errText));
    throw new Error(friendly.message);
  }

  if (!onChunk) {
    const data = await response.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    return data.candidates[0]?.content?.parts[0]?.text || "";
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      try {
        const parsed = JSON.parse(raw) as { candidates: { content: { parts: { text: string }[] } }[] };
        const chunk = parsed.candidates[0]?.content?.parts[0]?.text || "";
        if (chunk) {
          fullContent += chunk;
          onChunk!(chunk);
        }
      } catch {}
    }
  }
  return fullContent;
}

async function callGroq(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
  return callOpenAICompatible(
    "https://api.groq.com/openai/v1/chat/completions",
    config,
    messages,
    onChunk
  );
}

async function callAnthropic(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
  const stream = !!onChunk;
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      stream,
      system: systemMsg?.content || undefined,
      messages: chatMsgs,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const friendly = parseErrorResponse(new Error(errText));
    throw new Error(friendly.message);
  }

  if (!stream) {
    const data = await response.json() as { content: { text: string }[] };
    return data.content[0]?.text || "";
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      try {
        const parsed = JSON.parse(raw) as { type: string; delta?: { text?: string } };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          onChunk!(parsed.delta.text);
        }
      } catch {}
    }
  }
  return fullContent;
}

async function callOpenAICompatible(
  url: string,
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void
): Promise<string> {
  const stream = !!onChunk;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const friendly = parseErrorResponse(new Error(errText));
    throw new Error(friendly.message);
  }

  if (!stream) {
    const data = await response.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content || "";
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as { choices: { delta: { content?: string } }[] };
        const chunk = parsed.choices[0]?.delta?.content || "";
        if (chunk) {
          fullContent += chunk;
          onChunk!(chunk);
        }
      } catch {}
    }
  }
  return fullContent;
}

/**
 * Real-time Web Search using SerpApi (Official Google Search)
 */
async function searchWeb(query: string): Promise<string> {
  const SERP_API_KEY = "63afdbcba3d3d930a607d2f0960eaded455fb1b092ce733e613b256f41130808";
  
  try {
    console.log("DEBUG: Official Google Search via SerpApi for:", query);
    
    // SerpApi endpoint - Works globally
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&engine=google&num=5`;
    
    // Use proxy only on web to avoid CORS, otherwise direct fetch
    const finalUrl = Platform.OS === "web" 
      ? `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
      : url;

    const response = await fetch(finalUrl);
    if (!response.ok) throw new Error(`SerpApi failed: ${response.status}`);

    let data;
    if (Platform.OS === "web") {
      const proxyData = await response.json();
      data = JSON.parse(proxyData.contents);
    } else {
      data = await response.json();
    }

    const results = data.organic_results || [];
    
    if (results.length === 0) {
      console.log("DEBUG: No organic results found in SerpApi response");
      return "No live search results found.";
    }

    console.log(`DEBUG: Found ${results.length} official Google results`);

    let context = `[OFFICIAL GOOGLE SEARCH DATA - DATE: ${new Date().toLocaleDateString()}]\n\n`;
    results.forEach((r: any, i: number) => {
      // Extract platform name from link (e.g., wikipedia.org -> Wikipedia)
      const domain = r.link.split("/")[2]?.replace("www.", "").split(".")[0];
      const platform = domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : "Source";
      
      context += `SOURCE ${i + 1}:\n- PLATFORM: ${platform}\n- TITLE: ${r.title}\n- INFO: ${r.snippet}\n- LINK: ${r.link}\n\n`;
    });
    
    return context;
  } catch (error) {
    console.error("SERP_API_SYSTEM_ERROR:", error);
    return "SEARCH_ERROR: Failed to fetch data from Google Search.";
  }
}

export async function callAI(
  config: AIConfig,
  messages: { role: string; content: string }[],
  onChunk?: (text: string) => void,
  searchEnabled?: boolean
): Promise<string> {
  let finalMessages = [...messages];

  if (searchEnabled) {
    const userQuery = messages[messages.length - 1].content;
    const searchResults = await searchWeb(userQuery);
    
    // Highly authoritative system prompt for SerpApi results
    const searchContextPrompt = `\n\n### [GOOGLE SEARCH MODE: ACTIVE]\n${searchResults}\n\n### INSTRUCTIONS FOR SEARCH MODE:\n1. Use the provided GOOGLE SEARCH data to answer accurately.\n2. Start your response with "🌐 [Google Search Mode]".\n3. DO NOT put links inside your main explanation text.\n4. CITE facts using [1], [2] based on the Source numbers above.\n5. MANDATORY: At the VERY END of your response, create a section starting EXACTLY with "### SOURCES:" and list the links in this format: [Platform Name] Link\nExample:\n### SOURCES:\n[Wikipedia] https://en.wikipedia.org/wiki/React\n[BBC] https://www.bbc.com/news/technology`;
    
    const systemIdx = finalMessages.findIndex(m => m.role === "system");
    if (systemIdx >= 0) {
      finalMessages[systemIdx] = { 
        ...finalMessages[systemIdx], 
        content: finalMessages[systemIdx].content + searchContextPrompt 
      };
    } else {
      finalMessages.unshift({ role: "system", content: searchContextPrompt });
    }
  }

  switch (config.provider) {
    case "openai":
      return callOpenAI(config, finalMessages, onChunk);
    case "gemini":
      return callGemini(config, finalMessages, onChunk);
    case "groq":
      return callGroq(config, finalMessages, onChunk);
    case "anthropic":
      return callAnthropic(config, finalMessages, onChunk);
    default:
      throw new Error("Unknown provider");
  }
}

export async function validateAPIKey(config: AIConfig): Promise<boolean> {
  try {
    // Validate key format first
    if (!validateAPIKeyFormat(config.apiKey, config.provider)) {
      console.warn(`API key format may be invalid for ${config.provider}`);
    }

    // Use a very stable, cheap model specifically for validation to ensure the key itself is good
    const testConfig = { ...config };
    if (config.provider === "openai") testConfig.model = "gpt-5-mini";
    if (config.provider === "gemini") testConfig.model = "gemini-3.1-flash";
    if (config.provider === "groq") testConfig.model = "llama-3.1-8b-instant";
    if (config.provider === "anthropic") testConfig.model = "claude-3-5-haiku-20241022";

    // Test with a simple request
    const testMessages = [{ role: "user", content: "Respond with: OK" }];
    
    const result = await retryWithBackoff(
      async () => await callAI(testConfig, testMessages),
      1, // Fewer retries for speed in validation
      500
    );
    
    return !!(result && result.toLowerCase().includes("ok"));
  } catch (error: any) {
    const msg = error?.message || String(error);
    logError(error, { provider: config.provider, maskedKey: maskAPIKey(config.apiKey) });
    console.error("API Validation failed:", msg);
    return false;
  }
}

export function buildSystemPrompt(userProfile: {
  country: string;
  board: string;
  grade: string;
  subjects: string[];
}): string {
  return `You are a Senior JEE Expert Tutor. Your goal is to provide a CLEAN, STRUCTURED, and PROFESSIONAL study response.

STRICT FORMATTING GUIDELINES:
1. **NO UNNECESSARY SYMBOLS**: Avoid using excessive emojis, special symbols (like 🔴, 📌), or heavy dividers (like ---).
2. **CLEAN HEADERS**: Use standard Markdown headers (### Header) for sections.
3. **IMPORTANT TERMS**: Use **bold text** for all critical terms, formulas names, and key concepts.
4. **MATHEMATICAL RIGOR**: Use LaTeX for all math. Use $$...$$ for main formulas and $...$ for inline values.
5. **LANGUAGE**: Explain concepts in simple Hinglish for better understanding (e.g., "Substitute values karenge...").

STRUCTURE:
- **CONCEPT & FORMULA**: Briefly state the core logic and the main formula.
- **STEP-BY-STEP SOLUTION**: Show all calculation steps clearly.
- **FINAL ANSWER**: Highlight the final result with units in a \\boxed{} environment.
- **TIPS & TRAPS**: Mention common mistakes to avoid.

Syllabus: ${userProfile.board} Grade ${userProfile.grade}.
Tone: Professional, Direct, and Student-Friendly.`;
}
