import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import COLORS from '@/constants/colors';
import { convertToHtml } from '@/lib/markdown';

interface MathRenderProps {
  content: string;
  style?: any;
  textColor?: string;
  fontSize?: number;
}

const KATEX_HTML = (content: string, textColor: string, fontSize: number) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
  body { 
    margin: 0; 
    padding: 0; 
    background-color: transparent; 
    color: ${textColor}; 
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: ${fontSize}px;
    line-height: 1.6;
    overflow-x: hidden;
  }
  #content {
    padding: 2px;
    display: inline-block;
    width: 100%;
    box-sizing: border-box;
    word-wrap: break-word;
  }
  h1, h2, h3 { 
    margin-top: 20px; 
    margin-bottom: 10px; 
    color: ${COLORS.primary}; 
    font-weight: 700;
  }
  h1 { font-size: 1.5em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; }
  h2 { font-size: 1.3em; }
  h3 { font-size: 1.1em; }
  b, strong { color: ${COLORS.primary}; font-weight: 700; }
  ul { padding-left: 20px; margin: 10px 0; }
  li { margin-bottom: 5px; }
  .katex-display { margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
  .katex { font-size: 1.1em; }
</style>
</head>
<body>
<div id="content">
  ${content}
</div>
<script>
  function sendHeight() {
    const height = document.getElementById('content').offsetHeight;
    window.ReactNativeWebView.postMessage(height.toString());
  }

  document.addEventListener("DOMContentLoaded", function() {
    renderMathInElement(document.body, {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\(", right: "\\)", display: false},
        {left: "\\[", right: "\\]", display: true}
      ],
      throwOnError: false
    });
    
    // Initial height
    setTimeout(sendHeight, 50);
    // Height after math rendering might change
    setTimeout(sendHeight, 300);
    setTimeout(sendHeight, 1000);

    // Use ResizeObserver for accurate height tracking
    const resizeObserver = new ResizeObserver(() => {
      sendHeight();
    });
    resizeObserver.observe(document.getElementById('content'));
  });
</script>
</body>
</html>
`;

export default function MathRender({ content, style, textColor = COLORS.text, fontSize = 16 }: MathRenderProps) {
  const [height, setHeight] = useState(fontSize * 2);
  
  // Clean content and check if it needs delimiters
  let processedContent = content.trim();
  
  // Convert Markdown to HTML before passing to WebView
  const htmlContent = convertToHtml(processedContent);

  const hasMath = processedContent.includes('$') || processedContent.includes('\\(') || processedContent.includes('\\[');

  // If no math and no HTML tags (after conversion), just render as Text
  // Note: convertToHtml always adds something if there's markdown. 
  // If it's just plain text, we might want to still use WebView for consistency in styling 
  // or use Text for performance.
  
  const needsWebView = hasMath || htmlContent.includes('<');

  if (!needsWebView) {
    return <Text style={[style, { color: textColor, fontSize, flexShrink: 1, lineHeight: fontSize * 1.5 }]}>{processedContent}</Text>;
  }

  return (
    <View style={[{ width: '100%' }, style, { height: Math.max(height, 20) }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: KATEX_HTML(htmlContent, textColor, fontSize) }}
        scrollEnabled={false}
        onMessage={(event) => {
          const h = parseInt(event.nativeEvent.data);
          if (h > 0) {
            setHeight(h + 10);
          }
        }}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        javaScriptEnabled={true}
        opacity={height > 0 ? 1 : 0}
      />
    </View>
  );
}
