"use client";
import Fraction from "fraction.js";
import { useMultiplier } from "../Provider";
import { useMemo } from "react";
import { useUnits } from "../../Units";
import {
  formatOunces,
  formatParts,
  ouncesToMl,
} from "../../../../util/barUnits";

function getFraction(quantity: string | number | undefined) {
  if (quantity) {
    try {
      return new Fraction(quantity);
    } catch {
      console.error(`Given quantity ${quantity} couldn't be parsed!`);
    }
  }
  return undefined;
}

enum MultiplyableInputTypes {
  DECIMAL,
  FRACTION,
}

/**
 * An amount that scales with the multiplier.
 *
 * `unit="oz"` (27c) is added at render time by `markOunces`, never stored: an
 * amount that carries it renders its unit too, in the reader's unit mode —
 * `1 1/2 oz`, `45 ml`, or `2 parts` (ratios ignore the multiplier, since a
 * ratio does not scale). Without `unit` this renders exactly what it always
 * did.
 */
export function Multiplyable({
  baseNumber,
  unit,
}: {
  baseNumber: string | number;
  unit?: string;
}) {
  const fraction = useMemo(() => getFraction(baseNumber), [baseNumber]);
  const inputType =
    typeof baseNumber === "string" && baseNumber.includes(".")
      ? MultiplyableInputTypes.DECIMAL
      : MultiplyableInputTypes.FRACTION;
  const [{ multiplier }] = useMultiplier();
  const { mode, base } = useUnits();

  if (unit === "oz" && fraction) {
    if (mode === "parts" && base) return <>{formatParts(fraction, base)}</>;
    if (mode === "ml") {
      return (
        <>{ouncesToMl(multiplier ? multiplier.mul(fraction) : fraction)} ml</>
      );
    }
  }

  const displayNumber =
    fraction && multiplier && multiplier.mul(fraction).simplify(0.01);
  const shown = displayNumber
    ? inputType === MultiplyableInputTypes.FRACTION
      ? formatOunces(displayNumber)
      : displayNumber.round(3).toString()
    : baseNumber;

  /* oz mode: today's number, with the unit `markOunces` moved in beside it. */
  return <>{unit === "oz" && fraction ? `${shown} oz` : shown}</>;
}
