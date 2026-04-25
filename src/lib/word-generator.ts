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
  ImageRun
} from "docx";
import { saveAs } from "file-saver";
import katex from "katex";
import { toPng } from "html-to-image";
import { DocumentState, DocParagraph, DocTable, DocImage } from "../types";

async function formulaToImage(latex: string, isBlock: boolean = false): Promise<{ data: Uint8Array, width: number, height: number } | null> {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.padding = '4px';
  container.style.background = 'white';
  container.style.color = 'black';
  container.style.display = 'inline-block';
  container.style.fontSize = '24px'; // Larger for better quality
  
  const mathSpan = document.createElement('span');
  try {
    katex.render(latex.replace(/^\$\$?/, '').replace(/\$\$?$/, ''), mathSpan, {
      displayMode: isBlock,
      throwOnError: false
    });
    container.appendChild(mathSpan);
    document.body.appendChild(container);
    
    // Small delay to ensure rendering is complete
    await new Promise(r => setTimeout(r, 50));
    
    const dataUrl = await toPng(container, { backgroundColor: 'white', pixelRatio: 2 });
    const img = new Image();
    img.src = dataUrl;
    await new Promise(r => img.onload = r);
    
    const width = img.naturalWidth / 2; 
    const height = img.naturalHeight / 2;
    
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    document.body.removeChild(container);
    return { data: bytes, width, height };
  } catch (e) {
    console.error("Formula render error", e);
    if (container.parentElement) document.body.removeChild(container);
    return null;
  }
}

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
          const isBlock = part.startsWith('$$');
          const latex = part.replace(/^\$\$?/, '').replace(/\$\$?$/, '');
          const img = await formulaToImage(latex, isBlock);
          if (img) {
            runs.push(new ImageRun({
              data: img.data,
              transformation: {
                width: img.width * (isBlock ? 0.9 : 0.7), // Scale for Word
                height: img.height * (isBlock ? 0.9 : 0.7),
              },
            } as any));
            continue;
          }
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
        const img = await formulaToImage(run.text, false);
        if (img) {
          return [new ImageRun({
            data: img.data,
            transformation: {
              width: img.width * 0.75,
              height: img.height * 0.75,
            },
          } as any)];
        }
        return [new TextRun({ text: run.text })];
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
              const formulaData = p as any;
              const img = await formulaToImage(formulaData.latex, true);
              
              return new Paragraph({
                alignment: formulaData.alignment === 'center' ? AlignmentType.CENTER : 
                           formulaData.alignment === 'right' ? AlignmentType.RIGHT : 
                           AlignmentType.LEFT,
                children: img ? [
                  new ImageRun({
                    data: img.data,
                    transformation: {
                      width: img.width,
                      height: img.height,
                    },
                  } as any)
                ] : [new TextRun({ text: formulaData.latex })]
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
