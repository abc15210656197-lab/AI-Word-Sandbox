import * as fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacement = `const hasBinary = !!((att.fileUri && att.type) || (att.data && att.type && !att.type.includes('wordprocessingml.document')));
                if (att.extractedText && (!hasBinary || !att.type.includes('pdf'))) {`;

code = code.replace(/if \(att\.extractedText\) \{/g, replacement);

fs.writeFileSync('src/App.tsx', code);
