/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from "react";
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
  Palette
} from "lucide-react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "./lib/utils";
import { DocumentState, ChatMessage } from "./types";
import { generateWordDoc } from "./lib/word-generator";
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
- **表格规范**：表格必须具有一致的宽度，并使用专业的边框样式。
- **对齐方式**：正文建议使用 "justify"（两端对齐）以确保视觉上的整洁。
- **配色方案**：使用专业的配色（如深蓝色 #1F3864 用于 H1，蓝色 #2E75B6 用于 H2）。严禁“无脑”使用纯红色 (#FF0000)。只有当用户明确要求（例如：“把加粗的部分用红色表示”）时，才允许对相应段落或文本片段 (runs) 使用 "color": "#FF0000"。
- **混合样式 (Runs)**：如果同一行内需要不同的颜色或加粗样式，必须使用 "runs" 数组，而不是拆分成多个段落。
- **颜色省略**：如果用户没有明确要求特定颜色，请在 JSON 中完全省略 "color" 属性。默认文本颜色在预览中始终为深灰色/黑色，不受深色模式影响。
- **拒绝懒惰**：必须提供完整的请求内容，严禁使用 "..." 或占位符。

### 编程案例参考 (JSON REFERENCE)
请参考以下专业文档的 JSON 结构进行创作：
\`\`\`json
{
  "type": "full",
  "state": {
    "title": "适合的与热爱的",
    "sections": [
      {
        "paragraphs": [
          {
            "text": "适合的与热爱的",
            "isHeading": true,
            "headingLevel": 1,
            "alignment": "center",
            "color": "#1F3864"
          },
          {
            "text": "论证逻辑精简版",
            "isItalic": true,
            "alignment": "center",
            "color": "#888888"
          },
          {
            "runs": [
              { "text": "重点提示：", "isBold": true, "color": "#FF0000" },
              { "text": "这是同一行内的混合样式示例。", "isBold": false }
            ],
            "alignment": "left"
          },
          {
            "text": "① 引论：定义与论点",
            "isHeading": true,
            "headingLevel": 2,
            "color": "#2E75B6"
          },
          {
            "text": "“适合的”：能力取向，基于工具理性的审慎评估。",
            "isBullet": true
          },
          {
            "text": "“热爱的”：情感取向，基于价值理性的赤诚选择。",
            "isBullet": true
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

### 更新模式
A. FULL UPDATE (全量更新): 用于重大更改或初始创建。
B. APPEND (追加): 在最后一个章节末尾添加内容。
C. PATCH (补丁): 修改特定部分（标题、插入或删除段落）。

段落结构属性：text (简单文本), runs (数组，用于混合样式), isHeading, headingLevel (1-6), isBold, isItalic, isBullet, isNumbering, alignment (left|center|right|justify), color (段落默认颜色)。
Run 结构属性：text, isBold, isItalic, color。

注意：如果用户没有要求特定颜色，请在 JSON 中省略 "color" 属性。预览时文档背景始终为白色，文字默认为黑色。`;

