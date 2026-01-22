/**
 * Simple XML Plist Parser
 *
 * Parses Apple plist XML format from diskutil output.
 */

export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | PlistValue[]
  | { [key: string]: PlistValue };

export interface PlistDict {
  [key: string]: PlistValue;
}

/**
 * Parses Apple plist XML format from diskutil output.
 * Supports dict, array, string, integer, real, boolean, date, and data tags.
 */
export function parsePlist(xml: string): PlistValue {
  const content = xml
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .trim();

  const plistMatch = content.match(/<plist[^>]*>([\s\S]*)<\/plist>/);
  if (!plistMatch) {
    throw new Error("Invalid plist: no <plist> element found");
  }

  const innerContent = plistMatch[1]?.trim() ?? "";
  return parseElement(innerContent);
}

function parseElement(xml: string): PlistValue {
  const trimmed = xml.trim();

  if (trimmed.startsWith("<dict/>") || trimmed.startsWith("<dict />")) {
    return {};
  }

  if (trimmed.startsWith("<dict>")) {
    return parseDict(trimmed);
  }

  if (trimmed.startsWith("<array/>") || trimmed.startsWith("<array />")) {
    return [];
  }

  if (trimmed.startsWith("<array>")) {
    return parseArray(trimmed);
  }

  const stringMatch = trimmed.match(/^<string>([\s\S]*?)<\/string>/);
  if (stringMatch) {
    return decodeXmlEntities(stringMatch[1] ?? "");
  }

  const intMatch = trimmed.match(/^<integer>(-?\d+)<\/integer>/);
  if (intMatch) {
    return Number.parseInt(intMatch[1] ?? "0", 10);
  }

  const realMatch = trimmed.match(/^<real>(-?[\d.]+)<\/real>/);
  if (realMatch) {
    return Number.parseFloat(realMatch[1] ?? "0");
  }

  if (trimmed.startsWith("<true/>") || trimmed.startsWith("<true />")) {
    return true;
  }

  if (trimmed.startsWith("<false/>") || trimmed.startsWith("<false />")) {
    return false;
  }

  const dateMatch = trimmed.match(/^<date>([\s\S]*?)<\/date>/);
  if (dateMatch) {
    return new Date(dateMatch[1] ?? "");
  }

  // Data (base64) - return as string for simplicity
  const dataMatch = trimmed.match(/^<data>([\s\S]*?)<\/data>/);
  if (dataMatch) {
    return dataMatch[1]?.trim() ?? "";
  }

  return "";
}

function extractTagContent(xml: string, tagName: string): string {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  if (!xml.startsWith(openTag)) return "";

  let depth = 1;
  let pos = openTag.length;

  while (pos < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        return xml.slice(openTag.length, nextClose);
      }
      pos = nextClose + closeTag.length;
    }
  }

  return "";
}

function parseDict(xml: string): PlistDict {
  const result: PlistDict = {};
  const content = extractTagContent(xml, "dict");
  if (!content) return result;

  let pos = 0;
  while (pos < content.length) {
    while (pos < content.length && /\s/.test(content[pos] ?? "")) {
      pos++;
    }

    if (pos >= content.length) break;

    if (!content.slice(pos).startsWith("<key>")) {
      pos++;
      continue;
    }

    const keyEnd = content.indexOf("</key>", pos);
    if (keyEnd === -1) break;

    const key = content.slice(pos + 5, keyEnd);
    pos = keyEnd + 6;

    while (pos < content.length && /\s/.test(content[pos] ?? "")) {
      pos++;
    }

    if (pos >= content.length) break;

    const valueStart = pos;
    const valueResult = extractNextValue(content, valueStart);
    if (!valueResult) break;

    result[key] = valueResult.value;
    pos = valueResult.endPos;
  }

  return result;
}

