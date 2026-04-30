import React from "react";
import { renderToString } from "react-dom/server";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const text = "1. 理论公式推导: 根据动能定理 $E_k=\\frac{1}{2}mv^2$ 及向心力公式 $F=m\\frac{v^2}{R}$ , 可得...";

const html1 = renderToString(
  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
    {text}
  </Markdown>
);

console.log("HTML1:", html1);
