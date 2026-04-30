import React from "react";
import { renderToString } from "react-dom/server";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const text = "$$\\frac{1}{2}$$";

const html1 = renderToString(
  <Markdown 
    remarkPlugins={[remarkMath]} 
    rehypePlugins={[rehypeKatex]}
    components={{
      p: ({ children }: any) => <span className="inline-block">{children}</span>
    }}
  >
    {text}
  </Markdown>
);

console.log("HTML1:", html1);
