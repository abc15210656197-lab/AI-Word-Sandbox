import JSZip from "jszip";
import { DocumentState, DocParagraph, DocTable, DocTableRow, DocTableCell, DocRun } from "../types";

export async function parseWordDoc(file: File): Promise<DocumentState> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Invalid Word document: word/document.xml not found");
  }
  
  const docXmlString = await docXmlFile.async("string");
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXmlString, "text/xml");
  
  // Also try to read styles.xml to resolve some basic styles if needed
  let stylesXmlDoc: Document | null = null;
  const stylesXmlFile = zip.file("word/styles.xml");
  if (stylesXmlFile) {
    const stylesXmlString = await stylesXmlFile.async("string");
    stylesXmlDoc = parser.parseFromString(stylesXmlString, "text/xml");
  }

  const paragraphs: any[] = [];
  
  const resolveColor = (val: string | null) => {
    if (!val || val === "auto") return undefined;
    if (val.startsWith("#")) return val;
    return `#${val}`;
  };

  const getStyleInfo = (styleId: string | null, visited = new Set<string>()): any => {
    if (!styleId || !stylesXmlDoc || visited.has(styleId)) return {};
    visited.add(styleId);
    
    let styleNode: Element | null = null;
    const styles = stylesXmlDoc.querySelectorAll("w\\:style, style");
    for (let i = 0; i < styles.length; i++) {
      if (styles[i].getAttribute("w:styleId") === styleId) {
        styleNode = styles[i];
        break;
      }
    }
    
    if (!styleNode) return {};
    
    let name = styleId;
    const nameNode = styleNode.querySelector("w\\:name, name");
    if (nameNode) {
      name = nameNode.getAttribute("w:val") || styleId;
    }

    let color: string | undefined;
    let fontSize: string | undefined;
    let isBold = false;
    let isItalic = false;

    // Resolve basedOn first
    const basedOnNode = styleNode.querySelector("w\\:basedOn, basedOn");
    if (basedOnNode) {
      const baseStyleId = basedOnNode.getAttribute("w:val");
      const baseInfo = getStyleInfo(baseStyleId, visited);
      color = baseInfo.color;
      fontSize = baseInfo.fontSize;
      isBold = baseInfo.isBold || false;
      isItalic = baseInfo.isItalic || false;
    }

    const rPr = styleNode.querySelector("w\\:rPr, rPr");
    if (rPr) {
      const colorNode = rPr.querySelector("w\\:color, color");
      if (colorNode) color = resolveColor(colorNode.getAttribute("w:val"));
      
      const szNode = rPr.querySelector("w\\:sz, sz") || rPr.querySelector("w\\:szCs, szCs");
      if (szNode) {
        const val = parseInt(szNode.getAttribute("w:val") || "0");
        if (val > 0) fontSize = `${val / 2}pt`;
      }
      
      const bNode = rPr.querySelector("w\\:b, b") || rPr.querySelector("w\\:bCs, bCs");
      if (bNode) {
        const val = bNode.getAttribute("w:val");
        isBold = val !== "0" && val !== "false";
      }
      
      const iNode = rPr.querySelector("w\\:i, i") || rPr.querySelector("w\\:iCs, iCs");
      if (iNode) {
        const val = iNode.getAttribute("w:val");
        isItalic = val !== "0" && val !== "false";
      }
    }
    
    return { name, color, fontSize, isBold, isItalic };
  };

  const processRun = (rNode: Element): DocRun | null => {
    const tNode = rNode.querySelector("w\\:t, t");
    if (!tNode) return null;
    
    const text = tNode.textContent || "";
    if (!text) return null;

    const rPr = rNode.querySelector("w\\:rPr, rPr");
    let isBold = false;
    let isItalic = false;
    let color: string | undefined = undefined;
    let fontSize: string | undefined = undefined;

    if (rPr) {
      const rStyle = rPr.querySelector("w\\:rStyle, rStyle");
      if (rStyle) {
        const val = rStyle.getAttribute("w:val");
        const styleInfo = getStyleInfo(val);
        if (styleInfo.isBold) isBold = true;
        if (styleInfo.isItalic) isItalic = true;
        if (styleInfo.color) color = styleInfo.color;
        if (styleInfo.fontSize) fontSize = styleInfo.fontSize;
      }

      const bNode = rPr.querySelector("w\\:b, b") || rPr.querySelector("w\\:bCs, bCs");
      if (bNode) {
        const val = bNode.getAttribute("w:val");
        isBold = val !== "0" && val !== "false";
      }
      
      const iNode = rPr.querySelector("w\\:i, i") || rPr.querySelector("w\\:iCs, iCs");
      if (iNode) {
        const val = iNode.getAttribute("w:val");
        isItalic = val !== "0" && val !== "false";
      }
      
      const colorNode = rPr.querySelector("w\\:color, color");
      if (colorNode) {
        color = resolveColor(colorNode.getAttribute("w:val"));
      }
      const szNode = rPr.querySelector("w\\:sz, sz") || rPr.querySelector("w\\:szCs, szCs");
      if (szNode) {
        const val = parseInt(szNode.getAttribute("w:val") || "0");
        if (val > 0) {
          fontSize = `${val / 2}pt`;
        }
      }
    }

    return { text, isBold, isItalic, color, fontSize };
  };

  const processParagraph = (pNode: Element): DocParagraph | null => {
    const pPr = pNode.querySelector("w\\:pPr, pPr");
    let isHeading = false;
    let headingLevel: any = undefined;
    let alignment: any = "left";
    let isBullet = false;
    let isNumbering = false;
    let pColor: string | undefined = undefined;
    let pFontSize: string | undefined = undefined;
    let pIsBold = false;
    let pIsItalic = false;

    if (pPr) {
      const pStyle = pPr.querySelector("w\\:pStyle, pStyle");
      if (pStyle) {
        const val = pStyle.getAttribute("w:val") || "";
        const styleInfo = getStyleInfo(val);
        const styleName = (styleInfo.name || val).toLowerCase();

        if (styleName.startsWith("heading") || styleName.includes("标题")) {
          isHeading = true;
          headingLevel = parseInt(styleName.replace(/[^\d]/g, "")) || 1;
          if (headingLevel > 6) headingLevel = 6;
        } else if (styleName === "title" || styleName.includes("正文标题")) {
          isHeading = true;
          headingLevel = 1;
        } else if (styleName === "subtitle" || styleName.includes("副标题")) {
          isHeading = true;
          headingLevel = 2;
        } else if (styleName.includes("list") || styleName.includes("列表")) {
          isBullet = true; // Simplified
        }
        
        pColor = styleInfo.color;
        if (styleInfo.fontSize) pFontSize = styleInfo.fontSize;
        if (styleInfo.isBold) pIsBold = true;
        if (styleInfo.isItalic) pIsItalic = true;
      }

      const jc = pPr.querySelector("w\\:jc, jc");
      if (jc) {
        const val = jc.getAttribute("w:val");
        if (val === "center") alignment = "center";
        else if (val === "right") alignment = "right";
        else if (val === "both") alignment = "justify";
      }

      const numPr = pPr.querySelector("w\\:numPr, numPr");
      if (numPr) {
        // Very simplified list detection
        isBullet = true; 
      }

      const rPr = pPr.querySelector("w\\:rPr, rPr");
      if (rPr) {
        const bNode = rPr.querySelector("w\\:b, b") || rPr.querySelector("w\\:bCs, bCs");
        if (bNode) {
          const val = bNode.getAttribute("w:val");
          pIsBold = val !== "0" && val !== "false";
        }
        
        const iNode = rPr.querySelector("w\\:i, i") || rPr.querySelector("w\\:iCs, iCs");
        if (iNode) {
          const val = iNode.getAttribute("w:val");
          pIsItalic = val !== "0" && val !== "false";
        }
        
        const szNode = rPr.querySelector("w\\:sz, sz") || rPr.querySelector("w\\:szCs, szCs");
        if (szNode) {
          const val = parseInt(szNode.getAttribute("w:val") || "0");
          if (val > 0) {
            pFontSize = `${val / 2}pt`;
          }
        }
      }
    }

    const runs: DocRun[] = [];
    const rNodes = pNode.querySelectorAll("w\\:r, r");
    rNodes.forEach(rNode => {
      const run = processRun(rNode);
      if (run) runs.push(run);
    });

    if (runs.length === 0) return null;

    // If paragraph has no runs but has text (fallback)
    if (runs.length === 1 && !runs[0].isBold && !runs[0].isItalic && !runs[0].color && !runs[0].fontSize) {
      return {
        text: runs[0].text,
        isHeading,
        headingLevel,
        alignment,
        isBullet,
        isNumbering,
        color: pColor,
        fontSize: pFontSize,
        isBold: pIsBold,
        isItalic: pIsItalic
      };
    }

    return {
      runs,
      isHeading,
      headingLevel,
      alignment,
      isBullet,
      isNumbering,
      color: pColor,
      fontSize: pFontSize,
      isBold: pIsBold,
      isItalic: pIsItalic
    };
  };

  const processTable = (tblNode: Element): DocTable => {
    const rows: DocTableRow[] = [];
    const trNodes = tblNode.querySelectorAll("w\\:tr, tr");
    
    trNodes.forEach((trNode, rIdx) => {
      const cells: DocTableCell[] = [];
      const tcNodes = trNode.querySelectorAll("w\\:tc, tc");
      
      tcNodes.forEach(tcNode => {
        const tcPr = tcNode.querySelector("w\\:tcPr, tcPr");
        let backgroundColor: string | undefined = undefined;
        let verticalAlign: any = "top";

        if (tcPr) {
          const shd = tcPr.querySelector("w\\:shd, shd");
          if (shd) {
            backgroundColor = resolveColor(shd.getAttribute("w:fill"));
          }
          const vAlign = tcPr.querySelector("w\\:vAlign, vAlign");
          if (vAlign) {
            const val = vAlign.getAttribute("w:val");
            if (val === "center") verticalAlign = "center";
            else if (val === "bottom") verticalAlign = "bottom";
          }
        }

        const cellParagraphs: DocParagraph[] = [];
        const pNodes = tcNode.querySelectorAll("w\\:p, p");
        pNodes.forEach(pNode => {
          const p = processParagraph(pNode);
          if (p) cellParagraphs.push(p);
        });

        // If empty cell
        if (cellParagraphs.length === 0) {
          cellParagraphs.push({ text: "" });
        }

        cells.push({
          content: cellParagraphs,
          isHeader: rIdx === 0, // Assume first row is header for simplicity, or we could check for specific styles
          backgroundColor,
          verticalAlign
        });
      });
      rows.push({ cells });
    });

    return {
      type: "table",
      rows,
      border: true
    };
  };

  const body = xmlDoc.querySelector("w\\:body, body");
  if (body) {
    body.childNodes.forEach(node => {
      const nodeName = node.nodeName.toLowerCase();
      if (nodeName === "w:p" || nodeName === "p") {
        const p = processParagraph(node as Element);
        if (p) paragraphs.push(p);
      } else if (nodeName === "w:tbl" || nodeName === "tbl") {
        const tbl = processTable(node as Element);
        paragraphs.push(tbl);
      }
    });
  }

  return {
    title: file.name.replace(/\.docx$/i, ""),
    sections: [{ paragraphs }]
  };
}

