import { expect, test } from "vitest";
import { isVim, loadSettings, setVim } from "./settings";

test('the vim toggle holds across settings saves until settings.json changes "vim"', () => {
  localStorage.clear();
  loadSettings('{"vim": true}');
  setVim(false);
  loadSettings('{"vim": true, "fontSize": 15}'); // an unrelated save keeps the toggle
  expect(isVim()).toBe(false);
  loadSettings('{"vim": false}'); // settings.json changed "vim": the toggle is dropped
  expect(isVim()).toBe(false);
  loadSettings('{"vim": true}');
  expect(isVim()).toBe(true); // the setting takes effect again instead of the old toggle
});

test('"ligatures" sets --editor-ligatures', () => {
  const ligatures = () => document.documentElement.style.getPropertyValue("--editor-ligatures");
  loadSettings('{"ligatures": false}');
  expect(ligatures()).toBe("none");
  loadSettings('{"ligatures": true}');
  expect(ligatures()).toBe("normal");
  loadSettings("");
  expect(ligatures()).toBe("normal");
});
