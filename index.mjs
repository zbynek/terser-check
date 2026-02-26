import { minify } from "terser";
import fs from "fs/promises";
import process from "process";

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
    ascii_only: true
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

const lines = (await fs.readFile(process.argv[2], "utf-8")).split("\n")
  .filter(line => line.startsWith("function") && !line.includes("<svg"));
let count = 0;
const optimizations = [];
let total = 0;
let totalOptimized = 0;
for (const line of lines) {
  count++;
  let code = "";
  try {
    const codeObject = await minify(line, defaultOptions);
    code = codeObject.code;
  } catch (e) {
    console.log(`Could not parse: ${line}`)
    continue;
  }
  if (count % 1000 === 0) {
    console.log(`${count} / ${lines.length}`);
  }
  total += line.length;
  totalOptimized += code.length;
  if (code.length != line.length) {
    optimizations.push({
      original: line,
      optimized: code,
      ratio: code.length / line.length
    });
  }
}

optimizations.sort((a, b) => a.ratio - b.ratio);

const report = await fs.open("report.txt", "w");
await report.write(`Optimized from  ${total} to ${totalOptimized} (${(1-totalOptimized/total)*100}% saved)\n`);
// Write optimizations to the report file
for (const opt of optimizations) {
  await report.write(`Ratio: ${opt.ratio.toFixed(4)}\n`);
  await report.write(`src: ${opt.original}\n`);
  await report.write(`opt: ${opt.optimized}\n`);
  await report.write(`\n`);
}

// Close the file
await report.close();
console.log("Report written to report.txt");
