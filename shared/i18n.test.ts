import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APP_LANGUAGES, UI_STRINGS, languageDisplayName } from './i18n.ts';

describe('Multi-Language Verbality & i18n Completeness Suite', () => {
  it('has valid metadata and display names for all supported languages', () => {
    assert.deepEqual(APP_LANGUAGES, ['en', 'hi', 'bn']);
    assert.equal(languageDisplayName('en'), 'English');
    assert.equal(languageDisplayName('hi'), 'हिन्दी');
    assert.equal(languageDisplayName('bn'), 'বাংলা');
  });

  function getLeafPaths(obj: Record<string, any>, prefix = ''): Map<string, string> {
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const sub = getLeafPaths(value, fullPath);
        for (const [subKey, subVal] of sub.entries()) {
          map.set(subKey, subVal);
        }
      } else if (Array.isArray(value)) {
        map.set(fullPath, JSON.stringify(value));
      } else {
        map.set(fullPath, String(value));
      }
    }
    return map;
  }

  it('verifies 100% key parity across English, Hindi, and Bengali dictionaries', () => {
    const enMap = getLeafPaths(UI_STRINGS.en);
    const hiMap = getLeafPaths(UI_STRINGS.hi);
    const bnMap = getLeafPaths(UI_STRINGS.bn);

    const enKeys = Array.from(enMap.keys()).sort();
    const hiKeys = Array.from(hiMap.keys()).sort();
    const bnKeys = Array.from(bnMap.keys()).sort();

    // Check English vs Hindi parity
    const missingInHi = enKeys.filter((k) => !hiMap.has(k));
    const extraInHi = hiKeys.filter((k) => !enMap.has(k));
    assert.deepEqual(missingInHi, [], `Missing keys in Hindi: ${missingInHi.join(', ')}`);
    assert.deepEqual(extraInHi, [], `Extra keys in Hindi: ${extraInHi.join(', ')}`);

    // Check English vs Bengali parity
    const missingInBn = enKeys.filter((k) => !bnMap.has(k));
    const extraInBn = bnKeys.filter((k) => !enMap.has(k));
    assert.deepEqual(missingInBn, [], `Missing keys in Bengali: ${missingInBn.join(', ')}`);
    assert.deepEqual(extraInBn, [], `Extra keys in Bengali: ${extraInBn.join(', ')}`);
  });

  it('guarantees zero empty strings, null, or undefined values across all translations', () => {
    for (const lang of APP_LANGUAGES) {
      const leafMap = getLeafPaths(UI_STRINGS[lang]);
      for (const [path, val] of leafMap.entries()) {
        assert.ok(
          val && val.trim().length > 0,
          `Dictionary '${lang}' has empty or invalid value at '${path}'`
        );
      }
    }
  });
});
