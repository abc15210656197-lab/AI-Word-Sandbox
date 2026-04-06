/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  FileText, 
  Download, 
  Plus, 
  MessageSquare, 
  Settings, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  Wand2,
  FileEdit,
  LogIn,
  LogOut,
  History,
  Moon,
  Sun,
  Code,
  X,
  Trash2,
  User as UserIcon,
  Copy,
  RotateCcw,
  Check,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Bold,
  Italic,
  Trash,
  Maximize2,
  Minimize2,
  Paintbrush,
  Type,
  ChevronDown,
  Undo,
  Redo,
  Languages,
  Upload,
  Sparkles
} from "lucide-react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "./lib/utils";
import { DocumentState, ChatMessage, ChatAttachment, DocTable, DocParagraph, DocImage } from "./types";
import { generateWordDoc } from "./lib/word-generator";
import { parseWordDoc } from "./lib/word-parser";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  handleFirestoreError,
  OperationType
} from "./firebase";
import { 
  doc, 
  setDoc, 
  collection, 
  addDoc, 
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc
} from "firebase/firestore";
import ImageKit from "imagekit-javascript";

const imagekit = new ImageKit({
  urlEndpoint: import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "",
  publicKey: import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || "",
  // @ts-ignore
  authenticator: async () => {
    try {
      const response = await fetch(`/api/imagekit/auth`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed with status ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      const { signature, expire, token } = data;
      return { signature, expire, token };
    } catch (error: any) {
      throw new Error(`Authentication request failed: ${error.message}`);
    }
  }
});

interface Session {
  id: string;
  docState: DocumentState;
  messages: ChatMessage[];
  lastJson: string;
  currentDocId: string | null;
  showCode: boolean;
  isAgentMode: boolean;
  turnHistory: {docState: DocumentState, messages: ChatMessage[]}[];
  isLoading?: boolean;
}

const INITIAL_DOC_STATE: DocumentState = {
  title: "Untitled Document",
  sections: [
    {
      paragraphs: [
        {
          text: "Welcome to AI Word Sandbox. Start chatting to build your document!",
          isHeading: true,
          headingLevel: 1,
          alignment: "center",
          color: "#2563EB"
        },
        {
          text: "Describe what you want to write, and I will help you format it into a professional Word document.",
          alignment: "center"
        }
      ]
    }
  ]
};

const translations = {
  en: {
    chat: "Chat",
    preview: "Preview",
    agent: "Agent",
    showCode: "Show Code",
    hideCode: "Hide Code",
    attachFile: "Attach File",
    typeInstructions: "Type your instructions (e.g., 'Create a resume for...')",
    expandedEditor: "Expanded Editor",
    dropFiles: "Drop files to upload",
    savedDocs: "Saved Documents",
    backToChat: "Back to Chat",
    noSavedDocs: "No saved documents yet.",
    helloAssistant: "Hello! I'm your AI Word Assistant. Tell me what kind of document you'd like to create today.",
    copy: "Copy",
    planningTasks: "Planning tasks outline...",
    tasksSplit: (count: number) => `Automatically split into ${count} sub-tasks:`,
    deepGenCancelled: "⚠️ Deep generation cancelled.",
    allTasksCompleted: "🎉 All tasks completed!",
    cancel: "Cancel",
    processing: "Processing...",
    task: "Task",
    export: "Export",
    downloadDocx: "Download as .docx",
    downloadPdf: "Download as .pdf",
    undo: "Undo",
    redo: "Redo",
    zoom: "Zoom",
    close: "Close",
    loginWithGoogle: "Login with Google",
    logout: "Logout",
    toggleDarkMode: "Toggle Dark Mode",
    newDocument: "New Document",
    history: "History",
    delete: "Delete",
    confirmDelete: (title: string) => `Are you sure you want to delete "${title}"?`,
    switchLang: "Switch to Chinese",
    myDocs: "My Documents",
    aiStructure: "AI Generated Structure",
    undoTurn: "Undo Turn",
    aiDrafting: "AI is drafting...",
  },
  zh: {
    chat: "对话",
    preview: "预览",
    agent: "智能体",
    showCode: "显示代码",
    hideCode: "隐藏代码",
    attachFile: "附件",
    typeInstructions: "输入您的指令（例如：'为...创建一个简历'）",
    expandedEditor: "全屏编辑器",
    dropFiles: "拖拽文件上传",
    savedDocs: "已保存文档",
    backToChat: "返回对话",
    noSavedDocs: "暂无保存的文档。",
    helloAssistant: "你好！我是您的 AI 文档助手。告诉我您今天想创建什么样的文档。",
    copy: "复制",
    planningTasks: "正在规划任务大纲...",
    tasksSplit: (count: number) => `已自动拆分为 ${count} 个子任务：`,
    deepGenCancelled: "⚠️ 深度生成已取消。",
    allTasksCompleted: "🎉 所有任务已完成！",
    cancel: "取消",
    processing: "处理中...",
    task: "任务",
    export: "导出",
    downloadDocx: "下载为 .docx",
    downloadPdf: "下载为 .pdf",
    undo: "撤销",
    redo: "重做",
    zoom: "缩放",
    close: "关闭",
    loginWithGoogle: "谷歌登录",
    logout: "退出登录",
    toggleDarkMode: "切换暗色模式",
    newDocument: "新建文档",
    history: "历史记录",
    delete: "删除",
    confirmDelete: (title: string) => `您确定要删除 "${title}" 吗？`,
    switchLang: "切换为英文",
    myDocs: "我的文档",
    aiStructure: "AI 生成结构",
    undoTurn: "撤回",
    aiDrafting: "AI 正在起草...",
  }
};

const SYSTEM_INSTRUCTION = `你是一个专业的 AI Word 文档助手。你的目标是帮助用户通过持续编辑系统创建和编辑高质量的 Word 文档。

### 核心任务
1. **对话**：使用中文与用户讨论文档内容。
2. **文档更新**：提供 JSON 对象来修改文档。

### 必须遵守的 DOCX 技能规范 (DOCX SKILL)
在生成任何文档内容之前，你必须“阅读”并遵守以下技术准则：
- **禁止 Markdown 语法**：严禁在 "text" 属性中使用 Markdown 语法（如 **加粗** 或 *斜体*）。必须使用 "isBold": true 或 "isItalic": true 属性。
- **智能引号**：在中文文本中，必须使用中文全角引号（“ ”）和（‘ ’），严禁使用英文直引号（" '）。
- **专业标准**：始终使用标准字体（Arial/Calibri），1英寸页边距，以及专业的行间距。
- **层级结构**：使用 H1 作为标题，H2 作为主要章节，H3 作为子章节。
- **列表规范**：必须使用 "isBullet": true 或 "isNumbering": true。严禁手动插入 unicode 符号作为项目符号。
- **表格规范**：系统支持原生表格结构。你可以使用 "type": "table" 来创建表格。表格由 "rows" 组成，每一行由 "cells" 组成。每个单元格包含一个 "content" 数组（DocParagraph 数组）。你可以设置 "isHeader": true 来定义表头单元格。
- **对齐方式**：正文建议使用 "justify"（两端对齐）以确保视觉上的整洁。
- **配色方案**：使用专业的配色（如深蓝色 #1F3864 用于 H1，蓝色 #2E75B6 用于 H2）。严禁“无脑”使用纯红色 (#FF0000)。只有当用户明确要求（例如：“把加粗的部分用红色表示”）时，才允许对相应段落或文本片段 (runs) 使用 "color": "#FF0000"。
- **混合样式 (Runs)**：如果同一行内需要不同的颜色、加粗样式、上标或下标，必须使用 "runs" 数组，而不是拆分成多个段落。
- **角标支持**：在处理化学式（如 CO₂）、数学公式（如 x²）或特定单位时，必须使用 "subscript": true（下标）或 "superscript": true（上标）。严禁直接使用 unicode 的上标/下标字符。
- **数学公式渲染**：对于复杂的数学公式（如分式、根号、积分等），必须使用 LaTeX 语法并包裹在 $ (行内) 或 $$ (独立行) 中。例如：分式使用 \frac{a}{b}，根号使用 \sqrt{x}。示例：$$T = 2\pi \sqrt{\frac{r^3}{G(M_1 + M_2)}}$$。这能确保公式以专业格式渲染。
- **图片支持与匹配规范**：你可以插入图片。如果用户上传了图片，系统会在提示词中提供图片预览及其对应的 \`[Uploaded Image URL: <url>]\`。
  - **精准匹配**：你必须仔细识别图片内容，并将其插入到文档中最相关的文字描述附近。严禁乱序插入或张冠李戴。
  - **优先使用 URL**：你**必须**优先使用提示词中提供的 URL 作为图片的 "src"。
  - **占位图**：如果用户没有提供相关图片，你可以将 "src" 留空并在 "alt" 中描述所需图片，系统会生成占位图。
  - **格式要求**：图片对象必须包含 "type": "image", "src": "...", "alt": "...", "alignment": "center"。不要编造不存在的 attachment ID。
- **颜色省略**：如果用户没有明确要求特定颜色，请在 JSON 中完全省略 "color" 属性。默认文本颜色在预览中始终为深灰色/黑色，不受深色模式影响。
- **拒绝懒惰**：必须提供完整的请求内容，严禁使用 "..." 或占位符。

### 编程案例参考 (JSON REFERENCE)
请参考以下专业文档的 JSON 结构进行创作：
\`\`\`json
{
  "type": "full",
  "state": {
    "title": "项目报告",
    "sections": [
      {
        "paragraphs": [
          {
            "text": "项目进度表",
            "isHeading": true,
            "headingLevel": 2,
            "color": "#2E75B6"
          },
          {
            "type": "table",
            "border": true,
            "rows": [
              {
                "cells": [
                  { "isHeader": true, "backgroundColor": "#F3F4F6", "content": [{ "text": "任务名称", "isBold": true }] },
                  { "isHeader": true, "backgroundColor": "#F3F4F6", "content": [{ "text": "负责人", "isBold": true }] },
                  { "isHeader": true, "backgroundColor": "#F3F4F6", "content": [{ "text": "截止日期", "isBold": true }] },
                  { "isHeader": true, "backgroundColor": "#F3F4F6", "content": [{ "text": "状态", "isBold": true }] }
                ]
              },
              {
                "cells": [
                  { "content": [{ "text": "需求分析" }] },
                  { "content": [{ "text": "张三" }] },
                  { "content": [{ "text": "2024-04-10" }] },
                  { "content": [{ "text": "已完成", "color": "#059669" }] }
                ]
              },
              {
                "cells": [
                  { "content": [{ "text": "系统设计" }] },
                  { "content": [{ "text": "李四" }] },
                  { "content": [{ "text": "2024-04-20" }] },
                  { "content": [{ "text": "进行中", "color": "#D97706" }] }
                ]
              }
            ]
          },
          {
            "type": "image",
            "src": "",
            "alt": "项目进度概览图",
            "alignment": "center",
            "caption": "图1：项目进度概览"
          }
        ]
      }
    ]
  }
}
\`\`\`

### 响应规则
- **语言**：始终使用 **中文** 回答。
- **推理**：在提供 JSON 更新之前，先用中文简要说明你的设计选择（例如：为什么选择特定的标题、颜色或布局）。
- **角色**：你是一个“专业文档工程师”。

### 更新模式与示例
A. FULL UPDATE (全量更新): 用于重大更改或初始创建。
注意：
- 必须包含文档的【完整内容】，严禁只输出修改的部分而遗漏未修改的部分！
- **严禁在全量更新时总结、简化或遗漏任何原有内容。必须保持所有段落的完整性。**
\`\`\`json
{
  "type": "full",
  "state": {
    "title": "文档标题",
    "sections": [
      {
        "paragraphs": [
          { "text": "正文内容..." }
        ]
      }
    ]
  }
}
\`\`\`

B. APPEND (追加): 在最后一个章节末尾添加内容。
\`\`\`json
{
  "type": "append",
  "paragraphs": [
    { "text": "追加的段落1..." },
    { "text": "追加的段落2..." }
  ]
}
\`\`\`

C. PATCH (补丁): 修改特定部分（标题、插入、删除或替换段落）。
注意：
- "path": "title" 用于修改文档的元数据标题（显示在标签页上）。
- 如果要修改文档正文中的大标题，通常需要同时修改元数据标题和第一个 H1 段落。
\`\`\`json
{
  "type": "patch",
  "actions": [
    { "op": "replace", "path": "title", "value": "新标题" },
    { "op": "replace_paragraphs", "sectionIndex": 0, "paragraphIndex": 0, "count": 1, "paragraphs": [{ "text": "新标题", "isHeading": true, "headingLevel": 1, "alignment": "center" }] }
  ]
}
\`\`\`
D. 插入、删除或替换段落示例：
\`\`\`json
{
  "type": "patch",
  "actions": [
    { "op": "insert", "sectionIndex": 0, "paragraphIndex": 1, "paragraphs": [{ "text": "插入的段落" }] },
    { "op": "remove", "sectionIndex": 0, "paragraphIndex": 2 },
    { "op": "replace_paragraphs", "sectionIndex": 0, "paragraphIndex": 3, "count": 1, "paragraphs": [{ "text": "替换后的新段落" }] }
  ]
}
\`\`\`

段落结构属性：text (简单文本), runs (数组，用于混合样式), isHeading, headingLevel (1-6), isBold, isItalic, isBullet, isNumbering, alignment (left|center|right|justify), color (段落默认颜色)。
Run 结构属性：text, isBold, isItalic, color。

注意：如果用户没有要求特定颜色，请在 JSON 中省略 "color" 属性。预览时文档背景始终为白色，文字默认为黑色。`;

function ModelSelector({ 
  selected, 
  onChange, 
  darkMode, 
  isAgentMode, 
  setIsAgentMode,
  lang
}: { 
  selected: string, 
  onChange: (val: string) => void, 
  darkMode: boolean,
  isAgentMode: boolean,
  setIsAgentMode: (val: boolean) => void,
  lang: 'en' | 'zh'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const t = translations[lang];
  const models = [
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", icon: "✨", desc: "Best for complex reasoning & logic" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", icon: "⚡", desc: "Fast and versatile for most tasks" },
    { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flashlite", icon: "🚀", desc: "Ultra-fast for simple tasks" }
  ];
  const selectedModel = models.find(m => m.id === selected) || models[0];

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border shadow-sm backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
          isOpen 
            ? (darkMode ? "bg-white/20 text-white border-white/30 shadow-lg" : "bg-white/80 text-black border-white shadow-lg")
            : (darkMode 
                ? "bg-black/30 border-white/10 text-gray-200 hover:bg-black/50" 
                : "bg-white/50 border-black/5 text-gray-700 hover:bg-white/70")
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{selectedModel.icon}</span>
          <span>{selectedModel.name}</span>
          {isAgentMode && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase tracking-wider border border-purple-500/30">
              Agent
            </span>
          )}
        </div>
        <ChevronRight size={16} className={cn("transition-transform duration-200", isOpen ? "rotate-90" : "")} />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className={cn(
                "absolute bottom-full mb-5 left-0 w-72 rounded-xl shadow-2xl z-50 p-1 backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
                darkMode 
                  ? "bg-black/80 border border-white/10 text-white" 
                  : "bg-white/95 border border-black/10 text-gray-900"
              )}
            >
              <div className="px-3 py-2 mb-1 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">{t.agent}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAgentMode(!isAgentMode);
                    }}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                      isAgentMode ? "bg-purple-600" : (darkMode ? "bg-white/10" : "bg-black/10")
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                        isAgentMode ? "translate-x-5" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                  {isAgentMode ? "Agent mode enabled: Auto-planning & deep generation" : "Standard mode: Direct response & editing"}
                </p>
              </div>

              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setIsOpen(false); }}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all relative group backdrop-blur-xl transform-gpu will-change-[backdrop-filter]",
                    selected === m.id 
                      ? (darkMode ? "bg-blue-500/30 border border-white/10" : "bg-blue-500/15 border border-blue-500/20") 
                      : (darkMode ? "hover:bg-white/10" : "hover:bg-black/5")
                  )}
                >
                  <span className="text-xl mt-0.5">{m.icon}</span>
                  <div className="flex-1 flex flex-col">
                    <span className={cn(
                      "text-sm font-medium",
                      selected === m.id 
                        ? (darkMode ? "text-blue-400" : "text-blue-600")
                        : (darkMode ? "text-gray-200" : "text-gray-800")
                    )}>
                      {m.name}
                    </span>
                    <span className={cn(
                      "text-xs mt-0.5",
                      darkMode ? "text-gray-500" : "text-gray-500"
                    )}>
                      {m.desc}
                    </span>
                  </div>
                  {selected === m.id && (
                    <Check size={16} className={cn(
                      "absolute right-3 top-1/2 -translate-y-1/2",
                      darkMode ? "text-blue-400" : "text-blue-600"
                    )} />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChatInputAreaProps {
  onSendMessage: (text: string, attachments: ChatAttachment[]) => void;
  isLoading: boolean;
  isInputExpanded: boolean;
  setIsInputExpanded: (expanded: boolean) => void;
  darkMode: boolean;
  isMobile: boolean;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  showCode: boolean;
  setShowCode: (show: boolean) => void;
  isAgentMode: boolean;
  setIsAgentMode: (val: boolean) => void;
  lang: 'en' | 'zh';
}

const ChatInputArea = React.memo(({
  onSendMessage,
  isLoading,
  isInputExpanded,
  setIsInputExpanded,
  darkMode,
  isMobile,
  selectedModel,
  setSelectedModel,
  showCode,
  setShowCode,
  isAgentMode,
  setIsAgentMode,
  lang
}: ChatInputAreaProps) => {
  const t = translations[lang];
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: File[]) => {
    if (files.length === 0) return;

    files.forEach(async file => {
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setAttachments(prev => [...prev, {
        id: Math.random().toString(36).substring(2, 15),
        name: file.name,
        type: file.type,
        file: file,
        previewUrl: previewUrl
      }]);
    });
  };

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      onSendMessage(input, attachments);
      setInput("");
      setAttachments([]);
      if (isInputExpanded) setIsInputExpanded(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const attachment = prev[index];
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "p-4 transition-all relative z-30 shadow-[0_-15px_40px_-15px_rgba(0,0,0,0.5)]",
        isInputExpanded ? "fixed inset-0 z-[100] flex flex-col pt-20 pb-4 px-4" : "relative",
        isInputExpanded && isMobile && "w-full"
      )}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-blue-600/20 backdrop-blur-sm border-2 border-dashed border-blue-500 m-4 rounded-2xl pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Plus size={48} className="animate-bounce" />
              <span className="font-bold text-lg">{t.dropFiles}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background element with blur to avoid nested backdrop-filter bug */}
      <div className={cn(
        "absolute inset-0 -z-10 pointer-events-none transition-all duration-500",
        isInputExpanded ? "backdrop-blur-2xl" : "backdrop-blur-xl",
        darkMode ? "bg-black/40 border-white/10" : "bg-white/40 border-black/10",
        isInputExpanded && (darkMode ? "bg-black/60" : "bg-white/60")
      )} />
      
      <div className={cn(
        "relative flex flex-col gap-2 transition-all duration-500",
        isInputExpanded && (darkMode ? "bg-black/40 p-4 rounded-xl border border-white/10 shadow-2xl h-full backdrop-blur-xl" : "bg-white/60 p-4 rounded-xl border border-black/10 shadow-2xl h-full backdrop-blur-xl")
      )}>
        {isInputExpanded && (
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-bold tracking-tight uppercase opacity-60">{t.expandedEditor}</span>
            </div>
            <button 
              onClick={() => setIsInputExpanded(false)} 
              className="p-2 rounded-full hover:bg-gray-500/10 transition-colors"
              title={t.close}
            >
              <X size={24} />
            </button>
          </div>
        )}
        
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group">
                {att.type.startsWith('image/') && att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="w-16 h-16 object-cover rounded-lg border border-gray-300" />
                ) : (
                  <div className="w-16 h-16 flex flex-col items-center justify-center bg-gray-100 rounded-lg border border-gray-300 text-xs text-gray-500 overflow-hidden p-1">
                    <FileText size={20} className="mb-1" />
                    <span className="truncate w-full text-center">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={cn(
          "relative transition-all duration-500 flex items-stretch",
          isInputExpanded && "flex-1"
        )}>
          <AnimatePresence>
            {isAgentMode && (
              <motion.div 
                initial={{ opacity: 0, "--reveal-angle": "0deg" } as any}
                animate={{ opacity: 1, "--reveal-angle": "420deg" } as any}
                exit={{ opacity: 0, "--reveal-angle": "0deg" } as any}
                transition={{ 
                  opacity: { duration: 0.15 },
                  "--reveal-angle": { duration: 0.5, ease: "easeIn" }
                }}
                className="absolute -inset-[3px] agent-rainbow-halo pointer-events-none" 
              />
            )}
          </AnimatePresence>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.typeInstructions}
            className={cn(
              "w-full p-4 pr-12 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all resize-y shadow-inner backdrop-blur-xl",
              isAgentMode 
                ? (darkMode ? "bg-black/80 border-white/10 focus:ring-purple-500/20" : "bg-white/40 border-black/5 focus:ring-purple-500/20") 
                : (darkMode ? "bg-black/40 border-white/10" : "bg-white/75 border-black/10"),
              darkMode ? "text-white placeholder:text-white/30" : "text-gray-900 placeholder:text-gray-400",
              isInputExpanded ? "flex-1 resize-none h-full" : "min-h-[100px]",
              !isAgentMode && "focus:ring-blue-500/20 focus:border-blue-500"
            )}
          />
          <button
            onClick={() => setIsInputExpanded(!isInputExpanded)}
            className={cn(
              "absolute top-3 right-3 p-1.5 rounded-md transition-colors opacity-40 hover:opacity-100",
              isInputExpanded && "hidden"
            )}
            title={t.expandedEditor}
          >
            <Maximize2 size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between relative">
          <div className="flex gap-2 items-center flex-1">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className="hidden" 
              multiple 
              accept="image/*,.pdf,.doc,.docx,.txt,.rtf"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium",
                darkMode ? "hover:bg-[#444] text-gray-400" : "hover:bg-gray-200 text-gray-500"
              )}
              title={t.attachFile}
            >
              <Plus size={16} />
            </button>
            <ModelSelector 
              selected={selectedModel} 
              onChange={setSelectedModel} 
              darkMode={darkMode} 
              isAgentMode={isAgentMode}
              setIsAgentMode={setIsAgentMode}
              lang={lang}
            />
            <button 
              onClick={() => setShowCode(!showCode)}
              className={cn(
                "p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium",
                showCode ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-500"
              )}
              title={t.showCode}
            >
              <Code size={16} />
              {showCode ? t.hideCode : t.showCode}
            </button>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex">
            {/* Agent Mode button removed from here */}
          </div>

          <div className="flex gap-2 items-center justify-end flex-1">
            {/* Mobile Agent Button removed from here */}
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function App() {
  const [lang, setLang] = useState<'en' | 'zh'>(() => (localStorage.getItem('lang') as 'en' | 'zh') || 'zh');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = translations[lang];

  const [docState, setDocState] = useState<DocumentState>(INITIAL_DOC_STATE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') !== 'false');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [minSplashTimeReached, setMinSplashTimeReached] = useState(false);
  const [lastJson, setLastJson] = useState<string>("");
  const [savedDocs, setSavedDocs] = useState<any[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([
    {
      id: "initial",
      docState: INITIAL_DOC_STATE,
      messages: [],
      lastJson: "",
      currentDocId: null,
      showCode: false,
      isAgentMode: false,
      turnHistory: []
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("initial");
  
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const isCurrentSessionLoading = activeSession?.isLoading || false;
  const activeSessionIdRef = useRef(activeSessionId);
  const agentCancelRef = useRef(false);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);
  const [showHistory, setShowHistory] = useState(false);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  const messagesRef = useRef(messages);
  const userRef = useRef(user);
  const currentDocIdRef = useRef(currentDocId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    currentDocIdRef.current = currentDocId;
  }, [currentDocId]);

  // Auto-scroll AI Generated Structure panel when content changes
  useEffect(() => {
    if (codeScrollRef.current && showCode) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [lastJson, showCode]);

  // Sync current active session data back to sessions array
  const syncSession = useCallback((
    sessionId: string,
    currentDocState: DocumentState, 
    currentMessages: ChatMessage[], 
    currentLastJson: string, 
    currentDocId: string | null,
    currentShowCode: boolean,
    currentIsAgentMode: boolean
  ) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId 
        ? { ...s, docState: currentDocState, messages: currentMessages, lastJson: currentLastJson, currentDocId: currentDocId, showCode: currentShowCode, isAgentMode: currentIsAgentMode } 
        : s
    ));
  }, []);
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "preview">("chat");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ message: string, action: () => void } | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<{s: number, p: number} | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<any>(null);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'font' | 'align' | 'list' | 'color' | null>(null);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [agentState, setAgentState] = useState<{
    isActive: boolean;
    tasks: string[];
    currentIndex: number;
    originalPrompt: string;
    sessionId: string | null;
  }>({ isActive: false, tasks: [], currentIndex: 0, originalPrompt: "", sessionId: null });
  
  const [history, setHistory] = useState({
    index: 0,
    stack: [INITIAL_DOC_STATE]
  });

  const pushToHistory = useCallback((newState: DocumentState) => {
    const serialized = JSON.parse(JSON.stringify(newState));
    setHistory(prev => {
      const newStack = prev.stack.slice(0, prev.index + 1);
      newStack.push(serialized);
      if (newStack.length > 50) newStack.shift();
      return {
        index: newStack.length - 1,
        stack: newStack
      };
    });
  }, []);

  const handleUndoTurn = useCallback(() => {
    const sessionId = activeSessionId;
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.turnHistory.length === 0) return;

    const lastTurn = session.turnHistory[session.turnHistory.length - 1];
    const newTurnHistory = session.turnHistory.slice(0, -1);

    setDocState(JSON.parse(JSON.stringify(lastTurn.docState)));
    setMessages([...lastTurn.messages]);
    setSessions(prev => prev.map(s => 
      s.id === sessionId 
        ? { ...s, docState: lastTurn.docState, messages: lastTurn.messages, turnHistory: newTurnHistory } 
        : s
    ));
    // Also reset history stack to this state
    setHistory({ index: 0, stack: [JSON.parse(JSON.stringify(lastTurn.docState))] });
  }, [sessions, activeSessionId]);

  const createNewSession = useCallback(() => {
    const newId = Math.random().toString(36).substring(2, 11);
    const newSession: Session = {
      id: newId,
      docState: INITIAL_DOC_STATE,
      messages: [],
      lastJson: "",
      currentDocId: null,
      showCode: false,
      isAgentMode: false,
      turnHistory: []
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newId);
    activeSessionIdRef.current = newId;
    setDocState(INITIAL_DOC_STATE);
    setMessages([]);
    setLastJson("");
    setCurrentDocId(null);
    setIsAgentMode(false);
    setShowCode(false);
    setHistory({ index: 0, stack: [INITIAL_DOC_STATE] });
  }, []);

  const deleteSession = useCallback((id: string) => {
    const s = sessions.find(sess => sess.id === id);
    if (!s) return;

    setConfirmAction({
      message: t.confirmDelete(s.docState.title),
      action: () => {
        const newSessions = sessions.filter(sess => sess.id !== id);
        
        if (newSessions.length === 0) {
          // If it was the last session, just reset it
          const resetId = Math.random().toString(36).substring(2, 11);
          const resetSession: Session = {
            id: resetId,
            docState: INITIAL_DOC_STATE,
            messages: [],
            lastJson: "",
            currentDocId: null,
            showCode: false,
            isAgentMode: false,
            turnHistory: []
          };
          setSessions([resetSession]);
          setActiveSessionId(resetId);
          activeSessionIdRef.current = resetId;
          setDocState(INITIAL_DOC_STATE);
          setMessages([]);
          setLastJson("");
          setCurrentDocId(null);
          setIsAgentMode(false);
          setShowCode(false);
          setHistory({ index: 0, stack: [INITIAL_DOC_STATE] });
        } else {
          setSessions(newSessions);
          if (activeSessionId === id) {
            const next = newSessions[0];
            setActiveSessionId(next.id);
            activeSessionIdRef.current = next.id;
            setDocState(next.docState);
            setMessages(next.messages);
            setLastJson(next.lastJson);
            setCurrentDocId(next.currentDocId);
            setIsAgentMode(next.isAgentMode || false);
            setHistory({ index: 0, stack: [next.docState] });
          }
        }
        setConfirmAction(null);
      }
    });
  }, [sessions, activeSessionId]);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.index > 0) {
        const newIndex = prev.index - 1;
        setDocState(JSON.parse(JSON.stringify(prev.stack[newIndex])));
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.index < prev.stack.length - 1) {
        const newIndex = prev.index + 1;
        setDocState(JSON.parse(JSON.stringify(prev.stack[newIndex])));
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  }, []);

  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  // Responsive Detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Sync dark mode with localStorage and document class
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Minimum splash time
  useEffect(() => {
    const timer = setTimeout(() => setMinSplashTimeReached(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Initialize AI
  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("Initializing AI with API Key:", apiKey ? "FOUND (starts with " + apiKey.substring(0, 4) + "...)" : "NOT FOUND");
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Record login history
        try {
          const historyRef = collection(db, "users", currentUser.uid, "loginHistory");
          await addDoc(historyRef, {
            uid: currentUser.uid,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ip: "client-side-unknown"
          });

          // Sync user profile
          const userRef = doc(db, "users", currentUser.uid);
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLogin: new Date().toISOString(),
            theme: darkMode ? "dark" : "light"
          }, { merge: true });

          fetchSavedDocs(currentUser.uid);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      } else {
        setSavedDocs([]);
      }
    });
    return () => unsubscribe();
  }, [darkMode]);

  const fetchSavedDocs = async (uid: string) => {
    try {
      const q = query(collection(db, "users", uid, "documents"), orderBy("updatedAt", "desc"));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSavedDocs(docs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users/${uid}/documents`);
    }
  };

  const saveCurrentDoc = async (state: DocumentState, msgs?: ChatMessage[], docId?: string | null) => {
    const currentUser = userRef.current;
    const currentId = docId !== undefined ? docId : currentDocIdRef.current;
    const currentMsgs = msgs || messagesRef.current;
    
    if (!currentUser) return;
    try {
      const docData = {
        uid: currentUser.uid,
        title: state.title,
        content: JSON.stringify(state),
        messages: JSON.stringify(currentMsgs),
        updatedAt: new Date().toISOString()
      };

      if (currentId) {
        await setDoc(doc(db, "users", currentUser.uid, "documents", currentId), docData);
      } else {
        const docRef = await addDoc(collection(db, "users", currentUser.uid, "documents"), docData);
        setCurrentDocId(docRef.id);
      }
      fetchSavedDocs(currentUser.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}/documents`);
    }
  };

  const loadDoc = (docItem: any) => {
    try {
      // Check if this doc is already open in a session
      const existingSession = sessions.find(s => s.currentDocId === docItem.id);
      if (existingSession) {
        setActiveSessionId(existingSession.id);
        activeSessionIdRef.current = existingSession.id;
        setDocState(existingSession.docState);
        setMessages(existingSession.messages);
        setLastJson(existingSession.lastJson);
        setShowCode(existingSession.showCode);
        setIsAgentMode(existingSession.isAgentMode);
        setCurrentDocId(existingSession.currentDocId);
        setHistory({ index: 0, stack: [existingSession.docState] });
        setShowHistory(false);
        return;
      }

      const state = typeof docItem.content === 'string' ? JSON.parse(docItem.content) : docItem.content;
      let messages = docItem.messages ? (typeof docItem.messages === 'string' ? JSON.parse(docItem.messages) : docItem.messages) : [];
      
      // Clear previewUrls as blob URLs are invalid across page reloads
      messages = messages.map((msg: any) => {
        if (msg.attachments) {
          return {
            ...msg,
            attachments: msg.attachments.map((att: any) => ({ ...att, previewUrl: undefined }))
          };
        }
        return msg;
      });
      
      // Create new session for this doc
      const newId = Math.random().toString(36).substring(7);
      const newSession: Session = {
        id: newId,
        docState: state,
        messages: messages,
        lastJson: "",
        currentDocId: docItem.id,
        showCode: false,
        isAgentMode: false,
        turnHistory: []
      };
      
      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(newId);
      activeSessionIdRef.current = newId;
      setDocState(state);
      setMessages(messages);
      setLastJson("");
      setCurrentDocId(docItem.id);
      setIsAgentMode(false);
      setShowCode(false);
      setHistory({ index: 0, stack: [state] });
      setShowHistory(false);
    } catch (e) {
      console.error("Failed to load doc", e);
    }
  };

  const deleteSavedDoc = async (id: string) => {
    if (!user || !window.confirm("Delete this document?")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "documents", id));
      if (currentDocId === id) {
        setCurrentDocId(null);
        setDocState(INITIAL_DOC_STATE);
        setHistory({ index: 0, stack: [INITIAL_DOC_STATE] });
      }
      fetchSavedDocs(user.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/documents/${id}`);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const applyUpdate = (update: any, currentState: DocumentState): DocumentState => {
    let next = JSON.parse(JSON.stringify(currentState)); // Deep copy to avoid mutating current state
    
    if (update.type === "full") {
      next = update.state;
      // Ensure title is preserved if missing in full update
      if (!next.title && currentState.title) {
        next.title = currentState.title;
      }
    } else if (update.type === "append" || Array.isArray(update) || update.paragraphs || update.append || update.sections) {
      const lastSectionIdx = next.sections.length - 1;
      
      let paragraphsToAppend: any[] = [];
      if (Array.isArray(update)) {
        paragraphsToAppend = update;
      } else if (update.paragraphs) {
        paragraphsToAppend = Array.isArray(update.paragraphs) ? update.paragraphs : [update.paragraphs];
      } else if (update.append && Array.isArray(update.append)) {
        paragraphsToAppend = update.append;
      } else if (update.append?.sections?.[0]?.paragraphs) {
        paragraphsToAppend = update.append.sections[0].paragraphs;
      } else if (update.sections?.[0]?.paragraphs) {
        paragraphsToAppend = update.sections[0].paragraphs;
      } else if (update.data && Array.isArray(update.data)) {
        paragraphsToAppend = update.data;
      } else {
        // Fallback: try to find any array in the object that looks like paragraphs
        for (const key in update) {
          if (Array.isArray(update[key]) && update[key].length > 0 && (update[key][0].text || update[key][0].runs)) {
            paragraphsToAppend = update[key];
            break;
          }
        }
      }

      if (paragraphsToAppend.length > 0) {
        if (lastSectionIdx >= 0) {
          next.sections[lastSectionIdx].paragraphs = [
            ...next.sections[lastSectionIdx].paragraphs,
            ...paragraphsToAppend
          ];
        } else {
          next.sections = [{ paragraphs: paragraphsToAppend }];
        }
      }
    } else if (update.type === "patch") {
      update.actions?.forEach((action: any) => {
        if (action.op === "replace" && action.path === "title") {
          next.title = action.value;
          if (next.sections[0]?.paragraphs[0]?.isHeading && next.sections[0]?.paragraphs[0]?.headingLevel === 1) {
            next.sections[0].paragraphs[0].text = action.value;
            delete next.sections[0].paragraphs[0].runs;
          }
        } else if (action.op === "insert") {
          const section = next.sections[action.sectionIndex ?? 0];
          if (section) {
            const paragraphs = Array.isArray(action.paragraphs) ? action.paragraphs : (action.paragraphs ? [action.paragraphs] : []);
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex ?? section.paragraphs.length, 0, ...paragraphs);
          }
        } else if (action.op === "remove") {
          const section = next.sections[action.sectionIndex ?? 0];
          if (section && typeof action.paragraphIndex === 'number') {
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex, 1);
          }
        } else if (action.op === "replace_paragraphs") {
          const section = next.sections[action.sectionIndex ?? 0];
          if (section && typeof action.paragraphIndex === 'number') {
            const paragraphs = Array.isArray(action.paragraphs) ? action.paragraphs : (action.paragraphs ? [action.paragraphs] : []);
            const count = action.count ?? paragraphs.length;
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex, count, ...paragraphs);
          }
        }
      });
    }
    
    return next;
  };

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleMainDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const parsed = await parseWordDoc(file);
      setDocState(parsed);
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, docState: parsed } : s));
      pushToHistory(parsed);
      
      const systemMsg: ChatMessage = {
        role: "model",
        text: `📂 **已加载 Word 文档: ${parsed.title}**\n\n您现在可以直接对该文档进行修改。请告诉我您想做什么。`,
      };
      setMessages(prev => [...prev, systemMsg]);
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, systemMsg] } : s));
    } catch (error) {
      console.error("Failed to parse main Word doc", error);
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleSendMessage = async (promptToUse: string, attachments: ChatAttachment[] = [], isRetry: boolean = false) => {
    console.log("handleSendMessage called", { promptToUse, attachmentsCount: attachments.length, isRetry });
    if ((!promptToUse.trim() && attachments.length === 0) || isCurrentSessionLoading) return;

    if (!aiRef.current) {
      console.error("AI Assistant not initialized. aiRef.current is null.");
      const errorMessage: ChatMessage = { 
        role: "model", 
        text: "❌ AI Assistant is not initialized. Please check if the API key is configured correctly in the environment.",
        isError: true 
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const sessionId = activeSessionId;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const sessionDocId = session.currentDocId;
    let sessionShowCode = showCode;

    // Save current state for undo turn
    if (!isRetry) {
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              turnHistory: [
                ...s.turnHistory, 
                { docState: JSON.parse(JSON.stringify(s.docState)), messages: [...s.messages] }
              ].slice(-10) 
            } 
          : s
      ));
    }

    // Helper to read file as base64
    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const timeout = setTimeout(() => {
          reject(new Error("File reading timed out"));
        }, 10000); // 10 second timeout

        reader.onload = () => {
          clearTimeout(timeout);
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
        reader.readAsDataURL(file);
      });
    };

    const processFileForApi = (file: File): Promise<{data: string, mimeType: string, url?: string, extractedText?: string}> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("File processing timed out"));
        }, 30000); // 30 second timeout for larger files

        if (file.name.toLowerCase().endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          parseWordDoc(file).then(parsed => {
            const text = parsed.sections.map(s => s.paragraphs.map(p => {
              if (p.type === 'table') return '[Table]';
              if (p.type === 'image') return '[Image]';
              if (p.type === 'formula') return '[Formula]';
              const para = p as DocParagraph;
              return para.runs?.map(r => r.text).join('') || para.text || '';
            }).join('\n')).join('\n\n');
            
            fileToBase64(file).then(base64 => {
              clearTimeout(timeout);
              resolve({ data: base64, mimeType: file.type, extractedText: text });
            }).catch(err => {
              clearTimeout(timeout);
              reject(err);
            });
          }).catch(err => {
            console.error("Failed to parse Word doc for API", err);
            fileToBase64(file).then(base64 => {
              clearTimeout(timeout);
              resolve({ data: base64, mimeType: file.type });
            }).catch(err2 => {
              clearTimeout(timeout);
              reject(err2);
            });
          });
          return;
        }

        fileToBase64(file).then(async base64 => {
          let uploadUrl;
          if (file.type.startsWith('image/')) {
            try {
              if (import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY) {
                const response = await new Promise<any>((res, rej) => {
                  imagekit.upload({
                    file: base64,
                    fileName: file.name || "upload.img",
                    tags: ["ai-doc-editor"]
                  } as any, (err: any, result: any) => {
                    if (err) rej(err);
                    else res(result);
                  });
                });
                uploadUrl = response.url;
              }
            } catch (err) {
              console.error("ImageKit upload failed:", err);
            }
          }
          clearTimeout(timeout);
          resolve({ data: base64, mimeType: file.type, url: uploadUrl });
        }).catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    };

    // Convert current attachments to base64 for the API call
    const currentAttachmentsWithData = await Promise.all(attachments.map(async att => {
      if (att.file) {
        try {
          const processed = await processFileForApi(att.file);
          return { ...att, data: processed.data, type: processed.mimeType, url: processed.url };
        } catch (e) {
          console.error("Failed to process file", e);
          return att;
        }
      }
      return att;
    }));

    let currentMessages = [...session.messages];
    if (!isRetry) {
      // Store attachments WITHOUT the large base64 data in history
      const historyAttachments = currentAttachmentsWithData.map(att => ({
        id: att.id,
        name: att.name,
        type: att.type,
        previewUrl: att.previewUrl,
        url: att.url
      }));
      const userMessage: ChatMessage = { role: "user", text: promptToUse, attachments: historyAttachments };
      currentMessages = [...currentMessages, userMessage];
      if (activeSessionIdRef.current === sessionId) {
        setMessages(currentMessages);
      }
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: currentMessages } : s));
    }
    
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isLoading: true } : s));

    try {
      let currentDocState = session.docState;
      
      // We no longer parse Word documents from attachments into docState.
      // The main document is uploaded via the central button.
      // Attachments are treated as reference materials.

      const userRequestText = promptToUse.trim() || (attachments.length > 0 ? "请处理我上传的文件并根据其内容更新文档。" : "");
      
      if (isAgentMode) {
        agentCancelRef.current = false;
        // --- PHASE 1: PLANNER ---
        const addModelPlaceholder = (prev: ChatMessage[]): ChatMessage[] => [...prev, { role: "model", text: "正在规划任务大纲...", steps: [], isStreaming: true }];
        if (activeSessionIdRef.current === sessionId) setMessages(addModelPlaceholder);
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: addModelPlaceholder(s.messages) } : s));
        
        const outlinePrompt = `You are a Planner Agent. The user wants to generate a large document or perform a complex task based on their request, the current document state, and any attached files.
USER REQUEST: ${userRequestText}

CURRENT DOCUMENT STATE:
${JSON.stringify(currentDocState)}

Your goal is to break this request into a sequence of highly granular, manageable tasks to ensure maximum detail and avoid AI laziness.

CRITICAL RULES:
1. YOU MUST NOT OUTPUT A SINGLE TASK. You MUST break the work down into AT LEAST 3-5 tasks. If you output a single task, you have failed.
2. If the user request contains a long list of items, sections, or points to expand, YOU MUST CREATE A SEPARATE TASK FOR EACH SECTION OR ITEM. Do not group them all into one task.
3. Each task should focus on a specific section, a specific set of points, or a specific range of content (e.g., "Detailed expansion of the 'Personal Experience' section", "In-depth summary of the first 10 pages of notes", "Expand on items 1 and 2 from the source material").
4. Tasks must be strictly sequential and collectively cover the entire user request without gaps.
5. For complex requests, aim for 5-12 granular tasks.

Output ONLY a valid JSON array of strings, where each string is a specific, detailed task description for the Writer Agent. Do not output markdown code blocks, just the JSON array.
Example: ["Write a detailed Introduction and Background", "Develop the first main chapter: Market Trends", "Develop the second main chapter: Competitive Landscape", "Write the detailed Conclusion and Recommendations"]`;

        const outlineContents = [
          {
            role: "user",
            parts: [
              ...(currentAttachmentsWithData.flatMap(att => {
                const parts = [];
                if (att.data && att.type && !att.type.includes('wordprocessingml.document')) {
                  parts.push({
                    inlineData: {
                      data: att.data!,
                      mimeType: att.type!
                    }
                  });
                }
                if (att.extractedText) {
                  parts.push({
                    text: `[Reference Document Content - ${att.name}]:\n${att.extractedText}`
                  });
                }
                parts.push({
                  text: `[Uploaded File: ${att.url || `attachment://${att.id}`}] (File Name: ${att.name})`
                });
                return parts;
              })),
              { text: outlinePrompt }
            ]
          }
        ];

        let outlineResponse;
        let outlineRetries = 0;
        const maxOutlineRetries = 3;
        while (outlineRetries < maxOutlineRetries) {
          try {
            outlineResponse = await aiRef.current.models.generateContent({
              model: selectedModel,
              contents: outlineContents as any,
              config: {
                responseMimeType: "application/json",
                ...(selectedModel === "gemini-3.1-pro-preview" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {}),
              }
            });
            break;
          } catch (error: any) {
            if (error.status === 429 && outlineRetries < maxOutlineRetries) {
              outlineRetries++;
              const delay = Math.pow(2, outlineRetries) * 1000;
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.error("Failed to generate outline:", error);
              throw error; // Let the outer catch block handle it
            }
          }
        }
        
        if (!outlineResponse) throw new Error("Failed to generate outline");

        let tasks: string[] = [];
        try {
          let rawText = outlineResponse.text || "[]";
          const match = rawText.match(/\[[\s\S]*\]/);
          if (match) {
            rawText = match[0];
          }
          tasks = JSON.parse(rawText);
          if (!Array.isArray(tasks)) tasks = [userRequestText];
        } catch (e) {
          console.error("Failed to parse outline", e);
          tasks = [userRequestText];
        }

        setAgentState({ isActive: true, tasks, currentIndex: 0, originalPrompt: userRequestText, sessionId });

        // --- PHASE 2: WRITER LOOP ---
        let loopDocState = currentDocState;
        let finalFullText = `已自动拆分为 ${tasks.length} 个子任务：\n` + tasks.map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n\n';
        
        for (let i = 0; i < tasks.length; i++) {
          if (agentCancelRef.current) break;
          const task = tasks[i];
          setAgentState(prev => prev.sessionId === sessionId ? { ...prev, currentIndex: i } : prev);
          
          const updateMessageText = (prev: ChatMessage[]): ChatMessage[] => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: finalFullText + `\n\n⏳ **正在执行任务 ${i + 1}/${tasks.length}:** ${task}...`, isStreaming: true };
            return newMsgs;
          };
          if (activeSessionIdRef.current === sessionId) setMessages(updateMessageText);
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: updateMessageText(s.messages) } : s));

          const taskPrompt = `You are a Writer Agent. We are generating a document step by step to ensure high quality and avoid laziness.
OVERALL GOAL: ${userRequestText}
PROGRESS: Task ${i + 1} of ${tasks.length}
COMPLETED TASKS SO FAR: ${i > 0 ? tasks.slice(0, i).join(' -> ') : 'None'}
CURRENT DOCUMENT STATE: ${JSON.stringify(loopDocState)}
YOUR CURRENT TASK: ${task}

Please generate ONLY the content for your current task. 
CRITICAL INSTRUCTIONS:
1. **NO LAZINESS**: You must provide full, rich, and detailed content. If the task asks for expansion, you MUST add significant new details, examples, and explanations. Do NOT just copy the source material or current document state.
2. **USE REFERENCE MATERIALS**: If the user uploaded reference materials, you MUST actively search through them to find relevant information, quotes, or examples to enrich your writing. Do not just rely on your internal knowledge.
3. **NO PLACEHOLDERS**: Never use "..." or "[Content continues...]" or similar. Write everything out.
4. **CONTEXT**: Maintain perfect consistency with the existing document state.
5. **OUTPUT FORMAT**: 
   - First, provide a brief explanation of what you are doing for this task in Chinese.
   - Then, provide the JSON update in a markdown code block (e.g., \`\`\`json ... \`\`\`).
   - Use type: "append" to add content to the end of the document, or "full" if you need to restructure or modify existing content. If modifying existing content, ensure you are actually expanding/improving it, not just repeating it.`;

          const taskContents = [
            {
              role: "user",
              parts: [
                ...(currentAttachmentsWithData.flatMap(att => {
                  const parts = [];
                  if (att.data && att.type && !att.type.includes('wordprocessingml.document')) {
                    parts.push({
                      inlineData: {
                        data: att.data!,
                        mimeType: att.type!
                      }
                    });
                  }
                  if (att.extractedText) {
                    parts.push({
                      text: `[Reference Document Content - ${att.name}]:\n${att.extractedText}`
                    });
                  }
                  parts.push({
                    text: `[Uploaded File: ${att.url || `attachment://${att.id}`}] (File Name: ${att.name})`
                  });
                  return parts;
                })),
                { text: taskPrompt }
              ]
            }
          ];

          let taskResponseStream;
          let retries = 0;
          const maxRetries = 3;
          while (retries < maxRetries) {
            try {
              taskResponseStream = await aiRef.current.models.generateContentStream({
                model: selectedModel,
                contents: taskContents as any,
                config: {
                  systemInstruction: SYSTEM_INSTRUCTION,
                  ...(selectedModel === "gemini-3.1-pro-preview" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {}),
                }
              });
              break;
            } catch (error: any) {
              if (error.status === 429 && retries < maxRetries) {
                retries++;
                const delay = Math.pow(2, retries) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw error;
              }
            }
          }
          
          if (!taskResponseStream) throw new Error("Failed to generate content stream");

          let taskText = "";
          for await (const chunk of taskResponseStream) {
            if (agentCancelRef.current) break;
            taskText += chunk.text;
          }

          // Parse and apply update
          let explanation = "";
          try {
            const jsonMatch = taskText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              explanation = taskText.substring(0, jsonMatch.index).trim();
              const jsonStr = jsonMatch[1];
              const parsed = JSON.parse(jsonStr);
              loopDocState = applyUpdate(parsed, loopDocState);
              
              if (activeSessionIdRef.current === sessionId) {
                setDocState(loopDocState);
                pushToHistory(loopDocState);
              }
              setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, docState: loopDocState } : s));
            } else {
              // Fallback if no JSON block found
              explanation = taskText;
            }
          } catch (e) {
            console.error(`Failed to parse JSON for task ${i + 1}`, e);
            explanation = taskText;
          }

          finalFullText += `\n\n✅ **任务 ${i + 1} 完成:** ${task}\n${explanation ? `> ${explanation.split('\n').join('\n> ')}` : ""}`;
          
          const finishTaskMessage = (prev: ChatMessage[]): ChatMessage[] => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: finalFullText, isStreaming: i < tasks.length - 1 };
            return newMsgs;
          };
          if (activeSessionIdRef.current === sessionId) setMessages(finishTaskMessage);
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: finishTaskMessage(s.messages) } : s));
        }
        
        setAgentState(prev => prev.sessionId === sessionId ? { ...prev, isActive: false } : prev);
        
        const finalMessagesUpdater = (prev: ChatMessage[]): ChatMessage[] => {
          const newMessages = [...prev];
          if (newMessages.length > 0) {
            newMessages[newMessages.length - 1] = { 
              role: "model", 
              text: finalFullText + (agentCancelRef.current ? "\n\n⚠️ **深度生成已取消。**" : "\n\n🎉 **所有任务已完成！**"),
              isStreaming: false
            };
          }
          return newMessages;
        };

        if (activeSessionIdRef.current === sessionId) {
          setMessages(finalMessagesUpdater);
        }
        
        const finalMessages = finalMessagesUpdater(addModelPlaceholder(currentMessages));
        syncSession(sessionId, loopDocState, finalMessages, "", sessionDocId, sessionShowCode, isAgentMode);
        saveCurrentDoc(loopDocState, finalMessages, sessionDocId);

      } else {
        const contextPrompt = `CURRENT DOCUMENT STATE: ${JSON.stringify(currentDocState)}\n\nUSER REQUEST: ${userRequestText}`;

        // Limit history to last 10 messages and remove images from older messages to save memory
        const historyToKeep = currentMessages.slice(-10, -1);
        
        const contents = [
          ...historyToKeep.map((m, idx) => {
            // Note: History messages no longer have 'data' (base64) to save memory
            return {
              role: m.role,
              parts: [
                ...(m.attachments?.map(att => ({
                  text: `[Uploaded Image URL: ${att.url || `attachment://${att.id}`}] (File Name: ${att.name})`
                })) || []),
                { text: m.text || (m.role === 'user' && m.attachments && m.attachments.length > 0 ? "（上传了文件）" : "") }
              ]
            };
          }),
          {
            role: "user",
            parts: [
              ...(currentAttachmentsWithData.flatMap(att => {
                const parts = [];
                if (att.data && att.type && !att.type.includes('wordprocessingml.document')) {
                  parts.push({
                    inlineData: {
                      data: att.data!,
                      mimeType: att.type!
                    }
                  });
                }
                if (att.extractedText) {
                  parts.push({
                    text: `[Reference Document Content - ${att.name}]:\n${att.extractedText}`
                  });
                }
                parts.push({
                  text: `[Uploaded File: ${att.url || `attachment://${att.id}`}] (File Name: ${att.name})`
                });
                return parts;
              })),
              { text: contextPrompt }
            ]
          }
        ];

      let responseStream;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          responseStream = await aiRef.current.models.generateContentStream({
            model: selectedModel,
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              ...(selectedModel === "gemini-3.1-pro-preview" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {}),
            }
          });
          break;
        } catch (error: any) {
          if (error.status === 429 && retries < maxRetries) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        }
      }
      
      let fullText = "";
      let currentSteps: string[] = [];
      
      const addModelPlaceholder = (prev: ChatMessage[]): ChatMessage[] => [...prev, { role: "model", text: "", steps: [], isStreaming: true }];
      if (activeSessionIdRef.current === sessionId) {
        setMessages(addModelPlaceholder);
      }
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: addModelPlaceholder(s.messages) } : s));

      let previewTriggered = false;
      if (responseStream) {
        for await (const chunk of responseStream) {
          const chunkText = chunk.text;
          if (chunkText) {
            fullText += chunkText;
            
            if (fullText.includes("```") && !previewTriggered && activeSessionIdRef.current === sessionId) {
              previewTriggered = true;
              sessionShowCode = true;
              setShowCode(true);
              if (isMobile) setActiveTab("preview");
            }
            
            const stepMatches = Array.from(fullText.matchAll(/<step>(.*?)<\/step>/g));
            currentSteps = stepMatches.map(m => m[1]);
            
            let cleanText = fullText.replace(/<step>.*?<\/step>\n?/g, "");
            const codeBlockStart = cleanText.indexOf("```");
            if (codeBlockStart !== -1) {
              cleanText = cleanText.substring(0, codeBlockStart);
            }
            
            const messagesUpdater = (prev: ChatMessage[]): ChatMessage[] => {
              const newMessages = [...prev];
              if (newMessages.length > 0) {
                newMessages[newMessages.length - 1] = { 
                  role: "model", 
                  text: cleanText.trim() || "Working on your request...",
                  steps: currentSteps,
                  isStreaming: true
                };
              }
              return newMessages;
            };

            let jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/) || fullText.match(/```\n([\s\S]*?)\n```/);
            let currentJson = "";
            if (!jsonMatch) {
              const partialJsonMatch = fullText.match(/```json\n([\s\S]*)$/) || fullText.match(/```\n([\s\S]*)$/);
              if (partialJsonMatch) currentJson = partialJsonMatch[1];
            } else {
              currentJson = jsonMatch[1];
            }

            if (activeSessionIdRef.current === sessionId) {
              setMessages(messagesUpdater);
              if (currentJson) setLastJson(currentJson);
            }
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: messagesUpdater(s.messages), lastJson: currentJson || s.lastJson, showCode: sessionShowCode } : s));
          }
        }
      }

      let jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/) || fullText.match(/```\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        const rawJsonMatch = fullText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (rawJsonMatch) {
          try {
            JSON.parse(rawJsonMatch[1]);
            jsonMatch = [rawJsonMatch[0], rawJsonMatch[1]] as any;
          } catch (e) {}
        }
      }

      let cleanText = fullText.replace(/<step>.*?<\/step>\n?/g, "");
      cleanText = cleanText.replace(/```json\n([\s\S]*?)\n```/g, "");
      cleanText = cleanText.replace(/```\n([\s\S]*?)\n```/g, "");
      
      let finalDocState = currentDocState;
      let finalJson = "";

      if (jsonMatch) {
        let jsonStr = jsonMatch[1].trim();
        
        finalJson = jsonStr;
        try {
          const update = JSON.parse(jsonStr);
          const nextState = applyUpdate(update, currentDocState);
          if (nextState) finalDocState = nextState;
          if (activeSessionIdRef.current === sessionId) {
            setLastJson(jsonStr);
            setTimeout(() => {
              if (activeSessionIdRef.current === sessionId) {
                setShowCode(false);
              }
            }, 1000);
          }
          sessionShowCode = false;
        } catch (e) {
          try {
            const fixedJson = jsonStr
              .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
              .replace(/:\s*'([^']*)'/g, ': "$1"');
            const update = JSON.parse(fixedJson);
            const nextState = applyUpdate(update, currentDocState);
            if (nextState) finalDocState = nextState;
            finalJson = fixedJson;
            if (activeSessionIdRef.current === sessionId) {
              setLastJson(fixedJson);
              setTimeout(() => {
                if (activeSessionIdRef.current === sessionId) {
                  setShowCode(false);
                }
              }, 1000);
            }
            sessionShowCode = false;
          } catch (e2) {}
        }
      }

      const finalMessagesUpdater = (prev: ChatMessage[]): ChatMessage[] => {
        const newMessages = [...prev];
        if (newMessages.length > 0) {
          newMessages[newMessages.length - 1] = { 
            role: "model", 
            text: cleanText.trim() || "Document updated successfully.",
            steps: currentSteps,
            isStreaming: false
          };
        }
        return newMessages;
      };

      if (activeSessionIdRef.current === sessionId) {
        setMessages(finalMessagesUpdater);
        setDocState(finalDocState);
        pushToHistory(finalDocState);
      }
      
      const finalMessages = finalMessagesUpdater(addModelPlaceholder(currentMessages));
      syncSession(sessionId, finalDocState, finalMessages, finalJson, sessionDocId, sessionShowCode, isAgentMode);
      saveCurrentDoc(finalDocState, finalMessages, sessionDocId);
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      const errorUpdater = (prev: ChatMessage[]): ChatMessage[] => {
        const newMessages = [...prev];
        const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));
        const displayMsg = `Sorry, I encountered an error:\n\`\`\`\n${errorMsg}\n\`\`\`\n\nPlease try again.`;
        if (newMessages.length > 0) {
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === "user") {
            newMessages.push({
              role: "model",
              text: displayMsg,
              isStreaming: false
            });
          } else {
            newMessages[newMessages.length - 1] = { 
              role: "model", 
              text: displayMsg,
              isStreaming: false
            };
          }
        }
        return newMessages;
      };
      if (activeSessionIdRef.current === sessionId) {
        setMessages(errorUpdater);
      }
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: errorUpdater(s.messages) } : s));
    } finally {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isLoading: false } : s));
    }
  };

  const handleRetry = (index: number) => {
    const msg = messages[index];
    if (msg && msg.role === "model") {
      let lastUserMessage = "";
      let lastAttachments: ChatAttachment[] = [];
      for (let i = index - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserMessage = messages[i].text;
          lastAttachments = messages[i].attachments || [];
          break;
        }
      }
      
      if (lastUserMessage || lastAttachments.length > 0) {
        // Remove the model message and any subsequent messages
        setMessages(prev => prev.slice(0, index));
        handleSendMessage(lastUserMessage, lastAttachments, true);
      }
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleResetColors = () => {
    setConfirmAction({
      message: "Remove all custom colors from the document?",
      action: () => {
        setDocState(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          next.sections = (next.sections || []).map((section: any) => ({
            ...section,
            paragraphs: (section.paragraphs || []).map((p: any) => {
              const { color, ...rest } = p;
              return rest;
            })
          }));
          saveCurrentDoc(next);
          pushToHistory(next);
          return next;
        });
        setConfirmAction(null);
      }
    });
  };

  const handleExport = () => {
    handleDownload(docState);
  };

  const handleReset = () => {
    setConfirmAction({
      message: "Are you sure you want to start a new document? This will clear your current work.",
      action: () => {
        setDocState(INITIAL_DOC_STATE);
        setMessages([]);
        setLastJson("");
        setCurrentDocId(null);
        setHistory({ index: 0, stack: [INITIAL_DOC_STATE] });
        setConfirmAction(null);
      }
    });
  };

  const updateFocusedBlock = (updates: any) => {
    if (!focusedBlock) return;
    setDocState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const section = next.sections[focusedBlock.s];
      const p = section.paragraphs[focusedBlock.p];
      
      if (p.type === 'table') return prev;

      for (const key in updates) {
        if (['isBold', 'isItalic'].includes(key)) {
          (p as any)[key] = !(p as any)[key];
        } else if (['isBullet', 'isNumbering'].includes(key)) {
          const newVal = !(p as any)[key];
          (p as any)[key] = newVal;
          if (newVal) {
            const other = key === 'isBullet' ? 'isNumbering' : 'isBullet';
            (p as any)[other] = false;
          }
        } else {
          (p as any)[key] = updates[key];
        }
      }
      
      saveCurrentDoc(next);
      pushToHistory(next);
      return next;
    });
  };

  const handleFormatPainterClick = () => {
    if (!focusedBlock) return;
    
    if (isFormatPainterActive) {
      // Turn off
      setIsFormatPainterActive(false);
      setCopiedFormat(null);
    } else {
      // Turn on and copy format
      const p = docState.sections[focusedBlock.s].paragraphs[focusedBlock.p];
      if (p.type === 'table') return;
      const para = p as DocParagraph;
      setCopiedFormat({
        isBold: para.isBold,
        isItalic: para.isItalic,
        color: para.color,
        fontFamily: para.fontFamily,
        alignment: para.alignment,
        isHeading: para.isHeading,
        headingLevel: para.headingLevel,
        isBullet: para.isBullet,
        isNumbering: para.isNumbering
      });
      setIsFormatPainterActive(true);
    }
  };

  const applyFormatPainter = (sIdx: number, pIdx: number) => {
    if (!isFormatPainterActive || !copiedFormat) return;
    
    setDocState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next.sections[sIdx].paragraphs[pIdx];
      
      // Apply copied format
      Object.assign(p, copiedFormat);
      
      saveCurrentDoc(next);
      pushToHistory(next);
      return next;
    });
    
    // Turn off after one use (standard format painter behavior)
    setIsFormatPainterActive(false);
    setCopiedFormat(null);
  };

  const deleteFocusedBlock = () => {
    if (!focusedBlock) return;
    setDocState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.sections[focusedBlock.s].paragraphs.splice(focusedBlock.p, 1);
      saveCurrentDoc(next);
      pushToHistory(next);
      return next;
    });
    setFocusedBlock(null);
  };

  const generatePngPlaceholder = (text: string): string => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return "";
      
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, 800, 400);
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const safeText = text.length > 40 ? text.substring(0, 40) + '...' : text;
      ctx.fillText(safeText, 400, 200);
      
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error("Failed to generate placeholder", e);
      return "";
    }
  };

  const resolveImageUrl = (src: string, alt?: string) => {
    if (!src) {
      if (alt) {
        return generatePngPlaceholder(alt);
      }
      return "";
    }
    if (src.startsWith("attachment://")) {
      const id = src.replace("attachment://", "");
      // Look through all sessions for the attachment
      for (const session of sessions) {
        for (const msg of session.messages) {
          const att = msg.attachments?.find(a => a.id === id);
          if (att?.url) return att.url;
          if (att?.previewUrl) return att.previewUrl;
        }
      }
      // Fallback if attachment not found
      return generatePngPlaceholder(alt || "Image not found");
    }
    // Fallback for invalid URLs (e.g. AI generated Chinese text as src)
    if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("blob:")) {
      return generatePngPlaceholder(src || alt || "Placeholder");
    }
    return src;
  };

  const handleDownload = async (stateToDownload?: DocumentState) => {
    const state = stateToDownload || docState;
    
    const resolveImageForWord = async (src: string, alt?: string): Promise<Uint8Array | string | null> => {
      let finalSrc = src;
      
      if (!src) {
        if (alt) {
          finalSrc = generatePngPlaceholder(alt);
        } else {
          return null;
        }
      } else if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("blob:") && !src.startsWith("attachment://")) {
        finalSrc = generatePngPlaceholder(src || alt || "Placeholder");
      }

      if (finalSrc.startsWith("attachment://")) {
        const id = finalSrc.replace("attachment://", "");
        let file: File | undefined;
        let url: string | undefined;
        let previewUrl: string | undefined;
        
        for (const session of sessions) {
          for (const msg of session.messages) {
            const att = msg.attachments?.find(a => a.id === id);
            if (att?.file) {
              file = att.file;
            }
            if (att?.url) {
              url = att.url;
            }
            if (att?.previewUrl) {
              previewUrl = att.previewUrl;
            }
            if (file || url || previewUrl) break;
          }
          if (file || url || previewUrl) break;
        }

        if (file) {
          const buffer = await file.arrayBuffer();
          return new Uint8Array(buffer);
        } else if (url) {
          finalSrc = url;
        } else if (previewUrl) {
          try {
            const response = await fetch(previewUrl);
            const buffer = await response.arrayBuffer();
            return new Uint8Array(buffer);
          } catch (e) {
            console.error("Failed to fetch blob url", e);
            finalSrc = generatePngPlaceholder(alt || "Image not found");
          }
        } else {
           // Fallback if attachment not found
           finalSrc = generatePngPlaceholder(alt || "Image not found");
        }
      }
      
      if (finalSrc.startsWith("http")) {
        try {
          const response = await fetch(finalSrc);
          const buffer = await response.arrayBuffer();
          return new Uint8Array(buffer);
        } catch (e) {
          console.error("Failed to fetch image for Word doc:", e);
          return null;
        }
      } else if (finalSrc.startsWith("data:")) {
        try {
          const base64Data = finalSrc.split(',')[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        } catch (e) {
          console.error("Failed to parse data URI for Word doc:", e);
          return null;
        }
      }
      return null;
    };

    await generateWordDoc(state, resolveImageForWord);
  };

  const handleTextEdit = (sIdx: number, pIdx: number, rIdx: number, newText: string | null, cellInfo?: { r: number, c: number, cp: number, cr: number }) => {
    if (newText === null) return;
    setDocState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next.sections[sIdx].paragraphs[pIdx];
      
      if (cellInfo) {
        // Table cell edit
        const table = p as DocTable;
        if (!table.rows?.[cellInfo.r]?.cells?.[cellInfo.c]) return prev;
        const cell = table.rows[cellInfo.r].cells[cellInfo.c];
        if (!cell.content?.[cellInfo.cp]) return prev;
        const cellPara = cell.content[cellInfo.cp];
        if (cellInfo.cr >= 0 && cellPara.runs && cellPara.runs[cellInfo.cr]) {
          cellPara.runs[cellInfo.cr].text = newText;
        } else {
          cellPara.text = newText;
        }
      } else {
        // Normal paragraph edit
        const para = p as DocParagraph;
        if (rIdx >= 0 && para.runs) {
          para.runs[rIdx].text = newText;
        } else {
          para.text = newText;
        }
      }
      
      saveCurrentDoc(next);
      pushToHistory(next);
      setSessions(prevSessions => prevSessions.map(s => 
        s.id === activeSessionIdRef.current ? { ...s, docState: next } : s
      ));
      return next;
    });
  };

