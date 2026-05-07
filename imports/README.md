# imports/

Place raw data files here for one-off import scripts.

## Nathaniel Program Import

Place the xlsx file at:

```
imports/Nathaniel Stahmer Program #3(1).xlsx
```

Then run:

```
npm run import:nathaniel
```

This will parse the xlsx, convert it to the standard CSV format (see `src/lib/importers/importerTypes.ts`), and output a JSON patch ready to merge into the local IndexedDB database.

## Standard CSV format

See `src/lib/importers/importerTypes.ts` for the column schema expected by the generic CSV importer.

Files placed here are gitignored by default to avoid committing personal training data.
