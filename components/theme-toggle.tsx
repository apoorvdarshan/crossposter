"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";

const themeStorageKey = "personal-crossposter:theme";
const modes: Array<{
  id: ThemeMode;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon }
];

function applyTheme(mode: ThemeMode) {
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }

  document.documentElement.dataset.theme = mode;
}

function readSavedTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(themeStorageKey);

    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const saved = readSavedTheme();

    setMode(saved);
    applyTheme(saved);
  }, []);

  function chooseTheme(nextMode: ThemeMode) {
    setMode(nextMode);
    applyTheme(nextMode);

    try {
      window.localStorage.setItem(themeStorageKey, nextMode);
    } catch {}
  }

  return (
    <div className="theme-toggle" aria-label="Theme mode">
      {modes.map((item) => {
        const Icon = item.icon;
        const selected = mode === item.id;

        return (
          <button
            aria-pressed={selected}
            key={item.id}
            onClick={() => chooseTheme(item.id)}
            title={`${item.label} theme`}
            type="button"
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
