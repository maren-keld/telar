import {
  registerHandouts,
  registerModuleDefs,
  registerPsychometrics,
  registerRenderer,
} from '../../js/pack-registry.js';
import { renderEscalaAnimo } from '../../js/modules/escala-animo.js';
import { renderTccAbc } from '../../js/modules/tcc-abc.js';
import { DEMO_HANDOUTS, DEMO_MODULE_DEFS, DEMO_PSYCHOMETRICS } from './content.js';

export async function registerPack({ packId }) {
  registerModuleDefs(DEMO_MODULE_DEFS, { packId });
  registerHandouts(DEMO_HANDOUTS, { packId });
  registerPsychometrics(DEMO_PSYCHOMETRICS, { packId });
  registerRenderer('escala_animo', renderEscalaAnimo, { packId });
  registerRenderer('tcc_abc', renderTccAbc, { packId });
}
