(function attachStepAsrPostprocess(globalScope) {
  "use strict";

  const DEFAULT_POSTPROCESS_OPTIONS = Object.freeze({
    segment: true,
    normalizePunctuation: true,
    removeFillers: false
  });

  const TRANSCRIPT_FILLER_TERMS = Object.freeze([
    "呃",
    "嗯",
    "额",
    "啊",
    "诶",
    "哎",
    "唉",
    "那个",
    "就是说",
    "然后呢",
    "然后就是",
    "怎么说呢",
    "你知道吧",
    "对吧",
    "是吧"
  ]);

  const FILLER_BOUNDARY_CLASS = "\\s,，.。!！?？;；:：、\"'“”‘’()（）\\[\\]【】《》<>";
  const INTERJECTION_PATTERN = "呃|嗯|额|啊|诶|哎|唉";
  const SENTENCE_END_RE = /[。！？；!?;]/;
  const STRONG_SENTENCE_END_RE = /[。！？!?]$/;
  const SOFT_PAUSE_RE = /[，,、：:]/;
  const CLOSING_QUOTE_RE = /[”’」』）】〕》〉]/;
  const MIN_PARAGRAPH_CHARS = 72;
  const TARGET_PARAGRAPH_CHARS = 132;
  const MAX_PARAGRAPH_CHARS = 212;
  const MAX_UNIT_CHARS = 260;
  const MIN_SOFT_UNIT_CHARS = 78;

  function processTranscriptText(text, options = {}) {
    const config = normalizePostprocessOptions(options);
    let output = String(text || "");
    if (!output) return "";

    if (config.normalizePunctuation) output = normalizeTranscriptPunctuation(output);
    if (config.removeFillers) output = removeTranscriptFillers(output);
    if (config.normalizePunctuation) {
      output = normalizeTranscriptPunctuation(output);
    } else {
      output = cleanupLineWhitespace(output);
    }
    if (config.segment) output = segmentTranscriptText(output);

    return output.trim();
  }

  function normalizePostprocessOptions(options = {}) {
    return {
      segment: typeof options.segment === "boolean" ? options.segment : DEFAULT_POSTPROCESS_OPTIONS.segment,
      normalizePunctuation: typeof options.normalizePunctuation === "boolean"
        ? options.normalizePunctuation
        : DEFAULT_POSTPROCESS_OPTIONS.normalizePunctuation,
      removeFillers: typeof options.removeFillers === "boolean"
        ? options.removeFillers
        : DEFAULT_POSTPROCESS_OPTIONS.removeFillers
    };
  }

  function normalizeTranscriptPunctuation(text) {
    let output = normalizeLineBreaks(text);
    output = output.replace(/[ \t\f\v]+/g, " ");
    output = output.replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2");
    output = output.replace(/\.{3,}/g, "……");
    output = output.replace(/…{3,}/g, "……");
    output = output.replace(/[?!]{2,}/g, match => (match.includes("?") ? "？" : "！"));
    output = output.replace(/\?/g, "？");
    output = output.replace(/!/g, "！");
    output = output.replace(/,/g, "，");
    output = output.replace(/;/g, "；");
    output = output.replace(/:/g, "：");
    output = replaceAsciiPeriods(output);
    output = output.replace(/[ \t]*([，。！？；：、])[ \t]*/g, "$1");
    output = output.replace(/[，。！？；：、]{2,}/g, collapsePunctuationRun);
    output = output.replace(/[ \t]*\n[ \t]*/g, "\n");
    output = output.replace(/\n{3,}/g, "\n\n");
    return output.trim();
  }

  function replaceAsciiPeriods(text) {
    return String(text || "").replace(/\./g, (match, offset, source) => {
      const before = source[offset - 1] || "";
      const after = source[offset + 1] || "";
      if (isAsciiDigit(before) && isAsciiDigit(after)) return match;
      return "。";
    });
  }

  function collapsePunctuationRun(run) {
    if (run.includes("！") && run.includes("？")) return "！？";
    if (run.includes("？")) return "？";
    if (run.includes("！")) return "！";
    if (run.includes("。")) return "。";
    if (run.includes("；")) return "；";
    if (run.includes("：")) return "：";
    if (run.includes("，")) return "，";
    return run[0] || "";
  }

  function removeTranscriptFillers(text, fillerTerms = TRANSCRIPT_FILLER_TERMS) {
    let output = normalizeLineBreaks(text);
    const interjectionRe = new RegExp(`(^|[${FILLER_BOUNDARY_CLASS}])(?:${INTERJECTION_PATTERN}){1,4}(?=$|[${FILLER_BOUNDARY_CLASS}])`, "g");
    output = output.replace(interjectionRe, "$1");

    for (const term of fillerTerms) {
      if (new RegExp(`^(?:${INTERJECTION_PATTERN})$`).test(term)) continue;
      output = removeBoundaryFiller(output, term);
    }

    output = output.replace(/[，、]{2,}/g, "，");
    output = output.replace(/([。！？；：])([，、])/g, "$1");
    output = output.replace(/([，、])([。！？；：])/g, "$2");
    output = output.replace(/^[\s，、]+/g, "");
    output = output.replace(/[\s，、]+$/g, "");
    return cleanupLineWhitespace(output);
  }

  function removeBoundaryFiller(text, term) {
    const fillerRe = new RegExp(`(^|[${FILLER_BOUNDARY_CLASS}])${escapeRegExp(term)}(?=$|[${FILLER_BOUNDARY_CLASS}])`, "g");
    return String(text || "").replace(fillerRe, "$1");
  }

  function segmentTranscriptText(text) {
    const source = cleanupLineWhitespace(text).trim();
    if (!source) return "";

    const units = splitTranscriptUnits(source);
    if (units.length <= 1) return source;

    const paragraphs = [];
    let current = [];
    let currentLength = 0;

    for (const unit of units) {
      const unitLength = countReadableChars(unit);
      const projectedLength = currentLength + unitLength;
      if (shouldStartNewParagraph(current, currentLength, projectedLength)) {
        paragraphs.push(joinTranscriptUnits(current));
        current = [];
        currentLength = 0;
      }

      current.push(unit);
      currentLength += unitLength;

      if (currentLength >= MAX_PARAGRAPH_CHARS && hasStrongEnding(unit)) {
        paragraphs.push(joinTranscriptUnits(current));
        current = [];
        currentLength = 0;
      }
    }

    if (current.length) paragraphs.push(joinTranscriptUnits(current));
    return paragraphs.filter(Boolean).join("\n\n");
  }

  function shouldStartNewParagraph(current, currentLength, projectedLength) {
    if (!current.length) return false;
    const previousUnit = current[current.length - 1];
    const hasNaturalStop = hasStrongEnding(previousUnit) || current.length >= 4;
    if (currentLength >= MAX_PARAGRAPH_CHARS) return true;
    if (currentLength >= TARGET_PARAGRAPH_CHARS && hasNaturalStop) return true;
    if (currentLength >= MIN_PARAGRAPH_CHARS && current.length >= 4 && hasNaturalStop) return true;
    return projectedLength > MAX_PARAGRAPH_CHARS && currentLength >= MIN_PARAGRAPH_CHARS;
  }

  function splitTranscriptUnits(text) {
    const primaryUnits = [];
    let buffer = "";
    const source = String(text || "");

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === "\n") {
        pushUnit(primaryUnits, buffer);
        buffer = "";
        continue;
      }

      buffer += char;
      if (!SENTENCE_END_RE.test(char) && char !== "…") continue;

      while (index + 1 < source.length && CLOSING_QUOTE_RE.test(source[index + 1])) {
        index += 1;
        buffer += source[index];
      }
      pushUnit(primaryUnits, buffer);
      buffer = "";
    }

    pushUnit(primaryUnits, buffer);
    return primaryUnits.flatMap(splitLongUnitByPause);
  }

  function splitLongUnitByPause(unit) {
    if (countReadableChars(unit) <= MAX_UNIT_CHARS) return [unit];

    const parts = [];
    let buffer = "";
    for (const char of unit) {
      buffer += char;
      if (SOFT_PAUSE_RE.test(char) && countReadableChars(buffer) >= MIN_SOFT_UNIT_CHARS) {
        pushUnit(parts, buffer);
        buffer = "";
      }
    }
    pushUnit(parts, buffer);

    if (parts.length <= 1) return [unit];
    const last = parts[parts.length - 1];
    if (countReadableChars(last) < 36 && parts.length > 1) {
      parts[parts.length - 2] = joinTranscriptUnits([parts[parts.length - 2], last]);
      parts.pop();
    }
    return parts;
  }

  function pushUnit(units, value) {
    const unit = cleanupInlineWhitespace(value).trim();
    if (unit) units.push(unit);
  }

  function joinTranscriptUnits(units) {
    return units.reduce((joined, unit) => {
      if (!joined) return unit;
      return `${joined}${needsSpaceBetween(joined, unit) ? " " : ""}${unit}`;
    }, "").trim();
  }

  function needsSpaceBetween(left, right) {
    const previous = String(left || "").trim().slice(-1);
    const next = String(right || "").trim().charAt(0);
    return /[A-Za-z0-9)]/.test(previous) && /[A-Za-z0-9(]/.test(next);
  }

  function hasStrongEnding(value) {
    return STRONG_SENTENCE_END_RE.test(String(value || "").trim().replace(CLOSING_QUOTE_RE, ""));
  }

  function cleanupLineWhitespace(text) {
    return normalizeLineBreaks(text)
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanupInlineWhitespace(text) {
    return String(text || "").replace(/[ \t\f\v]+/g, " ");
  }

  function normalizeLineBreaks(text) {
    return String(text || "").replace(/\r\n?/g, "\n");
  }

  function countReadableChars(value) {
    return String(value || "").replace(/\s+/g, "").length;
  }

  function isAsciiDigit(value) {
    return value >= "0" && value <= "9";
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const api = {
    DEFAULT_POSTPROCESS_OPTIONS,
    TRANSCRIPT_FILLER_TERMS,
    processTranscriptText,
    normalizePostprocessOptions,
    normalizeTranscriptPunctuation,
    removeTranscriptFillers,
    segmentTranscriptText,
    splitTranscriptUnits
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  globalScope.StepAsrPostprocess = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
