import { STATE_LIFECYCLE_CONFIG } from '../../src/state-lifecycle.mjs';
import { louisianaAlaskaGroceryCohortKey,louisianaAlaskaGroceryRuntimeId } from '../../src/louisiana-alaska-grocery-production-config.mjs';
import { louisianaAlaskaSourceConfigHash } from '../../src/collectors/louisiana-alaska-grocery-production-adapter.mjs';

export function syntheticLaakAdmission(state){
  const manifest={schemaVersion:1,state,lifecycle:{customerLabel:state,publicStatus:'active',coverageTier:'sparse_live_store_inventory',refinementLevel:'store'},
    collector:{sourceIds:[louisianaAlaskaGroceryRuntimeId(state)],cohortSha256:louisianaAlaskaGroceryCohortKey(state)},
    storeIdentity:{mode:'exact_resolver'},sourceSemantics:{availability:'binary only',inventoryAlertable:false,watchAlertable:false},
    customerPaths:{stateFilter:{status:'verified'}},evidence:{}};
  const lifecycle=structuredClone(STATE_LIFECYCLE_CONFIG),url='https://isolated-preview.invalid';
  const artifact='a'.repeat(64),runs=count=>Array.from({length:count},(_,i)=>({runId:`fixture-${state}-${count}-${i}`,status:'success',artifactHash:artifact}));
  const immutable={schemaVersion:1,state,generatedAt:'2026-11-14T12:00:00.000Z',sourceConfigHash:'0'.repeat(64),previewUrl:url,
    shadowRuns:runs(3),canaryRuns:runs(2),provenance:{status:'success',repository:'tarsagent22/Bourbon-Signal',workflowRunId:'100',artifactId:'200',commitSha:'b'.repeat(40),
      artifactDigest:artifact,bundleDigest:artifact,workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/100',artifactName:`state-promotion-provenance-${state}-100`}};
  const promotionEvidence={shadowRuns:3,canaryRuns:2,verifiedAt:'2026-11-14T12:00:00.000Z',verticalSliceManifest:`engine/data/state-integration/${state}.json`,
    fixtureContract:`engine/data/state-fixtures/${state}.json`,canaryPreviewUrl:url,immutableEvidence:immutable};
  immutable.sourceConfigHash=louisianaAlaskaSourceConfigHash(state,manifest);
  manifest.evidence.immutablePromotionEvidence=structuredClone(immutable);
  lifecycle.activeStates=[...new Set([...lifecycle.activeStates,state])];
  lifecycle.states[state]={...lifecycle.states[state],publicStatus:'active',lifecycle:'retailer_store_inventory',promotionStage:'active',
    inventoryAlertable:false,watchAlertable:false,productionAdapter:'louisiana_alaska_grocery_onsite_v1',promotionEvidence};
  return{manifest,lifecycle};
}
