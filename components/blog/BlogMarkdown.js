"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

export default function BlogMarkdown({ content, title }) {
  const MarkdownComponents = {
    h1: ({ node, ...props }) => <h2 className="text-3xl md:text-4xl font-extrabold mt-12 mb-6 text-white tracking-tight" {...props} />,
    h2: ({ node, ...props }) => <h3 className="text-2xl md:text-3xl font-bold mt-10 mb-4 pb-2 border-b border-white/10 text-white/90 tracking-tight" {...props} />,
    h3: ({ node, ...props }) => <h4 className="text-xl md:text-2xl font-semibold mt-8 mb-3 text-white/90" {...props} />,
    p: ({ node, children, ...props }) => {
      if (node.children[0]?.tagName === "img") {
        return <>{children}</>;
      }

      return (
        <p className="leading-7 md:leading-8 text-base md:text-lg text-gray-200 mb-6 last:mb-0" {...props}>
          {children}
        </p>
      );
    },
    ul: ({ node, ...props }) => <ul className="list-disc list-outside pl-6 mb-6 space-y-2 text-gray-300 marker:text-cyan-400" {...props} />,
    ol: ({ node, ...props }) => <ol className="list-decimal list-outside pl-6 mb-6 space-y-2 text-gray-300 marker:text-cyan-400 font-medium" {...props} />,
    a: ({ node, ...props }) => <a className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-8 rounded-xl border border-white/10 bg-white/5 shadow-2xl">
        <table className="w-full text-left border-collapse text-sm md:text-base text-gray-200" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-white/10 border-b border-white/20" {...props} />,
    tbody: ({ node, ...props }) => <tbody className="divide-y divide-white/10" {...props} />,
    tr: ({ node, ...props }) => <tr className="hover:bg-white/[0.02] transition-colors" {...props} />,
    th: ({ node, ...props }) => <th className="px-6 py-4 font-bold text-white tracking-wider uppercase text-xs" {...props} />,
    td: ({ node, ...props }) => <td className="px-6 py-4 leading-relaxed" {...props} />,
    img: ({ node, ...props }) => (
      <figure className="relative w-full my-10">
        <img
          className="rounded-2xl shadow-lg border border-white/10 w-full h-auto object-cover"
          alt={props.alt && props.alt !== "Image" ? props.alt : `Illustration for ${title}`}
          loading="lazy"
          decoding="async"
          {...props}
        />
        {props.alt && props.alt !== "Image" && (
          <figcaption className="block text-center text-sm text-gray-400 mt-3 italic">{props.alt}</figcaption>
        )}
      </figure>
    ),
    code: ({ node, inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || "");
      if (!inline && match) {
        return (
          <div className="relative my-8 rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{ margin: 0, padding: "1.5rem" }}
              {...props}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          </div>
        );
      }

      return (
        <code className="bg-white/10 text-cyan-400 font-mono text-sm px-1.5 py-0.5 rounded" {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
      {content}
    </ReactMarkdown>
  );
}
