/**
 * Best-effort parser for a JSON document that is still arriving.
 *
 * Returns the value as far as it can be known right now:
 *  - open objects and arrays are closed,
 *  - a string that is still being written is returned as the text so far,
 *  - a key without a value yet is dropped,
 *  - numbers and literals are only returned once they are certainly finished
 *    (a number at the very end of the buffer might still grow: "12" could become "120").
 *
 * Returns `undefined` while nothing parseable has arrived. Never throws.
 */
export function parsePartialJson(input: string): unknown {
  const src = stripFence(input);
  const parser = new Parser(src);
  const result = parser.parseValue();
  return result === NONE ? undefined : result;
}

/**
 * Strict counterpart for finished responses: the whole document must be valid JSON (a surrounding
 * Markdown code fence is allowed). A truncated document returns `undefined` instead of its prefix, so it
 * can never pass validation the way a partial parse would.
 */
export function parseCompleteJson(input: string): unknown {
  const body = stripFence(input).replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

const NONE = Symbol("none");
type Maybe = unknown | typeof NONE;

function stripFence(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("```")) return trimmed;
  const newline = trimmed.indexOf("\n");
  return newline === -1 ? "" : trimmed.slice(newline + 1);
}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  private get eof() {
    return this.i >= this.s.length;
  }

  private skipWs() {
    while (!this.eof && /\s/.test(this.s[this.i]!)) this.i++;
  }

  parseValue(): Maybe {
    this.skipWs();
    if (this.eof) return NONE;
    const c = this.s[this.i]!;
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"') return this.parseString().value;
    if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
    return this.parseLiteral();
  }

  private parseObject(): Maybe {
    this.i++; // {
    const obj: Record<string, unknown> = {};
    for (;;) {
      this.skipWs();
      if (this.eof) return obj;
      if (this.s[this.i] === "}") {
        this.i++;
        return obj;
      }
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      if (this.s[this.i] !== '"') return obj; // malformed: keep what we have
      const key = this.parseString();
      if (!key.closed) return obj; // key still being written: not usable yet
      this.skipWs();
      if (this.eof || this.s[this.i] !== ":") return obj;
      this.i++;
      const value = this.parseValue();
      if (value === NONE) return obj;
      obj[key.value as string] = value;
      if (this.eof) return obj;
    }
  }

  private parseArray(): Maybe {
    this.i++; // [
    const arr: unknown[] = [];
    for (;;) {
      this.skipWs();
      if (this.eof) return arr;
      if (this.s[this.i] === "]") {
        this.i++;
        return arr;
      }
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      const value = this.parseValue();
      if (value === NONE) return arr;
      arr.push(value);
      if (this.eof) return arr;
    }
  }

  private parseString(): { value: string; closed: boolean } {
    this.i++; // opening quote
    let out = "";
    while (!this.eof) {
      const c = this.s[this.i]!;
      if (c === '"') {
        this.i++;
        return { value: out, closed: true };
      }
      if (c === "\\") {
        const next = this.s[this.i + 1];
        if (next === undefined) {
          this.i = this.s.length;
          break; // dangling backslash: drop it
        }
        if (next === "u") {
          const hex = this.s.slice(this.i + 2, this.i + 6);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.i = this.s.length;
            break; // partial unicode escape: drop it
          }
          out += String.fromCharCode(parseInt(hex, 16));
          this.i += 6;
          continue;
        }
        const map: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        out += map[next] ?? next;
        this.i += 2;
        continue;
      }
      out += c;
      this.i++;
    }
    return { value: out, closed: false };
  }

  private parseNumber(): Maybe {
    const start = this.i;
    while (!this.eof && /[-+0-9.eE]/.test(this.s[this.i]!)) this.i++;
    if (this.eof) return NONE; // might still grow
    const n = Number(this.s.slice(start, this.i));
    return Number.isNaN(n) ? NONE : n;
  }

  private parseLiteral(): Maybe {
    for (const [word, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        return value;
      }
    }
    // a strict prefix of a literal at the end of the buffer, or garbage
    this.i = this.s.length;
    return NONE;
  }
}
