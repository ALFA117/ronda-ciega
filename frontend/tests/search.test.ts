import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matches } from "../lib/search.ts";

describe("Buscador de la paleta de comandos", () => {
  test("la consulta vacía deja pasar todo", () => {
    assert.equal(matches("cualquier cosa", ""), true);
  });

  test("coincidencia por subsecuencia, no por substring", () => {
    assert.equal(matches("Por qué no es un commit-reveal", "cmrv"), true);
    assert.equal(matches("commit-reveal", "cr"), true);
    assert.equal(matches("commit-reveal", "rc"), false, "el orden importa");
  });

  test("ignora mayúsculas y acentos tal como se escriben", () => {
    assert.equal(matches("La Solución", "sol"), true);
    assert.equal(matches("LA SOLUCIÓN", "solu"), true);
    assert.equal(matches("La solución", "SOL"), true);
  });

  test("no inventa coincidencias", () => {
    assert.equal(matches("El problema", "zzzz"), false);
    assert.equal(matches("", "a"), false);
  });

  test("la consulta completa igual al texto coincide", () => {
    assert.equal(matches("Rondas", "rondas"), true);
    assert.equal(matches("Rondas", "rondass"), false, "sobra una letra");
  });

  test("una letra repetida exige dos apariciones", () => {
    assert.equal(matches("aba", "aa"), true);
    assert.equal(matches("ab", "aa"), false);
  });

  test("caracteres fuera del BMP no rompen el recorrido", () => {
    // Iterating by code point rather than code unit is what makes this safe.
    assert.equal(matches("ronda 🎲 ciega", "rc"), true);
    assert.doesNotThrow(() => matches("🎲🎲🎲", "🎲"));
  });
});
