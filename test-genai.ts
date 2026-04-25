import { GoogleGenAI } from "@google/genai";
async function run() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Hello",
    });
    console.log("Success:", response.text);
  } catch (e: any) {
    if (e.status === 403) {
      console.error("Got 403. Let's try gemini-2.5-flash...");
      try {
        const ai2 = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const res2 = await ai2.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Hello"
        });
        console.log("Success 2.5:", res2.text);
      } catch (e2) {
        console.error("Error 2.5:", e2);
      }
    } else {
      console.error("Error:", e);
    }
  }
}
run();
