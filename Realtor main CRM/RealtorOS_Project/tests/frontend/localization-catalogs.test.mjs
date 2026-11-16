import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const catalogDirectory = new URL("../../app/assets/i18n/", import.meta.url);
const locales = ["ar", "de", "en", "es", "fr", "it", "pt"];

function readCatalog(locale) {
  // Fatal decoding catches invalid UTF-8 instead of silently replacing bytes.
  const bytes = readFileSync(new URL(`${locale}.json`, catalogDirectory));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const catalog = JSON.parse(text);
  assert.ok(catalog && typeof catalog === "object" && !Array.isArray(catalog),
    `${locale}: catalog must be a JSON object`);
  return catalog;
}

function placeholders(value) {
  // Preserve repetitions as well as names: translations may reorder tokens,
  // but must not lose, duplicate, or rename positional/user-data placeholders.
  return Array.from(value.matchAll(/\{\{[^{}]+\}\}|\{\d+\}/gu), match => match[0]).sort();
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

const english = readCatalog("en");
const englishKeys = Object.keys(english).sort();

test("all supported locale catalogs are present", () => {
  const files = readdirSync(catalogDirectory).filter(name => name.endsWith(".json")).sort();
  assert.deepEqual(files, locales.map(locale => `${locale}.json`));
  assert.ok(englishKeys.length > 0, "English source catalog must not be empty");
});

for (const locale of locales) {
  test(`${locale} catalog preserves source keys, placeholders, and safe Unicode text`, () => {
    const catalog = readCatalog(locale);
    assert.deepEqual(Object.keys(catalog).sort(), englishKeys,
      `${locale}: keys must exactly match the current English catalog`);

    for (const key of englishKeys) {
      const value = catalog[key];
      const location = `${locale}: ${JSON.stringify(key)}`;
      assert.equal(typeof value, "string", `${location}: value must be a string`);
      assert.ok(value.trim().length > 0, `${location}: value must not be empty`);
      assert.deepEqual(placeholders(value), placeholders(english[key]),
        `${location}: placeholder multiset differs from English`);
      assert.doesNotMatch(value, /\uFFFD/u, `${location}: replacement character indicates damaged text`);
      assert.equal(hasUnpairedSurrogate(value), false,
        `${location}: unpaired UTF-16 surrogate indicates damaged text`);
      // Typical UTF-8 decoded as Latin-1/Windows-1252. Native accents, Arabic,
      // combining marks, emoji, and legitimate HTML entities remain allowed.
      assert.doesNotMatch(value, /(?:[\u00C2\u00C3\u00D8\u00D9][\u0080-\u00BF]|\u00E2\u20AC|\u00F0\u0178)/u,
        `${location}: probable mojibake`);
      assert.doesNotMatch(value, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u,
        `${location}: unexpected control character`);
      assert.doesNotMatch(value, /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u206F\uFEFF]/u,
        `${location}: embedded bidi/BOM controls are not allowed`);
      assert.doesNotMatch(value, /<\s*(?:!|\/?\s*[a-z][\w:-]*(?=[\s/>]|$))/iu,
        `${location}: catalog values must not contain HTML markup`);
    }
  });
}
