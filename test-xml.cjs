const { JSDOM } = require("jsdom");
const xml = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
const dom = new JSDOM(xml, { contentType: "text/xml" });
const doc = dom.window.document;
const styles = doc.documentElement;
const styleNode = styles.querySelector("style");
console.log("getAttribute('w:styleId'):", styleNode.getAttribute("w:styleId"));
console.log("getAttribute('styleId'):", styleNode.getAttribute("styleId"));




