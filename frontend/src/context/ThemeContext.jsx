/**
 * ThemeContext — Dark/Light Mode with Celestial Transition
 * ────────────────────────────────────────────────────────
 * Stores theme preference in localStorage.
 * Sets `data-theme` attribute on <html> for CSS variable switching.
 * Exposes `isTransitioning` for the sunset/moonrise overlay animation.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  isTransitioning: false,
  transitionDirection: "to-dark", // "to-dark" or "to-light"
});

const TRANSITION_DURATION = 1200; // ms — matches CSS animation

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("earthsentry-theme") || "light";
    } catch {
      return "light";
    }
  });

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState("to-dark");
  const timerRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("earthsentry-theme", theme);
    } catch {
      // localStorage not available
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    const direction = next === "dark" ? "to-dark" : "to-light";

    // Start transition animation
    setTransitionDirection(direction);
    setIsTransitioning(true);

    // Switch theme at the midpoint of the animation
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setTheme(next);
    }, TRANSITION_DURATION * 0.45); // Switch slightly before midpoint

    // End transition after full animation
    setTimeout(() => {
      setIsTransitioning(false);
    }, TRANSITION_DURATION);
  }, [theme]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isTransitioning, transitionDirection }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
