import { useEffect, useState } from "react";

export function MetricNumberInput({
  id,
  ariaLabel,
  value,
  placeholder,
  integer = false,
  onCommit,
}: {
  id: string;
  ariaLabel: string;
  value: number | undefined;
  placeholder?: string;
  integer?: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));

  useEffect(() => {
    setText(value === undefined ? "" : String(value));
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      onCommit(undefined);
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
      setText(value === undefined ? "" : String(value));
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
