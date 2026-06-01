# Local RAPTOR Snapshot

`cartago-local.bin.gz` and `cartago-local.meta.json` are generated runtime assets for the local Wave 2 RAPTOR experiment.

Refresh them with:

```sh
npm run snapshot:dev -- --scope=cartago --out=local-snapshots
npm run snapshot:bundle
```