export default function App() {
  const [docState, setDocState] = useState<DocumentState>(INITIAL_DOC_STATE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [lastJson, setLastJson] = useState<string>("");
  const [savedDocs, setSavedDocs] = useState<any[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "preview">("chat");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
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

  // Initialize AI
  useEffect(() => {
    if (process.env.GEMINI_API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

  const saveCurrentDoc = async (state: DocumentState) => {
    if (!user) return;
    try {
      const docData = {
        uid: user.uid,
        title: state.title,
        content: JSON.stringify(state),
        updatedAt: new Date().toISOString()
      };

      if (currentDocId) {
        await setDoc(doc(db, "users", user.uid, "documents", currentDocId), docData);
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, "documents"), docData);
        setCurrentDocId(docRef.id);
      }
      fetchSavedDocs(user.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/documents`);
    }
  };

  const loadDoc = (docItem: any) => {
    try {
      const state = JSON.parse(docItem.content);
      setDocState(state);
      setCurrentDocId(docItem.id);
      setShowHistory(false);
      setMessages([]); // Clear chat for new context
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

  const applyUpdate = (update: any) => {
    setDocState(prev => {
      let next = { ...prev };
      
      if (update.type === "full") {
        next = update.state;
      } else if (update.type === "append") {
        const lastSectionIdx = next.sections.length - 1;
        const paragraphs = Array.isArray(update.paragraphs) ? update.paragraphs : (update.paragraphs ? [update.paragraphs] : []);
        if (lastSectionIdx >= 0) {
          next.sections[lastSectionIdx].paragraphs = [
            ...next.sections[lastSectionIdx].paragraphs,
            ...paragraphs
          ];
        } else {
          next.sections = [{ paragraphs: paragraphs }];
        }
      } else if (update.type === "patch") {
        update.actions.forEach((action: any) => {
          if (action.op === "replace" && action.path === "title") {
            next.title = action.value;
          } else if (action.op === "insert") {
            const section = next.sections[action.sectionIndex || 0];
            if (section) {
              const paragraphs = Array.isArray(action.paragraphs) ? action.paragraphs : (action.paragraphs ? [action.paragraphs] : []);
              section.paragraphs.splice(action.paragraphIndex, 0, ...paragraphs);
            }
          } else if (action.op === "remove") {
            const section = next.sections[action.sectionIndex || 0];
            if (section) {
              section.paragraphs.splice(action.paragraphIndex, 1);
            }
          }
        });
      }
      
      saveCurrentDoc(next);
      return next;
    });
  };

  const handleSendMessage = async (retryPrompt?: string) => {
    const promptToUse = retryPrompt || input;
    if (!promptToUse.trim() || !aiRef.current || isLoading) return;

    if (!retryPrompt) {
      const userMessage: ChatMessage = { role: "user", text: promptToUse };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
    }
    
    setIsLoading(true);

    try {
      // Include current state in context for the AI
      const contextPrompt = `CURRENT DOCUMENT STATE: ${JSON.stringify(docState)}\n\nUSER REQUEST: ${promptToUse}`;

      const chat = aiRef.current.chats.create({
        model: selectedModel,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
        history: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      });

      const result = await chat.sendMessage({ message: contextPrompt });
      const responseText = result.text;

      // Extract JSON if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
      let cleanText = responseText;

      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1];
          const update = JSON.parse(jsonStr);
          applyUpdate(update);
          setLastJson(jsonStr);
          setShowCode(true);
          cleanText = responseText.replace(jsonMatch[0], "").trim();
        } catch (e) {
          console.error("Failed to parse JSON from AI", e);
        }
      }

      setMessages((prev) => [...prev, { role: "model", text: cleanText || "Document updated." }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages((prev) => [...prev, { role: "model", text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) {
      // If the last message is from the model, remove it before retrying
      if (messages.length > 0 && messages[messages.length - 1].role === "model") {
        setMessages(prev => prev.slice(0, -1));
      }
      handleSendMessage(lastUserMsg.text);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleResetColors = () => {
    if (window.confirm("Remove all custom colors from the document?")) {
      setDocState(prev => {
        const next = { ...prev };
        next.sections = next.sections.map(section => ({
          ...section,
          paragraphs: section.paragraphs.map(p => {
            const { color, ...rest } = p;
            return rest;
          })
        }));
        saveCurrentDoc(next);
        return next;
      });
    }
  };

  const handleExport = () => {
    generateWordDoc(docState);
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to start a new document? This will clear your current work.")) {
      setDocState(INITIAL_DOC_STATE);
      setMessages([]);
      setLastJson("");
      setCurrentDocId(null);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col h-screen overflow-hidden transition-colors duration-300",
      darkMode ? "bg-[#121212] text-[#E0E0E0] dark" : "bg-[#F8F9FA] text-[#202124]"
    )}>
      {/* Mobile Tab Switcher */}
      {isMobile && (
        <div className={cn(
          "flex border-b shrink-0 z-[60]",
          darkMode ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-[#E0E0E0]"
        )}>
          <button 
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-all border-b-2",
              activeTab === "chat" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent opacity-60"
            )}
          >
            Chat
          </button>
          <button 
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-all border-b-2",
              activeTab === "preview" 
                ? "border-blue-600 text-blue-600" 
                : "border-transparent opacity-60"
            )}
          >
            Preview
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - Chat Interface */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isMobile 
              ? (activeTab === "chat" ? "100%" : "0%") 
              : (sidebarOpen ? "450px" : "0px") 
          }}
          className={cn(
            "flex flex-col border-r relative z-10 transition-colors overflow-hidden shrink-0",
            darkMode ? "border-[#333] bg-[#1E1E1E]" : "border-[#E0E0E0] bg-white",
            (!sidebarOpen && !isMobile) && "border-none",
            isMobile && "fixed inset-x-0 bottom-0 top-[48px] z-50"
          )}
        >
        <div className={cn(
          "flex flex-col h-full",
          isMobile ? "w-screen" : "w-[450px]"
        )}>
          <div className={cn(
            "flex items-center justify-between p-4 border-b shrink-0",
            darkMode ? "border-[#333]" : "border-[#E0E0E0]"
          )}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Wand2 size={18} />
              </div>
              <h1 className="font-semibold text-lg tracking-tight truncate">AI Word Sandbox</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative group">
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={cn(
                    "appearance-none text-[11px] font-semibold pl-2.5 pr-8 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer",
                    darkMode 
                      ? "bg-[#252525] border-[#444] text-gray-300 hover:border-gray-600" 
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 shadow-sm"
                  )}
                >
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flashlite</option>
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={12} className="rotate-90" />
                </div>
              </div>
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  darkMode ? "hover:bg-[#333] text-yellow-400" : "hover:bg-gray-100 text-gray-500"
                )}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {!isMobile && (
                <button 
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    darkMode ? "hover:bg-[#333]" : "hover:bg-gray-100"
                  )}
                >
                  <ChevronLeft size={20} />
                </button>
              )}
            </div>
          </div>

        {/* User Profile / Auth */}
        <div className={cn(
          "p-3 border-b flex items-center justify-between",
          darkMode ? "border-[#333] bg-[#252525]" : "border-[#E0E0E0] bg-gray-50"
        )}>
          {user ? (
            <div className="flex items-center gap-3 overflow-hidden w-full">
              <img src={user.photoURL || ""} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-300" />
              <div className="flex flex-col overflow-hidden flex-1">
                <span className="text-xs font-medium truncate">{user.displayName}</span>
                <span className="text-[10px] opacity-60 truncate">{user.email}</span>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    showHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200"
                  )}
                  title="My Documents"
                >
                  <History size={16} />
                </button>
                <button onClick={handleLogout} className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors" title="Logout">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all shadow-sm"
            >
              <LogIn size={16} />
              Login with Google
            </button>
          )}
        </div>

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
                  <h2 className="text-sm font-bold uppercase tracking-wider opacity-60">Saved Documents</h2>
                  <button onClick={() => setShowHistory(false)} className="text-xs text-blue-600 font-medium">Back to Chat</button>
                </div>
                {savedDocs.length === 0 ? (
                  <p className="text-center text-sm opacity-40 py-8">No saved documents yet.</p>
                ) : (
                  savedDocs.map((d) => (
                    <div 
                      key={d.id}
                      className={cn(
                        "group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between",
                        darkMode ? "bg-[#252525] border-[#444] hover:border-blue-500" : "bg-white border-gray-100 hover:border-blue-400 shadow-sm"
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
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60 px-8 py-20">
                    <MessageSquare size={48} className="text-blue-500" />
                    <p className="text-sm">
                      Hello! I'm your AI Word Assistant. Tell me what kind of document you'd like to create today.
                    </p>
                  </div>
                )}
                
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "group relative max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed mb-4",
                      msg.role === "user" 
                        ? "bg-blue-600 text-white ml-auto rounded-tr-none" 
                        : cn("mr-auto rounded-tl-none", darkMode ? "bg-[#333] text-gray-200" : "bg-gray-100 text-gray-800")
                    )}
                  >
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed dark:prose-invert">
                      <Markdown>{msg.text}</Markdown>
                    </div>

                    {/* Message Actions */}
                    <div className={cn(
                      "absolute -bottom-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                      msg.role === "user" ? "right-0" : "left-0"
                    )}>
                      <button
                        onClick={() => handleCopy(msg.text, i)}
                        className={cn(
                          "p-1 rounded hover:bg-gray-100 transition-colors",
                          darkMode ? "hover:bg-[#444] text-gray-400" : "text-gray-500"
                        )}
                        title="Copy message"
                      >
                        {copiedIndex === i ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                      {msg.role === "model" && i === messages.length - 1 && (
                        <button
                          onClick={handleRetry}
                          disabled={isLoading}
                          className={cn(
                            "p-1 rounded hover:bg-gray-100 transition-colors",
                            darkMode ? "hover:bg-[#444] text-gray-400" : "text-gray-500"
                          )}
                          title="Retry generation"
                        >
                          <RotateCcw size={12} className={isLoading ? "animate-spin" : ""} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-gray-400 text-xs animate-pulse">
                    <Loader2 size={14} className="animate-spin" />
                    AI is drafting...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Larger Input Area */}
        <div className={cn(
          "p-4 border-t transition-colors",
          darkMode ? "border-[#333] bg-[#1E1E1E]" : "border-[#E0E0E0] bg-white"
        )}>
          <div className="relative flex flex-col gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your instructions (e.g., 'Create a resume for...')"
              className={cn(
                "w-full p-4 pr-12 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none min-h-[100px] max-h-[300px]",
                darkMode ? "bg-[#252525] border-[#444] text-white" : "bg-gray-50 border-gray-200 text-gray-900"
              )}
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowCode(!showCode)}
                  className={cn(
                    "p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium",
                    showCode ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 text-gray-500"
                  )}
                  title="Toggle AI Code Window"
                >
                  <Code size={16} />
                  {showCode ? "Hide Code" : "Show Code"}
                </button>
                <button 
                  onClick={() => handleCopy(input, -1)}
                  disabled={!input.trim()}
                  className={cn(
                    "p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium",
                    darkMode ? "hover:bg-[#333] text-gray-400" : "hover:bg-gray-100 text-gray-500"
                  )}
                  title="Copy current prompt"
                >
                  {copiedIndex === -1 ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  Copy
                </button>
              </div>
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl disabled:opacity-40 transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>

      {/* Toggle Sidebar Button (when closed) */}
      {!sidebarOpen && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className={cn(
            "fixed left-2 z-20 p-1.5 border rounded-md shadow-sm transition-all",
            isMobile ? "top-[58px]" : "top-[10px]",
            darkMode ? "bg-[#1E1E1E] border-[#333] hover:bg-[#252525]" : "bg-white border-gray-200 hover:bg-gray-50"
          )}
        >
          <ChevronRight size={18} />
        </button>
      )}

      {/* Main Content - Document Preview */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Toolbar */}
        <header className={cn(
          "h-14 border-b flex items-center justify-between px-4 md:px-6 shrink-0 transition-colors",
          darkMode ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-[#E0E0E0]"
        )}>
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileText size={20} className="text-blue-600 shrink-0" />
              <input 
                value={docState.title}
                onChange={(e) => setDocState(prev => ({ ...prev, title: e.target.value }))}
                onBlur={() => saveCurrentDoc(docState)}
                className={cn(
                  "font-medium text-sm focus:outline-none px-2 py-1 rounded border border-transparent transition-all truncate",
                  darkMode ? "bg-transparent text-white hover:border-[#444]" : "bg-transparent text-gray-900 hover:border-gray-200",
                  isMobile ? "max-w-[120px]" : "max-w-[300px]"
                )}
              />
            </div>
            {!isMobile && <div className="h-4 w-[1px] bg-gray-200 mx-2" />}
            <div className="flex items-center gap-1">
              <button onClick={handleReset} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors" title="New Document">
                <Plus size={18} />
              </button>
              <button onClick={handleResetColors} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors" title="Reset All Colors">
                <Palette size={18} />
              </button>
              {!isMobile && (
                <button className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors" title="Settings">
                  <Settings size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              className={cn(
                "flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95",
                isMobile ? "p-2" : "px-4 py-2"
              )}
            >
              <Download size={16} />
              {!isMobile && "Export .docx"}
            </button>
          </div>
        </header>

        {/* Document Sandbox */}
        <div className={cn(
          "flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar transition-colors",
          darkMode ? "bg-[#121212]" : "bg-[#F0F2F5]"
        )}>
          <motion.div 
            layout
            className={cn(
              "max-w-[816px] mx-auto shadow-xl min-h-[1056px] p-8 md:p-[96px] relative transition-colors origin-top bg-white text-gray-900",
              isMobile && "scale-[0.9] md:scale-100"
            )}
          >
            <div className="space-y-6">
              {docState.sections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-4">
                  {section.paragraphs.map((p, pIdx) => {
                    const alignmentClass = {
                      left: "text-left",
                      center: "text-center",
                      right: "text-right",
                      justify: "text-justify"
                    }[p.alignment || "left"];

                    if (p.isHeading) {
                      const level = p.headingLevel || 1;
                      const headingSize = {
                        1: "text-3xl font-bold mb-6",
                        2: "text-2xl font-bold mb-4",
                        3: "text-xl font-bold mb-3",
                        4: "text-lg font-bold mb-2",
                        5: "text-base font-bold mb-1",
                        6: "text-sm font-bold mb-1",
                      }[level as 1|2|3|4|5|6];

                      const className = cn(headingSize, alignmentClass);

                      switch (level) {
                        case 1: return <h1 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h1>;
                        case 2: return <h2 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h2>;
                        case 3: return <h3 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h3>;
                        case 4: return <h4 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h4>;
                        case 5: return <h5 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h5>;
                        case 6: return <h6 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h6>;
                        default: return <h1 key={pIdx} className={className} style={{ color: p.color }}>{p.runs ? p.runs.map((r, i) => <span key={i} style={{ color: r.color }} className={cn(r.isBold && "font-bold", r.isItalic && "italic")}>{r.text}</span>) : p.text}</h1>;
                      }
                    }

                    return (
                      <div 
                        key={pIdx} 
                        className={cn(
                          "flex items-start gap-3",
                          alignmentClass,
                          p.isBullet && "pl-6",
                          p.isNumbering && "pl-6"
                        )}
                      >
                        {p.isBullet && (
                          <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", darkMode ? "bg-gray-400" : "bg-gray-600")} />
                        )}
                        {p.isNumbering && (
                          <span className={cn("font-medium min-w-[1.25rem]", darkMode ? "text-gray-400" : "text-gray-600")}>
                            {section.paragraphs.slice(0, pIdx + 1).filter(prev => prev.isNumbering).length}.
                          </span>
                        )}
                        <p 
                          className={cn(
                            "text-[11pt] leading-[1.5] flex-1",
                            p.isBold && "font-bold",
                            p.isItalic && "italic",
                            !p.color && "text-gray-900"
                          )}
                          style={{ color: p.color }}
                        >
                          {p.runs ? (
                            p.runs.map((run, rIdx) => (
                              <span 
                                key={rIdx}
                                className={cn(
                                  run.isBold && "font-bold",
                                  run.isItalic && "italic"
                                )}
                                style={{ color: run.color }}
                              >
                                {run.text}
                              </span>
                            ))
                          ) : (
                            p.text
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
        </div>

        {/* AI Code Window Overlay */}
        <AnimatePresence>
          {showCode && lastJson && (
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className={cn(
                "fixed right-0 bottom-0 border-l shadow-2xl z-30 flex flex-col transition-all",
                isMobile ? "top-[104px] w-full" : "top-14 w-[400px]",
                darkMode ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-[#E0E0E0]"
              )}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2 text-blue-600">
                  <Code size={18} />
                  <span className="font-semibold text-sm">AI Generated Structure</span>
                </div>
                <button onClick={() => setShowCode(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-2 text-xs custom-scrollbar">
                <SyntaxHighlighter 
                  language="json" 
                  style={darkMode ? vscDarkPlus : vs}
                  customStyle={{ margin: 0, borderRadius: '8px', fontSize: '11px' }}
                >
                  {lastJson}
                </SyntaxHighlighter>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      </div>

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
      `}</style>
    </div>
  );
}
