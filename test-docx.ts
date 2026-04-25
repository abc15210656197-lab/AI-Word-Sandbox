import { TextRun } from "docx";
const run = new TextRun({ text: "test", subscript: true, superscript: true });
console.log(run);
