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
  Redo
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

interface Session {
  id: string;
  docState: DocumentState;
  messages: ChatMessage[];
  lastJson: string;
  currentDocId: string | null;
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

### 更新模式与示例
A. FULL UPDATE (全量更新): 用于重大更改或初始创建。
注意：必须包含文档的【完整内容】，严禁只输出修改的部分而遗漏未修改的部分！
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
\`\`\`json
{
  "type": "patch",
  "actions": [
    { "op": "replace", "path": "title", "value": "新标题" },
    { "op": "insert", "sectionIndex": 0, "paragraphIndex": 1, "paragraphs": [{ "text": "插入的段落" }] },
    { "op": "remove", "sectionIndex": 0, "paragraphIndex": 2 },
    { "op": "replace_paragraphs", "sectionIndex": 0, "paragraphIndex": 3, "count": 1, "paragraphs": [{ "text": "替换后的新段落" }] }
  ]
}
\`\`\`

段落结构属性：text (简单文本), runs (数组，用于混合样式), isHeading, headingLevel (1-6), isBold, isItalic, isBullet, isNumbering, alignment (left|center|right|justify), color (段落默认颜色)。
Run 结构属性：text, isBold, isItalic, color。

注意：如果用户没有要求特定颜色，请在 JSON 中省略 "color" 属性。预览时文档背景始终为白色，文字默认为黑色。`;

function ModelSelector({ selected, onChange, darkMode }: { selected: string, onChange: (val: string) => void, darkMode: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
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
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border shadow-sm backdrop-blur-xl",
          isOpen 
            ? "bg-white text-black border-white shadow-md"
            : (darkMode 
                ? "bg-black/30 border-white/10 text-gray-200 hover:bg-black/50" 
                : "bg-white/50 border-black/5 text-gray-700 hover:bg-white/70")
        )}
      >
        <span className="text-lg">{selectedModel.icon}</span>
        <span>{selectedModel.name}</span>
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
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "absolute bottom-full mb-5 left-0 w-64 rounded-xl border shadow-2xl z-50 overflow-hidden p-1 backdrop-blur-3xl",
                darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/80 border-black/10 text-gray-900"
              )}
            >
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => { onChange(m.id); setIsOpen(false); }}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-colors relative group",
                    selected === m.id 
                      ? (darkMode ? "bg-blue-500/20" : "bg-blue-500/10") 
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
  const [sessions, setSessions] = useState<Session[]>([
    {
      id: "initial",
      docState: INITIAL_DOC_STATE,
      messages: [],
      lastJson: "",
      currentDocId: null
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("initial");
  const [showHistory, setShowHistory] = useState(false);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll AI Generated Structure panel when content changes
  useEffect(() => {
    if (codeScrollRef.current && showCode) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [lastJson, showCode]);

  // Sync current active session data back to sessions array
  useEffect(() => {
    setSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, docState, messages, lastJson, currentDocId } 
        : s
    ));
  }, [docState, messages, lastJson, currentDocId, activeSessionId]);
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "preview">("chat");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ message: string, action: () => void } | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<{s: number, p: number} | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<any>(null);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'font' | 'align' | 'list' | null>(null);
  
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

  const saveCurrentDoc = async (state: DocumentState, msgs: ChatMessage[]) => {
    if (!user) return;
    try {
      const docData = {
        uid: user.uid,
        title: state.title,
        content: JSON.stringify(state),
        messages: JSON.stringify(msgs),
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
      // Check if this doc is already open in a session
      const existingSession = sessions.find(s => s.currentDocId === docItem.id);
      if (existingSession) {
        setActiveSessionId(existingSession.id);
        setDocState(existingSession.docState);
        setMessages(existingSession.messages);
        setLastJson(existingSession.lastJson);
        setCurrentDocId(existingSession.currentDocId);
        setHistory({ index: 0, stack: [existingSession.docState] });
        setShowHistory(false);
        return;
      }

      const state = typeof docItem.content === 'string' ? JSON.parse(docItem.content) : docItem.content;
      const messages = docItem.messages ? (typeof docItem.messages === 'string' ? JSON.parse(docItem.messages) : docItem.messages) : [];
      
      // Create new session for this doc
      const newId = Math.random().toString(36).substring(7);
      const newSession: Session = {
        id: newId,
        docState: state,
        messages: messages,
        lastJson: "",
        currentDocId: docItem.id
      };
      
      setSessions(prev => [...prev, newSession]);
      setActiveSessionId(newId);
      setDocState(state);
      setMessages(messages);
      setLastJson("");
      setCurrentDocId(docItem.id);
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

  const applyUpdate = (update: any): DocumentState => {
    let next = JSON.parse(JSON.stringify(docState)); // Deep copy to avoid mutating current state
    
    if (update.type === "full") {
      next = update.state;
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
        } else if (action.op === "insert") {
          const section = next.sections[action.sectionIndex || 0];
          if (section) {
            const paragraphs = Array.isArray(action.paragraphs) ? action.paragraphs : (action.paragraphs ? [action.paragraphs] : []);
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex, 0, ...paragraphs);
          }
        } else if (action.op === "remove") {
          const section = next.sections[action.sectionIndex || 0];
          if (section) {
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex, 1);
          }
        } else if (action.op === "replace_paragraphs") {
          const section = next.sections[action.sectionIndex || 0];
          if (section) {
            const paragraphs = Array.isArray(action.paragraphs) ? action.paragraphs : (action.paragraphs ? [action.paragraphs] : []);
            const count = action.count || paragraphs.length;
            section.paragraphs = [...section.paragraphs];
            section.paragraphs.splice(action.paragraphIndex, count, ...paragraphs);
          }
        }
      });
    }
    
    setDocState(next);
    return next;
  };

  const handleSendMessage = async (retryPrompt?: string) => {
    const promptToUse = retryPrompt || input;
    if (!promptToUse.trim() || !aiRef.current || isLoading) return;

    let currentMessages = [...messages];
    if (!retryPrompt) {
      const userMessage: ChatMessage = { role: "user", text: promptToUse };
      currentMessages = [...currentMessages, userMessage];
      setMessages(currentMessages);
      setInput("");
    }
    
    setIsLoading(true);
    // if (isMobile) setActiveTab("preview"); // Delayed until code generation starts
    // setShowCode(true); // Delayed until code generation starts

    try {
      console.log("Starting AI drafting...");
      console.log("aiRef.current:", aiRef.current);
      console.log("selectedModel:", selectedModel);
      // Include current state in context for the AI
      const contextPrompt = `CURRENT DOCUMENT STATE: ${JSON.stringify(docState)}\n\nUSER REQUEST: ${promptToUse}`;
      console.log("Context prompt prepared.");

      const contents = [
        ...messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        })),
        {
          role: "user",
          parts: [{ text: contextPrompt }]
        }
      ];

      console.log("Calling generateContentStream...");
      const responseStream = await aiRef.current.models.generateContentStream({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          ...(selectedModel === "gemini-3.1-pro-preview" ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : {}),
        }
      });
      console.log("Stream received.");
      
      let fullText = "";
      let currentSteps: string[] = [];
      
      // Add placeholder for streaming message
      setMessages((prev) => [...prev, { role: "model", text: "", steps: [], isStreaming: true }]);

      console.log("Starting stream loop...");
      let previewTriggered = false;
      for await (const chunk of responseStream) {
        console.log("Received chunk:", chunk);
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          
          // Trigger preview transition when code block starts
          if (fullText.includes("```") && !previewTriggered) {
            previewTriggered = true;
            setShowCode(true);
            if (isMobile) setActiveTab("preview");
          }
          
          // Parse steps
          const stepMatches = Array.from(fullText.matchAll(/<step>(.*?)<\/step>/g));
          currentSteps = stepMatches.map(m => m[1]);
          
          // Remove JSON and steps from the displayed text in chat
          let cleanText = fullText.replace(/<step>.*?<\/step>\n?/g, "");
          // More aggressive removal of code blocks during streaming
          const codeBlockStart = cleanText.indexOf("```");
          if (codeBlockStart !== -1) {
            cleanText = cleanText.substring(0, codeBlockStart);
          }
          
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { 
              role: "model", 
              text: cleanText.trim() || "Working on your request...",
              steps: currentSteps,
              isStreaming: true
            };
            return newMessages;
          });
          
          // Try to extract and show JSON in preview while streaming
          let jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/) || fullText.match(/```\n([\s\S]*?)\n```/);
          if (!jsonMatch) {
            // Try to find partial JSON
            const partialJsonMatch = fullText.match(/```json\n([\s\S]*)$/) || fullText.match(/```\n([\s\S]*)$/);
            if (partialJsonMatch) {
              setLastJson(partialJsonMatch[1]);
            } else {
              const rawJsonMatch = fullText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
              if (rawJsonMatch) {
                setLastJson(rawJsonMatch[0]);
              }
            }
          } else {
            setLastJson(jsonMatch[1]);
          }
        }
      }
      console.log("Stream loop finished.");

      // Extract JSON if present
      let jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/) || fullText.match(/```\n([\s\S]*?)\n```/);
      
      if (!jsonMatch) {
        // Fallback: try to find a raw JSON object or array
        const rawJsonMatch = fullText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (rawJsonMatch) {
          try {
            JSON.parse(rawJsonMatch[1]); // Validate it's actually JSON
            jsonMatch = [rawJsonMatch[0], rawJsonMatch[1]] as any;
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      }

      let cleanText = fullText.replace(/<step>.*?<\/step>\n?/g, "");
      cleanText = cleanText.replace(/```json\n([\s\S]*?)\n```/g, "");
      cleanText = cleanText.replace(/```\n([\s\S]*?)\n```/g, "");
      
      let finalDocState = docState;

      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1];
          const update = JSON.parse(jsonStr);
          const nextState = applyUpdate(update);
          if (nextState) finalDocState = nextState;
          setLastJson(jsonStr);
          // Close code window when finished as requested
          setTimeout(() => setShowCode(false), 1000);
        } catch (e) {
          console.error("Failed to parse JSON from AI", e);
        }
      }

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { 
          role: "model", 
          text: cleanText.trim() || "Document updated successfully.",
          steps: currentSteps,
          isStreaming: false
        };
        saveCurrentDoc(finalDocState, newMessages);
        setDocState(finalDocState);
        pushToHistory(finalDocState);
        return newMessages;
      });

    } catch (error) {
      console.error("AI Error:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { 
          role: "model", 
          text: "Sorry, I encountered an error. Please try again.",
          isStreaming: false
        };
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = (msgText: string) => {
    // Find the last user message before this model message
    const modelIndex = messages.findIndex(m => m.text === msgText && m.role === "model");
    if (modelIndex > 0) {
      let lastUserMessage = "";
      for (let i = modelIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserMessage = messages[i].text;
          break;
        }
      }
      
      if (lastUserMessage) {
        // Remove the model message and any subsequent messages
        setMessages(prev => prev.slice(0, modelIndex));
        handleSendMessage(lastUserMessage);
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
          next.sections = next.sections.map((section: any) => ({
            ...section,
            paragraphs: section.paragraphs.map((p: any) => {
              const { color, ...rest } = p;
              return rest;
            })
          }));
          saveCurrentDoc(next, messages);
          pushToHistory(next);
          return next;
        });
        setConfirmAction(null);
      }
    });
  };

  const handleExport = () => {
    generateWordDoc(docState);
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
      
      saveCurrentDoc(next, messages);
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
      setCopiedFormat({
        isBold: p.isBold,
        isItalic: p.isItalic,
        color: p.color,
        fontFamily: p.fontFamily,
        alignment: p.alignment,
        isHeading: p.isHeading,
        headingLevel: p.headingLevel,
        isBullet: p.isBullet,
        isNumbering: p.isNumbering
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
      
      saveCurrentDoc(next, messages);
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
      saveCurrentDoc(next, messages);
      pushToHistory(next);
      return next;
    });
    setFocusedBlock(null);
  };

  const handleTextEdit = (sIdx: number, pIdx: number, rIdx: number, newText: string | null) => {
    if (newText === null) return;
    setDocState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next.sections[sIdx].paragraphs[pIdx];
      if (rIdx >= 0 && p.runs) {
        p.runs[rIdx].text = newText;
      } else {
        p.text = newText;
      }
      saveCurrentDoc(next, messages);
      pushToHistory(next);
      return next;
    });
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
      "flex flex-col h-screen overflow-hidden transition-colors duration-500 relative",
      darkMode 
        ? "bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#0f172a] text-[#E0E0E0] dark" 
        : "bg-gradient-to-br from-[#f8f9ff] via-[#eef2ff] to-[#f8f9ff] text-[#202124]"
    )}>
      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
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
      <header className="shrink-0 z-50 transition-colors">
        {/* Top Bar - Solid Background */}
        <div className={cn(
          "flex items-center justify-between px-4 py-2 border-b transition-colors",
          darkMode ? "bg-[#1A1A1A] border-white/10" : "bg-white border-black/5 shadow-sm"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Wand2 size={18} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">AI Word Sandbox</h1>
          </div>
          
          <div className="flex items-center gap-2">
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
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors mr-1",
                    showHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-100 dark:hover:bg-[#333] text-gray-500"
                  )}
                  title="My Documents"
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
                <span>Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Session Tabs - Global (Moved above mobile switcher) */}
        <div className={cn(
          "flex items-center gap-1 px-4 py-2 border-b overflow-x-auto custom-scrollbar shrink-0 z-30 transition-colors backdrop-blur-3xl",
          darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900"
        )}>
          {sessions.map(s => (
            <div 
              key={s.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border shrink-0",
                activeSessionId === s.id 
                  ? (darkMode ? "bg-blue-600 text-white border-blue-500 shadow-md" : "bg-blue-600 text-white border-blue-500 shadow-md")
                  : (darkMode ? "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10" : "bg-black/[0.05] border-black/5 text-gray-600 hover:bg-black/[0.08]")
              )}
              onClick={() => {
                const session = sessions.find(sess => sess.id === s.id);
                if (session) {
                  setActiveSessionId(s.id);
                  setDocState(session.docState);
                  setMessages(session.messages);
                  setLastJson(session.lastJson);
                  setCurrentDocId(session.currentDocId);
                }
              }}
            >
              <FileText size={14} />
              <span className="max-w-[100px] truncate">{s.docState.title}</span>
              
              <button 
                onClick={(e) => { e.stopPropagation(); generateWordDoc(s.docState); }}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Download"
              >
                <Download size={12} />
              </button>

              {sessions.length > 1 && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setConfirmAction({
                      message: `Are you sure you want to delete "${s.docState.title}"?`,
                      action: () => {
                        const newSessions = sessions.filter(sess => sess.id !== s.id);
                        setSessions(newSessions);
                        if (activeSessionId === s.id) {
                          const next = newSessions[0];
                          setActiveSessionId(next.id);
                          setDocState(next.docState);
                          setMessages(next.messages);
                          setLastJson(next.lastJson);
                          setCurrentDocId(next.currentDocId);
                          setHistory({ index: 0, stack: [next.docState] });
                        }
                        setConfirmAction(null);
                      }
                    });
                  }}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  title="Delete"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={() => {
              const newId = Math.random().toString(36).substring(7);
              const newSession: Session = {
                id: newId,
                docState: INITIAL_DOC_STATE,
                messages: [],
                lastJson: "",
                currentDocId: null
              };
              setSessions([...sessions, newSession]);
              setActiveSessionId(newId);
              setDocState(INITIAL_DOC_STATE);
              setMessages([]);
              setLastJson("");
              setCurrentDocId(null);
              setHistory({ index: 0, stack: [INITIAL_DOC_STATE] });
            }}
            className={cn(
              "p-2 rounded-lg transition-colors shrink-0",
              darkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"
            )}
            title="New Document"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={cn(
          "flex px-4 border-b border-inherit md:hidden backdrop-blur-3xl transition-colors",
          darkMode ? "bg-black/5" : "bg-black/[0.03]"
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
            Chat
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
            Preview
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
            "flex flex-col border-r relative z-10 transition-colors overflow-hidden shrink-0",
            darkMode ? "border-white/5 bg-black/2 backdrop-blur-3xl" : "border-black/5 bg-black/[0.05] backdrop-blur-3xl shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
            (!sidebarOpen && !isMobile) && "border-none",
            isMobile && "absolute inset-0 z-50 bg-black/[0.05] dark:bg-black/5 backdrop-blur-3xl",
            isMobile && activeTab !== "chat" && "pointer-events-none"
          )}
        >
          {/* Chat Spotlight Glow - Only in Chat Sidebar */}
          <div className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 w-[160%] h-[100%] pointer-events-none z-0 opacity-60",
            darkMode 
              ? "bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15)_0%,transparent_70%)]" 
              : "bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08)_0%,transparent_70%)]"
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
                        "group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between backdrop-blur-3xl",
                        darkMode ? "bg-black/30 border-white/10 hover:border-blue-500" : "bg-black/[0.18] border-black/20 hover:border-blue-400 shadow-xl"
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
                      "flex flex-col mb-4",
                      msg.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "group relative max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed shadow-xl border backdrop-blur-3xl",
                        msg.role === "user" 
                          ? "bg-blue-600/70 text-white rounded-tr-none border-blue-500/50" 
                          : cn("rounded-tl-none", darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900")
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
                      
                      {msg.text && (
                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed dark:prose-invert overflow-x-hidden">
                          <Markdown
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                const language = match ? match[1] : "text";
                                return !inline ? (
                                  <div className="relative rounded-xl overflow-hidden my-4 shadow-xl border backdrop-blur-3xl border-white/10 dark:border-white/10">
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
                                        title="Copy code"
                                      >
                                        <Copy size={14} />
                                        <span className="text-[10px] uppercase tracking-wider">Copy</span>
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
                        </div>
                      )}
                    </div>

                    {/* Message Actions */}
                    <div className={cn(
                      "flex items-center gap-1 mt-1 transition-opacity",
                      msg.role === "user" ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
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
                        <button
                          onClick={() => handleRetry(msg.text)}
                          disabled={isLoading}
                          className={cn(
                            "p-1.5 rounded flex items-center gap-1 text-xs transition-colors",
                            darkMode ? "hover:bg-[#444] text-gray-400" : "hover:bg-gray-200 text-gray-500"
                          )}
                          title="Retry generation"
                        >
                          <RotateCcw size={12} className={isLoading ? "animate-spin" : ""} />
                          <span>Retry</span>
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
          "p-4 border-t transition-colors backdrop-blur-3xl",
          darkMode ? "border-white/10 bg-black/30" : "border-black/20 bg-black/[0.18]",
          isInputExpanded && "fixed inset-0 z-[100] flex flex-col pt-20 pb-4 px-4 bg-black/40 backdrop-blur-3xl",
          isInputExpanded && isMobile && "w-full"
        )}>
          <div className={cn(
            "relative flex flex-col gap-2 transition-all",
            isInputExpanded && (darkMode ? "bg-black/40 p-4 rounded-xl border border-white/10 shadow-2xl h-full" : "bg-black/[0.05] p-4 rounded-xl border border-black/10 shadow-2xl h-full")
          )}>
            {isInputExpanded && (
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-bold tracking-tight uppercase opacity-60">Expanded Editor</span>
                </div>
                <button 
                  onClick={() => setIsInputExpanded(false)} 
                  className="p-2 rounded-full hover:bg-gray-500/10 transition-colors"
                  title="Minimize"
                >
                  <X size={24} />
                </button>
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  if (isInputExpanded) setIsInputExpanded(false);
                }
              }}
              placeholder="Type your instructions (e.g., 'Create a resume for...')"
              className={cn(
                "w-full p-4 pr-12 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y shadow-inner backdrop-blur-md",
                darkMode ? "bg-black/20 border-white/10 text-white placeholder:text-white/30" : "bg-black/[0.03] border-black/10 text-gray-900 placeholder:text-gray-400",
                isInputExpanded ? "flex-1 resize-none" : "min-h-[100px]"
              )}
            />
            <button
              onClick={() => setIsInputExpanded(!isInputExpanded)}
              className={cn(
                "absolute top-3 right-3 p-1.5 rounded-md transition-colors opacity-40 hover:opacity-100",
                isInputExpanded && "hidden"
              )}
              title="Expand input"
            >
              <Maximize2 size={16} />
            </button>
            <div className="flex items-center justify-between">
              <div className="flex gap-2 items-center">
                <ModelSelector 
                  selected={selectedModel} 
                  onChange={setSelectedModel} 
                  darkMode={darkMode} 
                />
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
              </div>
              <button
                onClick={() => {
                  handleSendMessage();
                  if (isInputExpanded) setIsInputExpanded(false);
                }}
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
          "flex-1 flex flex-col overflow-hidden relative z-10 transition-colors",
          "bg-transparent",
          isMobile && "absolute inset-0 z-40",
          isMobile && activeTab !== "preview" && "pointer-events-none"
        )}
      >
        {/* Document Sandbox */}
        <div className={cn(
          "flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar transition-colors relative z-10",
          "bg-transparent"
        )}>
          {/* Document Toolbar - Subheader */}
          <div 
            ref={toolbarRef}
            className={cn(
              "sticky top-0 z-30 min-h-14 py-2 border flex flex-wrap justify-center items-center px-4 md:px-6 shrink-0 transition-all backdrop-blur-3xl mb-6 rounded-xl shadow-2xl",
              darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/80 border-black/10 text-gray-900"
            )}
          >
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button 
                onClick={handleFormatPainterClick} 
                className={cn(
                  "p-1.5 rounded transition-colors flex items-center gap-1",
                  isFormatPainterActive 
                    ? "bg-white text-black shadow-sm" 
                    : "hover:bg-gray-100 dark:hover:bg-[#333]"
                )} 
                title="Format Painter"
              >
                <Paintbrush size={16} />
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              
              <button 
                onClick={undo}
                disabled={history.index === 0}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  history.index === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-[#333]"
                )}
                title="Undo"
              >
                <Undo size={16} />
              </button>
              <button 
                onClick={redo}
                disabled={history.index === history.stack.length - 1}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  history.index === history.stack.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-[#333]"
                )}
                title="Redo"
              >
                <Redo size={16} />
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Font Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setActiveDropdown(activeDropdown === 'font' ? null : 'font')}
                  className={cn(
                    "flex items-center gap-1 pl-2 pr-1 py-1 text-sm rounded transition-colors",
                    activeDropdown === 'font'
                      ? "bg-white text-black shadow-sm"
                      : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                  )}
                >
                  <Type size={14} className={activeDropdown === 'font' ? "text-black" : "text-gray-400"} />
                  <span className="w-24 text-left truncate">
                    {focusedBlock 
                      ? (docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].fontFamily?.split(',')[0].replace(/['"]/g, '') || "Default Font") 
                      : "Default Font"}
                  </span>
                  <ChevronDown size={14} className={activeDropdown === 'font' ? "text-black" : "text-gray-400"} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'font' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={cn(
                        "absolute top-full left-0 mt-5 w-48 rounded-xl shadow-2xl border py-1 z-50 backdrop-blur-3xl",
                        darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/80 border-black/10 text-gray-900"
                      )}
                    >
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
                            "w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#333] transition-colors",
                            focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].fontFamily === font.value && "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
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

              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <button 
                onClick={() => updateFocusedBlock({ isBold: true })} 
                className={cn(
                  "p-1.5 rounded transition-colors",
                  focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].isBold
                    ? "bg-white text-black shadow-sm"
                    : "hover:bg-gray-100 dark:hover:bg-[#333]"
                )} 
                title="Bold"
              >
                <Bold size={16} />
              </button>
              <button 
                onClick={() => updateFocusedBlock({ isItalic: true })} 
                className={cn(
                  "p-1.5 rounded transition-colors",
                  focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].isItalic
                    ? "bg-white text-black shadow-sm"
                    : "hover:bg-gray-100 dark:hover:bg-[#333]"
                )} 
                title="Italic"
              >
                <Italic size={16} />
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Alignment Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setActiveDropdown(activeDropdown === 'align' ? null : 'align')}
                  className={cn(
                    "flex items-center gap-1 p-1.5 rounded transition-colors",
                    activeDropdown === 'align'
                      ? "bg-white text-black shadow-sm"
                      : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                  )}
                  title="Alignment"
                >
                  {(() => {
                    const align = focusedBlock ? docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].alignment : 'left';
                    switch(align) {
                      case 'center': return <AlignCenter size={16} />;
                      case 'right': return <AlignRight size={16} />;
                      case 'justify': return <AlignJustify size={16} />;
                      default: return <AlignLeft size={16} />;
                    }
                  })()}
                  <ChevronDown size={12} className={activeDropdown === 'align' ? "text-black" : "text-gray-400"} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'align' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={cn(
                        "absolute top-full left-1/2 -translate-x-1/2 mt-5 rounded-xl shadow-2xl border p-1 z-50 flex gap-1 backdrop-blur-3xl",
                        darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/80 border-black/10 text-gray-900"
                      )}
                    >
                      <button 
                        onClick={() => { updateFocusedBlock({ alignment: 'left' }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].alignment === 'left'
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Align Left"
                      >
                        <AlignLeft size={16} />
                      </button>
                      <button 
                        onClick={() => { updateFocusedBlock({ alignment: 'center' }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].alignment === 'center'
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Align Center"
                      >
                        <AlignCenter size={16} />
                      </button>
                      <button 
                        onClick={() => { updateFocusedBlock({ alignment: 'right' }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].alignment === 'right'
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Align Right"
                      >
                        <AlignRight size={16} />
                      </button>
                      <button 
                        onClick={() => { updateFocusedBlock({ alignment: 'justify' }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].alignment === 'justify'
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Justify"
                      >
                        <AlignJustify size={16} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Lists Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setActiveDropdown(activeDropdown === 'list' ? null : 'list')}
                  className={cn(
                    "flex items-center gap-1 p-1.5 rounded transition-colors",
                    activeDropdown === 'list'
                      ? "bg-white text-black shadow-sm"
                      : "hover:bg-gray-100 dark:hover:bg-[#333] text-inherit"
                  )}
                  title="Lists"
                >
                  {(() => {
                    const p = focusedBlock ? docState.sections[focusedBlock.s].paragraphs[focusedBlock.p] : null;
                    if (p?.isNumbering) return <ListOrdered size={16} />;
                    return <List size={16} />;
                  })()}
                  <ChevronDown size={12} className={activeDropdown === 'list' ? "text-black" : "text-gray-400"} />
                </button>
                <AnimatePresence>
                  {activeDropdown === 'list' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={cn(
                        "absolute top-full left-1/2 -translate-x-1/2 mt-5 rounded-xl shadow-2xl border p-1 z-50 flex gap-1 backdrop-blur-3xl",
                        darkMode ? "bg-black/40 border-white/10 text-white" : "bg-white/80 border-black/10 text-gray-900"
                      )}
                    >
                      <button 
                        onClick={() => { updateFocusedBlock({ isBullet: true }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].isBullet
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Bullet List"
                      >
                        <List size={16} />
                      </button>
                      <button 
                        onClick={() => { updateFocusedBlock({ isNumbering: true }); setActiveDropdown(null); }} 
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          focusedBlock && docState.sections[focusedBlock.s].paragraphs[focusedBlock.p].isNumbering
                            ? "bg-gray-200 dark:bg-[#444]"
                            : "hover:bg-gray-100 dark:hover:bg-[#333]"
                        )} 
                        title="Numbered List"
                      >
                        <ListOrdered size={16} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <button onClick={() => {
                if (!focusedBlock) return;
                setDocState(prev => {
                  const next = JSON.parse(JSON.stringify(prev));
                  next.sections[focusedBlock.s].paragraphs.splice(focusedBlock.p + 1, 0, { text: "" });
                  saveCurrentDoc(next, messages);
                  pushToHistory(next);
                  return next;
                });
                setFocusedBlock({ s: focusedBlock.s, p: focusedBlock.p + 1 });
              }} className="p-1.5 hover:bg-blue-100 text-blue-500 rounded transition-colors" title="Add Paragraph Below"><Plus size={16} /></button>
              <button onClick={deleteFocusedBlock} className="p-1.5 hover:bg-red-100 text-red-500 rounded transition-colors" title="Delete Paragraph"><Trash size={16} /></button>
            </div>
          </div>

          <motion.div 
            layout
            className={cn(
              "max-w-[816px] mx-auto shadow-2xl min-h-[1056px] relative transition-colors origin-top border",
              "bg-white text-gray-900",
              isMobile ? "p-4 mx-4 mb-4 rounded-xl" : "p-8 md:p-[96px]",
              isFormatPainterActive && "cursor-copy"
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

                    const isFocused = focusedBlock?.s === sIdx && focusedBlock?.p === pIdx;
                    const focusClass = isFocused ? "ring-2 ring-blue-400/50 rounded bg-blue-50/30" : "border border-transparent hover:border-gray-200 rounded";

                    const handleBlockClick = () => {
                      if (isFormatPainterActive) {
                        applyFormatPainter(sIdx, pIdx);
                      } else {
                        setFocusedBlock({s: sIdx, p: pIdx});
                      }
                    };

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

                      const className = cn(headingSize, alignmentClass, focusClass, "outline-none p-1 transition-all");
                      const style = { color: p.color, fontFamily: p.fontFamily };

                      const renderHeadingContent = () => {
                        if (p.runs) {
                          return p.runs.map((r, i) => (
                            <span 
                              key={i} 
                              style={{ color: r.color, fontFamily: r.fontFamily }} 
                              className={cn(r.isBold && "font-bold", r.isItalic && "italic", "outline-none")}
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => handleTextEdit(sIdx, pIdx, i, e.currentTarget.textContent)}
                            >
                              {r.text}
                            </span>
                          ));
                        }
                        return (
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent)}
                            className="outline-none block min-h-[1.2em]"
                          >
                            {p.text}
                          </span>
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
                            "text-[11pt] leading-[1.5] flex-1 outline-none",
                            p.isBold && "font-bold",
                            p.isItalic && "italic",
                            !p.color && "text-gray-900"
                          )}
                          style={{ color: p.color, fontFamily: p.fontFamily }}
                        >
                          {p.runs ? (
                            p.runs.map((run, rIdx) => (
                              <span 
                                key={rIdx}
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleTextEdit(sIdx, pIdx, rIdx, e.currentTarget.textContent)}
                                className={cn(
                                  "outline-none",
                                  run.isBold && "font-bold",
                                  run.isItalic && "italic"
                                )}
                                style={{ color: run.color, fontFamily: run.fontFamily }}
                              >
                                {run.text}
                              </span>
                            ))
                          ) : (
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => handleTextEdit(sIdx, pIdx, -1, e.currentTarget.textContent)}
                              className="outline-none block min-h-[1.5em]"
                            >
                              {p.text}
                            </span>
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "absolute inset-0 z-50 flex flex-col transition-all backdrop-blur-3xl",
                darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900"
              )}
            >
              <div className={cn(
                "flex items-center justify-between p-4 border-b",
                darkMode ? "border-white/10" : "border-black/10"
              )}>
                <div className="flex items-center gap-2 text-blue-600">
                  <Code size={18} />
                  <span className="font-semibold text-sm">AI Generated Structure</span>
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

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={cn(
            "w-full max-w-sm p-6 rounded-2xl shadow-2xl backdrop-blur-3xl border",
            darkMode ? "bg-black/30 border-white/10 text-white" : "bg-black/[0.18] border-black/20 text-gray-900"
          )}>
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
      `}</style>
    </div>
  );
}