const MathText = ({ text, className, style, contentEditable, onBlur, isFocused }: any) => {
  const hasMath = text?.includes('$');
  
  if (hasMath && !isFocused) {
    return (
      <span className={cn("inline-block", className)} style={style}>
        <Markdown 
          remarkPlugins={[remarkMath]} 
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }: any) => <span className="inline">{children}</span>
          }}
        >
          {text}
        </Markdown>
      </span>
    );
  }

  return (
    <span
      contentEditable={contentEditable}
      suppressContentEditableWarning
      onBlur={onBlur}
      className={className}
      style={style}
    >
      {text}
    </span>
  );
};

  const documentContent = useMemo(() => (
    <motion.div 
      layout
      className={cn(
        "max-w-[816px] mx-auto shadow-2xl min-h-[1056px] relative transition-colors duration-500 origin-top border",
        "bg-white text-gray-900",
        isMobile ? "p-4 mx-4 mb-4 rounded-xl" : "p-8 md:p-[96px]",
        isFormatPainterActive && "cursor-copy"
      )}
    >
      <div className="space-y-6">
        {docState.sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-4">
            {section.paragraphs.map((p, pIdx) => {
              if (p.type === 'table') {
                const table = p as DocTable;
                return (
                  <div key={pIdx} className="overflow-x-auto my-4">
                    <table 
                      className={cn(
                        "w-full border-collapse",
                        table.border && "border border-gray-300"
                      )}
                      style={{ width: table.width || '100%' }}
                    >
                      <tbody>
                        {(table.rows || []).map((row, rIdx) => (
                          <tr key={rIdx}>
                            {(row.cells || []).map((cell, cIdx) => (
                              <td 
                                key={cIdx}
                                className={cn(
                                  "p-2 border border-gray-300",
                                  cell.isHeader && "font-bold bg-gray-50"
                                )}
                                style={{ 
                                  backgroundColor: cell.backgroundColor,
                                  verticalAlign: cell.verticalAlign || 'top'
                                }}
                              >
                                {(cell.content || []).map((cp, cpIdx) => (
                                  <div key={cpIdx} className={cn(
                                    !cp.fontSize && "text-sm",
                                    cp.isBold && "font-bold",
                                    cp.isItalic && "italic",
                                    cp.alignment === 'center' && "text-center",
                                    cp.alignment === 'right' && "text-right",
                                    cp.alignment === 'justify' && "text-justify"
                                  )}
                                  style={{ fontSize: cp.fontSize, color: cp.color, fontFamily: cp.fontFamily }}>
                                    {cp.runs ? (
                                      (cp.runs || []).map((run, crIdx) => (
                                        <MathText
                                          key={crIdx}
                                          text={run.text}
                                          contentEditable
                                          onBlur={(e: any) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent, { r: rIdx, c: cIdx, cp: cpIdx, cr: crIdx })}
                                          className={cn(
                                            "outline-none",
                                            run.isBold && "font-bold",
                                            run.isItalic && "italic",
                                            run.subscript && "text-[0.75em] align-sub",
                                            run.superscript && "text-[0.75em] align-super"
                                          )}
                                          style={{ color: run.color, fontFamily: run.fontFamily, fontSize: run.fontSize }}
                                          isFocused={focusedBlock?.s === sIdx && focusedBlock?.p === pIdx}
                                        />
                                      ))
                                    ) : (
                                      <MathText
                                        text={cp.text}
                                        contentEditable
                                        onBlur={(e: any) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent, { r: rIdx, c: cIdx, cp: cpIdx, cr: -1 })}
                                        className={cn(
                                          "outline-none block min-h-[1em]",
                                          cp.subscript && "text-[0.75em] align-sub",
                                          cp.superscript && "text-[0.75em] align-super"
                                        )}
                                        isFocused={focusedBlock?.s === sIdx && focusedBlock?.p === pIdx}
                                      />
                                    )}
                                  </div>
                                ))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              if (p.type === 'image') {
                const img = p as DocImage;
                const alignmentClass = {
                  left: "justify-start",
                  center: "justify-center",
                  right: "justify-end"
                }[img.alignment || "center"];
                
                return (
                  <div key={pIdx} className={cn("flex w-full my-4", alignmentClass)}>
                    <figure className="max-w-full flex flex-col items-center">
                      <img 
                        src={resolveImageUrl(img.src, img.alt)} 
                        alt={img.alt || ""} 
                        width={img.width}
                        height={img.height}
                        className="max-w-full h-auto rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        referrerPolicy="no-referrer"
                        onClick={() => setSelectedImage(resolveImageUrl(img.src, img.alt))}
                      />
                      {img.caption && (
                        <figcaption className="mt-2 text-sm text-gray-500 text-center">
                          {img.caption}
                        </figcaption>
                      )}
                    </figure>
                  </div>
                );
              }

              const para = p as DocParagraph;
              const alignmentClass = {
                left: "text-left",
                center: "text-center",
                right: "text-right",
                justify: "text-justify"
              }[para.alignment || "left"];

              const isFocused = focusedBlock?.s === sIdx && focusedBlock?.p === pIdx;
              const focusClass = isFocused ? "ring-2 ring-blue-400/50 rounded bg-blue-50/30" : "border border-transparent hover:border-gray-200 rounded";

              const handleBlockClick = () => {
                if (isFormatPainterActive) {
                  applyFormatPainter(sIdx, pIdx);
                } else {
                  setFocusedBlock({s: sIdx, p: pIdx});
                }
              };

              if (para.isHeading) {
                const level = para.headingLevel || 1;
                const headingSize = {
                  1: "text-3xl font-bold mb-6",
                  2: "text-2xl font-bold mb-4",
                  3: "text-xl font-bold mb-3",
                  4: "text-lg font-bold mb-2",
                  5: "text-base font-bold mb-1",
                  6: "text-sm font-bold mb-1",
                }[level as 1|2|3|4|5|6];

                const className = cn(headingSize, alignmentClass, focusClass, "outline-none p-1 transition-all");
                const style = { color: para.color, fontFamily: para.fontFamily, fontSize: para.fontSize };

                const renderHeadingContent = () => {
                  if (para.runs) {
                    return para.runs.map((r, i) => (
                      <MathText
                        key={i}
                        text={r.text}
                        style={{ color: r.color, fontFamily: r.fontFamily, fontSize: r.fontSize }}
                        className={cn(
                          r.isBold && "font-bold",
                          r.isItalic && "italic",
                          r.subscript && "text-[0.75em] align-sub",
                          r.superscript && "text-[0.75em] align-super",
                          "outline-none"
                        )}
                        contentEditable
                        onBlur={(e: any) => handleTextEdit(sIdx, pIdx, i, e.currentTarget.textContent)}
                        isFocused={isFocused}
                      />
                    ));
                  }
                  return (
                    <MathText
                      text={para.text}
                      contentEditable
                      onBlur={(e: any) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent)}
                      className="outline-none block min-h-[1.2em]"
                      isFocused={isFocused}
                    />
                  );
                };

                switch (level) {
                  case 1: return <h1 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h1>;
                  case 2: return <h2 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h2>;
                  case 3: return <h3 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h3>;
                  case 4: return <h4 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h4>;
                  case 5: return <h5 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h5>;
                  case 6: return <h6 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h6>;
                  default: return <h1 key={pIdx} onClick={handleBlockClick} className={className} style={style}>{renderHeadingContent()}</h1>;
                }
              }

              return (
                <div 
                  key={pIdx} 
                  onClick={handleBlockClick}
                  className={cn(
                    "flex items-start gap-3 p-1 transition-all",
                    alignmentClass,
                    focusClass,
                    para.isBullet && "pl-6",
                    para.isNumbering && "pl-6"
                  )}
                >
                  {para.isBullet && (
                    <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", darkMode ? "bg-gray-400" : "bg-gray-600")} />
                  )}
                  {para.isNumbering && (
                    <span className={cn("font-medium min-w-[1.25rem]", darkMode ? "text-gray-400" : "text-gray-600")}>
                      {section.paragraphs.slice(0, pIdx + 1).filter(prev => prev.type !== 'table' && (prev as DocParagraph).isNumbering).length}.
                    </span>
                  )}
                  <p 
                    className={cn(
                      "leading-[1.5] flex-1 outline-none",
                      !para.fontSize && "text-[11pt]",
                      para.isBold && "font-bold",
                      para.isItalic && "italic",
                      !para.color && "text-gray-900"
                    )}
                    style={{ color: para.color, fontFamily: para.fontFamily, fontSize: para.fontSize }}
                  >
                    {para.runs ? (
                      para.runs.map((run, rIdx) => (
                        <MathText
                          key={rIdx}
                          text={run.text}
                          contentEditable
                          onBlur={(e: any) => handleTextEdit(sIdx, pIdx, rIdx, e.currentTarget.textContent)}
                          className={cn(
                            "outline-none",
                            run.isBold && "font-bold",
                            run.isItalic && "italic",
                            run.subscript && "text-[0.75em] align-sub",
                            run.superscript && "text-[0.75em] align-super"
                          )}
                          style={{ color: run.color, fontFamily: run.fontFamily, fontSize: run.fontSize }}
                          isFocused={isFocused}
                        />
                      ))
                    ) : (
                      <MathText
                        text={para.text}
                        contentEditable
                        onBlur={(e: any) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent)}
                        className={cn(
                          "outline-none block min-h-[1.2em]",
                          para.subscript && "text-[0.75em] align-sub",
                          para.superscript && "text-[0.75em] align-super"
                        )}
                        isFocused={isFocused}
                      />
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {docState.sections.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 pointer-events-none opacity-20">
          <FileEdit size={64} />
          <p className="mt-4 font-medium">Document is empty</p>
        </div>
      )}
    </motion.div>
  ), [docState, focusedBlock, isMobile, isFormatPainterActive, darkMode, copiedFormat]);

  return (
    <AnimatePresence mode="wait">
      {!splashComplete ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className={cn(
            "fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden",
            darkMode ? "bg-[#0f172a]" : "bg-white"
          )}
        >
          {/* Background decorative elements */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
            className="absolute w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px]"
          />
          
          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2
              }}
              className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/40 mb-8"
            >
              <Wand2 size={48} />
            </motion.div>
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-center"
            >
              <h1 className={cn(
                "text-4xl font-bold tracking-tighter mb-2",
                darkMode ? "text-white" : "text-slate-900"
              )}>
                AI Word Sandbox
              </h1>
              <p className={cn(
                "text-lg font-medium opacity-60",
                darkMode ? "text-blue-200" : "text-blue-600"
              )}>
                Crafting documents with intelligence
              </p>
            </motion.div>
            
            <div className="mt-12 w-48 h-1.5 bg-slate-200/20 rounded-full overflow-hidden relative">
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: (isAuthReady && minSplashTimeReached) ? "0%" : "-20%" }}
                transition={{ 
                  duration: 1.5, 
                  ease: (isAuthReady && minSplashTimeReached) ? "easeOut" : "easeInOut",
                  repeat: (isAuthReady && minSplashTimeReached) ? 0 : Infinity,
                  repeatType: "loop"
                }}
                onAnimationComplete={() => {
                  if (isAuthReady && minSplashTimeReached) {
                    setTimeout(() => setSplashComplete(true), 500);
                  }
                }}
                className="absolute inset-0 bg-blue-600 rounded-full"
              />
            </div>
            
            {(!isAuthReady || !minSplashTimeReached) && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-sm font-medium opacity-40 text-slate-400"
              >
                Initializing workspace...
              </motion.p>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div 
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className={cn(
            "flex flex-col h-screen overflow-hidden transition-colors duration-700 relative",
            darkMode ? "text-[#E0E0E0] dark" : "text-[#202124]"
          )}
        >
          {/* Global Agent Mode Background & Light Effect */}
          <AnimatePresence>
            {isAgentMode && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className={cn(
                  "absolute inset-0 pointer-events-none z-0 overflow-hidden",
                  darkMode ? "agent-mode-bg-dark" : "agent-mode-bg-light"
                )}
              >
                <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] bg-pink-400/15 blur-[140px] rounded-full" />
                <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] bg-cyan-400/15 blur-[140px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-purple-500/5 blur-[180px] rounded-full" />
              </motion.div>
            )}
          </AnimatePresence>
      {/* Background Layers for Smooth Transition */}
      <div className={cn(
        "absolute inset-0 z-[-2] transition-opacity duration-700 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#0f172a] pointer-events-none",
        darkMode ? "opacity-100" : "opacity-0"
      )} />
      <div className={cn(
        "absolute inset-0 z-[-2] transition-opacity duration-700 bg-gradient-to-br from-[#f8f9ff] via-[#eef2ff] to-[#f8f9ff] pointer-events-none",
        darkMode ? "opacity-0" : "opacity-100"
      )} />

      {/* Atmospheric Background */}
      <div className={cn(
        "absolute inset-0 z-[-10] overflow-hidden pointer-events-none transition-opacity duration-700",
        isMobile && "opacity-40",
        isAgentMode && "opacity-0"
      )}>
        <div className={cn(
          "absolute -top-[10%] -left-[5%] w-[60%] h-[60%] rounded-full filter blur-[120px] animate-blob",
          darkMode ? "bg-indigo-600/40 opacity-70 mix-blend-screen" : "bg-blue-300/60 opacity-90 mix-blend-soft-light"
        )} style={{ animationDuration: '8s' }} />
        <div className={cn(
          "absolute top-[15%] -right-[5%] w-[50%] h-[70%] rounded-full filter blur-[120px] animate-blob",
          darkMode ? "bg-purple-600/40 opacity-70 mix-blend-screen" : "bg-purple-300/60 opacity-90 mix-blend-soft-light"
        )} style={{ animationDuration: '12s', animationDelay: '2s' }} />
        <div className={cn(
          "absolute -bottom-[15%] left-[15%] w-[70%] h-[60%] rounded-full filter blur-[120px] animate-blob",
          darkMode ? "bg-blue-600/40 opacity-70 mix-blend-screen" : "bg-indigo-300/60 opacity-90 mix-blend-soft-light"
        )} style={{ animationDuration: '10s', animationDelay: '4s' }} />
        {/* Brighter Light Blobs */}
        <div className={cn(
          "absolute top-[30%] left-[20%] w-[40%] h-[40%] rounded-full filter blur-[100px] animate-blob",
          darkMode ? "bg-blue-400/30 opacity-50 mix-blend-screen" : "bg-white/100 opacity-100 mix-blend-normal shadow-[0_0_100px_rgba(255,255,255,0.5)]"
        )} style={{ animationDuration: '15s', animationDelay: '1s' }} />
      </div>

      {/* Global Header */}
      <header className={cn(
        "shrink-0 z-50 transition-colors duration-500 relative border-b backdrop-blur-md",
        darkMode ? "border-white/10 bg-[#1A1A1A]/80" : "border-black/5 bg-white/80",
        isAgentMode && (darkMode ? "bg-zinc-950/40" : "bg-white/40")
      )}>
        {/* Top Bar - Transparent Background */}
        <div className={cn(
          "flex items-center justify-between px-4 py-2 border-b transition-colors duration-500 backdrop-blur-sm",
          darkMode ? "bg-transparent border-white/10" : "bg-transparent border-black/5",
          isAgentMode && "shadow-none"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Wand2 size={18} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">AI Word Sandbox</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
              className={cn(
                "p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold",
                darkMode ? "hover:bg-[#333] text-blue-400" : "hover:bg-gray-100 text-blue-600"
              )}
              title={t.switchLang}
            >
              <Languages size={18} />
              {lang === 'en' ? "EN" : "ZH"}
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                darkMode ? "hover:bg-[#333] text-yellow-400" : "hover:bg-gray-100 text-gray-500"
              )}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-inherit ml-1">
                <button 
                  onClick={() => {
                    const next = !showHistory;
                    setShowHistory(next);
                    if (next) setActiveTab("chat");
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors mr-1",
                    showHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 dark:hover:bg-[#333] text-gray-500"
                  )}
                  title={t.myDocs}
                >
                  <History size={16} />
                </button>
                <img src={user.photoURL || ""} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-300" />
                {!isMobile && (
                  <div className="flex flex-col overflow-hidden max-w-[120px]">
                    <span className="text-[10px] font-medium truncate">{user.displayName}</span>
                    <span className="text-[8px] opacity-60 truncate">{user.email}</span>
                  </div>
                )}
                <button 
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors text-gray-400"
                  title={t.logout}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
              >
                <LogIn size={16} />
                <span>{t.loginWithGoogle}</span>
              </button>
            )}
          </div>
        </div>

        {/* Session Tabs - Global (Moved above mobile switcher) */}
        <div className={cn(
          "flex items-center gap-1 px-4 py-2 overflow-x-auto custom-scrollbar shrink-0 z-30 transition-all duration-500 backdrop-blur-2xl",
          darkMode ? "bg-zinc-900/80 text-white shadow-lg" : "bg-white/90 text-gray-900 shadow-sm",
          isAgentMode && "shadow-none"
        )}>
          {sessions.map(s => (
                <div 
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border shrink-0",
                    activeSessionId === s.id 
                      ? (darkMode ? "bg-blue-600 text-white border-blue-500 shadow-md" : "bg-blue-600 text-white border-blue-500 shadow-md")
                      : (darkMode ? "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10" : "bg-white border-zinc-200 text-gray-600 hover:bg-zinc-50")
                  )}
                  onClick={() => {
                    const session = sessions.find(sess => sess.id === s.id);
                    if (session) {
                      setActiveSessionId(s.id);
                      activeSessionIdRef.current = s.id; // Immediate update
                      setDocState(session.docState);
                      setMessages(session.messages);
                      setLastJson(session.lastJson);
                      setShowCode(session.showCode);
                      setIsAgentMode(session.isAgentMode);
                      setCurrentDocId(session.currentDocId);
                    }
                  }}
                >
                  <FileText size={16} />
                  <span className="max-w-[100px] truncate">{s.docState.title}</span>
                  
                  <div className={cn(
                    "flex items-center gap-1 transition-opacity",
                    activeSessionId === s.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(s.docState); }}
                      className={cn(
                        "p-1.5 rounded transition-colors flex items-center justify-center",
                        activeSessionId === s.id ? "hover:bg-white/20 text-white" : "hover:bg-black/10 text-gray-500"
                      )}
                      title={t.export}
                    >
                      <Download size={16} />
                    </button>

                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    deleteSession(s.id);
                  }}
                  className={cn(
                    "p-1.5 rounded transition-colors flex items-center justify-center",
                    activeSessionId === s.id ? "hover:bg-white/20 text-white" : "hover:bg-black/10 text-gray-500"
                  )}
                  title={t.delete}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
          <button 
            onClick={createNewSession}
            className={cn(
              "p-2 rounded-lg transition-colors shrink-0 ml-2",
              darkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"
            )}
            title={t.newDocument}
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={cn(
          "flex px-4 md:hidden backdrop-blur-2xl transition-all duration-500 relative z-20",
          darkMode ? "bg-zinc-900/60 shadow-md" : "bg-white/80 shadow-sm",
          isAgentMode && "shadow-none"
        )}>
          <button 
            onClick={() => setActiveTab("chat")}
            className={cn(
              "px-6 py-2 text-sm font-medium transition-all border-b-2",
              activeTab === "chat" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent opacity-60 hover:opacity-100"
            )}
          >
            {t.chat}
          </button>
          <button 
            onClick={() => setActiveTab("preview")}
            className={cn(
              "px-6 py-2 text-sm font-medium transition-all border-b-2",
              activeTab === "preview" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent opacity-60 hover:opacity-100"
            )}
          >
            {t.preview}
          </button>
        </div>
      </header>

      {/* Session Tabs - Global */}
      <div className="hidden">
        {/* Removed from here, moved into header */}
      </div>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Sidebar - Chat Interface */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isMobile ? "100%" : (sidebarOpen ? "450px" : "0px"),
            x: isMobile ? (activeTab === "chat" ? 0 : "-100%") : 0,
            opacity: isMobile ? (activeTab === "chat" ? 1 : 0) : 1
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className={cn(
            "flex flex-col border-r relative z-10 transition-colors duration-500 overflow-hidden shrink-0 transform-gpu",
            darkMode ? "border-white/5 bg-black/2 backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]" : "border-black/5 bg-black/[0.05] backdrop-blur-2xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform-gpu will-change-[backdrop-filter]",
            (!sidebarOpen && !isMobile) && "border-none",
            isMobile && "absolute inset-0 z-50 bg-black/[0.05] dark:bg-black/5 backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
            isMobile && activeTab !== "chat" && "pointer-events-none"
          )}
        >
          {/* Chat Spotlight Glow - Only in Chat Sidebar */}
          <div className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 w-[160%] h-[100%] pointer-events-none z-0 opacity-60",
            darkMode 
              ? "bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15)_0%,transparent_70%)]" 
              : "bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08)_0%,transparent_70%)]",
            isMobile && activeTab !== "chat" && "hidden"
          )} />

        <div className={cn(
          "flex flex-col h-full relative z-10 w-full"
        )}>
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <AnimatePresence>
            {showHistory ? (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-4 space-y-3"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider opacity-60">{t.savedDocs}</h2>
                  <button onClick={() => setShowHistory(false)} className="text-xs text-blue-600 font-medium">{t.backToChat}</button>
                </div>
                {savedDocs.length === 0 ? (
                  <p className="text-center text-sm opacity-40 py-8">{t.noSavedDocs}</p>
                ) : (
                  savedDocs.map((d) => (
                    <div 
                      key={d.id}
                      className={cn(
                        "group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
                        darkMode ? "bg-black/40 border-white/10 hover:border-blue-500" : "bg-white/75 border-black/10 hover:border-blue-400 shadow-sm"
                      )}
                      onClick={() => loadDoc(d)}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText size={18} className="text-blue-500 shrink-0" />
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium truncate">{d.title}</span>
                          <span className="text-[10px] opacity-40">{new Date(d.updatedAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteSavedDoc(d.id); }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded-md transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </motion.div>
            ) : (
              <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-8 py-10">
                    <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center mb-2 shadow-lg">
                      <FileText size={28} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                      {lang === 'zh' ? '开始修改您的文档' : 'Start Editing Your Document'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                      {lang === 'zh' ? '上传需要修改的 Word 文档，或者直接在下方输入指令开始。' : 'Upload a Word document to modify, or type instructions below to start.'}
                    </p>
                    
                    <div className="flex flex-col items-center gap-4 mt-4">
                      {/* Central Upload Button */}
                      <label className="relative group cursor-pointer">
                        <input 
                          type="file" 
                          className="hidden" 
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={handleMainDocUpload}
                        />
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                        <div className={cn(
                          "relative px-6 py-3 ring-1 ring-gray-900/5 rounded-xl leading-none flex items-center gap-3 transition-all backdrop-blur-xl",
                          darkMode ? "bg-black/40 border-white/10" : "bg-white/60 border-black/10"
                        )}>
                          <Upload className="text-blue-600 dark:text-blue-400" size={20} />
                          <span className="text-base font-semibold text-gray-800 dark:text-gray-100">
                            {lang === 'zh' ? '上传 Word 文档' : 'Upload Word Document'}
                          </span>
                        </div>
                      </label>

                      {/* Cool Agent Mode Toggle - Redesigned */}
                      <div className={cn(
                        "relative flex items-center p-1 rounded-full border shadow-inner w-64 h-12 overflow-hidden transition-all backdrop-blur-xl",
                        darkMode ? "bg-black/20 border-white/10" : "bg-white/40 border-black/10"
                      )}>
                        {/* Sliding Background */}
                        <motion.div 
                          className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-lg z-0"
                          initial={false}
                          animate={{ 
                            x: isAgentMode ? "100%" : "0%",
                            background: isAgentMode 
                              ? "linear-gradient(to right, #8b5cf6, #d946ef)" 
                              : "linear-gradient(to right, #3b82f6, #2563eb)"
                          }}
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          style={{ left: "4px" }}
                        />
                        
                        <button
                          onClick={() => setIsAgentMode(false)}
                          className={cn(
                            "relative z-10 flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors duration-200",
                            !isAgentMode ? "text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          )}
                        >
                          {lang === 'zh' ? '普通模式' : 'NORMAL MODE'}
                        </button>
                        
                        <button
                          onClick={() => setIsAgentMode(true)}
                          className={cn(
                            "relative z-10 flex-1 h-full flex items-center justify-center text-xs font-bold transition-colors duration-200 gap-1.5",
                            isAgentMode ? "text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          )}
                        >
                          <Sparkles size={14} className={cn(isAgentMode ? "animate-pulse" : "")} />
                          {lang === 'zh' ? 'AGENT 模式' : 'AGENT MODE'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col mb-4",
                      msg.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "group relative max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed shadow-xl border backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
                        msg.role === "user" 
                          ? "bg-blue-600/70 text-white rounded-tr-none border-blue-500/50" 
                          : cn("rounded-tl-none", darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/85 border-zinc-200 text-gray-900")
                      )}
                    >
                      {msg.steps && msg.steps.length > 0 && (
                        <div className="mb-3 space-y-1.5 border-b border-gray-500/20 pb-2">
                          {msg.steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs opacity-80 font-medium">
                              {msg.isStreaming && idx === msg.steps!.length - 1 ? (
                                <Loader2 size={12} className="animate-spin text-blue-500" />
                              ) : (
                                <Check size={12} className="text-green-500" />
                              )}
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.attachments.map((att, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/20 bg-black/20 flex items-center justify-center">
                              {att.type.startsWith('image/') && att.previewUrl ? (
                                <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="flex flex-col items-center justify-center p-1 text-[10px] text-center opacity-70">
                                  <FileText size={20} className="mb-1" />
                                  <span className="truncate w-full">{att.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {(msg.text || (msg.attachments && msg.attachments.length > 0)) && (
                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed dark:prose-invert overflow-x-hidden">
                          {msg.text ? (
                            <Markdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              p: ({ children }: any) => <div className="mb-4">{children}</div>,
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                const language = match ? match[1] : "text";
                                return !inline ? (
                                  <div className="relative rounded-xl overflow-hidden my-4 shadow-xl border backdrop-blur-2xl border-white/10 dark:border-white/10 transform-gpu will-change-[backdrop-filter]">
                                    <div className={cn(
                                      "flex items-center justify-between px-4 py-2 border-b text-xs font-mono",
                                      darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900"
                                    )}>
                                      <span className="font-semibold">{language}</span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
                                        }}
                                        className="hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
                                        title={t.copy}
                                      >
                                        <Copy size={14} />
                                        <span className="text-[10px] uppercase tracking-wider">{t.copy}</span>
                                      </button>
                                    </div>
                                    <div className="overflow-x-auto custom-scrollbar">
                                      <SyntaxHighlighter
                                        style={darkMode ? vscDarkPlus : vs}
                                        language={language}
                                        PreTag="div"
                                        customStyle={{ margin: 0, padding: '1rem', fontSize: '13px', backgroundColor: 'transparent' }}
                                        {...props}
                                      >
                                        {String(children).replace(/\n$/, "")}
                                      </SyntaxHighlighter>
                                    </div>
                                  </div>
                                ) : (
                                  <code className={cn("bg-gray-200 dark:bg-[#444] px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400", className)} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {msg.text}
                          </Markdown>
                          ) : (
                            <p className="italic opacity-60">（上传了图片）</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Message Actions */}
                    <div className={cn(
                      "flex items-center gap-1 mt-1 transition-opacity",
                      msg.role === "user" ? "opacity-60 hover:opacity-100" : "opacity-40 hover:opacity-100"
                    )}>
                      <button
                        onClick={() => handleCopy(msg.text, i)}
                        className={cn(
                          "p-1.5 rounded flex items-center gap-1 text-xs transition-colors",
                          darkMode ? "hover:bg-[#444] text-gray-400" : "hover:bg-gray-200 text-gray-500"
                        )}
                        title="Copy message"
                      >
                        {copiedIndex === i ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        {msg.role === "user" && <span>Copy</span>}
                      </button>
                      {msg.role === "model" && (
                        <>
                          <button
                            onClick={() => handleRetry(i)}
                            disabled={isCurrentSessionLoading}
                            className={cn(
                              "p-1.5 rounded flex items-center gap-1 text-xs transition-colors",
                              darkMode ? "hover:bg-[#444] text-gray-400" : "hover:bg-gray-200 text-gray-500"
                            )}
                            title="Regenerate response"
                          >
                            <RotateCcw size={12} />
                            <span>Regenerate</span>
                          </button>
                          {i === messages.length - 1 && (
                            <button
                              onClick={handleUndoTurn}
                              disabled={isCurrentSessionLoading}
                              className={cn(
                                "p-1.5 rounded flex items-center gap-1 text-xs transition-colors",
                                darkMode ? "hover:bg-[#444] text-gray-400" : "hover:bg-gray-200 text-gray-500"
                              )}
                              title="Undo Turn"
                            >
                              <RotateCcw size={12} className="scale-x-[-1]" />
                              <span>Undo</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isCurrentSessionLoading && (
                  <div className="flex items-center gap-2 text-gray-400 text-xs animate-pulse">
                    <Loader2 size={14} className="animate-spin" />
                    {t.aiDrafting}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Agent Progress */}
        {agentState.isActive && agentState.sessionId === activeSessionId && (
          <div className="px-4 pb-2">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  {t.agent} ({agentState.currentIndex + 1}/{Math.max(1, agentState.tasks.length)})
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {Math.round(((agentState.currentIndex) / Math.max(1, agentState.tasks.length)) * 100)}%
                  </span>
                  <button 
                    onClick={() => {
                      agentCancelRef.current = true;
                      setAgentState(prev => prev.sessionId === activeSessionId ? { ...prev, isActive: false } : prev);
                    }}
                    className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div 
                  className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${((agentState.currentIndex) / Math.max(1, agentState.tasks.length)) * 100}%` }}
                ></div>
              </div>
              <div className="mt-2 text-xs text-blue-700 dark:text-blue-400 truncate">
                {t.task}: {agentState.tasks[agentState.currentIndex] || t.planningTasks}
              </div>
            </div>
          </div>
        )}

        {/* Larger Input Area */}
        <ChatInputArea 
          key={activeSessionId}
          onSendMessage={handleSendMessage}
          isLoading={isCurrentSessionLoading}
          isInputExpanded={isInputExpanded}
          setIsInputExpanded={setIsInputExpanded}
          darkMode={darkMode}
          isMobile={isMobile}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          showCode={showCode}
          setShowCode={setShowCode}
          isAgentMode={isAgentMode}
          setIsAgentMode={setIsAgentMode}
          lang={lang}
        />
      </div>
    </motion.div>

      {/* Toggle Sidebar Button (when closed) */}
      {!sidebarOpen && !isMobile && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className={cn(
            "fixed left-2 z-20 p-1.5 border rounded-md shadow-sm transition-all",
            "top-[100px]",
            darkMode ? "bg-[#1E1E1E] border-white/10 hover:bg-[#252525]" : "bg-white border-gray-200 hover:bg-gray-50"
          )}
        >
          <ChevronRight size={18} />
        </button>
      )}

      <motion.main 
        initial={false}
        animate={{
          x: isMobile ? (activeTab === "preview" ? 0 : "100%") : 0,
          opacity: isMobile ? (activeTab === "preview" ? 1 : 0) : 1
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={cn(
          "flex-1 flex flex-col overflow-hidden relative z-10 transition-colors duration-500",
          "bg-transparent",
          isMobile && "absolute inset-0 z-40",
          isMobile && activeTab !== "preview" && "pointer-events-none"
        )}
      >
        {/* Document Sandbox */}
        <div className={cn(
          "flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar transition-colors duration-500 relative z-10",
          "bg-transparent"
        )}>
          {/* Document Toolbar - Subheader */}
          <div 
            ref={toolbarRef}
            className={cn(
              "sticky top-0 z-30 min-h-10 py-1.5 flex flex-wrap justify-center items-center px-2 md:px-4 shrink-0 transition-all mb-6 rounded-xl shadow-2xl w-fit mx-auto",
              darkMode ? "text-white" : "text-gray-900"
            )}
          >
            {/* Background element with blur to avoid nested backdrop-filter bug on dropdowns */}
            <div className={cn(
              "absolute inset-0 rounded-xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
              darkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-black/10"
            )} />
            
            <div className="flex flex-wrap items-center justify-center gap-0.5">
              {(() => {
                const p = focusedBlock ? docState.sections[focusedBlock.s].paragraphs[focusedBlock.p] : null;
                const focusedPara = p && p.type !== 'table' ? p as DocParagraph : null;
                return (
                  <>
                    <button 
                      onClick={handleFormatPainterClick} 
                      className={cn(
                        "p-1 rounded transition-colors flex items-center gap-1",
                        isFormatPainterActive 
                          ? "bg-white text-black shadow-sm" 
                          : "hover:bg-gray-100 dark:hover:bg-[#333]"
                      )} 
                      title="Format Painter"
                    >
                      <Paintbrush size={15} />
                    </button>
                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    
                    <button 
                      onClick={undo}
                      disabled={history.index === 0}
                      className={cn(
                        "p-1 rounded transition-colors",
                        history.index === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-[#333]"
                      )}
                      title={t.undo}
                    >
                      <Undo size={15} />
                    </button>
                    <button 
                      onClick={redo}
                      disabled={history.index === history.stack.length - 1}
                      className={cn(
                        "p-1 rounded transition-colors",
                        history.index === history.stack.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-[#333]"
                      )}
                      title={t.redo}
                    >
                      <Redo size={15} />
                    </button>
                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    
                    {/* Font Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'font' ? null : 'font')}
                        className={cn(
                          "flex items-center gap-1 pl-1.5 pr-1 py-1 text-xs rounded transition-colors",
                          activeDropdown === 'font'
                            ? "bg-white text-black shadow-sm"
                            : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                        )}
                      >
                        <Type size={13} className={activeDropdown === 'font' ? "text-black" : "text-gray-400"} />
                        <span className="w-16 md:w-20 text-left truncate">
                          {focusedPara
                            ? (focusedPara.fontFamily?.split(',')[0].replace(/['"]/g, '') || "Default Font") 
                            : "Default Font"}
                        </span>
                        <ChevronDown size={12} className={activeDropdown === 'font' ? "text-black" : "text-gray-400"} />
                      </button>
                      <AnimatePresence>
                        {activeDropdown === 'font' && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={cn(
                              "absolute top-full left-0 mt-3 w-40 rounded-xl shadow-2xl py-1 z-50",
                              darkMode ? "text-white" : "text-gray-900"
                            )}
                          >
                            <div className={cn(
                              "absolute inset-0 rounded-xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
                              darkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-black/10"
                            )} />
                            {[
                              { name: "Default Font", value: "" },
                              { name: "Arial", value: "Arial, sans-serif" },
                              { name: "Times New Roman", value: "'Times New Roman', serif" },
                              { name: "Courier New", value: "'Courier New', monospace" },
                              { name: "Georgia", value: "Georgia, serif" },
                              { name: "Verdana", value: "Verdana, sans-serif" },
                            ].map(font => (
                              <button
                                key={font.name}
                                onClick={() => {
                                  updateFocusedBlock({ fontFamily: font.value });
                                  setActiveDropdown(null);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-[#333] transition-colors",
                                  focusedPara && focusedPara.fontFamily === font.value && 
                                  "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                )}
                                style={{ fontFamily: font.value || "inherit" }}
                              >
                                {font.name}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    <button 
                      onClick={() => updateFocusedBlock({ isBold: true })} 
                      className={cn(
                        "p-1 rounded transition-colors",
                        focusedPara && focusedPara.isBold
                          ? "bg-white text-black shadow-sm"
                          : "hover:bg-gray-100 dark:hover:bg-[#333]"
                      )} 
                      title="Bold"
                    >
                      <Bold size={15} />
                    </button>
                    <button 
                      onClick={() => updateFocusedBlock({ isItalic: true })} 
                      className={cn(
                        "p-1 rounded transition-colors",
                        focusedPara && focusedPara.isItalic
                          ? "bg-white text-black shadow-sm"
                          : "hover:bg-gray-100 dark:hover:bg-[#333]"
                      )} 
                      title="Italic"
                    >
                      <Italic size={15} />
                    </button>
                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    
                    {/* Alignment Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'align' ? null : 'align')}
                        className={cn(
                          "flex items-center gap-0.5 p-1 rounded transition-colors",
                          activeDropdown === 'align'
                            ? "bg-white text-black shadow-sm"
                            : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                        )}
                        title="Alignment"
                      >
                        {(() => {
                          const align = focusedPara ? focusedPara.alignment : 'left';
                          switch(align) {
                            case 'center': return <AlignCenter size={15} />;
                            case 'right': return <AlignRight size={15} />;
                            case 'justify': return <AlignJustify size={15} />;
                            default: return <AlignLeft size={15} />;
                          }
                        })()}
                        <ChevronDown size={10} className={activeDropdown === 'align' ? "text-black" : "text-gray-400"} />
                      </button>
                      <AnimatePresence>
                        {activeDropdown === 'align' && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={cn(
                              "absolute top-full left-1/2 -translate-x-1/2 mt-3 rounded-xl shadow-2xl p-1 z-50 flex gap-1",
                              darkMode ? "text-white" : "text-gray-900"
                            )}
                          >
                            <div className={cn(
                              "absolute inset-0 rounded-xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
                              darkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-black/10"
                            )} />
                            <button 
                              onClick={() => { updateFocusedBlock({ alignment: 'left' }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.alignment === 'left'
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Align Left"
                            >
                              <AlignLeft size={15} />
                            </button>
                            <button 
                              onClick={() => { updateFocusedBlock({ alignment: 'center' }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.alignment === 'center'
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Align Center"
                            >
                              <AlignCenter size={15} />
                            </button>
                            <button 
                              onClick={() => { updateFocusedBlock({ alignment: 'right' }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.alignment === 'right'
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Align Right"
                            >
                              <AlignRight size={15} />
                            </button>
                            <button 
                              onClick={() => { updateFocusedBlock({ alignment: 'justify' }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.alignment === 'justify'
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Justify"
                            >
                              <AlignJustify size={15} />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Color Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'color' ? null : 'color')}
                        className={cn(
                          "flex items-center gap-0.5 p-1 rounded transition-colors",
                          activeDropdown === 'color'
                            ? "bg-white text-black shadow-sm"
                            : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                        )}
                        title="Font Color"
                      >
                        <Palette size={15} style={{ color: focusedPara ? focusedPara.color : 'inherit' }} />
                        <ChevronDown size={10} className={activeDropdown === 'color' ? "text-black" : "text-gray-400"} />
                      </button>
                      <AnimatePresence>
                        {activeDropdown === 'color' && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={cn(
                              "absolute top-full left-1/2 -translate-x-1/2 mt-3 rounded-xl shadow-2xl p-1.5 z-50 flex gap-1.5",
                              darkMode ? "text-white" : "text-gray-900"
                            )}
                          >
                            <div className={cn(
                              "absolute inset-0 rounded-xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
                              darkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-black/10"
                            )} />
                            {[
                              { name: "Default", value: "" },
                              { name: "Black", value: "#000000" },
                              { name: "Red", value: "#FF0000" },
                              { name: "Blue", value: "#2563EB" },
                              { name: "Green", value: "#16A34A" },
                              { name: "Gray", value: "#6B7280" },
                            ].map(color => (
                              <button
                                key={color.name}
                                onClick={() => {
                                  updateFocusedBlock({ color: color.value || undefined });
                                  setActiveDropdown(null);
                                }}
                                className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-110"
                                style={{ backgroundColor: color.value || 'transparent' }}
                                title={color.name}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    
                    {/* Lists Dropdown */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'list' ? null : 'list')}
                        className={cn(
                          "flex items-center gap-0.5 p-1 rounded transition-colors",
                          activeDropdown === 'list'
                            ? "bg-white text-black shadow-sm"
                            : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                        )}
                        title="Lists"
                      >
                        {(() => {
                          if (focusedPara?.isNumbering) return <ListOrdered size={15} />;
                          return <List size={15} />;
                        })()}
                        <ChevronDown size={10} className={activeDropdown === 'list' ? "text-black" : "text-gray-400"} />
                      </button>
                      <AnimatePresence>
                        {activeDropdown === 'list' && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className={cn(
                              "absolute top-full left-1/2 -translate-x-1/2 mt-3 rounded-xl shadow-2xl p-1 z-50 flex gap-1",
                              darkMode ? "text-white" : "text-gray-900"
                            )}
                          >
                            <div className={cn(
                              "absolute inset-0 rounded-xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
                              darkMode ? "bg-black/40 border-white/10" : "bg-white/80 border-black/10"
                            )} />
                            <button 
                              onClick={() => { updateFocusedBlock({ isBullet: true }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.isBullet
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Bullet List"
                            >
                              <List size={15} />
                            </button>
                            <button 
                              onClick={() => { updateFocusedBlock({ isNumbering: true }); setActiveDropdown(null); }} 
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                focusedPara && focusedPara.isNumbering
                                  ? "bg-gray-200 dark:bg-[#444]"
                                  : "hover:bg-gray-100 dark:hover:bg-[#333]"
                              )} 
                              title="Numbered List"
                            >
                              <ListOrdered size={15} />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                    <button onClick={() => {
                      if (!focusedBlock) return;
                      setDocState(prev => {
                        const next = JSON.parse(JSON.stringify(prev));
                        next.sections[focusedBlock.s].paragraphs.splice(focusedBlock.p + 1, 0, { text: "" });
                        saveCurrentDoc(next);
                        pushToHistory(next);
                        return next;
                      });
                      setFocusedBlock({ s: focusedBlock.s, p: focusedBlock.p + 1 });
                    }} className="p-1 hover:bg-blue-100 text-blue-500 rounded transition-colors" title="Add Paragraph Below"><Plus size={15} /></button>
                    <button onClick={deleteFocusedBlock} className="p-1 hover:bg-red-100 text-red-500 rounded transition-colors" title="Delete Paragraph"><Trash size={15} /></button>
                  </>
                );
              })()}
            </div>
          </div>

          {documentContent}
        </div>

        {/* AI Code Window Overlay */}
        <AnimatePresence>
          {showCode && lastJson && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "absolute inset-0 z-50 flex flex-col transition-all backdrop-blur-2xl transform-gpu will-change-[backdrop-filter]",
                darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900"
              )}
            >
              <div className={cn(
                "flex items-center justify-between p-4 border-b",
                darkMode ? "border-white/10" : "border-black/10"
              )}>
                <div className="flex items-center gap-2 text-blue-600">
                  <Code size={18} />
                  <span className="font-semibold text-sm">{t.aiStructure}</span>
                </div>
                <button 
                  onClick={() => setShowCode(false)} 
                  className={cn(
                    "p-1 rounded transition-colors",
                    darkMode ? "hover:bg-white/10 text-gray-400 hover:text-white" : "hover:bg-black/5 text-gray-500 hover:text-black"
                  )}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 md:p-8 text-sm custom-scrollbar" ref={codeScrollRef}>
                <SyntaxHighlighter 
                  language="json" 
                  style={darkMode ? vscDarkPlus : vs}
                  wrapLines={true}
                  wrapLongLines={true}
                  customStyle={{ 
                    margin: 0, 
                    borderRadius: '12px', 
                    fontSize: '13px',
                    background: 'transparent',
                    padding: '1rem'
                  }}
                  codeTagProps={{ style: { background: 'transparent' } }}
                >
                  {lastJson}
                </SyntaxHighlighter>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
      </div>

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 cursor-zoom-out"
            onClick={() => setSelectedImage(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              src={selectedImage}
              alt="Zoomed"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-2 transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transform-gpu will-change-[backdrop-filter]">
          <div className={cn(
            "w-full max-w-sm p-6 rounded-2xl shadow-2xl relative",
            darkMode ? "text-white" : "text-gray-900"
          )}>
            <div className={cn(
              "absolute inset-0 rounded-2xl border -z-10 backdrop-blur-2xl pointer-events-none transform-gpu will-change-[backdrop-filter]",
              darkMode ? "bg-black/30 border-white/10" : "bg-black/[0.18] border-black/20"
            )} />
            <h3 className="text-lg font-semibold mb-4">Confirm Action</h3>
            <p className="mb-6 opacity-80">{confirmAction.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-colors",
                  darkMode ? "hover:bg-[#333]" : "hover:bg-gray-100"
                )}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.action}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E0E0E0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #BDBDBD;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #444;
        }
        
        /* Markdown styles */
        .prose p {
          margin-bottom: 0.5rem;
        }
        .prose p:last-child {
          margin-bottom: 0;
        }

        /* KaTeX adjustments */
        .katex-display { margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
        .katex { font-size: 1.1em; }
      `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
