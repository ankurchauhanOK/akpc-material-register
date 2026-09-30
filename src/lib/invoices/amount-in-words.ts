// Amount Chargeable in words, for the AKPC tax invoice footer.
//
// Indian numbering (Crore / Lakh / Thousand / Hundred), not the Western
// million/billion scale, and no "and" between the hundreds and the tens —
// matching the printed AKPC invoice, e.g.
//
//   6797.00 -> "Six Thousand Seven Hundred Ninety Seven rupees and zero paisa only."
//
// Pure and side-effect free so the on-screen A4 preview and the downloaded PDF
// can never disagree on the printed line.

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

/** Words for 0-99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/** Words for 0-99,99,99,999 using the Indian scale. */
function rupeesInWords(value: number): string {
  if (value === 0) return "Zero";

  const parts: string[] = [];

  // Crores and lakhs: the two 2-digit groups in the Indian scale.
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const hundred = Math.floor((value % 1000) / 100);
  const rest = value % 100;

  if (crore > 0) parts.push(`${rupeesInWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));

  return parts.join(" ");
}

/**
 * The "Amount Chargeable (in words)" line, e.g.
 * "Six Thousand Seven Hundred Ninety Seven rupees and zero paisa only."
 *
 * Rounded to 2dp because the invoice is a money document; a paisa beyond the
 * second decimal is not representable on the printed form.
 */
export function amountInWords(amount: number): string {
  // Clamp: a negative total would otherwise produce an empty rupees phrase
  // (integer division walks past every threshold), and the printed line has no
  // way to express a credit.
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
  // Round to whole paise first so float drift can't turn 6796.999999 into
  // "... and 100 paisa".
  const paise = Math.round(safe * 100);
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;

  // The paisa phrase is lower-case on the printed form ("... and zero paisa
  // only."), so reuse the digit words and fold the case.
  return `${rupeesInWords(rupees)} rupees and ${twoDigits(remainder).toLowerCase()} paisa only.`;
}
