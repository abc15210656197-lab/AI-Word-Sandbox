/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DocRun {
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  color?: string;
}

export interface DocParagraph {
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
}

export interface DocSection {
  paragraphs: DocParagraph[];
}

export interface DocumentState {
  title: string;
  sections: DocSection[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
