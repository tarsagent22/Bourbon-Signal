import { writeSourceUsefulnessArtifacts } from './optimization/source-usefulness-report.mjs';

writeSourceUsefulnessArtifacts()
  .then((report) => {
    console.log(`Source usefulness report: ${report.summary.laneCount} lanes, ${report.summary.freshExactStoreAlertLaneCount} with fresh exact-store alert value.`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
