export class DuplicateJsonKeyError extends SyntaxError {
  constructor() {
    super('Duplicate JSON object key');
    this.name = 'DuplicateJsonKeyError';
  }
}

class JsonShapeParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): void {
    this.skipWhitespace();
    this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.source.length) this.fail();
  }

  private parseValue(): void {
    const character = this.source[this.position];
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (character === '"') {
      this.parseString();
      return;
    }
    if (character === 't') return this.parseLiteral('true');
    if (character === 'f') return this.parseLiteral('false');
    if (character === 'n') return this.parseLiteral('null');
    this.parseNumber();
  }

  private parseObject(): void {
    this.position++;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.source[this.position] === '}') {
      this.position++;
      return;
    }
    while (true) {
      if (this.source[this.position] !== '"') this.fail();
      const key = this.parseString();
      if (keys.has(key)) throw new DuplicateJsonKeyError();
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.position] !== ':') this.fail();
      this.position++;
      this.skipWhitespace();
      this.parseValue();
      this.skipWhitespace();
      const separator = this.source[this.position++];
      if (separator === '}') return;
      if (separator !== ',') this.fail();
      this.skipWhitespace();
    }
  }

  private parseArray(): void {
    this.position++;
    this.skipWhitespace();
    if (this.source[this.position] === ']') {
      this.position++;
      return;
    }
    while (true) {
      this.parseValue();
      this.skipWhitespace();
      const separator = this.source[this.position++];
      if (separator === ']') return;
      if (separator !== ',') this.fail();
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    const start = this.position;
    this.position++;
    while (this.position < this.source.length) {
      const character = this.source[this.position++];
      if (character === '"') {
        try {
          return JSON.parse(this.source.slice(start, this.position)) as string;
        } catch {
          this.fail();
        }
      }
      if (character === '\\') {
        const escaped = this.source[this.position++];
        if (escaped === 'u') {
          const hex = this.source.slice(this.position, this.position + 4);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) this.fail();
          this.position += 4;
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped)) {
          this.fail();
        }
      } else if (character.charCodeAt(0) < 0x20) {
        this.fail();
      }
    }
    this.fail();
  }

  private parseLiteral(literal: string): void {
    if (this.source.slice(this.position, this.position + literal.length) !== literal) this.fail();
    this.position += literal.length;
  }

  private parseNumber(): void {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.position),
    );
    if (!match) this.fail();
    this.position += match[0].length;
  }

  private skipWhitespace(): void {
    while (/[\t\n\r ]/.test(this.source[this.position] ?? '')) this.position++;
  }

  private fail(): never {
    throw new SyntaxError('Invalid JSON');
  }
}

export function parseUniqueJson(source: string): unknown {
  new JsonShapeParser(source).parse();
  return JSON.parse(source) as unknown;
}
