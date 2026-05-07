/**
 * Importer for "Nathaniel Stahmer Program #3(1).xlsx".
 *
 * Place the file at: imports/Nathaniel Stahmer Program #3(1).xlsx
 * Run: npm run import:nathaniel
 *
 * TODO: Implement xlsx parsing once the file is available.
 *   1. Use a library like 'xlsx' (SheetJS) to read the workbook.
 *   2. Map each row to ImportRow using the column layout from the spreadsheet.
 *   3. Write the parsed ImportResult to stdout as JSON.
 *   4. The caller (or a separate merge script) will read the JSON and upsert
 *      sessions into the IndexedDB database via loadDatabase() + saveDatabase().
 *
 * Expected spreadsheet structure (to be confirmed when file is available):
 *   Row 1: headers (Date, Exercise, Set, Reps, Weight, Unit, RPE, Notes, ...)
 *   Row 2+: data
 */

import type { ImportResult } from "./importerTypes";

export async function importNathanielProgram(filePath: string): Promise<ImportResult> {
  // Placeholder — implement when the file is available.
  void filePath;
  return {
    rows: [],
    warnings: [`File not yet parsed. Add xlsx parsing logic to ${import.meta.url}`],
    sourceName: filePath,
  };
}
