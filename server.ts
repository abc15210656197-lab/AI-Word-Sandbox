import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import ImageKit from "imagekit";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import fs from "fs";
import os from "os";

dotenv.config();

const upload = multer({ dest: os.tmpdir() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  const isPlaceholderKey = (key: string) => {
    if (!key) return true;
    const k = key.toLowerCase();
    return k === "my_gemini_api_key" || 
           k.includes("your_api_key") || 
           k === "undefined" || 
           k === "null" ||
           k === "placeholder";
  };

  const rawKey = (
    process.env.GEMINI_API_KEY || 
    process.env.GOOGLE_API_KEY || 
    process.env.VITE_GEMINI_API_KEY ||
    ""
  ).replace(/["']/g, "").trim();

  const isPlaceholder = isPlaceholderKey(rawKey);
  const GEMINI_API_KEY = isPlaceholder ? "" : rawKey;

  if (isPlaceholder && rawKey) {
    console.warn(`⚠️ [Server] Detected placeholder Gemini API Key: ${rawKey}. We will ignore it and rely on the AI Studio Free Tier proxy.`);
  } else if (!rawKey) {
    console.log("✅ [Server] Gemini API Key is empty. Assuming AI Studio Free Tier proxy is handling requests.");
  } else {
    const maskedKey = `${GEMINI_API_KEY.substring(0, 4)}...${GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4)}`;
    console.log(`✅ [Server] Gemini API Key detected: ${maskedKey} (Length: ${GEMINI_API_KEY.length})`);
  }

  // Gemini SDK client for server-side
  const clientOptions: any = {};
  if (GEMINI_API_KEY) {
    clientOptions.apiKey = GEMINI_API_KEY;
  }
  const client = new GoogleGenAI(clientOptions);

  // ImageKit Initialization
  const imagekit = new ImageKit({
    urlEndpoint: process.env.VITE_IMAGEKIT_URL_ENDPOINT || "",
    publicKey: process.env.VITE_IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug-env", (req, res) => {
      res.json({
        geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
        googleKeyConfigured: Boolean(process.env.GOOGLE_API_KEY),
        viteGeminiKeyConfigured: Boolean(process.env.VITE_GEMINI_API_KEY),
        matchingKeyNames: Object.keys(process.env)
          .filter(k => k.includes("API") || k.includes("GEMINI"))
          .sort()
      });
    });
  }



  // Proxy Gemini File Upload
  app.post("/api/gemini/upload", upload.single("file"), async (req, res) => {
    let tempPath = "";
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const originalFileName = req.body.fileName || req.file.originalname;
      const mimeType = req.body.mimeType || req.file.mimetype || "application/octet-stream";
      
      const totalChunks = parseInt(req.body.totalChunks || "1", 10);
      const chunkIndex = parseInt(req.body.chunkIndex || "0", 10);
      const uuid = req.body.uuid || "default";

      const userApiKey = req.body.apiKey ? String(req.body.apiKey).trim() : "";
      let uploadClient = client;

      if (userApiKey && !isPlaceholderKey(userApiKey)) {
        uploadClient = new GoogleGenAI({ apiKey: userApiKey });
      }

      if (totalChunks > 1) {
        const tempDir = os.tmpdir();
        const assembledFilePath = path.join(tempDir, `gemini-upload-${uuid}`);
        
        const chunkData = fs.readFileSync(req.file.path);
        fs.appendFileSync(assembledFilePath, chunkData);
        fs.unlinkSync(req.file.path);
        
        if (chunkIndex < totalChunks - 1) {
          return res.json({ status: "chunk_received", chunkIndex, totalChunks });
        }
        
        tempPath = assembledFilePath;
      } else {
        tempPath = req.file.path;
      }

      const isProxy = isPlaceholderKey(userApiKey) && isPlaceholderKey(process.env.GEMINI_API_KEY || "");
      if (isProxy) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return res.status(400).json({ error: "API key not valid. Please pass a valid API key. (Proxy does not support direct backend File API)." });
      }

      const fileInfo = await uploadClient.files.upload({
        file: tempPath,
        config: {
          mimeType,
          displayName: originalFileName
        }
      });

      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      res.json(fileInfo);
    } catch (error: any) {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: error.message || "Gemini upload failed" });
    }
  });

  // ImageKit Auth Endpoint
  app.get("/api/imagekit/auth", (req, res) => {
    try {
      if (!process.env.VITE_IMAGEKIT_URL_ENDPOINT || !process.env.VITE_IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY) {
        return res.status(500).json({ error: "ImageKit credentials not configured" });
      }
      const result = imagekit.getAuthenticationParameters();
      res.json(result);
    } catch (error) {
      console.error("ImageKit Auth Error:", error);
      res.status(500).json({ error: "Failed to generate ImageKit auth parameters" });
    }
  });

  app.post("/api/extract-pdf-text", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        console.warn("PDF extraction attempt with no file");
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      console.log(`Extracting text from PDF: ${req.file.originalname} (${req.file.size} bytes)`);
      
      // @ts-ignore
      const pdfParseModule = await import("pdf-parse-fork");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      console.log(`Successfully extracted ${data.text?.length || 0} characters from ${req.file.originalname}`);
      res.json({ text: data.text });
    } catch (error: any) {
      console.error("PDF text extraction failed:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: error.message || "Failed to extract text from PDF" });
    }
  });

  app.post("/api/split-pdf", upload.single("file"), async (req, res) => {
    let tempPath = "";
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const originalFileName = req.body.fileName || req.file.originalname;
      const totalChunks = parseInt(req.body.totalChunks || "1", 10);
      const chunkIndex = parseInt(req.body.chunkIndex || "0", 10);
      const uuid = req.body.uuid || "default";

      // If it's a chunked upload
      if (totalChunks > 1) {
        const tempDir = os.tmpdir();
        const assembledFilePath = path.join(tempDir, `pdf-split-${uuid}`);
        
        const chunkData = fs.readFileSync(req.file.path);
        fs.appendFileSync(assembledFilePath, chunkData);
        fs.unlinkSync(req.file.path);
        
        if (chunkIndex < totalChunks - 1) {
          return res.json({ status: "chunk_received", chunkIndex, totalChunks });
        }
        tempPath = assembledFilePath;
      } else {
        tempPath = req.file.path;
      }

      console.log(`Assembled PDF for splitting: ${tempPath}. Starting split...`);

      const { PDFDocument } = await import("pdf-lib");
      const pdfBytes = fs.readFileSync(tempPath);
      const outputFiles = [];

      try {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();
        if (totalPages > 0) {
          const maxBytes = 15 * 1024 * 1024;
          const bytesPerPage = pdfBytes.byteLength / totalPages;
          const pagesPerChunk = Math.max(1, Math.floor(maxBytes / bytesPerPage));

          let partNum = 1;
          for (let i = 0; i < totalPages; i += pagesPerChunk) {
            const chunkPdf = await PDFDocument.create();
            const end = Math.min(i + pagesPerChunk, totalPages);
            const copiedPages = await chunkPdf.copyPages(pdfDoc, Array.from({ length: end - i }, (_, index) => i + index));
            copiedPages.forEach(page => chunkPdf.addPage(page));
            
            const chunkBytes = await chunkPdf.save();
            const partName = `${originalFileName.replace(/\.pdf$/i, "")}_part${partNum}.pdf`;
            const partUuid = `${uuid}-part${partNum}`;
            const partPath = path.join(os.tmpdir(), `split-result-${partUuid}.pdf`);
            
            fs.writeFileSync(partPath, chunkBytes);
            outputFiles.push({
              name: partName,
              url: `/api/download-temp/split-result-${partUuid}.pdf`,
              size: chunkBytes.byteLength
            });
            partNum++;
          }
        }
      } catch (err) {
        console.error("Failed to split PDF with pdf-lib:", err);
        throw new Error("Failed to split PDF");
      }

      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      res.json({ files: outputFiles });
    } catch (error: any) {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      res.status(500).json({ error: error.message || "Failed to split PDF" });
    }
  });

  app.get("/api/download-temp/:filename", (req, res) => {
    const filename = req.params.filename;
    // Basic security check to prevent directory traversal
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    
    const filePath = path.join(os.tmpdir(), filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    res.download(filePath, filename, (err) => {
      // Opt: Delete the file after 5 minutes to clean up, or immediately after download
      // We will let the OS clean tmpdir or we can delete it immediately after download.
      // E.g., fs.unlinkSync(filePath);
    });
  });

  // Global error handler for API routes - ensure JSON response
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("API Router Error:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      code: err.code
    });
  });

  // Google OAuth Configuration
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
  
  // Dynamic redirect URI construction
  const getGoogleRedirectUri = (req: any) => {
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
    if (appUrl) {
      return `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
    }
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    return `${protocol}://${host}/api/auth/google/callback`;
  };

  app.get("/api/auth/google/config", (req, res) => {
    // Return App ID (the first part of the client ID)
    const appId = GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.split('-')[0] : "";
    res.json({ appId });
  });

  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth credentials not configured" });
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      getGoogleRedirectUri(req)
    );

    const scopes = [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email"
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent"
    });

    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        getGoogleRedirectUri(req)
      );

      const { tokens } = await oauth2Client.getToken(code as string);
      
      // We pass the tokens back to the client via postMessage
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_OAUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth Callback Error:", error);
      res.status(500).send("Authentication failed: " + error.message);
    }
  });

  // Proxy Google Drive search
  app.post("/api/drive/list", async (req, res) => {
    const { tokens, query, folderId } = req.body;
    if (!tokens) return res.status(401).json({ error: "No tokens provided" });

    try {
      const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      oauth2Client.setCredentials(tokens);

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      
      let q = "";
      if (query) {
        // If searching, search in all files and folders
        q = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
      } else if (folderId) {
        // Find files inside the specified folder
        q = `'${folderId}' in parents and trashed = false`;
      } else {
        // Default: root folder
        q = `'root' in parents and trashed = false`;
      }

      const response = await drive.files.list({
        pageSize: 100,
        fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, iconLink)",
        q: q,
        orderBy: "folder, name"
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Drive list error:", error);
      res.status(500).json({ error: error.message });
    }
  });


  // Proxy Google Drive file content
  app.post("/api/drive/download", async (req, res) => {
    const { tokens, fileId } = req.body;
    if (!tokens || !fileId) return res.status(400).json({ error: "Missing tokens or fileId" });

    try {
      const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      oauth2Client.setCredentials(tokens);

      const drive = google.drive({ version: "v3", auth: oauth2Client });
      
      const fileMeta = await drive.files.get({ fileId, fields: "name, mimeType, size" });
      const mimeType = fileMeta.data.mimeType || "";
      let downloadResponse;

      if (mimeType.startsWith('application/vnd.google-apps.')) {
        // Handle Google native files (Doc, Sheet, Slide) by exporting to PDF
        console.log(`Exporting Google native file ${fileId} (${mimeType}) to PDF`);
        downloadResponse = await drive.files.export(
          { fileId, mimeType: 'application/pdf' },
          { responseType: "arraybuffer" }
        );
        res.setHeader("Content-Type", "application/pdf");
        const encodedName = encodeURIComponent((fileMeta.data.name || 'document') + '.pdf');
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
      } else {
        // Handle binary files
        downloadResponse = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" }
        );
        res.setHeader("Content-Type", mimeType || "application/octet-stream");
        const encodedName = encodeURIComponent(fileMeta.data.name || 'file');
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
      }

      res.send(Buffer.from(downloadResponse.data as ArrayBuffer));
    } catch (error: any) {
      console.error("Drive download error:", error);
      res.status(500).json({ error: error.message || "Failed to download file from Drive" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
