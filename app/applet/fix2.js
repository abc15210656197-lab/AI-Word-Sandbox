import * as fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /export const uploadFileToGemini.*?\}\s*\}\s*\);\s*\};\s*/s;

code = code.replace(regex, '');
fs.writeFileSync('src/App.tsx', code);
