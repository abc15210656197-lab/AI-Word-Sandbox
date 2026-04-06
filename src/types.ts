/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DocRun {
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  subscript?: boolean;
  superscript?: boolean;
  isFormula?: boolean;
}

export interface DocParagraph {
  type?: 'paragraph';
  text?: string; // If text is provided, it's a simple paragraph
  runs?: DocRun[]; // If runs are provided, they are rendered in sequence
  isHeading?: boolean;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  isBold?: boolean;
  isItalic?: boolean;
  isBullet?: boolean;
  isNumbering?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  color?: string; // Default color for the whole paragraph
  fontFamily?: string; // Default font for the whole paragraph
  fontSize?: string; // Default font size for the whole paragraph
  subscript?: boolean;
  superscript?: boolean;
}

export interface DocTableCell {
  content: DocParagraph[];
  isHeader?: boolean;
  backgroundColor?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface DocTableRow {
  cells: DocTableCell[];
}

export interface DocTable {
  type: 'table';
  rows: DocTableRow[];
  width?: string; // e.g. "100%"
  border?: boolean;
}

export interface DocImage {
  type: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  alignment?: 'left' | 'center' | 'right';
  caption?: string;
}

export interface DocFormula {
  type: 'formula';
  latex: string;
  isBlock?: boolean;
  alignment?: 'left' | 'center' | 'right';
  caption?: string;
}

export interface DocSection {
  paragraphs: (DocParagraph | DocTable | DocImage | DocFormula)[];
}

export interface DocumentState {
  title: string;
  sections: DocSection[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  data?: string; // Optional, only populated during API call
  file?: File; // For client-side handling
  previewUrl?: string; // For UI display
  url?: string; // Cloud storage URL (e.g., ImageKit)
  extractedText?: string; // For documents like DOCX
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  steps?: string[];
  isStreaming?: boolean;
  attachments?: ChatAttachment[];
  isError?: boolean;
}
