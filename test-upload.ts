import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

(async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    process.exit(1);
  }
  
  // Write a dummy file to upload
  const fileContent = "Hello world".repeat(10);
  const tempPath = path.join(process.cwd(), 'tempfile.txt');
  fs.writeFileSync(tempPath, fileContent);

  console.log("Starting upload...");
  try {
    const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileContent.length.toString(),
        'X-Goog-Upload-Header-Content-Type': 'text/plain',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { displayName: 'tempfile.txt' } })
    });

    if (!startRes.ok) throw new Error(`Failed to start upload: ${startRes.statusText}`);
    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
    console.log("Upload URL:", uploadUrl);
    
    // Now upload
    const uploadRes = await fetch(uploadUrl!, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
        'Content-Length': fileContent.length.toString(),
      },
      body: fileContent
    });
    
    console.log("Upload Res status:", uploadRes.status);
    const result = await uploadRes.json();
    console.log("Uploaded File URI:", result.file.uri);
  } catch(e) {
    console.error("Error:", e);
  }
})();
