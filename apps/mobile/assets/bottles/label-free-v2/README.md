# Label-free artwork batch 2

Ten original ImageGen illustrations cover 59 reviewed catalog entries across Buffalo Trace, 1792, Elijah Craig, Knob Creek, Woodford Reserve, Maker's Mark and Four Roses. Together with batch 1, the registry contains 15 shapes for 75 entries. Maker's Mark 46, Woodford Double Oaked and both Four Roses forms have separate assets.

Labels, logos, lettering and branded embossing are absent. Product names remain in the app UI. Shape reuse uses the exact reviewed IDs and names in `catalog.json`; special editions, other sizes and unreviewed forms retain the existing fallback. This does not establish legal clearance.

`provenance.json` records generation prompts, reference hashes, master hashes and export hashes. Four Roses Small Batch received one targeted ImageGen refinement to remove artificial horizontal marks. The original and corrected masters remain in the owner's workspace.

## Repeatable preparation

After generating and visually approving only the new shapes, run from `apps/mobile`:

```sh
python scripts/prepare-label-free-art.py --jobs JOBS.json --masters MASTER_DIRECTORY --batch 2
```

The JSON job manifest supplies method, style reference, and a jobs array with shape, prompt and reference fields; an optional masterFile selects a refined master. Pillow is required. This script validates exact catalog mappings, checks transparent RGBA inputs, downsamples proportionally to at most 540 x 810, records provenance and rebuilds static Metro asset registrations. Unchanged master and export hashes reuse existing files. It performs no generation or creative image edits.

The ten shipped exports total 2,446,151 bytes. Grid and cabinet artwork stays static; expanded shelf detail uses the existing gentle native animation with Reduce Motion and background pause. Automated mobile checks and a browser fixture validate code and assets; physical iPhone acceptance is separate.
