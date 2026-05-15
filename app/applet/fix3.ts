import * as fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// Using line replacements or regex
const regex = /\/\/ Proxy Gemini File Upload[\s\S]*?res\.status\(500\)\.json\(\{ error: error\.message || "Gemini upload failed" \}\);\s*\}\s*\}\);\s*/;

code = code.replace(regex, '');
fs.writeFileSync('server.ts', code);
