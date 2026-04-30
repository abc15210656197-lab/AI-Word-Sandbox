import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  LevelFormat, 
  WidthType, 
  BorderStyle,
  Table, 
  TableRow, 
  TableCell, 
  VerticalAlign, 
  ImageRun,
  Math,
  MathRun,
  MathFraction,
  MathSubScript,
  MathSuperScript,
  MathSubSuperScript,
  MathRadical,
  MathRoundBrackets,
  MathSquareBrackets,
  MathCurlyBrackets
} from "docx";
import {saveAs} from "file-saver";
import {DocumentState, DocParagraph, DocTable, DocImage, DocFormula} from "../types";

import temml from "temml";

/**
 * Converts MathML elements to docx Math components recursively.
 */
const convertMathMLToDocx = (node: Node): any[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text) return [];
    // 移除 Temml 产生的数学不可见字符
    const cleanText = text.replace(/[\u2061\u2062\u2063\u2064]/g, "");
    if (!cleanText.trim()) return [];
    return [new MathRun(cleanText)];
  }
  
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const element = node as Element;
  const tagName = element.localName || element.tagName.toLowerCase().replace(/.*:/, '');

  const getChildren = (el: Element) => Array.from(el.childNodes).flatMap(c => convertMathMLToDocx(c));

  switch (tagName) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
    case 'ms':
    case 'mspace': {
      const text = element.textContent || "";
      const cleanText = text.replace(/[\u2061\u2062\u2063\u2064]/g, "");
      return [new MathRun(cleanText)];
    }
    case 'mfrac': {
      const children = Array.from(element.children);
      if (children.length < 2) return getChildren(element);
      return [new MathFraction({
        numerator: convertMathMLToDocx(children[0]),
        denominator: convertMathMLToDocx(children[1])
      })];
    }
    case 'msub': {
      const children = Array.from(element.children);
      if (children.length < 2) return getChildren(element);
      return [new MathSubScript({
        children: convertMathMLToDocx(children[0]),
        subScript: convertMathMLToDocx(children[1])
      })];
    }
    case 'msup': {
      const children = Array.from(element.children);
      if (children.length < 2) return getChildren(element);
      return [new MathSuperScript({
        children: convertMathMLToDocx(children[0]),
        superScript: convertMathMLToDocx(children[1])
      })];
    }
    case 'msubsup': {
      const children = Array.from(element.children);
      if (children.length < 3) return getChildren(element);
      return [new MathSubSuperScript({
        children: convertMathMLToDocx(children[0]),
        subScript: convertMathMLToDocx(children[1]),
        superScript: convertMathMLToDocx(children[2])
      })];
    }
    case 'msqrt':
      return [new MathRadical({
        children: getChildren(element)
      })];
    case 'mroot': {
      const children = Array.from(element.children);
      if (children.length < 2) return [new MathRadical({ children: getChildren(element) })];
      return [new MathRadical({
        children: convertMathMLToDocx(children[0]),
        degree: convertMathMLToDocx(children[1])
      })];
    }
    case 'mfenced': {
      const open = element.getAttribute('open') || '(';
      const close = element.getAttribute('close') || ')';
      const children = getChildren(element);
      if (open === '(' && close === ')') return [new MathRoundBrackets({ children })];
      if (open === '[' && close === ']') return [new MathSquareBrackets({ children })];
      if (open === '{' && close === '}') return [new MathCurlyBrackets({ children })];
      return [new MathRoundBrackets({ children })];
    }
    case 'mrow':
    case 'mstyle':
    case 'math':
    case 'semantics':
    case 'annotation':
    case 'annotation-xml':
      return getChildren(element);
    default:
      if (element.childNodes.length > 0) return getChildren(element);
      return element.textContent ? [new MathRun(element.textContent)] : [];
  }
};

/**
 * Converts a LaTeX string into docx Math objects.
 */
const latexToMathObjects = (latex: string) => {
  try {
    const rawLatex = latex.trim().replace(/^(\$\$|\$)/, '').replace(/(\$\$|\$)$/, '');
    const mathmlString = temml.renderToString(rawLatex, { xml: true });
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(mathmlString, "text/xml");
    let mathElement = xmlDoc.getElementsByTagName("math")[0] || 
                      xmlDoc.getElementsByTagNameNS("http://www.w3.org/1998/Math/MathML", "math")[0];
    
    if (!mathElement) {
      mathElement = xmlDoc.querySelector("math") as any;
    }

    if (!mathElement) {
      console.warn("No math element found for:", latex);
      return [new Math({ children: [new MathRun(rawLatex)] })];
    }
    
    const mathObjects = Array.from(mathElement.childNodes).flatMap(node => convertMathMLToDocx(node));
    return [new Math({ children: mathObjects })];
  } catch (e) {
    console.error("LaTeX to MathML error:", e);
    return [new TextRun({ 
      text: latex,
      font: { ascii: "Cambria Math", eastAsia: "Cambria Math", hAnsi: "Cambria Math", cs: "Cambria Math" }
    })];
  }
};


