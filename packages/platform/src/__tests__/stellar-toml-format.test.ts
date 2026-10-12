import { describe, expect, it } from "vitest";

import { currencyImageUrl, currencyToml, tomlString } from "../stellar-toml-format";

describe("tomlString", () => {
  it("escapes quotes, backslashes and line breaks", () => {
    expect(tomlString('say "hi"')).toBe('"say \\"hi\\""');
    expect(tomlString("a\\b")).toBe('"a\\\\b"');
    expect(tomlString("one\ntwo\r\n")).toBe('"one\\ntwo\\r\\n"');
    expect(tomlString("tab\there")).toBe('"tab\\there"');
    expect(tomlString("bell\u0007")).toBe('"bell\\u0007"');
  });
});

describe("currencyToml", () => {
  const base = {
    code: "COIN",
    issuer: "GISSUER",
    name: "Coin",
    description: "A coin",
    thumbnail: "QmHash",
  };

  it("writes one currency entry", () => {
    expect(currencyToml(base)).toBe(
      [
        "[[CURRENCIES]]",
        'code="COIN"',
        'issuer="GISSUER"',
        "display_decimals=7",
        'name="Coin"',
        'desc="A coin"',
        'image="https://ipfs.io/ipfs/QmHash"',
        "",
        "",
      ].join("\n"),
    );
  });

  it("can't be used to add keys or tables to the file", () => {
    const toml = currencyToml({
      ...base,
      name: 'x"\n[[CURRENCIES]]\ncode="FAKE"\nissuer="GATTACKER',
      description: 'y"\n[DOCUMENTATION]\nORG_NAME="Evil"',
    });
    // the injected text stays inside the quoted values: only one table header starts a line
    expect(toml.match(/^\[\[CURRENCIES\]\]$/gm)).toHaveLength(1);
    expect(toml).not.toMatch(/^code="FAKE"/m);
    expect(toml).not.toMatch(/^\[DOCUMENTATION\]/m);
    expect(toml.split("\n").filter((line) => line.startsWith("name="))).toHaveLength(1);
  });

  it("omits desc and image when there are none (no literal 'null')", () => {
    const toml = currencyToml({ ...base, description: null, thumbnail: null });
    expect(toml).not.toContain("desc=");
    expect(toml).not.toContain("image=");
    expect(toml).not.toContain("null");
  });
});

describe("currencyImageUrl", () => {
  it("handles IPFS hashes, gateway urls and plain image urls", () => {
    expect(currencyImageUrl("QmHash")).toBe("https://ipfs.io/ipfs/QmHash");
    expect(currencyImageUrl("https://gateway.pinata.cloud/ipfs/QmHash")).toBe(
      "https://ipfs.io/ipfs/QmHash",
    );
    expect(currencyImageUrl("https://bucket.s3.amazonaws.com/abc")).toBe(
      "https://bucket.s3.amazonaws.com/abc",
    );
    expect(currencyImageUrl("")).toBeUndefined();
    expect(currencyImageUrl(null)).toBeUndefined();
  });
});
