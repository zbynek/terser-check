import { minify } from "terser";
import fs from "fs/promises";
import process from "process";
import { SourceMapConsumer } from "source-map";
import {parse} from "acorn";
import { glob } from 'tinyglobby';

const matchedMap = await glob([process.argv[3].replaceAll('\\', '/')]);
const map = await fs.readFile(matchedMap[0], "utf-8");
const repo = encodeURIComponent(process.argv[4]);

const listLines = ([file, lines]) => {
  const link = `https://github.com/search?q=repo%3A${repo}%20${encodeURIComponent(file)}&type=code`;
  return `<a href="${link}">${file}</a>: ${[...lines].join(",")}\n`;
};

const escapeHTML = (str) =>
  str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag],
  );

const defaultOptions = {
  parse: {
    // parse options
  },
  compress: {
    // compress options
  },
  mangle: {
    // mangle options
    //properties: {
    // mangle property options
    //}
  },
  format: {
    ascii_only: true,
    // format options (can also use `output` for backwards compatibility)
  },
  sourceMap: {
    // source map options
  },
  ecma: 5, // specify one of: 5, 2015, 2016, etc.
  keep_classnames: false,
  keep_fnames: false,
  ie8: false,
  module: false,
  nameCache: null, // or specify a name cache object
  safari10: false,
  toplevel: false,
};


const matchedJs = await glob([process.argv[2].replaceAll('\\', '/')]);
const compiled = await fs.readFile(matchedJs[0], "utf-8");
const lineStarts = [0];
for (let idx = 1; idx < compiled.length && idx >= 0; idx = compiled.indexOf("\n", idx + 1)) {
  lineStarts.push(idx + 1);
}

const program = parse(compiled, {"ecmaVersion": "latest"});
const functions = program.body.filter((node) => node.type === "FunctionDeclaration");
const contributors = new Array(lineStarts.length);
console.log("Parsing source map...");
let functionIndex = 0;
let column = 0;
await SourceMapConsumer.with(JSON.parse(map), null, (consumer) => {
  consumer.eachMapping(
    ({
      source,
      generatedLine,
      generatedColumn,
      originalLine,
      originalColumn,
      name,
    }) => {
      if (!source) {
        column = generatedColumn;
        return;
      }
      let current = functions[functionIndex];

      while (current.end < lineStarts[generatedLine] + generatedColumn) {
        functionIndex++;
        current = functions[functionIndex];
        if (!current) {
          functionIndex = 0;
          console.warn(`Unexpected mapping for ${source}:${originalLine}:${originalColumn} at ${generatedLine}:${generatedColumn} - no more functions`);
          return;
        }
      }
      if (column > generatedColumn) {
        column = 0;
      }
      contributors[functionIndex] = contributors[functionIndex] || {};
      contributors[functionIndex][source] =
        contributors[functionIndex][source] || new Set();
      contributors[functionIndex][source].add(`${originalLine}:${column}-${generatedColumn}`);
      column = generatedColumn;
    },
  );
});
let count = 0;
const optimizations = [];
let total = 0;
let totalOptimized = 0;
for (const func of functions) {
  const line = compiled.slice(func.start, func.end);
  count++;
  if (line.includes("<svg")) {
    continue;
  }
  const {code} = await minify(line, defaultOptions);
  if (count % 1000 === 0) {
    console.log(`${count} / ${functions.length}`);
  }
  total += line.length;
  totalOptimized += code.length;
  if (code.length != line.length) {
    optimizations.push({
      original: line,
      optimized: code,
      location: count,
      ratio: code.length / line.length,
    });
  }
}

optimizations.sort((a, b) => a.ratio - b.ratio);

const report = await fs.open("report.html", "w");
await report.write(
  `<html><head><title>Comparison</title><link rel="stylesheet" href="https://unpkg.com/mvp.css"></head><body><main>\n`,
);
await report.write(
  `Optimized from  ${total} to ${totalOptimized} (${(1 - totalOptimized / total) * 100}% saved)\n`,
);
// Write optimizations to the report file
for (const opt of optimizations) {
  await report.write(`<hr><p>Ratio: ${opt.ratio.toFixed(4)}</p>
  <p>src: <code>${escapeHTML(opt.original)}</code></p>
  <p>opt: <code>${escapeHTML(opt.optimized)}</code></p>
  <p>loc: ${Object.entries(contributors[opt.location]||{}).map(listLines)}</p>\n`);
}
await report.write(`</main></body></html>\n`);

// Close the file
await report.close();
console.log("Report written to report.html");