export async function generateWordDoc(state: DocumentState, resolveImage?: (src: string, alt?: string) => Promise<Uint8Array | string | null>) {
  const extractFont = (fontFamily?: string) => {
    if (!fontFamily) return undefined;
    const firstFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    return firstFont;
  };

  const createParagraph = async (p: DocParagraph) => {
    let heading;
    if (p.isHeading) {
      switch (p.headingLevel) {
        case 1: heading = HeadingLevel.HEADING_1; break;
        case 2: heading = HeadingLevel.HEADING_2; break;
        case 3: heading = HeadingLevel.HEADING_3; break;
        case 4: heading = HeadingLevel.HEADING_4; break;
        case 5: heading = HeadingLevel.HEADING_5; break;
        case 6: heading = HeadingLevel.HEADING_6; break;
        default: heading = HeadingLevel.HEADING_1;
      }
    }

    let alignment;
    switch (p.alignment) {
      case "center": alignment = AlignmentType.CENTER; break;
      case "right": alignment = AlignmentType.RIGHT; break;
      case "justify": alignment = AlignmentType.JUSTIFIED; break;
      default: alignment = AlignmentType.LEFT;
    }

    let numbering;
    if (p.isBullet) {
      numbering = { reference: "bullets", level: 0 };
    } else if (p.isNumbering) {
      numbering = { reference: "numbers", level: 0 };
    }

    const processTextWithMath = async (text: string, baseStyle: any) => {
      if (!text) return [];
      
      // Cleanup corruption (Form Feed etc)
      const sanitizedText = text
        .replace(/\x0C/g, '\\f')
        .replace(/\x0B/g, '\\v')
        .replace(/\x08/g, '\\b')
        .replace(/\x0D/g, '\\r')
        .replace(/\x09/g, '\\t');

      // Unicode-aware math detection
      const mathRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/gu;
      const parts = sanitizedText.split(mathRegex);
      const runs: any[] = [];

      for (const part of parts) {
        if (!part) continue;
        if ((part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('$') && part.endsWith('$'))) {
          runs.push(...latexToMathObjects(part));
          continue;
        }
        
        // Split text by emojis to wrap them in a font that supports them (Segoe UI Emoji)
        // This prevents corruption like 'ğ' appearing instead of emojis in Word/WPS
        const emojiRegex = /[\u{1F000}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
        const emojiMatches = Array.from(part.matchAll(emojiRegex));
        
        if (emojiMatches.length > 0) {
          let lastIndex = 0;
          for (const match of emojiMatches) {
            const index = match.index!;
            const textBefore = part.substring(lastIndex, index);
            if (textBefore) {
              runs.push(new TextRun({
                text: textBefore,
                ...baseStyle
              }));
            }
            runs.push(new TextRun({
              text: match[0],
              ...baseStyle,
              font: {
                ascii: "Segoe UI Emoji",
                eastAsia: "Segoe UI Emoji",
                hAnsi: "Segoe UI Emoji",
                cs: "Segoe UI Emoji"
              }
            }));
            lastIndex = index + match[0].length;
          }
          const textAfter = part.substring(lastIndex);
          if (textAfter) {
            runs.push(new TextRun({
              text: textAfter,
              ...baseStyle
            }));
          }
        } else {
          runs.push(new TextRun({
            text: part,
            ...baseStyle
          }));
        }
      }
      return runs;
    };

    const children = p.runs ? (await Promise.all(p.runs.map(async (run) => {
      if (run.isFormula) {
        return latexToMathObjects(run.text);
      }
      return await processTextWithMath(run.text, {
        bold: run.isBold,
        italics: run.isItalic,
        color: run.color?.replace("#", ""),
        font: run.fontFamily || p.fontFamily ? {
          ascii: extractFont(run.fontFamily) || extractFont(p.fontFamily) || "Arial",
          hAnsi: extractFont(run.fontFamily) || extractFont(p.fontFamily) || "Arial",
          eastAsia: extractFont(run.fontFamily) || extractFont(p.fontFamily) || "Microsoft YaHei",
          cs: extractFont(run.fontFamily) || extractFont(p.fontFamily) || "Arial"
        } : undefined,
        subScript: run.subscript || p.subscript,
        superScript: run.superscript || p.superscript,
      });
    }))).flat() : await processTextWithMath(p.text || "", {
      bold: p.isBold,
      italics: p.isItalic,
      color: p.color?.replace("#", ""),
      font: p.fontFamily ? {
        ascii: extractFont(p.fontFamily) || "Arial",
        hAnsi: extractFont(p.fontFamily) || "Arial",
        eastAsia: extractFont(p.fontFamily) || "Microsoft YaHei",
        cs: extractFont(p.fontFamily) || "Arial"
      } : undefined,
      subScript: p.subscript,
      superScript: p.superscript,
    });

    return new Paragraph({
      heading,
      alignment,
      numbering,
      spacing: { before: 120, after: 120 },
      children,
    });
  };

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: "Arial",
              eastAsia: "Microsoft YaHei",
              hAnsi: "Arial",
              cs: "Arial"
            },
            size: 24, // 12pt
            color: "333333",
          },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: "1F3864" },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: "2E75B6" },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: "4472C4" },
          paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          },
        },
        children: await Promise.all(state.sections.flatMap((section) =>
          section.paragraphs.map(async (p) => {
            if (p.type === 'table') {
              const tableData = p as DocTable;
              return new Table({
                width: {
                  size: tableData.width ? parseInt(tableData.width) : 100,
                  type: tableData.width?.includes('%') ? WidthType.PERCENTAGE : WidthType.AUTO,
                },
                rows: await Promise.all((tableData.rows || []).map(async row => new TableRow({
                  children: await Promise.all((row.cells || []).map(async cell => new TableCell({
                    children: await Promise.all((cell.content || []).map(cp => createParagraph(cp))),
                    shading: cell.backgroundColor ? { fill: cell.backgroundColor.replace("#", "") } : undefined,
                    verticalAlign: cell.verticalAlign === 'center' ? VerticalAlign.CENTER : 
                                  cell.verticalAlign === 'bottom' ? VerticalAlign.BOTTOM : 
                                  VerticalAlign.TOP,
                  }))),
                }))),
              });
            }
            if (p.type === 'image') {
              const imgData = p as DocImage;
              let imageData: Uint8Array | string | null = null;

              if (imgData.src.startsWith('data:')) {
                const base64 = imgData.src.split(',')[1];
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  bytes[i] = binary.charCodeAt(i);
                }
                imageData = bytes;
              } else if (resolveImage) {
                imageData = await resolveImage(imgData.src, imgData.alt);
              }

              if (imageData) {
                let finalWidth = imgData.width;
                let finalHeight = imgData.height;

                if (!finalWidth || !finalHeight) {
                  try {
                    const blob = new Blob([imageData]);
                    const url = URL.createObjectURL(blob);
                    const img = new Image();
                    img.src = url;
                    await new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = reject;
                    });
                    
                    const naturalWidth = img.naturalWidth;
                    const naturalHeight = img.naturalHeight;
                    
                    const TARGET_HEIGHT = 310; // Approx 1/3 of A4 page height in pixels at 96 DPI
                    const MAX_WIDTH = 600; // Approx A4 page width minus margins in pixels
                    
                    // Scale to 1/3 of page height
                    finalHeight = TARGET_HEIGHT;
                    finalWidth = (naturalWidth / naturalHeight) * TARGET_HEIGHT;
                    
                    // If the resulting width is still too wide, scale down based on max width
                    if (finalWidth > MAX_WIDTH) {
                      finalWidth = MAX_WIDTH;
                      finalHeight = (naturalHeight / naturalWidth) * MAX_WIDTH;
                    }
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    console.error("Failed to get image dimensions", e);
                    finalWidth = 400;
                    finalHeight = 300;
                  }
                }

                return new Paragraph({
                  alignment: imgData.alignment === 'center' ? AlignmentType.CENTER : 
                             imgData.alignment === 'right' ? AlignmentType.RIGHT : 
                             AlignmentType.LEFT,
                  children: [
                    new ImageRun({
                      data: imageData as any,
                      transformation: {
                        width: finalWidth,
                        height: finalHeight,
                      },
                    } as any),
                    ...(imgData.caption ? [new TextRun({ text: "\n" + imgData.caption, italics: true })] : [])
                  ],
                });
              }
              return new Paragraph({ children: [new TextRun({ text: "[Image: " + imgData.src + "]" })] });
            }
            if (p.type === 'formula') {
              const formulaData = p as DocFormula;
              let latex = formulaData.latex;
              if (formulaData.isBlock && !latex.startsWith('$$')) {
                latex = `$$${latex}$$`;
              } else if (!formulaData.isBlock && !latex.startsWith('$')) {
                latex = `$${latex}$`;
              }
              
              return new Paragraph({
                alignment: formulaData.alignment === 'center' ? AlignmentType.CENTER : 
                           formulaData.alignment === 'right' ? AlignmentType.RIGHT : 
                           AlignmentType.LEFT,
                children: latexToMathObjects(latex)
              });
            }
            return await createParagraph(p as DocParagraph);
          })
        )).then(res => res.flat()),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${state.title || "document"}.docx`);
}