function extractNextValue(
  content: string,
  pos: number,
): { value: PlistValue; endPos: number } | null {
  const remaining = content.slice(pos);

  if (remaining.startsWith("<true/>")) {
    return { value: true, endPos: pos + 7 };
  }
  if (remaining.startsWith("<true />")) {
    return { value: true, endPos: pos + 8 };
  }

  if (remaining.startsWith("<false/>")) {
    return { value: false, endPos: pos + 8 };
  }
  if (remaining.startsWith("<false />")) {
    return { value: false, endPos: pos + 9 };
  }

  const stringMatch = remaining.match(/^<string>([\s\S]*?)<\/string>/);
  if (stringMatch) {
    return {
      value: decodeXmlEntities(stringMatch[1] ?? ""),
      endPos: pos + stringMatch[0].length,
    };
  }

  const intMatch = remaining.match(/^<integer>(-?\d+)<\/integer>/);
  if (intMatch) {
    return {
      value: Number.parseInt(intMatch[1] ?? "0", 10),
      endPos: pos + intMatch[0].length,
    };
  }

  const realMatch = remaining.match(/^<real>(-?[\d.]+)<\/real>/);
  if (realMatch) {
    return {
      value: Number.parseFloat(realMatch[1] ?? "0"),
      endPos: pos + realMatch[0].length,
    };
  }

  const dateMatch = remaining.match(/^<date>([\s\S]*?)<\/date>/);
  if (dateMatch) {
    return {
      value: new Date(dateMatch[1] ?? ""),
      endPos: pos + dateMatch[0].length,
    };
  }

  const dataMatch = remaining.match(/^<data>([\s\S]*?)<\/data>/);
  if (dataMatch) {
    return {
      value: dataMatch[1]?.trim() ?? "",
      endPos: pos + dataMatch[0].length,
    };
  }

  if (remaining.startsWith("<dict/>") || remaining.startsWith("<dict />")) {
    const match = remaining.match(/^<dict\s*\/>/);
    return {
      value: {},
      endPos: pos + (match ? match[0].length : 7),
    };
  }

  if (remaining.startsWith("<dict>")) {
    const endPos = findClosingTag(remaining, "dict");
    const dictXml = remaining.slice(0, endPos);
    return {
      value: parseDict(dictXml),
      endPos: pos + endPos,
    };
  }

  if (remaining.startsWith("<array/>") || remaining.startsWith("<array />")) {
    const match = remaining.match(/^<array\s*\/>/);
    return {
      value: [],
      endPos: pos + (match ? match[0].length : 8),
    };
  }

  if (remaining.startsWith("<array>")) {
    const endPos = findClosingTag(remaining, "array");
    const arrayXml = remaining.slice(0, endPos);
    return {
      value: parseArray(arrayXml),
      endPos: pos + endPos,
    };
  }

  return null;
}

function parseArray(xml: string): PlistValue[] {
  const result: PlistValue[] = [];
  const content = extractTagContent(xml, "array");
  if (!content) return result;

  let pos = 0;
  while (pos < content.length) {
    while (pos < content.length && /\s/.test(content[pos] ?? "")) {
      pos++;
    }

    if (pos >= content.length) break;

    const valueResult = extractNextValue(content, pos);
    if (!valueResult) {
      pos++;
      continue;
    }

    result.push(valueResult.value);
    pos = valueResult.endPos;
  }

  return result;
}

function findClosingTag(xml: string, tagName: string): number {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  let depth = 0;
  let pos = 0;

  while (pos < xml.length) {
    const openIdx = xml.indexOf(openTag, pos);
    const closeIdx = xml.indexOf(closeTag, pos);

    if (closeIdx === -1) break;

    if (openIdx !== -1 && openIdx < closeIdx) {
      depth++;
      pos = openIdx + openTag.length;
    } else {
      if (depth === 1) {
        return closeIdx + closeTag.length;
      }
      depth--;
      pos = closeIdx + closeTag.length;
    }
  }

  return xml.length;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Gets a string value from a PlistDict.
 */
export function getPlistString(dict: PlistDict, key: string): string | undefined {
  const value = dict[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Gets a number value from a PlistDict.
 */
export function getPlistNumber(dict: PlistDict, key: string): number | undefined {
  const value = dict[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Gets a boolean value from a PlistDict.
 */
export function getPlistBoolean(dict: PlistDict, key: string): boolean | undefined {
  const value = dict[key];
  return typeof value === "boolean" ? value : undefined;
}
