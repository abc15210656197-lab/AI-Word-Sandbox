import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  LevelFormat, 
  WidthType, 
  BorderStyle 
} from "docx";
import { saveAs } from "file-saver";
import { DocumentState } from "../types";

export async function generateWordDoc(state: DocumentState) {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
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
        children: state.sections.flatMap((section) =>
          section.paragraphs.map((p) => {
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

            const extractFont = (fontFamily?: string) => {
              if (!fontFamily) return undefined;
              const firstFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
              return firstFont;
            };

            const children = p.runs ? p.runs.map(run => new TextRun({
              text: run.text,
              bold: run.isBold,
              italics: run.isItalic,
              color: run.color?.replace("#", ""),
              font: extractFont(run.fontFamily) || extractFont(p.fontFamily),
            })) : [
              new TextRun({
                text: p.text || "",
                bold: p.isBold,
                italics: p.isItalic,
                color: p.color?.replace("#", ""),
                font: extractFont(p.fontFamily),
              }),
            ];

            return new Paragraph({
              heading,
              alignment,
              numbering,
              spacing: { before: 120, after: 120 },
              children,
            });
          })
        ),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${state.title || "document"}.docx`);
}
