import { useEffect, useRef, useState } from "react";
import { Box, Chip, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { tamilSuggestions } from "../services/transliterateService";

// A word ends at a space, a new line or punctuation.
const DELIMITER = "\\s,.;:!?\\-–/()&";
// English-letter words that are finished (a delimiter follows them).
const FINISHED_WORD = new RegExp(`[A-Za-z]+(?=[${DELIMITER}])`, "g");
const ANY_WORD = /[A-Za-z]+/g;

/**
 * A text field that turns English typing into Tamil (tamil = true): every
 * English-letter word becomes Tamil once a space, new line or punctuation
 * follows it (and every word when leaving the field), using Google's
 * dictionary-based Tamil input; the other spellings of the last word are
 * shown as chips to click. Tamil, digits and symbols are never changed. Fast
 * typing is safe: a finished word is replaced as soon as its spelling is
 * known, on the next keystroke or when the answer arrives. "English → Tamil"
 * can be switched off for words that must stay English (brand names).
 *   value / onChange(newValue) — the field's text; other props go to TextField
 */
const TamilTypingField = ({ tamil = false, value = "", onChange, ...props }) => {
  const [on, setOn] = useState(true);
  const [choice, setChoice] = useState(null); // { original, text, options }
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  // English word (lower case) → Tamil spelling chosen for it.
  const known = useRef(new Map());
  const asked = useRef(new Set());
  const active = tamil && on;

  // The latest text (answers arrive later and work on it).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Replace the words whose Tamil spelling is known; `all` also replaces the
  // last word (leaving the field). Returns the text and the caret shift.
  const applyKnown = (text, caret, all = false) => {
    let shift = 0;
    const next = text.replace(all ? ANY_WORD : FINISHED_WORD, (word, offset) => {
      const tamilWord = known.current.get(word.toLowerCase());
      if (!tamilWord || tamilWord === word) return word;
      if (offset < caret) shift += tamilWord.length - word.length;
      return tamilWord;
    });
    return { next, shift };
  };

  const commit = (text, caret = null) => {
    valueRef.current = text;
    onChange(text);
    const el = inputRef.current;
    if (caret !== null && el && document.activeElement === el) requestAnimationFrame(() => el.setSelectionRange(caret, caret));
  };

  // Ask for the Tamil spelling of every English word not asked yet; each
  // answer is applied to the current text as soon as it arrives.
  const lookUp = (text, all = false) => {
    for (const [word] of text.matchAll(all ? ANY_WORD : FINISHED_WORD)) {
      const key = word.toLowerCase();
      if (known.current.has(key) || asked.current.has(key)) continue;
      asked.current.add(key);
      tamilSuggestions(key)
        .then((options) => {
          setError("");
          if (!options.length) return;
          known.current.set(key, options[0]);
          setChoice({ original: word, text: options[0], options });
          const el = inputRef.current;
          const caret = el && document.activeElement === el ? el.selectionStart : null;
          const { next, shift } = applyKnown(valueRef.current, caret ?? Infinity, all);
          if (next !== valueRef.current) commit(next, caret === null ? null : caret + shift);
        })
        .catch((err) => {
          asked.current.delete(key);
          setError(err.response?.data?.message || "Tamil suggestions are not reachable — check the internet connection.");
        });
    }
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    if (!active) return commit(raw);
    const caret = e.target.selectionStart ?? raw.length;
    const { next, shift } = applyKnown(raw, caret);
    commit(next, next === raw ? null : caret + shift);
    lookUp(next);
  };

  // Swap the last converted word for another spelling (or keep the English).
  const pick = (option) => {
    if (!choice) return;
    const current = valueRef.current;
    const at = current.lastIndexOf(choice.text);
    known.current.set(choice.original.toLowerCase(), option);
    if (at >= 0) commit(current.slice(0, at) + option + current.slice(at + choice.text.length));
    setChoice({ ...choice, text: option });
  };

  return (
    <Box>
      <TextField
        {...props}
        value={value}
        inputRef={inputRef}
        onChange={handleChange}
        onBlur={(e) => {
          if (active) {
            // Leaving the field: the last word is finished too.
            const { next } = applyKnown(valueRef.current, Infinity, true);
            if (next !== valueRef.current) commit(next);
            lookUp(next, true);
          }
          props.onBlur?.(e);
        }}
      />
      {tamil && (
        <Box sx={{ mt: 0.5 }}>
          <FormControlLabel
            sx={{ ml: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
            control={<Switch size="small" checked={on} onChange={(e) => setOn(e.target.checked)} />}
            label={on ? "Type in English → Tamil (press space after each word)" : "English → Tamil off (typed as is)"}
          />
          {choice && active && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center", mt: 0.25 }} data-testid="tamil-choices">
              <Typography variant="caption" sx={{ color: "text.secondary", mr: 0.5 }}>
                “{choice.original}”:
              </Typography>
              {[...choice.options, choice.original].map((option) => (
                <Chip
                  key={option}
                  size="small"
                  label={option}
                  variant={option === choice.text ? "filled" : "outlined"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                  sx={{ fontSize: 14 }}
                />
              ))}
            </Box>
          )}
          {error && (
            <Typography variant="caption" sx={{ color: "var(--mui-palette-error-main)", display: "block" }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default TamilTypingField;
