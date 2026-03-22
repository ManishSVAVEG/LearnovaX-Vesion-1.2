import { Text, View } from "react-native";
import COLORS from "@/constants/colors";

/**
 * Parse markdown and convert to structured data
 */
export interface MDBlock {
  type: "heading1" | "heading2" | "heading3" | "paragraph" | "list" | "code" | "bold" | "italic" | "link";
  content?: string;
  level?: number;
  items?: string[];
}

/**
 * Simple markdown parser for study content
 */
export function parseMarkdown(content: string): MDBlock[] {
  const blocks: MDBlock[] = [];
  const lines = content.split("\n");
  let currentList: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Heading 1
    if (trimmed.startsWith("# ")) {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      blocks.push({ type: "heading1", content: trimmed.substring(2), level: 1 });
      i++;
    }
    // Heading 2
    else if (trimmed.startsWith("## ")) {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      blocks.push({ type: "heading2", content: trimmed.substring(3), level: 2 });
      i++;
    }
    // Heading 3
    else if (trimmed.startsWith("### ")) {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      blocks.push({ type: "heading3", content: trimmed.substring(4), level: 3 });
      i++;
    }
    // List items
    else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      currentList.push(trimmed.substring(2));
      i++;
    }
    // Numbered list items
    else if (/^\d+\.\s/.test(trimmed)) {
      currentList.push(trimmed.replace(/^\d+\.\s/, ""));
      i++;
    }
    // Code block
    else if (trimmed.startsWith("```")) {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", content: codeLines.join("\n") });
      i++; // Skip closing ```
    }
    // Empty lines
    else if (trimmed === "") {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      i++;
    }
    // Regular paragraph
    else {
      if (currentList.length > 0) {
        blocks.push({ type: "list", items: currentList });
        currentList = [];
      }
      blocks.push({ type: "paragraph", content: trimmed });
      i++;
    }
  }

  if (currentList.length > 0) {
    blocks.push({ type: "list", items: currentList });
  }

  return blocks;
}

/**
 * Inline markdown formatting (bold, italic, links)
 */
export function formatInlineMarkdown(text: string): (string | { type: string; content: string })[] {
  // 1. First, handle common markdown header patterns and convert them to bold
  // This removes hashes (###, ##, #) and converts them to bold.
  const sanitized = text
    .replace(/^#\s+(.+)$/gm, "**$1**")
    .replace(/^##\s+(.+)$/gm, "**$1**")
    .replace(/^###\s+(.+)$/gm, "**$1**")
    .replace(/^####\s+(.+)$/gm, "**$1**")
    // Also handle weird cases like ##*term##*
    .replace(/##\*([^*]+)##\*/g, "**$1**");
  
  const parts: (string | { type: string; content: string })[] = [];
  let remaining = sanitized;
  
  // Use a regex to find all bold occurrences
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(sanitized)) !== null) {
    // Add plain text before the match
    if (match.index > lastIndex) {
      parts.push(sanitized.substring(lastIndex, match.index));
    }
    // Add bold part
    parts.push({ type: "bold", content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last match
  if (lastIndex < sanitized.length) {
    parts.push(sanitized.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [sanitized];
}

/**
 * Calculate reading time
 */
export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Extract keywords from content
 */
export function extractKeywords(content: string, maxKeywords = 10): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "are", "was", "were",
  ]);

  const words = content
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))
    .map((word) => word.replace(/[^a-z0-9]/g, ""));

  const frequency: Record<string, number> = {};
  words.forEach((word) => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Summarize content
 */
export function summarizeContent(content: string, maxLength = 150): string {
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  let summary = "";

  for (const sentence of sentences) {
    if ((summary + sentence).length > maxLength) break;
    summary += sentence;
  }

  return summary.trim();
}

/**
 * Convert basic markdown to simple HTML for WebView rendering
 */
export function convertToHtml(markdown: string): string {
  if (!markdown) return "";

  let html = markdown
    // 1. Headers (### to <h3>, etc.)
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    
    // 2. Bold (**text**) to <b>
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    
    // 3. Italics (*text*) to <i>
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    
    // 4. Horizontal Rule (---) to <hr>
    .replace(/^---$/gm, "<hr style='border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;'>")
    
    // 5. Lists (simple bullet points)
    // First, convert each - item to <li>...</li>
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Then wrap contiguous <li> items in <ul>
    .replace(/((?:<li>.+<\/li>\n?)+)/g, "<ul>$1</ul>")
    
    // 6. New lines (outside of tags) to <br>
    .replace(/\n/g, "<br>");

  // Simple cleanup: remove redundant <br> after block tags
  html = html
    .replace(/<\/h1><br>/g, "</h1>")
    .replace(/<\/h2><br>/g, "</h2>")
    .replace(/<\/h3><br>/g, "</h3>")
    .replace(/<\/ul><br>/g, "</ul>")
    .replace(/<hr(.*?)><br>/g, "<hr$1>");

  return html;
}
