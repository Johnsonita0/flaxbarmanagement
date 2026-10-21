import { Delete, X } from "lucide-react";
import { useState } from "react";

type Operation = "+" | "-" | "×" | "÷";

function calculate(left: number, right: number, operation: Operation): number {
  switch (operation) {
    case "+": return left + right;
    case "-": return left - right;
    case "×": return left * right;
    case "÷": return right === 0 ? Number.NaN : left / right;
  }
}

export default function QuickCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [startNewNumber, setStartNewNumber] = useState(false);

  function enterDigit(digit: string) {
    if (startNewNumber || display === "Error") {
      setDisplay(digit === "." ? "0." : digit);
      setStartNewNumber(false);
      return;
    }
    if (digit === "." && display.includes(".")) return;
    if (display === "0" && digit !== ".") {
      setDisplay(digit);
      return;
    }
    if (display.length < 14) setDisplay(`${display}${digit}`);
  }

  function enterOperation(nextOperation: Operation) {
    const current = Number(display);
    if (!Number.isFinite(current)) {
      clear();
      return;
    }
    if (operation && storedValue !== null && !startNewNumber) {
      const result = calculate(storedValue, current, operation);
      if (!Number.isFinite(result)) {
        setDisplay("Error");
        setStoredValue(null);
        setOperation(null);
        setStartNewNumber(true);
        return;
      }
      setDisplay(String(Number(result.toPrecision(12))));
      setStoredValue(result);
    } else {
      setStoredValue(current);
    }
    setOperation(nextOperation);
    setStartNewNumber(true);
  }

  function showResult() {
    if (operation === null || storedValue === null) return;
    const result = calculate(storedValue, Number(display), operation);
    setDisplay(Number.isFinite(result) ? String(Number(result.toPrecision(12))) : "Error");
    setStoredValue(null);
    setOperation(null);
    setStartNewNumber(true);
  }

  function clear() {
    setDisplay("0");
    setStoredValue(null);
    setOperation(null);
    setStartNewNumber(false);
  }

  function backspace() {
    if (startNewNumber || display === "Error") {
      setDisplay("0");
      setStartNewNumber(false);
      return;
    }
    setDisplay((current) => current.length > 1 ? current.slice(0, -1) : "0");
  }

  function applyPercent() {
    const result = Number(display) / 100;
    setDisplay(Number.isFinite(result) ? String(Number(result.toPrecision(12))) : "Error");
    setStartNewNumber(true);
  }

  return (
    <aside className="quick-calculator" aria-label="Quick calculator">
      <header className="quick-calculator__header">
        <div><span>QUICK TOOL</span><h3>Calculator</h3></div>
        <button className="preview-modal__close" type="button" onClick={onClose} aria-label="Close calculator"><X size={17} /></button>
      </header>
      <output className="quick-calculator__display" aria-live="polite" aria-label="Calculator display">{display}</output>
      <div className="quick-calculator__keys">
        <button type="button" onClick={clear}>AC</button>
        <button type="button" onClick={backspace} aria-label="Backspace"><Delete size={15} /></button>
        <button type="button" onClick={applyPercent}>%</button>
        <button className="quick-calculator__operator" type="button" onClick={() => enterOperation("÷")}>÷</button>
        {["7", "8", "9"].map((digit) => <button type="button" key={digit} onClick={() => enterDigit(digit)}>{digit}</button>)}
        <button className="quick-calculator__operator" type="button" onClick={() => enterOperation("×")}>×</button>
        {["4", "5", "6"].map((digit) => <button type="button" key={digit} onClick={() => enterDigit(digit)}>{digit}</button>)}
        <button className="quick-calculator__operator" type="button" onClick={() => enterOperation("-")}>−</button>
        {["1", "2", "3"].map((digit) => <button type="button" key={digit} onClick={() => enterDigit(digit)}>{digit}</button>)}
        <button className="quick-calculator__operator" type="button" onClick={() => enterOperation("+")}>+</button>
        <button className="quick-calculator__zero" type="button" onClick={() => enterDigit("0")}>0</button>
        <button type="button" onClick={() => enterDigit(".")}>.</button>
        <button className="quick-calculator__equals" type="button" onClick={showResult}>=</button>
      </div>
      <p className="quick-calculator__note">For quick calculations only. Results are not entered into the form.</p>
    </aside>
  );
}
